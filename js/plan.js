// js/plan.js — Plan UX v3.1
// Fixes included in this version:
// 1) Default "SP per Team Day" = 1.0
// 2) Over-commit ratio display shows exact math (Committed ÷ Forecast = ratio)
// 3) Keeps: animation, overcommit highlight, delta, confidence badge, 3-digit clamp

(function () {
  const STORAGE_KEY = "scrummer_plan_setup_v3";
  const qs = (id) => document.getElementById(id);

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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
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

  function animateForecastNumber() {
    const el = qs("forecast_value");
    if (!el) return;
    el.classList.remove("num-bump");
    void el.offsetWidth;
    el.classList.add("num-bump");
    setTimeout(() => el.classList.remove("num-bump"), 520);
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
      const velOk = [setup.v1, setup.v2, setup.v3].every(v => v != null);
      parts.push(velOk ? `Vel: ${setup.v1}/${setup.v2}/${setup.v3}` : `Vel: —`);
    }

    el.textContent = parts.length ? parts.join(" • ") : "—";
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
    el.classList.add(cls);
    el.textContent = `Confidence: ${label} (${s}%)`;
  }

  function setDeltaAndOvercommit(committed, forecast) {
    const deltaEl = qs("forecast_delta");
    const overEl = qs("forecast_overcommit");
    const pill = qs("overcommitPill");
    const card = qs("forecastCard");

    if (!deltaEl || !overEl || !pill) return;

    if (committed == null || forecast == null || forecast <= 0) {
      deltaEl.style.display = "none";
      overEl.style.display = "none";
      pill.style.display = "none";
      if (card) card.classList.remove("overcommit");
      return;
    }

    const delta = committed - forecast;
    const abs = Math.round(Math.abs(delta));
    const ratio = committed / forecast;

    deltaEl.style.display = "inline-flex";
    overEl.style.display = "inline-flex";
    pill.style.display = "inline-flex";

    if (delta > 0) {
      deltaEl.textContent = `Δ +${abs} SP (over)`;
      deltaEl.classList.remove("good");
      deltaEl.classList.add("bad");
    } else {
      deltaEl.textContent = `Δ ${abs} SP (buffer)`;
      deltaEl.classList.remove("bad");
      deltaEl.classList.add("good");
    }

    // ✅ Now shows EXACT math for clarity
    overEl.textContent = `Over-commit Ratio: ${committed} ÷ ${Math.round(forecast)} = ${ratio.toFixed(2)}×`;
    overEl.classList.toggle("bad", ratio > 1);
    overEl.classList.toggle("good", ratio <= 1);

    pill.textContent = ratio > 1 ? "⚠ Over-commit" : "✅ OK";
    pill.classList.toggle("bad", ratio > 1);
    pill.classList.toggle("good", ratio <= 1);

    if (card) card.classList.toggle("overcommit", ratio > 1);
  }

  function setForecastValue(n) {
    const el = qs("forecast_value");
    if (!el) return;

    const prev = el.getAttribute("data-prev");
    const next = (n == null) ? "—" : String(Math.round(n));

    el.textContent = next;
    if (prev !== null && prev !== next) animateForecastNumber();
    el.setAttribute("data-prev", next);
  }

  function setDetails(line) {
    const el = qs("forecast_detailLine");
    if (el) el.textContent = line || "—";
  }

  function setActualFormula(html) {
    const el = qs("forecast_formulaActual");
    if (el) el.innerHTML = html || "—";
  }

  function setCapacityLiveValues(text) {
    const el = qs("capacity_liveValues");
    if (el) el.innerHTML = text || "—";
  }

  function syncModeUI(mode) {
    const vBox = qs("forecast_velocityBox");
    const cBox = qs("forecast_capacityBox");
    const vFormula = qs("forecast_formulaVelocity");

    if (vBox) vBox.style.display = mode === "velocity" ? "block" : "none";
    if (cBox) cBox.style.display = mode === "capacity" ? "block" : "none";
    if (vFormula) vFormula.style.display = mode === "velocity" ? "block" : "none";
  }

  function applyVelocityDefaultsFromSetup(setup) {
    const v1 = qs("forecast_velN1");
    const v2 = qs("forecast_velN2");
    const v3 = qs("forecast_velN3");
    if (!v1 || !v2 || !v3) return;

    v1.value = setup.v1 ?? "";
    v2.value = setup.v2 ?? "";
    v3.value = setup.v3 ?? "";
  }

  function syncVelOverride(setup) {
    const cb = qs("forecast_velOverride");
    const v1 = qs("forecast_velN1");
    const v2 = qs("forecast_velN2");
    const v3 = qs("forecast_velN3");
    if (!cb || !v1 || !v2 || !v3) return;

    const editable = cb.checked;
    [v1, v2, v3].forEach(inp => {
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
      showWarn("Enter the last 3 sprint velocities (N-1, N-2, N-3).");
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
      calcHtml:
        `<div class="kvKey" style="margin-bottom:6px;">🧮 Velocity Calculation</div>
         <div>Avg = (${a} + ${b} + ${c}) / 3 = <b>${avg.toFixed(1)}</b></div>
         <div class="mutedText" style="margin-top:8px;">Volatility ≈ ${(volatility*100).toFixed(0)}% (lower is better)</div>`
    };
  }

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
    if (weight == null) missing.push("Leaves Weight");
    if (spPerTeamDay == null) missing.push("SP per Team Day");

    if (missing.length) {
      showWarn("Missing: " + missing.join(", "));
      setCapacityLiveValues("Save to see live values here.");
      return null;
    }

    hideWarn();

    const idealPerPerson = sprintDays * focus;
    const totalIdealDays = teamMembers * idealPerPerson;
    const totalActualDays = totalIdealDays - (leaveDays * weight);
    const effectiveTeamDays = Math.max(0, totalActualDays);
    const forecastSP = effectiveTeamDays * spPerTeamDay;

    setCapacityLiveValues(
      `Sprint Days <b>${sprintDays}</b>, Focus <b>${focus}</b> → Ideal/person <b>${idealPerPerson.toFixed(2)}</b><br/>
       Team <b>${teamMembers}</b> → Total Ideal Days <b>${totalIdealDays.toFixed(2)}</b><br/>
       Leaves <b>${leaveDays}</b>, Weight <b>${weight}</b> → Total Actual Days <b>${totalActualDays.toFixed(2)}</b><br/>
       Effective Team Days = max(0, Actual) = <b>${effectiveTeamDays.toFixed(2)}</b><br/>
       Forecast SP = Effective Team Days × SP per Team Day = <b>${forecastSP.toFixed(2)}</b>`
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
      calcHtml:
        `<div class="kvKey" style="margin-bottom:6px;">🧮 Capacity Calculation</div>
         <div>Ideal/person = ${sprintDays} × ${focus} = <b>${idealPerPerson.toFixed(2)}</b> days</div>
         <div>Total ideal days = ${teamMembers} × ${idealPerPerson.toFixed(2)} = <b>${totalIdealDays.toFixed(2)}</b></div>
         <div>Total actual days = ${totalIdealDays.toFixed(2)} − (${leaveDays} × ${weight}) = <b>${totalActualDays.toFixed(2)}</b></div>
         <div>Effective team days = max(0, ${totalActualDays.toFixed(2)}) = <b>${effectiveTeamDays.toFixed(2)}</b></div>
         <div>Forecast SP = ${effectiveTeamDays.toFixed(2)} × ${spPerTeamDay} = <b>${forecastSP.toFixed(2)}</b></div>`
    };
  }

  function renderForecast(setup) {
    const mode = qs("forecast_forecastMode")?.value || "capacity";
    syncModeUI(mode);
    refreshSetupSummary(setup, mode);

    applyVelocityDefaultsFromSetup(setup);
    syncVelOverride(setup);

    let result = null;
    if (mode === "velocity") result = calcVelocity(setup);
    else result = calcCapacity(setup);

    if (!result) {
      setForecastValue(null);
      setDetails("—");
      setActualFormula("Save to see calculation details here.");
      setConfidenceBadge(50);
      setDeltaAndOvercommit(setup.committedSP, null);
      return;
    }

    const forecast = result.forecastSP;
    setForecastValue(forecast);
    setConfidenceBadge(result.confidence);

    const committed = setup.committedSP;
    if (committed != null) {
      const ratio = forecast > 0 ? committed / forecast : null;
      if (ratio != null && ratio > 1) {
        setDetails(`Committed ${committed} SP vs Forecast ~${Math.round(forecast)} SP → over-commit.`);
      } else {
        setDetails(`Committed ${committed} SP vs Forecast ~${Math.round(forecast)} SP.`);
      }
      setDeltaAndOvercommit(committed, forecast);
    } else {
      setDetails(`Forecast ~${Math.round(forecast)} SP. (Add committed SP to compare.)`);
      setDeltaAndOvercommit(null, null);
    }

    setActualFormula(result.calcHtml);
  }

  function attachClampHandlers() {
    const intIds = [
      "setup_sprintDays","setup_teamMembers","setup_leaveDays","setup_committedSP",
      "setup_v1","setup_v2","setup_v3",
      "forecast_velN1","forecast_velN2","forecast_velN3"
    ];

    intIds.forEach(id => {
      qs(id)?.addEventListener("input", (e) => clampInputInt3(e.target));
      qs(id)?.addEventListener("blur", (e) => clampInputInt3(e.target));
    });

    ["forecast_spPerDay"].forEach(id => {
      qs(id)?.addEventListener("blur", (e) => {
        const el = e.target;
        const n = num(el.value);
        if (n == null) return;
        el.value = String(Math.max(0, Math.min(999, n)));
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    attachClampHandlers();

    const saved = loadSetup();
    if (saved) {
      writeSetupToUI(saved);
      setSaveStatus("Loaded saved setup.");
    } else {
      setSaveStatus("Not saved yet.");
    }

    // ✅ DEFAULTS (SP per Team Day must be 1.0)
    if (qs("forecast_focusFactor") && !qs("forecast_focusFactor").value) qs("forecast_focusFactor").value = "0.8";
    if (qs("forecast_leaveWeight") && !qs("forecast_leaveWeight").value) qs("forecast_leaveWeight").value = "1.0";
    if (qs("forecast_spPerDay") && !qs("forecast_spPerDay").value) qs("forecast_spPerDay").value = "1.0";

    // Save button
    qs("setup_saveBtn")?.addEventListener("click", () => {
      const setup = readSetupFromUI();
      saveSetup(setup);
      setSaveStatus("Saved ✔");
      setToast("Saved. Forecast updated below.", true);
      renderForecast(setup);
    });

    // Recalc on mode changes / override
    qs("forecast_forecastMode")?.addEventListener("change", () => renderForecast(readSetupFromUI()));
    qs("forecast_velOverride")?.addEventListener("change", () => renderForecast(readSetupFromUI()));

    ["forecast_velN1","forecast_velN2","forecast_velN3"].forEach(id => {
      qs(id)?.addEventListener("input", () => renderForecast(readSetupFromUI()));
    });

    ["forecast_focusFactor","forecast_leaveWeight","forecast_spPerDay"].forEach(id => {
      qs(id)?.addEventListener("input", () => renderForecast(readSetupFromUI()));
    });

    renderForecast(readSetupFromUI());
  });
})();
