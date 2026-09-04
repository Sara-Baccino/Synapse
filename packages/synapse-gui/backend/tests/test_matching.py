"""
End-to-end test of the matching router: upload -> parse-config -> run
-> poll -> result -> download -> report, using a small deterministic
dataset with a real treatment column.
"""

import io
import time

from fastapi.testclient import TestClient


def _synthetic_csv_bytes() -> bytes:
    rows = ["patient_id,age,clinical_score,treatment"]
    for i in range(60):
        age = 40 + i % 20
        treatment = 1 if age > 50 else 0
        rows.append(f"{i},{age},{age * 0.5 + i % 5},{treatment}")
    return ("\n".join(rows) + "\n").encode("utf-8")


def _upload_and_configure(client: TestClient, auth_headers: dict[str, str]) -> str:
    upload = client.post("/datasets/upload", files={"file": ("patients.csv", io.BytesIO(_synthetic_csv_bytes()), "text/csv")}, headers=auth_headers)
    dataset_id = upload.json()["dataset_id"]
    config_response = client.post("/datasets/parse-config", json={"dataset_id": dataset_id}, headers=auth_headers)
    assert config_response.json()["validation"]["is_valid"] is True
    return dataset_id


def _wait_for_completion(client: TestClient, job_id: str, auth_headers: dict[str, str], timeout_seconds: float = 15.0) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        status_response = client.get(f"/matching/jobs/{job_id}", headers=auth_headers)
        body = status_response.json()
        if body["status"] in ("completed", "failed"):
            return body
        time.sleep(0.1)
    raise TimeoutError(f"Job '{job_id}' did not finish within {timeout_seconds}s")


def _default_module_config() -> dict:
    return {
        "population": {"treatment_col": "treatment"},
        "covariates": {"matching_covariates": ["age", "clinical_score"]},
    }


def test_full_matching_run_produces_matched_dataset_and_balance(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload_and_configure(client, auth_headers)

    run_response = client.post(
        "/matching/run",
        json={"dataset_id": dataset_id, "module_config": _default_module_config()},
        headers=auth_headers,
    )
    assert run_response.status_code == 202
    job_id = run_response.json()["job_id"]

    final_status = _wait_for_completion(client, job_id, auth_headers)
    assert final_status["status"] == "completed"

    result_response = client.get(f"/matching/jobs/{job_id}/result", headers=auth_headers)
    assert result_response.status_code == 200
    body = result_response.json()
    assert body["success"] is True
    assert "match_rate" in body["metrics"]

    dataset_names = {d["name"] for d in body["datasets"]}
    assert "matched_dataset" in dataset_names

    table_names = {t["name"] for t in body["tables"]}
    assert "balance_table" in table_names


def test_run_returns_422_for_invalid_module_config(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload_and_configure(client, auth_headers)
    response = client.post(
        "/matching/run",
        json={"dataset_id": dataset_id, "module_config": {"population": {"treatment_col": "treatment"}}},  # missing required covariates
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_run_returns_404_for_unknown_dataset(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post(
        "/matching/run",
        json={"dataset_id": "does-not-exist", "module_config": _default_module_config()},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_download_matched_dataset_returns_csv(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload_and_configure(client, auth_headers)
    run_response = client.post("/matching/run", json={"dataset_id": dataset_id, "module_config": _default_module_config()}, headers=auth_headers)
    job_id = run_response.json()["job_id"]
    _wait_for_completion(client, job_id, auth_headers)

    response = client.get(f"/matching/jobs/{job_id}/download/datasets/matched_dataset", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")


def test_download_report_returns_pdf(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload_and_configure(client, auth_headers)
    run_response = client.post("/matching/run", json={"dataset_id": dataset_id, "module_config": _default_module_config()}, headers=auth_headers)
    job_id = run_response.json()["job_id"]
    _wait_for_completion(client, job_id, auth_headers)

    response = client.get(f"/matching/jobs/{job_id}/report", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_matching_endpoints_require_authentication(client: TestClient) -> None:
    response = client.post("/matching/run", json={"dataset_id": "x", "module_config": {}})
    assert response.status_code == 401


def test_explore_population_returns_profile(client: TestClient, auth_headers: dict[str, str]) -> None:
    dataset_id = _upload_and_configure(client, auth_headers)
    response = client.post(
        "/matching/explore",
        json={"dataset_id": dataset_id, "treatment_col": "treatment", "matching_covariates": ["age", "clinical_score"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["descriptive_stats"]) == 4  # 2 covariates x 2 groups
    assert len(body["numeric_distributions"]) == 2
    assert len(body["correlations"]["variables"]) == 2