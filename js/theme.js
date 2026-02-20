//js/theme.js

(function () {
  const STORAGE_KEY = "scrummer-theme";
  const DEFAULT_THEME = "neon";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    applyTheme(saved);

    const themeSelect = document.getElementById("themeSelect");
    if (themeSelect) {
      themeSelect.value = saved;
      themeSelect.addEventListener("change", (e) => {
        applyTheme(e.target.value);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initTheme);
})();
