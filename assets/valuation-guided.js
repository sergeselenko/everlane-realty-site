/* Guided valuation intake — /valuation/ (launch-checklist #1, plan §2 #3).
   A DETERMINISTIC, scripted question-by-question intake rendered in the site's
   chat idiom. Deliberately NOT an LLM conversation: this flow collects PII
   (address / name / email) which must reach ONLY the RLS-locked intake sink —
   never a model, never a query log, never analytics, never web storage. The
   "AI" of the guided AI-CMA lives elsewhere by design: Lane (embedded below,
   PII-free) answers how-it-works questions, and the comp analysis behind the
   broker's report arrives with the licensed data feed. The report itself is
   broker-prepared and broker-sent (≤ a day) — never an on-site point estimate.

   NETWORK CHARTER: this file carries NO network primitive and no endpoint —
   scripts/check.mjs fails the build if a fetch call / XHR / a beacon / an
   absolute URL / web storage ever appears in this file. The single guarded
   send path is window.elValuationSend
   (site.js: PREVIEW_MODE first, endpoint preserved-but-inert on preview).

   Progressive enhancement: the classic #valuation-form stays the server-
   rendered no-JS default; this panel replaces it only when JS boots, with a
   visible swap back to the classic form. */
(function () {
  "use strict";

  var root = document.querySelector("[data-val-guided]");
  var classic = document.querySelector("[data-val-classic]");
  var swapWrap = document.querySelector("[data-val-swap]");
  var swapBtn = document.querySelector("[data-val-swap-btn]");
  var log = root && root.querySelector(".chat-log");
  var answerHost = root && root.querySelector("[data-val-answer]");
  if (!root || !classic || !log || !answerHost) return;

  var SEND_LABEL = "Request my home value";
  var A = {};              // answers, in memory only — dies with the page
  var idx = 0;
  var reviewing = false;   // editing a single answer from the review card
  var reviewSeen = false;  // funnel event fires once, not on every edit-return

  /* ---- the flow ---- */
  var steps = [
    {
      key: "address", label: "Address", kind: "text", required: true,
      ask: "First — which home are we valuing? Street address and city is perfect.",
      ph: "123 12th Ave NE, St. Petersburg", maxlen: 200,
      validate: function (v) {
        return v.length >= 5 ? "" : "I’ll need the street address and city to pull the right comparable sales.";
      }
    },
    {
      key: "type", label: "Type", kind: "chips",
      ask: "What kind of home is it?",
      opts: [
        { label: "Single-family", value: "Single-family" },
        { label: "Condo", value: "Condo" },
        { label: "Townhome", value: "Townhome" },
        { label: "Multi-unit", value: "Multi-unit" },
        { label: "Something else", value: "Other" }
      ]
    },
    {
      key: "bedsbaths", label: "Beds / baths", kind: "duo", skip: true,
      ask: "How many beds and baths?"
    },
    {
      key: "condition", label: "Condition", kind: "chips",
      ask: "How would you describe the condition, honestly? This shapes the range more than anything else.",
      opts: [
        { label: "Move-in ready", value: "Move-in ready" },
        { label: "Solid, a little dated", value: "Solid, a little dated" },
        { label: "Needs some work", value: "Needs some work" },
        { label: "Major project underway", value: "Major project underway" }
      ]
    },
    {
      key: "notes", label: "Notes", kind: "textarea", skip: true,
      ask: "Anything the county records won’t show? Recent updates — roof, kitchen, HVAC, windows — flood history, an addition, a view. Rough years help.",
      ph: "New roof 2023, kitchen redone…", maxlen: 1000
    },
    {
      key: "timeline", label: "Timeline", kind: "chips",
      ask: "Where are you in the process? There’s no wrong answer — “just curious” is a real one.",
      opts: [
        { label: "Just curious what it’s worth", value: "curious" },
        { label: "Weighing a sale (next 3–6 months)", value: "weighing" },
        { label: "Ready to sell soon", value: "soon" },
        { label: "Refinance / equity check", value: "equity" },
        { label: "Prefer not to say", value: "" }
      ]
    },
    {
      key: "name", label: "Name", kind: "text", required: true,
      ask: "Nearly done. Who should the read be addressed to?",
      ph: "First and last name", maxlen: 100,
      validate: function (v) { return v.length >= 2 ? "" : "A name helps me address the read to the right person."; }
    },
    {
      key: "email", label: "Email", kind: "text", required: true, type: "email",
      ask: "Where should I send it? Email only — your valuation, not a mailing list.",
      ph: "you@example.com", maxlen: 200,
      validate: function (v) { return /.+@.+\..+/.test(v) ? "" : "That email doesn’t look complete — mind checking it?"; }
    },
    {
      key: "phone", label: "Cell", kind: "text", skip: true, type: "tel",
      ask: "And a cell number, if you’d rather talk it through or get a text. Skipping is completely fine.",
      ph: "(727) 555‑0123", maxlen: 40
    }
  ];

  function stepIndex(key) {
    for (var i = 0; i < steps.length; i++) if (steps[i].key === key) return i;
    return -1;
  }

  /* ---- chat rendering (all user echo via textContent — never innerHTML) ---- */
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function botBubble(text, who) {
    var r = document.createElement("div");
    r.className = "chat-msg chat-msg--bot";
    if (who) {
      var w = document.createElement("span");
      w.className = "chat-who"; w.textContent = who;
      r.appendChild(w);
    }
    var b = document.createElement("div");
    b.className = "chat-bubble"; b.textContent = text;
    r.appendChild(b);
    log.appendChild(r); scrollDown();
    return b;
  }

  function youBubble(text) {
    var r = document.createElement("div");
    r.className = "chat-msg chat-msg--you";
    var w = document.createElement("span");
    w.className = "chat-who"; w.textContent = "You";
    r.appendChild(w);
    var b = document.createElement("div");
    b.className = "chat-bubble"; b.textContent = text;
    r.appendChild(b);
    log.appendChild(r); scrollDown();
  }

  /* Status messages come from site.js's guarded send path as trusted constant
     HTML (they carry the mailto link) — the ONLY innerHTML in this file.
     A repeated status REPLACES the previous status bubble (grade F4 — repeat
     clicks on preview must not stack duplicate bubbles). */
  function statusBubble(kind, html) {
    var last = log.lastElementChild;
    if (last && last.querySelector(".val-status")) log.removeChild(last);
    var r = document.createElement("div");
    r.className = "chat-msg chat-msg--bot";
    var b = document.createElement("div");
    b.className = "chat-bubble val-status val-status--" + kind;
    b.innerHTML = html;
    r.appendChild(b);
    log.appendChild(r); scrollDown();
  }

  function clearAnswer() { answerHost.innerHTML = ""; }

  function navRow(step, onBack, onSkip) {
    var nav = document.createElement("div");
    nav.className = "val-nav";
    if (onBack) {
      var back = document.createElement("button");
      back.type = "button"; back.textContent = "← Back";
      back.addEventListener("click", onBack);
      nav.appendChild(back);
    }
    if (step.skip && onSkip) {
      var skip = document.createElement("button");
      skip.type = "button"; skip.textContent = "Skip this one";
      skip.addEventListener("click", onSkip);
      nav.appendChild(skip);
    }
    return nav;
  }

  function errLine(host, msg, input) {
    var old = host.querySelector(".val-err");
    if (old) old.parentNode.removeChild(old);
    if (input) { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
    if (!msg) return;
    /* role=alert so the re-inserted error is ANNOUNCED (grade F2 — a silent
       validation failure is invisible to a screen-reader user). */
    var e = document.createElement("p");
    e.className = "val-err"; e.id = "val-err-live";
    e.setAttribute("role", "alert");
    e.textContent = msg;
    host.appendChild(e);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "val-err-live");
    }
  }

  /* ---- step control renderers ---- */
  function renderText(step, focus) {
    var wrap = document.createElement("div");
    var composer = document.createElement("div");
    composer.className = "chat-composer";
    var input = step.kind === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");
    if (step.kind === "textarea") input.rows = 3;
    else input.type = step.type || "text";
    input.placeholder = step.ph || "";
    if (step.maxlen) input.maxLength = step.maxlen;
    input.setAttribute("aria-label", step.ask);
    if (A[step.key]) input.value = A[step.key];
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "chat-send"; btn.textContent = "Continue";
    composer.appendChild(input); composer.appendChild(btn);
    wrap.appendChild(composer);

    function commit() {
      var v = (input.value || "").trim();
      var bad = "";
      if (step.required && !v) bad = "This one I do need to move forward.";
      else if (v && step.validate) bad = step.validate(v);
      if (bad) { errLine(wrap, bad, input); input.focus(); return; }
      answer(step, v, v || "Skipped");
    }
    btn.addEventListener("click", commit);
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      /* input: Enter commits · textarea: Cmd/Ctrl+Enter commits, Enter = newline */
      if (step.kind !== "textarea" || e.metaKey || e.ctrlKey) { e.preventDefault(); commit(); }
    });

    wrap.appendChild(navRow(step, backHandler(), step.skip ? function () { answer(step, "", "Skipped"); } : null));
    answerHost.appendChild(wrap);
    if (focus) input.focus();
  }

  function renderChips(step, focus) {
    var wrap = document.createElement("div");
    var row = document.createElement("div");
    row.className = "chip-row";
    step.opts.forEach(function (o) {
      var c = document.createElement("button");
      c.type = "button"; c.className = "chip"; c.textContent = o.label;
      c.addEventListener("click", function () { answer(step, o.value, o.label); });
      row.appendChild(c);
    });
    wrap.appendChild(row);
    wrap.appendChild(navRow(step, backHandler(), null));
    answerHost.appendChild(wrap);
    if (focus) { var first = row.querySelector(".chip"); if (first) first.focus(); }
  }

  function renderDuo(step, focus) {
    var wrap = document.createElement("div");
    var duo = document.createElement("div");
    duo.className = "val-duo";
    var beds = duoSelect("Beds", ["", "1", "2", "3", "4", "5", "6+"], A.beds);
    var baths = duoSelect("Baths", ["", "1", "1.5", "2", "2.5", "3", "3.5", "4+"], A.baths);
    duo.appendChild(beds.label); duo.appendChild(baths.label);
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "chat-send val-duo__go"; btn.textContent = "Continue";
    btn.addEventListener("click", function () {
      A.beds = beds.select.value; A.baths = baths.select.value;
      var echo = (A.beds || A.baths)
        ? (A.beds || "—") + " beds / " + (A.baths || "—") + " baths"
        : "Skipped";
      answer(step, { beds: A.beds, baths: A.baths }, echo);
    });
    duo.appendChild(btn);
    wrap.appendChild(duo);
    wrap.appendChild(navRow(step, backHandler(), function () {
      A.beds = ""; A.baths = "";
      answer(step, { beds: "", baths: "" }, "Skipped");
    }));
    answerHost.appendChild(wrap);
    if (focus) beds.select.focus();
  }

  function duoSelect(name, values, current) {
    var label = document.createElement("label");
    var span = document.createElement("span");
    span.textContent = name;
    var select = document.createElement("select");
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v === "" ? "—" : v;
      select.appendChild(o);
    });
    if (current) select.value = current;
    label.appendChild(span); label.appendChild(select);
    return { label: label, select: select };
  }

  function backHandler() {
    if (reviewing) return function () { reviewing = false; showReview(); };
    if (idx === 0) return null;
    return function () { idx--; askStep(true); };
  }

  /* ---- flow engine ---- */
  function answer(step, value, echo) {
    if (step.kind !== "duo") A[step.key] = value;
    youBubble(echo);
    clearAnswer();
    if (reviewing) { reviewing = false; showReview(); return; }
    /* PII-free funnel event (operator D1 ruling 2026-07-10: keep guided
       primary + MEASURE the friction assumption): step index + field KEY
       only — never the answer. Inert until GA4 lights up at cutover; edits
       from review deliberately don't re-fire. */
    if (window.elTrack) window.elTrack("valuation_step", { method: "valuation_guided", step: stepIndex(step.key) + 1, of: steps.length, field: step.key });
    idx = stepIndex(step.key) + 1;
    if (idx >= steps.length) showReview();
    else askStep(true);
  }

  function askStep(focus) {
    var step = steps[idx];
    clearAnswer();
    botBubble(step.ask, "Question " + (idx + 1) + " of " + steps.length);
    if (step.kind === "chips") renderChips(step, focus);
    else if (step.kind === "duo") renderDuo(step, focus);
    else renderText(step, focus);
  }

  function reviewValue(key) {
    if (key === "bedsbaths") {
      return (A.beds || A.baths) ? (A.beds || "—") + " / " + (A.baths || "—") : "—";
    }
    if (key === "timeline") {
      var t = steps[stepIndex("timeline")];
      for (var i = 0; i < t.opts.length; i++) if (t.opts[i].value === (A.timeline || "")) return A.timeline ? t.opts[i].label : "—";
      return "—";
    }
    return A[key] || "—";
  }

  function showReview() {
    clearAnswer();
    /* Funnel: the gap between this and generate_lead = review abandonment.
       Fires once — edit-returns don't re-count. */
    if (!reviewSeen && window.elTrack) window.elTrack("valuation_review", { method: "valuation_guided" });
    reviewSeen = true;
    botBubble("Here’s everything I’ll send. Look it over — you can change any answer.", "Review");

    var card = document.createElement("div");
    card.className = "val-review";
    var dl = document.createElement("dl");
    steps.forEach(function (step) {
      var dt = document.createElement("dt"); dt.textContent = step.label;
      /* Edit lives INSIDE the dd (grade F10a — a bare div between dd and the
         next dt breaks the dl content model). */
      var dd = document.createElement("dd");
      var val = document.createElement("span");
      val.className = "val-review__val"; val.textContent = reviewValue(step.key);
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "val-edit";
      btn.textContent = "Edit";
      btn.setAttribute("aria-label", "Edit " + step.label);
      btn.addEventListener("click", function () {
        reviewing = true; idx = stepIndex(step.key); askStep(true);
      });
      dd.appendChild(val); dd.appendChild(btn);
      dl.appendChild(dt); dl.appendChild(dd);
    });
    card.appendChild(dl);

    /* Consent copy is cloned from the classic form — single-sourced, no drift. */
    var consents = classic.querySelectorAll(".consent-note");
    Array.prototype.forEach.call(consents, function (p) { card.appendChild(p.cloneNode(true)); });
    answerHost.appendChild(card);

    var row = document.createElement("div");
    row.className = "val-send-row";
    var send = document.createElement("button");
    send.type = "button"; send.className = "btn btn--primary btn--block";
    send.textContent = SEND_LABEL;
    send.addEventListener("click", function () { doSend(send); });
    row.appendChild(send);
    answerHost.appendChild(row);
  }

  function composeData() {
    var parts = [];
    if (A.type) parts.push("Type: " + A.type);
    if (A.beds || A.baths) parts.push("Beds/baths: " + (A.beds || "?") + "/" + (A.baths || "?"));
    if (A.condition) parts.push("Condition: " + A.condition);
    var notes = parts.join(" · ");
    if (A.notes) notes += (notes ? "\n" : "") + A.notes;
    return {
      name: A.name || "",
      email: A.email || "",
      phone: A.phone || "",
      address: A.address || "",
      timeline: A.timeline || "",
      notes: notes,
      topic: "home-value",
      source: "valuation-guided"
    };
  }

  /* Lock the review's Edit buttons while a send is in flight (grade F3 —
     an edit started mid-flight is wiped by a late ok() and silently lost). */
  function setReviewLock(on) {
    Array.prototype.forEach.call(answerHost.querySelectorAll(".val-edit"), function (b) { b.disabled = on; });
  }

  function doSend(btn) {
    var send = window.elValuationSend;
    if (typeof send !== "function") {
      statusBubble("err", "Something went wrong on this page. Please email me directly at " +
        '<a href="mailto:serge@everlanerealty.com">serge@everlanerealty.com</a> and I’ll take it from there.');
      return;
    }
    send(composeData(), {
      start: function () { btn.disabled = true; btn.textContent = "Sending…"; setReviewLock(true); },
      info: function (html) { statusBubble("info", html); btn.disabled = false; btn.textContent = SEND_LABEL; setReviewLock(false); },
      ok: function (html) {
        statusBubble("ok", html);
        clearAnswer();
        var links = root.querySelector("[data-val-done]");
        if (links) { links.hidden = false; answerHost.appendChild(links); }
      },
      err: function (html) { statusBubble("err", html); btn.disabled = false; btn.textContent = SEND_LABEL; setReviewLock(false); }
    });
  }

  /* ---- boot: guided becomes primary, classic collapses behind the swap ---- */
  root.hidden = false;
  classic.hidden = true;
  if (swapWrap && swapBtn) {
    swapWrap.hidden = false;
    var LBL_TO_CLASSIC = "Prefer a simple form? Use the classic version";
    var LBL_TO_GUIDED = "← Back to the guided version";
    swapBtn.textContent = LBL_TO_CLASSIC;
    swapBtn.addEventListener("click", function () {
      var showClassic = classic.hidden;
      classic.hidden = !showClassic;
      root.hidden = showClassic;
      swapBtn.textContent = showClassic ? LBL_TO_GUIDED : LBL_TO_CLASSIC;
    });
  }
  askStep(false); /* no focus-steal on page load */
})();
