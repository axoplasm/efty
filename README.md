Project Efty 🦎
==============

A static, client-side RSS newsreader. No backend, no build step, no
framework — just vanilla HTML, JavaScript, and CSS.


Running locally
---------------

```
python3 server.py
```

Open `http://localhost:8000`. The server serves static files and proxies
feed requests to avoid CORS issues.


Features
--------

### Three-pane layout:

1. **Left** — subscribed feeds list
    - "All Feeds" view aggregates posts across all feeds
    - Unread count badges per feed
2. **Center** — post previews for the selected feed
    - Filter by all / unread / read
    - "All Feeds" view sorted by date, newest first
3. **Right** — full post detail
    - Toggle read/unread
    - "Open original" link to source

### Subscribing:

Click **+ Subscribe**, enter an RSS or Atom feed URL, and press Subscribe.
Feed data (including read state) is stored in `localStorage`.


Technical notes
---------------

- No backend server, no build tooling, no third-party libraries
- Feed parsing supports RSS 2.0 and Atom
- Source is split into ES modules: `storage.js`, `parser.js`, `render.js`, `app.js`
