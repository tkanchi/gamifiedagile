// js/theme.js
// 4 themes: light + neon + cyber(mint-pop) + retro

(function () {
  const STORAGE_KEY = "scrummer_theme";
  const ALLOWED = new Set(["light", "neon", "cyber", "retro"]);

  function applyTheme(theme) {
    const t = ALLOWED.has(theme) ? theme : "light";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}

    const sel = document.getElementById("themeSelect");
    if (sel && sel.value !== t) sel.value = t;
  }

  document.addEventListener("DOMContentLoaded", () => {
    let saved = "light";
    try { saved = localStorage.getItem(STORAGE_KEY) || "light"; } catch {}
    applyTheme(saved);

    const sel = document.getElementById("themeSelect");
    if (sel) sel.addEventListener("change", () => applyTheme(sel.value));
  });
})();