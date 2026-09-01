from __future__ import annotations
from pathlib import Path
import numpy as np
import polars as pl
from scipy.spatial.distance import cdist

from synapse_core.models.analysis_result import AnalysisResult, ResultMetadata
from synapse_core.pipeline.execution_context import ExecutionContext
from synapse_core.pipeline.base_module import AnalysisModule
from synapse_core.utils.io import save_analysis_result

from synapse_matching.algorithms.greedy_nearest_neighbor import GreedyNearestNeighborMatching, NearestNeighborConfig
from synapse_matching.algorithms.optimal_assignment import OptimalAssignmentConfig, OptimalAssignmentMatching
from synapse_matching.algorithms.optimal_transport_assignment import OptimalTransportAssignment, OptimalTransportConfig
from synapse_matching.capability.registry import check_config_capabilities
from synapse_matching.config.matching_module_config import MatchingModuleConfig
from synapse_matching.constraints.exact_matching import ExactMatchingConstraint
from synapse_matching.diagnostics.overlap import OverlapDiagnostic
from synapse_matching.diagnostics.pair_diagnostics import PairDiagnostics
from synapse_matching.diagnostics.population_diagnostics import PopulationDiagnostics
from synapse_matching.distance.candidate_prefilter import CandidatePreFilterConfig, KNearestNeighborCandidatePreFilter
from synapse_matching.distance.gower import GowerDistance
from synapse_matching.distance.mahalanobis import MahalanobisDistance
from synapse_matching.distance.weighted_mixed_distance import WeightedMixedDistance
from synapse_matching.exceptions import MatchingError
from synapse_matching.population.direction import resolve_direction
from synapse_matching.preprocessing.covariate_availability import CovariateAvailabilityFilter
from synapse_matching.preprocessing.trimming import SymmetricOverlapTrimming
from synapse_matching.representation.propensity_score import PropensityScoreRepresentation
from synapse_matching.services.balance_diagnostics_service import BalanceDiagnosticsService

__all__ = ["MatchingModule"]

_STRATEGY_REGISTRY = {
    "greedy_nn": GreedyNearestNeighborMatching,
    "optimal_hungarian": OptimalAssignmentMatching,
    "optimal_transport_sinkhorn": OptimalTransportAssignment,
}

_DISTANCE_REGISTRY = {
    "mahalanobis": MahalanobisDistance,
    "gower": GowerDistance,
    "weighted_hybrid": WeightedMixedDistance,
}


