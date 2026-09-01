"""
synapse_gui.services.demo_datasets
----------------------------------------

Registry of small, deterministic demo datasets: real Iris and Wine
datasets from scikit-learn (numeric features + a categorical target
column), used by both the public informational module preview
(/modules/structure) and the interactive /demo sandbox. Kept separate
from the HTTP layer so datasets can later be swapped/extended without
touching routers/demo.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Callable

import polars as pl
from sklearn.datasets import load_iris, load_wine

__all__ = [
    "DemoDataset",
    "DemoDatasetSummary",
    "DEMO_DATASETS",
    "get_demo_dataset",
    "summarize_dataset",
    "DemoDatasetNotFoundError",
]


class DemoDatasetNotFoundError(Exception):
    """Raised when a requested demo dataset name is not in the known registry."""


@dataclass(frozen=True)
class DemoDataset:
    name: str
    title: str
    description: str
    build: Callable[[], pl.DataFrame]


@dataclass(frozen=True)
class DemoDatasetSummary:
    name: str
    title: str
    description: str
    n_rows: int
    n_columns: int
    n_numerical: int
    n_categorical: int


def _build_iris() -> pl.DataFrame:
    data = load_iris(as_frame=True)
    frame = pl.from_pandas(data.frame)
    frame = frame.rename({"target": "species"})
    species_names = {i: name for i, name in enumerate(data.target_names)}
    frame = frame.with_columns(
        pl.col("species").replace_strict(species_names, return_dtype=pl.Utf8)
    )
    return frame


def _build_wine() -> pl.DataFrame:
    data = load_wine(as_frame=True)
    frame = pl.from_pandas(data.frame)
    frame = frame.rename({"target": "cultivar"})
    cultivar_names = {i: f"cultivar_{i}" for i in range(len(data.target_names))}
    frame = frame.with_columns(
        pl.col("cultivar").replace_strict(cultivar_names, return_dtype=pl.Utf8)
    )
    return frame


@dataclass(frozen=True)
class DemoColumnSummary:
    name: str
    numerical: bool
    categorical: bool


def summarize_columns(dataset: DemoDataset) -> list[DemoColumnSummary]:
    frame = dataset.build()
    return [
        DemoColumnSummary(name=col, numerical=dtype.is_numeric(), categorical=not dtype.is_numeric())
        for col, dtype in zip(frame.columns, frame.dtypes)
    ]

DEMO_DATASETS: dict[str, DemoDataset] = {
    "iris": DemoDataset(
        name="iris",
        title="Iris",
        description="The classic Iris flower measurements dataset (150 samples, 3 species).",
        build=_build_iris,
    ),
    "wine": DemoDataset(
        name="wine",
        title="Wine",
        description="Chemical analysis of wines from 3 different cultivars (178 samples).",
        build=_build_wine,
    ),
}


def get_demo_dataset(name: str) -> DemoDataset:
    dataset = DEMO_DATASETS.get(name)
    if dataset is None:
        raise DemoDatasetNotFoundError(f"Unknown demo dataset '{name}'. Known: {sorted(DEMO_DATASETS)}")
    return dataset


def summarize_dataset(dataset: DemoDataset) -> DemoDatasetSummary:
    """Build row/column/type-count metadata for a demo dataset, used by
    demo cards to show n_rows/n_columns/n_numerical/n_categorical
    without the frontend having to inspect raw data itself.
    """
    frame = dataset.build()
    n_numerical = sum(1 for dtype in frame.dtypes if dtype.is_numeric())
    n_categorical = frame.width - n_numerical
    return DemoDatasetSummary(
        name=dataset.name,
        title=dataset.title,
        description=dataset.description,
        n_rows=frame.height,
        n_columns=frame.width,
        n_numerical=n_numerical,
        n_categorical=n_categorical,
    )