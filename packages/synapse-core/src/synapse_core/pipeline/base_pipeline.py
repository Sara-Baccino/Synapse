"""
synapse_core.pipeline.base_pipeline
----------------------------------------

Template-method orchestrator for a full analysis run: load the raw
dataset, preprocess it (Preprocessing, optional Imputation, Transformers,
Scaling), bind and run an injected AnalysisModule, enrich the resulting
AnalysisResult with configuration/context metadata, and export it. Every
step is a small overridable method so concrete pipelines can customize
one step without reimplementing the whole flow.
"""

from __future__ import annotations

from pathlib import Path
from time import perf_counter
from typing import Generic

import polars as pl

from synapse_core.dataset.imputation import Imputation
from synapse_core.dataset.loader import Loader
from synapse_core.dataset.preprocessing import Preprocessing
from synapse_core.dataset.scaling import Scaling
from synapse_core.dataset.transformers import Transformers
from synapse_core.exceptions import PipelineError
from synapse_core.models.analysis_result import AnalysisResult, ResultMetadata
from synapse_core.models.data_config import DataConfig
from synapse_core.pipeline.base_module import AnalysisModule, ModuleConfigT
from synapse_core.pipeline.execution_context import ExecutionContext

__all__ = ["BasePipeline"]


class BasePipeline(Generic[ModuleConfigT]):
    """Orchestrates load -> preprocess -> execute -> build_result -> export.

    Injected with a concrete AnalysisModule, so the same pipeline class
    works for clustering, matching, or any future module -- BasePipeline
    itself never imports a concrete module type.
    """

    def __init__(
        self,
        module: AnalysisModule[ModuleConfigT],
        dataset_path: str | Path,
        data_config: DataConfig,
        module_config: ModuleConfigT,
        apply_imputation: bool = False,
        output_folder: str | Path | None = None,
        loader_kwargs: dict | None = None,
    ) -> None:
        """
        :param module: concrete AnalysisModule instance to run (unfitted).
        :param dataset_path: path to the raw dataset file (see Loader for
            supported formats).
        :param data_config: DataConfig describing the dataset.
        :param module_config: module-specific algorithm parameters.
        :param apply_imputation: whether to run Imputation.fit_transform
            during preprocess(). Left False by default so modules like
            profiling/discovery/cleaning can observe residual nulls;
            concrete pipelines for modules that need complete data (e.g.
            clustering) should pass True, typically resolved from their
            own module_config (e.g. `module_config.apply_imputation`).
        :param output_folder: folder passed to `module.save()` in
            export(). If None, export() is a no-op.
        :param loader_kwargs: forwarded as-is to Loader.load (e.g.
            separator=";" for a semicolon-delimited CSV).
        """
        self.module = module
        self.dataset_path = Path(dataset_path)
        self.data_config = data_config
        self.module_config = module_config
        self.apply_imputation = apply_imputation
        self.output_folder = Path(output_folder) if output_folder is not None else None
        self.loader_kwargs = loader_kwargs or {}

        self._raw_dataset: pl.DataFrame | None = None
        self._preprocessed_dataset: pl.DataFrame | None = None
        self._context: ExecutionContext | None = None

    # ------------------------------------------------------------------ #
    # Lifecycle steps (each overridable independently)
    # ------------------------------------------------------------------ #
    def load_dataset(self) -> pl.DataFrame:
        """Load the raw dataset via Loader. Stores and returns the result."""
        self._raw_dataset = Loader.load(self.dataset_path, **self.loader_kwargs)
        return self._raw_dataset

    def preprocess(self) -> pl.DataFrame:
        """Run Preprocessing -> [Imputation] -> Transformers -> Scaling.

        Builds and stores the ExecutionContext carrying every fitted
        artifact and the `imputation_applied` flag, so AnalysisModule can
        later inspect what was actually done to the data it receives.

        :raises PipelineError: if called before load_dataset().
        """
        if self._raw_dataset is None:
            raise PipelineError("preprocess() called before load_dataset().")

        context = ExecutionContext()
        data = self._raw_dataset

        start = perf_counter()
        data = Preprocessing.run(data, self.data_config)
        context.record_step_timing("preprocessing", perf_counter() - start)

        if self.apply_imputation:
            start = perf_counter()
            data, fitted_imputers = Imputation.fit_transform(data, self.data_config)
            context.fitted_imputers = fitted_imputers
            context.imputation_applied = True
            context.record_step_timing("imputation", perf_counter() - start)

        start = perf_counter()
        data, fitted_encoders = Transformers.fit_transform(data, self.data_config)
        context.fitted_encoders = fitted_encoders
        context.record_step_timing("encoding", perf_counter() - start)

        start = perf_counter()
        data, fitted_scalers = Scaling.fit_transform(data, self.data_config)
        context.fitted_scalers = fitted_scalers
        context.record_step_timing("scaling", perf_counter() - start)

        self._context = context
        self._preprocessed_dataset = data
        return data

    def execute(self) -> AnalysisResult:
        """Bind the preprocessed dataset/config/context to the module and run it.

        :raises PipelineError: if called before preprocess().
        """
        if self._preprocessed_dataset is None or self._context is None:
            raise PipelineError("execute() called before preprocess().")

        self.module.fit(
            dataset=self._preprocessed_dataset,
            data_config=self.data_config,
            module_config=self.module_config,
            context=self._context,
        )
        return self.module.run()

    def build_result(self, result: AnalysisResult) -> AnalysisResult:
        """Enrich the module's AnalysisResult with pipeline-level context.

        Only fills fields the module left at their defaults (setdefault
        semantics on `config`), so a module's own reporting is never
        overwritten by pipeline bookkeeping.
        """
        result.config.setdefault("data_config", self.data_config.to_dict())
        result.config.setdefault("module_config", self.module_config.model_dump(mode="json"))
        if self._context is not None:
            result.config.setdefault("execution_context", self._context.artifacts_summary())
        return result

    def export(self, result: AnalysisResult) -> None:
        """Persist the module's output via module.save(). No-op if no output_folder."""
        if self.output_folder is not None:
            self.output_folder.mkdir(parents=True, exist_ok=True)
            self.module.save(self.output_folder)

    # ------------------------------------------------------------------ #
    # Public entry point
    # ------------------------------------------------------------------ #
    def run(self) -> AnalysisResult:
        """Run the full pipeline: load -> preprocess -> execute -> build_result -> export.

        Any exception raised by load_dataset/preprocess/execute is caught
        and turned into a failed AnalysisResult (mark_failed) rather than
        propagated, so callers (backend, GUI) always get a well-formed
        result to inspect and display, even on failure.
        """
        overall_start = perf_counter()

        try:
            self.load_dataset()
            self.preprocess()
            result = self.execute()
        except Exception as exc:  # noqa: BLE001 - normalized into a failed AnalysisResult
            result = AnalysisResult(
                metadata=ResultMetadata(
                    module_name=self.module.module_name,
                    module_version=self.module.module_version,
                    dataset_name=self.dataset_path.stem,
                )
            )
            result.mark_failed(str(exc))
            return result

        result = self.build_result(result)
        result.runtime_seconds = perf_counter() - overall_start
        self.export(result)
        return result
