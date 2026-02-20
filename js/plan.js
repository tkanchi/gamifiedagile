/* =========================================================
   SCRUMMER — PLAN ENGINE (Phase 1 Stable)
   ========================================================= */

const STORAGE_KEY = "scrummer_plan_setup_v3";

/* -----------------------------
   Helpers
------------------------------ */
const qs = (id) => document.getElementById(id);

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

function showToast(msg) {
  console.log("Toast:", msg);
}

function hideWarn() {
  // optional hook if you add warnings later
}

function setSaveStatus(msg) {
  const el = qs("saveStatus");
  if (el) el.textContent = msg;
}

/* -----------------------------
   Read Setup
------------------------------ */
function readSetupFromUI() {
  return {
    sprintDays: safeNum(qs("setup_sprintDays")?.value),
    teamMembers: safeNum(qs("setup_teamMembers")?.value),
    leaveDays: safeNum(qs("setup_leaveDays")?.value),
    committedSP: safeNum(qs("setup_committedSP")?.value),
    v1: safeNum(qs("setup_v1")?.value),
    v2: safeNum(qs("setup_v2")?.value),
    v3: safeNum(qs("setup_v3")?.value),
    mode: qs("forecast_forecastMode")?.value || "capacity",
    velOverride: qs("forecast_velOverride")?.checked || false
  };
}

/* -----------------------------
   Forecast Calculations
------------------------------ */
function calculateForecast(data) {

  // --- Velocity ---
  const avgVelocity = (data.v1 + data.v2 + data.v3) / 3 || 0;

  // --- Capacity ---
  const focusFactor = 0.8;         // tweak later if needed
  const spPerDay = 0.8;            // tweak later if needed
  const leaveImpact = data.leaveDays * spPerDay;

  const rawCapacity =
    data.sprintDays *
    data.teamMembers *
    focusFactor *
    spPerDay;

  const capacityForecast = Math.max(rawCapacity - leaveImpact, 0);

  // --- Active Forecast ---
  const activeForecast =
    data.mode === "velocity"
      ? avgVelocity
      : capacityForecast;

  return {
    avgVelocity: Math.round(avgVelocity),
    capacityForecast: Math.round(capacityForecast),
    activeForecast: Math.round(activeForecast)
  };
}

/* -----------------------------
   Render Forecast
------------------------------ */
function renderForecast(data) {

  const result = calculateForecast(data);

  // Forecast Tile (capacity tile always shows capacity)
  const forecastEl =
    qs("capacityForecastMirror") ||
    qs("forecast_value");

  if (forecastEl) {
    forecastEl.textContent = `${result.capacityForecast} SP`;
  }

  // Committed vs Forecast text
  const compareEl = qs("forecast_compareText");
  if (compareEl) {
    compareEl.textContent =
      `Committed ${data.committedSP} SP vs Forecast ~${result.capacityForecast} SP`;
  }

  // Gap
  const gap = data.committedSP - result.activeForecast;
  const gapEl = qs("forecast_gapValue");
  if (gapEl) {
    gapEl.textContent = `${gap >= 0 ? "+" : ""}${gap} SP`;
  }

  // Over-commit Ratio
  const ratioEl = qs("forecast_overcommit");
  if (ratioEl && result.activeForecast > 0) {
    const ratio = data.committedSP / result.activeForecast;
    ratioEl.textContent = `Over-commit: ${ratio.toFixed(2)}×`;
  }
}

/* -----------------------------
   Save / Load
------------------------------ */
function saveSetup(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSaveStatus("Saved ✓");
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

function loadSetup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function populateUI(data) {
  Object.keys(data).forEach(key => {
    const el = qs("setup_" + key);
    if (el && el.type !== "checkbox") el.value = data[key];
  });

  const mode = qs("forecast_forecastMode");
  if (mode) mode.value = data.mode || "capacity";

  const velOverride = qs("forecast_velOverride");
  if (velOverride) velOverride.checked = data.velOverride || false;
}

/* -----------------------------
   Reset
------------------------------ */
function resetPlan() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}

  const idsToClear = [
    "setup_sprintDays","setup_teamMembers","setup_leaveDays",
    "setup_committedSP","setup_v1","setup_v2","setup_v3"
  ];

  idsToClear.forEach(id => {
    const el = qs(id);
    if (el) el.value = "";
  });

  const mode = qs("forecast_forecastMode");
  if (mode) mode.value = "capacity";

  const velOverride = qs("forecast_velOverride");
  if (velOverride) velOverride.checked = false;

  renderForecast(readSetupFromUI());

  setSaveStatus("Not saved yet.");
  showToast("Reset done.");
}

/* -----------------------------
   Handlers
------------------------------ */
function attachHandlers() {

  // Auto render on input change
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", () => {
      renderForecast(readSetupFromUI());
    });
  });

  // Save button
  qs("setup_saveBtn")?.addEventListener("click", () => {
    const data = readSetupFromUI();
    saveSetup(data);
  });

  // Reset button
  qs("setup_resetBtn")?.addEventListener("click", resetPlan);
}

/* -----------------------------
   Init
------------------------------ */
document.addEventListener("DOMContentLoaded", () => {

  const saved = loadSetup();
  if (saved) {
    populateUI(saved);
    renderForecast(saved);
    setSaveStatus("Loaded ✓");
  }

  attachHandlers();
});
