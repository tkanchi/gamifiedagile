// js/plan.js
// Single-page setup + forecast
// - One Save button
// - Forecast updates below
// - Velocity auto-runs by default
// - Capacity formulas only in capacity mode
// - Overcommit highlight, delta, confidence badge
// - Forecast number animation
// - Enforce 3-digit max for integer fields

(function () {
  const SETUP_KEY = "scrummer_plan_setup_v1";

  const el = (id) => document.getElementById(id);

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function num(id) {
    const e = el(id);
    if (!e) return null;
    const v = String(e.value ?? "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function setText(id, text) {
    const e = el(id);
    if (e) e.textContent = text;
  }

  function show(id) { const e = el(id); if (e) e.style.display = ""; }
  function hide(id) { const e = el(id); if (e) e.style.display = "none"; }

  function toast(msg, showNow = true) {
    const t = el("setup_toast");
    if (!t) return;
    t.textContent = msg || "—";
    t.style.display = showNow ? "block" : "none";
  }

  function saveStatus(msg) {
    setText("setup_saveStatus", msg || "—");
  }

  function readSetup() {
    return {
      sprintDays: num("setup_sprintDays"),
      teamMembers: num("setup_teamMembers"),
      leaveDays: num("setup_leaveDays"),
      committedSP: num("setup_committedSP"),
      v1: num("setup_v1"),
      v2: num("setup_v2"),
      v3: num("setup_v3"),
      updatedAt: Date.now()
    };
  }

  function writeSetup(s) {
    if (!s) return;

    if (el("setup_sprintDays") && s.sprintDays != null) el("setup_sprintDays").value = s.sprintDays;
    if (el("setup_teamMembers") && s.teamMembers != null) el("setup_teamMembers").value = s.teamMembers;
    if (el("setup_leaveDays") && s.leaveDays != null) el("setup_leaveDays").value = s.leaveDays;
    if (el("setup_committedSP") && s.committedSP != null) el("setup_committedSP").value = s.committedSP;

    if (el("setup_v1") && s.v1 != null) el("setup_v1").value = s.v1;
    if (el("setup_v2") && s.v2 != null) el("setup_v2").value = s.v2;
    if (el("setup_v3") && s.v3 != null) el("setup_v3").value = s.v3;
  }

  function persistSetup(s) {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch {}
  }

  function loadSetup() {
    return safeParse(localStorage.getItem(SETUP_KEY) || "null", null);
  }

  // Enforce 3 digits for integer fields
  function enforce3Digits() {
    document.querySelectorAll("input.int3").forEach(inp => {
      inp.addEventListener("input", () => {
        // keep only digits + cut length
        let v = String(inp.value ?? "");
        v = v.replace(/[^\d]/g, "");
        if (v.length > 3) v = v.slice(0, 3);
        inp.value = v;
      });
    });
  }

  // ----------------------------
  // Forecast: helpers
  // ----------------------------
  function computeVolatility(vs) {
    const velocities = vs.filter(x => Number.isFinite(x) && x > 0);
    if (velocities.length < 2) return 0;

    const avg = velocities.reduce((a,b)=>a+b,0) / velocities.length;
    if (avg <= 0) return 0;

    const variance = velocities.reduce((acc,x)=>acc + Math.pow(x - avg,2),0) / velocities.length;
    return Math.sqrt(variance) / avg; // ratio
  }

  function computeConfidence({ forecastSP, committedSP, velocities }) {
    // Simple, explainable scoring similar to XP fallback concept
    const vol = computeVolatility(velocities);

    let over = null;
    if (Number.isFinite(forecastSP) && forecastSP > 0 && Number.isFinite(committedSP) && committedSP >= 0) {
      over = committedSP / forecastSP;
    }

    let risk = 0;

    // Lack of data
    const velCount = velocities.filter(v => Number.isFinite(v) && v > 0).length;
    if (velCount < 3) risk += 12;        // some uncertainty
    if (velCount === 0) risk += 18;      // high uncertainty

    // Overcommit penalty
    if (Number.isFinite(over) && over > 1) {
      risk += clamp((over - 1) * 120, 0, 55);
    }

    // Volatility penalty
    risk += clamp(vol * 90, 0, 35);

    risk = clamp(Math.round(risk), 0, 90);
    const confidence = clamp(Math.round(100 - risk), 10, 95);

    return { confidence, overcommitRatio: over, volatility: vol };
  }

  function setOvercommitUI(overRatio) {
    const wrap = el("resultsWrap");
    const tag = el("overcommitTag");

    const isOver = Number.isFinite(overRatio) && overRatio > 1.0;

    if (wrap) wrap.classList.toggle("overcommit", !!isOver);
    if (tag) tag.style.display = isOver ? "inline-flex" : "none";
  }

  function animateForecastNumber() {
    const n = el("forecastNumber");
    if (!n) return;
    n.classList.remove("pulse");
    void n.offsetWidth;
    n.classList.add("pulse");
  }

  function showWarn(msg) {
    const box = el("forecast_warnBox");
    const txt = el("forecast_warnText");
    if (!box || !txt) return;
    box.style.display = "block";
    txt.textContent = msg;
  }

  function hideWarn() {
    const box = el("forecast_warnBox");
    if (box) box.style.display = "none";
  }

  function syncModeUI() {
    const mode = el("forecast_forecastMode")?.value || "velocity";
    const vBox = el("forecast_velocityBox");
    const cBox = el("forecast_capacityBox");

    if (vBox) vBox.style.display = (mode === "velocity") ? "block" : "none";
    if (cBox) cBox.style.display = (mode === "capacity") ? "block" : "none";

    // Note: formulas are already embedded in each mode box, so no extra toggling needed.
  }

  // Velocity override toggle
  function syncVelOverride() {
    const cb = el("forecast_velOverride");
    const v1 = el("forecast_velN1");
    const v2 = el("forecast_velN2");
    const v3 = el("forecast_velN3");
    if (!cb || !v1 || !v2 || !v3) return;

    const editable = cb.checked;
    [v1, v2, v3].forEach(inp => {
      inp.disabled = !editable;
      inp.style.opacity = editable ? "1" : "0.85";
    });

    if (!editable) {
      // revert to setup values
      v1.value = el("setup_v1")?.value ?? "";
      v2.value = el("setup_v2")?.value ?? "";
      v3.value = el("setup_v3")?.value ?? "";
    }
  }

  function getEffectiveVelocities(setup) {
    const cb = el("forecast_velOverride");
    const useOverride = !!cb?.checked;

    if (useOverride) {
      return [
        num("forecast_velN1"),
        num("forecast_velN2"),
        num("forecast_velN3")
      ];
    }

    return [setup.v1, setup.v2, setup.v3];
  }

  // ----------------------------
  // Forecast calculations
  // ----------------------------
  function runVelocityForecast(setup) {
    const velocities = getEffectiveVelocities(setup);
    const a = velocities[0], b = velocities[1], c = velocities[2];

    if ([a,b,c].some(v => !Number.isFinite(v) || v <= 0)) {
      showWarn("Enter last 3 sprint velocities (N-1, N-2, N-3) to calculate Velocity forecast.");
      setText("forecastNumber", "—");
      setText("forecastSub", "Waiting for velocity inputs.");
      setText("committedValue", setup.committedSP ?? "—");
      setText("deltaValue", "—");
      setText("overcommitRatio", "—");
      setText("confidenceBadge", "Confidence: —");
      setOvercommitUI(null);
      return;
    }

    hideWarn();

    const avg = (a + b + c) / 3;
    const forecastSP = Math.round(avg);

    const committed = Number.isFinite(setup.committedSP) ? setup.committedSP : null;
    const delta = (committed != null) ? (committed - forecastSP) : null;

    const { confidence, overcommitRatio } = computeConfidence({
      forecastSP,
      committedSP: committed,
      velocities
    });

    setText("forecastNumber", `${forecastSP} SP`);
    setText("forecastSub", `Avg velocity: ${avg.toFixed(1)} SP`);

    setText("committedValue", committed != null ? `${committed} SP` : "—");
    setText("deltaValue", delta != null ? `${delta} SP` : "—");
    setText("overcommitRatio", (Number.isFinite(overcommitRatio) && overcommitRatio > 0) ? `${overcommitRatio.toFixed(2)}×` : "—");

    setText("confidenceBadge", `Confidence: ${confidence}%`);
    setOvercommitUI(overcommitRatio);

    animateForecastNumber();
  }

  function runCapacityForecast(setup) {
    const sprintDays = setup.sprintDays;
    const teamMembers = setup.teamMembers;
    const leaveDays = setup.leaveDays;

    const focus = num("forecast_focusFactor");
    const weight = num("forecast_weight");
    const spPerDay = num("forecast_spPerDay");

    const missing = [];
    if (!Number.isFinite(sprintDays) || sprintDays <= 0) missing.push("Sprint Days");
    if (!Number.isFinite(teamMembers) || teamMembers <= 0) missing.push("Team Members");
    if (!Number.isFinite(leaveDays) || leaveDays < 0) missing.push("Leave Days");
    if (!Number.isFinite(focus)) missing.push("Focus Factor");
    if (!Number.isFinite(weight)) missing.push("Leaves Weight");
    if (!Number.isFinite(spPerDay)) missing.push("SP/Day");

    if (missing.length) {
      showWarn("Missing: " + missing.join(", "));
      setText("forecastNumber", "—");
      setText("forecastSub", "Save to generate capacity forecast.");
      setText("confidenceBadge", "Confidence: —");
      setOvercommitUI(null);
      return;
    }

    hideWarn();

    const idealPerPerson = sprintDays * focus;
    const totalIdealDays = teamMembers * idealPerPerson;
    const totalActualDays = totalIdealDays - (leaveDays * weight);
    const safeDays = Math.max(0, totalActualDays);
    const forecastSP = Math.round(safeDays * spPerDay);

    const committed = Number.isFinite(setup.committedSP) ? setup.committedSP : null;
    const delta = (committed != null) ? (committed - forecastSP) : null;

    const velocities = [setup.v1, setup.v2, setup.v3];
    const { confidence, overcommitRatio } = computeConfidence({
      forecastSP,
      committedSP: committed,
      velocities
    });

    setText("forecastNumber", `${forecastSP} SP`);
    setText("forecastSub", `${safeDays.toFixed(1)} effective days × ${spPerDay} SP/day`);

    setText("committedValue", committed != null ? `${committed} SP` : "—");
    setText("deltaValue", delta != null ? `${delta} SP` : "—");
    setText("overcommitRatio", (Number.isFinite(overcommitRatio) && overcommitRatio > 0) ? `${overcommitRatio.toFixed(2)}×` : "—");

    setText("confidenceBadge", `Confidence: ${confidence}%`);
    setOvercommitUI(overcommitRatio);

    animateForecastNumber();
  }

  function runForecast() {
    const setup = readSetup();

    // Always reflect committed even if forecast can't compute yet
    if (Number.isFinite(setup.committedSP)) setText("committedValue", `${setup.committedSP} SP`);
    else setText("committedValue", "—");

    // keep forecast velocity inputs in sync when override is OFF
    if (!el("forecast_velOverride")?.checked) {
      if (el("forecast_velN1")) el("forecast_velN1").value = el("setup_v1")?.value ?? "";
      if (el("forecast_velN2")) el("forecast_velN2").value = el("setup_v2")?.value ?? "";
      if (el("forecast_velN3")) el("forecast_velN3").value = el("setup_v3")?.value ?? "";
    }

    const mode = el("forecast_forecastMode")?.value || "velocity";
    if (mode === "capacity") runCapacityForecast(setup);
    else runVelocityForecast(setup);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    enforce3Digits();

    // Load saved setup if exists
    const saved = loadSetup();
    if (saved) {
      writeSetup(saved);
      saveStatus("Loaded saved setup.");
    }

    // Presets (DO NOT set velocities)
    el("setup_presetExcellent")?.addEventListener("click", () => {
      if (el("setup_sprintDays")) el("setup_sprintDays").value = "10";
      if (el("setup_teamMembers")) el("setup_teamMembers").value = "7";
      if (el("setup_leaveDays")) el("setup_leaveDays").value = "0";
      if (el("setup_committedSP")) el("setup_committedSP").value = "40";
      toast("🟢 Excellent preset applied. (Enter velocities manually)");
    });

    el("setup_presetNormal")?.addEventListener("click", () => {
      if (el("setup_sprintDays")) el("setup_sprintDays").value = "10";
      if (el("setup_teamMembers")) el("setup_teamMembers").value = "6";
      if (el("setup_leaveDays")) el("setup_leaveDays").value = "2";
      if (el("setup_committedSP")) el("setup_committedSP").value = "35";
      toast("🟡 Normal preset applied. (Enter velocities manually)");
    });

    el("setup_presetRisky")?.addEventListener("click", () => {
      if (el("setup_sprintDays")) el("setup_sprintDays").value = "10";
      if (el("setup_teamMembers")) el("setup_teamMembers").value = "5";
      if (el("setup_leaveDays")) el("setup_leaveDays").value = "4";
      if (el("setup_committedSP")) el("setup_committedSP").value = "45";
      toast("🔴 Risky preset applied. (Enter velocities manually)");
    });

    // Save button
    el("saveBtn")?.addEventListener("click", () => {
      const setup = readSetup();
      persistSetup(setup);
      saveStatus("Saved ✔");
      toast("Saved. Forecast updated below.", true);
      syncModeUI();
      syncVelOverride();
      runForecast();
    });

    // Mode changes auto-run
    el("forecast_forecastMode")?.addEventListener("change", () => {
      syncModeUI();
      runForecast();
    });

    // Velocity override toggle + changes
    el("forecast_velOverride")?.addEventListener("change", () => {
      syncVelOverride();
      runForecast();
    });

    ["forecast_velN1","forecast_velN2","forecast_velN3"].forEach(id => {
      el(id)?.addEventListener("input", () => runForecast());
    });

    // Capacity field changes auto-run (once saved, it feels instant)
    ["forecast_focusFactor","forecast_weight","forecast_spPerDay"].forEach(id => {
      el(id)?.addEventListener("input", () => runForecast());
    });

    // Setup field changes (do not auto-save; but keep velocity forecast inputs synced if override off)
    ["setup_v1","setup_v2","setup_v3"].forEach(id => {
      el(id)?.addEventListener("input", () => {
        if (!el("forecast_velOverride")?.checked) {
          if (el("forecast_velN1")) el("forecast_velN1").value = el("setup_v1")?.value ?? "";
          if (el("forecast_velN2")) el("forecast_velN2").value = el("setup_v2")?.value ?? "";
          if (el("forecast_velN3")) el("forecast_velN3").value = el("setup_v3")?.value ?? "";
        }
      });
    });

    // Initial UI state
    syncModeUI();
    syncVelOverride();

    // If there is saved setup, show forecast immediately (nice UX)
    if (saved) {
      runForecast();
    }
  });

})();