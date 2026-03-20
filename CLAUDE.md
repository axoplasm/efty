# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Efty** is a static, client-side RSS newsreader web app. No backend, no build step, no framework — just vanilla HTML, JavaScript, and CSS served from a lightweight HTTP server.

## Running Locally

```bash
python3 server.py
```

Then open `http://localhost:8000`. The server serves static files and proxies RSS feed requests to avoid CORS issues.

## Architecture

**Three-pane layout:**
- Left — subscribed feed list
- Center — post previews for the selected feed (filterable by read/unread)
- Right — full post detail with read/unread toggle

**Feed subscription** is triggered via a `<dialog>` modal that accepts an RSS or Atom feed URL.

**Data persistence** uses `localStorage` (key `efty_data`). No database, no server-side state.

**Constraints to preserve:**
- No backend server
- No frontend build tooling (no bundler, no transpiler, no npm)
- No third-party JS/CSS frameworks or libraries

## Module Structure

The app is split into ES modules loaded via `<script type="module">`:

| Module | Responsibility |
|---|---|
| `storage.js` | `save(feeds)`, `load()` — localStorage only |
| `parser.js` | `fetchFeed(url)` — fetch + RSS 2.0 / Atom parsing |
| `render.js` | `render/renderFeeds/renderPosts/renderDetail(state, callbacks)`, `findPost(feeds, id)` |
| `app.js` | State, actions, modal, event binding — entry point |

## Key Implementation Details

**State model** (`app.js`): A single `state` object holds `feeds[]`, `selectedFeedIndex` (integer, `"all"`, or `null`), `selectedPostId`, and `filter`. All mutations go through action functions that call `save()` then `rerender()`.

**Persistence**: `localStorage` under key `efty_data`. Stores feed URLs, titles, and all item fields including `read` status. UI state (`selectedFeedIndex`, `selectedPostId`, `filter`) resets on page load.

**Feed parsing**: Supports RSS 2.0 (`<channel>`) and Atom (`<feed>`). Post IDs use `<guid>` → `<link>` → `<title>` fallback chain (RSS) or `<id>` → `<link>` → `<title>` (Atom). Items are normalized to `{ id, title, link, date, summary, content, read }`.

**Render/action decoupling**: Render functions accept a `callbacks` object `{ selectFeed, selectPost, removeFeed }` rather than importing from `app.js`, avoiding a circular dependency. `findPost` is exported from `render.js` and imported by both `render.js` and `app.js`.

**HTML sanitization** (`sanitizeHTML` in `render.js`): Strips `<script>` tags and `on*` attributes, blocks `javascript:` hrefs, and resolves relative URLs against the feed's base URL before setting `innerHTML` in the detail pane.

**CORS proxy**: All feed fetches go through `/proxy?url=…` on the local Python server (`server.py`). Dev-only — there is no production deployment mechanism.

**Rendering**: Fully imperative — each `render*()` function clears and rebuilds its DOM section from scratch. No virtual DOM or diffing.

**Modal**: Uses native `<dialog>` with `showModal()` / `close()`. The backdrop is styled via `dialog#modal::backdrop`.
