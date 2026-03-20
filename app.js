import { save, load } from "./storage.js";
import { fetchFeed } from "./parser.js";
import { render, renderPosts, findPost } from "./render.js";

// ── State ──

// feeds: [{ url, title, items: [{ id, title, link, date, summary, content, read }] }]
const state = {
    feeds: [],
    selectedFeedIndex: null,
    selectedPostId: null,
    filter: "all",
};

// Callbacks passed into render functions so they can trigger actions without
// importing app.js (which would create a circular dependency).
const callbacks = { selectFeed, selectPost, removeFeed };

function rerender() {
    render(state, callbacks);
}

// ── Actions ──

function selectFeed(index) {
    state.selectedFeedIndex = index;
    state.selectedPostId = null;
    rerender();
}

function selectPost(id) {
    state.selectedPostId = id;
    const match = findPost(state.feeds, id);
    if (match && !match.item.read) {
        match.item.read = true;
        save(state.feeds);
    }
    rerender();
}

function toggleReadStatus() {
    if (state.selectedPostId === null) return;
    const match = findPost(state.feeds, state.selectedPostId);
    if (match) {
        match.item.read = !match.item.read;
        save(state.feeds);
        rerender();
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
    save(state.feeds);
    rerender();
}

function subscribeFeed(url) {
    const errorEl = document.getElementById("modal-error");
    const submitBtn = document.getElementById("modal-submit");

    // Check for duplicates
    if (state.feeds.some((f) => f.url === url)) {
        errorEl.textContent = "Already subscribed to this feed.";
        errorEl.hidden = false;
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Loading\u2026";
    errorEl.hidden = true;

    fetchFeed(url)
        .then((feed) => {
            state.feeds.push(feed);
            state.selectedFeedIndex = state.feeds.length - 1;
            state.selectedPostId = null;
            save(state.feeds);
            rerender();
            closeModal();
        })
        .catch((err) => {
            errorEl.textContent = "Failed to load feed: " + err.message;
            errorEl.hidden = false;
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = "Subscribe";
        });
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

function init() {
    const stored = load();
    if (stored) state.feeds = stored;

    document.getElementById("subscribe-btn").addEventListener("click", openModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);

    // Close when clicking the dialog backdrop (target is the <dialog> itself)
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

    rerender();
}

init();
