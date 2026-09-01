"""
synapse_core.exceptions
--------------------------

Shared exception hierarchy for synapse-core. Analysis modules
(synapse-structure, synapse-matching, ...) may subclass synapseError
for their own error types, keeping a consistent root for the GUI/backend
to catch.
"""

from __future__ import annotations

__all__ = [
    "synapseError",
    "ConfigError",
    "ConfigNotFoundError",
    "ConfigParseError",
    "ConfigValidationError",
    "DatasetLoadError",
]


class synapseError(Exception):
    """Root exception for all synapse-specific errors."""


class ConfigError(synapseError):
    """Base class for DataConfig read/write/parse errors."""


class ConfigNotFoundError(ConfigError):
    """Raised when a config file path does not exist."""


class ConfigParseError(ConfigError):
    """Raised when config content cannot be parsed into a DataConfig."""


class ConfigValidationError(ConfigError):
    """Raised when a DataConfig fails validation against a dataset."""


class DatasetLoadError(synapseError):
    """Raised when a dataset file cannot be loaded."""


class PipelineError(synapseError):
    """Base class for pipeline/module lifecycle errors."""


class NotFittedError(PipelineError):
    """Raised when run() is called on a module before fit()."""
