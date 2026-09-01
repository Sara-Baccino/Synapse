"""
synapse_core.dataset.config_reader
--------------------------------------

Reads and writes DataConfig objects to/from JSON (file, string, or bytes).
Purely a (de)serialization concern: building a DataConfig from a live
dataframe is ConfigBuilder's job, not this module's.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from synapse_core.exceptions import ConfigNotFoundError, ConfigParseError
from synapse_core.models.data_config import DataConfig

__all__ = ["ConfigReader"]


class ConfigReader:
    """Stateless utility for reading and writing DataConfig objects."""

    @staticmethod
    def read(path: str | Path) -> DataConfig:
        """Read a DataConfig from a JSON file.

        :param path: path to a JSON file shaped as {"<column>": {...}, ...}
            or {"columns": {"<column>": {...}, ...}}.
        :raises ConfigNotFoundError: if the file does not exist.
        :raises ConfigParseError: if the file content is not valid JSON
            or does not match the DataConfig schema.
        """
        file_path = Path(path)
        if not file_path.is_file():
            raise ConfigNotFoundError(f"Config file not found: {file_path}")

        raw_text = file_path.read_text(encoding="utf-8")
        try:
            return ConfigReader.from_json(raw_text)
        except ConfigParseError as exc:
            raise ConfigParseError(f"Failed to parse config file '{file_path}': {exc}") from exc

    @staticmethod
    def from_dict(data: dict) -> DataConfig:
        """Build a DataConfig from a plain dict.

        Accepts either a bare column mapping ({"AGE": {...}, ...}) or an
        already-wrapped ({"columns": {"AGE": {...}, ...}}) shape, for
        convenience when hand-authoring configs.
        :raises ConfigParseError: if the dict does not match the schema.
        """
        payload = data if "columns" in data else {"columns": data}
        try:
            return DataConfig.model_validate(payload)
        except ValidationError as exc:
            raise ConfigParseError(f"Invalid DataConfig payload: {exc}") from exc

    @staticmethod
    def from_json(json_data: str | bytes) -> DataConfig:
        """Build a DataConfig from a JSON string or bytes.

        :raises ConfigParseError: if the content is not valid JSON or
            does not match the DataConfig schema.
        """
        try:
            parsed = json.loads(json_data)
        except (json.JSONDecodeError, TypeError) as exc:
            raise ConfigParseError(f"Invalid JSON content: {exc}") from exc

        return ConfigReader.from_dict(parsed)

    @staticmethod
    def to_json(config: DataConfig, *, indent: int | None = 2) -> str:
        """Serialize a DataConfig to a JSON string."""
        return json.dumps(config.to_dict(), indent=indent)

    @staticmethod
    def write(config: DataConfig, path: str | Path, *, indent: int | None = 2) -> None:
        """Serialize a DataConfig and write it to a file."""
        file_path = Path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(ConfigReader.to_json(config, indent=indent), encoding="utf-8")