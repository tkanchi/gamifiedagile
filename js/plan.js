// js/plan.js
// STEP FLOW + Setup→Forecast reuse (no repetitive input)
// Fixes:
// - compact inputs handled via CSS
// - velocities use labels (in HTML)
// - forecast auto-pulls setup values, override optional
// - velocity mode uses setup values unless override checked

(function () {
  const STORAGE_KEY = "scrummer_plan_setup_v1";

  function qs(id) { return document.getElementById(id); }
  function numVal(el) {
    if (!el) return null;
    const v = String(el.value ?? "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

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

    // keep URL hash in sync (nice for refresh)
    try {
      if (tabName === "forecast") location.hash = "forecast";
      else location.hash = "setup";
    } catch (e) {}
  }

  // ----------------------------
  // Setup storage
  // ----------------------------
  function readSetupFromUI() {
    return {
      sprintDays: numVal(qs("setup_sprintDays")),
      teamMembers: numVal(qs("setup_teamMembers")),
      leaveDays: numVal(qs("setup_leaveDays")),
      committedSP: numVal(qs("setup_committedSP")),
      v1: numVal(qs("setup_v1")), // N-1
      v2: numVal(qs("setup_v2")), // N-2
      v3: numVal(qs("setup_v3")), // N-3
      updatedAt: Date.now()
    };
  }

  function writeSetupToUI(data) {
    if (!data) return;

    if (qs("setup_sprintDays") && data.sprintDays != null) qs("setup_sprintDays").value = data.sprintDays;
    if (qs("setup_teamMembers") && data.teamMembers != null) qs("setup_teamMembers").value = data.teamMembers;
    if (qs("setup_leaveDays") && data.leaveDays != null) qs("setup_leaveDays").value = data.leaveDays;
    if (qs("setup_committedSP") && data.committedSP != null) qs("setup_committedSP").value = data.committedSP;

    if (qs("setup_v1") && data.v1 != null) qs("setup_v1").value = data.v1;
    if (qs("setup_v2") && data.v2 != null) qs("setup_v2").value = data.v2;
    if (qs("setup_v3") && data.v3 != null) qs("setup_v3").value = data.v3;
  }

  function saveSetup(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function loadSetup() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setToast(msg, show = true) {
    const toast = qs("setup_toast");
    if (!toast) return;
    toast.style.display = show ? "block" : "none";
    toast.textContent = msg || "—";
  }

  function setSaveStatus(msg) {
    const el = qs("setup_saveStatus");
    if (!el) return;
    el.textContent = msg;
  }

  // ----------------------------
  // Forecast reuse/override UI
  // ----------------------------
  function effectiveSetup() {
    const saved = loadSetup();
    const live = readSetupFromUI();

    // prefer live values if user has typed; fall back to saved
    // (keeps it responsive even if they didn't click save)
    const merged = {
      sprintDays: live.sprintDays ?? saved?.sprintDays ?? null,
      teamMembers: live.teamMembers ?? saved?.teamMembers ?? null,
      leaveDays: live.leaveDays ?? saved?.leaveDays ?? null,
      committedSP: live.committedSP ?? saved?.committedSP ?? null,
      v1: live.v1 ?? saved?.v1 ?? null,
      v2: live.v2 ?? saved?.v2 ?? null,
      v3: live.v3 ?? saved?.v3 ?? null
    };
    return merged;
  }

  function refreshForecastSummary() {
    const s = effectiveSetup();
    const el = qs("forecast_setupSummary");
    if (!el) return;

    const parts = [];
    if (s.sprintDays != null) parts.push(`Sprint Days: ${s.sprintDays}`);
    if (s.teamMembers != null) parts.push(`Team: ${s.teamMembers}`);
    if (s.leaveDays != null) parts.push(`Leaves: ${s.leaveDays}`);
    if (s.committedSP != null) parts.push(`Committed SP: ${s.committedSP}`);

    const velOk = [s.v1, s.v2, s.v3].every(v => v != null);
    if (velOk) parts.push(`Velocities: ${s.v1}/${s.v2}/${s.v3}`);

    el.textContent = parts.length ? parts.join(" • ") : "— (Fill Setup first)";
  }

  function syncOverrideVisibility() {
    const allow = qs("forecast_allowOverride");
    const grid = qs("forecast_overrideGrid");
    if (!allow || !grid) return;

    grid.style.display = allow.checked ? "grid" : "none";

    // prefill override fields with effective setup values (so it feels “same by default”)
    const s = effectiveSetup();
    const o1 = qs("override_sprintDays");
    const o2 = qs("override_teamMembers");
    const o3 = qs("override_leaveDays");
    const o4 = qs("override_committedSP");

    if (allow.checked) {
      if (o1) o1.value = s.sprintDays ?? "";
      if (o2) o2.value = s.teamMembers ?? "";
      if (o3) o3.value = s.leaveDays ?? "";
      if (o4) o4.value = s.committedSP ?? "";
    }
  }

  function applyVelocityDefaults() {
    // Forecast velocity inputs exist always, but should use setup unless override checked
    const s = effectiveSetup();
    const v1 = qs("forecast_velN1");
    const v2 = qs("forecast_velN2");
    const v3 = qs("forecast_velN3");
    if (!v1 || !v2 || !v3) return;

    // default shown = setup (but user can override if checkbox enabled)
    v1.value = s.v1 ?? "";
    v2.value = s.v2 ?? "";
    v3.value = s.v3 ?? "";
  }

  function syncVelOverride() {
    const cb = qs("forecast_velOverride");
    const v1 = qs("forecast_velN1");
    const v2 = qs("forecast_velN2");
    const v3 = qs("forecast_velN3");
    if (!cb || !v1 || !v2 || !v3) return;

    const editable = cb.checked;
    [v1, v2, v3].forEach(inp => {
      inp.disabled = !editable;
      inp.style.opacity = editable ? "1" : "0.85";
    });

    if (!editable) {
      // snap back to setup values
      applyVelocityDefaults();
    }
  }

  // ----------------------------
  // Forecast calculations (lightweight, safe)
  // ----------------------------
  function showWarn(msg) {
    const box = qs("forecast_warnBox");
    const txt = qs("forecast_warnText");
    if (!box || !txt) return;
    box.style.display = "block";
    txt.textContent = msg;
  }

  function hideWarn() {
    const box = qs("forecast_warnBox");
    if (!box) return;
    box.style.display = "none";
  }

  function setResult(title, main, actualHtml) {
    const t = qs("forecast_resultTitle");
    const m = qs("forecast_resultMain");
    const a = qs("forecast_formulaActual");
    if (t) t.textContent = title || "—";
    if (m) m.innerHTML = main || "—";
    if (a) a.innerHTML = actualHtml || "Enter values and click Calculate to see step-by-step calculation.";
  }

  function getEffectiveNumbersForForecast() {
    const s = effectiveSetup();

    const allowOverride = !!qs("forecast_allowOverride")?.checked;

    const eff = {
      sprintDays: s.sprintDays,
      teamMembers: s.teamMembers,
      leaveDays: s.leaveDays,
      committedSP: s.committedSP,
      v1: s.v1, v2: s.v2, v3: s.v3
    };

    if (allowOverride) {
      const o1 = numVal(qs("override_sprintDays"));
      const o2 = numVal(qs("override_teamMembers"));
      const o3 = numVal(qs("override_leaveDays"));
      const o4 = numVal(qs("override_committedSP"));

      eff.sprintDays = o1 ?? eff.sprintDays;
      eff.teamMembers = o2 ?? eff.teamMembers;
      eff.leaveDays = o3 ?? eff.leaveDays;
      eff.committedSP = o4 ?? eff.committedSP;
    }

    return eff;
  }

  function calcVelocityForecast() {
    const velOverride = !!qs("forecast_velOverride")?.checked;
    const eff = getEffectiveNumbersForForecast();

    let a, b, c;
    if (velOverride) {
      a = numVal(qs("forecast_velN1"));
      b = numVal(qs("forecast_velN2"));
      c = numVal(qs("forecast_velN3"));
    } else {
      a = eff.v1; b = eff.v2; c = eff.v3;
    }

    if ([a, b, c].some(v => v == null)) {
      showWarn("Add last 3 velocities (Setup) or enable velocity override and fill them here.");
      return null;
    }
    hideWarn();

    const avg = (a + b + c) / 3;
    const rounded = Math.round(avg);

    const main =
      `<div><b>Average Velocity:</b> ${(avg).toFixed(1)} SP (≈ <b>${rounded}</b> SP)</div>` +
      (eff.committedSP != null ? `<div style="margin-top:6px;"><b>Committed:</b> ${eff.committedSP} SP</div>` : "");

    const actual =
      `<div class="kvKey" style="margin-bottom:6px;">🧮 Calculation</div>` +
      `<div>Avg = (${a} + ${b} + ${c}) / 3 = <b>${avg.toFixed(1)}</b></div>`;

    setResult("Velocity Forecast", main, actual);
    return { avg };
  }

  function calcCapacityForecast() {
    const eff = getEffectiveNumbersForForecast();
    const focus = numVal(qs("forecast_focusFactor"));
    const weight = numVal(qs("forecast_leaveWeight"));
    const spPerDay = numVal(qs("forecast_spPerDay"));

    const missing = [];
    if (eff.sprintDays == null) missing.push("Sprint Days (Setup)");
    if (eff.teamMembers == null) missing.push("Team Members (Setup)");
    if (eff.leaveDays == null) missing.push("Leave Days (Setup)");
    if (focus == null) missing.push("Focus Factor");
    if (weight == null) missing.push("Leaves Weight");
    if (spPerDay == null) missing.push("SP per Day");

    if (missing.length) {
      showWarn("Missing: " + missing.join(", "));
      return null;
    }
    hideWarn();

    const idealPerPerson = eff.sprintDays * focus;
    const totalIdealDays = eff.teamMembers * idealPerPerson;
    const totalActualDays = totalIdealDays - (eff.leaveDays * weight);
    const safeDays = Math.max(0, totalActualDays);
    const forecastSP = safeDays * spPerDay;

    const main =
      `<div><b>Forecast:</b> <span style="font-size:18px;font-weight:800;">${Math.round(forecastSP)}</span> SP</div>` +
      `<div class="mutedText" style="margin-top:6px;">Based on ${safeDays.toFixed(1)} effective days × ${spPerDay} SP/day</div>`;

    const actual =
      `<div class="kvKey" style="margin-bottom:6px;">🧮 Step-by-step</div>` +
      `<div>Ideal/person = ${eff.sprintDays} × ${focus} = <b>${idealPerPerson.toFixed(2)}</b> days</div>` +
      `<div>Total ideal days = ${eff.teamMembers} × ${idealPerPerson.toFixed(2)} = <b>${totalIdealDays.toFixed(2)}</b></div>` +
      `<div>Total actual days = ${totalIdealDays.toFixed(2)} − (${eff.leaveDays} × ${weight}) = <b>${totalActualDays.toFixed(2)}</b></div>` +
      `<div>Forecast SP = max(0, ${totalActualDays.toFixed(2)}) × ${spPerDay} = <b>${forecastSP.toFixed(2)}</b></div>`;

    setResult("Capacity Forecast", main, actual);
    return { forecastSP };
  }

  function syncModeUI() {
    const mode = qs("forecast_forecastMode")?.value || "capacity";
    const vBox = qs("forecast_velocityBox");
    const cBox = qs("forecast_capacityBox");

    if (vBox) vBox.style.display = mode === "velocity" ? "block" : "none";
    if (cBox) cBox.style.display = mode === "capacity" ? "block" : "none";

    // If velocity mode: make sure inputs reflect setup + override rules
    if (mode === "velocity") {
      applyVelocityDefaults();
      syncVelOverride();
    }
  }

  function resetForecast() {
    // keep setup; reset only forecast-only params
    if (qs("forecast_focusFactor")) qs("forecast_focusFactor").value = "";
    if (qs("forecast_leaveWeight")) qs("forecast_leaveWeight").value = "";
    if (qs("forecast_spPerDay")) qs("forecast_spPerDay").value = "";

    if (qs("forecast_allowOverride")) qs("forecast_allowOverride").checked = false;
    syncOverrideVisibility();

    if (qs("forecast_velOverride")) qs("forecast_velOverride").checked = false;
    syncVelOverride();

    hideWarn();
    setResult("—", "—", null);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // Stepper click + keyboard
    document.querySelectorAll(".step").forEach((step) => {
      step.addEventListener("click", () => switchToTab(step.dataset.tab));
      step.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          switchToTab(step.dataset.tab);
        }
      });
    });

    // Load saved setup into UI
    const saved = loadSetup();
    if (saved) {
      writeSetupToUI(saved);
      setSaveStatus("Loaded saved setup.");
    }

    // Live update forecast summary as user types setup
    ["setup_sprintDays","setup_teamMembers","setup_leaveDays","setup_committedSP","setup_v1","setup_v2","setup_v3"]
      .forEach(id => {
        qs(id)?.addEventListener("input", () => {
          refreshForecastSummary();
          // if velocity mode and not overriding, keep forecast values synced
          if (!qs("forecast_velOverride")?.checked) applyVelocityDefaults();
          // keep overrides prefilled if open
          if (qs("forecast_allowOverride")?.checked) syncOverrideVisibility();
        });
      });

    // Presets (simple example)
    qs("setup_presetExcellent")?.addEventListener("click", () => {
      // example defaults
      if (qs("setup_sprintDays")) qs("setup_sprintDays").value = 10;
      if (qs("setup_teamMembers")) qs("setup_teamMembers").value = 7;
      if (qs("setup_leaveDays")) qs("setup_leaveDays").value = 0;
      setToast("🟢 Excellent preset applied. (Tweak velocities if needed)");
      refreshForecastSummary();
    });

    qs("setup_presetNormal")?.addEventListener("click", () => {
      if (qs("setup_sprintDays")) qs("setup_sprintDays").value = 10;
      if (qs("setup_teamMembers")) qs("setup_teamMembers").value = 6;
      if (qs("setup_leaveDays")) qs("setup_leaveDays").value = 2;
      setToast("🟡 Normal preset applied.");
      refreshForecastSummary();
    });

    qs("setup_presetRisky")?.addEventListener("click", () => {
      if (qs("setup_sprintDays")) qs("setup_sprintDays").value = 10;
      if (qs("setup_teamMembers")) qs("setup_teamMembers").value = 5;
      if (qs("setup_leaveDays")) qs("setup_leaveDays").value = 4;
      setToast("🔴 Risky preset applied. Consider higher leave weight.");
      refreshForecastSummary();
    });

    // Save setup
    qs("setup_saveBtn")?.addEventListener("click", () => {
      const data = readSetupFromUI();
      saveSetup(data);
      setSaveStatus("Saved ✔");
      setToast("Saved setup. Forecast will reuse these values.", true);

      refreshForecastSummary();
      applyVelocityDefaults();
    });

    // Buttons
    qs("goToForecastBtn")?.addEventListener("click", () => {
      refreshForecastSummary();
      applyVelocityDefaults();
      syncVelOverride();
      syncOverrideVisibility();
      switchToTab("forecast");
    });

    qs("backToSetupBtn")?.addEventListener("click", () => switchToTab("setup"));

    // Forecast override toggles
    qs("forecast_allowOverride")?.addEventListener("change", () => syncOverrideVisibility());
    qs("forecast_velOverride")?.addEventListener("change", () => syncVelOverride());

    // Forecast mode change
    qs("forecast_forecastMode")?.addEventListener("change", () => syncModeUI());

    // Calc + reset
    qs("forecast_calcBtn")?.addEventListener("click", () => {
      const mode = qs("forecast_forecastMode")?.value || "capacity";
      if (mode === "velocity") calcVelocityForecast();
      else calcCapacityForecast();
    });

    qs("forecast_resetBtn")?.addEventListener("click", resetForecast);

    // Default tab (supports deep links: #forecast)
    const hash = (location.hash || "").replace("#", "").toLowerCase();
    const startTab = hash === "forecast" ? "forecast" : "setup";
    switchToTab(startTab);

    // Initialize forecast UI
    refreshForecastSummary();
    applyVelocityDefaults();
    syncVelOverride();
    syncOverrideVisibility();
    syncModeUI();
  });
})();
