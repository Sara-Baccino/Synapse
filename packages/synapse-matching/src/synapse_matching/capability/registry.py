"""
synapse_matching.capability.registry
-----------------------------------------

Central registry of implementation status for every Literal option
exposed in MatchingModuleConfig. A value can appear in a config's
Literal type (so the JSON Schema stays complete and stable for the
frontend) while still being rejected at validation time if its status
is not SUPPORTED -- this is how "the configuration can describe a
future capability, but the backend must clearly reject it" is enforced
without shrinking the schema itself.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from synapse_matching.config.matching_module_config import MatchingModuleConfig

__all__ = [
    "CapabilityStatus",
    "CAPABILITY_REGISTRY",
    "get_capability_status",
    "check_config_capabilities",
]


class CapabilityStatus(str, Enum):
    SUPPORTED = "supported"
    EXPERIMENTAL = "experimental"
    PLANNED = "planned"


# Keyed by (config_field, value). Anything not listed here is treated
# as PLANNED by default (fail-closed, never silently accepted).
CAPABILITY_REGISTRY: dict[tuple[str, str], CapabilityStatus] = {
    ("matching_direction", "treated_to_control"): CapabilityStatus.SUPPORTED,
    ("matching_direction", "control_to_treated"): CapabilityStatus.SUPPORTED,
    ("matching_direction", "bidirectional_full"): CapabilityStatus.PLANNED,

    ("ps_method", "logistic"): CapabilityStatus.SUPPORTED,
    ("ps_method", "random_forest"): CapabilityStatus.PLANNED,
    ("ps_method", "lightgbm"): CapabilityStatus.PLANNED,

    ("matching_space", "covariates_only"): CapabilityStatus.SUPPORTED,
    ("matching_space", "ps_only"): CapabilityStatus.SUPPORTED,
    ("matching_space", "logit_ps_only"): CapabilityStatus.SUPPORTED,
    ("matching_space", "hybrid_covariates_and_ps"): CapabilityStatus.SUPPORTED,

    ("trimming_strategy", "none"): CapabilityStatus.SUPPORTED,
    ("trimming_strategy", "symmetric_quantile"): CapabilityStatus.SUPPORTED,
    ("trimming_strategy", "crump_optimal"): CapabilityStatus.PLANNED,
    ("trimming_strategy", "kde_density"): CapabilityStatus.PLANNED,

    ("distance_metric", "euclidean"): CapabilityStatus.SUPPORTED,
    ("distance_metric", "mahalanobis"): CapabilityStatus.SUPPORTED,
    ("distance_metric", "gower"): CapabilityStatus.SUPPORTED,
    ("distance_metric", "ps_logit"): CapabilityStatus.PLANNED,
    ("distance_metric", "weighted_hybrid"): CapabilityStatus.SUPPORTED,

    ("matching_algorithm", "greedy_nn"): CapabilityStatus.SUPPORTED,
    ("matching_algorithm", "optimal_hungarian"): CapabilityStatus.SUPPORTED,
    ("matching_algorithm", "optimal_transport_sinkhorn"): CapabilityStatus.SUPPORTED,
    ("matching_algorithm", "full_matching"): CapabilityStatus.PLANNED,

    ("balance_metric", "smd"): CapabilityStatus.SUPPORTED,
    # --- modifiche puntuali al dizionario esistente ---
    ("balance_metric", "variance_ratio"): CapabilityStatus.SUPPORTED,   # era PLANNED
    ("balance_metric", "ks_test"): CapabilityStatus.SUPPORTED,           # era PLANNED
    ("balance_metric", "chi_square"): CapabilityStatus.SUPPORTED,        # era PLANNED
}


def get_capability_status(field: str, value: str) -> CapabilityStatus:
    return CAPABILITY_REGISTRY.get((field, value), CapabilityStatus.PLANNED)


def check_config_capabilities(config: MatchingModuleConfig) -> None:
    """Explicit capability enforcement, called by the caller (pipeline
    entry point, GUI router) right after constructing a
    MatchingModuleConfig -- deliberately NOT a Pydantic model_validator,
    so UnsupportedCapabilityError reaches the caller intact (field/value/
    status as structured attributes) instead of being flattened into a
    string by Pydantic's ValidationError wrapping.
    """
    from synapse_matching.exceptions import UnsupportedCapabilityError

    checks = [
        ("matching_direction", config.population.matching_direction),
        ("ps_method", config.representation.ps_method),
        ("matching_space", config.representation.matching_space),
        ("trimming_strategy", config.preprocessing.trimming_strategy),
        ("distance_metric", config.distance.distance_metric),
        ("matching_algorithm", config.strategy.matching_algorithm),
    ]
    for field_name, value in checks:
        status = get_capability_status(field_name, value)
        if status != CapabilityStatus.SUPPORTED:
            raise UnsupportedCapabilityError(field_name, value, status.value)

    for metric in config.diagnostics.balance_metrics:
        status = get_capability_status("balance_metric", metric)
        if status != CapabilityStatus.SUPPORTED:
            raise UnsupportedCapabilityError("balance_metric", metric, status.value)

    if config.causal_estimation is not None and config.causal_estimation.estimand is not None:
        raise UnsupportedCapabilityError("causal_estimation.estimand", config.causal_estimation.estimand, "planned")