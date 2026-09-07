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

__all__ = [
    "CompatibilityResult",
    "DtypeMismatch",
    "check_dataset_compatibility",
    "merge_populations",
]

_ID_NAME_PATTERN = re.compile(r"(^id$|_id$|^id_|^uuid$)", re.IGNORECASE)


class DtypeMismatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    column: str
    dtype_a: str
    dtype_b: str


class CompatibilityResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_compatible: bool
    common_columns: list[str]
    """Columns present in both datasets, sharing name AND dtype family,
    excluding id-like columns. This is the list actually usable to build a
    merged population (merge_populations defaults to exactly this list)."""
    excluded_id_like_columns: list[str]
    dtype_mismatches: list[DtypeMismatch] = []
    """Columns present in both datasets under the same name but with an
    incompatible dtype family (e.g. numeric in A, string in B). These are
    reported explicitly rather than silently treated as compatible, and are
    excluded from `common_columns`."""


def _dtype_family(dtype: pl.DataType) -> str:
    """Coarse family used to decide whether two same-named columns from
    different datasets can be treated as "the same variable". Deliberately
    coarser than exact dtype equality (Int32 vs Int64 are both "numeric" and
    fine to merge; polars will upcast on concat), but numeric vs string is a
    genuine incompatibility worth surfacing rather than merging silently.
    """
    if dtype == pl.Boolean:
        return "boolean"
    if dtype in (pl.Date, pl.Datetime):
        return "temporal"
    if dtype.is_numeric():
        return "numeric"
    return "string"


def check_dataset_compatibility(dataframe_a: pl.DataFrame, dataframe_b: pl.DataFrame) -> CompatibilityResult:
    """Returns the set of columns usable as matching covariates: present
    in both dataframes under the same name AND the same dtype family,
    excluding columns whose name matches a common identifier pattern (same
    heuristic already used by ConfigBuilder's id-inference in synapse_core,
    kept consistent here).
    """
    columns_a = set(dataframe_a.columns)
    columns_b = set(dataframe_b.columns)
    shared = columns_a & columns_b

    id_like = {c for c in shared if _ID_NAME_PATTERN.search(c)}
    candidates = shared - id_like

    common_columns: list[str] = []
    dtype_mismatches: list[DtypeMismatch] = []
    for column in sorted(candidates):
        family_a = _dtype_family(dataframe_a.schema[column])
        family_b = _dtype_family(dataframe_b.schema[column])
        if family_a == family_b:
            common_columns.append(column)
        else:
            dtype_mismatches.append(
                DtypeMismatch(column=column, dtype_a=str(dataframe_a.schema[column]), dtype_b=str(dataframe_b.schema[column]))
            )

    return CompatibilityResult(
        is_compatible=len(common_columns) > 0,
        common_columns=common_columns,
        excluded_id_like_columns=sorted(id_like),
        dtype_mismatches=dtype_mismatches,
    )


def merge_populations(
    dataframe_a: pl.DataFrame,
    dataframe_b: pl.DataFrame,
    treatment_col_name: str = "treatment",
    columns: list[str] | None = None,
    id_column_a: str | None = None,
    id_column_b: str | None = None,
    source_id_col_name: str = "source_id",
) -> pl.DataFrame:
    """Combine two separate population dataframes into the single dataframe
    MatchingModule (and, upstream of it, ConfigBuilder/parse-config) already
    knows how to work with: one dataframe, one synthetic 0/1 treatment
    column. This is the only place the "two datasets" case is handled --
    downstream of this call, the two-dataset and single-dataset workflows
    converge onto the exact same pipeline. `matching_direction` (decided
    later, at matching-design time) is what actually assigns which side is
    query and which is pool; this function only fixes which side is
    encoded as 1 (dataframe_a) vs 0 (dataframe_b).

    :param columns: explicit column subset to keep. If None, defaults to
        `check_dataset_compatibility(...).common_columns` -- i.e. only
        columns shared by name and dtype family, so no column ends up
        silently full of nulls for one entire population.
    :param id_column_a/id_column_b: optional, possibly differently-named,
        per-dataset identifier columns. If either is given, both source ids
        are preserved (as strings, to tolerate differing id dtypes) under a
        single `source_id_col_name` column, so per-unit traceability back to
        the original file survives the merge even when A and B used
        different id column names.
    :raises ValueError: if `treatment_col_name`/`source_id_col_name` would
        collide with a column actually selected for the merge, if requested
        `columns` are missing from either dataset, or if no usable common
        column exists.
    """
    if columns is None:
        compatibility = check_dataset_compatibility(dataframe_a, dataframe_b)
        if not compatibility.is_compatible:
            raise ValueError(
                "The two datasets share no usable common column (same name and dtype family); cannot merge."
            )
        columns = compatibility.common_columns

    # Collision checks are against the columns actually selected for the
    # merge, not the full source dataframes: a source file may legitimately
    # contain an unrelated same-named column that simply isn't part of this
    # merge (e.g. dataset A already has its own "treatment" flag for
    # something else), and that should not block using the default name for
    # the synthetic group column.
    if treatment_col_name in columns:
        raise ValueError(
            f"'{treatment_col_name}' collides with a requested merge column; pass a different treatment_col_name."
        )

    missing_a = [c for c in columns if c not in dataframe_a.columns]
    missing_b = [c for c in columns if c not in dataframe_b.columns]
    if missing_a or missing_b:
        raise ValueError(
            f"Requested merge columns not found in both datasets (missing in A: {missing_a}, missing in B: {missing_b})."
        )

    include_source_id = id_column_a is not None or id_column_b is not None
    if include_source_id and source_id_col_name in columns:
        raise ValueError(
            f"'{source_id_col_name}' collides with a requested merge column; pass a different source_id_col_name."
        )

    frame_a = dataframe_a.select(columns)
    frame_b = dataframe_b.select(columns)

    if include_source_id:
        source_id_a = (
            dataframe_a[id_column_a].cast(pl.Utf8)
            if id_column_a is not None
            else pl.Series([None] * dataframe_a.height, dtype=pl.Utf8)
        )
        source_id_b = (
            dataframe_b[id_column_b].cast(pl.Utf8)
            if id_column_b is not None
            else pl.Series([None] * dataframe_b.height, dtype=pl.Utf8)
        )
        frame_a = frame_a.with_columns(source_id_a.alias(source_id_col_name))
        frame_b = frame_b.with_columns(source_id_b.alias(source_id_col_name))

    frame_a = frame_a.with_columns(pl.lit(1).alias(treatment_col_name))
    frame_b = frame_b.with_columns(pl.lit(0).alias(treatment_col_name))

    return pl.concat([frame_a, frame_b], how="vertical")