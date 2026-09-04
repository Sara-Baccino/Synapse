"""
Shared pytest fixtures for synapse-gui backend tests.
"""

import pytest
from fastapi.testclient import TestClient

from synapse_gui.app import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/auth/login", data={"username": "demo", "password": "synapse-demo"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}