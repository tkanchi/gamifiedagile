/**
 * Scrummer — Coach Addons (Clean / No Snapshots) — v3 Mobile-Proof
 * --------------------------------------------------------------
 * Uses last 6 sprints from:
 * localStorage["scrummer_sprint_history_v1"]
 * Falls back to window.ScrummerCoachHistory.getRows()
 *
 * Fixes:
 * ✅ Charts blank on mobile (0-height canvas issue) by forcing wrapper height
 * ✅ Reflow-safe rendering (resize + rerender)
 * ✅ Only horizontal grid lines
 * ✅ Fewer Y-axis labels (maxTicksLimit)
 * ✅ Sick leave y max (no 0..1 squish)
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "scrummer_sprint_history_v1";

  /* =============================
     Storage / Model
  ============================== */

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadModel() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sprints: [] };
    const m = safeParse(raw, null);
    if (!m || !Array.isArray(m.sprints)) return { sprints: [] };
    return m;
  }

  function lastNSprints(model, n = 6) {
    return (model.sprints || []).slice(-n);
  }

  function calcCapacitySP(s) {
    const sprintDays = Number(s?.sprintDays || 10);
    const teamMembers = Number(s?.teamMembers || 5);
    const holidays = Number(s?.holidays || 0);
    const leaveDays = Number(s?.leaveDays || 0);
    const focus = Number(s?.focusFactor ?? 0.8);

    const ideal = sprintDays * teamMembers;
    const available = Math.max(0, ideal - holidays - leaveDays);
    return Math.round(available * focus);
  }

  function rowsFromModel(model) {
    return lastNSprints(model, 6).map((s, i) => ({
      sprint: s.id || `S${i + 1}`,
      capacity: calcCapacitySP(s),
      committed: Number(s?.committedSP || 0),
      completed: Number(s?.completedSP || 0),
      added: Number(s?.unplannedSP ?? s?.addedSP ?? s?.addedMid ?? 0),
      removed: Number(s?.removedMid ?? s?.removedSP ?? s?.scopeRemoved ?? 0),
      sick: Number(s?.sickLeaveDays ?? s?.sickLeave ?? 0),
    }));
  }

  function normalizeFallbackRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    return rows.map((r, i) => ({
      sprint: String(r?.sprint ?? r?.name ?? r?.label ?? `Sprint ${i + 1}`),

      capacity: Number(
        r?.forecastCap ??
        r?.capacity ??
        r?.forecast ??
        r?.forecastCapacity ??
        r?.forecastCapacitySP ??
        r?.forecastCapSP ??
        0
      ),

      committed: Number(r?.committedSP ?? r?.committed ?? r?.commit ?? r?.commitSP ?? 0),
      completed: Number(r?.completedSP ?? r?.completed ?? r?.done ?? r?.doneSP ?? 0),

      added: Number(
        r?.addedMid ??
        r?.addedSP ??
        r?.unplannedSP ??
        r?.added ??
        r?.scopeAdded ??
        r?.scopeAddedSP ??
        0
      ),
      removed: Number(
        r?.removedMid ??
        r?.removedSP ??
        r?.removed ??
        r?.scopeRemoved ??
        r?.scopeRemovedSP ??
        0
      ),
      sick: Number(r?.sickLeaveDays ?? r?.sickLeave ?? r?.sick ?? 0),
    }));
  }

  function loadRows() {
    const model = loadModel();
    if (model.sprints?.length) return rowsFromModel(model);

    const api = window.ScrummerCoachHistory;
    if (api?.getRows) return normalizeFallbackRows(api.getRows());

    return [];
  }

  /* =============================
     Theme Helpers
  ============================== */

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

    const grid = cssVar("--grid-soft", "") || "rgba(148,163,184,0.14)";

    return {
      textMain,
      textDim,
      borderSoft,
      grid,
      indigo: cssVar("--accent", "#6366f1"),
      green: cssVar("--accent-2", "#22c55e"),
      red: "#ef4444",
      amber: "#f59e0b",
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

  /* =============================
     Chart.js Defaults
  ============================== */

  function applyChartDefaults() {
    if (!window.Chart?.defaults) return;

    const t = theme();

    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation = { duration: 520, easing: "easeOutQuart" };
    Chart.defaults.interaction = { mode: "index", intersect: false };

    Chart.defaults.font = {
      family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      size: 12,
      weight: "500",
    };

    Chart.defaults.plugins = Chart.defaults.plugins || {};

    // We use our own legend pills in HTML, so keep Chart legend off (cleaner)
    Chart.defaults.plugins.legend = { display: false };

    Chart.defaults.plugins.tooltip = {
      enabled: true,
      backgroundColor: "rgba(15,23,42,0.92)",
      borderColor: withAlpha(t.borderSoft, 0.6),
      borderWidth: 1,
      titleColor: "rgba(255,255,255,0.96)",
      bodyColor: "rgba(255,255,255,0.86)",
      titleFont: { size: 13, weight: "800" },
      bodyFont: { size: 12, weight: "650" },
      padding: 12,
      cornerRadius: 12,
      displayColors: true,
    };

    Chart.defaults.elements = Chart.defaults.elements || {};
    Chart.defaults.elements.point = { radius: 2.6, hoverRadius: 4.6, hitRadius: 12 };
    Chart.defaults.elements.line = { borderWidth: 2.4 };
    Chart.defaults.elements.bar = { borderWidth: 0, borderRadius: 10 };
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

  /* =============================
     Base Options
     - Only horizontal grid lines
     - Fewer Y ticks
  ============================== */

  function baseOptions(overrides = {}) {
    const t = theme();

    const opt = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false }, // ✅ remove vertical lines
          ticks: { color: t.textDim, font: { size: 11, weight: "650" }, maxRotation: 0 }
        },
        y: {
          beginAtZero: true,
          grid: { display: true, color: t.grid, drawBorder: false }, // ✅ only horizontal
          ticks: {
            color: t.textDim,
            font: { size: 11, weight: "650" },
            maxTicksLimit: 5,        // ✅ fewer labels
            precision: 0             // ✅ no decimals
          }
        }
      }
    };

    return deepMerge(opt, overrides);
  }

  /* =============================
     Mobile-Proof Canvas Sizing
  ============================== */

  const charts = new Map();

  function destroyChart(id) {
    const c = charts.get(id);
    if (c) {
      try { c.destroy(); } catch {}
      charts.delete(id);
    }
  }

  function forceCanvasHeight(canvas) {
    if (!canvas) return;

    // Preferred wrapper is .chartCanvasWrap
    const wrap =
      canvas.closest(".chartCanvasWrap") ||
      canvas.parentElement;

    if (wrap) {
      const r = wrap.getBoundingClientRect();
      if (r.height < 120) {
        // ✅ force a real height if CSS got overridden / collapsed
        wrap.style.height = "260px";
      }
    }

    // Ensure canvas has an actual drawing height too (helps some mobile browsers)
    // Use wrapper height if available, else fallback.
    const h = (wrap?.getBoundingClientRect().height || 260);
    if (!canvas.getAttribute("height")) {
      canvas.setAttribute("height", String(Math.round(h)));
    }
  }

  function canvasReady(canvas) {
    if (!canvas) return false;
    const wrap = canvas.closest(".chartCanvasWrap") || canvas.parentElement || canvas;
    const rect = wrap.getBoundingClientRect();
    return rect.width > 80 && rect.height > 120;
  }

  function waitForCanvasSize(canvas, cb) {
    forceCanvasHeight(canvas);

    if (canvasReady(canvas)) { cb(); return; }

    const host = canvas.closest(".chartCanvasWrap") || canvas.parentElement || canvas;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      forceCanvasHeight(canvas);
      cb();
    };

    // ResizeObserver
    let ro;
    try {
      ro = new ResizeObserver(() => {
        if (canvasReady(canvas)) {
          try { ro.disconnect(); } catch {}
          finish();
        }
      });
      ro.observe(host);
    } catch {}

    // RAF fallback
    let tries = 0;
    const tick = () => {
      tries++;
      forceCanvasHeight(canvas);
      if (canvasReady(canvas)) {
        try { ro?.disconnect(); } catch {}
        finish();
        return;
      }
      if (tries < 30) requestAnimationFrame(tick);
      else {
        try { ro?.disconnect(); } catch {}
        finish();
      }
    };
    requestAnimationFrame(tick);
  }

  function postResize(chart) {
    // mobile browsers often need a tiny delay after first draw
    setTimeout(() => {
      try { chart.resize(); } catch {}
      try { chart.update(); } catch {}
    }, 60);
  }

  /* =============================
     Charts
  ============================== */

  function renderVelocity(rows) {
    const id = "hist_velocityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    waitForCanvasSize(canvas, () => {
      destroyChart(id);
      const t = theme();

      const completed = rows.map(r => Number(r.completed || 0));
      const yMax = niceMax(completed, 8);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [{
            label: "Completed SP",
            data: completed,
            borderColor: t.green,
            backgroundColor: withAlpha(t.green, 0.14),
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
      postResize(chart);
    });
  }

  function renderPredictability(rows) {
    const id = "hist_predictChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    waitForCanvasSize(canvas, () => {
      destroyChart(id);
      const t = theme();

      const committed = rows.map(r => Number(r.committed || 0));
      const completed = rows.map(r => Number(r.completed || 0));
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
              backgroundColor: withAlpha(t.indigo, 0.08),
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
              backgroundColor: withAlpha(t.green, 0.08),
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
      postResize(chart);
    });
  }

  function renderCapacity(rows) {
    const id = "hist_capacityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    waitForCanvasSize(canvas, () => {
      destroyChart(id);
      const t = theme();

      const cap = rows.map(r => Number(r.capacity || 0));
      const completed = rows.map(r => Number(r.completed || 0));
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
              backgroundColor: withAlpha(t.amber, 0.08),
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
              backgroundColor: withAlpha(t.green, 0.08),
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
      postResize(chart);
    });
  }

  function renderDisruption(rows) {
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    waitForCanvasSize(canvas, () => {
      destroyChart(id);
      const t = theme();

      const added = rows.map(r => Number(r.added || 0));
      const removed = rows.map(r => Number(r.removed || 0));
      const yMax = niceMax([...added, ...removed], 4);

      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [
            { label: "Added", data: added, backgroundColor: withAlpha(t.green, 0.75), borderRadius: 12 },
            { label: "Removed", data: removed, backgroundColor: withAlpha(t.red, 0.72), borderRadius: 12 }
          ]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax } }
        })
      });

      charts.set(id, chart);
      postResize(chart);
    });
  }

  function renderSick(rows) {
    const id = "hist_sickChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    waitForCanvasSize(canvas, () => {
      destroyChart(id);
      const t = theme();

      const sick = rows.map(r => Number(r.sick || 0));
      const yMax = niceMax(sick, 2);

      const chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [{
            label: "Sick Leave (days)",
            data: sick,
            borderColor: t.red,
            backgroundColor: withAlpha(t.red, 0.08),
            tension: 0.35,
            fill: false,
            borderWidth: 2.6,
            pointRadius: 2.6,
            pointHoverRadius: 5,
            pointBackgroundColor: t.red
          }]
        },
        options: baseOptions({
          scales: { y: { suggestedMax: yMax, ticks: { maxTicksLimit: 4, precision: 0 } } }
        })
      });

      charts.set(id, chart);
      postResize(chart);
    });
  }

  function renderAll() {
    if (!window.Chart) return;
    applyChartDefaults();

    const rows = loadRows();
    if (!rows.length) return;

    renderVelocity(rows);
    renderPredictability(rows);
    renderCapacity(rows);
    renderDisruption(rows);
    renderSick(rows);
  }

  /* =============================
     Rerender Triggers
  ============================== */

  let rerenderTimer = null;
  function scheduleRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => renderAll(), 140);
  }

  document.addEventListener("DOMContentLoaded", renderAll);
  window.addEventListener("resize", scheduleRerender);

  // Theme change / data-theme updates
  const mo = new MutationObserver(() => scheduleRerender());
  try {
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  } catch {}
})();