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
    assert len(body["numerical_correlations"]["variables"]) == 2
    assert body["categorical_correlations"]["variables"] == []


# --------------------------------------------------------------------- #
# Phase 3: config -> imputation -> scaling -> provenance, end-to-end
# --------------------------------------------------------------------- #

def _csv_bytes_with_missing_clinical_score() -> bytes:
    # Every 5th row has a missing clinical_score (empty cell -> one of
    # DataConfig's DEFAULT_MISSING_TOKENS), spread across both treatment
    # groups so imputation is exercised on units that still need matching.
    rows = ["patient_id,age,clinical_score,treatment"]
    for i in range(60):
        age = 40 + i % 20
        treatment = 1 if age > 50 else 0
        clinical_score = "" if i % 5 == 0 else f"{age * 0.5 + i % 5}"
        rows.append(f"{i},{age},{clinical_score},{treatment}")
    return ("\n".join(rows) + "\n").encode("utf-8")


def _explicit_data_config_with_imputation_and_scaling() -> dict:
    # Hand-authored DataConfig (bypasses ConfigBuilder inference entirely,
    # exercising the "user config always wins" path): clinical_score gets
    # mean imputation + standard scaling, both explicitly declared.
    return {
        "patient_id": {"new_name": "patient_id", "id": True, "type": "int"},
        "age": {"new_name": "age", "numerical": True, "semantic_roles": ["discrete"], "type": "int"},
        "clinical_score": {
            "new_name": "clinical_score", "numerical": True, "semantic_roles": ["continuous"],
            "missing_data_management": {"strategy": "impute", "imputer": "mean"},
            "scaling": {"enabled": True, "method": "standard"},
            "type": "float",
        },
        "treatment": {"new_name": "treatment", "categorical": True, "semantic_roles": ["binary"], "type": "int"},
    }


