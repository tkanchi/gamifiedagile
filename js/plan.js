
(() => {
  function initTabs() {
    const btns = Array.from(document.querySelectorAll('.tabBtn'));
    const panels = {
      setup: document.getElementById('panel-setup'),
      forecast: document.getElementById('panel-forecast'),
      insights: document.getElementById('panel-insights'),
      health: document.getElementById('panel-health'),
      actions: document.getElementById('panel-actions'),
      copilot: document.getElementById('panel-copilot'),
    };

    function setActive(name) {
      btns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', k !== name);
      });
      if (history.replaceState) history.replaceState(null, '', '#' + name);
    }

    btns.forEach(b => b.addEventListener('click', () => setActive(b.dataset.tab)));
    const hash = (location.hash || '').replace('#','');
    const first = btns[0] ? btns[0].dataset.tab : null;
    const initial = (hash && panels[hash]) ? hash : first;
    if (initial) setActive(initial);
  }

  document.addEventListener('DOMContentLoaded', initTabs);
})();


/**
 * SCRUMMER — Metrics Engine
 * Logic for calculating Risk, Confidence, and Capacity Health.
 */

(() => {
  const STORAGE_KEY = "scrummer-setup-v1";
  const SNAP_KEY = "scrummer-snapshots-v1";

  // --- Math Helpers ---
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const safeNum = (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0) ? n : 0;
  };

  const mean = (arr) => {
    const a = arr.filter(n => n > 0);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  };

  /**
   * Calculates Volatility using Coefficient of Variation (CV)
   * A higher CV means the team's velocity is unpredictable.
   */
  const calculateVolatility = (arr) => {
    const a = arr.filter(n => n > 0);
    if (a.length < 2) return 0;
    const m = mean(a);
    const variance = a.reduce((s, x) => s + Math.pow(x - m, 2), 0) / (a.length - 1);
    const sd = Math.sqrt(variance);
    return m > 0 ? sd / m : 0; // Standard Deviation / Mean
  };

  // --- Storage API ---
  const loadSetup = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const saveSetup = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  /**
   * 🧮 Compute Signals
   * The core "SaaS Brain" that determines if a sprint is risky.
   */
  function computeSignals(setup) {
    const sprintDays = safeNum(setup.sprintDays) || 10;
    const teamMembers = safeNum(setup.teamMembers) || 1;
    const leaveDays = safeNum(setup.leaveDays || 0);
    const committed = safeNum(setup.committedSP);

    // BUG 1 FIX: Ensure all 3 velocity fields are captured
    const velocities = [
        safeNum(setup.v1), 
        safeNum(setup.v2), 
        safeNum(setup.v3)
    ].filter(v => v > 0);
    
    const avgVelocity = mean(velocities);
    const vol = calculateVolatility(velocities);

    // --- Capacity Logic ---
    const idealPD = sprintDays * teamMembers;
    const availablePD = Math.max(0, idealPD - leaveDays);
    const availabilityRatio = idealPD > 0 ? (availablePD / idealPD) : 0;

    // Effective Capacity: Scaled by current team availability
    const capacitySP = avgVelocity > 0 ? (avgVelocity * availabilityRatio) : 0;

    // --- Ratios & Signals ---
    const overcommitRatio = avgVelocity > 0 ? (committed / avgVelocity) : 1;
    const capacityShortfallRatio = capacitySP > 0 ? (committed / capacitySP) : 1;
    const focusFactor = availabilityRatio; 

    // --- Risk Scoring (0-100) ---
    // 1. Overcommit (50% weight): Planning > Historical Avg
    const overPenalty = clamp((overcommitRatio - 1) * 60, 0, 50);
    
    // 2. Capacity (35% weight): Planning > Current Availability
    const capPenalty = clamp((capacityShortfallRatio - 1) * 50, 0, 35);
    
    // 3. Volatility (15% weight): Stability of the 3 historical sprints
    // A volatility (CV) of 0.3 (30%) is considered high in Agile.
    const volPenalty = clamp(vol * 50, 0, 15);

    const riskScore = Math.round(clamp(overPenalty + capPenalty + volPenalty, 0, 100));

    // --- Confidence Calculation ---
    // Perfect confidence = Capacity matches or exceeds commitment, minus volatility stability.
    const baseConf = committed > 0 ? (capacitySP / committed) * 100 : 0;
    const confidence = Math.round(clamp(baseConf - (vol * 100), 0, 100));

    // --- Labels ---
    let capacityHealth = "Stable";
    if (committed > 0) {
      if (capacityShortfallRatio > 1.15) capacityHealth = "Critical";
      else if (capacityShortfallRatio > 1.0) capacityHealth = "At Risk";
      else capacityHealth = "Healthy";
    }

    const riskBand = riskScore <= 30 ? "Low" : (riskScore <= 60 ? "Moderate" : "High");

    return {
      sprintDays, teamMembers, leaveDays, committed,
      velocities, avgVelocity, idealPD, availablePD, availabilityRatio,
      capacitySP, overcommitRatio, capacityShortfallRatio, focusFactor, vol,
      riskScore, riskBand, confidence, capacityHealth,
      components: { over: overPenalty, cap: capPenalty, vola: volPenalty }
    };
  }

  // --- Snapshot Management ---
  const loadSnapshots = () => {
    try {
      const raw = localStorage.getItem(SNAP_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  const saveSnapshots = (arr) => localStorage.setItem(SNAP_KEY, JSON.stringify(arr));

  const addSnapshot = (snapshot) => {
    const arr = loadSnapshots();
    arr.unshift(snapshot);
    saveSnapshots(arr.slice(0, 30));
    return arr;
  };

  const makeSnapshot = (signals) => ({
    id: `${Date.now()}`,
    ts: new Date().toISOString(),
    committed: signals.committed || 0,
    avgVelocity: signals.avgVelocity || 0,
    capacitySP: signals.capacitySP || 0,
    focusFactor: signals.focusFactor || 0,
    riskScore: signals.riskScore || 0,
    riskBand: signals.riskBand || "—",
    confidence: signals.confidence || 0,
    capacityHealth: signals.capacityHealth || "—",
    vol: signals.vol || 0
  });

  // --- Expose Global API ---
  window.Scrummer = window.Scrummer || {};
  window.Scrummer.setup = { loadSetup, saveSetup, STORAGE_KEY };
  window.Scrummer.snapshots = { loadSnapshots, saveSnapshots, addSnapshot, makeSnapshot, SNAP_KEY };
  window.Scrummer.computeSignals = computeSignals;
})();



    (function () {
      const PREFIX = "setup_";
  const $ = (id) => document.getElementById(PREFIX + id);
      const status = $("saveStatus");
      const toast = $("toast");
      const STORAGE_KEY = "scrummer_setup_v1";

      function showToast(msg){
        if(!toast) return;
        toast.style.display = "block";
        toast.innerHTML = msg;
        clearTimeout(showToast._tm);
        showToast._tm = setTimeout(() => { toast.style.display = "none"; }, 2200);
      }

      function safeNumber(v) {
        if (v === "" || v === null || v === undefined) return "";
        const n = Number(v);
        return Number.isFinite(n) ? n : "";
      }

      function readForm() {
        return {
          sprintDays: safeNumber($("sprintDays")?.value),
          teamMembers: safeNumber($("teamMembers")?.value),
          leaveDays: safeNumber($("leaveDays")?.value),
          committedSP: safeNumber($("committedSP")?.value),
          v1: safeNumber($("v1")?.value),
          v2: safeNumber($("v2")?.value),
          v3: safeNumber($("v3")?.value),
        };
      }

      function writeForm(d) {
        d = d || {};
        $("sprintDays").value = d.sprintDays ?? "";
        $("teamMembers").value = d.teamMembers ?? "";
        $("leaveDays").value = d.leaveDays ?? "";
        $("committedSP").value = d.committedSP ?? "";
        $("v1").value = d.v1 ?? "";
        $("v2").value = d.v2 ?? "";
        $("v3").value = d.v3 ?? "";
      }

      function loadSetup() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
        catch { return {}; }
      }

      function saveSetup(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data || {}));
      }

      function setStatus(msg) { status.textContent = msg; }

      function onSave() {
        const data = readForm();
        saveSetup(data);
        setStatus("Saved ✅ Ready for Insights → Health → Actions.");
        showToast("✅ Setup saved.");
      }

      function applyPreset(type) {
        const presets = {
          excellent: { sprintDays:10, teamMembers:7, leaveDays:0, committedSP:38, v1:40, v2:39, v3:41 },
          normal:    { sprintDays:10, teamMembers:7, leaveDays:3, committedSP:42, v1:40, v2:36, v3:41 },
          risky:     { sprintDays:10, teamMembers:7, leaveDays:6, committedSP:52, v1:38, v2:30, v3:44 }
        };
        const p = presets[type];
        if (!p) return;
        writeForm(p);
        saveSetup(p);
        setStatus(`Preset applied: ${type.toUpperCase()} ✅`);
        showToast(`✅ Preset applied: ${type.toUpperCase()}`);
      }

      const existing = loadSetup();
      if (existing && Object.keys(existing).length) {
        writeForm(existing);
        setStatus("Loaded saved setup ✅");
      }

      $("saveBtn")?.addEventListener("click", onSave);
      $("presetExcellent")?.addEventListener("click", () => applyPreset("excellent"));
      $("presetNormal")?.addEventListener("click", () => applyPreset("normal"));
      $("presetRisky")?.addEventListener("click", () => applyPreset("risky"));

      // Auto-save on input
      ["sprintDays","teamMembers","leaveDays","committedSP","v1","v2","v3"].forEach(id => {
        const input = $(id);
        if (!input) return;
        input.addEventListener("input", () => {
          saveSetup(readForm());
          setStatus("Auto-saved… ✅");
        });
      });
    })();
  

