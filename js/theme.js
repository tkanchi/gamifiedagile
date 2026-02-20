/* =========================================================
   Scrummer — theme.js (Modern Joy Edition)
   Handles Light/Dark transitions with premium smoothing.
   ========================================================= */

(() => {
  const STORAGE_KEY = "scrummer-theme";
  const root = document.documentElement;

  /**
   * Smoothly applies the theme by adding a temporary transition class.
   * This prevents layout jumps while allowing colors to bleed into the next state.
   */
  function applyTheme(theme) {
    // 1. Add transition class for premium animation
    root.classList.add("theme-transitioning");
    
    // 2. Set the data attribute for CSS
    root.setAttribute("data-theme", theme);
    
    // 3. Update UI Elements
    const modeLabel = document.getElementById("themeMode");
    const toggleBtn = document.getElementById("themeToggle");
    
    if (modeLabel) {
      modeLabel.textContent = theme === "dark" ? "Dark Mode" : "Light Mode";
    }
    
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      // Add a fun subtle rotate effect to the button if it has an icon/emoji
      toggleBtn.style.transform = "scale(0.95)";
      setTimeout(() => toggleBtn.style.transform = "scale(1)", 100);
    }

    // 4. Remove transition class after animation finishes (~400ms)
    setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, 400);
  }

  function getSystemTheme() {
    return window.matchMedia && 
           window.matchMedia("(prefers-color-scheme: dark)").matches 
           ? "dark" : "light";
  }

  // --- Initialization ---
  const saved = localStorage.getItem(STORAGE_KEY);
  const initial = saved || getSystemTheme();
  applyTheme(initial);

  // --- Event Listener ---
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
  }

  // Listen for OS-level changes (only if user hasn't set a preference)
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (mq && !saved) {
    mq.addEventListener("change", () => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(getSystemTheme());
      }
    });
  }
})();
