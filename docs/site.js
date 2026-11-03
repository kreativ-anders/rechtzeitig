// Theme switch: system, light or dark. The choice is kept in localStorage under "theme";
// picking "system" removes it. An inline script in <head> applies it before the first paint.
(() => {
  const root = document.documentElement;
  const box = document.querySelector(".theme");
  if (!box) return;
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  const current = saved === "light" || saved === "dark" ? saved : "system";
  const input = box.querySelector(`input[value="${current}"]`);
  if (input) input.checked = true;
  box.hidden = false;
  box.addEventListener("change", (e) => {
    const value = e.target.value;
    try {
      if (value === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", value);
    } catch {}
    if (value === "system") delete root.dataset.theme;
    else root.dataset.theme = value;
  });
})();
