"""
Tests for Preprocessing.run, focused on the missing-token normalization
step. Regression coverage for the bug found while validating Phase 3:
comparing an already-numeric column (with native Polars nulls) against a
list of string missing-tokens used to raise a dtype error whenever a
non-MAINTAIN strategy was configured for that column.
"""

import polars as pl
import pytest

from synapse_core.dataset.preprocessing import Preprocessing
from synapse_core.models.column_info import ColumnInfo
from synapse_core.models.data_config import DataConfig


def _config(**columns: ColumnInfo) -> DataConfig:
    return DataConfig(columns=columns)


class TestMissingTokenNormalizationOnNumericColumns:
    def test_impute_strategy_on_numeric_column_with_native_nulls_does_not_raise(self):
        # clinical_score already has a native null (from an empty CSV
        # cell), not the literal string "" -- this used to crash.
        df = pl.DataFrame({"clinical_score": [1.5, None, 3.2]})
        config = _config(
            clinical_score=ColumnInfo(
                new_name="clinical_score", numerical=True,
                missing_data_management={"strategy": "impute", "imputer": "mean"},
                type="float",
            )
        )
        result = Preprocessing.run(df, config)
        assert result["clinical_score"].null_count() == 1  # untouched, still null pre-imputation

    def test_drop_strategy_on_numeric_column_still_drops_null_rows(self):
        df = pl.DataFrame({"age": [30, None, 50]})
        config = _config(age=ColumnInfo(new_name="age", numerical=True, missing_data_management={"strategy": "drop"}, type="int"))
        result = Preprocessing.run(df, config)
        assert result.height == 2

    def test_replace_strategy_on_numeric_column_fills_native_nulls(self):
        df = pl.DataFrame({"age": [30, None, 50]})
        config = _config(
            age=ColumnInfo(new_name="age", numerical=True, missing_data_management={"strategy": "replace", "value": 0}, type="int")
        )
        result = Preprocessing.run(df, config)
        assert result["age"].to_list() == [30, 0, 50]


class TestMissingTokenNormalizationOnStringColumns:
    def test_impute_strategy_on_string_column_still_normalizes_literal_tokens(self):
        # Regression guard: the fix must not disable normalization for the
        # case it's actually meant for (a string column with real token
        # placeholders like "NA").
        df = pl.DataFrame({"city": ["Milano", "NA", "Roma", ""]})
        config = _config(
            city=ColumnInfo(
                new_name="city", categorical=True,
                missing_data_management={"strategy": "impute", "imputer": "most_frequent"},
                type="string",
            )
        )
        result = Preprocessing.run(df, config)
        assert result["city"].null_count() == 2  # "NA" and "" both normalized to null

    def test_maintain_strategy_leaves_tokens_untouched(self):
        df = pl.DataFrame({"city": ["Milano", "NA", "Roma"]})
        config = _config(city=ColumnInfo(new_name="city", categorical=True, type="string"))  # default strategy = maintain
        result = Preprocessing.run(df, config)
        assert result["city"].null_count() == 0
        assert result["city"].to_list() == ["Milano", "NA", "Roma"]


class TestFullPreprocessingPipelineDoesNotCrashWithMixedStrategies:
    def test_multiple_columns_with_different_strategies_and_dtypes(self):
        df = pl.DataFrame({
            "patient_id": [1, 2, 3, 4],
            "age": [30, 40, None, 60],
            "city": ["Milano", "NA", "Roma", "Torino"],
        })
        config = _config(
            patient_id=ColumnInfo(new_name="patient_id", id=True, type="int"),
            age=ColumnInfo(new_name="age", numerical=True, missing_data_management={"strategy": "impute", "imputer": "median"}, type="int"),
            city=ColumnInfo(new_name="city", categorical=True, missing_data_management={"strategy": "impute", "imputer": "most_frequent"}, type="string"),
        )
        result = Preprocessing.run(df, config)
        assert result.height == 4
        assert result["age"].null_count() == 1  # Preprocessing itself never imputes, only Imputation does
        assert result["city"].null_count() == 1