/* =========================================================
   Scrummer — forecast.js (FINAL + ROLES + STORAGE + SUMMARY)
   FIXES:
   ✅ Reference formulas always visible (#formulaReference in HTML)
   ✅ Actual calculations render ONLY into #formulaActual
   ✅ Placeholder updates correctly when mode changes
   ✅ Reset keeps defaults (focusFactor/spPerDay/weight)
   ✅ Roles labels no longer hard-bold inline
   ========================================================= */

(() => {
  const PREFIX = "forecast_";
  const $ = (id) => document.getElementById(PREFIX + id);
  const round2 = (n) => Math.round(n * 100) / 100;

  const LS_KEY = "scrummer_forecast_roles_v1";

  function show(el, yes){
    if(!el) return;
    el.style.display = yes ? "block" : "none";
  }

  function num(id, fallback = 0){
    const el = $(id);
    if(!el) return fallback;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function setText(id, text){
    const el = $(id);
    if(el) el.textContent = text;
  }

  function setHTML(id, html){
    const el = $(id);
    if(el) el.innerHTML = html;
  }

  function setModeUI(){
    const mode = $("forecastMode")?.value || "capacity";
    show($("velocityBox"), mode === "velocity");
    show($("capacityBox"), mode === "capacity");

    // keep placeholder aligned with mode whenever user switches
    showCalcPlaceholder(mode);

    return mode;
  }

  function warn(msg){
    setText("warnText", msg);
    show($("warnBox"), true);
  }

  function clearWarn(){
    show($("warnBox"), false);
    setText("warnText", "");
  }

  // ---------------------------
  // Roles: storage
  // ---------------------------
  function saveRoles(){
    const rows = getRoleRows();
    const roles = rows.map(r => ({
      name: (r.querySelector(".roleName")?.value || "Role").trim(),
      members: Number(r.querySelector(".roleMembers")?.value || 0) || 0,
      leaves: Number(r.querySelector(".roleLeaves")?.value || 0) || 0,
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(roles));
  }

  function loadRoles(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return [];
      return arr.map(x => ({
        name: String(x?.name ?? "Role"),
        members: Number(x?.members ?? 0) || 0,
        leaves: Number(x?.leaves ?? 0) || 0,
      }));
    } catch {
      return [];
    }
  }

  // ---------------------------
  // Roles: helpers
  // ---------------------------
  function getRoleRows(){
    const wrap = $("rolesContainer");
    if(!wrap) return [];
    return Array.from(wrap.querySelectorAll(".roleRow"));
  }

  function roleTotals(){
    const rows = getRoleRows();
    let members = 0;
    let leaves = 0;

    rows.forEach(r => {
      const m = Number(r.querySelector(".roleMembers")?.value || 0) || 0;
      const l = Number(r.querySelector(".roleLeaves")?.value || 0) || 0;
      if(m > 0) members += m;
      if(l > 0) leaves += l;
    });

    return { members, leaves, hasRoles: rows.length > 0, count: rows.length };
  }

  function updateRoleTags(){
    const t = roleTotals();
    setText("rolesCountTag", `Roles: ${t.count}`);
    setText("rolesMembersTag", `Members: ${round2(t.members)}`);
    setText("rolesLeavesTag", `Leaves: ${round2(t.leaves)}`);
  }

  function applyRolesAutofill(){
    const t = roleTotals();

    const teamEl = $("teamCount");
    const leavesEl = $("leaves");
    const teamHint = $("teamCountHint");
    const leavesHint = $("leavesHint");

    if(!teamEl || !leavesEl) return t;

    if(t.hasRoles){
      teamEl.value = t.members;
      leavesEl.value = round2(t.leaves);

      teamEl.readOnly = true;
      leavesEl.readOnly = true;

      show(teamHint, true);
      show(leavesHint, true);
    } else {
      teamEl.readOnly = false;
      leavesEl.readOnly = false;

      show(teamHint, false);
      show(leavesHint, false);
    }

    return t;
  }

  function makeRoleRow({name="Role", members="", leaves=""} = {}){
    const row = document.createElement("div");
    row.className = "roleRow";

    row.innerHTML = `
      <div class="roleRowTop">
        <div>
          <div class="kvKey" style="margin-bottom:6px;">Role</div>
          <input class="fun-input roleName" placeholder="e.g., Dev / QA / BA" value="${escapeHtml(name)}">
        </div>

        <div>
          <div class="kvKey" style="margin-bottom:6px;">Members</div>
          <input class="fun-input roleMembers mono" type="number" min="0" step="1" placeholder="0" value="${members}">
        </div>

        <div>
          <div class="kvKey" style="margin-bottom:6px;">Leaves</div>
          <input class="fun-input roleLeaves mono" type="number" min="0" step="0.5" placeholder="0" value="${leaves}">
        </div>

        <button class="iconBtn removeRoleBtn" type="button" title="Remove role">✖</button>
      </div>
    `;

    row.querySelector(".removeRoleBtn").addEventListener("click", () => {
      row.remove();
      saveRoles();
      calculate();
    });

    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        saveRoles();
        calculate();
      });
    });

    return row;
  }

  function addRoleRow(role){
    const wrap = $("rolesContainer");
    if(!wrap) return;
    wrap.appendChild(makeRoleRow(role));
    saveRoles();
    calculate();
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------------------------
  // “Your Calculation” placeholder
  // ---------------------------
  function showCalcPlaceholder(mode){
    const el = $("formulaActual");
    if(!el) return;

    const msg = mode === "velocity"
      ? "Enter Sprint N, N-1 and N-2 velocities, then click Calculate to see the step-by-step average."
      : "Enter values, then click Calculate to see your step-by-step capacity forecast.";

    setHTML("formulaActual", `
      <div class="kvKey" style="margin-bottom:6px;">🧮 Your Calculation</div>
      <div style="color:var(--text-muted); font-weight:450; line-height:1.6;">
        ${msg}
      </div>
    `);
  }

  // ---------------------------
  // Velocity
  // ---------------------------
  function calcVelocity(){
    clearWarn();
    show($("summaryGrid"), false);

    const n  = num("velN", 0);
    const n1 = num("velN1", 0);
    const n2 = num("velN2", 0);

    if(n === 0 && n1 === 0 && n2 === 0){
      warn("Enter Sprint N, N-1, and N-2 velocities to calculate the average.");
      showCalcPlaceholder("velocity");
      setText("resultTitle", "🔵 Velocity Forecast");
      setText("resultMain", "Forecast SP = 0 SP");
      return;
    }

    const avgVel = (n + n1 + n2) / 3;

    setText("resultTitle", "🔵 Velocity Forecast");
    setText("resultMain", `Forecast SP = ${round2(avgVel)} SP`);

    setHTML("formulaActual", `
      <div class="kvKey" style="margin-bottom:6px;">🧮 Your Calculation</div>
      <div><b>Average Velocity</b> = (Sprint N + Sprint N-1 + Sprint N-2) / 3</div>
      <div style="margin-top:8px;">
        = (${round2(n)} + ${round2(n1)} + ${round2(n2)}) / 3
        = <b>${round2(avgVel)}</b>
      </div>
    `);
  }

  // ---------------------------
  // Capacity
  // ---------------------------
  function renderTeamSummary({
    idealPerPersonDays, totalIdealDays, leaves, weight, totalActualDays, forecastSP
  }){
    setHTML("teamSummary", `
      <div class="kvRow"><div class="kvLabel">Ideal days/person</div><div class="kvVal mono">${round2(idealPerPersonDays)}</div></div>
      <div class="kvRow"><div class="kvLabel">Total ideal days</div><div class="kvVal mono">${round2(totalIdealDays)}</div></div>
      <div class="kvRow"><div class="kvLabel">Leaves × weight</div><div class="kvVal mono">${round2(leaves)} × ${round2(weight)} = ${round2(leaves * weight)}</div></div>
      <div class="kvRow"><div class="kvLabel">Total actual days</div><div class="kvVal mono">${round2(totalActualDays)}</div></div>
      <div class="kvRow"><div class="kvLabel">Forecast SP</div><div class="kvVal mono">${round2(forecastSP)}</div></div>
    `);
  }

  function renderRoleSummary({ idealPerPersonDays, spPerDay, weight }){
    const rows = getRoleRows();
    if(!rows.length){
      setHTML("roleSummary", `<div style="color:var(--text-muted); font-weight:450;">No roles added.</div>`);
      return;
    }

    let body = "";
    rows.forEach(r => {
      const roleName = (r.querySelector(".roleName")?.value || "Role").trim() || "Role";
      const m = Number(r.querySelector(".roleMembers")?.value || 0) || 0;
      const l = Number(r.querySelector(".roleLeaves")?.value || 0) || 0;

      const roleIdealDays = m * idealPerPersonDays;
      const roleActualDays = roleIdealDays - (l * weight);
      const roleSP = Math.max(0, roleActualDays) * spPerDay;

      body += `
        <tr>
          <td>${escapeHtml(roleName)}</td>
          <td class="tableRight mono">${round2(m)}</td>
          <td class="tableRight mono">${round2(Math.max(0, roleActualDays))}</td>
          <td class="tableRight mono">${round2(roleSP)}</td>
        </tr>
      `;
    });

    setHTML("roleSummary", `
      <table class="tableMini">
        <thead>
          <tr>
            <th>Role</th>
            <th class="tableRight">Members</th>
            <th class="tableRight">Actual Days</th>
            <th class="tableRight">SP</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `);
  }

  function calcCapacity(){
    clearWarn();

    updateRoleTags();
    const roleMeta = applyRolesAutofill();

    const sprintDays   = num("sprintDays", 0);
    const focusFactor  = num("focusFactor", 0);
    const teamCount    = num("teamCount", 0);
    const spPerDay     = num("spPerDay", 0);
    const leaves       = num("leaves", 0);
    const weightRaw    = num("weight", 0);
    const weight = Math.max(0, Math.min(1, weightRaw));

    if(sprintDays <= 0) { showCalcPlaceholder("capacity"); return warn("Sprint Days must be > 0."); }
    if(teamCount <= 0)  { showCalcPlaceholder("capacity"); return warn("Team Count must be > 0."); }
    if(spPerDay <= 0)   { showCalcPlaceholder("capacity"); return warn("SP/day must be > 0."); }
    if(focusFactor < 0 || focusFactor > 1) { showCalcPlaceholder("capacity"); return warn("Focus Factor must be between 0 and 1."); }
    if(weightRaw < 0 || weightRaw > 1)     { showCalcPlaceholder("capacity"); return warn("Unavailability Weight must be between 0 and 1."); }
    if(leaves < 0) { showCalcPlaceholder("capacity"); return warn("Leaves cannot be negative."); }

    const idealPerPersonDays = sprintDays * focusFactor;
    const totalIdealDays = teamCount * idealPerPersonDays;
    const totalActualDays = totalIdealDays - (leaves * weight);
    const forecastSP = Math.max(0, totalActualDays) * spPerDay;

    if(totalActualDays < 0){
      warn("Total Actual Capacity (Days) became negative. Reduce Leaves, Weight, or increase Days/Team/Focus.");
    }

    setText("resultTitle", "🟢 Capacity Forecast (Focus + Leaves Weight)");
    setText("resultMain", `Forecast SP = ${round2(forecastSP)} SP`);

    show($("summaryGrid"), true);

    renderTeamSummary({
      idealPerPersonDays, totalIdealDays, leaves, weight, totalActualDays, forecastSP
    });

    renderRoleSummary({ idealPerPersonDays, spPerDay, weight });

    setHTML("formulaActual", `
      <div class="kvKey" style="margin-bottom:6px;">🧮 Your Calculation</div>

      <div><b>1) Ideal Capacity (Days per person)</b></div>
      <div>= ${round2(sprintDays)} × ${round2(focusFactor)} = <b>${round2(idealPerPersonDays)}</b></div>

      <div style="margin-top:10px;"><b>2) Total Ideal Capacity (Days)</b></div>
      <div>= ${round2(teamCount)} × ${round2(idealPerPersonDays)} = <b>${round2(totalIdealDays)}</b></div>

      <div style="margin-top:10px;"><b>3) Total Actual Capacity (Days)</b></div>
      <div>= ${round2(totalIdealDays)} − (${round2(leaves)} × ${round2(weight)})</div>
      <div>= ${round2(totalIdealDays)} − ${round2(leaves * weight)} = <b>${round2(totalActualDays)}</b></div>

      <div style="margin-top:10px;"><b>4) Total Actual Capacity (SP)</b></div>
      <div>= max(0, ${round2(totalActualDays)}) × ${round2(spPerDay)}</div>
      <div>= <b>${round2(forecastSP)}</b></div>

      ${roleMeta.hasRoles ? `<div style="margin-top:10px; color:var(--text-muted); font-weight:450;">
        Role totals auto-fill Team Count & Leaves from Roles.
      </div>` : ``}
    `);
  }

  function calculate(){
    const mode = setModeUI();
    if(mode === "velocity") return calcVelocity();
    return calcCapacity();
  }

  function reset(){
    // clear only forecast inputs, not everything with fun-input (roles use fun-input too)
    ["velN","velN1","velN2","sprintDays","teamCount","leaves"].forEach(id => { const el = $(id); if(el) el.value = ""; });

    // restore defaults
    if($("focusFactor")) $("focusFactor").value = "0.60";
    if($("spPerDay")) $("spPerDay").value = "4";
    if($("weight")) $("weight").value = "0.50";

    // roles reset
    const wrap = $("rolesContainer");
    if(wrap) wrap.innerHTML = "";
    localStorage.removeItem(LS_KEY);

    updateRoleTags();
    showCalcPlaceholder($("forecastMode")?.value || "capacity");
    calculate();
  }

  function wire(){
    $("forecastMode")?.addEventListener("change", calculate);
    $("calcBtn")?.addEventListener("click", calculate);
    $("resetBtn")?.addEventListener("click", reset);

    $("addRoleBtn")?.addEventListener("click", () => addRoleRow({ name:"Role", members:"", leaves:"" }));

    ["velN","velN1","velN2","sprintDays","focusFactor","teamCount","spPerDay","leaves","weight"]
      .forEach(id => $(id)?.addEventListener("input", calculate));

    // load roles once
    const stored = loadRoles();
    if(stored.length){
      const wrap = $("rolesContainer");
      if(wrap) wrap.innerHTML = "";
      stored.forEach(r => {
        const row = makeRoleRow(r);
        $("rolesContainer")?.appendChild(row);
      });
      updateRoleTags();
    } else {
      updateRoleTags();
    }

    showCalcPlaceholder($("forecastMode")?.value || "capacity");
    calculate();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();