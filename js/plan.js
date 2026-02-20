// js/plan.js
// ----------------------------
// STEP FLOW LOGIC (Configure → Forecast)
// ----------------------------

function switchToTab(tabName) {
  document.querySelectorAll(".tabPanel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${tabName}`);
  });

  document.querySelectorAll(".step").forEach((step) => {
    step.classList.toggle("active", step.dataset.tab === tabName);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Stepper click
  document.querySelectorAll(".step").forEach((step) => {
    step.addEventListener("click", () => switchToTab(step.dataset.tab));

    // optional keyboard support (Enter/Space)
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchToTab(step.dataset.tab);
      }
    });
  });

  // Buttons
  const goBtn = document.getElementById("goToForecastBtn");
  if (goBtn) goBtn.addEventListener("click", () => switchToTab("forecast"));

  const backBtn = document.getElementById("backToSetupBtn");
  if (backBtn) backBtn.addEventListener("click", () => switchToTab("setup"));

  // Default tab (supports deep links: #forecast)
  const hash = (location.hash || "").replace("#", "").toLowerCase();
  const startTab = hash === "forecast" ? "forecast" : "setup";
  switchToTab(startTab);
});
