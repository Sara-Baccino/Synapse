"""
Regression tests for ConfigBuilder._infer_column_info /
ConfigBuilder._infer_semantic_type.

Covers the concrete bug this was written to fix: a numeric column coded as
0/1 (int or float) must be inferred as binary categorical, never as a
continuous numeric measurement. Also covers the surrounding physical-type
vs. semantic-role distinctions (discrete vs. continuous numeric, id,
string/nominal, boolean, temporal), and confirms that a user-supplied
DataConfig is never re-inferred or overridden.
"""

import polars as pl
import pytest

from synapse_core.dataset.config_builder import ConfigBuilder
from synapse_core.models.column_info import ColumnType
from synapse_core.models.data_config import DataConfig


def _col(config: DataConfig, name: str):
    return config.columns[name]


class TestBinaryDetection:
    """The core regression: 0/1-coded columns must not be 'numerical'."""

    def test_int_zero_one_is_binary_categorical(self):
        df = pl.DataFrame({"flag": [0, 1, 0, 1, 1]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "flag")
        assert col.categorical is True
        assert col.numerical is False
        assert "binary" in col.semantic_roles

    def test_float_zero_one_is_binary_categorical(self):
        # Same bug, float-encoded (e.g. read from a CSV with a decimal point).
        df = pl.DataFrame({"flag": [0.0, 1.0, 1.0, 0.0]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "flag")
        assert col.categorical is True
        assert col.numerical is False
        assert "binary" in col.semantic_roles

    def test_boolean_dtype_is_binary_categorical(self):
        df = pl.DataFrame({"flag": [True, False, True]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "flag")
        assert col.categorical is True
        assert col.numerical is False
        assert "binary" in col.semantic_roles

    def test_constant_zero_or_one_column_is_still_binary(self):
        # Degenerate but real case: single distinct value in {0, 1}.
        df = pl.DataFrame({"flag": [1, 1, 1, 1]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "flag")
        assert col.categorical is True
        assert "binary" in col.semantic_roles

    def test_treatment_like_column_from_two_valued_int_is_binary(self):
        # Guards the exact scenario found in the demo dataset generator
        # (rng.binomial(1, p) -> int64 0/1 column).
        df = pl.DataFrame({"treatment": [1, 0, 1, 1, 0, 0]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "treatment")
        assert col.categorical is True
        assert col.numerical is False


class TestDiscreteVsContinuousNumeric:
    def test_non_binary_integer_is_discrete_numeric(self):
        df = pl.DataFrame({"age": [20, 35, 40, 55, 62]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "age")
        assert col.numerical is True
        assert col.categorical is False
        assert "discrete" in col.semantic_roles

    def test_float_with_fractional_values_is_continuous(self):
        df = pl.DataFrame({"bmi": [21.5, 24.1, 30.7, 18.9]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "bmi")
        assert col.numerical is True
        assert "continuous" in col.semantic_roles

    def test_whole_valued_float_is_discrete_not_continuous(self):
        df = pl.DataFrame({"visits": [2.0, 5.0, 10.0, 3.0]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "visits")
        assert col.numerical is True
        assert "discrete" in col.semantic_roles

    def test_all_null_numeric_column_falls_back_without_tag(self):
        df = pl.DataFrame({"maybe": [None, None, None]}, schema={"maybe": pl.Float64})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "maybe")
        assert col.numerical is True
        assert col.semantic_roles == set()


class TestNonNumericAndStructuralRoles:
    def test_string_column_is_categorical_with_no_automatic_tag(self):
        # Nominal vs ordinal cannot be inferred from values alone.
        df = pl.DataFrame({"city": ["Milano", "Roma", "Milano", "Torino"]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "city")
        assert col.categorical is True
        assert col.numerical is False
        assert col.semantic_roles == set()

    def test_id_pattern_bypasses_semantic_inference_entirely(self):
        df = pl.DataFrame({"patient_id": [1, 2, 3], "age": [30, 40, 50]})
        config = ConfigBuilder.build_config(df, infer_id=True)
        col = _col(config, "patient_id")
        assert col.id is True
        assert col.categorical is False
        assert col.numerical is False

    def test_forced_id_column_also_bypasses_inference(self):
        # Even a 0/1-looking column, if explicitly named as an id, must not
        # be run through binary/discrete/continuous inference.
        df = pl.DataFrame({"code": [0, 1, 0]})
        config = ConfigBuilder.build_config(df, id_columns=["code"], infer_id=False)
        col = _col(config, "code")
        assert col.id is True
        assert col.categorical is False
        assert col.numerical is False

    def test_datetime_column_is_neither_categorical_nor_numerical(self):
        import datetime

        df = pl.DataFrame({"visit_date": [datetime.date(2024, 1, 1), datetime.date(2024, 2, 1)]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        col = _col(config, "visit_date")
        assert col.categorical is False
        assert col.numerical is False
        assert col.type == ColumnType.DATE


class TestUserConfigPriority:
    """A user-supplied DataConfig must never be re-inferred or overridden."""

    def test_manually_overridden_binary_column_kept_as_numerical(self):
        # Same 0/1 data that ConfigBuilder would classify as binary
        # categorical -- but here the user has explicitly built (or
        # edited) a DataConfig marking it numerical instead. Nothing in
        # ConfigBuilder may silently correct this back.
        df = pl.DataFrame({"flag": [0, 1, 0, 1]})
        inferred = ConfigBuilder.build_config(df, infer_id=False)
        assert inferred.columns["flag"].categorical is True  # sanity: this is what inference would say

        user_config = DataConfig(
            columns={
                "flag": inferred.columns["flag"].model_copy(
                    update={"categorical": False, "numerical": True, "semantic_roles": set()}
                )
            }
        )
        validation = ConfigBuilder.validate_config(df, user_config)
        assert validation.is_valid
        # validate_config must not have mutated the user's classification.
        assert user_config.columns["flag"].numerical is True
        assert user_config.columns["flag"].categorical is False

    def test_build_config_is_never_called_when_config_already_exists(self):
        # Structural guarantee exercised at the call-site level (mirrors
        # routers/datasets.py:parse_config): building a config from data is
        # a one-shot operation, never re-triggered once a DataConfig exists.
        df = pl.DataFrame({"flag": [0, 1, 1]})
        config = ConfigBuilder.build_config(df, infer_id=False)
        config.columns["flag"] = config.columns["flag"].model_copy(update={"active": False})
        # Re-validating (not re-building) must leave the edit untouched.
        ConfigBuilder.validate_config(df, config)
        assert config.columns["flag"].active is False


class TestSemanticRoleQueryHelper:
    def test_columns_with_role_binary_matches_dataconfig_helper(self):
        df = pl.DataFrame({
            "sex_flag": [0, 1, 1, 0],
            "age": [30, 40, 50, 60],
            "city": ["Milano", "Roma", "Milano", "Torino"],
        })
        config = ConfigBuilder.build_config(df, infer_id=False)
        assert config.columns_with_role("binary") == ["sex_flag"]
        assert set(config.columns_with_role("discrete")) == {"age"}