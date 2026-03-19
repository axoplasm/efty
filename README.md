Project Efty
============

An RSS newsreader web app.


Features
--------

### One window UI with 3 panes:

1. (left) List of subscribed feeds
2. (center) Preview posts from selected feeds
    - Filter feeds by read/unread
3. (right) detail of selected feed post
    - Toggle read/unread

### Other features:

1. Button to subscribe to an RSS feed
    - Opens a modal with a textbox to enter the URL of a feed


Technical notes
---------------

- Static web server (no backend)
- Run locally with `python3 server.py` (serves static files and proxies feed requests)
- Vanilla JS and CSS (no frontend build)
- Store feed data in a local JSON file
