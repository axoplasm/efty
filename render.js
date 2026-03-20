// ── Exported query helper (also used by app.js actions) ──

export function findPost(feeds, id) {
  for (var i = 0; i < feeds.length; i++) {
    var feed = feeds[i];
    var item = feed.items.find(function (p) { return p.id === id; });
    if (item) return { item: item, feed: feed };
  }
  return null;
}

// ── Render ──

export function render(state, callbacks) {
  renderFeeds(state, callbacks);
  renderPosts(state, callbacks);
  renderDetail(state, callbacks);
}

export function renderFeeds(state, callbacks) {
  var list = document.getElementById("feeds-list");
  list.innerHTML = "";

  // "All" entry
  var allLi = document.createElement("li");
  if (state.selectedFeedIndex === "all") allLi.classList.add("selected");
  var allTitle = document.createElement("span");
  allTitle.className = "feed-title";
  allTitle.textContent = "All Feeds";
  allLi.appendChild(allTitle);
  var totalUnread = state.feeds.reduce(function (sum, f) {
    return sum + f.items.filter(function (item) { return !item.read; }).length;
  }, 0);
  if (totalUnread > 0) {
    var allBadge = document.createElement("span");
    allBadge.className = "feed-unread-count";
    allBadge.textContent = totalUnread;
    allLi.appendChild(allBadge);
  }
  allLi.addEventListener("click", function () { callbacks.selectFeed("all"); });
  list.appendChild(allLi);

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
      callbacks.removeFeed(i);
    });
    li.appendChild(removeBtn);

    li.addEventListener("click", function () {
      callbacks.selectFeed(i);
    });

    list.appendChild(li);
  });
}

export function renderPosts(state, callbacks) {
  var list = document.getElementById("posts-list");
  var titleEl = document.getElementById("posts-title");
  list.innerHTML = "";

  if (state.selectedFeedIndex === null) {
    titleEl.textContent = "Posts";
    return;
  }

  titleEl.textContent = state.selectedFeedIndex === "all" ? "All Feeds" : state.feeds[state.selectedFeedIndex].title;

  var posts = getPostsForSelection(state);
  var filtered = posts.filter(function (p) {
    if (state.filter === "unread") return !p.item.read;
    if (state.filter === "read") return p.item.read;
    return true;
  });

  filtered.forEach(function (p) {
    var item = p.item;
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

    var metaLine = document.createElement("div");
    metaLine.className = "post-date";
    var parts = [];
    if (item.date) parts.push(formatDate(item.date));
    parts.push(p.feedTitle);
    metaLine.textContent = parts.join(" \u00b7 ");
    li.appendChild(metaLine);

    if (item.summary) {
      var snippetDiv = document.createElement("div");
      snippetDiv.className = "post-snippet";
      snippetDiv.textContent = item.summary;
      li.appendChild(snippetDiv);
    }

    li.addEventListener("click", function () {
      callbacks.selectPost(item.id);
    });

    list.appendChild(li);
  });
}

export function renderDetail(state, callbacks) {
  var emptyEl = document.getElementById("detail-empty");
  var contentEl = document.getElementById("detail-content");

  if (state.selectedFeedIndex === null || state.selectedPostId === null) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }

  var match = findPost(state.feeds, state.selectedPostId);
  if (!match) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  contentEl.hidden = false;

  var item = match.item;
  var feed = match.feed;
  document.getElementById("detail-title").textContent = item.title;
  document.getElementById("detail-toggle-read").textContent = item.read ? "Mark unread" : "Mark read";
  document.getElementById("detail-meta").textContent = formatDate(item.date) + " \u00b7 " + feed.title;
  document.getElementById("detail-body").innerHTML = sanitizeHTML(item.content, feed.url);
  var linkEl = document.getElementById("detail-link");
  if (item.link) {
    linkEl.href = item.link;
    linkEl.hidden = false;
  } else {
    linkEl.hidden = true;
  }
}

// ── Private helpers ──

function getPostsForSelection(state) {
  if (state.selectedFeedIndex === "all") {
    var posts = [];
    state.feeds.forEach(function (feed) {
      feed.items.forEach(function (item) {
        posts.push({ item: item, feedTitle: feed.title, feedUrl: feed.url });
      });
    });
    posts.sort(function (a, b) {
      return new Date(b.item.date || 0) - new Date(a.item.date || 0);
    });
    return posts;
  }
  var feed = state.feeds[state.selectedFeedIndex];
  if (!feed) return [];
  return feed.items.map(function (item) {
    return { item: item, feedTitle: feed.title, feedUrl: feed.url };
  });
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

function resolveURL(url, feedUrl) {
  if (!url || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  try {
    return new URL(url, feedUrl).href;
  } catch (e) {
    return url;
  }
}

function sanitizeHTML(html, feedUrl) {
  var div = document.createElement("div");
  div.innerHTML = html;
  // Remove script tags
  var scripts = div.querySelectorAll("script");
  scripts.forEach(function (s) { s.remove(); });
  // Resolve relative URLs and sanitize
  var all = div.querySelectorAll("*");
  all.forEach(function (el) {
    var attrs = Array.from(el.attributes);
    attrs.forEach(function (attr) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    });
    if (el.tagName === "IMG" && el.getAttribute("src")) {
      el.setAttribute("src", resolveURL(el.getAttribute("src"), feedUrl));
    }
    if (el.tagName === "A" && el.getAttribute("href")) {
      var href = el.getAttribute("href");
      if (href.toLowerCase().startsWith("javascript:")) {
        el.removeAttribute("href");
      } else {
        el.setAttribute("href", resolveURL(href, feedUrl));
      }
    }
  });
  return div.innerHTML;
}
