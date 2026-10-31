// NguonC VietSub — experimental Zangetsu JavaScript provider.
// v0.2.0: prefers episode servers labelled Vietsub. No external subtitle files
// are required: the intention is to play video where Vietnamese subtitles are
// already burned into the picture (hardsub), when the provider offers that cut.
//
// IMPORTANT: NguonC often returns embed-page URLs rather than direct media URLs.
// This provider does not bypass embed protections or invent an extractor API.
// Direct HLS/MP4 URLs are returned only when the API actually exposes them.

var API = "https://phim.nguonc.com/api";
var SITE = "https://phim.nguonc.com";

function getInfo() {
  return {
    name: "NguonC VietSub",
    lang: "vi",
    baseUrl: SITE,
    type: "anime",
    version: "0.2.0"
  };
}

function api(path) {
  return fetch(API + path, {
    headers: { "Accept": "application/json" },
    timeoutMs: 15000
  }).then(function (r) {
    if (r.status < 200 || r.status >= 300) {
      throw new Error("NguonC HTTP " + r.status);
    }
    var data = JSON.parse(r.body || "{}");
    if (data.status !== "success") throw new Error("NguonC API returned an error");
    return data;
  });
}

function listItems(data) {
  if (Array.isArray(data.items)) return data.items;
  if (data.data && Array.isArray(data.data.items)) return data.data.items;
  return [];
}

function toItem(m) {
  if (!m || !m.slug) return null;
  return {
    id: String(m._id || m.slug),
    title: String(m.name || m.origin_name || m.slug),
    englishTitle: String(m.origin_name || ""),
    cover: m.thumb_url || m.poster_url || null,
    url: String(m.slug),
    type: "anime",
    year: m.year || null
  };
}

function search(query, page, opts) {
  var q = String(query || "").trim();
  var p = Math.max(1, Number(page || 1));
  if (!q) return Promise.resolve([]);
  return api("/films/search?keyword=" + encodeURIComponent(q) + "&page=" + p)
    .then(function (data) {
      return listItems(data).map(toItem).filter(Boolean);
    });
}

function popular(opts) {
  var p = Math.max(1, Number((opts && opts.page) || 1));
  return api("/films/phim-moi-cap-nhat?page=" + p)
    .then(function (data) {
      return listItems(data).map(toItem).filter(Boolean);
    });
}

function getHome(opts) {
  return Promise.all([
    api("/films/danh-sach/hoat-hinh?page=1").catch(function () { return null; }),
    api("/films/phim-moi-cap-nhat?page=1").catch(function () { return null; })
  ]).then(function (data) {
    var sections = [];
    var anime = data[0] ? listItems(data[0]).map(toItem).filter(Boolean) : [];
    var latest = data[1] ? listItems(data[1]).map(toItem).filter(Boolean) : [];
    if (anime.length) sections.push({ title: "Hoạt hình", items: anime });
    if (latest.length) sections.push({ title: "Mới cập nhật", items: latest });
    return sections;
  });
}

function getDetail(url, opts) {
  var slug = String(url || "").replace(/^\/+|\/+$/g, "");
  return api("/film/" + encodeURIComponent(slug)).then(function (data) {
    var m = data.movie || {};
    var episodes = [];
    var servers = Array.isArray(m.episodes) ? m.episodes : [];

    servers.forEach(function (server) {
      var serverName = String(server.server_name || "");
      var items = Array.isArray(server.items) ? server.items : [];
      items.forEach(function (ep) {
        var epUrl = ep.embed || ep.m3u8 || ep.link || "";
        if (!epUrl) return;
        episodes.push({
          id: String(ep.slug || ep.name || (episodes.length + 1)),
          number: episodes.length + 1,
          title: String(ep.name || ("Tập " + (episodes.length + 1))),
          url: String(epUrl),
          serverName: serverName,
          // Mark the server cut; this label is not proof that every episode
          // has hardsub, so users should verify playback.
          audioKind: /viet\s*sub|vietsub|phụ đề việt/i.test(serverName) ? "sub" : "unknown"
        });
      });
    });

    return {
      id: String(m.id || slug),
      title: String(m.name || slug),
      englishTitle: String(m.original_name || ""),
      cover: m.thumb_url || m.poster_url || null,
      description: String(m.description || ""),
      year: m.year || null,
      status: String(m.current_episode || ""),
      type: "anime",
      episodes: episodes
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (detail) {
    return (detail.episodes || []).filter(function (ep) {
      return ep.audioKind === "sub";
    });
  });
}

function getVideoSources(episodeUrl, opts) {
  var url = String(episodeUrl || "");
  // Only return direct playable media supplied by the API. An embed page is
  // not a video stream; Zangetsu's installed extractors must handle it.
  if (!/^https?:\/\/.+\.(m3u8|mp4)(?:[?#].*)?$/i.test(url)) {
    return Promise.reject(new Error(
      "NguonC: máy chủ này trả về trang nhúng, không phải luồng video trực tiếp. " +
      "Bản thử nghiệm chưa xác nhận extractor tương thích cho máy chủ này."
    ));
  }
  return Promise.resolve([{
    url: url,
    quality: "auto",
    headers: { "Referer": SITE + "/" }
  }]);
}
