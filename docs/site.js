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
