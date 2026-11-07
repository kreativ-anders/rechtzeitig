// Theme switch: light or dark. Without a saved choice the page follows the system setting,
// and the switch shows whichever of the two that is. Picking the theme the system already
// uses removes the saved choice, so the page follows the system again. The choice is kept
// in localStorage under "theme"; an inline script in <head> applies it before the first paint.
(() => {
  const root = document.documentElement;
  const box = document.querySelector(".theme");
  if (!box) return;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const system = () => (media.matches ? "dark" : "light");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  if (saved !== "light" && saved !== "dark") saved = null;
  const show = () => {
    const input = box.querySelector(`input[value="${saved ?? system()}"]`);
    if (input) input.checked = true;
  };
  show();
  box.hidden = false;
  media.addEventListener("change", () => { if (!saved) show(); });
  box.addEventListener("change", (e) => {
    const value = e.target.value;
    saved = value === system() ? null : value;
    try {
      if (saved) localStorage.setItem("theme", saved);
      else localStorage.removeItem("theme");
    } catch {}
    if (saved) root.dataset.theme = saved;
    else delete root.dataset.theme;
  });
})();

// A link to a closed <details> (for example ./#updates) opens it.
(() => {
  const open = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el instanceof HTMLDetailsElement) el.open = true;
  };
  open();
  addEventListener("hashchange", open);
})();

// Visitor statistics with Pirsch (see privacy.html § 3, de/datenschutz.html § 3). track() sends one named event with
// short string values. If pa.js is blocked or not loaded yet, nothing happens.
window.track = (name, meta) => {
  try { window.pirsch?.(name, { meta })?.catch?.(() => {}); } catch {}
};

// Language: English and German. A page with a counterpart in the other language names it in
// <link rel="alternate" hreflang>. On entry, without a saved choice, such a page follows the
// browser: if de or en, whichever comes first in navigator.languages, is the other language,
// it opens the counterpart (same path, hash and query). It never redirects when the visitor came
// from this site (they chose the page), and never for bots. Picking a language in the header
// saves it under "lang" in localStorage only if it differs from the browser's; picking the
// browser's language removes it. A saved choice wins over the browser.
(() => {
  const page = document.documentElement.lang.slice(0, 2);
  const browser = () => {
    for (const l of navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]) {
      const code = l.slice(0, 2).toLowerCase();
      if (code === "de" || code === "en") return code;
    }
    return null;
  };
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch {}
  if (saved !== "de" && saved !== "en") saved = null;

  const switcher = document.querySelector(".langs");
  switcher?.addEventListener("click", (e) => {
    const a = e.target instanceof Element && e.target.closest("a[hreflang]");
    if (!a || a.hreflang === page) return;
    const to = a.hreflang;
    try {
      if (to === browser()) localStorage.removeItem("lang");
      else localStorage.setItem("lang", to);
    } catch {}
    track("Language switch", { from: page, to });
  });

  const other = document.querySelector(`link[rel="alternate"][hreflang="${page === "de" ? "en" : "de"}"]`);
  if (!other) return;
  const bot = navigator.webdriver || /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent);
  let fromHere = false;
  try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
  if (bot || fromHere) return;
  const want = saved ?? browser();
  if (!want || want === page) return;
  // Same path on this origin, so it also works on a local copy of the site.
  const target = new URL(new URL(other.href).pathname + location.search + location.hash, location.origin);
  if (target.href !== location.href) location.replace(target.href);
})();

// Where on the page an element sits: header, hero, steps, faq, footer, a section id or body.
const where = (el) => {
  if (el.closest("header")) return "header";
  if (el.closest("footer")) return "footer";
  for (const c of ["hero", "steps", "faq", "toc", "rule"]) if (el.closest(`.${c}`)) return c;
  return el.closest("section[id]")?.id ?? "body";
};

// Clicks on links to workflow.html, with the section and where on the page the link sits.
// Links to other sites (GitHub, law sources) are not tracked here: pa.js counts every
// outbound click itself as "Outbound Link Click" with the link's address.
(() => {
  const onClick = (e) => {
    const a = e.target instanceof Element && e.target.closest("a[href]");
    if (!a || (e.type === "auxclick" && e.button !== 1)) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && url.pathname.endsWith("/workflow.html")) {
      track("Workflow link", { target: `workflow.html${url.hash}`.slice(0, 100), at: where(a) });
    }
  };
  document.addEventListener("click", onClick);
  document.addEventListener("auxclick", onClick);
})();

// A Copy button on every code block. Without the Clipboard API there is no button.
(() => {
  if (!navigator.clipboard?.writeText) return;
  const COPY = document.documentElement.lang === "de" ? ["Kopieren", "Kopiert"] : ["Copy", "Copied"];
  // The block's name: the id of its <details>, else the nearest heading before it.
  const label = (pre) => {
    const details = pre.closest("details[id]");
    if (details) return details.id;
    for (let n = pre; n; n = n.previousElementSibling ?? n.parentElement) {
      if (n.matches("h1, h2, h3, summary")) return n.id || n.textContent.trim().slice(0, 60);
    }
    return "page";
  };
  for (const code of document.querySelectorAll("pre > code")) {
    const pre = code.parentElement;
    const box = document.createElement("div");
    box.className = "codebox";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = COPY[0];
    const status = document.createElement("span");
    status.className = "visually-hidden";
    status.setAttribute("role", "status");
    pre.replaceWith(box);
    box.append(pre, button, status);
    let timer;
    button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code.textContent); } catch { return; }
      button.textContent = status.textContent = COPY[1];
      button.dataset.copied = "";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = COPY[0];
        status.textContent = "";
        delete button.dataset.copied;
      }, 2000);
      track("Copy code", { page: location.pathname, block: label(pre) });
    });
  }
})();

// Opening a question on the start page.
(() => {
  for (const d of document.querySelectorAll(".faq details")) {
    d.addEventListener("toggle", () => {
      if (d.open) track("FAQ open", { question: d.id || d.querySelector("summary").textContent.trim().slice(0, 60) });
    });
  }
})();
