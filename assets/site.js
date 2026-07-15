/* Everlane Realty — site behavior.
   Ported from production assets/site.js (sergeselenko/everlane-realty-site@main,
   fetched 2026-07-07). No external JS deps (Dynamic-Wrapper safe).

   PREVIEW GUARD: PREVIEW_MODE hard-disables submission BEFORE any network
   path. The production endpoint string below is PRESERVED verbatim (so the
   cutover is a flag flip, not a re-wire) but is unreachable while in preview:
   (1) PREVIEW_MODE returns first, (2) the form's fields are inside a disabled
   <fieldset> in the markup, so submit cannot even fire.

   PREVIEW_MODE is no longer a hand-flipped literal — it is derived from the ONE
   cutover flag site.preview, which base.njk stamps onto <html data-preview>.
   Fail-safe: anything but an explicit "false" (missing attribute, typo, stale
   cache) is treated as preview, so the forms stay inert. At cutover the flag
   flips to false in one place (src/_data/site.js) and this reads it. */
(function () {
  "use strict";

  /* Derived from <html data-preview> (site.preview via base.njk). Fail-safe to preview. */
  var PREVIEW_MODE = document.documentElement.getAttribute("data-preview") !== "false";

  /* ---- FORM LIVE (go-live 2026-06-23): captures to the RLS-locked n8n sink
     (re-floor-store). Flipped after store RLS re-verified GREEN + zero-PII and
     the n8n intake sink was activated. ---- */
  var FORM_LIVE = true;
  var INTAKE_ENDPOINT = "https://selenko.app.n8n.cloud/webhook/intake-everlane";

  var MAILTO = '<a href="mailto:serge@everlanerealty.com">serge@everlanerealty.com</a>';

  Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var params = new URLSearchParams(window.location.search);
  var topic = params.get("topic") || "";
  var topicField = document.querySelector("[data-topic-field]");
  if (topicField) topicField.value = topic;
  if (topic === "home-value") {
    var titleEl = document.querySelector("[data-intake-title]");
    var ledeEl = document.querySelector("[data-intake-lede]");
    var aboutHome = document.querySelector('input[name="about"][value="home"]');
    if (titleEl) titleEl.textContent = "What's your home worth right now?";
    if (ledeEl) ledeEl.textContent = "Tell me about your place and what you're weighing — I'll put together an honest, current read on its value and your equity picture. No obligation.";
    if (aboutHome) aboutHome.checked = true;
  }

  /* ---- VALUATION SEND PATH (/valuation/) — a broker-prepared CMA request,
     NOT an on-site AVM. ONE guarded network path shared by the classic
     #valuation-form and the guided intake (assets/valuation-guided.js, which
     by charter carries no network primitive of its own — check.mjs enforces
     both halves). PREVIEW_MODE gates first; endpoint preserved-but-inert on
     preview; PII-free conversion event. `ui` = { start, info, ok, err } —
     each surface renders status its own way. ---- */
  function valuationSend(data, ui) {
    if (PREVIEW_MODE) {
      ui.info("Preview build — the form is disabled here. On the live site, reach me directly at " + MAILTO + ".");
      return;
    }

    if (!data.name || !validEmail(data.email) || !data.address) {
      ui.err("Please add your name, a valid email, and the property address.");
      return;
    }

    if (!FORM_LIVE || !INTAKE_ENDPOINT) {
      ui.info("Thanks! The form's secure intake is being finalized. In the meantime, the fastest way to reach me is a direct note to " + MAILTO + " — I read every one personally.");
      return;
    }

    ui.start();

    fetch(INTAKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error("bad status " + res.status);
      ui.ok("Got it — thank you. I'll put together an honest read on your home and follow up personally, usually within a day.");
      /* Conversion event — category fields only, never name/email/phone/address. */
      if (window.elTrack) window.elTrack("generate_lead", { method: data.source === "valuation-guided" ? "valuation_guided" : "valuation_form", topic: "home-value" });
    }).catch(function () {
      ui.err("Something went wrong sending that. Please email me directly at " + MAILTO + " and I'll take it from there.");
    });
  }
  window.elValuationSend = valuationSend;

  /* Classic form handler — its own listener because the intake handler below
     early-returns when #intake-form is absent. Honeypot stays here (the guided
     flow has no static field for a bot to fill). */
  (function () {
    var vform = document.getElementById("valuation-form");
    if (!vform) return;
    var vstatus = document.querySelector("[data-form-status]");
    var vsubmit = vform.querySelector("[data-submit]");
    function vSet(kind, msg) { if (!vstatus) return; vstatus.className = "form-status show " + kind; vstatus.innerHTML = msg; }
    function vField(n) { var el = vform.querySelector('[name="' + n + '"]'); return el ? (el.value || "").trim() : ""; }

    vform.addEventListener("submit", function (e) {
      e.preventDefault();

      var hp = vform.querySelector('input[name="company"]');
      if (hp && hp.value.trim() !== "") { return; }

      valuationSend({
        name: vField("name"),
        email: vField("email"),
        phone: vField("phone"),
        address: vField("address"),
        timeline: vField("timeline"),
        notes: vField("notes"),
        topic: "home-value",
        source: "valuation-form"
      }, {
        start: function () {
          vsubmit.disabled = true;
          vsubmit.textContent = "Sending…";
          vSet("info", "Sending…");
        },
        info: function (msg) { vSet("info", msg); },
        ok: function (msg) {
          vform.reset();
          vSet("ok", msg);
          vsubmit.textContent = "Sent ✓";
        },
        err: function (msg) {
          vsubmit.disabled = false;
          vsubmit.textContent = "Request my home value";
          vSet("err", msg);
        }
      });
    });
  })();

  var form = document.getElementById("intake-form");
  if (!form) return;
  var statusEl = document.querySelector("[data-form-status]");
  var submitBtn = form.querySelector("[data-submit]");

  function setStatus(kind, msg) {
    if (!statusEl) return;
    statusEl.className = "form-status show " + kind;
    statusEl.innerHTML = msg;
  }

  function validEmail(v) { return /.+@.+\..+/.test(v); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (PREVIEW_MODE) {
      setStatus("info", "Preview build — the form is disabled here. On the live site, reach me directly at " + MAILTO + ".");
      return;
    }

    var hp = form.querySelector('input[name="company"]');
    if (hp && hp.value.trim() !== "") { return; }

    var data = {
      name: (form.name && form.name.value || "").trim(),
      email: (form.email && form.email.value || "").trim(),
      phone: (form.phone && form.phone.value || "").trim(),
      situation: (form.situation && form.situation.value || "").trim(),
      about: (form.querySelector('input[name="about"]:checked') || {}).value || "",
      outcome: (form.outcome && form.outcome.value || "").trim(),
      context: (form.context && form.context.value || "").trim(),
      topic: (topicField && topicField.value) || "",
      source: "intake-form"
    };

    if (!data.name || !validEmail(data.email) || !data.situation || !data.about) {
      setStatus("err", "Please add your name, a valid email, the situation, and what it's mostly about.");
      return;
    }

    if (!FORM_LIVE || !INTAKE_ENDPOINT) {
      setStatus("info", "Thanks! The form's secure intake is being finalized. In the meantime, the fastest way to reach me is a direct note to " + MAILTO + " — I read every one personally.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    setStatus("info", "Sending…");

    fetch(INTAKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error("bad status " + res.status);
      form.reset();
      setStatus("ok", "Got it — thank you. I'll review your situation and follow up personally, usually within a day.");
      submitBtn.textContent = "Sent ✓";
      /* Conversion event (wave 2 measurement layer). Category fields only —
         never name/email/phone: no PII reaches analytics, by construction. */
      if (window.elTrack) window.elTrack("generate_lead", { method: "intake_form", topic: data.topic || "(none)", about: data.about || "(none)" });
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send it to Serge";
      setStatus("err", "Something went wrong sending that. Please email me directly at " + MAILTO + " and I'll take it from there.");
    });
  });
})();
