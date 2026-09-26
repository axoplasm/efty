import * as api from "/static/api.js";
import { render, renderPosts, findPost, findNextPost } from "/static/render.js";

// ── State ──

// feeds: [{ id, url, title, items: [{ id, guid, title, link, date, summary, content, read }] }]
// selectedFeedId: integer feed DB id, "all", or null
const state = {
    feeds: [],
    selectedFeedId: null,
    selectedPostId: null,
    filter: "all",
};

// Callbacks passed into render functions so they can trigger actions without
// importing app.js (which would create a circular dependency).
const callbacks = { selectFeed, selectPost, removeFeed, refreshFeed };

function rerender() {
    render(state, callbacks);
}

// ── Actions ──

function selectFeed(feedId) {
    state.selectedFeedId = feedId;
    state.selectedPostId = null;
    rerender();
}

function selectPost(id) {
    state.selectedPostId = id;
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
    // With the "unread" filter the newly read post drops out of the list, so
    // there may be nothing to scroll to.
    document.querySelector(`#posts-list li[data-id="${next.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    document.getElementById("detail-next-title").addEventListener("click", openNextPost);
}

init();
