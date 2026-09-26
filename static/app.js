import * as api from "/static/api.js";
import {
    NARROW_QUERY,
    render,
    renderPanes,
    renderPosts,
    findPost,
    findAdjacentPost,
    findNextPost,
} from "/static/render.js";

// ── State ──

// feeds: [{ id, url, title, items: [{ id, guid, title, link, date, summary, content, read }] }]
// selectedFeedId: integer feed DB id, "all", or null
// expandedPane: id of the pane shown in the narrow, stacked layout
const state = {
    feeds: [],
    selectedFeedId: null,
    selectedPostId: null,
    filter: "all",
    expandedPane: "feeds-pane",
};

// Callbacks passed into render functions so they can trigger actions without
// importing app.js (which would create a circular dependency).
const callbacks = { selectFeed, selectPost };

function rerender() {
    render(state, callbacks);
}

// ── Actions ──

function expandPane(paneId) {
    state.expandedPane = paneId;
    renderPanes(state);
}

/**
 * Show a feed's posts in the posts pane.
 * @param {number|string} feedId - A feed DB id, or "all".
 * @param {Object} [options]
 * @param {boolean} [options.expand=true] - Expand the posts pane in the narrow
 *     layout. Keyboard navigation within the feeds pane passes false.
 */
function selectFeed(feedId, { expand = true } = {}) {
    state.selectedFeedId = feedId;
    state.selectedPostId = null;
    if (expand) state.expandedPane = "posts-pane";
    rerender();
}

/**
 * Show a post in the detail pane and mark it read.
 * @param {number} id - The item's DB id.
 * @param {Object} [options]
 * @param {boolean} [options.expand=true] - Expand the detail pane in the
 *     narrow layout. Keyboard navigation within the posts pane passes false.
 */
function selectPost(id, { expand = true } = {}) {
    state.selectedPostId = id;
    if (expand) state.expandedPane = "detail-pane";
    const match = findPost(state.feeds, id);
    if (match && !match.item.read) {
        match.item.read = true;
        api.setItemRead(match.item.id, true);  // optimistic — fire and forget
    }
    rerender();
    document.getElementById("detail-pane").scrollTop = 0;
    resetOverscroll();
}

function toggleReadStatus() {
    if (state.selectedPostId === null) return;
    const match = findPost(state.feeds, state.selectedPostId);
    if (match) {
        match.item.read = !match.item.read;
        api.setItemRead(match.item.id, match.item.read);
        rerender();
    }
}

function removeFeed(feedId) {
    // Optimistic update — remove from local state immediately.
    const index = state.feeds.findIndex((f) => f.id === feedId);
    if (index !== -1) {
        state.feeds.splice(index, 1);
        if (state.selectedFeedId === feedId) {
            state.selectedFeedId = null;
            state.selectedPostId = null;
            state.expandedPane = "feeds-pane";
        }
        rerender();
    }
    api.removeFeed(feedId);
}

async function refreshFeed(feedId) {
    const { feed, error } = await api.refreshFeed(feedId);
    if (error) {
        console.error("Refresh failed:", error);
        return;
    }
    const index = state.feeds.findIndex((f) => f.id === feedId);
    if (index !== -1) state.feeds[index] = feed;
    rerender();
}

