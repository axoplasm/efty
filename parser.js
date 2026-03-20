const CORS_PROXY = "/proxy?url=";

/**
 * Fetch and parse an RSS or Atom feed from the given URL via the CORS proxy.
 * @param {string} url - The feed URL to fetch.
 * @returns {Promise<Object>} Parsed feed object with title, url, and items.
 */
export function fetchFeed(url) {
    return fetch(CORS_PROXY + encodeURIComponent(url))
        .then((res) => {
            if (!res.ok) throw new Error("Network error: " + res.status);
            return res.text();
        })
        .then((text) => parseRSS(text, url));
}

function parseRSS(text, feedUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");

    if (doc.querySelector("parsererror")) throw new Error("Invalid RSS/Atom feed");

    // Try RSS 2.0
    const channel = doc.querySelector("channel");
    if (channel) return parseRSS2(channel, feedUrl);

    // Try Atom
    const atomFeed = doc.querySelector("feed");
    if (atomFeed) return parseAtom(atomFeed, feedUrl);

    throw new Error("Unrecognized feed format");
}

function parseRSS2(channel, feedUrl) {
    const titleEl = channel.querySelector(":scope > title");
    const title = titleEl ? titleEl.textContent.trim() : feedUrl;
    const items = Array.from(channel.querySelectorAll("item")).map((el) => ({
        id: getTextContent(el, "guid") || getTextContent(el, "link") || getTextContent(el, "title"),
        title: getTextContent(el, "title") || "Untitled",
        link: getTextContent(el, "link") || "",
        date: getTextContent(el, "pubDate") || "",
        summary: stripHTML(getTextContent(el, "description") || "").slice(0, 200),
        content: getTextContent(el, "content\\:encoded") || getTextContent(el, "description") || "",
        read: false,
    }));
    return { url: feedUrl, title, items };
}

function parseAtom(feed, feedUrl) {
    const titleEl = feed.querySelector(":scope > title");
    const title = titleEl ? titleEl.textContent.trim() : feedUrl;
    const items = Array.from(feed.querySelectorAll("entry")).map((el) => {
        const linkEl = el.querySelector("link[href]");
        const link = linkEl ? linkEl.getAttribute("href") : "";
        const contentEl = el.querySelector("content") || el.querySelector("summary");
        const contentText = contentEl ? contentEl.textContent : "";
        return {
            id: getTextContent(el, "id") || link || getTextContent(el, "title"),
            title: getTextContent(el, "title") || "Untitled",
            link,
            date: getTextContent(el, "updated") || getTextContent(el, "published") || "",
            summary: stripHTML(contentText).slice(0, 200),
            content: contentText,
            read: false,
        };
    });
    return { url: feedUrl, title, items };
}

function getTextContent(parent, tagName) {
    const el = parent.querySelector(tagName);
    return el ? el.textContent.trim() : "";
}

function stripHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
}