def test_run_applies_configured_imputation_and_scaling_and_registers_provenance(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    upload = client.post(
        "/datasets/upload",
        files={"file": ("patients.csv", io.BytesIO(_csv_bytes_with_missing_clinical_score()), "text/csv")},
        headers=auth_headers,
    )
    dataset_id = upload.json()["dataset_id"]

    parsed = client.post(
        "/datasets/parse-config",
        json={"dataset_id": dataset_id, "existing_config": _explicit_data_config_with_imputation_and_scaling()},
        headers=auth_headers,
    )
    assert parsed.status_code == 200
    assert parsed.json()["validation"]["is_valid"] is True

    run_response = client.post(
        "/matching/run",
        json={"dataset_id": dataset_id, "module_config": _default_module_config()},
        headers=auth_headers,
    )
    assert run_response.status_code == 202
    job_id = run_response.json()["job_id"]
    final_status = _wait_for_completion(client, job_id, auth_headers)
    assert final_status["status"] == "completed"

    result = client.get(f"/matching/jobs/{job_id}/result", headers=auth_headers).json()
    assert result["success"] is True, result.get("error")

    # Provenance: the exact imputation/scaling choice made for
    # clinical_score must be retrievable from the run's own result, not
    # just from the dataset's current (possibly since-changed) DataConfig.
    columns_config = result["config"]["data_config"]["columns"]
    clinical_score_config = next(c for c in columns_config if c["name"] == "clinical_score")
    assert clinical_score_config["missing_data_management"]["strategy"] == "impute"
    assert clinical_score_config["missing_data_management"]["imputer"] == "mean"
    assert clinical_score_config["scaling"]["enabled"] is True
    assert clinical_score_config["scaling"]["method"] == "standard"

    # Effect: imputation must have actually run -- no missing clinical_score
    # left in the matched dataset (previously apply_imputation was hardcoded
    # False, so this would have failed the match entirely on missing values
    # or left nulls in the covariate).
    matched_dataset = next(d for d in result["datasets"] if d["name"] == "matched_dataset")
    clinical_scores = [row["clinical_score"] for row in matched_dataset["preview"]]
    assert None not in clinical_scores
    assert len(clinical_scores) > 0


# --------------------------------------------------------------------- #
# Phase 6: full cross-phase integration -- two datasets -> merge ->
# Mahalanobis + exact-match + propensity score -> persistence & listing
# --------------------------------------------------------------------- #

def _population_csv_bytes(prefix: str, n: int) -> bytes:
    rows = ["subject_id,age,clinical_score,region"]
    regions = ["north", "south"]
    for i in range(n):
        age = 30 + (i % 25)
        # Different period (23 vs age's 25) and only a mild age-linked
        # term, to keep clinical_score from being near-collinear with
        # age -- Mahalanobis needs an invertible covariance matrix.
        score = (i * 7 % 23) + age * 0.2
        region = regions[i % 2]
        rows.append(f"{prefix}{i},{age},{score:.2f},{region}")
    return ("\n".join(rows) + "\n").encode("utf-8")


def test_two_dataset_workflow_with_mahalanobis_exact_match_and_ps_persists_and_lists(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    csv_a = _population_csv_bytes("a", 40)
    csv_b = _population_csv_bytes("b", 40)

    upload_a = client.post("/datasets/upload", files={"file": ("population_a.csv", io.BytesIO(csv_a), "text/csv")}, headers=auth_headers)
    upload_b = client.post("/datasets/upload", files={"file": ("population_b.csv", io.BytesIO(csv_b), "text/csv")}, headers=auth_headers)
    dataset_id_a, dataset_id_b = upload_a.json()["dataset_id"], upload_b.json()["dataset_id"]

    compat = client.post("/datasets/check-compatibility", json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b}, headers=auth_headers)
    assert compat.json()["is_compatible"] is True
    assert set(compat.json()["common_columns"]) == {"age", "clinical_score", "region"}

    merged = client.post(
        "/datasets/merge-populations",
        json={"dataset_id_a": dataset_id_a, "dataset_id_b": dataset_id_b},
        headers=auth_headers,
    )
    merged_dataset_id = merged.json()["dataset_id"]
    assert merged.json()["n_rows"] == 80

    parsed = client.post("/datasets/parse-config", json={"dataset_id": merged_dataset_id}, headers=auth_headers)
    assert parsed.json()["validation"]["is_valid"] is True

    module_config = {
        "population": {"treatment_col": "treatment", "matching_direction": "treated_to_control"},
        "covariates": {"matching_covariates": ["age", "clinical_score"]},
        "representation": {"use_propensity_score": True, "matching_space": "covariates_only"},
        "constraints": {"exact_match_covariates": ["region"]},
        "distance": {"distance_metric": "mahalanobis"},
        "strategy": {"matching_algorithm": "greedy_nn"},
    }
    run_response = client.post("/matching/run", json={"dataset_id": merged_dataset_id, "module_config": module_config}, headers=auth_headers)
    assert run_response.status_code == 202
    job_id = run_response.json()["job_id"]
    final_status = _wait_for_completion(client, job_id, auth_headers)
    assert final_status["status"] == "completed"

    result = client.get(f"/matching/jobs/{job_id}/result", headers=auth_headers).json()
    assert result["success"] is True, result.get("error")
    assert "match_rate" in result["metrics"]

    # Persistence: BasePipeline was given output_folder=RUNS_DIR/{job_id} in
    # Phase 3 -- the run's full AnalysisResult must actually be on disk,
    # not just held in the in-memory JobManager.
    from synapse_gui.routers.matching import RUNS_DIR
    run_folder = RUNS_DIR / job_id
    assert (run_folder / "summary.json").exists()
    assert (run_folder / "manifest.json").exists()

    # Retrieval: the run must show up in the job listing with the exact
    # design choices made above, not defaults or omissions.
    jobs = client.get("/matching/jobs", headers=auth_headers).json()
    job_summary = next(j for j in jobs if j["job_id"] == job_id)
    assert job_summary["dataset_id"] == merged_dataset_id
    assert job_summary["distance_metric"] == "mahalanobis"
    assert job_summary["use_propensity_score"] is True
    assert job_summary["matching_algorithm"] == "greedy_nn"
    assert job_summary["matching_direction"] == "treated_to_control"
    assert "match_rate" in job_summary["metrics"]