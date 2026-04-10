/**
 * webOSTV.js — minimal implementation
 *
 * On a real LG WebOS TV the platform injects `window.PalmServiceBridge`
 * into every web-app context. This file wraps that bridge into the
 * `window.webOS` shape that app.js expects.
 *
 * In a desktop browser PalmServiceBridge is absent, so we fall back to
 * a console-logging stub (identical to the one in app.js) — that way
 * the UI is fully previewable on a Mac without changing app.js.
 *
 * API surface used by app.js:
 *   webOS.service.request(uri, { method, parameters, onSuccess, onFailure })
 */
(function (global) {
  'use strict';

  // ── Already defined? (e.g. page re-entry) ────────────────────
  if (global.webOS && global.webOS.service) return;

  // ── On-device: wrap PalmServiceBridge ────────────────────────
  if (typeof global.PalmServiceBridge !== 'undefined') {
    var ServiceRequest = function (uri, opts) {
      opts = opts || {};
      var fullUri = uri.replace(/\/$/, '') + '/' + (opts.method || '');
      var params  = JSON.stringify(opts.parameters || {});

      var bridge = new global.PalmServiceBridge();

      bridge.onservicecallback = function (rawMsg) {
        var msg;
        try { msg = JSON.parse(rawMsg); } catch (e) { msg = {}; }

        if (msg.returnValue === false || msg.errorCode) {
          if (opts.onFailure) opts.onFailure(msg);
        } else {
          if (opts.onSuccess) opts.onSuccess(msg);
        }
      };

      bridge.call(fullUri, params);
      return bridge;
    };

    global.webOS = {
      service: {
        request: function (uri, opts) {
          return new ServiceRequest(uri, opts);
        }
      }
    };

    console.log('[webOSTV.js] Running on WebOS — using PalmServiceBridge.');

  } else {
    // ── Dev / browser fallback ─────────────────────────────────
    // If app.js already installed a shim (loaded before this file),
    // keep it. Otherwise install a fresh one.
    if (!global.webOS) {
      global.webOS = {
        service: {
          request: function (uri, opts) {
            opts = opts || {};
            console.log('[webOSTV.js DEV] luna:', uri + '/' + opts.method, opts.parameters);
            setTimeout(function () {
              if (opts.onSuccess) opts.onSuccess({ returnValue: true, exist: true });
            }, 200);
          }
        }
      };
    }
    console.warn('[webOSTV.js] PalmServiceBridge not found — using dev stub.');
  }

}(window));
