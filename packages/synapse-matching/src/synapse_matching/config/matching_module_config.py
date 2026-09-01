from __future__ import annotations
from pydantic import BaseModel, ConfigDict

from synapse_matching.config.causal_estimation_config import CausalEstimationConfig
from synapse_matching.config.constraints_config import ConstraintsConfig
from synapse_matching.config.covariates_config import CovariatesConfig
from synapse_matching.config.diagnostics_config import DiagnosticsConfig
from synapse_matching.config.distance_config import DistanceConfig
from synapse_matching.config.population_config import PopulationConfig
from synapse_matching.config.preprocessing_config import MatchingPreprocessingConfig
from synapse_matching.config.representation_config import RepresentationConfig
from synapse_matching.config.strategy_config import StrategyConfig

__all__ = ["MatchingModuleConfig"]


class MatchingModuleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    population: PopulationConfig
    covariates: CovariatesConfig
    preprocessing: MatchingPreprocessingConfig = MatchingPreprocessingConfig()
    representation: RepresentationConfig = RepresentationConfig()
    constraints: ConstraintsConfig = ConstraintsConfig()
    distance: DistanceConfig = DistanceConfig()
    strategy: StrategyConfig = StrategyConfig()
    diagnostics: DiagnosticsConfig = DiagnosticsConfig()
    causal_estimation: CausalEstimationConfig | None = None