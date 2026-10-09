(function () {
  "use strict";

  var cfg = window.KIDS_TV_CONFIG;
  var APP_VERSION = "0.8.3";
  var DEVICE_ID = navigator.userAgent.indexOf("Web0S") !== -1 ? "kidstv-lg" : "kidstv-preview";
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, BACKSPACE: 8, ESC: 27,
              PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
              CH_UP: 33, CH_DOWN: 34 };
  var COLUMNS = 3;
  var SEEK_SECONDS = 15;
  var TICKS = 10000000; // Jellyfin ticks per second
  var CONTROLS_HIDE_MS = 4000;

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
    library: [],     // every playable entry: { id, title, type, episodes: [{ Id, Name, MediaSourceId }] }
    series: [],      // entries shown as cards for the current tab
    tab: "series",   // "series" | "movies"
    homeFocus: "grid", // "grid" | "tabs"
    focus: 0,
    current: null,   // { series, index, playSessionId, playMethod, startAt, reported }
    ctrlFocus: "bar",
    overlayTimer: null,
    token: null,
    userId: null
  };

  // ── Jellyfin: auth ───────────────────────────────
  // The app logs in as the Jellyfin user from config.js, so Jellyfin keeps track of
  // what is watched (resume position, played state, Next Up) like any other client.

  function authHeader() {
    var h = 'MediaBrowser Client="Kids TV", Device="LG TV", DeviceId="' + DEVICE_ID + '", Version="' + APP_VERSION + '"';
    if (state.token) h += ', Token="' + state.token + '"';
    return h;
  }

  function request(method, path, body) {
    var opts = { method: method, headers: { "Authorization": authHeader() } };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(cfg.jellyfinUrl + path, opts).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    });
  }

  function api(path) {
    return request("GET", path).catch(function (err) {
      if (err.status !== 401) throw err;
      return login().then(function () { return request("GET", path); });
    });
  }

  function login() {
    state.token = null;
    return request("POST", "/Users/AuthenticateByName", { Username: cfg.username, Pw: cfg.password })
      .then(function (res) {
        state.token = res.AccessToken;
        state.userId = res.User.Id;
        localStorage.setItem("kidstv.auth", JSON.stringify({ token: state.token, userId: state.userId }));
      });
  }

  function restoreLogin() {
    try {
      var saved = JSON.parse(localStorage.getItem("kidstv.auth"));
      if (saved && saved.token) {
        state.token = saved.token;
        state.userId = saved.userId;
        return request("GET", "/Users/Me").catch(login);
      }
    } catch (e) { /* fall through */ }
    return login();
  }

  function report(path, body) {
    // The browser preview must not change what the kids have watched.
    if (DEVICE_ID !== "kidstv-lg") return;
    request("POST", path, body).catch(function (err) { console.warn("Rapportage mislukt", path, err.message); });
  }

  // ── Jellyfin: URLs ───────────────────────────────

  // The image tag changes when the artwork changes in Jellyfin, so the TV never shows a cached old image.
  function logoUrl(s) {
    return cfg.jellyfinUrl + "/Items/" + s.id + "/Images/Logo?maxHeight=220&quality=90&tag=" + (s.tags.Logo || "");
  }

  function imageUrl(itemId, type, tag) {
    return cfg.jellyfinUrl + "/Items/" + itemId + "/Images/" + type + "?maxWidth=900&quality=90" +
      (tag ? "&tag=" + tag : "");
  }

  function seriesImage(s, type) {
    var tag = type === "Backdrop" ? (s.backdropTags || [])[0] : s.tags[type];
    return imageUrl(s.id, type, tag);
  }

  function directUrl(ep) {
    return cfg.jellyfinUrl + "/Videos/" + ep.Id + "/stream?static=true&MediaSourceId=" + ep.MediaSourceId +
      "&ApiKey=" + state.token;
  }

  function hlsUrl(ep, playSessionId) {
    return cfg.jellyfinUrl + "/Videos/" + ep.Id + "/master.m3u8?MediaSourceId=" + ep.MediaSourceId +
      "&DeviceId=" + DEVICE_ID + "&PlaySessionId=" + playSessionId +
      "&VideoCodec=h264&AudioCodec=aac&SegmentContainer=ts&MaxStreamingBitrate=40000000" +
      "&ApiKey=" + state.token;
  }

  // ── Jellyfin: library ────────────────────────────

  function toPlayable(it) {
    return {
      Id: it.Id,
      Name: it.Name,
      MediaSourceId: it.MediaSources && it.MediaSources[0] ? it.MediaSources[0].Id : it.Id,
      UserData: it.UserData || {},
      Season: it.ParentIndexNumber || 0,
      Index: it.IndexNumber || 0,
      RunTimeTicks: it.RunTimeTicks || 0,
      ImageTag: it.ImageTags && it.ImageTags.Primary
    };
  }

  // Play order: regular seasons first, specials (season 0) at the end.
  function playOrder(a, b) {
    var sa = a.Season === 0 ? 9999 : a.Season;
    var sb = b.Season === 0 ? 9999 : b.Season;
    return sa - sb || a.Index - b.Index;
  }

  function loadEpisodes(entry) {
    if (entry.type === "Movie") {
      return api("/Items?userId=" + state.userId + "&Fields=MediaSources&Ids=" + entry.id)
        .then(function (d) { entry.episodes = d.Items.map(toPlayable); return entry; });
    }
    return api("/Items?userId=" + state.userId + "&ParentId=" + entry.id + "&Recursive=true" +
               "&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber&Fields=MediaSources")
      .then(function (d) { entry.episodes = d.Items.map(toPlayable).sort(playOrder); return entry; });
  }

  // Every series and movie the Jellyfin user may see becomes a card. Which content that is,
  // is managed in Jellyfin (the Kids user only sees items tagged "kids").
  function loadLibrary() {
    return api("/Items?userId=" + state.userId + "&Recursive=true&IncludeItemTypes=Series,Movie&SortBy=SortName")
      .then(function (d) {
        return Promise.all(d.Items.map(function (it) {
          return loadEpisodes({ id: it.Id, title: it.Name, type: it.Type, episodes: [],
                                tags: it.ImageTags || {}, backdropTags: it.BackdropImageTags || [],
                                hasLogo: !!(it.ImageTags && it.ImageTags.Logo) })
            .catch(function () { return null; });
        }));
      });
  }

  // Where to start: Jellyfin's Next Up (resumes a half-watched episode, otherwise the
  // episode after the last watched one). Nothing watched yet or all done: first episode.
  function pickStart(entry) {
    var fromStart = function () { return { index: 0, position: 0 }; };
    var at = function (id) {
      for (var i = 0; i < entry.episodes.length; i++) {
        if (entry.episodes[i].Id === id) {
          var ud = entry.episodes[i].UserData;
          return { index: i, position: ud.Played ? 0 : (ud.PlaybackPositionTicks || 0) / TICKS };
        }
      }
      return fromStart();
    };

    if (entry.type === "Movie") return Promise.resolve(at(entry.episodes[0].Id));

    return api("/Shows/NextUp?userId=" + state.userId + "&seriesId=" + entry.id +
               "&enableResumable=true&enableRewatching=true&disableFirstEpisode=false&limit=1")
      .then(function (d) { return d.Items.length ? at(d.Items[0].Id) : fromStart(); })
      .catch(fromStart);
  }

  // ── Jellyfin: playback reporting ─────────────────

  function playbackInfo(extra) {
    var c = state.current;
    var ep = c.series.episodes[c.index];
    var info = {
      ItemId: ep.Id,
      MediaSourceId: ep.MediaSourceId,
      PlaySessionId: c.playSessionId,
      PlayMethod: c.playMethod,
      PositionTicks: Math.round((video.currentTime || 0) * TICKS),
      IsPaused: video.paused,
      CanSeek: true
    };
    for (var k in extra) info[k] = extra[k];
    return info;
  }

  function reportStart() {
    var c = state.current;
    if (!c || c.reported) return;
    c.reported = true;
    report("/Sessions/Playing", playbackInfo());
  }

  function reportProgress(eventName) {
    var c = state.current;
    if (!c || !c.reported) return;
    report("/Sessions/Playing/Progress", playbackInfo({ EventName: eventName || "timeupdate" }));
  }

  function reportStopped(ended) {
    var c = state.current;
    if (!c || !c.reported) return;
    c.reported = false;
    var extra = {};
    if (ended && video.duration) extra.PositionTicks = Math.round(video.duration * TICKS);
    report("/Sessions/Playing/Stopped", playbackInfo(extra));
  }

  // ── Home ─────────────────────────────────────────

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
    // Fewer cards than columns: keep them centered instead of left-aligned.
    grid.style.gridTemplateColumns = "repeat(" + Math.max(1, Math.min(COLUMNS, state.series.length)) + ", 440px)";
    state.series.forEach(function (s, i) {
      var card = document.createElement("div");
      card.className = "card";
      // Series logo (from Jellyfin) when there is one: easier to recognise than text for kids.
      card.innerHTML = '<img alt=""><div class="shade"></div>' +
        (s.hasLogo ? '<div class="logo"></div>' : '<div class="title"></div>');
      if (s.hasLogo) card.querySelector(".logo").style.backgroundImage = "url(" + logoUrl(s) + ")";
      else card.querySelector(".title").textContent = s.title;

      var img = card.querySelector("img");
      // Artwork comes from Jellyfin: clean backdrop first, then landscape thumb, then poster.
      var sources = [seriesImage(s, "Backdrop"), seriesImage(s, "Thumb"), seriesImage(s, "Primary")];
      img.onerror = function () {
        if (sources.length) img.src = sources.shift();
      };
      img.src = sources.shift();

      card.addEventListener("mouseover", function () { state.homeFocus = "grid"; setFocus(i); });
      card.addEventListener("click", function () { setFocus(i); openSeries(s); });
      grid.appendChild(card);
    });
    setFocus(Math.max(0, Math.min(state.focus, state.series.length - 1)));
  }

  function setFocus(i) {
    var cards = $("grid").children;
    if (cards.length) state.focus = Math.max(0, Math.min(cards.length - 1, i));
    for (var n = 0; n < cards.length; n++) {
      cards[n].className = state.homeFocus === "grid" && n === state.focus ? "card focused" : "card";
    }
    renderTabs();
  }

  // ── Tabs (Series / Films) ────────────────────────

  var TAB_TYPES = { series: "Series", movies: "Movie" };
  var EMPTY_TEXT = { series: "Nog geen series", movies: "Nog geen films" };

  function renderTabs() {
    var tabs = $("tabs").children;
    for (var n = 0; n < tabs.length; n++) {
      var t = tabs[n].getAttribute("data-tab");
      var cls = "tab";
      if (t === state.tab) cls += " selected";
      if (state.homeFocus === "tabs" && t === state.tab) cls += " focused";
      tabs[n].className = cls;
    }
  }

  function selectTab(tab) {
    if (state.tab !== tab) {
      state.tab = tab;
      state.focus = 0;
    }
    state.series = state.library.filter(function (s) { return s.type === TAB_TYPES[tab]; });
    $("message").className = "message hidden";
    if (!state.series.length) {
      state.homeFocus = "tabs";
      showMessage(EMPTY_TEXT[tab]);
    }
    renderGrid();
  }

  function showMessage(text) {
    var m = $("message");
    m.textContent = text;
    m.className = "message";
  }

  function homeKey(code) {
    if (state.homeFocus === "tabs") {
      switch (code) {
        case KEY.LEFT: selectTab("series"); break;
        case KEY.RIGHT: selectTab("movies"); break;
        case KEY.DOWN:
        case KEY.ENTER:
          if (state.series.length) { state.homeFocus = "grid"; setFocus(state.focus); }
          break;
      }
      return;
    }

    switch (code) {
      case KEY.LEFT: setFocus(state.focus - 1); break;
      case KEY.RIGHT: setFocus(state.focus + 1); break;
      case KEY.UP:
        if (state.focus < COLUMNS) { state.homeFocus = "tabs"; setFocus(state.focus); }
        else setFocus(state.focus - COLUMNS);
        break;
      case KEY.DOWN: setFocus(state.focus + COLUMNS); break;
      case KEY.PLAY:
        if (state.series[state.focus]) openSeries(state.series[state.focus]);
        break;
      // OK is handled as short/long press (see homeEnterDown/Up).
      // Back on home is ignored on purpose: kids should not leave the app by accident.
    }
  }

  [].forEach.call($("tabs").children, function (el) {
    el.addEventListener("click", function () { selectTab(el.getAttribute("data-tab")); });
  });

  // ── Player ───────────────────────────────────────

  function openSeries(s) {
    $("home").className = "screen hidden";
    $("player").className = "screen";
    $("spinner").className = "spinner";
    $("episode-title").textContent = s.title;
    state.screen = "player";

    // Refresh episodes so watched state is current, then ask Jellyfin where to start.
    loadEpisodes(s)
      .then(pickStart)
      .then(function (start) {
        if (state.screen !== "player" || !s.episodes.length) return;
        playEpisode(s, start.index, start.position);
      })
      .catch(function () {
        $("spinner").className = "spinner hidden";
        $("episode-title").textContent = "Kan Jellyfin niet bereiken";
        showControls();
      });
  }

  function playEpisode(s, index, position) {
    var ep = s.episodes[index];
    state.current = {
      series: s, index: index, startAt: position || 0, reported: false,
      playSessionId: DEVICE_ID + "-" + Date.now(), playMethod: "DirectPlay"
    };
    $("episode-title").textContent = s.type === "Movie" ? s.title : s.title + " — " + ep.Name;
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
    reportStopped(false);
    var n = c.series.episodes.length;
    playEpisode(c.series, (c.index + delta + n) % n, 0);
    showControls();
  }

  function closePlayer() {
    reportStopped(false);
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
  // Focus is "bar" (left/right = seek) or a button index: 0 = play/pause, 1 = next, 2 = episodes.

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
    $("btn-episodes").className = "ctrl-button wide" + (state.ctrlFocus === 2 ? " focused" : "") +
      (hasEpisodeList() ? "" : " hidden");
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
    if (!state.current) return;
    if (video.paused) {
      video.play();
      $("pause-icon").className = "pause-icon hidden";
    } else {
      video.pause();
      $("pause-icon").className = "pause-icon";
    }
    showControls();
  }

  function seek(delta) {
    if (!video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta));
    updateProgress();
  }

  function hasEpisodeList() {
    return !!(state.current && state.current.series.type !== "Movie");
  }

  function activateButton() {
    if (state.ctrlFocus === 0) togglePause();
    else if (state.ctrlFocus === 1) skipEpisode(1);
    else if (state.ctrlFocus === 2) openEpisodes(state.current.series, "player");
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
      case KEY.LEFT: state.ctrlFocus = Math.max(0, state.ctrlFocus - 1); showControls(); return;
      case KEY.RIGHT: state.ctrlFocus = Math.min(hasEpisodeList() ? 2 : 1, state.ctrlFocus + 1); showControls(); return;
      case KEY.UP: state.ctrlFocus = "bar"; showControls(); return;
      case KEY.DOWN: showControls(); return;
    }
  }


  // ── Episodes (secondary route: pick a specific episode) ─────────────
  // One vertical list per season, seasons in a column on the left (only when there is
  // more than one). Opened from the player ("Afleveringen") or by holding OK on a card.

  var CHECK_ICON = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
  var ROW_HEIGHT = 232; // .ep-row height + margin

  function seasonName(n) {
    return n === 0 ? "Extra's" : "Seizoen " + n;
  }

  function openEpisodes(s, from) {
    var seasons = [];
    s.episodes.forEach(function (ep, i) {
      var last = seasons[seasons.length - 1];
      if (!last || last.number !== ep.Season) {
        last = { number: ep.Season, name: seasonName(ep.Season), items: [] };
        seasons.push(last);
      }
      last.items.push(i);
    });

    // Start on the episode that is playing (from the player) or that Next Up would play.
    var startIndex = from === "player" && state.current ? state.current.index : null;
    var begin = startIndex !== null ? Promise.resolve({ index: startIndex }) : pickStart(s);

    if (from === "player") {
      if (!video.paused) togglePause();
      hideControls();
      $("pause-icon").className = "pause-icon hidden";
    }

    return begin.then(function (start) {
      var ep = state.ep = { series: s, from: from, seasons: seasons, season: 0, row: 0,
                            area: "list", currentIndex: start.index };
      seasons.forEach(function (season, si) {
        var r = season.items.indexOf(start.index);
        if (r !== -1) { ep.season = si; ep.row = r; }
      });

      $("ep-series").textContent = s.hasLogo ? "" : s.title;
      $("ep-logo").className = "ep-logo" + (s.hasLogo ? "" : " hidden");
      if (s.hasLogo) $("ep-logo").src = logoUrl(s);
      $("ep-bg").className = "ep-bg";
      $("ep-bg").onerror = function () { this.className = "ep-bg hidden"; };
      $("ep-bg").src = seriesImage(s, "Backdrop").replace("maxWidth=900", "maxWidth=1920");
      $("episodes").className = "screen" + (seasons.length > 1 ? "" : " single-season");
      if (from === "home") $("home").className = "screen hidden";
      state.screen = "episodes";
      renderSeasons();
      renderEpisodeList();
    });
  }

  function renderSeasons() {
    var ep = state.ep;
    var box = $("ep-seasons");
    box.innerHTML = "";
    if (ep.seasons.length < 2) return;
    ep.seasons.forEach(function (season, si) {
      var el = document.createElement("div");
      var cls = "ep-season";
      if (si === ep.season) cls += " selected";
      if (si === ep.season && ep.area === "seasons") cls += " focused";
      el.className = cls;
      el.textContent = season.name;
      el.addEventListener("click", function () { ep.season = si; ep.row = 0; ep.area = "list"; renderSeasons(); renderEpisodeList(); });
      box.appendChild(el);
    });
  }

  function minutes(ticks) {
    var m = Math.round(ticks / TICKS / 60);
    return m ? m + " min" : "";
  }

  function renderEpisodeList() {
    var ep = state.ep;
    var list = $("ep-list");
    list.innerHTML = "";
    ep.seasons[ep.season].items.forEach(function (index, r) {
      var e = ep.series.episodes[index];
      var ud = e.UserData;
      var row = document.createElement("div");
      var cls = "ep-row";
      if (ep.area === "list" && r === ep.row) cls += " focused";
      row.className = cls;

      var pct = !ud.Played && ud.PlaybackPositionTicks && e.RunTimeTicks ?
        Math.min(100, ud.PlaybackPositionTicks / e.RunTimeTicks * 100) : 0;
      row.innerHTML =
        '<div class="ep-thumb"><img alt="">' +
          (pct ? '<div class="ep-bar"><i style="width:' + pct + '%"></i></div>' : "") +
          (ud.Played ? '<div class="ep-check"><svg viewBox="0 0 24 24"><path d="' + CHECK_ICON + '"/></svg></div>' : "") +
        "</div>" +
        '<div class="ep-text"><div class="ep-title"></div><div class="ep-meta"></div></div>';
      row.querySelector(".ep-title").textContent = (e.Index ? e.Index + ". " : "") + e.Name;
      row.querySelector(".ep-meta").textContent = minutes(e.RunTimeTicks);

      var img = row.querySelector("img");
      var sources = [cfg.jellyfinUrl + "/Items/" + e.Id + "/Images/Primary?maxWidth=480&quality=85&tag=" + e.ImageTag,
                     seriesImage(ep.series, "Thumb"), seriesImage(ep.series, "Backdrop")];
      if (!e.ImageTag) sources.shift();
      img.onerror = function () { if (sources.length) img.src = sources.shift(); };
      img.src = sources.shift();

      row.addEventListener("mouseover", function () { ep.area = "list"; ep.row = r; markEpisodeFocus(); });
      row.addEventListener("click", function () { ep.row = r; chooseEpisode(); });
      list.appendChild(row);
    });
    scrollEpisodeList();
  }

  function markEpisodeFocus() {
    var ep = state.ep;
    var rows = $("ep-list").children;
    for (var n = 0; n < rows.length; n++) {
      rows[n].className = rows[n].className.replace(" focused", "") + (ep.area === "list" && n === ep.row ? " focused" : "");
    }
    scrollEpisodeList();
  }

  // Keep the focused row in view, with one row of context above it.
  function scrollEpisodeList() {
    var ep = state.ep;
    var visible = Math.floor(($("ep-list-wrap").offsetHeight || 900) / ROW_HEIGHT);
    var total = ep.seasons[ep.season].items.length;
    var first = Math.max(0, Math.min(ep.row - 1, total - visible));
    $("ep-list").style.transform = "translateY(" + (-first * ROW_HEIGHT) + "px)";
  }

  function chooseEpisode() {
    var ep = state.ep;
    var index = ep.seasons[ep.season].items[ep.row];
    var e = ep.series.episodes[index];
    var ud = e.UserData;
    var position = !ud.Played && ud.PlaybackPositionTicks ? ud.PlaybackPositionTicks / TICKS : 0;

    $("episodes").className = "screen hidden";
    if (ep.from === "player") reportStopped(false);
    $("player").className = "screen";
    state.screen = "player";
    state.ep = null;
    playEpisode(ep.series, index, position);
  }

  function closeEpisodes() {
    var ep = state.ep;
    $("episodes").className = "screen hidden";
    state.ep = null;
    if (ep.from === "player") {
      state.screen = "player";
      togglePause();
    } else {
      $("home").className = "screen";
      state.screen = "home";
    }
  }

  function episodesKey(code) {
    var ep = state.ep;
    if (!ep) return;
    var rows = ep.seasons[ep.season].items.length;

    if (code === KEY.BACK || code === KEY.BACKSPACE || code === KEY.ESC) { closeEpisodes(); return; }

    if (ep.area === "seasons") {
      switch (code) {
        case KEY.UP:
          if (ep.season > 0) { ep.season--; ep.row = 0; renderSeasons(); renderEpisodeList(); }
          break;
        case KEY.DOWN:
          if (ep.season < ep.seasons.length - 1) { ep.season++; ep.row = 0; renderSeasons(); renderEpisodeList(); }
          break;
        case KEY.RIGHT:
        case KEY.ENTER:
          ep.area = "list"; renderSeasons(); markEpisodeFocus();
          break;
      }
      return;
    }

    switch (code) {
      case KEY.UP: if (ep.row > 0) { ep.row--; markEpisodeFocus(); } break;
      case KEY.DOWN: if (ep.row < rows - 1) { ep.row++; markEpisodeFocus(); } break;
      case KEY.LEFT:
        if (ep.seasons.length > 1) { ep.area = "seasons"; renderSeasons(); markEpisodeFocus(); }
        break;
      case KEY.ENTER:
      case KEY.PLAY:
        chooseEpisode();
        break;
    }
  }

  // ── Video events ─────────────────────────────────

  video.addEventListener("loadedmetadata", function () {
    var c = state.current;
    if (c && c.startAt > 0 && c.startAt < video.duration - 10) video.currentTime = c.startAt;
    updateProgress();
  });

  video.addEventListener("timeupdate", function () {
    if (controlsVisible()) updateProgress();
  });

  video.addEventListener("playing", function () {
    $("spinner").className = "spinner hidden";
    if (state.current && !state.current.reported) reportStart();
    else reportProgress("unpause");
  });

  video.addEventListener("pause", function () {
    if (video.ended) return;
    reportProgress("pause");
  });

  video.addEventListener("seeked", function () {
    reportProgress("timeupdate");
  });

  video.addEventListener("waiting", function () {
    $("spinner").className = "spinner";
  });

  video.addEventListener("error", function () {
    var c = state.current;
    if (!c || !video.getAttribute("src")) return;
    if (c.playMethod === "DirectPlay") {
      // Direct play of the file failed; let Jellyfin remux/transcode to HLS instead.
      c.playMethod = "Transcode";
      video.src = hlsUrl(c.series.episodes[c.index], c.playSessionId);
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
    var c = state.current;
    if (!c) return;
    reportStopped(true);
    if (c.series.episodes.length > 1) skipEpisode(1);
    else closePlayer();
  });

  setInterval(function () {
    if (state.screen === "player" && !video.paused) reportProgress("timeupdate");
  }, 10000);

  // Home button / app switch: pause and close the Jellyfin session, so the position is saved.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden || state.screen !== "player") return;
    if (!video.paused) togglePause();
    reportStopped(false);
  });

  // ── Input ────────────────────────────────────────

  // Holding OK on a card (home) opens the episode list; a short press plays as usual.
  var LONG_PRESS_MS = 700;
  var pressTimer = null;
  var enterNeedsRelease = false;

  function homeEnterDown() {
    var s = state.series[state.focus];
    if (!s || pressTimer) return;
    pressTimer = setTimeout(function () {
      pressTimer = "fired";
      enterNeedsRelease = true;
      if (s.type === "Movie") openSeries(s);
      else loadEpisodes(s).then(function () { return openEpisodes(s, "home"); });
    }, LONG_PRESS_MS);
  }

  function homeEnterUp() {
    if (pressTimer === null) return;
    var fired = pressTimer === "fired";
    if (!fired) clearTimeout(pressTimer);
    pressTimer = null;
    if (!fired && state.series[state.focus]) openSeries(state.series[state.focus]);
  }

  document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    e.preventDefault();
    // A held OK must not trigger the next screen too (e.g. the long press that opened the list).
    if (code === KEY.ENTER && (e.repeat || enterNeedsRelease) && state.screen !== "home") return;
    if (state.screen === "player") return playerKey(code);
    if (state.screen === "episodes") return episodesKey(code);
    if (state.homeFocus === "grid" && code === KEY.ENTER) return homeEnterDown();
    if (!e.repeat) homeKey(code);
  });

  document.addEventListener("keyup", function (e) {
    if (e.keyCode !== KEY.ENTER) return;
    enterNeedsRelease = false;
    if (state.screen === "home") homeEnterUp();
    else if (pressTimer === "fired") pressTimer = null;
  });

  // Magic Remote pointer
  $("btn-play").addEventListener("click", function (e) { e.stopPropagation(); togglePause(); });
  $("btn-next").addEventListener("click", function (e) { e.stopPropagation(); skipEpisode(1); });
  $("btn-episodes").addEventListener("click", function (e) { e.stopPropagation(); openEpisodes(state.current.series, "player"); });
  $("progress").addEventListener("click", function (e) {
    e.stopPropagation();
    var r = this.getBoundingClientRect();
    if (video.duration) video.currentTime = (e.clientX - r.left) / r.width * video.duration;
    showControls();
  });
  $("player").addEventListener("click", togglePause);
  $("player").addEventListener("mousemove", function () { if (state.screen === "player") showControls(); });

  // ── Boot ─────────────────────────────────────────

  // Browser preview on a smaller screen: http://127.0.0.1:8790/?zoom=0.75 scales the 1920x1080 UI.
  var zoom = /[?&]zoom=([0-9.]+)/.exec(location.search);
  if (zoom) document.body.style.zoom = zoom[1];

  renderDoodles();

  if (!cfg || !cfg.username) {
    showMessage("config.js ontbreekt");
    return;
  }

  restoreLogin()
    .then(loadLibrary)
    .then(function (list) {
      state.library = list.filter(function (s) { return s && s.episodes.length; });
      if (!state.library.length) { showMessage("Geen video's gevonden in Jellyfin"); return; }
      selectTab("series");
    })
    .catch(function (err) {
      showMessage("Kan Jellyfin niet bereiken (" + err.message + ")");
    });
})();
