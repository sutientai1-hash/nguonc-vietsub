// NguonC VietSub — native Zangetsu JavaScript provider
// Version: 0.3.0
// Based on the public Zangetsu provider contract. This provider uses only
// documented NguonC catalogue/detail API responses. It does not bypass or
// reverse-engineer third-party embedded players.

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'nguonc-vietsub';
var API = 'https://phim.nguonc.com/api';
var SITE = 'https://phim.nguonc.com';
var TTL = 180000;
var _cache = {};

function getInfo() {
  return {
    name: 'NguonC VietSub',
    lang: 'vi',
    baseUrl: SITE,
    logo: SITE + '/favicon.ico',
    type: 'anime',
    version: '0.3.0'
  };
}

function _getJson(url) {
  var now = Date.now();
  var hit = _cache[url];
  if (hit && now - hit.at < TTL) return Promise.resolve(hit.value);
  return fetch(url, { headers: { 'Accept': 'application/json' }, timeoutMs: 12000 })
    .then(function (r) {
      var body = r && r.body ? r.body : '';
      var data;
      try { data = JSON.parse(body); }
      catch (e) { throw new Error('NguonC: API trả dữ liệu không phải JSON'); }
      if (!data || data.status !== 'success') {
        throw new Error((data && data.msg) || 'NguonC: API không trả về thành công');
      }
      _cache[url] = { at: Date.now(), value: data };
      return data;
    });
}

function _str(v) { return v == null ? '' : String(v); }
function _image(v) {
  var s = _str(v);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return 'https://phim.nguonc.com' + (s.charAt(0) === '/' ? '' : '/') + s;
}
function _item(raw) {
  raw = raw || {};
  var slug = _str(raw.slug || raw._id || raw.id);
  var title = _str(raw.name || raw.title || raw.origin_name || slug);
  if (!slug || !title) return null;
  return {
    id: slug,
    title: title,
    englishTitle: _str(raw.origin_name || raw.original_name || title),
    url: slug,
    cover: _image(raw.poster_url || raw.thumb_url || raw.poster),
    type: 'anime',
    sourceId: SOURCE_ID,
    year: raw.year || null,
    description: _str(raw.description || raw.content || '')
  };
}
function _items(arr) {
  var out = [], seen = {};
  arr = Array.isArray(arr) ? arr : [];
  for (var i = 0; i < arr.length; i++) {
    var x = _item(arr[i]);
    if (x && !seen[x.id]) { seen[x.id] = 1; out.push(x); }
  }
  return out;
}

function search(query, page, opts) {
  var q = _str(query).trim();
  var p = Math.max(1, parseInt(page || 1, 10) || 1);
  if (!q) return Promise.resolve([]);
  var url = API + '/films/search?keyword=' + encodeURIComponent(q) + '&page=' + p;
  return _getJson(url).then(function (j) { return _items(j.items); })
    .catch(function () { return []; });
}

function getHome(opts) {
  var url = API + '/films/phim-moi-cap-nhat?page=1';
  return _getJson(url).then(function (j) {
    var items = _items(j.items);
    return items.length ? [{ title: 'Phim mới cập nhật', items: items }] : [];
  }).catch(function () { return []; });
}

