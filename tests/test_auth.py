"""Tests for authentication endpoints."""


def test_register_success(client):
    """A new user can register."""
    res = client.post("/auth/register", json={
        "username": "bob",
        "password": "password123",
    })
    assert res.status_code == 201
    assert res.get_json()["ok"] is True


def test_register_duplicate(client):
    """Registering with a taken username returns 409."""
    client.post("/auth/register", json={"username": "bob", "password": "password123"})
    res = client.post("/auth/register", json={"username": "bob", "password": "password123"})
    assert res.status_code == 409


def test_register_missing_fields(client):
    """Omitting username or password returns 422."""
    res = client.post("/auth/register", json={"username": "bob"})
    assert res.status_code == 422

    res = client.post("/auth/register", json={"password": "password123"})
    assert res.status_code == 422


def test_register_short_password(client):
    """Passwords shorter than 8 characters are rejected."""
    res = client.post("/auth/register", json={"username": "bob", "password": "short"})
    assert res.status_code == 422


def test_login_success(client):
    """A registered user can log in."""
    client.post("/auth/register", json={"username": "bob", "password": "password123"})
    res = client.post("/auth/login", json={"username": "bob", "password": "password123"})
    assert res.status_code == 200
    assert res.get_json()["ok"] is True


def test_login_wrong_password(client):
    """A wrong password returns 401."""
    client.post("/auth/register", json={"username": "bob", "password": "password123"})
    res = client.post("/auth/login", json={"username": "bob", "password": "wrongpassword"})
    assert res.status_code == 401


def test_login_unknown_user(client):
    """An unknown username returns 401."""
    res = client.post("/auth/login", json={"username": "nobody", "password": "password123"})
    assert res.status_code == 401


def test_logout(auth):
    """A logged-in user can log out, after which the API rejects their requests."""
    res = auth.post("/auth/logout")
    assert res.status_code == 200

    res = auth.get("/api/feeds")
    assert res.status_code == 401


def test_protected_route_requires_login(client):
    """API routes return 401 when not logged in."""
    assert client.get("/api/feeds").status_code == 401
    assert client.post("/api/feeds", json={"url": "https://example.com/feed"}).status_code == 401
    assert client.delete("/api/feeds/1").status_code == 401
    assert client.patch("/api/items/1", json={"read": True}).status_code == 401
