// ── Exported query helpers (also used by app.js actions) ──

/**
 * Find a post by ID across all feeds.
 * @param {Array} feeds
 * @param {number} id - The item's database ID.
 * @returns {{item: Object, feed: Object}|null}
 */
export function findPost(feeds, id) {
    for (const feed of feeds) {
        const item = feed.items.find((p) => p.id === id);
        if (item) return { item, feed };
    }
    return null;
}

/**
 * Find the post listed after the selected one, respecting the current filter.
 * The selected post itself may have been filtered out (e.g. marked read while
 * the "unread" filter is on), so position is taken from the unfiltered list.
 * @param {Object} state
 * @returns {Object|null} The next item, or null if there is none.
 */
export function findNextPost(state) {
    const posts = getPostsForSelection(state);
    const index = posts.findIndex((p) => p.item.id === state.selectedPostId);
    if (index === -1) return null;
    const next = posts
        .slice(index + 1)
        .find((p) => matchesFilter(p.item, state.filter));
    return next?.item ?? null;
}

// ── Render ──

// Below this width the panes stack vertically and only one is expanded at a
// time. Keep in sync with the matching @media rule in style.css.
export const NARROW_QUERY = "(width < 48rem)";

/**
 * Re-render all three panes.
 * @param {Object} state
 * @param {Object} callbacks - { selectFeed, selectPost }
 */
export function render(state, callbacks) {
    renderPanes(state);
    renderFeeds(state, callbacks);
    renderPosts(state, callbacks);
    renderDetail(state, callbacks);
}

/**
 * Mark the expanded pane. The pane titles only act as expand/collapse toggles
 * in the narrow, stacked layout; in the wide layout they are disabled.
 * @param {Object} state
 */
export function renderPanes(state) {
    const narrow = window.matchMedia(NARROW_QUERY).matches;
    for (const toggle of document.querySelectorAll(".pane-toggle")) {
        const paneId = toggle.getAttribute("aria-controls");
        const expanded = paneId === state.expandedPane;
        document.getElementById(paneId).classList.toggle("expanded", expanded);
        toggle.disabled = !narrow;
        if (narrow) {
            toggle.setAttribute("aria-expanded", expanded);
        } else {
            toggle.removeAttribute("aria-expanded");
        }
    }
}

/**
 * Rebuild the feeds sidebar from current state.
 * @param {Object} state
 * @param {Object} callbacks
 */
export function renderFeeds(state, callbacks) {
    const list = document.getElementById("feeds-list");
    list.innerHTML = "";

    // "All" entry
    const allLi = document.createElement("li");
    if (state.selectedFeedId === "all") allLi.classList.add("selected");
    const allTitle = document.createElement("span");
    allTitle.className = "feed-title";
    allTitle.textContent = "All Feeds";
    allLi.appendChild(allTitle);
    const totalUnread = state.feeds.reduce(
        (sum, f) => sum + f.items.filter((item) => !item.read).length,
        0
    );
    if (totalUnread > 0) {
        const allBadge = document.createElement("span");
        allBadge.className = "feed-unread-count";
        allBadge.textContent = totalUnread;
        allLi.appendChild(allBadge);
    }
    allLi.addEventListener("click", () => callbacks.selectFeed("all"));
    list.appendChild(allLi);

    for (const feed of state.feeds) {
        const li = document.createElement("li");
        if (state.selectedFeedId === feed.id) li.classList.add("selected");

        const titleSpan = document.createElement("span");
        titleSpan.className = "feed-title";
        titleSpan.textContent = feed.title;
        li.appendChild(titleSpan);

        const unreadCount = feed.items.filter((item) => !item.read).length;
        if (unreadCount > 0) {
            const badge = document.createElement("span");
            badge.className = "feed-unread-count";
            badge.textContent = unreadCount;
            li.appendChild(badge);
        }

        li.addEventListener("click", () => callbacks.selectFeed(feed.id));
        list.appendChild(li);
    }
}

/**
 * Rebuild the posts list for the currently selected feed.
 * @param {Object} state
 * @param {Object} callbacks
 */
