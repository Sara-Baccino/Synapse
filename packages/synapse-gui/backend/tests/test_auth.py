"""
Tests for the auth router: login, token verification, rejection of
missing/invalid tokens.
"""

from fastapi.testclient import TestClient


def test_login_with_valid_credentials_returns_token(client: TestClient) -> None:
    response = client.post("/auth/login", data={"username": "demo", "password": "synapse-demo"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_with_invalid_password_returns_401(client: TestClient) -> None:
    response = client.post("/auth/login", data={"username": "demo", "password": "wrong"})
    assert response.status_code == 401


def test_login_with_unknown_username_returns_401(client: TestClient) -> None:
    response = client.post("/auth/login", data={"username": "nobody", "password": "x"})
    assert response.status_code == 401


def test_me_endpoint_with_valid_token_returns_user(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"username": "demo", "full_name": "Synapse Demo User"}


def test_me_endpoint_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401