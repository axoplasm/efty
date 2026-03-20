# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Efty** is an RSS newsreader web app with a Python/Flask backend and SQLite data store. Users log in, and their feed subscriptions and read state are stored server-side per account.

## Running Locally

```bash
pip install -r requirements.txt
python server.py
```

Then open `http://localhost:8000`. Set `SECRET_KEY` in the environment for sessions to survive restarts; set `EFTY_DB` to override the default database path (`db.sqlite3` in the project root).

## Architecture

**Three-pane layout:**
- Left — subscribed feed list (with refresh ↺ and unsubscribe × buttons on hover)
- Center — post previews for the selected feed (filterable by read/unread)
- Right — full post detail with read/unread toggle

**Auth**: Session-based, cookie-backed. Flask's signed session cookie stores `user_id`. All `/api/*` routes require a valid session and return `401` otherwise; the frontend redirects to `/login` on 401.

**Static file serving**: Flask serves `index.html` at `/`, `login.html` at `/login`, and a whitelist of JS/CSS assets. Python source files are not accessible.

## Database

SQLite via Python's `sqlite3`. Schema in `schema.sql`, initialized automatically on startup by `init_db()` in `server.py`. Three tables:

| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `password_hash` (Werkzeug PBKDF2) |
| `feeds` | `id`, `user_id`, `url`, `title` — `UNIQUE(user_id, url)` |
| `items` | `id`, `feed_id`, `guid`, `title`, `link`, `date`, `summary`, `content`, `read` — `UNIQUE(feed_id, guid)` |

Feeds and items are per-user. `INSERT OR IGNORE` on guid prevents duplicate items when a feed is refreshed.

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Start session |
| `POST` | `/auth/logout` | Clear session |
| `GET` | `/api/feeds` | All feeds + items for current user |
| `POST` | `/api/feeds` | Subscribe to a feed URL (fetches + parses) |
| `DELETE` | `/api/feeds/<id>` | Unsubscribe |
| `POST` | `/api/feeds/<id>/refresh` | Re-fetch items from source |
| `PATCH` | `/api/items/<id>` | Update `read` status `{ "read": bool }` |

Feed responses shape: `{ id, url, title, items: [{ id, guid, title, link, date, summary, content, read }] }`.

## Module Structure

| File | Responsibility |
|---|---|
| `server.py` | Flask app — all routes, feed fetching via `feedparser`, DB access |
| `schema.sql` | SQLite DDL |
| `api.js` | Frontend API client — wraps all fetch calls, handles 401 redirect |
| `render.js` | DOM rendering; `findPost(feeds, id)`, `render/renderFeeds/renderPosts/renderDetail(state, callbacks)` |
| `app.js` | State, actions, event binding — entry point |
| `login.js` | Login/register page logic |

## Key Implementation Details

**State model** (`app.js`): A single `state` object holds `feeds[]`, `selectedFeedId` (integer feed DB id, `"all"`, or `null`), `selectedPostId` (integer item DB id or `null`), and `filter`. All feed/item mutations are async API calls; UI state updates are optimistic (update state immediately, fire API call in background).

**Render/action decoupling**: Render functions accept a `callbacks` object `{ selectFeed, selectPost, removeFeed, refreshFeed }` instead of importing from `app.js`, avoiding a circular dependency. `findPost(feeds, id)` is exported from `render.js` and used by both `render.js` and `app.js`.

**Feed refresh strategy**: On-demand only — no background refresh. Items are fetched when a feed is first added (`POST /api/feeds`) or explicitly refreshed (`POST /api/feeds/<id>/refresh`). The refresh button (↺) appears on hover in the feeds list.

**HTML sanitization** (`sanitizeHTML` in `render.js`): Strips `<script>` tags and `on*` attributes, blocks `javascript:` hrefs, resolves relative URLs against the feed's base URL before setting `innerHTML`.

**Modal**: Native `<dialog>` with `showModal()` / `close()`. Backdrop styled via `dialog#modal::backdrop`.
