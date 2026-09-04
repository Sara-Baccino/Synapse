"""
Tests for the public demo router: unauthenticated access, real
MatchingModule execution against the clinical-selection-bias dataset,
visible balance improvement pre/post match.
"""

from fastapi.testclient import TestClient


def test_list_demo_tools_requires_no_auth(client: TestClient) -> None:
    response = client.get("/demo/tools")
    assert response.status_code == 200
    body = response.json()
    assert any(d["name"] == "clinical_selection_bias" for d in body["demo_datasets"])


def test_run_demo_matching_shows_balance_improvement(client: TestClient) -> None:
    response = client.post(
        "/demo/matching/run",
        json={"dataset_name": "clinical_selection_bias", "use_propensity_score": True, "matching_algorithm": "greedy_nn"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["n_observations"] == 400
    assert len(body["balance_table"]) > 0

    age_row = next(row for row in body["balance_table"] if row["variable"] == "age")
    assert abs(age_row["abs_smd_after"]) < abs(age_row["abs_smd_before"])


def test_run_demo_matching_requires_no_auth(client: TestClient) -> None:
    response = client.post("/demo/matching/run", json={"dataset_name": "clinical_selection_bias"})
    assert response.status_code == 200


def test_run_demo_matching_rejects_unknown_dataset(client: TestClient) -> None:
    response = client.post("/demo/matching/run", json={"dataset_name": "not-real"})
    assert response.status_code == 422