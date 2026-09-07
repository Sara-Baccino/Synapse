"""
Tests for ColumnInfo._check_role_consistency: the schema-level guards that
keep a column's declared semantic role consistent with what preprocessing
is allowed to do to it. These are independent of ConfigBuilder's inference
(see test_config_builder.py) -- they apply just as much to a hand-authored
or user-uploaded DataConfig.
"""

import pytest
from pydantic import ValidationError

from synapse_core.models.column_info import ColumnInfo, EncodingConfig, ScalingConfig


def test_categorical_and_numerical_together_is_rejected():
    with pytest.raises(ValidationError):
        ColumnInfo(new_name="x", categorical=True, numerical=True)


def test_id_column_cannot_be_scaled():
    with pytest.raises(ValidationError):
        ColumnInfo(new_name="patient_id", id=True, scaling=ScalingConfig(enabled=True, method="standard"))


def test_id_column_cannot_be_encoded():
    with pytest.raises(ValidationError):
        ColumnInfo(new_name="patient_id", id=True, encoding=EncodingConfig(enabled=True, method="one_hot"))


def test_encoding_enabled_on_non_categorical_is_rejected():
    with pytest.raises(ValidationError):
        ColumnInfo(new_name="age", numerical=True, encoding=EncodingConfig(enabled=True, method="one_hot"))


def test_scaling_enabled_on_categorical_is_rejected():
    # The concrete case this guards against: a 0/1 column correctly
    # classified as binary categorical (per ConfigBuilder's Phase 1 fix)
    # must not be scalable as if it were a continuous measurement, even
    # though its physical dtype is numeric.
    with pytest.raises(ValidationError):
        ColumnInfo(new_name="sex_flag", categorical=True, scaling=ScalingConfig(enabled=True, method="standard"))


def test_scaling_enabled_on_numerical_is_allowed():
    column = ColumnInfo(new_name="age", numerical=True, scaling=ScalingConfig(enabled=True, method="standard"))
    assert column.scaling.enabled is True


def test_encoding_enabled_on_categorical_is_allowed():
    column = ColumnInfo(new_name="city", categorical=True, encoding=EncodingConfig(enabled=True, method="one_hot"))
    assert column.encoding.enabled is True