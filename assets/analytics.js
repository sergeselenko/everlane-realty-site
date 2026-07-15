/* Everlane Realty — measurement layer (wave 2, plan §10; Feed & Ops lane).
   GA4 loader + conversion-event bus.

   HARD RUNTIME HOST GATE: gtag.js loads ONLY on the production hostnames
   passed via data-hosts. On the preview host (github.io), localhost, or any
   other origin this file defines window.elTrack as an inert queue and makes
   ZERO network requests — no Google tag request ever leaves a
   non-production host (check 14 verifies the gate sits ahead of the loader).

   window.elTrack(name, params) is the ONE event seam. Everything that counts
   as a conversion goes through it (generate_lead, book_appointment,
   concierge_lead), so a future pixel/CAPI layer subscribes here without
   touching call sites (see analytics/pixel-capi-readiness-memo.md). */
(function () {
  "use strict";

  var me = document.currentScript;
  var GA4_ID = me ? (me.getAttribute("data-ga4") || "") : "";
  var HOSTS = me ? (me.getAttribute("data-hosts") || "").split(",") : [];

  var queue = [];
  var live = false;

  function flush() {
    if (!live || !window.gtag) return;
    while (queue.length) {
      var ev = queue.shift();
      window.gtag("event", ev[0], ev[1]);
    }
  }

  window.elTrack = function (name, params) {
    if (queue.length < 50) queue.push([String(name), params || {}]);
    flush();
  };

  /* Gate 1: no measurement ID baked ⇒ inert. Gate 2: wrong host ⇒ inert. */
  if (!GA4_ID) return;
  if (HOSTS.indexOf(window.location.hostname) === -1) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  /* No ad personalization signals at v1; conversions + attribution only. */
  window.gtag("config", GA4_ID, { allow_google_signals: false });

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_ID);
  document.head.appendChild(s);

  live = true;
  flush();
})();
