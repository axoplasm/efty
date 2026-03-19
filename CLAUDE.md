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
