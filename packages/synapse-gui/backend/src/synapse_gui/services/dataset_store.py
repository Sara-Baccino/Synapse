"""
synapse_gui.services.dataset_store
----------------------------------------

In-memory registry of uploaded datasets and their associated DataConfig,
keyed by a server-generated dataset_id. Identical in logic to
synclair-gui's dataset_store.py (Phase 1 recycling plan) -- no
Structure/Matching-specific logic here, only generic dataset/config
storage.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from uuid import uuid4

import polars as pl

from synapse_core.models.data_config import DataConfig

__all__ = ["DatasetRecord", "DatasetStore", "DatasetNotFoundError", "dataset_store"]


class DatasetNotFoundError(Exception):
    """Raised when a dataset_id does not exist in the store."""


@dataclass
class DatasetRecord:
    dataset_id: str
    filename: str
    dataframe: pl.DataFrame
    data_config: DataConfig | None = None


class DatasetStore:
    def __init__(self) -> None:
        self._records: dict[str, DatasetRecord] = {}
        self._lock = threading.Lock()

    def add(self, filename: str, dataframe: pl.DataFrame) -> DatasetRecord:
        dataset_id = str(uuid4())
        record = DatasetRecord(dataset_id=dataset_id, filename=filename, dataframe=dataframe)
        with self._lock:
            self._records[dataset_id] = record
        return record

    def get(self, dataset_id: str) -> DatasetRecord:
        with self._lock:
            record = self._records.get(dataset_id)
        if record is None:
            raise DatasetNotFoundError(f"No dataset found with id '{dataset_id}'.")
        return record

    def set_data_config(self, dataset_id: str, data_config: DataConfig) -> DatasetRecord:
        record = self.get(dataset_id)
        with self._lock:
            record.data_config = data_config
        return record


dataset_store = DatasetStore()