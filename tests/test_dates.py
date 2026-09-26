"""Tests for item date normalization and ordering."""

import sqlite3
import time

import server


def test_iso_date_rfc822():
    """RSS-style dates are converted to UTC ISO 8601."""
    assert (
        server._iso_date("Wed, 18 Mar 2026 14:00:00 +0200")
        == "2026-03-18T12:00:00+00:00"
    )


def test_iso_date_iso8601():
    """Atom-style dates are normalized to UTC."""
    assert server._iso_date("2026-03-18T12:00:00Z") == "2026-03-18T12:00:00+00:00"
    assert (
        server._iso_date("2026-03-18T07:00:00-05:00") == "2026-03-18T12:00:00+00:00"
    )


def test_iso_date_struct_time():
    """feedparser's parsed struct_time values are converted."""
    parsed = time.strptime("2026-03-18 12:00:00", "%Y-%m-%d %H:%M:%S")
    assert server._iso_date(parsed) == "2026-03-18T12:00:00+00:00"


def test_iso_date_missing_or_unparseable():
    """Missing or unparseable dates become an empty string."""
    assert server._iso_date(None) == ""
    assert server._iso_date("") == ""
    assert server._iso_date("sometime last week") == ""


def test_items_listed_newest_first(auth, mock_fetch):
    """Items come back newest first, even when weekday names sort the other way."""
    # The mock feed's Post One is "Wed, 18 Mar", Post Two "Thu, 19 Mar".
    auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    items = auth.get("/api/feeds").get_json()[0]["items"]
    assert [i["title"] for i in items] == ["Post Two", "Post One"]
    assert items[0]["date"] == "2026-03-19T12:00:00+00:00"


def test_migrate_normalizes_existing_dates(tmp_path):
    """Raw dates stored by older versions are converted once."""
    db = sqlite3.connect(tmp_path / "old.db")
    db.row_factory = sqlite3.Row
    db.executescript(open("schema.sql").read())
    db.execute("INSERT INTO users (username, password_hash) VALUES ('u', 'x')")
    db.execute("INSERT INTO feeds (user_id, url, title) VALUES (1, 'u', 't')")
    db.executemany(
        "INSERT INTO items (feed_id, guid, title, date) VALUES (1, ?, ?, ?)",
        [
            ("a", "a", "Wed, 18 Mar 2026 12:00:00 +0000"),
            ("b", "b", "not a date"),
            ("c", "c", ""),
        ],
    )

    server._migrate(db)

    dates = [r["date"] for r in db.execute("SELECT date FROM items ORDER BY guid")]
    assert dates == ["2026-03-18T12:00:00+00:00", "not a date", ""]
    assert db.execute("PRAGMA user_version").fetchone()[0] == 1
