// js/theme.js
// 4 themes: light + neon + cyber + retro
// Fixes: can always switch back to light, persists selection

(function () {
  const STORAGE_KEY = "scrummer_theme";
  const root = document.documentElement;

  function applyTheme(theme) {
    const safe = theme || "light";
    root.setAttribute("data-theme", safe);

    const sel = document.getElementById("themeSelect");
    if (sel) sel.value = safe;

    try { localStorage.setItem(STORAGE_KEY, safe); } catch (e) {}
  }

  function boot() {
    const sel = document.getElementById("themeSelect");

    // Load saved theme (default light)
    let saved = "light";
    try {
      saved = localStorage.getItem(STORAGE_KEY) || "light";
    } catch (e) {}

    // If HTML had some theme hardcoded, still allow saved theme to override
    applyTheme(saved);

    if (sel) {
      sel.addEventListener("change", () => {
        applyTheme(sel.value);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
