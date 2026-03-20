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

Set `SECRET_KEY` in the environment to keep sessions alive across server
restarts. Set `EFTY_DB` to use a custom database path (default: `efty.db`
in the project directory).


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
Feed data and read state are stored per user account in SQLite.


Technical notes
---------------

- Python/Flask backend, SQLite data store, no ORM
- Feed parsing via `feedparser` (RSS 2.0 and Atom)
- Frontend is vanilla JS ES modules: `api.js`, `render.js`, `app.js`
- No frontend build tooling
