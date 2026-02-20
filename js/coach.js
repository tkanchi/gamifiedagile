
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


/**
 * Scrummer — history.js
 * ----------------------------------------------------------
 * Purpose:
 * - Persist sprint snapshots locally (localStorage)
 * - Provide a small API used by Insights + Health:
 *    - saveSnapshot(data, opts)
 *    - getHistory(), getLast(), getTrend(metric)
 *    - resetCurrentSprint(), clearHistory()
 *
 * Data Model (snapshot):
 * {
 *   sprintId, timestamp,
 *   riskScore, confidence, overcommitRatio,
 *   avgVelocity, committedSP, capacitySP,
 *   mode
 * }
 */
(() => {
  // Storage keys (versioned so you can upgrade later)
  const KEY = "scrummer_sprint_history_v1";
  const SPRINT_ID_KEY = "scrummer_current_sprint_id_v1";

  /** Safe JSON parse (never throws) */
  function safeParse(str, fallback){
    try { return JSON.parse(str); } catch { return fallback; }
  }

  /**
   * Load full snapshot array from localStorage.
   * Always returns an array.
   */
  function loadHistory(){
    const arr = safeParse(localStorage.getItem(KEY) || "[]", []);
    return Array.isArray(arr) ? arr : [];
  }

  /** Persist snapshot array to localStorage */
  function saveHistory(arr){
    localStorage.setItem(KEY, JSON.stringify(arr || []));
  }

  /** Left-pad helper for sprint id formatting */
  function pad(n){ return String(n).padStart(2,"0"); }

  /**
   * Generate a readable sprint id.
   * Example: SPRINT_2026_02_18_0830
   * Note: Unique-enough for local usage (minute precision).
   */
  function generateSprintId(){
    const d = new Date();
    return `SPRINT_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  /**
   * Get current sprint id; if missing, create it once.
   * This lets multiple snapshots belong to the same sprint.
   */
  function getCurrentSprintId(){
    let id = localStorage.getItem(SPRINT_ID_KEY);
    if (!id) {
      id = generateSprintId();
      localStorage.setItem(SPRINT_ID_KEY, id);
    }
    return id;
  }

  /**
   * Start a new sprint (resets sprint id).
   * Health page uses this for the "New Sprint" button.
   */
  function resetCurrentSprint(){
    const id = generateSprintId();
    localStorage.setItem(SPRINT_ID_KEY, id);
    return id;
  }

  /** Clear all snapshots only (does not reset sprint id) */
  function clearHistory(){
    localStorage.removeItem(KEY);
  }

  /**
   * Convert risk score to a simple mode label used in UI:
   * - rescue: high risk
   * - watch: medium risk
   * - stable: low risk
   */
  function detectMode(risk){
    risk = Number(risk || 0);
    if (risk >= 70) return "rescue";
    if (risk >= 40) return "watch";
    return "stable";
  }

  /**
   * Save a snapshot.
   *
   * @param {Object} data - computed signals
   * @param {Object} opts - options
   *    opts.force: true -> bypass 60s dedupe window
   *
   * @returns {Object} result:
   *   { ok: true,  reason:"saved",     snapshot }
   *   { ok: false, reason:"dedup_60s", snapshot:lastSaved }
   *   { ok: false, reason:"invalid_data", snapshot:null }
   */
  function saveSnapshot(data, opts){
    const options = opts && typeof opts === "object" ? opts : {};
    const force = !!options.force;

    // Guard: data must be an object
    if (!data || typeof data !== "object") {
      return { ok:false, reason:"invalid_data", snapshot:null };
    }

    // Load existing history
    const history = loadHistory();

    // Build normalized snapshot object (numbers only)
    const snapshot = {
      sprintId: getCurrentSprintId(),
      timestamp: Date.now(),

      riskScore: Number(data.riskScore || 0),
      confidence: Number(data.confidence || 0),
      overcommitRatio: Number(data.overcommitRatio || 0),

      avgVelocity: Number(data.avgVelocity || 0),
      committedSP: Number(data.committedSP || 0),
      capacitySP: Number(data.capacitySP || 0),

      mode: detectMode(Number(data.riskScore || 0))
    };

    /**
     * De-dupe rule:
     * - Don’t create another snapshot within 60 seconds of the last one
     * - Unless user explicitly forces (manual refresh + wants to see it saved)
     */
    const last = history[history.length - 1];
    if (!force && last && Math.abs((last.timestamp || 0) - snapshot.timestamp) < 60000) {
      return { ok:false, reason:"dedup_60s", snapshot:last };
    }

    // Append snapshot
    history.push(snapshot);

    // Keep storage bounded: last 30 snapshots max
    if (history.length > 30) history.splice(0, history.length - 30);

    // Persist
    saveHistory(history);

    return { ok:true, reason:"saved", snapshot };
  }

  /** Get all snapshots */
  function getHistory(){ return loadHistory(); }

  /** Get latest snapshot (or null) */
  function getLast(){
    const h = loadHistory();
    return h.length ? h[h.length - 1] : null;
  }

  /**
   * Basic trend helper used by UI:
   * metric example: "riskScore" or "capacitySP"
   * returns: "up" | "down" | "flat"
   */
  function getTrend(metric){
    const h = loadHistory();
    if (h.length < 2) return "flat";
    const last = Number(h[h.length - 1]?.[metric]);
    const prev = Number(h[h.length - 2]?.[metric]);
    if (!Number.isFinite(last) || !Number.isFinite(prev)) return "flat";
    if (last > prev) return "up";
    if (last < prev) return "down";
    return "flat";
  }

  /**
   * Public API exposed on window.Scrummer.history
   * so any page can call it.
   */
  window.Scrummer = window.Scrummer || {};
  window.Scrummer.history = {
    saveSnapshot,
    getHistory,
    getLast,
    getTrend,
    resetCurrentSprint,
    clearHistory
  };
})();


  (function () {
    const STORAGE_KEY = "scrummer_setup_v1";
    const PREFIX = "insights_";
  const $ = (id) => document.getElementById(PREFIX + id);

    function showToast(msg){
      const t = $("toast");
      if(!t) return;
      t.style.display = "block";
      t.innerHTML = msg;
      clearTimeout(showToast._tm);
      showToast._tm = setTimeout(() => { t.style.display = "none"; }, 2400);
    }

    function loadSetup() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
      catch { return {}; }
    }

    function num(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }

    function computeSignals(setup) {
      const sprintDays  = num(setup.sprintDays);
      const teamMembers = num(setup.teamMembers);
      const leaveDays   = num(setup.leaveDays);
      const committedSP = num(setup.committedSP);

      const velocities = [num(setup.v1), num(setup.v2), num(setup.v3)].filter(x => x > 0);
      const avgVelocity = velocities.length ? velocities.reduce((a,b)=>a+b,0) / velocities.length : 0;

      const teamDays = Math.max(1, sprintDays * Math.max(1, teamMembers));
      const leaveRatio = Math.min(0.6, Math.max(0, leaveDays / teamDays));

      const capacitySP = avgVelocity * (1 - leaveRatio);
      const overcommitRatio = capacitySP > 0 ? committedSP / capacitySP : 0;

      let risk = 0;
      if (committedSP <= 0 || avgVelocity <= 0) risk += 30;
      if (overcommitRatio > 1) risk += Math.min(50, (overcommitRatio - 1) * 120);
      risk = Math.max(0, Math.min(100, Math.round(risk)));

      const confidence = Math.max(10, Math.min(95, 100 - risk));

      const capacityHealth =
        overcommitRatio <= 0 ? "—" :
        overcommitRatio <= 1 ? "🟢 Healthy" :
        overcommitRatio <= 1.15 ? "🟡 Tight" :
        "🔴 Overloaded";

      return {
        riskScore: risk,
        confidence,
        capacityHealth,
        capacitySP,
        overcommitRatio,
        avgVelocity,
        committedSP
      };
    }

    function band(score) {
      if (score >= 70) return "🔴 High Risk";
      if (score >= 40) return "🟡 Watchlist";
      return "🟢 Stable";
    }

    function confidenceLabel(conf) {
      if (conf >= 80) return "Strong Sprint";
      if (conf >= 60) return "Balanced";
      return "Fragile";
    }

    function render() {
      const setup = loadSetup();

      const detected = [
        ["sprintDays", setup.sprintDays],
        ["teamMembers", setup.teamMembers],
        ["leaveDays", setup.leaveDays],
        ["committedSP", setup.committedSP],
        ["v1", setup.v1],
        ["v2", setup.v2],
        ["v3", setup.v3]
      ]
      .filter(([k,v]) => v !== "" && v !== null && v !== undefined)
      .map(([k,v]) => `${k}: ${v}`)
      .join(" • ");

      $("inputsDetected").textContent = detected || "No setup found. Go to 🚀 Setup and Save.";

      const s = computeSignals(setup);

      $("riskScore").textContent = Number.isFinite(s.riskScore) ? s.riskScore : "—";
      $("riskBand").textContent = band(Number(s.riskScore || 0));

      $("confidence").textContent = Number.isFinite(s.confidence) ? s.confidence : "—";
      $("confidenceLabel").textContent = confidenceLabel(Number(s.confidence || 0));

      $("health").textContent = s.capacityHealth || "—";
      $("capacityNote").textContent = s.capacitySP
        ? `Capacity ≈ ${Math.round(s.capacitySP)} SP`
        : "Capacity unavailable";

      return s;
    }

    function saveSnapshot(signals){
      const history = window.Scrummer && window.Scrummer.history;
      if (!history || typeof history.saveSnapshot !== "function") {
        showToast("⚠️ history.js not loaded — snapshot not saved.");
        return;
      }

      const before = history.getHistory ? (history.getHistory() || []).length : null;

      history.saveSnapshot({
        riskScore: Number(signals.riskScore ?? 0),
        confidence: Number(signals.confidence ?? 0),
        overcommitRatio: Number(signals.overcommitRatio ?? 0),
        avgVelocity: Number(signals.avgVelocity ?? 0),
        committedSP: Number(signals.committedSP ?? 0),
        capacitySP: Number(signals.capacitySP ?? 0)
      });

      const after = history.getHistory ? (history.getHistory() || []).length : null;

      if (before !== null && after !== null && after === before) {
        showToast("ℹ️ Snapshot skipped (saved recently — 60s duplicate protection).");
      } else {
        showToast("✅ Snapshot saved. Open 🛡️ Health to see trends.");
      }
    }

    render();

    $("refreshAndSaveBtn")?.addEventListener("click", () => {
      const s = render();
      saveSnapshot(s);
    });

  })();
  

(() => {
  const PREFIX = "health_";
  const $ = (id) => document.getElementById(PREFIX + id);

  function toast(msg){
    const el = $("toast");
    if (!el) return;
    el.style.display = "block";
    el.innerHTML = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = "none"; }, 2800);
  }

  function fmtWhen(ts){
    try {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2,"0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return "—"; }
  }

  function emojiMode(mode){
    const m = String(mode || "").toLowerCase();
    if (m === "rescue") return "🔴 Rescue";
    if (m === "watch")  return "🟡 Watch";
    return "🟢 Stable";
  }

  function clamp01(x){
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function stddev(arr){
    const xs = (arr || []).map(Number).filter(n => Number.isFinite(n));
    if (xs.length < 2) return 0;
    const mean = xs.reduce((a,b)=>a+b,0)/xs.length;
    const v = xs.reduce((acc,x)=>acc + (x-mean)*(x-mean), 0)/xs.length;
    return Math.sqrt(v);
  }

  function trendDir(a, b){
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "flat";
    if (a > b) return "up";
    if (a < b) return "down";
    return "flat";
  }

  function arrow(dir, positiveUp=true){
    if (dir === "flat") return "—";
    if (positiveUp) return dir === "up" ? "▲" : "▼";
    return dir === "up" ? "▼" : "▲";
  }

  function computeOvercommitStreak(history){
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const over = Number(history[i].overcommitRatio ?? 0);
      if (over > 1.01) streak++;
      else break;
    }
    return streak;
  }

  function computePredictability(history){
    const last5 = history.slice(-5);
    const vels = last5.map(x => Number(x.avgVelocity ?? 0)).filter(n => n > 0);
    if (vels.length < 2) return { score: "—", hint: "Need 2+ velocity snapshots." };

    const mean = vels.reduce((a,b)=>a+b,0)/vels.length;
    const sd = stddev(vels);
    const cv = mean > 0 ? sd/mean : 0;

    if (cv <= 0.10) return { score: "🟢 High", hint: "Velocity is consistent (low volatility)." };
    if (cv <= 0.25) return { score: "🟡 Medium", hint: "Some volatility. Slicing + WIP control helps." };
    return { score: "🔴 Low", hint: "High volatility. Predictability will suffer." };
  }

  function computeStabilityIndex(history){
    const last = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;

    const riskLast = Number(last?.riskScore ?? 0);
    const confLast = Number(last?.confidence ?? 0);

    let trendScore = 0.5;
    if (prev) {
      const dir = trendDir(Number(prev.riskScore ?? 0), riskLast);
      trendScore = dir === "up" ? 0.2 : dir === "down" ? 0.8 : 0.5;
    }

    const over = Number(last?.overcommitRatio ?? 0);
    const overScore = over <= 1 ? 1 : over <= 1.15 ? 0.6 : 0.2;

    const confScore = clamp01(confLast / 100);

    const idx =
      (0.45 * clamp01(1 - (riskLast/100))) +
      (0.25 * trendScore) +
      (0.20 * overScore) +
      (0.10 * confScore);

    const pctIdx = Math.round(idx * 100);

    let label = "🟢 Stable";
    if (pctIdx < 45) label = "🔴 Fragile";
    else if (pctIdx < 70) label = "🟡 Watch";

    return { pctIdx, label };
  }

  function buildNarrative(history){
    if (!history.length) {
      return `No sprint history yet. Open <b>Insights</b> and click
              <b>Refresh + Save Snapshot</b> once to create your first snapshot.`;
    }

    const last = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;

    const risk = Number(last.riskScore ?? 0);
    const conf = Number(last.confidence ?? 0);
    const over = Number(last.overcommitRatio ?? 0);
    const cap = Number(last.capacitySP ?? 0);
    const com = Number(last.committedSP ?? 0);

    const lines = [];
    lines.push(`<b>Current sprint posture:</b> ${emojiMode(last.mode)} with risk <b>${risk}/100</b> and confidence <b>${conf}%</b>.`);

    if (over > 1.01) {
      const pctOver = Math.round((over - 1) * 100);
      lines.push(`Commitment is above capacity by approximately <b>${pctOver}%</b>. This is a system signal (scope vs capacity), not an individual performance issue.`);
    } else if (cap > 0 && com > 0) {
      lines.push(`Commitment is broadly aligned with capacity. This supports predictability and lowers spillover risk.`);
    } else {
      lines.push(`Add committed SP and velocities in Setup to strengthen the explanation engine.`);
    }

    if (prev) {
      const riskPrev = Number(prev?.riskScore ?? NaN);
      const capPrev  = Number(prev?.capacitySP ?? NaN);
      const comPrev  = Number(prev?.committedSP ?? NaN);

      const riskDir = trendDir(riskPrev, risk);
      const capDir  = trendDir(capPrev, cap);
      const comDir  = trendDir(comPrev, com);

      lines.push(`<b>Trend vs previous snapshot:</b> Risk ${arrow(riskDir, false)}, Capacity ${arrow(capDir, true)}, Commitment ${arrow(comDir, true)}.`);
    }

    if (risk >= 70) lines.push(`Recommended stance: protect the sprint goal, de-scope early, and run daily unblock checkpoints.`);
    else if (risk >= 40) lines.push(`Recommended stance: run a Day-3 checkpoint and keep WIP low to protect predictability.`);
    else lines.push(`Recommended stance: maintain flow discipline and keep scope changes visible and explicit.`);

    return lines.join("<br/>");
  }

  function renderTable(history){
    const tbody = $("historyRows");
    if (!tbody) return;

    const last5 = history.slice(-5).reverse();

    if (!last5.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:10px; color:var(--text-muted);">
        No history yet. Go to Insights → <b>Refresh + Save Snapshot</b>.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = last5.map(s => {
      const over = Number(s.overcommitRatio ?? 0);
      const overPct = over > 0 ? Math.round((over - 1) * 100) : 0;
      const overText = (over <= 0) ? "—" : (over <= 1 ? "OK" : `+${Math.max(0, overPct)}%`);

      return `
        <tr>
          <td style="padding:10px 6px; border-top:1px solid var(--border);">${fmtWhen(s.timestamp)}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);">${emojiMode(s.mode)}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);" align="right">${Number(s.riskScore ?? 0)}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);" align="right">${Number(s.confidence ?? 0)}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);" align="right">${Math.round(Number(s.committedSP ?? 0))}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);" align="right">${Math.round(Number(s.capacitySP ?? 0))}</td>
          <td style="padding:10px 6px; border-top:1px solid var(--border);" align="right">${overText}</td>
        </tr>
      `;
    }).join("");
  }

  function render(){
    const history = window.Scrummer?.history?.getHistory?.() || [];

    if (!history.length) {
      $("stabilityIndex") && ($("stabilityIndex").textContent = "—");
      $("stabilityLabel") && ($("stabilityLabel").textContent = "No data yet");
      $("latestMode") && ($("latestMode").textContent = "—");
      $("latestModeHint") && ($("latestModeHint").textContent = "Open Insights to create a snapshot.");
      $("overcommitStreak") && ($("overcommitStreak").textContent = "—");
      $("overcommitHint") && ($("overcommitHint").textContent = "No data yet");
      $("predictability") && ($("predictability").textContent = "—");
      $("predictabilityHint") && ($("predictabilityHint").textContent = "Need snapshots.");
      $("narrative") && ($("narrative").innerHTML = buildNarrative(history));
      renderTable(history);
      return;
    }

    const st = computeStabilityIndex(history);
    $("stabilityIndex") && ($("stabilityIndex").textContent = `${st.pctIdx}`);
    $("stabilityLabel") && ($("stabilityLabel").textContent = st.label);

    const last = history[history.length - 1];
    $("latestMode") && ($("latestMode").textContent = emojiMode(last.mode));
    $("latestModeHint") && ($("latestModeHint").textContent = `Latest snapshot: ${fmtWhen(last.timestamp)}`);

    const streak = computeOvercommitStreak(history);
    $("overcommitStreak") && ($("overcommitStreak").textContent = `${streak}`);
    $("overcommitHint") && ($("overcommitHint").textContent =
      (streak >= 2 ? "Pattern: commitment > capacity repeatedly."
        : streak === 1 ? "Overcommit detected in latest sprint."
        : "No overcommit streak.")
    );

    const pred = computePredictability(history);
    $("predictability") && ($("predictability").textContent = pred.score);
    $("predictabilityHint") && ($("predictabilityHint").textContent = pred.hint);

    $("narrative") && ($("narrative").innerHTML = buildNarrative(history));
    renderTable(history);
  }

  // ---- Premium safe "double click to confirm" for destructive action ----
  function confirmBySecondClick(btnEl, label1, label2, windowMs=2500){
    if(!btnEl) return false;
    const now = Date.now();
    const last = Number(btnEl.dataset.confirmTs || 0);
    if (now - last < windowMs) {
      btnEl.dataset.confirmTs = "0";
      btnEl.textContent = label1;
      return true;
    }
    btnEl.dataset.confirmTs = String(now);
    btnEl.textContent = label2;
    toast("⚠️ Click again to confirm.");
    setTimeout(() => {
      if (Number(btnEl.dataset.confirmTs || 0) === now) {
        btnEl.dataset.confirmTs = "0";
        btnEl.textContent = label1;
      }
    }, windowMs);
    return false;
  }

  // Buttons: support both ids (header + footer)
  const refreshBtnA = $("refreshHealthBtn");
  const refreshBtnB = $("refreshHealthBtn2");

  function onRefresh(){
    render();
    toast("✅ Refreshed health view");
  }

  refreshBtnA?.addEventListener("click", onRefresh);
  refreshBtnB?.addEventListener("click", onRefresh);

  $("newSprintBtn")?.addEventListener("click", () => {
    const id = window.Scrummer?.history?.resetCurrentSprint?.();
    render();
    toast(`🆕 New sprint started: <b>${id || "OK"}</b>. Now open Insights → <b>Refresh + Save Snapshot</b>.`);
  });

  $("clearHistoryBtn")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!confirmBySecondClick(btn, "🧹 Clear History", "⚠️ Confirm Clear")) return;

    window.Scrummer?.history?.clearHistory?.();
    render();
    toast("🧹 Cleared local sprint history");
  });

  render();
})();


    // Mirror button (so footer refresh works even if health.js binds only one id)
    (function(){
  const PREFIX = "health_";
  const $ = (id) => document.getElementById(PREFIX + id);

      const a = document.getElementById("refreshHealthBtn");
      const b = document.getElementById("refreshHealthBtn2");
      if(a && b){
        b.addEventListener("click", () => a.click());
      }
    })();
  


    (function () {
  const PREFIX = "actions_";
  const $ = (id) => document.getElementById(PREFIX + id);

      const STORAGE_KEY = "scrummer_setup_v1";
      const wrap = document.getElementById("actionsWrap");

      function loadSetup() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
        catch { return {}; }
      }

      function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

      function computeFallback(setup) {
        const sprintDays = num(setup.sprintDays) ?? 0;
        const teamMembers = num(setup.teamMembers) ?? 0;
        const leaveDays = num(setup.leaveDays) ?? 0;
        const committedSP = num(setup.committedSP) ?? 0;

        const v1 = num(setup.v1) ?? 0, v2 = num(setup.v2) ?? 0, v3 = num(setup.v3) ?? 0;
        const velocities = [v1, v2, v3].filter(x => x > 0);
        const avgVel = velocities.length ? velocities.reduce((a,b)=>a+b,0) / velocities.length : 0;

        let vol = 0;
        if (velocities.length >= 2 && avgVel > 0) {
          const variance = velocities.reduce((acc,x)=>acc + (x-avgVel)*(x-avgVel), 0) / velocities.length;
          vol = Math.sqrt(variance) / avgVel;
        }

        const teamDays = Math.max(1, sprintDays * Math.max(1, teamMembers));
        const leaveRatio = Math.min(0.6, Math.max(0, leaveDays / teamDays));
        const capacitySP = avgVel * (1 - leaveRatio);

        const overcommitRatio = capacitySP > 0 ? committedSP / capacitySP : 0;

        let risk = 0;
        if (committedSP <= 0 || avgVel <= 0) risk += 30;
        if (overcommitRatio > 1) risk += Math.min(50, (overcommitRatio - 1) * 120);
        risk += Math.min(30, vol * 80);
        risk = Math.max(0, Math.min(100, Math.round(risk)));

        const confidence = Math.max(10, Math.min(95, Math.round(100 - risk)));

        return { riskScore:risk, confidence, capacitySP, overcommitRatio, vol };
      }

      function hasMinimumSetup(setup) {
        const sprintDaysOK = Number(setup.sprintDays) > 0;
        const teamOK = Number(setup.teamMembers) > 0;
        const committedOK = setup.committedSP !== undefined && setup.committedSP !== null && setup.committedSP !== "";
        const vCount = [Number(setup.v1)||0, Number(setup.v2)||0, Number(setup.v3)||0].filter(x => x > 0).length;
        return sprintDaysOK && teamOK && committedOK && vCount >= 1;
      }

      function card(title, why, how, tier) {
        const el = document.createElement("div");
        el.className = "info-banner";
        el.innerHTML = `
          <div class="kvKey" style="font-size:16px;">${tier} ${title}</div>

          <div style="margin-top:10px; font-weight:650;">Why</div>
          <div class="mutedText" style="margin-top:4px; white-space:pre-line; line-height:1.7;">${why}</div>

          <div style="margin-top:12px; font-weight:650;">How</div>
          <div class="mutedText" style="margin-top:4px; white-space:pre-line; line-height:1.7;">${how}</div>
        `;
        return el;
      }

      function render() {
        wrap.innerHTML = "";
        const setup = loadSetup();

        const compute = window.Scrummer && window.Scrummer.computeSignals;
        let s = null;
        if (typeof compute === "function") {
          try { s = compute(setup || {}); } catch { s = null; }
        }
        if (!s) s = computeFallback(setup || {});

        if (!hasMinimumSetup(setup)) {
          wrap.appendChild(card(
            "Setup first",
            "Actions depend on sprint days, team size, committed SP, and at least 1 past velocity.",
            "Go to 🚀 Setup → fill inputs → Save Setup.\nThen open Insights → Refresh + Save Snapshot.\nCome back here and Refresh Actions.",
            "⚠️"
          ));
          return;
        }

        const risk = Number(s.riskScore ?? 0);
        const conf = Number(s.confidence ?? 0);
        const over = Number(s.overcommitRatio ?? 0);
        const vol = Number(s.vol ?? 0);
        const cap = Number(s.capacitySP ?? 0);
        const committed = Number(num(setup.committedSP) ?? 0);

        if (over > 1.05) {
          const pct = Math.round((over - 1) * 100);
          wrap.appendChild(card(
            "De-scope or renegotiate commitment",
            `Commitment is above capacity by ~${pct}%. This is the #1 spillover driver.`,
            `Move 10–20% scope into Stretch.\nSplit the biggest story into must-have vs nice-to-have.\nMake scope changes explicit (no silent creep).`,
            "⭐ P0"
          ));
        }

        if (cap && committed && committed > cap) {
          wrap.appendChild(card(
            "Fix capacity mismatch",
            `Committed (${committed}) is above capacity (~${Math.round(cap)}).`,
            `Reconfirm leave + interrupts.\nReserve a buffer lane for support.\nReduce scope until committed ≤ capacity.`,
            "⭐ P0"
          ));
        }

        if (vol >= 0.30) {
          wrap.appendChild(card(
            "Reduce volatility (slice smaller)",
            `Recent delivery is volatile. Predictability will suffer.`,
            `Slice stories into 1–2 day pieces.\nFinish-first rule.\nLimit WIP (start less, finish more).`,
            "🏅 P1"
          ));
        }

        if (conf < 60) {
          wrap.appendChild(card(
            "Add a mid-sprint checkpoint",
            `Confidence is below 60%. Run an early reality check.`,
            `Day-3 checkpoint:\n- If behind → de-scope fast\n- If on track → pull stretch carefully`,
            "🏅 P1"
          ));
        }

        if (!wrap.children.length) {
          const tier = risk >= 70 ? "🔴" : risk >= 40 ? "🟡" : "🟢";
          wrap.appendChild(card(
            "Maintain flow",
            `Signals look stable.\nCurrent risk tier: ${tier}`,
            `Protect focus time.\nKeep WIP low.\nReview scope changes daily.\nCelebrate wins in Review.`,
            "🎮 P2"
          ));
        }
      }

      document.getElementById("refreshBtn")?.addEventListener("click", render);
      render();
    })();
  


    (function () {
      const STORAGE_KEY = "scrummer_setup_v1";

      // ✅ history-based notes
      const NOTES_KEY   = "scrummer_copilot_notes_v2";

      // ✅ anti-repeat prompt variation
      const VAR_KEY     = "scrummer_copilot_variant_v1";

      const PREFIX = "copilot_";
  const $ = (id) => document.getElementById(PREFIX + id);

      const panelTitle = $("panelTitle");
      const panelBody  = $("panelBody");
      const notes      = $("decisionNotes");

      const modeBanner = $("modeBanner");
      const modeTitle  = $("modeTitle");
      const modeBody   = $("modeBody");

      const saveStatus = $("saveStatus");
      const saveHint   = $("saveHint");

      let activeKey = null;

      function safeParse(str, fallback){
        try { return JSON.parse(str); } catch { return fallback; }
      }

      function loadSetup(){
        return safeParse(localStorage.getItem(STORAGE_KEY) || "{}", {});
      }

      function num(v){
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }

      function round2(n){ return Math.round((Number(n)||0) * 100) / 100; }

      // -------------------------
      // Context builder
      // -------------------------
      function buildContext(setup){
        const sprintDays  = num(setup.sprintDays);
        const teamMembers = num(setup.teamMembers);
        const leaveDays   = num(setup.leaveDays);
        const committedSP = num(setup.committedSP);

        const v1 = num(setup.v1), v2 = num(setup.v2), v3 = num(setup.v3);
        const velocities = [v1,v2,v3].filter(x => x > 0);
        const avgVel = velocities.length ? velocities.reduce((a,b)=>a+b,0) / velocities.length : 0;

        const teamDays = Math.max(1, sprintDays * Math.max(1, teamMembers));
        const leaveRatio = Math.min(0.6, Math.max(0, leaveDays / teamDays));
        const capacitySP = avgVel * (1 - leaveRatio);

        const over = capacitySP > 0 ? (committedSP / capacitySP) : 0;
        const overPct = over > 0 ? Math.round((over - 1) * 100) : 0;

        return {
          sprintDays, teamMembers, leaveDays, committedSP,
          v1, v2, v3, avgVel,
          capacitySP,
          over,
          overPct
        };
      }

      function computeRisk(setup){
        const c = buildContext(setup);
        let risk = 0;

        if (c.committedSP <= 0 || c.avgVel <= 0) risk += 30;
        if (c.over > 1) risk += Math.min(50, (c.over - 1) * 120);

        return Math.max(0, Math.min(100, Math.round(risk)));
      }

      function modeFromRisk(risk){
        if (risk >= 70) return "rescue";
        if (risk >= 40) return "watch";
        return "stable";
      }

      // ✅ Mode banner without “recommended”
      function renderMode(mode, risk, ctx){
        modeBanner.style.display = "block";

        const map = {
          rescue: { icon:"🔴", label:"Rescue", msg:"This sprint looks fragile. Copilot will push de-scope, daily control, and fast escalation." },
          watch:  { icon:"🟡", label:"Watchlist", msg:"This sprint is tight. Copilot will focus on commitment discipline + early checkpoints." },
          stable: { icon:"🟢", label:"Stable", msg:"Signals look stable. Copilot will optimize flow + reduce WIP." }
        };

        const m = map[mode] || map.stable;

        const ctxLine = (ctx.avgVel > 0 && ctx.committedSP > 0)
          ? `Avg velocity ~${round2(ctx.avgVel)} SP. Capacity est ~${round2(ctx.capacitySP)} SP.`
          : `Add velocities + committed SP in Setup to unlock stronger guidance.`;

        modeTitle.textContent = `${m.icon} Copilot Mode: ${m.label} (Risk ${risk}/100)`;
        modeBody.textContent  = `${m.msg} ${ctxLine}`;
      }

      // -------------------------
      // Anti-repeat variation engine
      // -------------------------
      function getVariantState(){
        return safeParse(localStorage.getItem(VAR_KEY) || "{}", {});
      }
      function setVariantState(obj){
        localStorage.setItem(VAR_KEY, JSON.stringify(obj || {}));
      }

      function pickVariantIndex(key, total, force=false){
        const state = getVariantState();
        const last = Number(state[key] ?? -1);

        let idx = Math.floor(Math.random() * total);
        if (total > 1 && idx === last) idx = (idx + 1) % total;
        if (force && total > 1 && idx === last) idx = (idx + 1) % total;

        state[key] = idx;
        setVariantState(state);
        return idx;
      }

      // -------------------------
      // Retro selector: template + icebreaker based on insights
      // -------------------------
      function retroRecommendation(ctx, mode, force=false){
        const overCommit = ctx.over > 1.05;
        const lowData = !(ctx.avgVel > 0 && ctx.committedSP > 0);

        const templates = [];

        if (mode === "rescue" || overCommit) {
          templates.push({
            name: "Reset & Recovery (Stop the bleeding)",
            why: "Use when the sprint slipped, commitment was too high, or the team feels overloaded. Focus on system fixes, not blame.",
            stages: defaultRetroStages(),
            icebreakers: [
              "One-word check-in (no explanations)",
              "Weather report: sunny / cloudy / stormy",
              "Energy level (1–5) + one sentence why"
            ]
          });
        }

        if (mode === "watch") {
          templates.push({
            name: "Flow & WIP Clinic",
            why: "Use when predictability is shaky. This retro focuses on finishing, reducing WIP, and removing queues/hand-offs.",
            stages: defaultRetroStages(),
            icebreakers: [
              "Mad / Sad / Glad (quick round)",
              "Rose / Bud / Thorn",
              "Two truths and a lie (work edition)"
            ]
          });

          templates.push({
            name: "Interruptions & Shielding",
            why: "Use when unplanned work or urgent asks keep entering the sprint. Create a shield + escalation policy.",
            stages: defaultRetroStages(),
            icebreakers: [
              "What surprised you this sprint?",
              "Emoji check-in: 😀😐😣",
              "Lightning gratitude (30 seconds each)"
            ]
          });
        }

        if (mode === "stable") {
          templates.push({
            name: "Amplify Wins (Kaizen)",
            why: "Use when delivery is stable. Lock in what worked, and pick one improvement that raises the baseline.",
            stages: defaultRetroStages(),
            icebreakers: [
              "Gratitude shout-outs",
              "Best moment of the sprint",
              "One thing I’d repeat next sprint"
            ]
          });

          templates.push({
            name: "Quality Loop (Reduce rework)",
            why: "Use when you want to improve Definition of Done, reduce bug/rework, and speed up validation.",
            stages: defaultRetroStages(),
            icebreakers: [
              "Mad / Sad / Glad",
              "Rose / Bud / Thorn",
              "One word: how did quality feel?"
            ]
          });
        }

        if (!templates.length || lowData) {
          templates.push({
            name: "Start / Stop / Continue (Universal)",
            why: "Great default when data is missing or the team is new. Keeps the retro simple and productive.",
            stages: defaultRetroStages(),
            icebreakers: [
              "One-word check-in",
              "Weather report",
              "Rose / Bud / Thorn"
            ]
          });
        }

        const tIdx = pickVariantIndex(`retroTemplate:${mode}`, templates.length, force);
        const t = templates[tIdx];

        const ibIdx = pickVariantIndex(`retroIce:${t.name}`, t.icebreakers.length, force);
        const ice = t.icebreakers[ibIdx];

        return { template: t, icebreaker: ice };
      }

      function defaultRetroStages(){
        return [
          { stage: "1) Set the stage (5 min)", detail: "Working agreement: assume positive intent, focus on system not blame. State the goal for today." },
          { stage: "2) Gather data (10–15 min)", detail: "Use the chosen format. Timebox. Capture facts + feelings briefly." },
          { stage: "3) Generate insights (10 min)", detail: "Cluster themes. Dot-vote. Pick top 1–2 only." },
          { stage: "4) Decide actions (10–15 min)", detail: "Turn into 1–2 experiments: owner + date + success measure." },
          { stage: "5) Close (2–3 min)", detail: "Appreciations + confirm who will track experiments." },
          { stage: "Rule", detail: "Retro without owners + check date = theatre. Keep it real." }
        ];
      }

      // -------------------------
      // Prompt bank (multiple variants per ceremony+mode)
      // -------------------------
      function getPromptsHTML(ceremony, mode, ctx, forceRefresh=false){
        const key = `${ceremony}:${mode}`;
        const banks = buildPromptBanks(ctx, mode, forceRefresh);

        const variants = (banks[ceremony] && banks[ceremony][mode]) ? banks[ceremony][mode] : null;
        if (!variants || !variants.length) return `<div>Select a ceremony.</div>`;

        const idx = pickVariantIndex(key, variants.length, forceRefresh);
        return variants[idx];
      }

      function buildPromptBanks(ctx, mode, forceRefresh){
        const capLine = (ctx.avgVel > 0)
          ? `Context: avg velocity ~<b>${round2(ctx.avgVel)}</b> SP, capacity est ~<b>${round2(ctx.capacitySP)}</b> SP, committed <b>${round2(ctx.committedSP)}</b> SP.`
          : `Context: add velocities + committed SP in Setup for sharper prompts.`;

        const overLine = (ctx.over > 1.05)
          ? `You look overcommitted by ~<b>${Math.max(0, ctx.overPct)}%</b>. Treat this as a de-scope trigger.`
          : `Keep commitment disciplined: protect flow and avoid silent scope creep.`;

        const retroRec = retroRecommendation(ctx, mode, forceRefresh);
        const retroStagesHTML = retroRec.template.stages.map(s =>
          `<li><b>${s.stage}:</b> ${s.detail}</li>`
        ).join("");

        const planningMustNotMiss = `
          <div style="margin-top:10px;"><b>✅ Planning: steps no one should miss</b></div>
          <ol style="margin-top:8px;">
            <li><b>Sprint Goal first</b> (1 sentence outcome, not a list of tickets)</li>
            <li><b>Capacity reality</b> (team, leaves, interruptions buffer)</li>
            <li><b>Forecast vs Commit</b> (explicit Must-have + Stretch)</li>
            <li><b>Risks + Dependencies upfront</b> (top 3 + owners + escalation)</li>
            <li><b>Slice big work</b> (reduce batch size, 1–2 day chunks)</li>
            <li><b>Definition of Done</b> (quality gates, test expectations)</li>
            <li><b>Plan day 1–3</b> (who starts what; finish-first rule)</li>
          </ol>
        `;

        const dailyPurpose = `
          <div><b>🎯 Purpose of Daily Scrum</b></div>
          <div style="margin-top:6px; color:var(--text-muted);">
            Daily Scrum is not status reporting. It’s a <b>15-minute plan</b> to move toward the <b>Sprint Goal</b>.
          </div>

          <div style="margin-top:10px;"><b>🧩 The “stay-on-purpose” script</b></div>
          <ol style="margin-top:8px;">
            <li><b>Are we on track for the Sprint Goal today?</b></li>
            <li><b>What is the biggest blocker/risk right now?</b></li>
            <li><b>What will we finish today (by name)?</b></li>
          </ol>

          <div style="margin-top:10px;"><b>🚫 Anti-patterns</b></div>
          <ul style="margin-top:8px;">
            <li>Status reporting to Scrum Master/manager</li>
            <li>Problem solving inside the meeting (take offline)</li>
            <li>Jira micro-updates on every ticket</li>
            <li>Starting more work without finishing</li>
          </ul>

          <div style="margin-top:10px;"><b>🛡️ Guardrails</b></div>
          <ul style="margin-top:8px;">
            <li><b>60-second rule:</b> If discussion &gt; 60 seconds → park it → take offline</li>
            <li><b>WIP check:</b> Ask “what finishes today?” before “what starts today?”</li>
          </ul>
        `;

        return {
          planning: {
            stable: [
              `
                <div><b>🗺️ Planning (Stable) — value + flow</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                <ul>
                  <li><b>Sprint Goal:</b> What user outcome are we shipping?</li>
                  <li><b>Must vs Stretch:</b> Pick top 3 must-haves, mark stretch clearly.</li>
                  <li><b>Flow:</b> Who pairs on the riskiest story? What finishes first?</li>
                  <li><b>Guardrail:</b> What do we stop doing if scope creeps?</li>
                </ul>
                ${planningMustNotMiss}
              `
            ],
            watch: [
              `
                <div><b>⚠️ Planning (Watchlist) — capacity reality check</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                <div style="margin-top:6px;">${overLine}</div>
                <ul>
                  <li><b>De-scope now:</b> Move 10–15% into stretch immediately.</li>
                  <li><b>Day-3 checkpoint:</b> If behind → de-scope fast.</li>
                  <li><b>WIP limit:</b> Agree a WIP cap for the sprint.</li>
                  <li><b>Risks + owners:</b> Top 3 risks + escalation path.</li>
                </ul>
                ${planningMustNotMiss}
              `
            ],
            rescue: [
              `
                <div><b>🚨 Planning (Rescue) — survival plan</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                <div style="margin-top:6px;">${overLine}</div>
                <ul>
                  <li><b>Cut scope today:</b> Remove 15–25% immediately. Commit only to the goal.</li>
                  <li><b>Freeze churn:</b> No new work unless the goal is safe.</li>
                  <li><b>Escalations:</b> What must be escalated before noon?</li>
                  <li><b>Daily control:</b> Define checkpoint owner.</li>
                </ul>
                ${planningMustNotMiss}
              `
            ]
          },

          daily: {
            stable: [
              `
                <div><b>🧩 Daily (Stable)</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                ${dailyPurpose}
              `
            ],
            watch: [
              `
                <div><b>🟡 Daily (Watchlist)</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                <div style="margin-top:6px;">${overLine}</div>
                ${dailyPurpose}
              `
            ],
            rescue: [
              `
                <div><b>🔴 Daily (Rescue)</b></div>
                <div style="margin-top:6px; color:var(--text-muted);">${capLine}</div>
                <div style="margin-top:6px;">${overLine}</div>
                ${dailyPurpose}
              `
            ]
          },

          refine: {
            stable: [
              `
                <div><b>🧠 Refinement (Stable)</b></div>
                <ul>
                  <li><b>Slicing:</b> Break stories into 1–2 day chunks.</li>
                  <li><b>AC clarity:</b> Are acceptance criteria unambiguous?</li>
                  <li><b>Dependencies:</b> Identify + remove early.</li>
                  <li><b>Ready checklist:</b> Confirm Definition of Ready.</li>
                </ul>
              `
            ],
            watch: [
              `
                <div><b>🧠 Refinement (Watchlist)</b></div>
                <div style="margin-top:6px;">${overLine}</div>
                <ul>
                  <li><b>Kill ambiguity:</b> Missing AC? Add now.</li>
                  <li><b>Stop big stories:</b> Slice anything &gt; 2–3 days.</li>
                  <li><b>Dependency removal:</b> What can we remove today?</li>
                </ul>
              `
            ],
            rescue: [
              `
                <div><b>🧠 Refinement (Rescue)</b></div>
                <div style="margin-top:6px;">${overLine}</div>
                <ul>
                  <li><b>No big stories:</b> Stop anything &gt; 2–3 days entering sprint.</li>
                  <li><b>De-risk:</b> Remove dependencies before planning.</li>
                  <li><b>Safest scope:</b> Default to minimum viable sprint goal.</li>
                </ul>
              `
            ]
          },

          review: {
            stable: [
              `
                <div><b>🎬 Review (Stable)</b></div>
                <ul>
                  <li><b>Value:</b> What changed for users?</li>
                  <li><b>Feedback:</b> What should we adjust next?</li>
                  <li><b>Surprises:</b> What surprised us in scope/time?</li>
                  <li><b>Follow-ups:</b> Capture owners + dates.</li>
                </ul>
              `
            ],
            watch: [
              `
                <div><b>🎬 Review (Watchlist)</b></div>
                <ul>
                  <li><b>Not shipped:</b> What didn’t ship and why (system factors)?</li>
                  <li><b>Commitment:</b> Was commitment too high?</li>
                  <li><b>Time loss:</b> Where did we lose time?</li>
                  <li><b>One change:</b> Improve predictability next sprint.</li>
                </ul>
              `
            ],
            rescue: [
              `
                <div><b>🎬 Review (Rescue)</b></div>
                <ul>
                  <li><b>Root cause:</b> Why did we slip (system)?</li>
                  <li><b>Immediate change:</b> What must change now?</li>
                  <li><b>Stop doing:</b> What do we stop next sprint?</li>
                  <li><b>Escalations:</b> Owners + deadlines.</li>
                </ul>
              `
            ]
          },

          retro: {
            stable: [ buildRetroHTML(retroRec, retroStagesHTML) ],
            watch:  [ buildRetroHTML(retroRec, retroStagesHTML) ],
            rescue: [ buildRetroHTML(retroRec, retroStagesHTML) ]
          }
        };
      }

      function buildRetroHTML(retroRec, retroStagesHTML){
        return `
          <div><b>♻️ Retro — Suggested Template</b></div>
          <div style="margin-top:6px; color:var(--text-muted);">
            <b>${retroRec.template.name}</b> — ${retroRec.template.why}
          </div>

          <div style="margin-top:10px;"><b>🧊 Icebreaker (based on insights)</b></div>
          <div style="margin-top:6px;">${retroRec.icebreaker}</div>

          <div style="margin-top:10px;"><b>🧭 Stages to follow (don’t skip)</b></div>
          <ul style="margin-top:8px;">${retroStagesHTML}</ul>

          <div style="margin-top:10px;"><b>🧾 Output checklist</b></div>
          <ul style="margin-top:8px;">
            <li>1–2 experiments max</li>
            <li>Owner + due date</li>
            <li>Success measure (“we’ll know it worked if…”) </li>
          </ul>
        `;
      }

      function setButtonStates(){
        document.querySelectorAll(".cerBtn").forEach(btn => {
          const key = btn.getAttribute("data-cer");
          btn.classList.toggle("is-active", key === activeKey);
        });
      }

      function onCeremony(key, forceRefresh=false){
        const setup = loadSetup();
        const ctx = buildContext(setup);

        let risk = null;
        const compute = window.Scrummer && window.Scrummer.computeSignals;
        if (typeof compute === "function") {
          try {
            const s = compute(setup || {});
            if (s && s.riskScore !== undefined) risk = Number(s.riskScore);
          } catch {}
        }
        if (!Number.isFinite(risk)) risk = computeRisk(setup);

        const mode = modeFromRisk(risk);

        activeKey = key;
        renderMode(mode, risk, ctx);

        const titles = {
          planning: "🗺️ Sprint Planning",
          daily: "🧩 Daily Scrum",
          refine: "🧠 Refinement",
          review: "🎬 Sprint Review",
          retro: "♻️ Retro"
        };

        panelTitle.textContent = titles[key] || "Ceremony";
        panelBody.innerHTML = getPromptsHTML(key, mode, ctx, forceRefresh);

        setButtonStates();
      }

      // -------------------------
      // ✅ Decisions History (real saved items)
      // -------------------------
      function nowStamp(){
        const d = new Date();
        const pad = (n) => String(n).padStart(2,"0");
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }

      function uid(){
        return Math.random().toString(16).slice(2) + Date.now().toString(16);
      }

      function escapeHtml(s){
        return String(s || "")
          .replaceAll("&","&amp;")
          .replaceAll("<","&lt;")
          .replaceAll(">","&gt;")
          .replaceAll('"',"&quot;")
          .replaceAll("'","&#039;");
      }

      function loadDecisionHistory(){
        const arr = safeParse(localStorage.getItem(NOTES_KEY) || "[]", []);
        return Array.isArray(arr) ? arr : [];
      }

      function saveDecisionHistory(arr){
        localStorage.setItem(NOTES_KEY, JSON.stringify(arr || []));
      }

      function renderDecisionHistory(){
        const list = $("decisionsList");
        const empty = $("decisionsEmpty");
        if(!list || !empty) return;

        const arr = loadDecisionHistory();

        if(!arr.length){
          empty.style.display = "block";
          list.innerHTML = "";
          return;
        }

        empty.style.display = "none";

        list.innerHTML = arr.slice().reverse().map(item => {
          const title = item.ceremony ? item.ceremony.toUpperCase() : "NOTE";
          const stamp = item.updatedAt || "";
          const text  = (item.text || "").trim();

          return `
            <div class="info-banner" style="padding:12px;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div>
                  <div style="font-weight:650;">📝 ${escapeHtml(title)}</div>
                  <div style="color:var(--text-muted); font-weight:450; margin-top:2px;">${escapeHtml(stamp)}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btnGhost" type="button" data-act="load" data-id="${escapeHtml(item.id)}" style="padding:8px 10px;">Open</button>
                  <button class="btnGhost" type="button" data-act="copy" data-id="${escapeHtml(item.id)}" style="padding:8px 10px;">Copy</button>
                  <button class="btnGhost" type="button" data-act="del"  data-id="${escapeHtml(item.id)}" style="padding:8px 10px;">Delete</button>
                </div>
              </div>

              <div style="margin-top:10px; color:var(--text-main); font-weight:450; white-space:pre-wrap; line-height:1.6;">
                ${escapeHtml(text) || "<span style='color:var(--text-muted)'>—</span>"}
              </div>
            </div>
          `;
        }).join("");

        list.querySelectorAll("button[data-act]").forEach(btn => {
          btn.addEventListener("click", () => {
            const act = btn.getAttribute("data-act");
            const id  = btn.getAttribute("data-id");
            const arr = loadDecisionHistory();
            const item = arr.find(x => x.id === id);
            if(!item) return;

            if(act === "load"){
              notes.value = item.text || "";
              saveStatus.textContent = "🟢 Loaded from history";
              saveHint.textContent = `Loaded note from ${item.updatedAt || ""}`;
              return;
            }

            if(act === "copy"){
              navigator.clipboard?.writeText(item.text || "");
              saveStatus.textContent = "✅ Copied";
              saveHint.textContent = "Copied decision text to clipboard.";
              return;
            }

            if(act === "del"){
              const next = arr.filter(x => x.id !== id);
              saveDecisionHistory(next);
              renderDecisionHistory();
              saveStatus.textContent = "🗑️ Deleted";
              saveHint.textContent = "Removed from saved decisions.";
              return;
            }
          });
        });
      }

      $("saveBtn").addEventListener("click", () => {
        const text = (notes.value || "").trim();
        if(!text){
          saveStatus.textContent = "🟡 Nothing to save";
          saveHint.textContent = "Write a decision/risk/owner note first.";
          return;
        }

        const arr = loadDecisionHistory();
        arr.push({
          id: uid(),
          ceremony: activeKey || "",
          text,
          updatedAt: nowStamp()
        });
        saveDecisionHistory(arr);

        saveStatus.textContent = "✅ Saved";
        saveHint.textContent = `Saved to history (${arr.length} total).`;

        renderDecisionHistory();
      });

      $("clearBtn").addEventListener("click", () => {
        notes.value = "";
        saveStatus.textContent = "🟦 Cleared editor";
        saveHint.textContent = "Saved Decisions history is unchanged.";
      });

      $("newAngleBtn").addEventListener("click", () => {
        if (!activeKey) return;
        onCeremony(activeKey, true);
      });

      // ✅ SMART Copy Retro Summary (auto-extract actions, owners, dates, themes, facts)
      $("copyRetroBtn").addEventListener("click", () => {
        const setup = loadSetup();
        const ctx = buildContext(setup);
        const risk = computeRisk(setup);
        const mode = modeFromRisk(risk);

        const arr = loadDecisionHistory();

        const findLatest = (ceremony) => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if ((arr[i].ceremony || "").toLowerCase() === ceremony) return arr[i];
          }
          return null;
        };

        const latestRetro = findLatest("retro");
        const latestActive = activeKey ? findLatest(activeKey) : null;
        const best = latestRetro || latestActive || (arr.length ? arr[arr.length - 1] : null);

        const retroRec = retroRecommendation(ctx, mode, false);

        function norm(s){ return String(s || "").trim(); }

        function splitLines(text){
          return norm(text)
            .replace(/\r/g, "")
            .split("\n")
            .map(l => l.trim())
            .filter(Boolean);
        }

        function looksLikeAction(line){
          const l = line.toLowerCase();
          return (
            l.startsWith("- ") ||
            l.startsWith("•") ||
            l.startsWith("* ") ||
            l.startsWith("action") ||
            l.startsWith("decision") ||
            l.startsWith("experiment") ||
            l.startsWith("we will") ||
            l.startsWith("try ") ||
            l.includes(" owner") ||
            l.includes(" due") ||
            l.includes(" by ") ||
            l.includes(" next sprint") ||
            l.includes(" agree") ||
            l.includes(" stop ") ||
            l.includes(" start ") ||
            l.includes(" continue ")
          );
        }

        function extractOwner(line){
          const m1 = line.match(/owner\s*[:\-]\s*([A-Za-z0-9 _@.\-]+)/i);
          if (m1 && m1[1]) return m1[1].trim();

          const m2 = line.match(/@\w+/);
          if (m2) return m2[0];

          const m3 = line.match(/assigned to\s*([A-Za-z0-9 _@.\-]+)/i);
          if (m3 && m3[1]) return m3[1].trim();

          return "";
        }

        function extractDue(line){
          const m1 = line.match(/(due|by)\s*[:\-]\s*([A-Za-z0-9 ,\-\/]+)/i);
          if (m1 && m1[2]) return m1[2].trim();

          const m2 = line.match(/\b(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})\b/);
          if (m2) return m2[1];

          const m3 = line.match(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b/);
          if (m3) return m3[1];

          const m4 = line.match(/\b(mon|tue|wed|thu|fri|sat|sun)\b/i);
          if (m4) return m4[1];

          return "";
        }

        function extractMeasure(line){
          const m = line.match(/(measure|success)\s*[:\-]\s*(.+)$/i);
          return m && m[2] ? m[2].trim() : "";
        }

        function stripBullet(line){
          return line.replace(/^(\-|\*|•)\s*/,"").trim();
        }

        function pickTopThemes(lines){
          const cand = [];
          lines.forEach(l => {
            const x = l.toLowerCase();
            if (x.startsWith("theme") || x.startsWith("because") || x.startsWith("issue") || x.startsWith("problem")) cand.push(l);
          });
          return cand.slice(0,2);
        }

        function collectFacts(lines){
          const cand = [];
          lines.forEach(l => {
            const x = l.toLowerCase();
            if (
              /\d/.test(l) ||
              x.includes("shipped") ||
              x.includes("missed") ||
              x.includes("spill") ||
              x.includes("blocked") ||
              x.includes("delay") ||
              x.includes("interrupt")
            ) cand.push(l);
          });
          return cand.slice(0,4);
        }

        function buildActions(lines){
          const actions = [];

          lines.forEach(line => {
            if (!looksLikeAction(line)) return;

            const raw = stripBullet(line);
            const parts = raw.split("|").map(p => p.trim()).filter(Boolean);

            let text = parts[0] || raw;
            text = text.replace(/^(action|decision|experiment)\s*[:\-]\s*/i,"").trim();

            let owner = "";
            let due = "";
            let measure = "";

            [raw, ...parts].forEach(p => {
              owner = owner || extractOwner(p);
              due = due || extractDue(p);
              measure = measure || extractMeasure(p);
            });

            owner = owner || extractOwner(raw);
            due = due || extractDue(raw);
            measure = measure || extractMeasure(raw);

            if (!text) return;

            actions.push({ text, owner, due, measure });
          });

          const seen = new Set();
          const uniq = [];
          actions.forEach(a => {
            const k = a.text.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            uniq.push(a);
          });

          return uniq.slice(0,6);
        }

        const rawNotes = best ? (best.text || "") : "";
        const lines = splitLines(rawNotes);

        const themes = pickTopThemes(lines);
        const facts = collectFacts(lines);
        const actions = buildActions(lines);

        function fmtLine(label, value){
          return value ? `- ${label}: ${value}` : `- ${label}: —`;
        }

        const header = `# Sprint Retro Summary
Date: ${nowStamp()}
Mode: ${mode.toUpperCase()} (Risk ${risk}/100)
Template: ${retroRec.template.name}
Icebreaker: ${retroRec.icebreaker}

## Context
${fmtLine("Avg velocity", ctx.avgVel > 0 ? round2(ctx.avgVel) + " SP" : "")}
${fmtLine("Capacity est", ctx.capacitySP > 0 ? round2(ctx.capacitySP) + " SP" : "")}
${fmtLine("Committed", ctx.committedSP > 0 ? round2(ctx.committedSP) + " SP" : "")}
${fmtLine("Overcommit", ctx.over > 0 ? (ctx.over > 1 ? ("YES (~" + Math.max(0, ctx.overPct) + "%)") : "No") : "")}

## What happened (facts)
${facts.length ? facts.map(x => `- ${x}`).join("\n") : "- [Add 2–4 factual observations]"}

## Themes (top 1–2)
${themes.length ? themes.map(x => `- ${x}`).join("\n") : "- Theme 1:\n- Theme 2:"}

## Decisions / Actions (experiments)
`;

        const actionsBlock = actions.length
          ? actions.map((a, i) => {
              const owner = a.owner ? a.owner : "___";
              const due = a.due ? a.due : "___";
              const measure = a.measure ? a.measure : "___";
              return `- Experiment ${i+1}: ${a.text}\n  Owner: ${owner} | Due: ${due} | Measure: ${measure}`;
            }).join("\n")
          : `- Experiment 1: [If we do X, then Y improves]\n  Owner: ___ | Due: ___ | Measure: ___\n- Experiment 2: [Optional]\n  Owner: ___ | Due: ___ | Measure: ___`;

        const notesBlock = `
## Raw notes captured
${rawNotes.trim() ? rawNotes.trim() : "— (No saved notes yet. Paste your notes here.)"}

## Follow-up
- Check progress in: [Next Retro / Mid-sprint checkpoint]
`;

        const out = header + actionsBlock + notesBlock;

        navigator.clipboard?.writeText(out);

        saveStatus.textContent = "📋 Retro Summary copied (smart extract)";
        saveHint.textContent = rawNotes.trim()
          ? "Copied with auto-extracted actions/owners/dates where possible."
          : "Copied a ready-to-fill template (no notes found yet).";
      });

      document.querySelectorAll(".cerBtn").forEach(btn => {
        btn.addEventListener("click", () => onCeremony(btn.getAttribute("data-cer"), false));
      });

      (function boot(){
        renderDecisionHistory();
        onCeremony("daily", false);

        saveStatus.textContent = "🟡 Ready";
        saveHint.textContent = `Decisions are saved locally (key: ${NOTES_KEY}).`;
      })();

    })();
  