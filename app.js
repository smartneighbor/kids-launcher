/* =============================================================
   Kids TV Launcher — app.js
   LG WebOS 5 (OLED48CX) — pure vanilla JS, no dependencies
   ============================================================= */

'use strict';

// ── Known app IDs ─────────────────────────────────────────────
const APP_IDS = {
  netflix:   'com.netflix.ninja',
  youtube:   'com.webos.app.youtube',
  videoland: null   // auto-discovered at startup via listLaunchPoints
};

// ── WebOS detection ───────────────────────────────────────────
// webOSTV.js sets window.webOS when running on device.
// In a browser we shim it so the app is previewable on a Mac.
const IS_WEBOS = typeof PalmServiceBridge !== 'undefined';

if (!IS_WEBOS) {
  console.warn('[DEV] Running outside WebOS — app launches will open in browser.');
}

// ── State ─────────────────────────────────────────────────────
let shows        = [];
let focusIndex   = 0;
let cols         = 3;
let toastTimer   = null;

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  discoverVideolandAppId();
  loadShows();
  bindKeys();
});

// ── Load shows.json ───────────────────────────────────────────
function loadShows() {
  fetch('shows.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (data.title) {
        document.getElementById('app-title').textContent = data.title;
      }
      shows = data.shows || [];
      applyGridConfig(shows.length);
      renderGrid();
      hideLoading();
      setFocus(0, false);
    })
    .catch(function (err) {
      console.error('Failed to load shows.json:', err);
      showToast('Kon shows niet laden.');
      hideLoading();
    });
}

// ── Grid sizing ───────────────────────────────────────────────
// Keeps all cards visible on one screen regardless of show count.
function applyGridConfig(count) {
  var cfg;
  if (count <= 6)  cfg = { cols: 3, w: 260, h: 390, gap: 28 };
  else if (count <= 8)  cfg = { cols: 4, w: 235, h: 353, gap: 24 };
  else if (count <= 10) cfg = { cols: 5, w: 210, h: 315, gap: 20 };
  else                  cfg = { cols: 5, w: 200, h: 300, gap: 16 };

  cols = cfg.cols;
  var root = document.documentElement;
  root.style.setProperty('--cols',     cfg.cols);
  root.style.setProperty('--card-w',   cfg.w  + 'px');
  root.style.setProperty('--card-h',   cfg.h  + 'px');
  root.style.setProperty('--grid-gap', cfg.gap + 'px');
}

// ── Render ────────────────────────────────────────────────────
function renderGrid() {
  var grid = document.getElementById('grid');
  grid.innerHTML = '';

  shows.forEach(function (show, idx) {
    var card = document.createElement('div');
    card.className   = 'card';
    card.dataset.idx = idx;
    card.setAttribute('role', 'gridcell');
    card.setAttribute('tabindex', idx === 0 ? '0' : '-1');

    // Poster image
    var imgWrap = document.createElement('div');
    imgWrap.className = 'card-image';

    var img = document.createElement('img');
    img.alt = show.title;
    img.src = show.image || '';
    img.onerror = function () {
      imgWrap.removeChild(img);
      var fallback = document.createElement('div');
      fallback.className   = 'img-fallback';
      fallback.textContent = show.title.charAt(0).toUpperCase();
      imgWrap.appendChild(fallback);
    };
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    // Platform badge
    var badge = document.createElement('div');
    badge.className = 'badge badge-' + show.platform;
    badge.textContent = badgeLabel(show.platform);
    badge.setAttribute('aria-label', show.platform);
    card.appendChild(badge);

    // Title
    var title = document.createElement('div');
    title.className   = 'card-title';
    title.textContent = show.title;
    card.appendChild(title);

    // Interaction
    card.addEventListener('click', function () { activateShow(idx); });
    card.addEventListener('mouseenter', function () { setFocus(idx, false); });

    grid.appendChild(card);
  });
}

function badgeLabel(platform) {
  switch (platform) {
    case 'netflix':   return 'N';
    case 'youtube':   return '▶';
    case 'videoland': return 'V';
    case 'direct':    return '▶';
    default:          return '?';
  }
}

// ── Focus management ──────────────────────────────────────────
function setFocus(idx, scroll) {
  if (idx < 0 || idx >= shows.length) return;

  var cards = document.querySelectorAll('.card');
  cards.forEach(function (c, i) {
    c.classList.toggle('focused', i === idx);
    c.setAttribute('tabindex', i === idx ? '0' : '-1');
  });

  focusIndex = idx;
  if (scroll !== false) cards[idx].scrollIntoView({ block: 'nearest' });
}

function moveFocus(dir) {
  var total = shows.length;
  var next  = focusIndex;

  switch (dir) {
    case 'right': next = Math.min(focusIndex + 1, total - 1);        break;
    case 'left':  next = Math.max(focusIndex - 1, 0);                break;
    case 'down':  next = Math.min(focusIndex + cols, total - 1);     break;
    case 'up':    next = Math.max(focusIndex - cols, 0);             break;
  }

  if (next !== focusIndex) setFocus(next, true);
}

