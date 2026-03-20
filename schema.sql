CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feeds (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url      TEXT    NOT NULL,
    title    TEXT    NOT NULL,
    added_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, url)
);

CREATE TABLE IF NOT EXISTS items (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid    TEXT    NOT NULL,
    title   TEXT    NOT NULL,
    link    TEXT    NOT NULL DEFAULT '',
    date    TEXT    NOT NULL DEFAULT '',
    summary TEXT    NOT NULL DEFAULT '',
    content TEXT    NOT NULL DEFAULT '',
    read    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(feed_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_items_feed_id ON items(feed_id);
CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);
