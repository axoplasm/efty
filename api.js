/**
 * Frontend API client — wraps fetch calls to the Efty backend.
 * A 401 response redirects to /login. All functions return Promises.
 */

async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (res.status === 401) {
        window.location.href = "/login";
        return null;
    }
    return res;
}

/**
 * Load all feeds (with items) for the current user.
 * @returns {Promise<Array>}
 */
export async function getFeeds() {
    const res = await apiFetch("/api/feeds");
    return res ? res.json() : [];
}

/**
 * Subscribe to a new feed by URL.
 * @param {string} url
 * @returns {Promise<{feed?: Object, error?: string}>}
 */
export async function addFeed(url) {
    const res = await apiFetch("/api/feeds", {
        method: "POST",
        body: JSON.stringify({ url }),
    });
    if (!res) return { error: "Not authenticated" };
    const data = await res.json();
    return res.ok ? { feed: data } : { error: data.error };
}

/**
 * Unsubscribe from a feed.
 * @param {number} feedId
 * @returns {Promise<boolean>}
 */
export async function removeFeed(feedId) {
    const res = await apiFetch(`/api/feeds/${feedId}`, { method: "DELETE" });
    return res ? res.ok : false;
}

/**
 * Re-fetch a feed's items from the source.
 * @param {number} feedId
 * @returns {Promise<{feed?: Object, error?: string}>}
 */
export async function refreshFeed(feedId) {
    const res = await apiFetch(`/api/feeds/${feedId}/refresh`, { method: "POST" });
    if (!res) return { error: "Not authenticated" };
    const data = await res.json();
    return res.ok ? { feed: data } : { error: data.error };
}

/**
 * Update the read status of an item.
 * @param {number} itemId
 * @param {boolean} read
 */
export async function setItemRead(itemId, read) {
    await apiFetch(`/api/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ read }),
    });
}

/** Log out and redirect to /login. */
export async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
}
