// js/plan.js — Scrummer Plan (Stable v4.6.2)
// Fixes:
//  - Avg Velocity tile wiring (avgVelocityMirror)
//  - Committed SP tile wiring (committedMirror)
//  - Prevent capacity calculations from leaking into velocity mode
//  - Over-commit Ratio + Gap ALWAYS anchored to Capacity baseline (even in Velocity mode)
//  - Safe rendering even if some IDs are missing

(function () {
  const STORAGE_KEY = "scrummer_plan_setup_v3";
  const qs = (id) => document.getElementById(id);

  // If IDs are missing in HTML, do NOT crash — only warn.
  const REQUIRED_IDS = [
    "setup_sprintDays",
    "setup_teamMembers",
    "setup_leaveDays",
    "setup_committedSP",
    "setup_v1",
    "setup_v2",
    "setup_v3",
    "setup_presetExcellent",
    "setup_presetNormal",
    "setup_presetRisky",
    "setup_saveBtn",
    "setup_saveStatus",
    "setup_toast",
    "forecastCard",
    "forecast_setupSummary",
    "confidenceBadge",
    "forecast_forecastMode",
    "forecast_velocityBox",
    "forecast_capacityBox",
    "forecast_velOverride",
    "forecast_velN1",
    "forecast_velN2",
    "forecast_velN3",
    "forecast_focusFactor",
    "forecast_leaveWeight",
    "forecast_spPerDay",
    "forecast_warnBox",
    "forecast_warnText",
    "capacityForecastMirror",
    "forecast_detailLine",
    "forecast_formulaActual",
    "capacity_liveValues",
    "forecast_delta",
    "forecast_overcommit",
    "overcommitPill",
    "committedMirror",
    "avgVelocityMirror"
  ];

  function logMissingIds(){
    const missing = REQUIRED_IDS.filter(id => !qs(id));
    if(missing.length){
      console.warn("[Scrummer Plan] Missing IDs in index.html:", missing);
    }
  }

  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  function clampInt3(n){
    if(!Number.isFinite(n)) return null;
    const x = Math.round(n);
    return Math.max(0, Math.min(999, x));
  }

  function clampInputInt3(el){
    if(!el) return;
    const raw = String(el.value ?? "").trim();
    if(raw === "") return;
    const n = num(raw);
    if(n == null){ el.value = ""; return; }
    el.value = String(clampInt3(n));
  }

  const INT_IDS = [
    "setup_sprintDays","setup_teamMembers","setup_leaveDays","setup_committedSP",
    "setup_v1","setup_v2","setup_v3",
    "forecast_velN1","forecast_velN2","forecast_velN3"
  ];

  function sparkleXP(){
    const w = document.querySelector(".xpWidget");
    if(!w) return;
    w.classList.remove("xp-sparkle");
    void w.offsetWidth;
    w.classList.add("xp-sparkle");
    setTimeout(()=>w.classList.remove("xp-sparkle"), 700);
  }

  function setSaveStatus(msg){
    const el = qs("setup_saveStatus");
    if(el) el.textContent = msg || "";
  }

  function showToast(msg){
    const t = qs("setup_toast");
    if(!t) return;
    t.textContent = msg || "—";
    t.style.display = "block";
  }

  function hideToast(){
    const t = qs("setup_toast");
    if(t) t.style.display = "none";
  }

  function showWarn(msg){
    const b = qs("forecast_warnBox");
    const t = qs("forecast_warnText");
    if(!b || !t) return;
    t.textContent = msg || "";
    b.style.display = "block";
  }

  function hideWarn(){
    const b = qs("forecast_warnBox");
    if(b) b.style.display = "none";
  }

  function getForecastNumberEl(){
    return qs("capacityForecastMirror") || qs("forecast_value");
  }

  function bumpForecastNumber(){
    const el = getForecastNumberEl();
    if(!el) return;
el.classList.remove("num-bump");
    void el.offsetWidth;
    el.classList.add("num-bump");
    setTimeout(()=>el.classList.remove("num-bump"), 520);

    const theme = document.documentElement.getAttribute("data-theme") || "light";
    if(theme !== "neon") return;

    const fx = el.closest(".forecastNumber.neonFx");
    if(!fx) return;

    fx.classList.remove("spark");
    void fx.offsetWidth;
    fx.classList.add("spark");
    setTimeout(()=>fx.classList.remove("spark"), 720);
  }

  function setForecastValue(v){
    const el = getForecastNumberEl();
    if(!el) return;
const prev = el.getAttribute("data-prev");
    const next = (v == null) ? "—" : String(Math.round(v));

    el.textContent = next;
    if(prev !== null && prev !== next) bumpForecastNumber();
    el.setAttribute("data-prev", next);
  }

  function setConfidenceBadge(score){
    const el = qs("confidenceBadge");
    if(!el) return;

    const s = Math.max(0, Math.min(100, Math.round(score)));
    let label="Low", cls="badge-low";
    if(s >= 75){ label="High"; cls="badge-high"; }
    else if(s >= 55){ label="Medium"; cls="badge-med"; }

    el.classList.remove("badge-high","badge-med","badge-low");
    el.classList.add("badge", cls);
    el.textContent = `Confidence: ${label} (${s}%)`;
  }

  function setDetails(text){
    const el = qs("forecast_detailLine");
    if(el) el.textContent = text || "—";
  }

  function setActualFormula(html){
    const el = qs("forecast_formulaActual");
    if(el) el.innerHTML = html || "—";
  }

  function setCapacityLiveValues(html){
    const el = qs("capacity_liveValues");
    if(el) el.innerHTML = html || "—";
  }

  // ✅ Committed SP tile wiring
  function setCommittedMirror(v){
    const el = qs("committedMirror");
    if(!el) return;
    el.textContent = (v == null || Number.isNaN(v)) ? "—" : String(Math.round(v));
  }

  // ✅ Avg Velocity tile wiring
  function setAvgVelocityMirror(v){
    const el = qs("avgVelocityMirror");
    if(!el) return;
    el.textContent = (v == null || Number.isNaN(v)) ? "—" : String(Math.round(v));
  }

  function setOvercommitUI(committed, forecast){
    const deltaEl = qs("forecast_delta");
    const ratioEl = qs("forecast_overcommit");
    const pill = qs("overcommitPill");
    const card = qs("forecastCard");
    if(!deltaEl || !ratioEl || !pill) return;

    if(committed == null || forecast == null || forecast <= 0){
      deltaEl.style.display = "none";
      ratioEl.style.display = "none";
      pill.style.display = "none";
      if(card) card.classList.remove("overcommit");
      return;
    }

    const ratio = committed / forecast;
    const delta = committed - forecast;

    deltaEl.style.display = "inline-flex";
    ratioEl.style.display = "inline-flex";
    pill.style.display = "inline-flex";

    const abs = Math.round(Math.abs(delta));
    if(delta > 0){
      deltaEl.textContent = `Δ +${abs} SP (over)`;
      deltaEl.classList.remove("good");
      deltaEl.classList.add("bad");
    } else {
      deltaEl.textContent = `Δ ${abs} SP (buffer)`;
      deltaEl.classList.remove("bad");
      deltaEl.classList.add("good");
    }

    // keep it compact to avoid overflow
    ratioEl.textContent = `Over-commit: ${ratio.toFixed(2)}×`;
    ratioEl.title = `Over-commit Ratio: ${committed} ÷ ${Math.round(forecast)} = ${ratio.toFixed(2)}×`;

    const over = ratio > 1;
    pill.textContent = over ? "⚠ Over-commit" : "✅ OK";
    pill.classList.toggle("bad", over);
    pill.classList.toggle("good", !over);
    if(card) card.classList.toggle("overcommit", over);
  }

  function readSetupFromUI(){
    const get = (id) => qs(id)?.value;
    return {
      sprintDays: clampInt3(num(get("setup_sprintDays"))),
      teamMembers: clampInt3(num(get("setup_teamMembers"))),
      leaveDays: clampInt3(num(get("setup_leaveDays"))),
      committedSP: clampInt3(num(get("setup_committedSP"))),
      v1: clampInt3(num(get("setup_v1"))),
      v2: clampInt3(num(get("setup_v2"))),
      v3: clampInt3(num(get("setup_v3"))),
      updatedAt: Date.now()
    };
  }

  function writeSetupToUI(s){
    if(!s) return;
    const put = (id, v) => { const el = qs(id); if(el) el.value = (v ?? ""); };
    put("setup_sprintDays", s.sprintDays);
    put("setup_teamMembers", s.teamMembers);
    put("setup_leaveDays", s.leaveDays);
    put("setup_committedSP", s.committedSP);
    put("setup_v1", s.v1);
    put("setup_v2", s.v2);
    put("setup_v3", s.v3);
  }

  function saveSetup(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch{} }
  function loadSetup(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      return safeParse(raw, null);
    }catch{ return null; }
  }

  // ✅ IMPORTANT: also toggles the capacity breakdown area in the shared calculations block
  function syncModeUI(mode){
    const vBox = qs("forecast_velocityBox");
    const cBox = qs("forecast_capacityBox");
    const vFormula = qs("forecast_formulaVelocity");
    const capVals = qs("capacity_liveValues");

    if(vBox) vBox.style.display = (mode === "velocity") ? "block" : "none";
    if(cBox) cBox.style.display = (mode === "capacity") ? "block" : "none";
    if(vFormula) vFormula.style.display = (mode === "velocity") ? "block" : "none";

    // ✅ Hide capacity breakdown when NOT in capacity mode
    if(capVals){
      capVals.style.display = (mode === "capacity") ? "block" : "none";
      if(mode !== "capacity"){
        capVals.innerHTML = ""; // clear stale capacity calculations (prevents "leak")
      }
    }
  }

  function refreshSetupSummary(setup, mode){
    const el = qs("forecast_setupSummary");
    if(!el) return;

    const parts=[];
    if(setup.sprintDays!=null) parts.push(`Sprint Days: ${setup.sprintDays}`);
    if(setup.teamMembers!=null) parts.push(`Team: ${setup.teamMembers}`);
    if(setup.leaveDays!=null) parts.push(`Leaves: ${setup.leaveDays}`);
    if(setup.committedSP!=null) parts.push(`Committed: ${setup.committedSP} SP`);

    if(mode === "velocity"){
      const ok = [setup.v1,setup.v2,setup.v3].every(v=>v!=null);
      parts.push(ok ? `Vel: ${setup.v1}/${setup.v2}/${setup.v3}` : "Vel: —");
    }

    el.textContent = parts.length ? parts.join(" • ") : "—";
  }

  function applyVelocityDefaultsFromSetup(setup){
    const override = !!qs("forecast_velOverride")?.checked;
    if(override) return;

    const n1=qs("forecast_velN1"), n2=qs("forecast_velN2"), n3=qs("forecast_velN3");
    if(n1) n1.value = setup.v1 ?? "";
    if(n2) n2.value = setup.v2 ?? "";
    if(n3) n3.value = setup.v3 ?? "";
  }

  function syncVelOverride(setup){
    const cb=qs("forecast_velOverride");
    const n1=qs("forecast_velN1"), n2=qs("forecast_velN2"), n3=qs("forecast_velN3");
    if(!cb || !n1 || !n2 || !n3) return;

    const editable = cb.checked;
    [n1,n2,n3].forEach(inp=>{
      inp.disabled = !editable;
      inp.style.opacity = editable ? "1" : "0.86";
    });

    if(!editable){
      n1.value = setup.v1 ?? "";
      n2.value = setup.v2 ?? "";
      n3.value = setup.v3 ?? "";
    }
  }

  function calcVelocity(setup){
    const override = !!qs("forecast_velOverride")?.checked;

    let a=setup.v1, b=setup.v2, c=setup.v3;
    if(override){
      a=clampInt3(num(qs("forecast_velN1")?.value));
      b=clampInt3(num(qs("forecast_velN2")?.value));
      c=clampInt3(num(qs("forecast_velN3")?.value));
    }

    if([a,b,c].some(v=>v==null)){
      showWarn("Enter last 3 sprint velocities (N-1, N-2, N-3) to forecast.");
      return null;
    }
    hideWarn();

    const avg=(a+b+c)/3;
    const mean=avg||1;
    const variance=((a-avg)**2+(b-avg)**2+(c-avg)**2)/3;
    const stdev=Math.sqrt(variance);
    const volatility=stdev/mean;

    let confidence=90-(volatility*120);
    confidence=Math.max(35,Math.min(95,confidence));

    return {
      forecastSP: avg,
      confidence,
      html:
        `<div class="kvKey" style="margin-bottom:6px;">Velocity calculations</div>
         <div><b>Formula</b></div>
         <div class="mutedText">(Sprint N-1 + Sprint N-2 + Sprint N-3) / 3</div>
         <div style="margin-top:10px;"><b>Substitute values</b></div>
         <div>(${a} + ${b} + ${c}) / 3 = <b>${avg.toFixed(1)}</b></div>
         <div class="mutedText" style="margin-top:10px;">Volatility ≈ ${(volatility*100).toFixed(0)}% (lower is better)</div>`
    };
  }

  function calcCapacity(setup){
    const sprintDays=setup.sprintDays;
    const teamMembers=setup.teamMembers;
    const leaveDays=setup.leaveDays;

    const focus=num(qs("forecast_focusFactor")?.value);
    const weight=num(qs("forecast_leaveWeight")?.value);
    const spPerTeamDay=num(qs("forecast_spPerDay")?.value);

    const missing=[];
    if(sprintDays==null) missing.push("Sprint Days");
    if(teamMembers==null) missing.push("Team Members");
    if(leaveDays==null) missing.push("Leave Days");
    if(focus==null) missing.push("Focus Factor");
    if(weight==null) missing.push("Leaves weight");
    if(spPerTeamDay==null) missing.push("SP per Team Day");

    if(missing.length){
      showWarn("Missing: " + missing.join(", "));
      return null;
    }
    hideWarn();

    const idealPerPerson=sprintDays*focus;
    const totalIdealDays=teamMembers*idealPerPerson;
    const totalActualDays=totalIdealDays-(leaveDays*weight);
    const effectiveDays=Math.max(0,totalActualDays);
    const forecastSP=effectiveDays*spPerTeamDay;

    setCapacityLiveValues(
      `Ideal/person = <b>${sprintDays}</b> × <b>${focus}</b> = <b>${idealPerPerson.toFixed(2)}</b><br/>
       Total Ideal Days = <b>${teamMembers}</b> × <b>${idealPerPerson.toFixed(2)}</b> = <b>${totalIdealDays.toFixed(2)}</b><br/>
       Total Actual Days = <b>${totalIdealDays.toFixed(2)}</b> − (<b>${leaveDays}</b> × <b>${weight}</b>) = <b>${totalActualDays.toFixed(2)}</b><br/>
       Effective Team Days = max(0, Actual) = <b>${effectiveDays.toFixed(2)}</b><br/>
       Forecast SP = <b>${effectiveDays.toFixed(2)}</b> × <b>${spPerTeamDay}</b> = <b>${forecastSP.toFixed(2)}</b>`
    );

    let confidence=88;
    if(focus < 0.6) confidence -= 12;
    if(totalActualDays < totalIdealDays*0.7) confidence -= 14;
    if(totalActualDays < totalIdealDays*0.5) confidence -= 14;
    if(totalActualDays <= 0) confidence -= 25;
    confidence=Math.max(35,Math.min(95,confidence));

    return {
      forecastSP,
      confidence,
      html:
        `<div class="kvKey" style="margin-bottom:6px;">Capacity calculations</div>
         <div><b>1) Ideal/person</b> = Sprint Days × Focus Factor = <b>${idealPerPerson.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>2) Total Ideal Days</b> = Team × Ideal/person = <b>${totalIdealDays.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>3) Total Actual Days</b> = Total Ideal − (Leaves × Weight) = <b>${totalActualDays.toFixed(2)}</b></div>
         <div style="margin-top:6px;"><b>4) Forecast SP</b> = max(0, Actual) × SP per Team Day = <b>${forecastSP.toFixed(2)}</b></div>`
    };
  }

  // ✅ NEW: Capacity baseline forecast (quiet, used for Gap/Over-commit even in Velocity mode)
  function calcCapacityBaseline(setup){
    const sprintDays=setup.sprintDays;
    const teamMembers=setup.teamMembers;
    const leaveDays=setup.leaveDays;

    const focus=num(qs("forecast_focusFactor")?.value);
    const weight=num(qs("forecast_leaveWeight")?.value);
    const spPerTeamDay=num(qs("forecast_spPerDay")?.value);

    if([sprintDays,teamMembers,leaveDays,focus,weight,spPerTeamDay].some(v => v == null)) return null;

    const idealPerPerson=sprintDays*focus;
    const totalIdealDays=teamMembers*idealPerPerson;
    const totalActualDays=totalIdealDays-(leaveDays*weight);
    const effectiveDays=Math.max(0,totalActualDays);
    return effectiveDays*spPerTeamDay;
  }

  function renderForecast(setup){
    const mode = qs("forecast_forecastMode")?.value || "capacity";
    syncModeUI(mode);
    refreshSetupSummary(setup, mode);

    // Always update tiles
    setCommittedMirror(setup?.committedSP);

    if(setup && setup.v1 != null && setup.v2 != null && setup.v3 != null){
      setAvgVelocityMirror((setup.v1 + setup.v2 + setup.v3) / 3);
    } else {
      setAvgVelocityMirror(null);
    }

    applyVelocityDefaultsFromSetup(setup);
    syncVelOverride(setup);

    const result = (mode === "velocity") ? calcVelocity(setup) : calcCapacity(setup);

    // ✅ Always compute capacity baseline for gap/ratio
    const capacityBaseline = calcCapacityBaseline(setup);

    if(!result){
      setForecastValue(null);
      setConfidenceBadge(50);
      setDetails("—");
      setActualFormula("Fill missing fields to see calculations here.");
      setOvercommitUI(setup.committedSP, null);
      return;
    }

    const displayForecast = (capacityBaseline != null) ? capacityBaseline : result.forecastSP;
    setForecastValue(displayForecast);
    setConfidenceBadge(result.confidence);
    setActualFormula(result.html);

    if(setup.committedSP != null){
      const compareForecast = (capacityBaseline != null) ? capacityBaseline : result.forecastSP;
      setDetails(`Committed ${setup.committedSP} SP vs Forecast ~${Math.round(compareForecast)} SP.`);
      // ✅ Gap/Over-commit ALWAYS vs capacity baseline (even in Velocity mode)
      setOvercommitUI(setup.committedSP, capacityBaseline ?? compareForecast);
    } else {
      const compareForecast = (capacityBaseline != null) ? capacityBaseline : result.forecastSP;
      setDetails(`Forecast ~${Math.round(compareForecast)} SP. (Add committed SP to compare.)`);
      setOvercommitUI(null, null);
    }
  }

  function applyPreset(name){
    const presets={
      excellent:{ sprintDays:10, teamMembers:7, leaveDays:2, committedSP:35, v1:36, v2:41, v3:38 },
      normal:{ sprintDays:10, teamMembers:7, leaveDays:6, committedSP:40, v1:30, v2:32, v3:28 },
      risky:{ sprintDays:10, teamMembers:7, leaveDays:12, committedSP:45, v1:22, v2:25, v3:20 }
    };
    const p = presets[name];
    if(!p) return;

    const put = (id, v) => { const el = qs(id); if(el) el.value = v; };
    put("setup_sprintDays", p.sprintDays);
    put("setup_teamMembers", p.teamMembers);
    put("setup_leaveDays", p.leaveDays);
    put("setup_committedSP", p.committedSP);
    put("setup_v1", p.v1);
    put("setup_v2", p.v2);
    put("setup_v3", p.v3);

    hideWarn();
    sparkleXP();
    showToast(`✅ ${name[0].toUpperCase()+name.slice(1)} preset applied. Edit values anytime, then hit Save.`);
    setSaveStatus("Preset applied (not saved yet).");
    renderForecast(readSetupFromUI());
  }

  function attachHandlers(){
    // clamp 3-digit numbers
    INT_IDS.forEach(id=>{
      const el = qs(id);
      if(!el) return;
      el.addEventListener("input",()=>clampInputInt3(el));
      el.addEventListener("blur",()=>clampInputInt3(el));
    });

    // presets
    qs("setup_presetExcellent")?.addEventListener("click",()=>applyPreset("excellent"));
    qs("setup_presetNormal")?.addEventListener("click",()=>applyPreset("normal"));
    qs("setup_presetRisky")?.addEventListener("click",()=>applyPreset("risky"));

    // save
    qs("setup_saveBtn")?.addEventListener("click",()=>{
      const setup = readSetupFromUI();
      saveSetup(setup);
      hideWarn();
      sparkleXP();
      setSaveStatus("Saved ✔");
      showToast("Saved. Forecast updated below.");
      renderForecast(setup);
    });

    // mode / override toggles
    qs("forecast_forecastMode")?.addEventListener("change",()=>renderForecast(readSetupFromUI()));
    qs("forecast_velOverride")?.addEventListener("change",()=>renderForecast(readSetupFromUI()));

    // live updates (setup fields)
    ["setup_sprintDays","setup_teamMembers","setup_leaveDays","setup_committedSP","setup_v1","setup_v2","setup_v3"]
      .forEach(id=>qs(id)?.addEventListener("input",()=>renderForecast(readSetupFromUI())));

    // live updates (capacity knobs)
    ["forecast_focusFactor","forecast_leaveWeight","forecast_spPerDay"]
      .forEach(id=>qs(id)?.addEventListener("input",()=>renderForecast(readSetupFromUI())));

    // live updates (velocity override)
    ["forecast_velN1","forecast_velN2","forecast_velN3"]
      .forEach(id=>qs(id)?.addEventListener("input",()=>renderForecast(readSetupFromUI())));
  }

  document.addEventListener("DOMContentLoaded",()=>{
    logMissingIds();

    // Set defaults if blank
    const ff = qs("forecast_focusFactor");
    const lw = qs("forecast_leaveWeight");
    const sp = qs("forecast_spPerDay");
    if(ff && !ff.value) ff.value="0.60";
    if(lw && !lw.value) lw.value="1.0";
    if(sp && !sp.value) sp.value="1.0";

    const saved = loadSetup();
    if(saved){
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
