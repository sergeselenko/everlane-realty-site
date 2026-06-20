/* Everlane Realty — site behavior (Claude-built, [D]).
   No external JS deps (Dynamic-Wrapper safe). */
(function () {
  "use strict";

  /* ---- RLS HARD GATE: form collects/sends NOTHING until the n8n sink is
     built and store RLS re-verified GREEN + zero-PII. Flip FORM_LIVE + set
     INTAKE_ENDPOINT only after validate-by-running passes. ---- */
  var FORM_LIVE = false;
  var INTAKE_ENDPOINT = "";

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
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send it to Serge";
      setStatus("err", "Something went wrong sending that. Please email me directly at " + MAILTO + " and I'll take it from there.");
    });
  });
})();
