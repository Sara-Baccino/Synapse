"""
synapse_matching.exploration.base
--------------------------------------

Minimal contract for pre-matching population profiling. Not a family of
interchangeable algorithms (hence no ABC-heavy design) -- a single
computation that produces descriptive statistics, distributions,
missingness, and correlations for two groups, before any matching
strategy is configured.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

__all__ = [
    "DescriptiveStatRow", "NumericDistribution", "CategoricalFrequency",
    "MissingnessRow", "CorrelationMatrix", "PopulationProfile",
]


class DescriptiveStatRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variable: str
    group: str
    mean: float | None
    std: float | None
    min: float | None
    max: float | None


class NumericDistribution(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variable: str
    bin_edges: list[float]
    treated_counts: list[int]
    control_counts: list[int]


class CategoricalFrequency(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variable: str
    categories: list[str]
    treated_frequencies: list[float]
    control_frequencies: list[float]


class MissingnessRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variable: str
    treated_missing_pct: float
    control_missing_pct: float


class CorrelationMatrix(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variables: list[str]
    treated_matrix: list[list[float]]
    control_matrix: list[list[float]]


class PopulationProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    descriptive_stats: list[DescriptiveStatRow]
    numeric_distributions: list[NumericDistribution]
    categorical_frequencies: list[CategoricalFrequency]
    missingness: list[MissingnessRow]
    correlations: CorrelationMatrix