export function renderPosts(state, callbacks) {
    const list = document.getElementById("posts-list");
    const titleEl = document.getElementById("posts-title");
    list.innerHTML = "";

    if (state.selectedFeedId === null) {
        titleEl.textContent = "Posts";
        document.getElementById("feed-actions").hidden = true;
        return;
    }

    const selectedFeed = state.feeds.find((f) => f.id === state.selectedFeedId);
    // Refresh/unsubscribe only apply to a single feed, not "All Feeds".
    document.getElementById("feed-actions").hidden = !selectedFeed;
    titleEl.textContent = state.selectedFeedId === "all"
        ? "All Feeds"
        : (selectedFeed?.title ?? "");

    const posts = getPostsForSelection(state);
    const filtered = posts.filter((p) => matchesFilter(p.item, state.filter));

    for (const p of filtered) {
        const { item } = p;
        const li = document.createElement("li");
        li.dataset.id = item.id;
        if (!item.read) li.classList.add("unread");
        if (state.selectedPostId === item.id) li.classList.add("selected");

        if (state.selectedFeedId === "all" && item.link) {
            const thumb = document.createElement("img");
            thumb.className = "post-thumb";
            thumb.src = `/api/items/${item.id}/thumbnail`;
            thumb.alt = "";
            thumb.loading = "lazy";
            thumb.addEventListener("error", () => thumb.remove());
            li.appendChild(thumb);
        }

        const titleDiv = document.createElement("div");
        titleDiv.className = "post-title";

        if (!item.read) {
            const dot = document.createElement("span");
            dot.className = "unread-dot";
            titleDiv.appendChild(dot);
        }

        const titleText = document.createElement("span");
        titleText.textContent = item.title;
        titleDiv.appendChild(titleText);
        li.appendChild(titleDiv);

        const metaLine = document.createElement("div");
        metaLine.className = "post-date";
        const parts = [];
        if (item.date) parts.push(formatDate(item.date));
        parts.push(p.feedTitle);
        metaLine.textContent = parts.join(" \u00b7 ");
        li.appendChild(metaLine);

        if (item.summary) {
            const snippetDiv = document.createElement("div");
            snippetDiv.className = "post-snippet";
            snippetDiv.textContent = item.summary;
            li.appendChild(snippetDiv);
        }

        li.addEventListener("click", () => callbacks.selectPost(item.id));
        list.appendChild(li);
    }
}

/**
 * Rebuild the detail view for the currently selected post.
 * @param {Object} state
 * @param {Object} callbacks
 */
export function renderDetail(state, callbacks) {
    const emptyEl = document.getElementById("detail-empty");
    const contentEl = document.getElementById("detail-content");

    if (state.selectedFeedId === null || state.selectedPostId === null) {
        emptyEl.hidden = false;
        contentEl.hidden = true;
        return;
    }

    const match = findPost(state.feeds, state.selectedPostId);
    if (!match) {
        emptyEl.hidden = false;
        contentEl.hidden = true;
        return;
    }

    emptyEl.hidden = true;
    contentEl.hidden = false;

    const { item, feed } = match;
    document.getElementById("detail-title").textContent = item.title;
    document.getElementById("detail-toggle-read").textContent =
        item.read ? "Mark unread" : "Mark read";
    document.getElementById("detail-meta").textContent =
        formatDate(item.date) + " \u00b7 " + feed.title;
    document.getElementById("detail-body").innerHTML =
        sanitizeHTML(item.content, feed.url);

    const linkEl = document.getElementById("detail-link");
    if (item.link) {
        linkEl.href = item.link;
        linkEl.hidden = false;
    } else {
        linkEl.hidden = true;
    }

    const next = findNextPost(state);
    document.getElementById("detail-next").hidden = !next;
    document.getElementById("detail-next-title").textContent = next?.title ?? "";
}

// ── Private helpers ──

function getPostsForSelection(state) {
    if (state.selectedFeedId === "all") {
        const posts = state.feeds.flatMap((feed) =>
            feed.items.map((item) => ({ item, feedTitle: feed.title, feedUrl: feed.url }))
        );
        posts.sort((a, b) => new Date(b.item.date || 0) - new Date(a.item.date || 0));
        return posts;
    }
    const feed = state.feeds.find((f) => f.id === state.selectedFeedId);
    if (!feed) return [];
    return feed.items.map((item) => ({ item, feedTitle: feed.title, feedUrl: feed.url }));
}

function matchesFilter(item, filter) {
    if (filter === "unread") return !item.read;
    if (filter === "read") return item.read;
    return true;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString(undefined, {
            year: "numeric", month: "short", day: "numeric",
        });
    } catch (e) {
        return dateStr;
    }
}

function resolveURL(url, feedUrl) {
    if (!url
        || url.startsWith("http://")
        || url.startsWith("https://")
        || url.startsWith("data:")) {
        return url;
    }
    try {
        return new URL(url, feedUrl).href;
    } catch (e) {
        return url;
    }
}

function sanitizeHTML(html, feedUrl) {
    const div = document.createElement("div");
    div.innerHTML = html;
    // Remove script tags
    div.querySelectorAll("script").forEach((s) => s.remove());
    // Resolve relative URLs and strip event handlers
    div.querySelectorAll("*").forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
            if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
        });
        if (el.tagName === "IMG" && el.getAttribute("src")) {
            el.setAttribute("src", resolveURL(el.getAttribute("src"), feedUrl));
        }
        if (el.tagName === "A" && el.getAttribute("href")) {
            const href = el.getAttribute("href");
            if (href.toLowerCase().startsWith("javascript:")) {
                el.removeAttribute("href");
            } else {
                el.setAttribute("href", resolveURL(href, feedUrl));
            }
        }
    });
    return div.innerHTML;
}
