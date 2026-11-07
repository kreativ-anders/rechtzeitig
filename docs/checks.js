// Search and filter chips for checks.html. Without JavaScript all cards stay visible.
(() => {
  const rules = [...document.querySelectorAll(".rule")];
  const modules = [...document.querySelectorAll(".module")];
  const q = document.getElementById("q");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const state = { module: "all", scope: "all", severity: new Set() };

  const tally = (key, value) => rules.filter((r) => r.dataset[key] === value).length;

  function chip(parent, label, n, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", "false");
    const count = document.createElement("span");
    count.className = "n";
    count.textContent = String(n);
    b.append(label, count);
    b.addEventListener("click", () => { onClick(b); update(); });
    parent.append(b);
    return b;
  }

  const moduleBox = document.getElementById("modules");
  const moduleChips = [];
  const pickModule = (value) => (b) => {
    state.module = value;
    window.track?.("Checks filter", { filter: "group", value });
    moduleChips.forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  };
  moduleChips.push(chip(moduleBox, "All", rules.length, pickModule("all")));
  for (const m of modules) {
    const name = m.querySelector("h3").firstChild.textContent.trim();
    moduleChips.push(chip(moduleBox, name, tally("module", m.dataset.module), pickModule(m.dataset.module)));
  }
  moduleChips[0].setAttribute("aria-pressed", "true");

  // Scope: what a check reads. A chip only for scopes with rules, so "Both" shows once such a check exists.
  const scopeBox = document.getElementById("scopes");
  const scopeChips = new Map();
  const pickScope = (value) => (b) => {
    state.scope = value;
    window.track?.("Checks filter", { filter: "scope", value });
    scopeChips.forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  };
  scopeChips.set("all", chip(scopeBox, "All", rules.length, pickScope("all")));
  for (const [value, label] of [["website", "Website"], ["repository", "Repository"], ["both", "Both"]]) {
    const n = tally("scope", value);
    if (n) scopeChips.set(value, chip(scopeBox, label, n, pickScope(value)));
  }
  scopeChips.get("all").setAttribute("aria-pressed", "true");

  const sevBox = document.getElementById("severities");
  for (const s of ["critical", "high", "medium", "low", "info"]) {
    const n = tally("severity", s);
    if (!n) continue;
    chip(sevBox, s, n, (b) => {
      const on = !state.severity.has(s);
      on ? state.severity.add(s) : state.severity.delete(s);
      b.setAttribute("aria-pressed", String(on));
      window.track?.("Checks filter", { filter: "severity", value: s, on: String(on) });
    });
  }

  function update() {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const r of rules) {
      const ok =
        (state.module === "all" || r.dataset.module === state.module) &&
        (state.scope === "all" || r.dataset.scope === state.scope) &&
        (!state.severity.size || state.severity.has(r.dataset.severity)) &&
        words.every((w) => r.dataset.search.includes(w));
      r.hidden = !ok;
      if (ok) shown++;
    }
    for (const m of modules) m.hidden = !m.querySelector(".rule:not([hidden])");
    count.textContent = shown === rules.length ? `${rules.length} checks` : `${shown} of ${rules.length} checks`;
    empty.hidden = shown > 0;
    return shown;
  }

  // Search statistics: one event 1.5 s after the last keystroke, from 3 characters on,
  // with the query cut to 40 characters and the number of results. Never per keystroke.
  let timer;
  let sent = "";
  q.addEventListener("input", () => {
    const shown = update();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const query = q.value.trim().toLowerCase().slice(0, 40);
      if (query.length < 3 || query === sent) return;
      sent = query;
      window.track?.("Checks search", { query, results: String(shown) });
    }, 1500);
  });
  document.getElementById("toolbar").hidden = false;

  // Open the card a link points to, e.g. checks.html#LEG-DE-IMP-001. A link to a group,
  // e.g. checks.html#privacy, picks that group's chip, a link to a scope, e.g. checks.html#repository,
  // that scope's chip (#repo was the old repository group). None counts as a filter event.
  const open = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    const value = hash === "repo" ? "repository" : hash;
    if (value !== "all" && scopeChips.has(value)) {
      state.scope = value;
      scopeChips.forEach((c, v) => c.setAttribute("aria-pressed", String(v === value)));
      update();
      return;
    }
    const t = hash && document.getElementById(hash);
    if (t?.tagName === "DETAILS") t.open = true;
    const i = modules.indexOf(t);
    if (i >= 0) {
      state.module = t.dataset.module;
      moduleChips.forEach((c, n) => c.setAttribute("aria-pressed", String(n === i + 1)));
      update();
    }
  };
  addEventListener("hashchange", open);
  // A search from the address, e.g. checks.html?q=BGB
  const preset = new URLSearchParams(location.search).get("q");
  if (preset) q.value = preset.slice(0, 40);
  open();
  update();
})();
