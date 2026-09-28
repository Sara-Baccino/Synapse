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
    x_grid: list[float]
    treated_density: list[float]
    control_density: list[float]
    """Gaussian KDE (scipy.stats.gaussian_kde) evaluated over a shared
    x_grid, not a binned histogram: this is the actual continuous
    distribution shape, not an artifact of a bin-width choice. Only
    populated for variables treated as continuous (numeric with >= 7
    distinct values) -- lower-cardinality numeric variables and every
    categorical variable go through CategoricalFrequency instead."""


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
    numerical_correlations: CorrelationMatrix
    """Pearson correlation among genuinely continuous covariates only."""
    categorical_correlations: CorrelationMatrix
    """Cramér's V association among categorical (and low-cardinality
    numeric) covariates -- a different statistic from Pearson, so kept
    as a separate matrix rather than mixed into the same heatmap."""