Project Efty 🦎
==============

An RSS newsreader with user accounts. Built with Flask and SQLite on the
backend, vanilla JavaScript on the frontend — no build step.


Getting started
---------------

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.in
pip freeze > requirements.txt
python server.py
```

Open `http://localhost:8000`, create an account, and start subscribing to
feeds.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | random (changes on restart) | Signs session cookies — set this in production |
| `EFTY_DB` | `db.sqlite3` (project root) | Path to the SQLite database file |


Features
--------

### Three-pane layout:

1. **Left** — subscribed feeds list
    - "All Feeds" view aggregates posts across all feeds, sorted by date
    - Unread count badges per feed
    - Refresh (↺) and unsubscribe (×) buttons on hover
2. **Center** — post previews for the selected feed
    - Filter by all / unread / read
3. **Right** — full post detail
    - Toggle read/unread
    - "Open original" link to source

### Subscribing:

Click **+ Subscribe**, enter an RSS or Atom feed URL, and press Subscribe.
Supports RSS 2.0 and Atom. Feed data and read state are stored per user
account in SQLite.


Architecture
------------

### Backend (`server.py`)

Flask app with SQLite via the standard-library `sqlite3` module. The
database schema (`schema.sql`) is initialized automatically on startup.
Feed fetching and parsing is handled server-side by `feedparser`.

Static assets (`app.js`, `api.js`, `render.js`, `login.js`, `style.css`)
are served from a whitelist — Python source files are not accessible.

### Database

Three tables:

| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `password_hash` (Werkzeug PBKDF2) |
| `feeds` | `id`, `user_id`, `url`, `title` — `UNIQUE(user_id, url)` |
| `items` | `id`, `feed_id`, `guid`, `title`, `link`, `date`, `summary`, `content`, `read` — `UNIQUE(feed_id, guid)` |

Feeds and items are per-user. Re-fetching a feed uses `INSERT OR IGNORE`
on the item guid, so existing items (and their read state) are preserved.

### Auth

Session-based, cookie-backed. Flask's signed session cookie stores the
`user_id`. All `/api/*` routes return `401` if the session is missing;
the frontend redirects to `/login` on any 401 response.

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Start session |
| `POST` | `/auth/logout` | Clear session |
| `GET` | `/api/feeds` | All feeds + items for the current user |
| `POST` | `/api/feeds` | Subscribe to a feed URL |
| `DELETE` | `/api/feeds/<id>` | Unsubscribe |
| `POST` | `/api/feeds/<id>/refresh` | Re-fetch items from source |
| `PATCH` | `/api/items/<id>` | Update read status: `{ "read": bool }` |

Feed response shape:

```json
{
  "id": 1,
  "url": "https://example.com/feed.xml",
  "title": "Example Blog",
  "items": [
    {
      "id": 42,
      "guid": "https://example.com/post-1",
      "title": "Post title",
      "link": "https://example.com/post-1",
      "date": "2026-03-19T12:00:00Z",
      "summary": "First 200 characters of text…",
      "content": "<p>Full HTML content</p>",
      "read": false
    }
  ]
}
```

### Frontend modules

| File | Responsibility |
|---|---|
| `api.js` | Async fetch wrappers for every API endpoint; redirects to `/login` on 401 |
| `app.js` | App state, action functions, event binding — entry point |
| `render.js` | Imperative DOM rendering; HTML sanitization |
| `login.js` | Login and register page logic |

State is a single object (`feeds[]`, `selectedFeedId`, `selectedPostId`,
`filter`). UI updates are optimistic — state mutates immediately, then the
API call fires in the background. Feed items are fetched on first subscribe
or on explicit refresh; there is no automatic background refresh.
