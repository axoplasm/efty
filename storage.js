const STORAGE_KEY = "efty_data";

/**
 * Persist the feeds array to localStorage.
 * @param {Array} feeds
 */
export function save(feeds) {
    const data = feeds.map((f) => ({
        url: f.url,
        title: f.title,
        items: f.items.map(({ id, title, link, date, summary, content, read }) => (
            { id, title, link, date, summary, content, read }
        )),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Load the feeds array from localStorage.
 * @returns {Array|null} Parsed feeds, or null if absent or corrupted.
 */
export function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        // corrupted data — start fresh
        return null;
    }
}
