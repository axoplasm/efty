const STORAGE_KEY = "efty_data";

export function save(feeds) {
  var data = feeds.map(function (f) {
    return {
      url: f.url,
      title: f.title,
      items: f.items.map(function (item) {
        return { id: item.id, title: item.title, link: item.link, date: item.date, summary: item.summary, content: item.content, read: item.read };
      }),
    };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function load() {
  var raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // corrupted data — start fresh
    return null;
  }
}
