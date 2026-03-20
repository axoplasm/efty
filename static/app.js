import * as api from "/static/api.js";
import { render, renderPosts, findPost } from "/static/render.js";

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
}

init();