async function subscribeFeed(url) {
    const errorEl = document.getElementById("modal-error");
    const submitBtn = document.getElementById("modal-submit");

    if (state.feeds.some((f) => f.url === url)) {
        errorEl.textContent = "Already subscribed to this feed.";
        errorEl.hidden = false;
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Loading\u2026";
    errorEl.hidden = true;

    const { feed, error } = await api.addFeed(url);
    submitBtn.disabled = false;
    submitBtn.textContent = "Subscribe";

    if (error) {
        errorEl.textContent = error;
        errorEl.hidden = false;
        return;
    }

    state.feeds.push(feed);
    state.selectedFeedId = feed.id;
    state.selectedPostId = null;
    state.expandedPane = "posts-pane";
    rerender();
    closeModal();
}

// ── Scroll-past-end to advance ──
//
// Reaching the bottom of an article doesn't advance on its own: the article
// "sticks", and the reader has to deliberately keep scrolling past the end.
// Scrolling only counts once the gesture that reached the bottom has stopped
// (so trackpad momentum can't carry straight into the next post), and a push
// that stops short of the threshold snaps back to zero.

// How close (in px) to the bottom of the detail pane counts as "reached the end".
const SCROLL_END_SLOP = 4;
// How far (in px) past the end the reader must scroll to open the next post.
const OVERSCROLL_THRESHOLD = 200;
// A pause this long (in ms) ends a scroll gesture.
const GESTURE_IDLE_MS = 200;

const overscroll = {
    armed: false,   // true once a gesture has come to rest at the end
    distance: 0,    // how far past the end the current gesture has pushed
    idleTimer: null,
    touchY: null,
};

function isAtEnd(pane) {
    return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_END_SLOP;
}

function setOverscroll(distance) {
    overscroll.distance = distance;
    document.getElementById("detail-next-progress").value =
        Math.min(distance / OVERSCROLL_THRESHOLD, 1);
}

function resetOverscroll() {
    overscroll.armed = false;
    setOverscroll(0);
}

/**
 * Account for a downward (positive) or upward (negative) scroll attempt on
 * the detail pane, opening the next post once enough has built up past the end.
 * @param {HTMLElement} pane - The detail pane.
 * @param {number} delta - Scroll distance in px.
 */
function nudgeDetail(pane, delta) {
    clearTimeout(overscroll.idleTimer);
    overscroll.idleTimer = setTimeout(() => {
        overscroll.armed = isAtEnd(pane);
        setOverscroll(0);
    }, GESTURE_IDLE_MS);

    if (delta <= 0 || !isAtEnd(pane)) {
        resetOverscroll();
        return;
    }
    if (!overscroll.armed) return;

    setOverscroll(overscroll.distance + delta);
    if (overscroll.distance >= OVERSCROLL_THRESHOLD) openNextPost();
}

/** Open the post after the selected one and scroll it into view in the list. */
function openNextPost() {
    resetOverscroll();
    const next = findNextPost(state);
    if (!next) return;
    selectPost(next.id);
    scrollSelectedIntoView("posts-list");
}

/**
 * Scroll a list's selected entry into view. With the "unread" filter, a post
 * that was just opened is marked read and drops out of the list, so there may
 * be nothing to scroll to.
 * @param {string} listId - "feeds-list" or "posts-list".
 */
function scrollSelectedIntoView(listId) {
    document.querySelector(`#${listId} li.selected`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ── Keyboard navigation ──
//
// Left/right move focus between the panes. Up/down change the selected feed
// in the feeds pane and the selected post in the posts pane; in the detail
// pane they scroll the article as usual.

const PANE_ORDER = ["feeds-pane", "posts-pane", "detail-pane"];

/** Return the id of the pane containing keyboard focus, or null. */
function focusedPaneId() {
    return document.activeElement?.closest(PANE_ORDER.map((id) => `#${id}`).join(","))
        ?.id ?? null;
}

/**
 * Move focus to a pane, expanding it first in the narrow layout.
 * @param {string} paneId
 */
function focusPane(paneId) {
    expandPane(paneId);
    document.getElementById(paneId).focus();
}

/**
 * Select the feed above or below the selected one ("All Feeds" is first).
 * @param {number} step - 1 for down, -1 for up.
 */
function moveFeedSelection(step) {
    const ids = ["all", ...state.feeds.map((f) => f.id)];
    const index = ids.indexOf(state.selectedFeedId);
    const next = index === -1 ? 0 : index + step;
    if (next < 0 || next >= ids.length || next === index) return;
    selectFeed(ids[next], { expand: false });
    scrollSelectedIntoView("feeds-list");
}

/**
 * Open the post above or below the selected one.
 * @param {number} step - 1 for down, -1 for up.
 */
function movePostSelection(step) {
    const post = findAdjacentPost(state, step);
    if (!post) return;
    selectPost(post.id, { expand: false });
    scrollSelectedIntoView("posts-list");
}

/**
 * Handle arrow keys for pane and list navigation.
 * @param {KeyboardEvent} e
 */
function onKeydown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.getElementById("modal").open) return;
    if (e.target.closest("input, select, textarea, [contenteditable]")) return;

    let paneId = focusedPaneId();
    if (!paneId) {
        // Nothing focused yet: start in the feeds pane.
        paneId = "feeds-pane";
        document.getElementById(paneId).focus();
    }
    const paneIndex = PANE_ORDER.indexOf(paneId);

    switch (e.key) {
        case "ArrowLeft":
        case "ArrowRight": {
            const step = e.key === "ArrowRight" ? 1 : -1;
            const target = PANE_ORDER[paneIndex + step];
            e.preventDefault();
            focusPane(target ?? paneId);
            break;
        }
        case "ArrowUp":
        case "ArrowDown": {
            const step = e.key === "ArrowDown" ? 1 : -1;
            if (paneId === "feeds-pane") {
                e.preventDefault();
                moveFeedSelection(step);
            } else if (paneId === "posts-pane") {
                e.preventDefault();
                movePostSelection(step);
            }
            // In the detail pane, let the browser scroll the article.
            break;
        }
    }
}

/**
 * Convert a wheel event's delta to px.
 * @param {WheelEvent} e
 * @returns {number}
 */
function wheelDeltaPx(e) {
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return e.deltaY * e.currentTarget.clientHeight;
    }
    return e.deltaY;
}

