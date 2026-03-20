"""Efty server — Flask backend with SQLite persistence and user auth."""

import functools
import os
import re
import sqlite3
import urllib.request

import feedparser
from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
)
from werkzeug.security import check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("EFTY_DB", os.path.join(BASE_DIR, "db.sqlite3"))

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(32))

if not os.environ.get("SECRET_KEY"):
    print("Warning: SECRET_KEY not set — sessions will not persist across restarts.")

# ── Database ──


def get_db():
    """Return the per-request database connection, creating it if needed."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    """Close the database connection at the end of the request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create tables from schema.sql if they don't already exist."""
    with app.app_context():
        db = get_db()
        schema = os.path.join(BASE_DIR, "schema.sql")
        with open(schema) as f:
            db.executescript(f.read())
        db.commit()


# ── Feed fetching ──

_USER_AGENT = "Efty RSS Reader/1.0"


def fetch_and_parse(url):
    """Fetch and parse an RSS or Atom feed. Return (title, items).

    Args:
        url: The feed URL to fetch.

    Returns:
        A tuple of (feed_title: str, items: list[dict]).

    Raises:
        ValueError: If the feed cannot be fetched or parsed.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
    except Exception as exc:
        raise ValueError(f"Could not fetch feed: {exc}") from exc

    parsed = feedparser.parse(data)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"Could not parse feed: {parsed.get('bozo_exception')}")

    title = parsed.feed.get("title") or url
    items = []
    for entry in parsed.entries:
        content = ""
        if entry.get("content"):
            content = entry.content[0].get("value", "")
        if not content:
            content = entry.get("summary", "")

        raw_summary = entry.get("summary", "") or content
        summary = re.sub(r"<[^>]+>", "", raw_summary)[:200]
        date = entry.get("published") or entry.get("updated") or ""

        items.append({
            "guid": (
                entry.get("id") or entry.get("link") or entry.get("title", "")
            ),
            "title": entry.get("title") or "Untitled",
            "link": entry.get("link", ""),
            "date": date,
            "summary": summary,
            "content": content,
        })

    return title, items


def feed_to_dict(feed_row, item_rows):
    """Serialize a feed row and its items to a JSON-serializable dict."""
    return {
        "id": feed_row["id"],
        "url": feed_row["url"],
        "title": feed_row["title"],
        "items": [
            {
                "id": r["id"],
                "guid": r["guid"],
                "title": r["title"],
                "link": r["link"],
                "date": r["date"],
                "summary": r["summary"],
                "content": r["content"],
                "read": bool(r["read"]),
            }
            for r in item_rows
        ],
    }


# ── Auth helpers ──


def require_login(f):
    """Decorator — return 401 JSON if the user is not logged in."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return wrapper


# ── Page routes ──


@app.route("/")
def index():
    """Serve the main app, or redirect to /login if not authenticated."""
    if "user_id" not in session:
        return redirect("/login")
    return render_template("index.html")


@app.route("/login")
def login_page():
    """Serve the login/register page."""
    if "user_id" in session:
        return redirect("/")
    return render_template("login.html")


# ── Auth API ──



@app.route("/auth/login", methods=["POST"])
def login():
    """Authenticate and start a session."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    db = get_db()
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"ok": True})


@app.route("/auth/logout", methods=["POST"])
def logout():
    """Clear the current session."""
    session.clear()
    return jsonify({"ok": True})


# ── Feeds API ──


@app.route("/api/feeds")
@require_login
def get_feeds():
    """Return all of the current user's feeds with their items."""
    db = get_db()
    user_id = session["user_id"]
    feeds = db.execute(
        "SELECT id, url, title FROM feeds WHERE user_id = ? ORDER BY added_at",
        (user_id,),
    ).fetchall()

    result = []
    for feed in feeds:
        items = db.execute(
            """SELECT id, guid, title, link, date, summary, content, read
               FROM items WHERE feed_id = ? ORDER BY date DESC""",
            (feed["id"],),
        ).fetchall()
        result.append(feed_to_dict(feed, items))

    return jsonify(result)


