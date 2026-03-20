"""Tests for feed subscription endpoints."""


def test_get_feeds_empty(auth):
    """A new user has no feeds."""
    res = auth.get("/api/feeds")
    assert res.status_code == 200
    assert res.get_json() == []


def test_add_feed(auth, mock_fetch):
    """Subscribing to a feed returns the new feed with its items."""
    res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    assert res.status_code == 201

    data = res.get_json()
    assert data["title"] == "Test Feed"
    assert data["url"] == "https://example.com/feed.xml"
    assert len(data["items"]) == 2
    assert data["items"][0]["read"] is False


def test_add_feed_appears_in_list(auth, mock_fetch):
    """A subscribed feed appears in GET /api/feeds."""
    auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    res = auth.get("/api/feeds")
    feeds = res.get_json()
    assert len(feeds) == 1
    assert feeds[0]["title"] == "Test Feed"


def test_add_feed_duplicate(auth, mock_fetch):
    """Subscribing to the same URL twice returns 409."""
    auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    assert res.status_code == 409


def test_add_feed_missing_url(auth):
    """Omitting the URL returns 422."""
    res = auth.post("/api/feeds", json={})
    assert res.status_code == 422


def test_remove_feed(auth, mock_fetch):
    """Unsubscribing removes the feed and its items."""
    add_res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    feed_id = add_res.get_json()["id"]

    res = auth.delete(f"/api/feeds/{feed_id}")
    assert res.status_code == 204

    feeds = auth.get("/api/feeds").get_json()
    assert feeds == []


def test_remove_feed_not_found(auth):
    """Deleting a non-existent feed returns 404."""
    res = auth.delete("/api/feeds/999")
    assert res.status_code == 404


def test_feeds_are_isolated_between_users(app, client, mock_fetch):
    """One user cannot see another user's feeds."""
    from conftest import insert_user
    import server
    insert_user(server.DB_PATH, "alice", "password123")
    insert_user(server.DB_PATH, "bob", "password123")

    # Subscribe as alice.
    client.post("/auth/login", json={"username": "alice", "password": "password123"})
    client.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    client.post("/auth/logout")

    # Log in as bob — should see no feeds.
    client.post("/auth/login", json={"username": "bob", "password": "password123"})
    res = client.get("/api/feeds")
    assert res.get_json() == []


def test_refresh_feed(auth, mock_fetch):
    """Refreshing a feed returns the updated feed object."""
    add_res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    feed_id = add_res.get_json()["id"]

    res = auth.post(f"/api/feeds/{feed_id}/refresh")
    assert res.status_code == 200
    assert res.get_json()["id"] == feed_id


def test_refresh_feed_not_found(auth):
    """Refreshing a non-existent feed returns 404."""
    res = auth.post("/api/feeds/999/refresh")
    assert res.status_code == 404


def test_refresh_does_not_duplicate_items(auth, mock_fetch):
    """Refreshing a feed does not create duplicate items."""
    add_res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    feed_id = add_res.get_json()["id"]
    original_count = len(add_res.get_json()["items"])

    auth.post(f"/api/feeds/{feed_id}/refresh")

    feeds = auth.get("/api/feeds").get_json()
    refreshed = next(f for f in feeds if f["id"] == feed_id)
    assert len(refreshed["items"]) == original_count
