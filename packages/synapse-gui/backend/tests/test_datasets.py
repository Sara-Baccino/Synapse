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