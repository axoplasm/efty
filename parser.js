const CORS_PROXY = "/proxy?url=";

export function fetchFeed(url) {
  return fetch(CORS_PROXY + encodeURIComponent(url))
    .then(function (res) {
      if (!res.ok) throw new Error("Network error: " + res.status);
      return res.text();
    })
    .then(function (text) {
      return parseRSS(text, url);
    });
}

function parseRSS(text, feedUrl) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(text, "text/xml");

  var errorNode = doc.querySelector("parsererror");
  if (errorNode) throw new Error("Invalid RSS/Atom feed");

  // Try RSS 2.0
  var channel = doc.querySelector("channel");
  if (channel) {
    return parseRSS2(channel, feedUrl);
  }

  // Try Atom
  var atomFeed = doc.querySelector("feed");
  if (atomFeed) {
    return parseAtom(atomFeed, feedUrl);
  }

  throw new Error("Unrecognized feed format");
}

function parseRSS2(channel, feedUrl) {
  var titleEl = channel.querySelector(":scope > title");
  var title = titleEl ? titleEl.textContent.trim() : feedUrl;
  var itemEls = channel.querySelectorAll("item");
  var items = [];
  itemEls.forEach(function (el) {
    items.push({
      id: getTextContent(el, "guid") || getTextContent(el, "link") || getTextContent(el, "title"),
      title: getTextContent(el, "title") || "Untitled",
      link: getTextContent(el, "link") || "",
      date: getTextContent(el, "pubDate") || "",
      summary: stripHTML(getTextContent(el, "description") || "").slice(0, 200),
      content: getTextContent(el, "content\\:encoded") || getTextContent(el, "description") || "",
      read: false,
    });
  });
  return { url: feedUrl, title: title, items: items };
}

function parseAtom(feed, feedUrl) {
  var titleEl = feed.querySelector(":scope > title");
  var title = titleEl ? titleEl.textContent.trim() : feedUrl;
  var entryEls = feed.querySelectorAll("entry");
  var items = [];
  entryEls.forEach(function (el) {
    var linkEl = el.querySelector("link[href]");
    var link = linkEl ? linkEl.getAttribute("href") : "";
    var contentEl = el.querySelector("content") || el.querySelector("summary");
    var contentText = contentEl ? contentEl.textContent : "";
    items.push({
      id: getTextContent(el, "id") || link || getTextContent(el, "title"),
      title: getTextContent(el, "title") || "Untitled",
      link: link,
      date: getTextContent(el, "updated") || getTextContent(el, "published") || "",
      summary: stripHTML(contentText).slice(0, 200),
      content: contentText,
      read: false,
    });
  });
  return { url: feedUrl, title: title, items: items };
}

function getTextContent(parent, tagName) {
  var el = parent.querySelector(tagName);
  return el ? el.textContent.trim() : "";
}

function stripHTML(html) {
  var div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}
