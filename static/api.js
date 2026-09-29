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
 * Turn a response carrying a feed into `{ feed }` or `{ error }`. Errors from
 * the app are JSON, but a proxy in front of it (e.g. nginx returning 502 when
 * the app is down or times out) sends an HTML page instead, so don't assume
 * the body parses.
 * @param {Response|null} res - From apiFetch; null after a 401 redirect.
 * @returns {Promise<{feed?: Object, error?: string}>}
 */
async function feedResult(res) {
    if (!res) return { error: "Not authenticated" };
    let data = null;
    try {
        data = await res.json();
    } catch {
        // Not JSON; fall through to a generic error.
    }
    if (res.ok && data) return { feed: data };
    return { error: data?.error ?? `Server error: ${res.status} ${res.statusText}` };
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
    try {
        const res = await apiFetch("/api/feeds", {
            method: "POST",
            body: JSON.stringify({ url }),
        });
        return await feedResult(res);
    } catch {
        return { error: "Could not reach the server" };
    }
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
    try {
        const res = await apiFetch(`/api/feeds/${feedId}/refresh`, { method: "POST" });
        return await feedResult(res);
    } catch {
        return { error: "Could not reach the server" };
    }
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
