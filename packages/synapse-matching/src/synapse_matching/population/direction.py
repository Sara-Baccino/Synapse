"""
synapse_matching.population.direction
--------------------------------------------

Resolves which group is the "query" (the one we find matches for) and
which is the "candidate pool", based on matching_direction. This is a
pure relabeling, not a different algorithm: treated_to_control (ATT)
searches controls for each treated unit; control_to_treated (ATC) does
the reverse.
"""

from __future__ import annotations
from typing import Literal
import polars as pl

__all__ = ["resolve_direction"]


def resolve_direction(
    df: pl.DataFrame, treatment_col: str, direction: Literal["treated_to_control", "control_to_treated"]
) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Returns (query_df, pool_df) according to `direction`."""
    treated = df.filter(pl.col(treatment_col) == 1)
    control = df.filter(pl.col(treatment_col) == 0)

    if direction == "treated_to_control":
        return treated, control
    return control, treated