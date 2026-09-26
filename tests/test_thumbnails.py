"""Tests for og:image thumbnail lookup."""

import sqlite3

import pytest

import server
from conftest import insert_user


@pytest.fixture()
def feed_with_items(auth, mock_fetch):
    """Subscribe to the mock feed and return (client, item_ids)."""
    res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    return auth, [item["id"] for item in res.get_json()["items"]]


def test_og_image_parser_finds_image():
    """The parser picks up the og:image meta tag."""
    parser = server._OGImageParser()
    parser.feed(
        '<html><head><meta property="og:title" content="x">'
        '<meta property="og:image" content=" https://cdn.example.com/a.jpg ">'
        "</head></html>"
    )
    assert parser.image == "https://cdn.example.com/a.jpg"


def test_og_image_parser_no_image():
    """The parser returns None when there is no og:image tag."""
    parser = server._OGImageParser()
    parser.feed("<html><head><title>No image</title></head></html>")
    assert parser.image is None


def test_fetch_og_image_rejects_non_http():
    """Non-http(s) links are never fetched."""
    assert server.fetch_og_image("file:///etc/passwd") == ""


def test_thumbnail_redirects_and_caches(feed_with_items, monkeypatch):
    """The first request looks up og:image; later requests use the cached value."""
    client, item_ids = feed_with_items
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return "https://cdn.example.com/a.jpg"

    monkeypatch.setattr(server, "fetch_og_image", fake_fetch)

    for _ in range(2):
        res = client.get(f"/api/items/{item_ids[0]}/thumbnail")
        assert res.status_code == 302
        assert res.headers["Location"] == "https://cdn.example.com/a.jpg"
    assert len(calls) == 1


def test_thumbnail_missing_is_cached(feed_with_items, monkeypatch):
    """A page without og:image returns 404 and is not fetched again."""
    client, item_ids = feed_with_items
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return ""

    monkeypatch.setattr(server, "fetch_og_image", fake_fetch)

    for _ in range(2):
        res = client.get(f"/api/items/{item_ids[0]}/thumbnail")
        assert res.status_code == 404
    assert len(calls) == 1


def test_thumbnail_other_users_item(feed_with_items, app):
    """Another user's items are not accessible."""
    client, item_ids = feed_with_items
    insert_user(server.DB_PATH, "bob", "password123")
    client.post("/auth/logout")
    client.post("/auth/login", json={"username": "bob", "password": "password123"})
    res = client.get(f"/api/items/{item_ids[0]}/thumbnail")
    assert res.status_code == 404


def test_thumbnail_requires_login(client):
    """Unauthenticated requests are rejected."""
    assert client.get("/api/items/1/thumbnail").status_code == 401


def test_migrate_adds_thumbnail_column(tmp_path):
    """Databases created before the thumbnail column get it added."""
    db = sqlite3.connect(tmp_path / "old.db")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT)")
    server._migrate(db)
    columns = {row["name"] for row in db.execute("PRAGMA table_info(items)")}
    assert "thumbnail" in columns
