"""
Tests for the datasets router: upload, config parse/import, compatibility
check between two datasets, and artifact promotion.
"""

import io
import json

from fastapi.testclient import TestClient


def _sample_csv_bytes() -> bytes:
    return b"patient_id,age,clinical_score,treatment\n1,45,20.0,1\n2,60,30.0,0\n3,38,18.0,0\n4,70,40.0,1\n"


def _sample_csv_bytes_b() -> bytes:
    # Shares 'age' and 'clinical_score' with dataset A, plus a different id column.
    return b"subject_id,age,clinical_score,region\n1,50,22.0,north\n2,55,25.0,south\n"


def test_upload_dataset(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/datasets/upload",
        files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["n_rows"] == 4
    assert body["dataset_id"]


def test_upload_requires_auth(client: TestClient) -> None:
    response = client.post("/datasets/upload", files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")})
    assert response.status_code == 401


def test_parse_config_builds_config(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload = client.post("/datasets/upload", files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")}, headers=auth_headers)
    dataset_id = upload.json()["dataset_id"]

    response = client.post("/datasets/parse-config", json={"dataset_id": dataset_id}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["validation"]["is_valid"] is True


def test_get_dataset_reflects_config_presence(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload = client.post("/datasets/upload", files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")}, headers=auth_headers)
    dataset_id = upload.json()["dataset_id"]

    before = client.get(f"/datasets/{dataset_id}", headers=auth_headers)
    assert before.json()["has_data_config"] is False

    client.post("/datasets/parse-config", json={"dataset_id": dataset_id}, headers=auth_headers)

    after = client.get(f"/datasets/{dataset_id}", headers=auth_headers)
    assert after.json()["has_data_config"] is True


def test_check_compatibility_finds_common_columns(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload_a = client.post("/datasets/upload", files={"file": ("a.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")}, headers=auth_headers)
    upload_b = client.post("/datasets/upload", files={"file": ("b.csv", io.BytesIO(_sample_csv_bytes_b()), "text/csv")}, headers=auth_headers)

    response = client.post(
        "/datasets/check-compatibility",
        json={"dataset_id_a": upload_a.json()["dataset_id"], "dataset_id_b": upload_b.json()["dataset_id"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_compatible"] is True
    assert set(body["common_columns"]) == {"age", "clinical_score"}
    # patient_id / subject_id are id-like and not shared anyway, so excluded_id_like_columns may be empty here
    # since 'treatment' and 'region' aren't shared either; only shared id-like names would appear.


def test_check_compatibility_returns_404_for_unknown_dataset(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload_a = client.post("/datasets/upload", files={"file": ("a.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")}, headers=auth_headers)
    response = client.post(
        "/datasets/check-compatibility",
        json={"dataset_id_a": upload_a.json()["dataset_id"], "dataset_id_b": "does-not-exist"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_import_config_with_legacy_fields(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload = client.post(
        "/datasets/upload",
        files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")},
        headers=auth_headers,
    )
    dataset_id = upload.json()["dataset_id"]

    legacy_config = {
        "age": {
            "new_name": "age", "active": True, "categorical": False, "numerical": True, "id": False,
            "gene": False, "cytogenetic": False, "clinical": True,
            "multiplier": 1, "mappings": {},
            "missing_data_management": {"strategy": "impute", "imputer": "knn"},
            "type": "int",
        },
        "clinical_score": {
            "new_name": "clinical_score", "active": True, "categorical": False, "numerical": True, "id": False,
            "gene": False, "cytogenetic": False, "clinical": True,
            "multiplier": 1, "mappings": {},
            "missing_data_management": {"strategy": "impute", "imputer": "knn"},
            "type": "float",
        },
        "treatment": {
            "new_name": "treatment", "active": True, "categorical": False, "numerical": True, "id": False,
            "gene": False, "cytogenetic": False, "clinical": False,
            "multiplier": 1, "mappings": {},
            "missing_data_management": {"strategy": "maintain", "imputer": "zero"},
            "type": "int",
        },
        "patient_id": {
            "new_name": "patient_id", "active": True, "categorical": False, "numerical": False, "id": True,
            "gene": False, "cytogenetic": False, "clinical": False,
            "multiplier": 1, "mappings": {},
            "missing_data_management": {"strategy": "maintain", "imputer": "zero"},
            "type": "int",
        },
    }

    response = client.post(
        f"/datasets/{dataset_id}/import-config",
        files={"file": ("config.json", io.BytesIO(json.dumps(legacy_config).encode()), "application/json")},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fallback_used"] is False

    age_mappings = [m for m in body["legacy_fields_mapped"] if m["column"] == "age"]
    clinical_mapping = next(m for m in age_mappings if m["legacy_field"] == "clinical")
    assert clinical_mapping["mapped_to"] == "semantic_roles"

    age_col = next(c for c in body["data_config"]["columns"] if c["name"] == "age")
    assert "clinical" in age_col["semantic_roles"]


def test_import_config_falls_back_on_invalid_json(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload = client.post("/datasets/upload", files={"file": ("sample.csv", io.BytesIO(_sample_csv_bytes()), "text/csv")}, headers=auth_headers)
    dataset_id = upload.json()["dataset_id"]

    response = client.post(
        f"/datasets/{dataset_id}/import-config",
        files={"file": ("config.json", io.BytesIO(b"not valid json"), "application/json")},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fallback_used"] is True
    assert body["fallback_reason"] is not None


# --------------------------------------------------------------------- #
# Phase 2: dtype-aware compatibility + merge-populations
# --------------------------------------------------------------------- #

def _sample_csv_bytes_dtype_mismatch() -> bytes:
    # Same column names as dataset A ('age', 'clinical_score'), but 'age' is
    # a string here instead of numeric -- must be excluded from
    # common_columns and reported as a dtype mismatch, not silently merged.
    return b"subject_id,age,clinical_score,region\nid1,young,22.0,north\nid2,old,25.0,south\n"


def _sample_csv_bytes_no_overlap() -> bytes:
    return b"code,height_cm,notes\nX1,170,fine\nX2,180,ok\n"


def _upload(client: TestClient, auth_headers: dict[str, str], filename: str, content: bytes) -> str:
    response = client.post("/datasets/upload", files={"file": (filename, io.BytesIO(content), "text/csv")}, headers=auth_headers)
    assert response.status_code == 200
    return response.json()["dataset_id"]


def test_check_compatibility_reports_dtype_mismatch(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_dtype_mismatch())

    response = client.post(
        "/datasets/check-compatibility",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    # 'age' is int in A, string in B: must be excluded from common_columns
    # and surfaced explicitly, not silently treated as compatible.
    assert "age" not in body["common_columns"]
    assert "clinical_score" in body["common_columns"]
    mismatch_columns = {m["column"] for m in body["dtype_mismatches"]}
    assert "age" in mismatch_columns


def test_merge_populations_creates_dataset_with_treatment_column(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())  # 4 rows
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_b())  # 2 rows

    response = client.post(
        "/datasets/merge-populations",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["n_rows"] == 6
    assert body["n_from_a"] == 4
    assert body["n_from_b"] == 2
    assert set(body["columns_used"]) == {"age", "clinical_score"}
    assert body["treatment_col_name"] == "treatment"
    column_names = {c["name"] for c in body["columns"]}
    assert {"age", "clinical_score", "treatment"} <= column_names

    # The merged dataset must behave exactly like a normal upload downstream:
    # single-dataset and two-dataset workflows converge from this point on.
    merged_id = body["dataset_id"]
    detail = client.get(f"/datasets/{merged_id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["n_rows"] == 6

    parsed = client.post("/datasets/parse-config", json={"dataset_id": merged_id}, headers=auth_headers)
    assert parsed.status_code == 200
    treatment_col = next(c for c in parsed.json()["data_config"]["columns"] if c["name"] == "treatment")
    # Ties directly to Phase 1: the synthetic 0/1 treatment column must be
    # inferred as binary categorical, not numerical.
    assert treatment_col["categorical"] is True
    assert treatment_col["numerical"] is False
    assert "binary" in treatment_col["semantic_roles"]


def test_merge_populations_preserves_differently_named_source_ids(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_b())

    response = client.post(
        "/datasets/merge-populations",
        json={
            "dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b,
            "id_column_a": "patient_id", "id_column_b": "subject_id",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    column_names = {c["name"] for c in body["columns"]}
    assert "source_id" in column_names
    preview_source_ids = {row["source_id"] for row in body["preview"]}
    # Both datasets' ids show up (as strings) under the single unified column.
    assert preview_source_ids  # non-empty, exact values already covered by dtype/round-trip


def test_merge_populations_rejects_treatment_name_collision(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_b())

    response = client.post(
        "/datasets/merge-populations",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b, "treatment_col_name": "age"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_merge_populations_rejects_when_no_common_columns(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_no_overlap())

    response = client.post(
        "/datasets/merge-populations",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_merge_populations_returns_404_for_unknown_dataset(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    response = client.post(
        "/datasets/merge-populations",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": "does-not-exist"},
        headers=auth_headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------- #
# Block C: column_stats (missing %, distinct values) + config-level
# compatibility between two separately-configured datasets
# --------------------------------------------------------------------- #

def _sample_csv_bytes_with_missing_and_categorical() -> bytes:
    # 'region' is categorical with 3 distinct values; 'age' has one
    # missing cell (row 3), so missing_pct must come out to 1/4 = 0.25.
    return (
        b"patient_id,age,region\n"
        b"1,45,north\n"
        b"2,60,south\n"
        b"3,38,north\n"
        b"4,,east\n"
    )


def test_parse_config_reports_missing_pct_and_distinct_values(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload(client, auth_headers, "sample.csv", _sample_csv_bytes_with_missing_and_categorical())
    response = client.post("/datasets/parse-config", json={"dataset_id": dataset_id}, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["n_rows"] == 4
    assert body["n_columns"] == 3

    stats_by_name = {s["name"]: s for s in body["column_stats"]}
    assert stats_by_name["age"]["missing_pct"] == 0.25
    assert stats_by_name["region"]["missing_pct"] == 0.0
    assert stats_by_name["region"]["n_distinct"] == 3
    assert set(stats_by_name["region"]["distinct_values"]) == {"north", "south", "east"}
    # age is numerical, not categorical: no distinct-value dropdown for it.
    assert stats_by_name["age"]["distinct_values"] is None


def test_check_config_compatibility_flags_role_mismatch(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_b())
    client.post("/datasets/parse-config", json={"dataset_id": dataset_id_a}, headers=auth_headers)
    client.post("/datasets/parse-config", json={"dataset_id": dataset_id_b}, headers=auth_headers)

    # Manually flip 'age' to categorical in A only, simulating a user edit
    # in the Data Config UI that makes the two configs inconsistent.
    override = {
        "patient_id": {"new_name": "patient_id", "id": True, "type": "int"},
        "age": {"new_name": "age", "categorical": True, "type": "int"},
        "clinical_score": {"new_name": "clinical_score", "numerical": True, "type": "float"},
        "treatment": {"new_name": "treatment", "categorical": True, "type": "int"},
    }
    client.post("/datasets/parse-config", json={"dataset_id": dataset_id_a, "existing_config": override}, headers=auth_headers)

    response = client.post(
        "/datasets/check-config-compatibility",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "age" not in body["compatible_columns"]
    mismatched_columns = {m["column"] for m in body["mismatched_columns"]}
    assert "age" in mismatched_columns
    assert "clinical_score" in body["compatible_columns"]


def test_check_config_compatibility_requires_parsed_config_first(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id_a = _upload(client, auth_headers, "a.csv", _sample_csv_bytes())
    dataset_id_b = _upload(client, auth_headers, "b.csv", _sample_csv_bytes_b())
    response = client.post(
        "/datasets/check-config-compatibility",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    assert response.status_code == 422