"""
synapse_core.models.data_config
----------------------------------

Aggregate, dataset-level configuration: a named collection of
ColumnInfo. Describes only the dataset (columns, mappings, missing-data
handling, scaling, semantic roles) -- never algorithm parameters. Every
analysis module receives the same DataConfig instance and reads it
read-only.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator

from synapse_core.models.column_info import ColumnInfo

__all__ = ["DataConfig"]


class DataConfig(BaseModel):
    """Keyed collection of ColumnInfo describing an entire dataset."""

    model_config = ConfigDict(extra="forbid")

    columns: dict[str, ColumnInfo]

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    @model_validator(mode="after")
    def _check_key_matches_new_name(self) -> "DataConfig":
        mismatched = [
            key for key, info in self.columns.items() if key != info.new_name
        ]
        if mismatched:
            raise ValueError(
                "DataConfig key must equal ColumnInfo.new_name for each entry; "
                f"mismatched keys: {mismatched}"
            )
        return self

    # ------------------------------------------------------------------ #
    # Dict-like ergonomics
    # ------------------------------------------------------------------ #
    def __getitem__(self, name: str) -> ColumnInfo:
        return self.columns[name]

    def __contains__(self, name: str) -> bool:
        return name in self.columns

    def __iter__(self) -> Iterator[str]:  # type: ignore[override]
        return iter(self.columns)

    def __len__(self) -> int:
        return len(self.columns)

    def items(self):
        return self.columns.items()

    # ------------------------------------------------------------------ #
    # Query helpers
    # ------------------------------------------------------------------ #
    def active_columns(self) -> dict[str, ColumnInfo]:
        """Return only the columns marked active."""
        return {name: info for name, info in self.columns.items() if info.active}

    def column_names(self, *, active_only: bool = True) -> list[str]:
        """Return column names, optionally restricted to active columns."""
        source = self.active_columns() if active_only else self.columns
        return list(source.keys())

    def categorical_columns(self, *, active_only: bool = True) -> list[str]:
        source = self.active_columns() if active_only else self.columns
        return [name for name, info in source.items() if info.categorical]

    def numerical_columns(self, *, active_only: bool = True) -> list[str]:
        source = self.active_columns() if active_only else self.columns
        return [name for name, info in source.items() if info.numerical]

    def id_columns(self, *, active_only: bool = True) -> list[str]:
        source = self.active_columns() if active_only else self.columns
        return [name for name, info in source.items() if info.id]

    def columns_with_role(self, role: str, *, active_only: bool = True) -> list[str]:
        """Return columns tagged with the given semantic role (e.g. 'clinical')."""
        source = self.active_columns() if active_only else self.columns
        return [name for name, info in source.items() if role in info.semantic_roles]

    def scaled_columns(self, *, active_only: bool = True) -> list[str]:
        source = self.active_columns() if active_only else self.columns
        return [name for name, info in source.items() if info.scaling.enabled]

    def get(self, name: str, default: ColumnInfo | None = None) -> ColumnInfo | None:
        return self.columns.get(name, default)

    # ------------------------------------------------------------------ #
    # Serialization convenience
    # ------------------------------------------------------------------ #
    def to_dict(self) -> dict[str, Any]:
        """Plain-dict representation, e.g. for persisting alongside a report."""
        return self.model_dump(mode="json")
