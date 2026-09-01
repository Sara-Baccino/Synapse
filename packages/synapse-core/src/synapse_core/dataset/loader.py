"""
synapse_core.dataset.loader
-------------------------------

Reads a dataset file from disk into a raw Polars DataFrame. Deliberately
knows nothing about DataConfig: it produces the raw data that
ConfigBuilder inspects and that preprocessing.py later transforms.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import polars as pl
from pydantic import BaseModel, ConfigDict

from synapse_core.exceptions import DatasetLoadError

__all__ = ["Loader", "LoadManyResult"]


def _read_csv(path: Path, **kwargs) -> pl.DataFrame:
    return pl.read_csv(path, **kwargs)


def _read_tsv(path: Path, **kwargs) -> pl.DataFrame:
    kwargs.setdefault("separator", "\t")
    return pl.read_csv(path, **kwargs)


def _read_parquet(path: Path, **kwargs) -> pl.DataFrame:
    return pl.read_parquet(path, **kwargs)


def _read_json(path: Path, **kwargs) -> pl.DataFrame:
    return pl.read_json(path, **kwargs)


def _read_excel(path: Path, **kwargs) -> pl.DataFrame:
    return pl.read_excel(path, **kwargs)


_READERS: dict[str, Callable[..., pl.DataFrame]] = {
    ".csv": _read_csv,
    ".tsv": _read_tsv,
    ".parquet": _read_parquet,
    ".json": _read_json,
    ".xlsx": _read_excel,
    ".xls": _read_excel,
}


class LoadManyResult(BaseModel):
    """Outcome of a best-effort batch load via Loader.load_many.

    Keeps successes and failures separate so the caller decides what to
    do: a module may tolerate some missing optional files but must fail
    loudly if a *required* one is among the failures.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    loaded_datasets: dict[str, pl.DataFrame] = {}
    """Successfully loaded datasets, keyed by file stem."""
    failed_files: dict[str, str] = {}
    """Failed files, keyed by original path string, value is the error message."""

    @property
    def has_failures(self) -> bool:
        return bool(self.failed_files)

    def raise_if_missing(self, required_paths: list[str | Path]) -> None:
        """Raise a single cumulative DatasetLoadError listing every
        required path that is present in `failed_files`.

        Required paths that loaded successfully, or that were never part
        of this batch, are ignored. Does nothing if none of the required
        paths failed.
        """
        required_strs = {str(p) for p in required_paths}
        missing_required = {
            path: error for path, error in self.failed_files.items() if path in required_strs
        }
        if missing_required:
            details = "; ".join(f"{path}: {error}" for path, error in missing_required.items())
            raise DatasetLoadError(f"Failed to load required dataset file(s): {details}")


class Loader:
    """Stateless utility for loading raw datasets into Polars DataFrames."""

    @staticmethod
    def supported_extensions() -> list[str]:
        """Return the file extensions this loader knows how to read."""
        return sorted(_READERS.keys())

    @staticmethod
    def load(path: str | Path, **read_kwargs) -> pl.DataFrame:
        """Load a single dataset file into a raw Polars DataFrame.

        :param path: path to the dataset file. Format is inferred from
            the file extension (.csv, .tsv, .parquet, .json, .xlsx, .xls).
        :param read_kwargs: forwarded as-is to the underlying Polars
            reader (e.g. separator=";", sheet_name="Sheet1"), so
            format-specific options never need to be re-exposed here.
        :raises DatasetLoadError: if the file is missing, the extension
            is unsupported, or the underlying reader raises.
        """
        file_path = Path(path)

        if not file_path.is_file():
            raise DatasetLoadError(f"Dataset file not found: {file_path}")

        extension = file_path.suffix.lower()
        reader = _READERS.get(extension)
        if reader is None:
            raise DatasetLoadError(
                f"Unsupported file extension '{extension}' for '{file_path}'. "
                f"Supported extensions: {Loader.supported_extensions()}"
            )

        try:
            return reader(file_path, **read_kwargs)
        except DatasetLoadError:
            raise
        except Exception as exc:  # noqa: BLE001 - deliberately broad: normalize any backend error
            raise DatasetLoadError(f"Failed to load dataset '{file_path}': {exc}") from exc

    @staticmethod
    def load_many(paths: list[str | Path], **read_kwargs) -> LoadManyResult:
        """Load multiple dataset files, best-effort.

        Every path is attempted, regardless of earlier failures, so the
        caller learns about *all* problematic files in a single pass
        instead of stopping at the first one. Successes and failures are
        returned separately; the caller decides whether a given failure
        is fatal (see LoadManyResult.raise_if_missing).
        """
        result = LoadManyResult()

        for path in paths:
            path_str = str(path)
            try:
                result.loaded_datasets[Path(path).stem] = Loader.load(path, **read_kwargs)
            except DatasetLoadError as exc:
                result.failed_files[path_str] = str(exc)

        return result
