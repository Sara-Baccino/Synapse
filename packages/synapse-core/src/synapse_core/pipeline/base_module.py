"""
synapse_core.pipeline.base_module
-------------------------------------

Defines the contract every synapse analysis module implements. This is
the abstraction that lets BasePipeline, the plugin registry, and the GUI
orchestrate any module (clustering, matching, validation, profiling, ...)
without knowing its concrete type.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Generic, TypeVar

import polars as pl
from pydantic import BaseModel

from synapse_core.exceptions import NotFittedError
from synapse_core.models.analysis_result import AnalysisResult
from synapse_core.models.data_config import DataConfig
from synapse_core.pipeline.execution_context import ExecutionContext

__all__ = ["AnalysisModule", "ModuleConfigT"]

ModuleConfigT = TypeVar("ModuleConfigT", bound=BaseModel)
"""Each concrete module parametrizes AnalysisModule with its own config
type (e.g. AnalysisModule[ClusteringConfig]), keeping synapse-core
unaware of any concrete module config."""


class AnalysisModule(ABC, Generic[ModuleConfigT]):
    """Abstract base class for every synapse analysis module.

    Lifecycle: fit() binds inputs -> run() executes and returns an
    AnalysisResult -> save() persists the module's output. Modules are
    stateful across this lifecycle (sklearn-style), not pure functions,
    because run() may be called multiple times (e.g. re-run after
    inspecting an intermediate result) without re-binding inputs.
    """

    def __init__(self, module_name: str, module_version: str | None = None) -> None:
        self.module_name = module_name
        self.module_version = module_version
        self._dataset: pl.DataFrame | None = None
        self._data_config: DataConfig | None = None
        self._module_config: ModuleConfigT | None = None
        self._context: ExecutionContext | None = None
        self._is_fitted: bool = False

    @property
    def is_fitted(self) -> bool:
        return self._is_fitted

    @property
    def context(self) -> ExecutionContext | None:
        return self._context

    @abstractmethod
    def fit(
        self,
        dataset: pl.DataFrame,
        data_config: DataConfig,
        module_config: ModuleConfigT,
        context: ExecutionContext | None = None,
    ) -> "AnalysisModule[ModuleConfigT]":
        """Bind data and configuration to this module instance.

        Concrete implementations should call self._bind(...) to store
        the inputs and mark the module as fitted, then perform any
        module-specific fitting work (e.g. fitting a clustering model),
        and finally return self to allow fluent chaining
        (module.fit(...).run()).

        :param dataset: preprocessed dataframe (post Preprocessing/
            Transformers/Scaling, and optionally Imputation -- see
            `context.imputation_applied`).
        :param data_config: DataConfig describing the dataset.
        :param module_config: module-specific algorithm parameters
            (e.g. ClusteringConfig, MatchingConfig).
        :param context: optional ExecutionContext carrying fitted
            preprocessing state (scalers, encoders, imputers) and
            preprocessing flags produced upstream by BasePipeline.
        :return: self, for fluent chaining.
        """
        raise NotImplementedError

    @abstractmethod
    def run(self) -> AnalysisResult:
        """Execute the analysis and return a populated AnalysisResult.

        Implementations must call self._check_is_fitted() first, and
        should prefer AnalysisResult.mark_failed(...) over raising, so a
        partial result (with logs) can still be returned upstream.
        """
        raise NotImplementedError

    @abstractmethod
    def save(self, folder: str | Path) -> None:
        """Persist this module's output (result and/or artifacts) to `folder`.

        Concrete persistence format is module-specific for now; a shared
        default implementation will be offered via ArtifactManager
        (Phase 5) as an opt-in mixin, rather than forcing one strategy
        here.
        """
        raise NotImplementedError

    # ------------------------------------------------------------------ #
    # Helpers for subclasses
    # ------------------------------------------------------------------ #
    def _bind(
        self,
        dataset: pl.DataFrame,
        data_config: DataConfig,
        module_config: ModuleConfigT,
        context: ExecutionContext | None,
    ) -> None:
        """Store fit() inputs and mark the module as fitted.

        Called by subclasses at the start of their fit() implementation,
        so the fitted/unfitted bookkeeping never needs to be repeated
        per-module.
        """
        self._dataset = dataset
        self._data_config = data_config
        self._module_config = module_config
        self._context = context if context is not None else ExecutionContext()
        self._is_fitted = True

    def _check_is_fitted(self) -> None:
        if not self._is_fitted:
            raise NotFittedError(
                f"{self.__class__.__name__} must be fit() before run() is called."
            )
