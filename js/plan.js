//js/plan.js

// ----------------------------
// STEP FLOW LOGIC
// ----------------------------

function switchToTab(tabName) {
  document.querySelectorAll(".tabPanel").forEach(panel => {
    panel.classList.toggle("hidden", panel.id !== `panel-${tabName}`);
  });

  document.querySelectorAll(".step").forEach(step => {
    step.classList.toggle("active", step.dataset.tab === tabName);
  });
}

// Stepper Click
document.querySelectorAll(".step").forEach(step => {
  step.addEventListener("click", () => {
    switchToTab(step.dataset.tab);
  });
});

// Generate Forecast button
document.getElementById("goToForecastBtn")?.addEventListener("click", () => {
  switchToTab("forecast");
});

// Back to Setup button
document.getElementById("backToSetupBtn")?.addEventListener("click", () => {
  switchToTab("setup");
});

// Default state
document.addEventListener("DOMContentLoaded", () => {
  switchToTab("setup");
});