@app.route("/api/feeds", methods=["POST"])
@require_login
def add_feed():
    """Subscribe to a new feed by URL. Fetches and stores its items."""
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 422

    try:
        title, items = fetch_and_parse(url)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 502

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO feeds (user_id, url, title) VALUES (?, ?, ?)",
            (session["user_id"], url, title),
        )
        feed_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Already subscribed to this feed"}), 409

    _upsert_items(db, feed_id, items)
    db.commit()

    item_rows = db.execute(
        """SELECT id, guid, title, link, date, summary, content, read
           FROM items WHERE feed_id = ? ORDER BY date DESC""",
        (feed_id,),
    ).fetchall()

    feed_row = db.execute(
        "SELECT id, url, title FROM feeds WHERE id = ?", (feed_id,)
    ).fetchone()

    return jsonify(feed_to_dict(feed_row, item_rows)), 201


@app.route("/api/feeds/<int:feed_id>", methods=["DELETE"])
@require_login
def remove_feed(feed_id):
    """Unsubscribe from a feed and delete its items."""
    db = get_db()
    result = db.execute(
        "DELETE FROM feeds WHERE id = ? AND user_id = ?",
        (feed_id, session["user_id"]),
    )
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Feed not found"}), 404
    return "", 204


@app.route("/api/feeds/<int:feed_id>/refresh", methods=["POST"])
@require_login
def refresh_feed(feed_id):
    """Re-fetch a feed's items from the source and return the updated feed."""
    db = get_db()
    feed = db.execute(
        "SELECT id, url, title FROM feeds WHERE id = ? AND user_id = ?",
        (feed_id, session["user_id"]),
    ).fetchone()
    if not feed:
        return jsonify({"error": "Feed not found"}), 404

    try:
        title, items = fetch_and_parse(feed["url"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 502

    db.execute(
        "UPDATE feeds SET title = ? WHERE id = ?", (title, feed_id)
    )
    _upsert_items(db, feed_id, items)
    db.commit()

    item_rows = db.execute(
        """SELECT id, guid, title, link, date, summary, content, read
           FROM items WHERE feed_id = ? ORDER BY date DESC""",
        (feed_id,),
    ).fetchall()
    updated_feed = db.execute(
        "SELECT id, url, title FROM feeds WHERE id = ?", (feed_id,)
    ).fetchone()

    return jsonify(feed_to_dict(updated_feed, item_rows))


# ── Items API ──


@app.route("/api/items/<int:item_id>", methods=["PATCH"])
@require_login
def update_item(item_id):
    """Update an item's read status."""
    data = request.get_json(silent=True) or {}
    if "read" not in data:
        return jsonify({"error": "Missing 'read' field"}), 422

    db = get_db()
    # Verify the item belongs to this user via its feed.
    item = db.execute(
        """SELECT items.id FROM items
           JOIN feeds ON feeds.id = items.feed_id
           WHERE items.id = ? AND feeds.user_id = ?""",
        (item_id, session["user_id"]),
    ).fetchone()
    if not item:
        return jsonify({"error": "Item not found"}), 404

    db.execute(
        "UPDATE items SET read = ? WHERE id = ?",
        (1 if data["read"] else 0, item_id),
    )
    db.commit()
    return "", 204


# ── Internal helpers ──


def _upsert_items(db, feed_id, items):
    """Insert new items into the database, ignoring duplicates by guid."""
    for item in items:
        db.execute(
            """INSERT OR IGNORE INTO items
               (feed_id, guid, title, link, date, summary, content)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                feed_id,
                item["guid"],
                item["title"],
                item["link"],
                item["date"],
                item["summary"],
                item["content"],
            ),
        )


# ── Entry point ──

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=8000)
