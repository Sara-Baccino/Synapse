from __future__ import annotations
from pydantic import BaseModel, ConfigDict

__all__ = ["PopulationDiagnosticsResult", "PopulationDiagnostics"]


class PopulationDiagnosticsResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n_query_total: int
    n_pool_total: int
    n_query_matched: int
    n_query_unmatched: int
    match_rate: float


class PopulationDiagnostics:
    def compute(self, n_query_total: int, n_pool_total: int, n_query_matched: int) -> PopulationDiagnosticsResult:
        return PopulationDiagnosticsResult(
            n_query_total=n_query_total,
            n_pool_total=n_pool_total,
            n_query_matched=n_query_matched,
            n_query_unmatched=n_query_total - n_query_matched,
            match_rate=n_query_matched / n_query_total if n_query_total else 0.0,
        )