function _isVietSub(label) {
  return /viet\s*sub|vietsub|phụ đề việt|phu de viet/i.test(_str(label));
}
function _directUrl(item) {
  if (!item) return '';
  var candidates = [item.link_m3u8, item.m3u8, item.file, item.url, item.link];
  for (var i = 0; i < candidates.length; i++) {
    var u = _str(candidates[i]).trim();
    if (/^https?:\/\//i.test(u) && /\.(m3u8|mp4)(?:[?#]|$)/i.test(u)) return u;
  }
  return '';
}

function getDetail(url, opts) {
  var slug = _str(url).replace(/^.*\//, '').trim();
  if (!slug) return Promise.reject(new Error('NguonC: thiếu mã phim'));
  return _getJson(API + '/film/' + encodeURIComponent(slug)).then(function (j) {
    var movie = j.movie || {};
    var groups = Array.isArray(movie.episodes) ? movie.episodes : [];
    var episodes = [];
    var hasVietSubGroup = false;
    for (var vg = 0; vg < groups.length; vg++) {
      var vgName = _str(groups[vg] && (groups[vg].server_name || groups[vg].name));
      if (_isVietSub(vgName)) hasVietSubGroup = true;
    }
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g] || {};
      var server = _str(group.server_name || group.name || '');
      if (hasVietSubGroup && !_isVietSub(server)) continue;
      var items = Array.isArray(group.items) ? group.items : [];
      // Prefer server groups explicitly marked Vietsub, but retain other groups
      // when the API does not label any group; each episode keeps its server tag.
      for (var k = 0; k < items.length; k++) {
        var ep = items[k] || {};
        var epSlug = _str(ep.slug || ep.name || (k + 1));
        var numMatch = epSlug.match(/\d+(?:\.\d+)?/);
        var number = numMatch ? parseFloat(numMatch[0]) : episodes.length + 1;
        episodes.push({
          id: 'nguonc://' + encodeURIComponent(slug) + '/' + encodeURIComponent(server) + '/' + encodeURIComponent(epSlug),
          number: number,
          title: _str(ep.name || ('Tập ' + number)),
          url: 'nguonc://' + encodeURIComponent(slug) + '/' + encodeURIComponent(server) + '/' + encodeURIComponent(epSlug),
          _server: server,
          _embed: _str(ep.embed || ep.link_embed || ''),
          _direct: _directUrl(ep)
        });
      }
    }
    episodes.sort(function (a, b) { return a.number - b.number; });
    var category = [];
    var cats = Array.isArray(movie.category) ? movie.category : [];
    for (var c = 0; c < cats.length; c++) {
      var list = cats[c] && cats[c].list;
      if (!Array.isArray(list)) continue;
      for (var z = 0; z < list.length; z++) {
        if (list[z] && list[z].name) category.push(list[z].name);
      }
    }
    return {
      id: slug,
      title: _str(movie.name || movie.original_name || slug),
      englishTitle: _str(movie.original_name || movie.name || slug),
      url: slug,
      cover: _image(movie.poster_url || movie.thumb_url),
      description: _str(movie.description || ''),
      year: movie.year || null,
      status: _str(movie.current_episode || movie.total_episodes || ''),
      genres: category,
      type: 'anime',
      sourceId: SOURCE_ID,
      episodes: episodes
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) { return d.episodes || []; });
}

function getVideoSources(episodeUrl) {
  var raw = _str(episodeUrl);
  var parts = raw.replace(/^nguonc:\/\//, '').split('/');
  if (parts.length < 3) return Promise.reject(new Error('NguonC: đường dẫn tập không hợp lệ'));
  var slug, server, epSlug;
  try {
    slug = decodeURIComponent(parts[0]);
    server = decodeURIComponent(parts[1]);
    epSlug = decodeURIComponent(parts.slice(2).join('/'));
  } catch (e) {
    return Promise.reject(new Error('NguonC: không đọc được mã tập'));
  }
  return _getJson(API + '/film/' + encodeURIComponent(slug)).then(function (j) {
    var groups = (j.movie && Array.isArray(j.movie.episodes)) ? j.movie.episodes : [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g] || {};
      if (_str(group.server_name || group.name) !== server) continue;
      var items = Array.isArray(group.items) ? group.items : [];
      for (var i = 0; i < items.length; i++) {
        var ep = items[i] || {};
        if (_str(ep.slug || ep.name) !== epSlug) continue;
        var direct = _directUrl(ep);
        if (!direct) {
          throw new Error('NguonC: API chỉ cung cấp trang nhúng cho tập này; provider chưa hỗ trợ trình phát của máy chủ đó.');
        }
        return [{
          url: direct,
          quality: 'auto',
          container: /\.m3u8(?:[?#]|$)/i.test(direct) ? 'hls' : 'mp4',
          headers: { 'Referer': SITE + '/' },
          kind: 'sub',
          audioLang: 'ja',
          subtitles: []
        }];
      }
    }
    throw new Error('NguonC: không tìm thấy tập trong dữ liệu API');
  });
}

