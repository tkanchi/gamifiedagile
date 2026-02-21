/**
 * Scrummer — Coach Addons (No Snapshots) — v10 Robust Data + Render Triggers
 * ------------------------------------------------------------------------
 * Fixes "charts empty" by:
 * 1) Loading rows from multiple storage keys + multiple shapes
 * 2) Waiting/retrying until coach-history has rendered rows
 * 3) Re-rendering on Load Demo / Save / Reset / CSV import / Autofill
 */

(() => {
  const $ = (id) => document.getElementById(id);

  // Try multiple keys because history.js versions often change this.
  const STORAGE_KEYS = [
    "scrummer_sprint_history_v1",
    "scrummer_sprint_history_v2",
    "scrummer_sprint_history",
    "scrummer_coach_history_v1",
    "scrummer_coach_history_v2",
    "scrummer_coach_history",
    "scrummer_history_v1",
  ];

  /* =============================
     Utils
  ============================== */

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function toNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function withAlpha(hexOrRgb, alpha) {
    const v = String(hexOrRgb || "").trim();
    if (/^#([0-9a-f]{6})$/i.test(v)) {
      const hex = v.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return v;
  }

  function theme() {
    const textMain =
      cssVar("--text-main", "") ||
      cssVar("--text-strong", "") ||
      "rgba(15,23,42,0.92)";

    const textDim =
      cssVar("--text-muted", "") ||
      "rgba(100,116,139,0.92)";

    const borderSoft =
      cssVar("--border-soft", "") ||
      cssVar("--border", "") ||
      "rgba(148,163,184,0.35)";

    const grid =
      cssVar("--grid-soft", "") ||
      "rgba(148,163,184,0.18)";

    return {
      textMain,
      textDim,
      borderSoft,
      grid,
      indigo: cssVar("--indigo", "#6366f1"),
      green: cssVar("--green", "#22c55e"),
      red: cssVar("--red", "#ef4444"),
      amber: cssVar("--amber", "#f59e0b"),
    };
  }

  function niceMax(values, minMax = 4) {
    const max = Math.max(0, ...values.map(v => Number.isFinite(v) ? v : 0));
    const base = Math.max(minMax, max);
    const pow = Math.pow(10, Math.floor(Math.log10(base || 1)));
    const n = Math.ceil(base / pow) * pow;
    if (n >= base * 1.8) return Math.ceil(base / (pow / 2)) * (pow / 2);
    return n;
  }

  function setStatus(msg) {
    const el = $("hist_status");
    if (el) el.textContent = msg;
  }

  /* =============================
     Data loading (Robust)
  ============================== */

  // Normalize any row shapes (from history.js or storage) into a consistent shape
  function normalizeRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    return rows.map((r, i) => ({
      sprint: String(r?.sprint ?? r?.name ?? r?.label ?? r?.id ?? `Sprint ${i + 1}`),

      // Use "forecast capacity" as capacity if present
      capacity: toNum(
        r?.forecastCap ??
        r?.forecastCapacity ??
        r?.forecastCapacitySP ??
        r?.forecastCapSP ??
        r?.capacity ??
        r?.cap ??
        0
      ),

      committed: toNum(r?.committedSP ?? r?.committed ?? r?.commit ?? r?.commitSP ?? 0),
      completed: toNum(r?.completedSP ?? r?.completed ?? r?.done ?? r?.doneSP ?? 0),

      added: toNum(
        r?.addedMid ??
        r?.addedSP ??
        r?.unplannedSP ??
        r?.added ??
        r?.scopeAdded ??
        r?.scopeAddedSP ??
        0
      ),

      removed: toNum(
        r?.removedMid ??
        r?.removedSP ??
        r?.removed ??
        r?.scopeRemoved ??
        r?.scopeRemovedSP ??
        0
      ),

      sick: toNum(r?.sickLeaveDays ?? r?.sickLeave ?? r?.sick ?? 0),
    }));
  }

  function normalizeFromModel(obj) {
    if (!obj) return [];
    // common shapes:
    // 1) { rows:[...] }
    // 2) { sprints:[...] } (each sprint might already contain fields)
    // 3) [...] array
    if (Array.isArray(obj)) return normalizeRows(obj);

    if (Array.isArray(obj.rows)) return normalizeRows(obj.rows);

    if (Array.isArray(obj.sprints)) {
      // If sprints already look like rows, normalize directly
      return normalizeRows(obj.sprints);
    }

    return [];
  }

  function loadFromStorageAnyKey() {
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = safeParse(raw, null);
      const rows = normalizeFromModel(parsed);
      if (rows.length) {
        return { rows, source: `localStorage["${key}"]` };
      }
    }
    return { rows: [], source: "storage:none" };
  }

  function loadFromHistoryAPI() {
    const api = window.ScrummerCoachHistory;
    if (api?.getRows) {
      const rows = normalizeRows(api.getRows());
      if (rows.length) return { rows, source: "ScrummerCoachHistory.getRows()" };
    }
    return { rows: [], source: "api:none" };
  }

  function loadRows() {
    // Prefer API if it exists (it reflects what user sees in table),
    // but storage is okay too.
    let a = loadFromHistoryAPI();
    if (a.rows.length) return a;

    let s = loadFromStorageAnyKey();
    if (s.rows.length) return s;

    return { rows: [], source: "none" };
  }

  function lastN(rows, n = 6) {
    return rows.slice(-n);
  }

  /* =============================
     Chart Defaults (Premium)
  ============================== */

  function applyChartDefaults() {
    if (!window.Chart || !window.Chart.defaults) return;

    const t = theme();

    window.Chart.defaults.responsive = true;
    window.Chart.defaults.maintainAspectRatio = false;
    window.Chart.defaults.animation = { duration: 520, easing: "easeOutQuart" };
    window.Chart.defaults.interaction = { mode: "index", intersect: false };

    window.Chart.defaults.font = {
      family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      size: 12,
      weight: "500",
    };

    window.Chart.defaults.plugins = window.Chart.defaults.plugins || {};

    window.Chart.defaults.plugins.legend = {
      display: false, // you already have custom legend pills in HTML
    };

    window.Chart.defaults.plugins.tooltip = {
      enabled: true,
      backgroundColor: "rgba(15,23,42,0.92)",
      borderColor: withAlpha(t.borderSoft, 0.6),
      borderWidth: 1,
      titleColor: "rgba(255,255,255,0.96)",
      bodyColor: "rgba(255,255,255,0.86)",
      titleFont: { size: 13, weight: "800" },
      bodyFont: { size: 12, weight: "600" },
      padding: 12,
      cornerRadius: 12,
      displayColors: true,
    };

    window.Chart.defaults.scales = window.Chart.defaults.scales || {};
    for (const s of ["linear", "category"]) {
      window.Chart.defaults.scales[s] = window.Chart.defaults.scales[s] || {};
      window.Chart.defaults.scales[s].grid = {
        color: t.grid,
        drawBorder: false,
        tickColor: "transparent",
      };
      window.Chart.defaults.scales[s].ticks = {
        color: t.textDim,
        padding: 8,
        font: { size: 11, weight: "650" },
      };
    }

    window.Chart.defaults.elements = window.Chart.defaults.elements || {};
    window.Chart.defaults.elements.point = { radius: 2.6, hoverRadius: 4.6, hitRadius: 12 };
    window.Chart.defaults.elements.line = { borderWidth: 2.4 };
    window.Chart.defaults.elements.bar = { borderWidth: 0, borderRadius: 10 };
  }

  function deepMerge(a, b) {
    if (!b) return a;
    const out = Array.isArray(a) ? a.slice() : { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] && typeof out[k] === "object" ? out[k] : {}, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function baseOptions(overrides = {}) {
    const t = theme();
    const opt = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: t.textDim, font: { size: 11, weight: "650" }, maxRotation: 0 },
          grid: { color: t.grid, drawBorder: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: t.textDim, font: { size: 11, weight: "650" } },
          grid: { color: t.grid, drawBorder: false }
        }
      }
    };
    return deepMerge(opt, overrides);
  }

  /* =============================
     Robust Rendering (avoid blank charts)
  ============================== */

  const charts = new Map();

  function destroyChart(id) {
    const c = charts.get(id);
    if (c) {
      try { c.destroy(); } catch {}
      charts.delete(id);
    }
  }

  function canvasReady(canvas) {
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40;
  }

  function waitForCanvasSize(canvas, cb) {
    if (canvasReady(canvas)) { cb(); return; }

    const host = canvas.parentElement || canvas;
    const ro = new ResizeObserver(() => {
      if (canvasReady(canvas)) {
        ro.disconnect();
        cb();
      }
    });

    try { ro.observe(host); } catch {}

    let tries = 0;
    const tick = () => {
      tries++;
      if (canvasReady(canvas)) {
        try { ro.disconnect(); } catch {}
        cb();
        return;
      }
      if (tries < 30) requestAnimationFrame(tick);
      else {
        try { ro.disconnect(); } catch {}
        cb();
      }
    };
    requestAnimationFrame(tick);
  }

  /* =============================
     Ribbon helpers
  ============================== */

  function pct(n) {
    const v = Math.max(0, Math.min(100, Math.round(n)));
    return `${v}%`;
  }

  function setRibbon(fillId, textId, percent, labelText) {
    const fill = $(fillId);
    const txt = $(textId);
    if (fill) fill.style.width = pct(percent);
    if (txt) txt.textContent = labelText ?? "—";
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a,b)=>a+b,0) / arr.length;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const v = mean(arr.map(x => (x - m) ** 2));
    return Math.sqrt(v);
  }

  /* =============================
     Charts
  ============================== */

  function renderVelocity(rows) {
    const id = "hist_velocityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    waitForCanvasSize(canvas, () => {
      destroyChart(id);

      const completed = rows.map(r => toNum(r.completed, 0));
      const yMax = niceMax(completed, 8);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [{
            label: "Completed SP",
            data: completed,
            borderColor: t.green,
            backgroundColor: withAlpha(t.green, 0.16),
            tension: 0.35,
            fill: true,
            borderWidth: 3,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: t.green
          }]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax } }
        })
      });

      charts.set(id, chart);

      // ribbons
      const avg = Math.round(mean(completed));
      const sd = stdev(completed);
      // stability: higher is better; map SD down to %
      const stability = Math.max(0, Math.min(100, Math.round(100 - (sd * 7))));
      setRibbon("rb_velAvg", "rb_velAvgTxt", Math.min(100, Math.round((avg / Math.max(1, yMax)) * 100)), `${avg} SP`);
      setRibbon("rb_velStability", "rb_velStabilityTxt", stability, `${stability}%`);
    });
  }

  function renderPredictability(rows) {
    const id = "hist_predictChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    waitForCanvasSize(canvas, () => {
      destroyChart(id);

      const committed = rows.map(r => toNum(r.committed, 0));
      const completed = rows.map(r => toNum(r.completed, 0));
      const yMax = niceMax([...committed, ...completed], 8);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [
            {
              label: "Committed",
              data: committed,
              borderColor: t.indigo,
              tension: 0.35,
              fill: false,
              borderWidth: 2.4,
              pointRadius: 2.6,
              pointHoverRadius: 5,
              pointBackgroundColor: t.indigo
            },
            {
              label: "Completed",
              data: completed,
              borderColor: t.green,
              tension: 0.35,
              fill: false,
              borderWidth: 3,
              pointRadius: 2.9,
              pointHoverRadius: 5,
              pointBackgroundColor: t.green
            }
          ]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax } }
        })
      });

      charts.set(id, chart);

      // ribbons: say-do latest, risk (committed > completed)
      const last = rows[rows.length - 1];
      const sayDo = last ? (toNum(last.completed) / Math.max(1, toNum(last.committed))) : 0;
      const sayDoPct = Math.max(0, Math.min(120, Math.round(sayDo * 100)));
      const risk = last ? Math.max(0, toNum(last.committed) - toNum(last.completed)) : 0;
      const riskPct = Math.max(0, Math.min(100, Math.round((risk / Math.max(1, toNum(last.committed))) * 100)));

      setRibbon("rb_sayDo", "rb_sayDoTxt", Math.min(100, sayDoPct), `${sayDoPct}%`);
      setRibbon("rb_commitRisk", "rb_commitRiskTxt", riskPct, risk ? `+${risk} SP` : "0 SP");
    });
  }

  function renderCapacity(rows) {
    const id = "hist_capacityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    waitForCanvasSize(canvas, () => {
      destroyChart(id);

      const cap = rows.map(r => toNum(r.capacity, 0));
      const completed = rows.map(r => toNum(r.completed, 0));
      const yMax = niceMax([...cap, ...completed], 10);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [
            {
              label: "Capacity",
              data: cap,
              borderColor: t.amber,
              tension: 0.35,
              fill: false,
              borderWidth: 2.4,
              pointRadius: 2.6,
              pointHoverRadius: 5,
              pointBackgroundColor: t.amber
            },
            {
              label: "Completed",
              data: completed,
              borderColor: t.green,
              tension: 0.35,
              fill: false,
              borderWidth: 3,
              pointRadius: 2.9,
              pointHoverRadius: 5,
              pointBackgroundColor: t.green
            }
          ]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax } }
        })
      });

      charts.set(id, chart);

      const last = rows[rows.length - 1];
      const fit = last ? (toNum(last.completed) / Math.max(1, toNum(last.capacity))) : 0;
      const fitPct = Math.max(0, Math.min(140, Math.round(fit * 100)));
      const over = last ? Math.max(0, toNum(last.committed) - toNum(last.capacity)) : 0;
      const overPct = Math.max(0, Math.min(100, Math.round((over / Math.max(1, toNum(last.capacity))) * 100)));

      setRibbon("rb_capFit", "rb_capFitTxt", Math.min(100, fitPct), `${fitPct}%`);
      setRibbon("rb_overcommit", "rb_overcommitTxt", overPct, over ? `+${over} SP` : "0 SP");
    });
  }

  function renderDisruption(rows) {
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    waitForCanvasSize(canvas, () => {
      destroyChart(id);

      const added = rows.map(r => toNum(r.added, 0));
      const removed = rows.map(r => toNum(r.removed, 0));
      const yMax = niceMax([...added, ...removed], 4);

      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [
            {
              label: "Added",
              data: added,
              backgroundColor: withAlpha(t.green, 0.78),
              borderRadius: 12
            },
            {
              label: "Removed",
              data: removed,
              backgroundColor: withAlpha(t.red, 0.74),
              borderRadius: 12
            }
          ]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax } }
        })
      });

      charts.set(id, chart);

      const avgAdd = Math.round(mean(added));
      const avgRem = Math.round(mean(removed));
      const addPct = Math.min(100, Math.round((avgAdd / Math.max(1, yMax)) * 100));
      const remPct = Math.min(100, Math.round((avgRem / Math.max(1, yMax)) * 100));

      setRibbon("rb_scopeAdd", "rb_scopeAddTxt", addPct, `${avgAdd} SP`);
      setRibbon("rb_scopeRem", "rb_scopeRemTxt", remPct, `${avgRem} SP`);
    });
  }

  function renderSick(rows) {
    const id = "hist_sickChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    waitForCanvasSize(canvas, () => {
      destroyChart(id);

      const sick = rows.map(r => toNum(r.sick, 0));
      const yMax = niceMax(sick, 2);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [{
            label: "Sick Leave (days)",
            data: sick,
            borderColor: t.red,
            backgroundColor: withAlpha(t.red, 0.10),
            tension: 0.35,
            fill: false,
            borderWidth: 2.6,
            pointRadius: 2.6,
            pointHoverRadius: 5,
            pointBackgroundColor: t.red
          }]
        },
        options: baseOptions({
          scales: {
            y: {
              suggestedMax: yMax,
              ticks: { precision: 0 }
            }
          }
        })
      });

      charts.set(id, chart);
    });
  }

  function renderAll() {
    if (!window.Chart) {
      setStatus("Chart.js not loaded yet.");
      return false;
    }

    applyChartDefaults();

    const { rows, source } = loadRows();
    const last6 = lastN(rows, 6);

    if (!last6.length) {
      setStatus("No sprint history found yet. Click “🧪 Load Demo Data” then “Save”.");
      return false;
    }

    setStatus(`Charts updated from ${source} • ${last6.length} sprints`);

    renderVelocity(last6);
    renderPredictability(last6);
    renderCapacity(last6);
    renderDisruption(last6);
    renderSick(last6);

    return true;
  }

  /* =============================
     Triggers
  ============================== */

  let rerenderTimer = null;
  function scheduleRerender(delay = 120) {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => renderAll(), delay);
  }

  function hookUITriggers() {
    const clickIds = [
      "hist_demoBtn",
      "hist_saveBtn",
      "hist_resetBtn",
      "hist_autofillBtn",
      "hist_uploadCsvBtn",
      "hist_downloadTplBtn",
    ];
    clickIds.forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("click", () => scheduleRerender(180));
    });

    const csv = $("hist_csvInput");
    if (csv) csv.addEventListener("change", () => scheduleRerender(260));

    const variant = $("hist_demoVariant");
    if (variant) variant.addEventListener("change", () => scheduleRerender(180));
  }

  // Retry a few times on initial load (history table may render AFTER DOMContentLoaded)
  function initialBoot() {
    hookUITriggers();

    let tries = 0;
    const tryRender = () => {
      tries++;
      const ok = renderAll();
      if (ok) return;

      if (tries < 18) setTimeout(tryRender, 180);
    };

    tryRender();
  }

  document.addEventListener("DOMContentLoaded", initialBoot);
  window.addEventListener("resize", () => scheduleRerender(140));

  const mo = new MutationObserver(() => scheduleRerender(140));
  try {
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  } catch {}
})();