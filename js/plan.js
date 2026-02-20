// js/plan.js — Scrummer Plan (Stable v4.1)
// Fixes:
// - Quick Presets populate velocities too
// - Forecast always recalculates (presets + input changes + save)
// - ✅ Formulas display always (Velocity + Capacity)
// - ✅ Capacity "Current Values" updates live (no waiting for Save)
// - SP per Team Day defaults to 1.0
// - Over-commit formula transparent: Committed ÷ Forecast
// - 3-digit clamp for integer fields
// - Forecast number bump animation on change

(function () {
  const STORAGE_KEY = "scrummer_plan_setup_v3";
  const qs = (id) => document.getElementById(id);

  const INT_IDS = [
    "setup_sprintDays",
    "setup_teamMembers",
    "setup_leaveDays",
    "setup_committedSP",
    "setup_v1",
    "setup_v2",
    "setup_v3",
    "forecast_velN1",
    "forecast_velN2",
    "forecast_velN3"
  ];

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function clampInt3(n) {
    if (!Number.isFinite(n)) return null;
    const x = Math.round(n);
    return Math.max(0, Math.min(999, x));
  }
  function clampInputInt3(el) {
    if (!el) return;
    const raw = String(el.value ?? "").trim();
    if (raw === "") return;
    const n = num(raw);
    if (n == null) { el.value = ""; return; }
    el.value = String(clampInt3(n));
  }

  function setSaveStatus(msg) {
    const el = qs("setup_saveStatus");
    if (el) el.textContent = msg || "";
  }
  function showToast(msg) {
    const toast = qs("setup_toast");
    if (!toast) return;
    toast.textContent = msg || "—";
    toast.style.display = "block";
  }
  function hideToast() {
    const toast = qs("setup_toast");
    if (!toast) return;
    toast.style.display = "none";
  }

  function showWarn(msg) {
    const box = qs("forecast_warnBox");
    const txt = qs("forecast_warnText");
    if (!box || !txt) return;
    txt.textContent = msg || "";
    box.style.display = "block";
  }
  function hideWarn() {
    const box = qs("forecast_warnBox");
    if (box) box.style.display = "none";
  }

  function bumpForecastNumber() {
    const el = qs("forecast_value");
    if (!el) return;
    el.classList.remove("num-bump");
    void el.offsetWidth;
    el.classList.add("num-bump");
    setTimeout(() => el.classList.remove("num-bump"), 520);
  }

  function setForecastValue(v) {
    const el = qs("forecast_value");
    if (!el) return;

    const prev = el.getAttribute("data-prev");
    const next = (v == null) ? "—" : String(Math.round(v));

    el.textContent = next;
    if (prev !== null && prev !== next) bumpForecastNumber();
    el.setAttribute("data-prev", next);
  }

  function setConfidenceBadge(score) {
    const el = qs("confidenceBadge");
    if (!el) return;

    const s = Math.max(0, Math.min(100, Math.round(score)));

    let label = "Low";
    let cls = "badge-low";
    if (s >= 75) { label = "High"; cls = "badge-high"; }
    else if (s >= 55) { label = "Medium"; cls = "badge-med"; }

    el.classList.remove("badge-high", "badge-med", "badge-low");
    el.classList.add("badge", cls);
    el.textContent = `Confidence: ${label} (${s}%)`;
  }

  function setDetails(text) {
    const el = qs("forecast_detailLine");
    if (el) el.textContent = text || "—";
  }

  function setActualFormula(html) {
    const el = qs("forecast_formulaActual");
    if (el) el.innerHTML = html || "—";
  }

  function setCapacityLiveValues(html) {
    const el = qs("capacity_liveValues");
    if (el) el.innerHTML = html || "—";
  }

  function setOvercommitUI(committed, forecast) {
    const deltaEl = qs("forecast_delta");
    const ratioEl = qs("forecast_overcommit");
    const pill = qs("overcommitPill");
    const card = qs("forecastCard");

    if (!deltaEl || !ratioEl || !pill) return;

    if (committed == null || forecast == null || forecast <= 0) {
      deltaEl.style.display = "none";
      ratioEl.style.display = "none";
      pill.style.display = "none";
      if (card) card.classList.remove("overcommit");
      return;
    }

    const ratio = committed / forecast;
    const delta = committed - forecast;

    deltaEl.style.display = "inline-flex";
    ratioEl.style.display = "inline-flex";
    pill.style.display = "inline-flex";

    const abs = Math.round(Math.abs(delta));
    if (delta > 0) {
      deltaEl.textContent = `Δ +${abs} SP (over)`;
      deltaEl.classList.remove("good");
      deltaEl.classList.add("bad");
    } else {
      deltaEl.textContent = `Δ ${abs} SP (buffer)`;
      deltaEl.classList.remove("bad");
      deltaEl.classList.add("good");
    }

    ratioEl.textContent = `Over-commit Ratio: ${committed} ÷ ${Math.round(forecast)} = ${ratio.toFixed(2)}×`;

    const over = ratio > 1;
    pill.textContent = over ? "⚠ Over-commit" : "✅ OK";
    pill.classList.toggle("bad", over);
    pill.classList.toggle("good", !over);

    if (card) card.classList.toggle("overcommit", over);
  }

  function readSetupFromUI() {
    return {
      sprintDays: clampInt3(num(qs("setup_sprintDays")?.value)),
      teamMembers: clampInt3(num(qs("setup_teamMembers")?.value)),
      leaveDays: clampInt3(num(qs("setup_leaveDays")?.value)),
      committedSP: clampInt3(num(qs("setup_committedSP")?.value)),
      v1: clampInt3(num(qs("setup_v1")?.value)),
      v2: clampInt3(num(qs("setup_v2")?.value)),
      v3: clampInt3(num(qs("setup_v3")?.value)),
      updatedAt: Date.now()
    };
  }

  function writeSetupToUI(s) {
    if (!s) return;
    if (qs("setup_sprintDays")) qs("setup_sprintDays").value = s.sprintDays ?? "";
    if (qs("setup_teamMembers")) qs("setup_teamMembers").value = s.teamMembers ?? "";
    if (qs("setup_leaveDays")) qs("setup_leaveDays").value = s.leaveDays ?? "";
    if (qs("setup_committedSP")) qs("setup_committedSP").value = s.committedSP ?? "";

    if (qs("setup_v1")) qs("setup_v1").value = s.v1 ?? "";
    if (qs("setup_v2")) qs("setup_v2").value = s.v2 ?? "";
    if (qs("setup_v3")) qs("setup_v3").value = s.v3 ?? "";
  }

  function saveSetup(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }
  function loadSetup() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return safeParse(raw, null);
    } catch {
      return null;
    }
  }

  function syncModeUI(mode) {
    const vBox = qs("forecast_velocityBox");
    const cBox = qs("forecast_capacityBox");
    const vFormula = qs("forecast_formulaVelocity");

    if (vBox) vBox.style.display = (mode === "velocity") ? "block" : "none";
    if (cBox) cBox.style.display = (mode === "capacity") ? "block" : "none";
    if (vFormula) vFormula.style.display = (mode === "velocity") ? "block" : "none";
  }

  function refreshSetupSummary(setup, mode) {
    const el = qs("forecast_setupSummary");
    if (!el) return;

    const parts = [];
    if (setup.sprintDays != null) parts.push(`Sprint Days: ${setup.sprintDays}`);
    if (setup.teamMembers != null) parts.push(`Team: ${setup.teamMembers}`);
    if (setup.leaveDays != null) parts.push(`Leaves: ${setup.leaveDays}`);
    if (setup.committedSP != null) parts.push(`Committed: ${setup.committedSP} SP`);

    if (mode === "velocity") {
      const ok = [setup.v1, setup.v2, setup.v3].every(v => v != null);
      parts.push(ok ? `Vel: ${setup.v1}/${setup.v2}/${setup.v3}` : `Vel: —`);
    }

    el.textContent = parts.length ? parts.join(" • ") : "—";
  }

  // -------- Velocity forecast --------
  function applyVelocityDefaultsFromSetup(setup) {
    const n1 = qs("forecast_velN1");
    const n2 = qs("forecast_velN2");
    const n3 = qs("forecast_velN3");
    if (!n1 || !n2 || !n3) return;

    n1.value = setup.v1 ?? "";
    n2.value = setup.v2 ?? "";
    n3.value = setup.v3 ?? "";
  }

  function syncVelOverride(setup) {
    const cb = qs("forecast_velOverride");
    const n1 = qs("forecast_velN1");
    const n2 = qs("forecast_velN2");
    const n3 = qs("forecast_velN3");
    if (!cb || !n1 || !n2 || !n3) return;

    const editable = cb.checked;
    [n1, n2, n3].forEach(inp => {
      inp.disabled = !editable;
      inp.style.opacity = editable ? "1" : "0.86";
    });

    if (!editable) applyVelocityDefaultsFromSetup(setup);
  }

  function calcVelocity(setup) {
    const override = !!qs("forecast_velOverride")?.checked;

    let a = setup.v1, b = setup.v2, c = setup.v3;
    if (override) {
      a = clampInt3(num(qs("forecast_velN1")?.value));
      b = clampInt3(num(qs("forecast_velN2")?.value));
      c = clampInt3(num(qs("forecast_velN3")?.value));
    }

    if ([a, b, c].some(v => v == null)) {
      showWarn("Enter last 3 sprint velocities (N-1, N-2, N-3) to forecast.");
      return null;
    }

    hideWarn();
    const avg = (a + b + c) / 3;

    const mean = avg || 1;
    const variance = ((a-avg)**2 + (b-avg)**2 + (c-avg)**2) / 3;
    const stdev = Math.sqrt(variance);
    const volatility = stdev / mean;

    let confidence = 90 - (volatility * 120);
    confidence = Math.max(35, Math.min(95, confidence));

    return {
      forecastSP: avg,
      confidence,
      html:
        `<div class="kvKey" style="margin-bottom:6px;">📘 Velocity Forecast</div>
         <div><b>Formula:</b> (Sprint N-1 + Sprint N-2 + Sprint N-3) / 3</div>
         <div style="margin-top:8px;">Avg = (${a} + ${b} + ${c}) / 3 = <b>${avg.toFixed(1)}</b></div>
         <div class="mutedText" style="margin-top:8px;">Volatility ≈ ${(volatility*100).toFixed(0)}% (lower is better)</div>`
    };
  }

  // -------- Capacity forecast --------
  function calcCapacity(setup) {
    const sprintDays = setup.sprintDays;
    const teamMembers = setup.teamMembers;
    const leaveDays = setup.leaveDays;

    const focus = num(qs("forecast_focusFactor")?.value);
    const weight = num(qs("forecast_leaveWeight")?.value);
    const spPerTeamDay = num(qs("forecast_spPerDay")?.value);

    const missing = [];
    if (sprintDays == null) missing.push("Sprint Days");
    if (teamMembers == null) missing.push("Team Members");
    if (leaveDays == null) missing.push("Leave Days");
    if (focus == null) missing.push("Focus Factor");
    if (weight == null) missing.push("Leaves weight");
    if (spPerTeamDay == null) missing.push("SP per Team Day");

    // Live values should still show partial math if possible
    if (sprintDays != null && focus != null) {
      const idealPerPerson = sprintDays * focus;
      setCapacityLiveValues(`Ideal/person = <b>${sprintDays}</b> × <b>${focus}</b> = <b>${idealPerPerson.toFixed(2)}</b>`);
    }

    if (missing.length) {
      showWarn("Missing: " + missing.join(", "));
      return null;
    }

    hideWarn();

    const idealPerPerson = sprintDays * focus;
    const totalIdealDays = teamMembers * idealPerPerson;
    const totalActualDays = totalIdealDays - (leaveDays * weight);
    const effectiveDays = Math.max(0, totalActualDays);
    const forecastSP = effectiveDays * spPerTeamDay;

    setCapacityLiveValues(
      `Ideal/person = <b>${sprintDays}</b> × <b>${focus}</b> = <b>${idealPerPerson.toFixed(2)}</b><br/>
       Total Ideal Days = <b>${teamMembers}</b> × <b>${idealPerPerson.toFixed(2)}</b> = <b>${totalIdealDays.toFixed(2)}</b><br/>
       Total Actual Days = <b>${totalIdealDays.toFixed(2)}</b> − (<b>${leaveDays}</b> × <b>${weight}</b>) = <b>${totalActualDays.toFixed(2)}</b><br/>
       Effective Team Days = max(0, Actual) = <b>${effectiveDays.toFixed(2)}</b><br/>
       Forecast SP = <b>${effectiveDays.toFixed(2)}</b> × <b>${spPerTeamDay}</b> = <b>${forecastSP.toFixed(2)}</b>`
    );

    let confidence = 88;
    if (focus < 0.6) confidence -= 12;
    if (totalActualDays < totalIdealDays * 0.7) confidence -= 14;
    if (totalActualDays < totalIdealDays * 0.5) confidence -= 14;
    if (totalActualDays <= 0) confidence -= 25;
    confidence = Math.max(35, Math.min(95, confidence));

    return {
      forecastSP,
      confidence,
      html:
        `<div class="kvKey" style="margin-bottom:6px;">📘 Capacity Forecast</div>
         <div><b>1) Ideal/person</b> = Sprint Days × Focus Factor = <b>${idealPerPerson.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>2) Total Ideal Days</b> = Team × Ideal/person = <b>${totalIdealDays.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>3) Total Actual Days</b> = Total Ideal − (Leaves × Weight) = <b>${totalActualDays.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>4) Forecast SP</b> = max(0, Actual) × SP per Team Day = <b>${forecastSP.toFixed(2)}</b></div>`
    };
  }

  function renderForecast(setup) {
    const mode = qs("forecast_forecastMode")?.value || "capacity";
    syncModeUI(mode);
    refreshSetupSummary(setup, mode);

    // keep velocity override values in sync
    applyVelocityDefaultsFromSetup(setup);
    syncVelOverride(setup);

    let result = null;
    if (mode === "velocity") result = calcVelocity(setup);
    else result = calcCapacity(setup);

    if (!result) {
      setForecastValue(null);
      setConfidenceBadge(50);
      setDetails("—");
      setActualFormula("Fill missing fields to see formulas here.");
      setOvercommitUI(setup.committedSP, null);
      return;
    }

    setForecastValue(result.forecastSP);
    setConfidenceBadge(result.confidence);
    setActualFormula(result.html);

    if (setup.committedSP != null) {
      setDetails(`Committed ${setup.committedSP} SP vs Forecast ~${Math.round(result.forecastSP)} SP.`);
      setOvercommitUI(setup.committedSP, result.forecastSP);
    } else {
      setDetails(`Forecast ~${Math.round(result.forecastSP)} SP. (Add committed SP to compare.)`);
      setOvercommitUI(null, null);
    }
  }

  // -------- Quick presets --------
  function applyPreset(presetName) {
    const presets = {
      excellent: { sprintDays: 10, teamMembers: 7, leaveDays: 2, committedSP: 35, v1: 36, v2: 41, v3: 38 },
      normal:    { sprintDays: 10, teamMembers: 7, leaveDays: 6, committedSP: 40, v1: 30, v2: 32, v3: 28 },
      risky:     { sprintDays: 10, teamMembers: 7, leaveDays: 12, committedSP: 45, v1: 22, v2: 25, v3: 20 }
    };
    const p = presets[presetName];
    if (!p) return;

    qs("setup_sprintDays").value = p.sprintDays;
    qs("setup_teamMembers").value = p.teamMembers;
    qs("setup_leaveDays").value = p.leaveDays;
    qs("setup_committedSP").value = p.committedSP;
    qs("setup_v1").value = p.v1;
    qs("setup_v2").value = p.v2;
    qs("setup_v3").value = p.v3;

    showToast(`✅ ${presetName[0].toUpperCase()+presetName.slice(1)} preset applied. Edit values anytime, then hit Save.`);
    setSaveStatus("Preset applied (not saved yet).");

    renderForecast(readSetupFromUI());
  }

  function attachHandlers() {
    INT_IDS.forEach(id => {
      const el = qs(id);
      if (!el) return;
      el.addEventListener("input", () => clampInputInt3(el));
      el.addEventListener("blur", () => clampInputInt3(el));
    });

    qs("setup_presetExcellent")?.addEventListener("click", () => applyPreset("excellent"));
    qs("setup_presetNormal")?.addEventListener("click", () => applyPreset("normal"));
    qs("setup_presetRisky")?.addEventListener("click", () => applyPreset("risky"));

    qs("setup_saveBtn")?.addEventListener("click", () => {
      const setup = readSetupFromUI();
      saveSetup(setup);
      setSaveStatus("Saved ✔");
      showToast("Saved. Forecast updated below.");
      renderForecast(setup);
    });

    qs("forecast_forecastMode")?.addEventListener("change", () => renderForecast(readSetupFromUI()));
    qs("forecast_velOverride")?.addEventListener("change", () => renderForecast(readSetupFromUI()));

    ["setup_sprintDays","setup_teamMembers","setup_leaveDays","setup_committedSP","setup_v1","setup_v2","setup_v3"]
      .forEach(id => qs(id)?.addEventListener("input", () => renderForecast(readSetupFromUI())));

    ["forecast_focusFactor","forecast_leaveWeight","forecast_spPerDay"]
      .forEach(id => qs(id)?.addEventListener("input", () => renderForecast(readSetupFromUI())));

    ["forecast_velN1","forecast_velN2","forecast_velN3"]
      .forEach(id => qs(id)?.addEventListener("input", () => renderForecast(readSetupFromUI())));
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (qs("forecast_focusFactor") && !qs("forecast_focusFactor").value) qs("forecast_focusFactor").value = "0.60";
    if (qs("forecast_leaveWeight") && !qs("forecast_leaveWeight").value) qs("forecast_leaveWeight").value = "1.0";
    if (qs("forecast_spPerDay") && !qs("forecast_spPerDay").value) qs("forecast_spPerDay").value = "1.0";

    const saved = loadSetup();
    if (saved) {
      writeSetupToUI(saved);
      setSaveStatus("Loaded saved setup.");
      hideToast();
    } else {
      setSaveStatus("Not saved yet.");
    }

    attachHandlers();
    renderForecast(readSetupFromUI());
  });
})();