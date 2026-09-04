"""
synapse_gui.services.dataset_compatibility
--------------------------------------------------

Checks whether two datasets share at least one usable column to match
on (excluding id-like columns). This is Synapse-specific orchestration
logic over two separate datasets -- it does not belong in synapse_core
(which is dataset-agnostic and knows nothing about "two datasets to be
compared") nor in synapse_matching (which operates on a single, already
-combined dataframe with a treatment column, not two separate ones).
"""

from __future__ import annotations

import re

import polars as pl
from pydantic import BaseModel, ConfigDict

__all__ = ["CompatibilityResult", "check_dataset_compatibility"]

_ID_NAME_PATTERN = re.compile(r"(^id$|_id$|^id_|^uuid$)", re.IGNORECASE)


class CompatibilityResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_compatible: bool
    common_columns: list[str]
    """Columns present in both datasets, excluding id-like columns."""
    excluded_id_like_columns: list[str]


def check_dataset_compatibility(dataframe_a: pl.DataFrame, dataframe_b: pl.DataFrame) -> CompatibilityResult:
    """Returns the set of columns usable as matching covariates: present
    in both dataframes, excluding columns whose name matches a common
    identifier pattern (same heuristic already used by ConfigBuilder's
    id-inference in synapse_core, kept consistent here).
    """
    columns_a = set(dataframe_a.columns)
    columns_b = set(dataframe_b.columns)
    shared = columns_a & columns_b

    id_like = {c for c in shared if _ID_NAME_PATTERN.search(c)}
    common_columns = sorted(shared - id_like)

    return CompatibilityResult(
        is_compatible=len(common_columns) > 0,
        common_columns=common_columns,
        excluded_id_like_columns=sorted(id_like),
    )