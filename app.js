import { save, load } from "./storage.js";
import { fetchFeed } from "./parser.js";
import { render, renderPosts, findPost } from "./render.js";

// ── State ──

var state = {
  feeds: [],    // [{ url, title, items: [{ id, title, link, date, summary, content, read }] }]
  selectedFeedIndex: null,
  selectedPostId: null,
  filter: "all",
};

// Callbacks passed into render functions so they can trigger actions without
// importing app.js (which would create a circular dependency).
var callbacks = {
  selectFeed: selectFeed,
  selectPost: selectPost,
  removeFeed: removeFeed,
};

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
  var match = findPost(state.feeds, id);
  if (match && !match.item.read) {
    match.item.read = true;
    save(state.feeds);
  }
  rerender();
}

function toggleReadStatus() {
  if (state.selectedPostId === null) return;
  var match = findPost(state.feeds, state.selectedPostId);
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
      state.feeds.push(feed);
      state.selectedFeedIndex = state.feeds.length - 1;
      state.selectedPostId = null;
      save(state.feeds);
      rerender();
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
  var stored = load();
  if (stored) state.feeds = stored;

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
    renderPosts(state, callbacks);
  });

  document.getElementById("detail-toggle-read").addEventListener("click", toggleReadStatus);

  // Keyboard shortcut: Escape to close modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  rerender();
}

init();
