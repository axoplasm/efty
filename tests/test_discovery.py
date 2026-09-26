"""Tests for discovering a feed from a web page's <link> tags."""

import pytest

import server
from conftest import RSS_FEED


def page(*links):
    """Return an HTML page with the given <link> tag markup in its head."""
    return (
        "<!doctype html><html><head><title>Blog</title>"
        + "".join(links)
        + "</head><body><p>Hello</p></body></html>"
    ).encode()


RSS_LINK = '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'
ATOM_LINK = (
    '<link rel="alternate" type="application/atom+xml" '
    'href="https://example.com/atom.xml">'
)


@pytest.fixture()
def fake_web(monkeypatch):
    """Serve a dict of {url: bytes} in place of HTTP; return the dict to fill."""
    pages = {}

    def _fetch(url):
        if url not in pages:
            raise ValueError(f"Could not fetch {url}: 404")
        return pages[url], url

    monkeypatch.setattr(server, "_fetch", _fetch)
    return pages


def test_discover_feed_links_resolves_and_filters():
    """Relative links are resolved; non-feed and duplicate links are dropped."""
    html = page(
        RSS_LINK,
        ATOM_LINK,
        RSS_LINK,
        '<link rel="stylesheet" href="/style.css">',
        '<link rel="alternate" hreflang="fr" href="/fr/">',
        '<link rel="alternate" type="application/rss+xml" href="javascript:x">',
    )
    assert server.discover_feed_links(html, "https://example.com/blog/") == [
        "https://example.com/feed.xml",
        "https://example.com/atom.xml",
    ]


def test_subscribe_to_page_uses_linked_feed(auth, fake_web):
    """Subscribing to a page subscribes to the feed it links to."""
    fake_web["https://example.com/"] = page(RSS_LINK)
    fake_web["https://example.com/feed.xml"] = RSS_FEED.encode()

    res = auth.post("/api/feeds", json={"url": "https://example.com/"})
    assert res.status_code == 201
    feed = res.get_json()
    assert feed["url"] == "https://example.com/feed.xml"
    assert feed["title"] == "Test Feed"
    assert len(feed["items"]) == 2


def test_subscribe_skips_broken_linked_feed(auth, fake_web):
    """If the first linked feed fails to load, the next one is tried."""
    fake_web["https://example.com/"] = page(RSS_LINK, ATOM_LINK)
    fake_web["https://example.com/atom.xml"] = RSS_FEED.encode()

    res = auth.post("/api/feeds", json={"url": "https://example.com/"})
    assert res.status_code == 201
    assert res.get_json()["url"] == "https://example.com/atom.xml"


def test_subscribe_to_page_without_feed(auth, fake_web):
    """A page with no feed links gives a clear error."""
    fake_web["https://example.com/"] = page()

    res = auth.post("/api/feeds", json={"url": "https://example.com/"})
    assert res.status_code == 502
    assert res.get_json()["error"] == "No feed found at that address"


def test_subscribe_to_page_already_subscribed(auth, fake_web):
    """Subscribing via a page to a feed you already have is a duplicate."""
    fake_web["https://example.com/"] = page(RSS_LINK)
    fake_web["https://example.com/feed.xml"] = RSS_FEED.encode()

    auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    res = auth.post("/api/feeds", json={"url": "https://example.com/"})
    assert res.status_code == 409


def test_feed_url_still_works_directly(auth, fake_web):
    """A direct feed URL is subscribed to as-is."""
    fake_web["https://example.com/feed.xml"] = RSS_FEED.encode()

    res = auth.post("/api/feeds", json={"url": "https://example.com/feed.xml"})
    assert res.status_code == 201
    assert res.get_json()["url"] == "https://example.com/feed.xml"
