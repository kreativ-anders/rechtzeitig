// Search and filter chips for checks.html. Without JavaScript all cards stay visible.
(() => {
  const rules = [...document.querySelectorAll(".rule")];
  const modules = [...document.querySelectorAll(".module")];
  const q = document.getElementById("q");
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const state = { module: "all", severity: new Set() };

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
    moduleChips.forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  };
  moduleChips.push(chip(moduleBox, "All", rules.length, pickModule("all")));
  for (const m of modules) {
    const name = m.querySelector("h3").firstChild.textContent.trim();
    moduleChips.push(chip(moduleBox, name, tally("module", m.dataset.module), pickModule(m.dataset.module)));
  }
  moduleChips[0].setAttribute("aria-pressed", "true");

  const sevBox = document.getElementById("severities");
  for (const s of ["critical", "high", "medium", "low", "info"]) {
    const n = tally("severity", s);
    if (!n) continue;
    chip(sevBox, s, n, (b) => {
      const on = !state.severity.has(s);
      on ? state.severity.add(s) : state.severity.delete(s);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function update() {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const r of rules) {
      const ok =
        (state.module === "all" || r.dataset.module === state.module) &&
        (!state.severity.size || state.severity.has(r.dataset.severity)) &&
        words.every((w) => r.dataset.search.includes(w));
      r.hidden = !ok;
      if (ok) shown++;
    }
    for (const m of modules) m.hidden = !m.querySelector(".rule:not([hidden])");
    count.textContent = shown === rules.length ? `${rules.length} checks` : `${shown} of ${rules.length} checks`;
    empty.hidden = shown > 0;
  }

  q.addEventListener("input", update);
  document.getElementById("toolbar").hidden = false;

  // Open the card a link points to, e.g. checks.html#LEG-DE-IMP-001
  const open = () => { const t = location.hash && document.getElementById(location.hash.slice(1)); if (t?.tagName === "DETAILS") t.open = true; };
  addEventListener("hashchange", open);
  open();
  update();
})();
