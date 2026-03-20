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

**Feed subscription** is triggered via a modal dialog that accepts an RSS feed URL.

**Data persistence** uses a local JSON file (no database, no server-side state).

**Constraints to preserve:**
- No backend server
- No frontend build tooling (no bundler, no transpiler, no npm)
- No third-party JS/CSS frameworks or libraries
- Feed data stored in a local JSON file

## Key Implementation Details

**State model** (`app.js`, IIFE): A single `state` object holds `feeds[]`, `selectedFeedIndex` (integer or `"all"` or `null`), `selectedPostId`, and `filter`. All mutations go through action functions that call `save()` then `render()`.

**Persistence**: `localStorage` under key `efty_data`. Stores feed URLs, titles, and all item fields including `read` status. Only feed metadata and items are persisted — UI state (`selectedFeedIndex`, `selectedPostId`, `filter`) resets on page load.

**Feed parsing**: Supports RSS 2.0 (`<channel>`) and Atom (`<feed>`). Post IDs use `<guid>` → `<link>` → `<title>` fallback chain (RSS) or `<id>` → `<link>` → `<title>` (Atom). Items are normalized to a common shape: `{ id, title, link, date, summary, content, read }`.

**HTML sanitization** (`sanitizeHTML`): Strips `<script>` tags and `on*` attributes, blocks `javascript:` hrefs, and resolves relative URLs against the feed's base URL before setting `innerHTML` in the detail pane.

**CORS proxy**: All feed fetches go through `/proxy?url=…` on the local Python server (`server.py`). This is a dev-only workaround — there is no production deployment mechanism.

**Rendering**: Fully imperative — each `render*()` function clears and rebuilds its DOM section from scratch. There is no virtual DOM or diffing.