// ── Key handling ──────────────────────────────────────────────
// WebOS Magic Remote D-pad → standard arrow keyCodes
// Back button → 461 (WebOS-specific)
function bindKeys() {
  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case 37: moveFocus('left');  e.preventDefault(); break;  // ←
      case 38: moveFocus('up');    e.preventDefault(); break;  // ↑
      case 39: moveFocus('right'); e.preventDefault(); break;  // →
      case 40: moveFocus('down');  e.preventDefault(); break;  // ↓
      case 13: activateShow(focusIndex); e.preventDefault(); break;  // OK / Enter
      case 461: /* Back — no-op, this IS the launcher */ e.preventDefault(); break;
    }
  });
}

// ── Activate ──────────────────────────────────────────────────
function activateShow(idx) {
  var show = shows[idx];
  if (!show) return;

  switch (show.platform) {
    case 'netflix':
      launchApp(APP_IDS.netflix, {
        contentId: String(show.contentId),
        mediaType: show.mediaType || 'show'
      });
      break;

    case 'youtube':
      launchApp(APP_IDS.youtube, {
        contentTarget: show.contentTarget
      });
      break;

    case 'videoland':
      if (!APP_IDS.videoland) {
        showToast('Videoland app-ID nog niet gevonden. Probeer opnieuw.');
        discoverVideolandAppId();
        return;
      }
      launchApp(APP_IDS.videoland, {
        contentTarget: show.contentTarget
      });
      break;

    case 'direct':
      playDirectUrl(show.url);
      break;

    default:
      showToast('Onbekend platform: ' + show.platform);
  }
}

// ── App launcher ──────────────────────────────────────────────
function launchApp(appId, params) {
  if (!appId) {
    showToast('App-ID onbekend.');
    return;
  }

  // Browser dev fallback: open equivalent web URL instead of launching TV app
  if (!IS_WEBOS) {
    var url = null;
    if (appId === APP_IDS.netflix && params.contentId) {
      url = 'https://www.netflix.com/watch/' + params.contentId;
    } else if (appId === APP_IDS.youtube && params.contentTarget) {
      url = params.contentTarget;
    } else if (params.contentTarget) {
      url = params.contentTarget;
    }
    if (url) {
      console.log('[DEV] Opening in browser:', url);
      window.open(url, '_blank');
    } else {
      console.log('[DEV] Would launch app:', appId, params);
    }
    return;
  }

  // First check if the app is installed
  webOS.service.request('luna://com.webos.applicationManager', {
    method: 'getAppLoadStatus',
    parameters: { appId: appId },
    onSuccess: function (r) {
      if (!r.exist) {
        showToast('App niet geïnstalleerd: ' + appId);
        return;
      }
      // Then launch it
      webOS.service.request('luna://com.webos.applicationManager', {
        method: 'launch',
        parameters: { id: appId, params: params },
        onSuccess: function () {
          console.log('Launched:', appId, params);
        },
        onFailure: function (e) {
          showToast('Kon niet openen: ' + (e.errorText || appId));
          console.error('launch failed', e);
        }
      });
    },
    onFailure: function (e) {
      showToast('Fout: ' + (e.errorText || 'onbekend'));
      console.error('getAppLoadStatus failed', e);
    }
  });
}

// ── In-app video (direct URL, no DRM) ─────────────────────────
function playDirectUrl(url) {
  if (!url) { showToast('Geen video-URL opgegeven.'); return; }
  var player = document.getElementById('player');
  if (!player) {
    player = document.createElement('video');
    player.id       = 'player';
    player.controls = false;
    player.autoplay = true;
    player.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:50;';

    // Press Back to close video and return to grid
    player.addEventListener('keydown', function (e) {
      if (e.keyCode === 461 || e.keyCode === 27) {
        player.pause();
        document.body.removeChild(player);
        setFocus(focusIndex, false);
      }
    });
    document.body.appendChild(player);
  }
  player.src = url;
  player.focus();
}

// ── Videoland app ID discovery ────────────────────────────────
// Called at startup. Scans all installed apps and stores the one
// that matches 'videoland'. Logs the found ID so you can hardcode
// it in APP_IDS if auto-discovery is too slow.
function discoverVideolandAppId() {
  webOS.service.request('luna://com.webos.applicationManager', {
    method: 'listLaunchPoints',
    onSuccess: function (r) {
      var points = r.launchPoints || [];
      var found  = points.find(function (p) {
        return (p.id   && p.id.toLowerCase().includes('videoland')) ||
               (p.title && p.title.toLowerCase().includes('videoland'));
      });

      if (found) {
        APP_IDS.videoland = found.id;
        console.log('[KidsTV] Videoland app ID:', found.id);
      } else {
        console.warn('[KidsTV] Videoland not found in launch points.');
      }
    },
    onFailure: function (e) {
      console.warn('[KidsTV] listLaunchPoints failed:', e);
    }
  });
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, durationMs) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.add('hidden');
  }, durationMs || 3500);
}

// ── Loading screen ────────────────────────────────────────────
function hideLoading() {
  var el = document.getElementById('loading');
  if (el) el.classList.add('hidden');
}
