"""
Tests for the Projects CRUD endpoints (Block A: pre-workspace "All
Projects" landing page). project_store is a process-wide singleton (same
pattern as dataset_store/job_manager), so these tests assert presence of
the specific project they created rather than exact list contents/length,
to stay robust regardless of what else ran earlier in the same session.
"""

from fastapi.testclient import TestClient


def test_create_and_list_project(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post("/projects", json={"name": "IVI RNA"}, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "IVI RNA"
    assert body["created_by"]  # populated from the authenticated user, not empty
    assert body["n_datasets"] == 0
    assert body["n_jobs"] == 0

    listed = client.get("/projects", headers=auth_headers).json()
    assert any(p["project_id"] == body["project_id"] for p in listed)


def test_create_project_rejects_empty_name(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.post("/projects", json={"name": "   "}, headers=auth_headers)
    assert response.status_code == 422


def test_rename_project(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/projects", json={"name": "Lampertico"}, headers=auth_headers).json()
    renamed = client.patch(f"/projects/{created['project_id']}", json={"name": "Lampertico v2"}, headers=auth_headers)
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Lampertico v2"

    listed = client.get("/projects", headers=auth_headers).json()
    match = next(p for p in listed if p["project_id"] == created["project_id"])
    assert match["name"] == "Lampertico v2"


def test_rename_unknown_project_returns_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.patch("/projects/does-not-exist", json={"name": "x"}, headers=auth_headers)
    assert response.status_code == 404


def test_delete_project(client: TestClient, auth_headers: dict[str, str]) -> None:
    created = client.post("/projects", json={"name": "Cariplo"}, headers=auth_headers).json()
    deleted = client.delete(f"/projects/{created['project_id']}", headers=auth_headers)
    assert deleted.status_code == 200

    listed = client.get("/projects", headers=auth_headers).json()
    assert all(p["project_id"] != created["project_id"] for p in listed)


def test_delete_unknown_project_returns_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.delete("/projects/does-not-exist", headers=auth_headers)
    assert response.status_code == 404


def test_projects_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/projects").status_code == 401
    assert client.post("/projects", json={"name": "x"}).status_code == 401