function bindOverscroll() {
    const pane = document.getElementById("detail-pane");
    pane.addEventListener("wheel", (e) => nudgeDetail(pane, wheelDeltaPx(e)), {
        passive: true,
    });
    pane.addEventListener("touchstart", (e) => {
        overscroll.touchY = e.touches[0].clientY;
    }, { passive: true });
    pane.addEventListener("touchmove", (e) => {
        const y = e.touches[0].clientY;
        nudgeDetail(pane, overscroll.touchY - y);
        overscroll.touchY = y;
    }, { passive: true });
}

// ── Modal ──

function openModal() {
    document.getElementById("modal").showModal();
    document.getElementById("feed-url-input").value = "";
    document.getElementById("modal-error").hidden = true;
    document.getElementById("feed-url-input").focus();
}

function closeModal() {
    document.getElementById("modal").close();
}

// ── Event Binding ──

async function init() {
    state.feeds = await api.getFeeds();
    rerender();

    document.getElementById("subscribe-btn").addEventListener("click", openModal);
    document.getElementById("logout-btn").addEventListener("click", () => api.logout());
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById("subscribe-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const url = document.getElementById("feed-url-input").value.trim();
        if (url) subscribeFeed(url);
    });

    document.getElementById("posts-filter").addEventListener("change", (e) => {
        state.filter = e.target.value;
        renderPosts(state, callbacks);
    });

    document.getElementById("detail-toggle-read").addEventListener("click", toggleReadStatus);
    bindOverscroll();

    document.getElementById("feed-refresh").addEventListener("click", async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        try {
            await refreshFeed(state.selectedFeedId);
        } finally {
            button.disabled = false;
        }
    });
    document.getElementById("feed-remove").addEventListener("click", () => {
        const feed = state.feeds.find((f) => f.id === state.selectedFeedId);
        if (feed && window.confirm(`Unsubscribe from “${feed.title}”?`)) {
            removeFeed(feed.id);
        }
    });

    for (const toggle of document.querySelectorAll(".pane-toggle")) {
        toggle.addEventListener("click", () => {
            expandPane(toggle.getAttribute("aria-controls"));
        });
    }
    document.addEventListener("keydown", onKeydown);
    window.matchMedia(NARROW_QUERY).addEventListener("change", () => {
        renderPanes(state);
    });
    document.getElementById("detail-next-title").addEventListener("click", openNextPost);
}

init();