class MatchingModule(AnalysisModule[MatchingModuleConfig]):
    def __init__(self, module_version: str | None = None) -> None:
        super().__init__(module_name="matching", module_version=module_version)
        self._result: AnalysisResult | None = None

    def _build_strategy_config(self, cfg: MatchingModuleConfig):
        if cfg.strategy.matching_algorithm == "greedy_nn":
            return NearestNeighborConfig(
                caliper=cfg.strategy.caliper_value,
                replacement=cfg.strategy.allow_replacement,
                ratio_k=cfg.strategy.matching_ratio_k,
            )
        if cfg.strategy.matching_algorithm == "optimal_transport_sinkhorn":
            return OptimalTransportConfig(target_size=cfg.strategy.optimal_transport_target_size)
        return OptimalAssignmentConfig(caliper=cfg.strategy.caliper_value)

    def fit(self, dataset, data_config, module_config, context=None) -> "MatchingModule":
        check_config_capabilities(module_config)
        self._bind(dataset, data_config, module_config, context)
        return self

    def run(self) -> AnalysisResult:
        self._check_is_fitted()
        cfg = self._module_config
        df = self._dataset
        result = AnalysisResult(metadata=ResultMetadata(module_name=self.module_name, module_version=self.module_version))

        try:
            availability = CovariateAvailabilityFilter().compute(
                df, cfg.covariates.matching_covariates, cfg.population.treatment_col, cfg.covariates.covariate_missing_threshold
            )
            result.add_table("covariate_availability_report", pl.DataFrame([
                {"variable": v, "missing_pct": availability.missing_pct_by_covariate[v], "usable": v in availability.usable_covariates}
                for v in cfg.covariates.matching_covariates
            ]))
            usable_covariates = availability.usable_covariates
            if not usable_covariates:
                raise MatchingError("No usable matching covariates after missing-data filtering.")

            direction = "treated_to_control" if cfg.population.matching_direction == "treated_to_control" else "control_to_treated"
            constraint = ExactMatchingConstraint(cfg.constraints.exact_match_covariates if cfg.constraints.stratified_matching or cfg.constraints.exact_match_covariates else [])
            constraint_result = constraint.apply(df, cfg.population.treatment_col)
            result.config.setdefault("strata", constraint_result.metadata)

            all_query_idx_global: list[int] = []
            all_pool_idx_global: list[int] = []
            all_distances: list[float] = []
            all_pair_ids: list[int] = []
            all_weights: list[float] = []
            n_query_total = 0
            pair_id_offset = 0

            matched_frames = []
            ps_model_artifact = None

            for stratum_key, stratum_df in constraint_result.strata.items():
                query_df, pool_df = resolve_direction(stratum_df, cfg.population.treatment_col, direction)
                n_query_total += query_df.height
                if query_df.height == 0 or pool_df.height == 0:
                    continue

                working_query, working_pool = query_df, pool_df

                if cfg.representation.use_propensity_score:
                    treatment_full = stratum_df[cfg.population.treatment_col].to_numpy()
                    X_full = stratum_df.select(usable_covariates).to_numpy()
                    rep_output = PropensityScoreRepresentation().fit_transform(
                        X_full, treatment_full, cfg.representation.ps_config
                    )
                    stratum_df = stratum_df.with_columns([
                        pl.Series("__ps__", rep_output.representation),
                        pl.Series("__logit_ps__", rep_output.representation_logit),
                    ])
                    ps_model_artifact = rep_output.model
                    working_query, working_pool = resolve_direction(stratum_df, cfg.population.treatment_col, direction)

                    if cfg.diagnostics.run_overlap_diagnostics:
                        overlap = OverlapDiagnostic().compute(
                            stratum_df.filter(pl.col(cfg.population.treatment_col) == 1)["__ps__"].to_numpy(),
                            stratum_df.filter(pl.col(cfg.population.treatment_col) == 0)["__ps__"].to_numpy(),
                        )
                        result.add_metric(f"common_support_min__{stratum_key}", overlap.common_support_min)
                        result.add_metric(f"common_support_max__{stratum_key}", overlap.common_support_max)

                    if cfg.preprocessing.apply_trimming and cfg.preprocessing.trimming_strategy == "symmetric_quantile":
                        working_all, trim_record = SymmetricOverlapTrimming().apply(
                            stratum_df, "__ps__", cfg.population.treatment_col, cfg.preprocessing.trim_quantile
                        )
                        result.config.setdefault("trimming", {}).setdefault(stratum_key, trim_record.model_dump())
                        working_query, working_pool = resolve_direction(working_all, cfg.population.treatment_col, direction)

                feature_columns = usable_covariates if cfg.representation.matching_space == "covariates_only" else (
                    ["__ps__"] if cfg.representation.matching_space == "ps_only" else (
                        ["__logit_ps__"] if cfg.representation.matching_space == "logit_ps_only" else usable_covariates + ["__logit_ps__"]
                    )
                )

                query_X = working_query.select(feature_columns).to_numpy()
                pool_X = working_pool.select(feature_columns).to_numpy()

                # 1. Calcolo matrice distanze (se metrica non euclidea)
                distance_matrix = None
                if cfg.distance.distance_metric != "euclidean":
                    categorical_covariates = set(self._data_config.categorical_columns()) & set(feature_columns)
                    column_types = {
                        c: ("categorical" if c in categorical_covariates else "numerical") for c in feature_columns
                    }

                    if cfg.distance.distance_metric == "weighted_hybrid":
                        distance_matrix = WeightedMixedDistance(
                            weight_numerical=cfg.distance.weight_numerical,
                            weight_categorical=cfg.distance.weight_categorical,
                        ).compute(query_X, pool_X, feature_columns, column_types)
                    else:
                        distance_cls = _DISTANCE_REGISTRY[cfg.distance.distance_metric]
                        distance_matrix = distance_cls().compute(query_X, pool_X, feature_columns, column_types)

                # 2. Applicazione Pre-Filtro opzionale
                if cfg.strategy.apply_candidate_prefilter:
                    prefilter_config = CandidatePreFilterConfig(
                        k_neighbors=cfg.strategy.prefilter_k_neighbors,
                        min_candidates=cfg.strategy.prefilter_min_candidates or cfg.strategy.optimal_transport_target_size,
                    )
                    prefilter_cost = (
                        distance_matrix
                        if cfg.distance.distance_metric != "euclidean"
                        else cdist(query_X, pool_X, metric="euclidean")
                    )
                    candidate_indices = KNearestNeighborCandidatePreFilter().apply(prefilter_cost, prefilter_config)
                    pool_X = pool_X[candidate_indices]
                    working_pool = working_pool[candidate_indices.tolist()]
                    if cfg.distance.distance_metric != "euclidean":
                        distance_matrix = distance_matrix[:, candidate_indices]

                # 3. Esecuzione algoritmo di matching
                algorithm_cls = _STRATEGY_REGISTRY[cfg.strategy.matching_algorithm]
                algorithm = algorithm_cls()
                strategy_config = self._build_strategy_config(cfg)

                if cfg.distance.distance_metric == "euclidean":
                    algorithm.fit(query_X, pool_X, strategy_config)
                else:
                    algorithm.fit_with_distance_matrix(distance_matrix, strategy_config)

                match_output = algorithm.match()

                is_population_selection = match_output.strategy_metadata.get("output_type") == "population_selection"

                if is_population_selection:
                    # OT selects a subset of the pool; there is no 1:1
                    # pairing with the query population (see Opt. A
                    # decision). pair_id is not meaningful here: the
                    # selected pool units get a distinct, non-paired
                    # group marker instead of a fabricated pair_id.
                    selected_pool = working_pool[match_output.matched_indices["pool"].tolist()]
                    selected_pool = selected_pool.with_columns(
                        pl.lit(None, dtype=pl.Int64).alias("pair_id"),
                        pl.lit("selected").alias("__role__"),
                    )
                    matched_frames.append(selected_pool)
                    all_distances.extend(match_output.distances.tolist())
                elif match_output.pair_id.size > 0:
                    matched_query = working_query[match_output.matched_indices["query"].tolist()]
                    matched_pool = working_pool[match_output.matched_indices["pool"].tolist()]
                    shifted_pair_id = match_output.pair_id + pair_id_offset
                    matched_query = matched_query.with_columns(pl.Series("pair_id", shifted_pair_id), pl.lit(direction.split("_to_")[0]).alias("__role__"))
                    matched_pool = matched_pool.with_columns(pl.Series("pair_id", shifted_pair_id), pl.lit(direction.split("_to_")[1]).alias("__role__"))
                    matched_frames.extend([matched_query, matched_pool])
                    pair_id_offset = int(shifted_pair_id.max()) + 1
                    all_distances.extend(match_output.distances.tolist())

                all_pool_idx_global.extend(match_output.matched_indices["pool"].tolist())

            if not matched_frames:
                raise MatchingError("No pairs were matched across any stratum.")

            matched_dataset = pl.concat(matched_frames, how="diagonal")
            result.add_dataset("matched_dataset", matched_dataset)
            if ps_model_artifact is not None:
                result.add_artifact("propensity_score_model", ps_model_artifact)

            n_query_matched = matched_dataset.filter(pl.col("__role__") == direction.split("_to_")[0]).height
            pop_diag = PopulationDiagnostics().compute(n_query_total, df.height - n_query_total, n_query_matched)
            result.add_metric("match_rate", pop_diag.match_rate)
            result.add_metric("n_query_matched", pop_diag.n_query_matched)
            result.add_metric("n_query_unmatched", pop_diag.n_query_unmatched)

            n_selected = matched_dataset.filter(pl.col("__role__") == "selected").height
            if n_selected > 0:
                result.add_metric("n_pool_units_selected", n_selected)

            if cfg.diagnostics.run_pair_diagnostics:
                pair_diag = PairDiagnostics().compute(np.array(all_distances), np.array(all_pool_idx_global))
                for key, value in pair_diag.model_dump().items():
                    result.add_metric(f"pair_{key}", value)

            if cfg.diagnostics.run_balance_diagnostics:
                balance_table = BalanceDiagnosticsService().compute(
                    df, matched_dataset, cfg.population.treatment_col,
                    usable_covariates, cfg.covariates.evaluation_covariates,
                    balance_metrics=cfg.diagnostics.balance_metrics,
                )
                result.add_table("balance_table", balance_table)
                max_abs_smd_after = balance_table["abs_smd_after"].max()
                result.add_metric("max_abs_smd_after", float(max_abs_smd_after) if max_abs_smd_after is not None else 0.0)

            result.log("Matching module run completed successfully.")
        except Exception as exc:
            result.mark_failed(str(exc))

        self._result = result
        return result

    def save(self, folder) -> None:
        if self._result is None:
            raise MatchingError("save() called before run().")
        save_analysis_result(self._result, folder)