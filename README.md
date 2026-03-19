Project Efty 🦎
==============

An RSS newsreader web app.


Features
--------

### One window UI with 3 panes:

1. (left) List of subscribed feeds
    - "All Feeds" button to show posts from all feeds
    - Unread count badges
2. (center) Preview posts from selected feeds
    - Filter by read/unread
    - Shows feed name in each post preview
    - "All Feeds" view sorted by date, newest first
3. (right) Detail of selected feed post
    - Toggle read/unread
    - Shows feed name in post metadata

### Other features:

1. Button to subscribe to an RSS feed
    - Opens a modal with a textbox to enter the URL of a feed


Technical notes
---------------

- Static web server (no backend)
- Run locally with `python3 server.py` (serves static files and proxies feed requests)
- Vanilla JS and CSS (no frontend build)
- Store feed data in a local JSON file
