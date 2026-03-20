"""Shared pytest fixtures for Efty tests."""

import sqlite3
import pytest

import server


SCHEMA = open("schema.sql").read()

RSS_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <guid>https://example.com/post-1</guid>
      <title>Post One</title>
      <link>https://example.com/post-1</link>
      <pubDate>Wed, 18 Mar 2026 12:00:00 +0000</pubDate>
      <description>Summary of post one.</description>
    </item>
    <item>
      <guid>https://example.com/post-2</guid>
      <title>Post Two</title>
      <link>https://example.com/post-2</link>
      <pubDate>Thu, 19 Mar 2026 12:00:00 +0000</pubDate>
      <description>Summary of post two.</description>
    </item>
  </channel>
</rss>"""


@pytest.fixture()
def app(tmp_path):
    """Flask app configured with a temporary in-memory-style SQLite database."""
    db_path = str(tmp_path / "test.db")
    server.app.config["TESTING"] = True
    server.app.config["SECRET_KEY"] = "test-secret"
    server.DB_PATH = db_path

    with server.app.app_context():
        db = sqlite3.connect(db_path)
        db.executescript(SCHEMA)
        db.commit()
        db.close()

    yield server.app

    server.DB_PATH = None


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture()
def auth(client):
    """Helper that registers and logs in a test user, returning the client."""
    client.post("/auth/register", json={
        "username": "alice",
        "password": "password123",
    })
    client.post("/auth/login", json={
        "username": "alice",
        "password": "password123",
    })
    return client


@pytest.fixture()
def mock_fetch(monkeypatch):
    """Monkeypatch fetch_and_parse to return a canned feed without HTTP."""
    def _fake_fetch(url):
        import feedparser
        parsed = feedparser.parse(RSS_FEED)
        title = parsed.feed.get("title") or url
        items = []
        for entry in parsed.entries:
            items.append({
                "guid": entry.get("id") or entry.get("link") or "",
                "title": entry.get("title") or "Untitled",
                "link": entry.get("link", ""),
                "date": entry.get("published") or "",
                "summary": entry.get("summary", "")[:200],
                "content": entry.get("summary", ""),
            })
        return title, items

    monkeypatch.setattr(server, "fetch_and_parse", _fake_fetch)
