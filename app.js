(function () {
  "use strict";

  var cfg = window.KIDS_TV_CONFIG;
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, BACKSPACE: 8, ESC: 27,
              PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
              CH_UP: 33, CH_DOWN: 34 };
  var COLUMNS = 3;
  var SEEK_SECONDS = 15;

  var ICONS = {
    tv: "M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z",
    star: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
    note: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
    headphones: "M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"
  };

  // Same doodle layout as the tablet app (DoodleLayer.kt), scaled from dp to TV pixels.
  var DOODLES = [
    ["tv", 34, 24, 44, -12], ["star", 150, 45, 36, 8], ["headphones", 285, 30, 43, -8],
    ["note", 375, 125, 39, -12], ["star", 820, 42, 39, 7], ["tv", 920, 82, 58, 4],
    ["note", 1080, 24, 36, 10], ["star", 1162, 40, 43, -9], ["note", 1215, 113, 39, 12],
    ["star", 55, 736, 36, 8], ["note", 185, 748, 34, -11], ["star", 315, 740, 37, 6],
    ["note", 425, 744, 35, -8], ["headphones", 502, 754, 42, 3], ["note", 725, 742, 36, 9],
    ["tv", 840, 750, 45, -8], ["star", 980, 746, 36, 7], ["star", 1115, 735, 40, -5]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var video = $("video");

  var state = {
    screen: "home",
    series: [],      // [{ id, title, episodes: [...] }]
    focus: 0,
    current: null,   // { series, index, triedHls, startAt }
    ctrlFocus: "bar",
    overlayTimer: null
  };

  // ── Jellyfin ─────────────────────────────────────

  function api(path) {
    var sep = path.indexOf("?") === -1 ? "?" : "&";
    return fetch(cfg.jellyfinUrl + path + sep + "ApiKey=" + cfg.apiKey).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function imageUrl(itemId, type) {
    return cfg.jellyfinUrl + "/Items/" + itemId + "/Images/" + type + "?maxWidth=900&quality=90";
  }

  function directUrl(ep) {
    return cfg.jellyfinUrl + "/Videos/" + ep.Id + "/stream?static=true&MediaSourceId=" + ep.MediaSourceId +
      "&ApiKey=" + cfg.apiKey;
  }

  function hlsUrl(ep) {
    return cfg.jellyfinUrl + "/Videos/" + ep.Id + "/master.m3u8?MediaSourceId=" + ep.MediaSourceId +
      "&DeviceId=kidstv-lg&PlaySessionId=" + Date.now() +
      "&VideoCodec=h264&AudioCodec=aac&SegmentContainer=ts&MaxStreamingBitrate=40000000" +
      "&ApiKey=" + cfg.apiKey;
  }

  function toPlayable(it) {
    return {
      Id: it.Id,
      Name: it.Name,
      MediaSourceId: it.MediaSources && it.MediaSources[0] ? it.MediaSources[0].Id : it.Id
    };
  }

  // Config entries use either a Jellyfin id or an exact name ("Bing", "Dikkertje Dap").
  function findItem(s) {
    if (s.id) return api("/Items?Ids=" + s.id + "&Fields=MediaSources").then(function (d) { return d.Items[0]; });
    return api("/Items?Recursive=true&IncludeItemTypes=Series,Movie&Fields=MediaSources&searchTerm=" +
               encodeURIComponent(s.name))
      .then(function (data) {
        var want = s.name.toLowerCase();
        var exact = data.Items.filter(function (it) { return it.Name.toLowerCase() === want; });
        var item = exact[0] || data.Items[0];
        if (!item) throw new Error(s.name + " niet gevonden");
        return item;
      });
  }

  function loadSeries(s) {
    return findItem(s).then(function (item) {
      var entry = { id: item.Id, title: s.title || item.Name, cover: s.cover, plain: !!s.plain, episodes: [] };
      if (item.Type === "Movie") {
        entry.episodes = [toPlayable(item)];
        return entry;
      }
      return api("/Items?ParentId=" + item.Id + "&Recursive=true&IncludeItemTypes=Episode" +
                 "&SortBy=ParentIndexNumber,IndexNumber&Fields=MediaSources")
        .then(function (data) {
          entry.episodes = data.Items.map(toPlayable);
          return entry;
        });
    }).catch(function (err) {
      console.warn("Overgeslagen:", s.name || s.id, err.message);
      return null;
    });
  }

  // ── Progress (per series: last episode + position) ─

  function progressKey(seriesId) { return "kidstv.progress." + seriesId; }

  function loadProgress(seriesId) {
    try { return JSON.parse(localStorage.getItem(progressKey(seriesId))) || null; }
    catch (e) { return null; }
  }

  function saveProgress() {
    var c = state.current;
    if (!c) return;
    var index = c.index;
    var pos = video.currentTime || 0;
    if (video.duration && pos > video.duration - 30) {
      // Episode is (nearly) finished: next time start with the next one.
      index = (index + 1) % c.series.episodes.length;
      pos = 0;
    }
    var ep = c.series.episodes[index];
    localStorage.setItem(progressKey(c.series.id), JSON.stringify({ episodeId: ep.Id, position: pos }));
  }

  // ── Home ─────────────────────────────────────────

  function svg(path) {
    return '<svg viewBox="0 0 24 24"><path d="' + path + '"/></svg>';
  }

  function renderDoodles() {
    var html = "";
    DOODLES.forEach(function (d) {
      var x = d[1] * 1.5;
      var y = d[2] < 400 ? d[2] * 1.5 : 1080 - (800 - d[2]) * 1.5;
      var size = d[3] * 1.5;
      html += '<svg viewBox="0 0 24 24" style="left:' + x + "px;top:" + y + "px;width:" + size +
              "px;height:" + size + "px;transform:rotate(" + d[4] + 'deg)"><path d="' + ICONS[d[0]] + '"/></svg>';
    });
    $("doodles").innerHTML = html;
  }

  function renderGrid() {
    var grid = $("grid");
    grid.innerHTML = "";
    state.series.forEach(function (s, i) {
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML = s.plain ? '<img alt="">' :
        '<img alt="">' +
        '<div class="shade"></div>' +
        '<div class="title"></div>' +
        '<div class="badge">' + svg(ICONS.tv) + "</div>";
      if (!s.plain) card.querySelector(".title").textContent = s.title;

      var img = card.querySelector("img");
      var sources = [imageUrl(s.id, "Thumb"), imageUrl(s.id, "Backdrop"), imageUrl(s.id, "Primary")];
      if (s.cover) sources.unshift(s.cover);
      img.onerror = function () {
        if (sources.length) img.src = sources.shift();
      };
      img.src = sources.shift();

      card.addEventListener("mouseover", function () { setFocus(i); });
      card.addEventListener("click", function () { setFocus(i); openSeries(s); });
      grid.appendChild(card);
    });
    setFocus(Math.min(state.focus, state.series.length - 1));
  }

  function setFocus(i) {
    var cards = $("grid").children;
    if (!cards.length) return;
    state.focus = Math.max(0, Math.min(cards.length - 1, i));
    for (var n = 0; n < cards.length; n++) {
      cards[n].className = n === state.focus ? "card focused" : "card";
    }
  }

  function showMessage(text) {
    var m = $("message");
    m.textContent = text;
    m.className = "message";
  }

  function homeKey(code) {
    switch (code) {
      case KEY.LEFT: setFocus(state.focus - 1); break;
      case KEY.RIGHT: setFocus(state.focus + 1); break;
      case KEY.UP: setFocus(state.focus - COLUMNS); break;
      case KEY.DOWN: setFocus(state.focus + COLUMNS); break;
      case KEY.ENTER:
      case KEY.PLAY:
        if (state.series[state.focus]) openSeries(state.series[state.focus]);
        break;
      // Back on home is ignored on purpose: kids should not leave the app by accident.
    }
  }

  // ── Player ───────────────────────────────────────

  function openSeries(s) {
    if (!s.episodes.length) return;
    var saved = loadProgress(s.id);
    var index = 0;
    var position = 0;
    if (saved) {
      for (var i = 0; i < s.episodes.length; i++) {
        if (s.episodes[i].Id === saved.episodeId) { index = i; position = saved.position || 0; break; }
      }
    }
    $("home").className = "screen hidden";
    $("player").className = "screen";
    state.screen = "player";
    playEpisode(s, index, position);
  }

  function playEpisode(s, index, position) {
    var ep = s.episodes[index];
    state.current = { series: s, index: index, triedHls: false, startAt: position || 0 };
    $("episode-title").textContent = s.title + " — " + ep.Name;
    updateProgress();
    $("pause-icon").className = "pause-icon hidden";
    $("spinner").className = "spinner";
    video.src = directUrl(ep);
    video.load();
    video.play();
  }

  function skipEpisode(delta) {
    var c = state.current;
    if (!c) return;
    var n = c.series.episodes.length;
    playEpisode(c.series, (c.index + delta + n) % n, 0);
    saveProgress();
    showControls();
  }

  function closePlayer() {
    saveProgress();
    video.pause();
    video.removeAttribute("src");
    video.load();
    state.current = null;
    hideControls();
    $("pause-icon").className = "pause-icon hidden";
    $("spinner").className = "spinner hidden";
    $("player").className = "screen hidden";
    $("home").className = "screen";
    state.screen = "home";
  }

  // ── Controls (progress bar + buttons) ─────────────
  // Focus is "bar" (left/right = seek) or a button index: 0 = play/pause, 1 = next.

  var CONTROLS_HIDE_MS = 4000;

  function controlsVisible() {
    return $("controls").className.indexOf("hidden") === -1;
  }

  function renderControls() {
    var cls = "controls";
    if (video.paused) cls += " paused";
    if (state.ctrlFocus === "bar") cls += " focus-bar";
    $("controls").className = cls;
    $("btn-play").className = "ctrl-button" + (state.ctrlFocus === 0 ? " focused" : "");
    $("btn-next").className = "ctrl-button wide" + (state.ctrlFocus === 1 ? " focused" : "");
  }

  function showControls() {
    if (!controlsVisible()) state.ctrlFocus = "bar";
    updateProgress();
    renderControls();
    clearTimeout(state.overlayTimer);
    if (!video.paused) state.overlayTimer = setTimeout(hideControls, CONTROLS_HIDE_MS);
  }

  function hideControls() {
    clearTimeout(state.overlayTimer);
    $("controls").className = "controls hidden";
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateProgress() {
    var d = video.duration || 0;
    var t = video.currentTime || 0;
    $("progress-fill").style.width = d ? (t / d * 100) + "%" : "0";
    $("time-current").textContent = formatTime(t);
    $("time-total").textContent = formatTime(d);
  }

  function togglePause() {
    if (video.paused) {
      video.play();
      $("pause-icon").className = "pause-icon hidden";
    } else {
      video.pause();
      saveProgress();
      $("pause-icon").className = "pause-icon";
    }
    showControls();
  }

  function seek(delta) {
    if (!video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta));
    updateProgress();
  }

  function activateButton() {
    if (state.ctrlFocus === 0) togglePause();
    else if (state.ctrlFocus === 1) skipEpisode(1);
  }

  function playerKey(code) {
    var visible = controlsVisible();

    switch (code) {
      case KEY.BACK: case KEY.BACKSPACE: case KEY.ESC: case KEY.STOP:
        closePlayer();
        return;
      case KEY.PLAYPAUSE: togglePause(); return;
      case KEY.PLAY: if (video.paused) togglePause(); return;
      case KEY.PAUSE: if (!video.paused) togglePause(); return;
      case KEY.RW: seek(-SEEK_SECONDS); showControls(); return;
      case KEY.FF: seek(SEEK_SECONDS); showControls(); return;
      case KEY.CH_UP: skipEpisode(1); return;
      case KEY.CH_DOWN: skipEpisode(-1); return;
    }

    if (!visible || state.ctrlFocus === "bar") {
      switch (code) {
        case KEY.ENTER: togglePause(); return;
        case KEY.LEFT: seek(-SEEK_SECONDS); showControls(); return;
        case KEY.RIGHT: seek(SEEK_SECONDS); showControls(); return;
        case KEY.DOWN:
          if (visible) state.ctrlFocus = 0;
          showControls();
          return;
        case KEY.UP: showControls(); return;
      }
      return;
    }

    switch (code) {
      case KEY.ENTER: activateButton(); return;
      case KEY.LEFT: state.ctrlFocus = 0; showControls(); return;
      case KEY.RIGHT: state.ctrlFocus = 1; showControls(); return;
      case KEY.UP: state.ctrlFocus = "bar"; showControls(); return;
      case KEY.DOWN: showControls(); return;
    }
  }

  video.addEventListener("loadedmetadata", function () {
    var c = state.current;
    if (c && c.startAt > 0 && c.startAt < video.duration - 30) video.currentTime = c.startAt;
    updateProgress();
  });

  video.addEventListener("timeupdate", function () {
    if (controlsVisible()) updateProgress();
  });

  video.addEventListener("playing", function () {
    $("spinner").className = "spinner hidden";
  });

  video.addEventListener("waiting", function () {
    $("spinner").className = "spinner";
  });

  video.addEventListener("error", function () {
    var c = state.current;
    if (!c) return;
    if (!c.triedHls) {
      // Direct play of the file failed; let Jellyfin remux/transcode to HLS instead.
      c.triedHls = true;
      video.src = hlsUrl(c.series.episodes[c.index]);
      video.load();
      video.play();
      return;
    }
    $("spinner").className = "spinner hidden";
    $("episode-title").textContent = "Deze aflevering wil niet afspelen";
    state.ctrlFocus = 1;
    showControls();
  });

  video.addEventListener("ended", function () {
    if (state.current) skipEpisode(1);
  });

  setInterval(function () {
    if (state.screen === "player" && !video.paused) saveProgress();
  }, 10000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state.screen === "player" && !video.paused) togglePause();
  });

  // ── Input ────────────────────────────────────────

  document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    if (state.screen === "player") playerKey(code);
    else homeKey(code);
    e.preventDefault();
  });

  // Magic Remote pointer
  $("btn-play").addEventListener("click", function (e) { e.stopPropagation(); togglePause(); });
  $("btn-next").addEventListener("click", function (e) { e.stopPropagation(); skipEpisode(1); });
  $("progress").addEventListener("click", function (e) {
    e.stopPropagation();
    var r = this.getBoundingClientRect();
    if (video.duration) video.currentTime = (e.clientX - r.left) / r.width * video.duration;
    showControls();
  });
  $("player").addEventListener("click", togglePause);
  $("player").addEventListener("mousemove", function () { if (state.screen === "player") showControls(); });

  // ── Boot ─────────────────────────────────────────

  renderDoodles();

  if (!cfg || !cfg.apiKey) {
    showMessage("config.js ontbreekt");
    return;
  }

  Promise.all(cfg.series.map(loadSeries))
    .then(function (list) {
      state.series = list.filter(function (s) { return s && s.episodes.length; });
      if (!state.series.length) showMessage("Kan Jellyfin niet bereiken of geen video's gevonden");
      renderGrid();
    })
    .catch(function (err) {
      showMessage("Kan Jellyfin niet bereiken (" + err.message + ")");
    });
})();
