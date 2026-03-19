(function () {
  "use strict";

  const STORAGE_KEY = "efty_data";
  const CORS_PROXY = "/proxy?url=";

  // ── State ──

  let state = {
    feeds: [],    // [{ url, title, items: [{ id, title, link, date, summary, content, read }] }]
    selectedFeedIndex: null,
    selectedPostId: null,
    filter: "all",
  };

  // ── Persistence ──

  function save() {
    const data = state.feeds.map(function (f) {
      return {
        url: f.url,
        title: f.title,
        items: f.items.map(function (item) {
          return { id: item.id, title: item.title, link: item.link, date: item.date, summary: item.summary, content: item.content, read: item.read };
        }),
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function load() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      state.feeds = JSON.parse(raw);
    } catch (e) {
      // corrupted data — start fresh
    }
  }

  // ── RSS Parsing ──

  function fetchFeed(url) {
    return fetch(CORS_PROXY + encodeURIComponent(url))
      .then(function (res) {
        if (!res.ok) throw new Error("Network error: " + res.status);
        return res.text();
      })
      .then(function (text) {
        return parseRSS(text, url);
      });
  }

  function parseRSS(text, feedUrl) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, "text/xml");

    var errorNode = doc.querySelector("parsererror");
    if (errorNode) throw new Error("Invalid RSS/Atom feed");

    // Try RSS 2.0
    var channel = doc.querySelector("channel");
    if (channel) {
      return parseRSS2(channel, feedUrl);
    }

    // Try Atom
    var atomFeed = doc.querySelector("feed");
    if (atomFeed) {
      return parseAtom(atomFeed, feedUrl);
    }

    throw new Error("Unrecognized feed format");
  }

  function parseRSS2(channel, feedUrl) {
    var titleEl = channel.querySelector(":scope > title");
    var title = titleEl ? titleEl.textContent.trim() : feedUrl;
    var itemEls = channel.querySelectorAll("item");
    var items = [];
    itemEls.forEach(function (el) {
      items.push({
        id: getTextContent(el, "guid") || getTextContent(el, "link") || getTextContent(el, "title"),
        title: getTextContent(el, "title") || "Untitled",
        link: getTextContent(el, "link") || "",
        date: getTextContent(el, "pubDate") || "",
        summary: stripHTML(getTextContent(el, "description") || "").slice(0, 200),
        content: getTextContent(el, "content\\:encoded") || getTextContent(el, "description") || "",
        read: false,
      });
    });
    return { url: feedUrl, title: title, items: items };
  }

  function parseAtom(feed, feedUrl) {
    var titleEl = feed.querySelector(":scope > title");
    var title = titleEl ? titleEl.textContent.trim() : feedUrl;
    var entryEls = feed.querySelectorAll("entry");
    var items = [];
    entryEls.forEach(function (el) {
      var linkEl = el.querySelector("link[href]");
      var link = linkEl ? linkEl.getAttribute("href") : "";
      var contentEl = el.querySelector("content") || el.querySelector("summary");
      var contentText = contentEl ? contentEl.textContent : "";
      items.push({
        id: getTextContent(el, "id") || link || getTextContent(el, "title"),
        title: getTextContent(el, "title") || "Untitled",
        link: link,
        date: getTextContent(el, "updated") || getTextContent(el, "published") || "",
        summary: stripHTML(contentText).slice(0, 200),
        content: contentText,
        read: false,
      });
    });
    return { url: feedUrl, title: title, items: items };
  }

  function getTextContent(parent, tagName) {
    var el = parent.querySelector(tagName);
    return el ? el.textContent.trim() : "";
  }

  function stripHTML(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  // ── Rendering ──

  function render() {
    renderFeeds();
    renderPosts();
    renderDetail();
  }

  function renderFeeds() {
    var list = document.getElementById("feeds-list");
    list.innerHTML = "";

    state.feeds.forEach(function (feed, i) {
      var li = document.createElement("li");
      if (state.selectedFeedIndex === i) li.classList.add("selected");

      var titleSpan = document.createElement("span");
      titleSpan.className = "feed-title";
      titleSpan.textContent = feed.title;
      li.appendChild(titleSpan);

      var unreadCount = feed.items.filter(function (item) { return !item.read; }).length;
      if (unreadCount > 0) {
        var badge = document.createElement("span");
        badge.className = "feed-unread-count";
        badge.textContent = unreadCount;
        li.appendChild(badge);
      }

      var removeBtn = document.createElement("button");
      removeBtn.className = "feed-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.title = "Unsubscribe";
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        removeFeed(i);
      });
      li.appendChild(removeBtn);

      li.addEventListener("click", function () {
        selectFeed(i);
      });

      list.appendChild(li);
    });
  }

  function renderPosts() {
    var list = document.getElementById("posts-list");
    var titleEl = document.getElementById("posts-title");
    list.innerHTML = "";

    if (state.selectedFeedIndex === null) {
      titleEl.textContent = "Posts";
      return;
    }

    var feed = state.feeds[state.selectedFeedIndex];
    if (!feed) return;
    titleEl.textContent = feed.title;

    var filtered = feed.items.filter(function (item) {
      if (state.filter === "unread") return !item.read;
      if (state.filter === "read") return item.read;
      return true;
    });

    filtered.forEach(function (item) {
      var li = document.createElement("li");
      if (!item.read) li.classList.add("unread");
      if (state.selectedPostId === item.id) li.classList.add("selected");

      var titleDiv = document.createElement("div");
      titleDiv.className = "post-title";

      if (!item.read) {
        var dot = document.createElement("span");
        dot.className = "unread-dot";
        titleDiv.appendChild(dot);
      }

      var titleText = document.createElement("span");
      titleText.textContent = item.title;
      titleDiv.appendChild(titleText);

      li.appendChild(titleDiv);

      if (item.date) {
        var dateDiv = document.createElement("div");
        dateDiv.className = "post-date";
        dateDiv.textContent = formatDate(item.date);
        li.appendChild(dateDiv);
      }

      if (item.summary) {
        var snippetDiv = document.createElement("div");
        snippetDiv.className = "post-snippet";
        snippetDiv.textContent = item.summary;
        li.appendChild(snippetDiv);
      }

      li.addEventListener("click", function () {
        selectPost(item.id);
      });

      list.appendChild(li);
    });
  }

  function renderDetail() {
    var emptyEl = document.getElementById("detail-empty");
    var contentEl = document.getElementById("detail-content");

    if (state.selectedFeedIndex === null || state.selectedPostId === null) {
      emptyEl.hidden = false;
      contentEl.hidden = true;
      return;
    }

    var feed = state.feeds[state.selectedFeedIndex];
    if (!feed) return;

    var item = feed.items.find(function (p) { return p.id === state.selectedPostId; });
    if (!item) {
      emptyEl.hidden = false;
      contentEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    contentEl.hidden = false;

    document.getElementById("detail-title").textContent = item.title;
    document.getElementById("detail-toggle-read").textContent = item.read ? "Mark unread" : "Mark read";
    document.getElementById("detail-meta").textContent = formatDate(item.date);
    document.getElementById("detail-body").innerHTML = sanitizeHTML(item.content);
    var linkEl = document.getElementById("detail-link");
    if (item.link) {
      linkEl.href = item.link;
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return dateStr;
    }
  }

  function sanitizeHTML(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    // Remove script tags
    var scripts = div.querySelectorAll("script");
    scripts.forEach(function (s) { s.remove(); });
    // Remove event handler attributes
    var all = div.querySelectorAll("*");
    all.forEach(function (el) {
      var attrs = Array.from(el.attributes);
      attrs.forEach(function (attr) {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      });
      // Remove javascript: links
      if (el.tagName === "A" && el.href && el.href.toLowerCase().startsWith("javascript:")) {
        el.removeAttribute("href");
      }
    });
    return div.innerHTML;
  }

  // ── Actions ──

  function selectFeed(index) {
    state.selectedFeedIndex = index;
    state.selectedPostId = null;
    render();
  }

  function selectPost(id) {
    state.selectedPostId = id;
    var feed = state.feeds[state.selectedFeedIndex];
    var item = feed.items.find(function (p) { return p.id === id; });
    if (item && !item.read) {
      item.read = true;
      save();
    }
    render();
  }

  function toggleReadStatus() {
    if (state.selectedFeedIndex === null || state.selectedPostId === null) return;
    var feed = state.feeds[state.selectedFeedIndex];
    var item = feed.items.find(function (p) { return p.id === state.selectedPostId; });
    if (item) {
      item.read = !item.read;
      save();
      render();
    }
  }

  function removeFeed(index) {
    state.feeds.splice(index, 1);
    if (state.selectedFeedIndex === index) {
      state.selectedFeedIndex = null;
      state.selectedPostId = null;
    } else if (state.selectedFeedIndex !== null && state.selectedFeedIndex > index) {
      state.selectedFeedIndex--;
    }
    save();
    render();
  }

  function subscribeFeed(url) {
    var errorEl = document.getElementById("modal-error");
    var submitBtn = document.getElementById("modal-submit");

    // Check for duplicates
    var exists = state.feeds.some(function (f) { return f.url === url; });
    if (exists) {
      errorEl.textContent = "Already subscribed to this feed.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Loading\u2026";
    errorEl.hidden = true;

    fetchFeed(url)
      .then(function (feed) {
        // Merge read state if re-subscribing
        state.feeds.push(feed);
        state.selectedFeedIndex = state.feeds.length - 1;
        state.selectedPostId = null;
        save();
        render();
        closeModal();
      })
      .catch(function (err) {
        errorEl.textContent = "Failed to load feed: " + err.message;
        errorEl.hidden = false;
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Subscribe";
      });
  }

  // ── Modal ──

  function openModal() {
    document.getElementById("modal-overlay").hidden = false;
    document.getElementById("feed-url-input").value = "";
    document.getElementById("modal-error").hidden = true;
    document.getElementById("feed-url-input").focus();
  }

  function closeModal() {
    document.getElementById("modal-overlay").hidden = true;
  }

  // ── Event Binding ──

  function init() {
    load();

    document.getElementById("subscribe-btn").addEventListener("click", openModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeModal();
    });

    document.getElementById("subscribe-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var url = document.getElementById("feed-url-input").value.trim();
      if (url) subscribeFeed(url);
    });

    document.getElementById("posts-filter").addEventListener("change", function () {
      state.filter = this.value;
      renderPosts();
    });

    document.getElementById("detail-toggle-read").addEventListener("click", toggleReadStatus);

    // Keyboard shortcut: Escape to close modal
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    render();
  }

  init();
})();
