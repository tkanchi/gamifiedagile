// js/theme.js
// Themes: light + mint + neon + retro
// Fixes:
// - validates allowed theme values
// - maps legacy theme names (e.g., "cyber") to "mint"
// - always allows switching back to light
// - persists selection

(function () {
  const STORAGE_KEY = "scrummer_theme";
  const root = document.documentElement;

  const ALLOWED = new Set(["light", "mint", "neon", "retro"]);

  // Legacy theme name mapping (older builds)
  const LEGACY_MAP = {
    cyber: "mint",
    "mint-pop": "mint",
    "mintpop": "mint"
  };

  function normalize(theme) {
    const t = String(theme || "").toLowerCase().trim();
    const mapped = LEGACY_MAP[t] || t;
    return ALLOWED.has(mapped) ? mapped : "light";
  }

  function applyTheme(theme) {
    const safe = normalize(theme);

    root.setAttribute("data-theme", safe);

    const sel = document.getElementById("themeSelect");
    if (sel) sel.value = safe;

    try { localStorage.setItem(STORAGE_KEY, safe); } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    let saved = "light";
    try { saved = localStorage.getItem(STORAGE_KEY) || "light"; } catch (e) {}

    applyTheme(saved);

    const sel = document.getElementById("themeSelect");
    if (sel) {
      sel.addEventListener("change", () => applyTheme(sel.value));
    }
  });
})();