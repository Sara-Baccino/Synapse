"""
Tests for the FastAPI app factory: health check, CORS, and every
domain router mounted and reachable.
"""

from fastapi.testclient import TestClient

from synapse_gui.app import create_app


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_router_is_mounted() -> None:
    client = TestClient(create_app())
    response = client.post("/auth/login", data={})
    assert response.status_code != 404


def test_datasets_router_is_mounted() -> None:
    client = TestClient(create_app())
    response = client.post("/datasets/parse-config", json={"dataset_id": "x"})
    assert response.status_code != 404


def test_matching_router_is_mounted() -> None:
    client = TestClient(create_app())
    response = client.get("/matching/jobs/does-not-exist")
    assert response.status_code != 404 or response.json()["detail"] != "Not Found"


def test_demo_router_is_mounted() -> None:
    client = TestClient(create_app())
    response = client.get("/demo/tools")
    assert response.status_code == 200


def test_cors_headers_present_for_allowed_origin() -> None:
    client = TestClient(create_app())
    response = client.get("/health", headers={"Origin": "http://localhost:5174"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5174"