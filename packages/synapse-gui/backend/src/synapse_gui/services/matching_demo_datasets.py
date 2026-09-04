"""
synapse_gui.services.matching_demo_datasets
------------------------------------------------------

Deterministic synthetic treatment/control datasets with a real selection
bias (treatment probability depends on an observable covariate), so the
demo visibly shows pre-match imbalance and post-match correction --
not just "the algorithm runs".
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import polars as pl

__all__ = ["DemoMatchingDataset", "DEMO_MATCHING_DATASETS", "get_demo_matching_dataset", "DemoMatchingDatasetNotFoundError"]


class DemoMatchingDatasetNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class DemoMatchingDataset:
    name: str
    title: str
    description: str
    build: Callable[[], pl.DataFrame]


def _build_clinical_selection_bias() -> pl.DataFrame:
    """Age-driven propensity to treatment: older patients are more likely
    to be treated, creating a real, visible pre-match imbalance on age
    (and a correlated clinical score) that matching should correct.
    """
    rng = np.random.default_rng(42)
    n = 400
    age = rng.normal(50, 12, n)
    age = np.clip(age, 20, 85)

    # Propensity increases with age (real selection bias, not random).
    logit_ps = -4 + 0.08 * age
    propensity = 1 / (1 + np.exp(-logit_ps))
    treatment = rng.binomial(1, propensity)

    clinical_score = 0.5 * age + rng.normal(0, 8, n)
    followup_months = rng.integers(1, 60, n)

    return pl.DataFrame({
        "patient_id": range(n),
        "age": age,
        "clinical_score": clinical_score,
        "followup_months": followup_months,
        "treatment": treatment,
    })


DEMO_MATCHING_DATASETS: dict[str, DemoMatchingDataset] = {
    "clinical_selection_bias": DemoMatchingDataset(
        name="clinical_selection_bias",
        title="Clinical trial with age-driven selection bias",
        description="400 synthetic patients; treatment probability increases with age, creating a realistic pre-match imbalance.",
        build=_build_clinical_selection_bias,
    ),
}


def get_demo_matching_dataset(name: str) -> DemoMatchingDataset:
    dataset = DEMO_MATCHING_DATASETS.get(name)
    if dataset is None:
        raise DemoMatchingDatasetNotFoundError(f"Unknown demo dataset '{name}'. Known: {sorted(DEMO_MATCHING_DATASETS)}")
    return dataset