"""Tests for item read-status endpoints."""

import pytest


@pytest.fixture()
def feed_with_items(auth, mock_fetch):
    """Subscribe to the mock feed and return (client, feed_id, item_ids)."""
    res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    feed = res.get_json()
    item_ids = [item["id"] for item in feed["items"]]
    return auth, feed["id"], item_ids


def test_mark_item_read(feed_with_items):
    """An item can be marked as read."""
    client, _, item_ids = feed_with_items
    res = client.patch(f"/api/items/{item_ids[0]}", json={"read": True})
    assert res.status_code == 204

    feeds = client.get("/api/feeds").get_json()
    item = next(i for i in feeds[0]["items"] if i["id"] == item_ids[0])
    assert item["read"] is True


def test_mark_item_unread(feed_with_items):
    """An item can be toggled back to unread."""
    client, _, item_ids = feed_with_items
    client.patch(f"/api/items/{item_ids[0]}", json={"read": True})

    res = client.patch(f"/api/items/{item_ids[0]}", json={"read": False})
    assert res.status_code == 204

    feeds = client.get("/api/feeds").get_json()
    item = next(i for i in feeds[0]["items"] if i["id"] == item_ids[0])
    assert item["read"] is False


def test_items_start_unread(feed_with_items):
    """All items are unread when a feed is first subscribed."""
    client, _, item_ids = feed_with_items
    feeds = client.get("/api/feeds").get_json()
    assert all(not item["read"] for item in feeds[0]["items"])


def test_mark_item_missing_field(feed_with_items):
    """Omitting the read field returns 422."""
    client, _, item_ids = feed_with_items
    res = client.patch(f"/api/items/{item_ids[0]}", json={})
    assert res.status_code == 422


def test_mark_item_not_found(auth):
    """Marking a non-existent item returns 404."""
    res = auth.patch("/api/items/999", json={"read": True})
    assert res.status_code == 404


def test_cannot_mark_another_users_item(client, mock_fetch):
    """A user cannot update read status on another user's items."""
    # Alice subscribes and gets an item id.
    client.post("/auth/register", json={"username": "alice", "password": "password123"})
    client.post("/auth/login", json={"username": "alice", "password": "password123"})
    res = client.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    alice_item_id = res.get_json()["items"][0]["id"]
    client.post("/auth/logout")

    # Bob tries to mark Alice's item as read.
    client.post("/auth/register", json={"username": "bob", "password": "password123"})
    client.post("/auth/login", json={"username": "bob", "password": "password123"})
    res = client.patch(f"/api/items/{alice_item_id}", json={"read": True})
    assert res.status_code == 404
