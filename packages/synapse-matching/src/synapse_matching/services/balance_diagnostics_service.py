from __future__ import annotations
import polars as pl

from synapse_matching.diagnostics.balance.chi_square_test import ChiSquareBalanceTest
from synapse_matching.diagnostics.balance.ks_test import KolmogorovSmirnovBalanceTest
from synapse_matching.diagnostics.balance.smd import StandardizedMeanDifferenceMetric
from synapse_matching.diagnostics.balance.variance_ratio import VarianceRatioMetric
from synapse_matching.diagnostics.balance.jensen_shannon import JensenShannonBalanceMetric

__all__ = ["BalanceDiagnosticsService"]


class BalanceDiagnosticsService:
    def __init__(
        self,
        smd_metric: StandardizedMeanDifferenceMetric | None = None,
        variance_ratio_metric: VarianceRatioMetric | None = None,
        ks_test: KolmogorovSmirnovBalanceTest | None = None,
        chi_square_test: ChiSquareBalanceTest | None = None,
        jensen_shannon_metric: JensenShannonBalanceMetric | None = None
    ) -> None:
        self._smd_metric = smd_metric or StandardizedMeanDifferenceMetric()
        self._variance_ratio_metric = variance_ratio_metric or VarianceRatioMetric()
        self._ks_test = ks_test or KolmogorovSmirnovBalanceTest()
        self._chi_square_test = chi_square_test or ChiSquareBalanceTest()
        self._jensen_shannon_metric = jensen_shannon_metric or JensenShannonBalanceMetric()

    def compute(
        self,
        df_before: pl.DataFrame,
        df_after: pl.DataFrame,
        treatment_column: str,
        matching_covariates: list[str],
        evaluation_covariates: list[str] | None = None,
        balance_metrics: list[str] | None = None,
    ) -> pl.DataFrame:
        all_covariates = list(matching_covariates) + list(evaluation_covariates or [])
        balance_metrics = balance_metrics or ["smd"]

        before_smd = self._smd_metric.compute(df_before, treatment_column, all_covariates).rename(
            {"smd": "smd_before", "abs_smd": "abs_smd_before"}
        )
        after_smd = self._smd_metric.compute(df_after, treatment_column, all_covariates).rename(
            {"smd": "smd_after", "abs_smd": "abs_smd_after"}
        )
        table = before_smd.join(after_smd, on="variable", how="inner")

        if "variance_ratio" in balance_metrics:
            vr_before = self._variance_ratio_metric.compute(df_before, treatment_column, all_covariates).rename(
                {"variance_ratio": "variance_ratio_before"}
            )
            vr_after = self._variance_ratio_metric.compute(df_after, treatment_column, all_covariates).rename(
                {"variance_ratio": "variance_ratio_after"}
            )
            table = table.join(vr_before, on="variable", how="left").join(vr_after, on="variable", how="left")

        # KS/Chi-square are computed post-match only, mirroring the
        # legacy balance_table (which never computed a "before" version
        # of these tests, only SMD had a before/after comparison).
        if "ks_test" in balance_metrics:
            table = table.join(self._ks_test.compute(df_after, treatment_column, all_covariates), on="variable", how="left")

        if "chi_square" in balance_metrics:
            table = table.join(self._chi_square_test.compute(df_after, treatment_column, all_covariates), on="variable", how="left")

        if "jensen_shannon" in balance_metrics:
            table = table.join(self._jensen_shannon_metric.compute(df_after, treatment_column, all_covariates),
                on="variable", how="left"
            )

        return table.with_columns(pl.col("variable").is_in(matching_covariates).alias("is_matching_covariate"))