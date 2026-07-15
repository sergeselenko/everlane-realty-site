// AI Concierge — /ask/ client (re-website #149, Wave 3).
// Loaded only when askLive (src/ask.njk). POSTs the question to the deployed
// `ask` edge function and renders the reply as a chat bubble; degrades SILENTLY
// to the honest resting copy on any non-200 / {state:"resting"} / error. No PII
// is sent; the sessionId is a random UUID kept in localStorage.
//
// No apikey/Authorization header: the function is public (--no-verify-jwt) and
// the Supabase gateway accepts the POST without one. Sending them would force a
// CORS preflight the function's Allow-Headers (content-type only) rejects — so
// the ONLY request header is content-type.
(function () {
  var ENDPOINT = "https://iavsouedogroqzwmccwy.supabase.co/functions/v1/ask";
  var form = document.querySelector(".chat-form");
  var log = document.querySelector(".chat-log");
  var input = document.getElementById("ask-input");
  var sendBtn = form && form.querySelector("[data-submit]");
  if (!form || !log || !input) return;

  // Root-relative CTA/search hrefs come from the edge function, which doesn't
  // know the site's path prefix; prefix them so they resolve on the preview
  // (github.io/everlane-realty-preview/…) as well as production. Absolute source
  // URLs (citations) pass through untouched.
  var BASE = (window.__ASK_BASE__ || "/");
  function withBase(h) {
    if (!h || h === "#" || /^https?:/i.test(h)) return h;
    return BASE.replace(/\/+$/, "/") + String(h).replace(/^\/+/, "");
  }

  var sid = localStorage.getItem("el_ask_sid") ||
    (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  localStorage.setItem("el_ask_sid", sid);

  var pending = false;
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function row(who) {
    var r = document.createElement("div");
    r.className = "chat-msg chat-msg--" + who;
    var w = document.createElement("span");
    w.className = "chat-who";
    w.textContent = who === "you" ? "You" : "Lane";
    r.appendChild(w);
    return r;
  }
  // Render as plain text; strip markdown bold markers the model sometimes emits.
  function bubble(parent, text) {
    var b = document.createElement("div");
    b.className = "chat-bubble";
    b.textContent = String(text == null ? "" : text).replace(/\*\*/g, "");
    parent.appendChild(b);
    return b;
  }

  function addUser(text) {
    var r = row("you"); bubble(r, text);
    log.appendChild(r); scrollDown();
  }

  function addBot(text, cites, ctas) {
    var r = row("bot");
    var b = bubble(r, text);
    if (cites && cites.length) {
      var s = document.createElement("p");
      s.className = "chat-cites";
      var lbl = document.createElement("span");
      lbl.className = "chat-cites__label"; lbl.textContent = "Sources";
      s.appendChild(lbl);
      cites.forEach(function (c) {
        var a = document.createElement("a");
        a.href = withBase(c.url || c.href || "#");
        a.textContent = c.name || c.label || c.url || "source";
        a.rel = "nofollow noopener"; a.target = "_blank";
        s.appendChild(a);
      });
      b.appendChild(s);
    }
    if (ctas && ctas.length) {
      var c2 = document.createElement("p");
      c2.className = "chat-ctas";
      ctas.forEach(function (c) {
        var a = document.createElement("a");
        a.href = withBase(c.href || "#");
        a.className = "btn btn--primary chat-cta";
        a.textContent = c.label || "Continue";
        c2.appendChild(a);
      });
      b.appendChild(c2);
    }
    log.appendChild(r); scrollDown();
  }

  function addThinking() {
    var r = row("bot");
    r.classList.add("chat-msg--thinking");
    var b = document.createElement("div");
    b.className = "chat-bubble chat-typing";
    b.innerHTML = '<span class="chat-typing__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="chat-typing__label">checking sources &amp; fair housing…</span>';
    r.appendChild(b);
    log.appendChild(r); scrollDown();
    return r;
  }

  function setPending(on) {
    pending = on;
    if (sendBtn) sendBtn.disabled = on;
    input.disabled = on;
  }

  function ask(q) {
    q = (q || "").trim();
    if (!q || pending) return;
    addUser(q);
    input.value = ""; autogrow();
    setPending(true);
    var thinking = addThinking();
    var done = function (text, cites, ctas) {
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);
      addBot(text, cites, ctas);
      setPending(false);
      if (!input.disabled) input.focus();
    };
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, sessionId: sid })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.state === "resting") {
          done((d && d.text) || "Lane is resting right now — browse the guides or reach Serge directly.",
            null, [{ label: "Book a consult", href: "/contact/" }]);
        } else {
          done(d.text, d.citations, d.ctas);
        }
      })
      .catch(function () {
        done("Lane is resting right now — browse the guides or reach Serge directly.",
          null, [{ label: "Book a consult", href: "/contact/" }]);
      });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });

  // Enter sends; Shift+Enter inserts a newline.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });

  // Auto-grow the composer up to a cap.
  function autogrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }
  input.addEventListener("input", autogrow);

  // Suggested-question chips fill + send.
  var chips = document.querySelectorAll(".chat-suggest .chip");
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener("click", function () {
      if (pending) return;
      ask(chip.getAttribute("data-q") || chip.textContent);
    });
  });

  // Deep-link prefill: the homepage ask module sends visitors to /ask/?q=… —
  // pick up the question and auto-send it once so the answer is already coming.
  try {
    var q0 = new URLSearchParams(window.location.search).get("q");
    if (q0) ask(q0);
  } catch (e) { /* no-op */ }
})();
