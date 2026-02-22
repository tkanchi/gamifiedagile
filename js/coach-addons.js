/**
 * Scrummer — Coach Addons (Clean / No Snapshots) — v3.4
 * --------------------------------------------------------------
 * Uses last 6 sprints from:
 * localStorage["scrummer_sprint_history_v1"]
 *
 * Falls back to window.ScrummerCoachHistory.getRows()
 *
 * Updates:
 * ✅ Y-axis step = 10 (Velocity, Capacity, Predictability %)
 * ✅ Predictability = (Completed ÷ Committed) × 100 (single series)
 * ✅ Premium reference look (indigo + gradient + white points)
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
      sprint: s.id || `Sprint ${i + 1}`,
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

      added: Number(r?.addedMid ?? r?.addedSP ?? r?.unplannedSP ?? r?.added ?? r?.scopeAdded ?? r?.scopeAddedSP ?? 0),
      removed: Number(r?.removedMid ?? r?.removedSP ?? r?.removed ?? r?.scopeRemoved ?? r?.scopeRemovedSP ?? 0),

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
     Theme helpers
  ============================== */

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback;
  }

  function theme() {
    return {
      textSoft: cssVar("--text-soft", "#94a3b8"),
      indigo: cssVar("--indigo", cssVar("--accent", "#6366f1")),
      green: cssVar("--green", "#22c55e"),
      red: cssVar("--red", "#ef4444"),
      amber: cssVar("--amber", "#f59e0b"),
    };
  }

  function gridColor() {
    return "rgba(15, 23, 42, 0.06)";
  }

  function gradientFill(context, hexOrRgb, topAlpha = 0.36, bottomAlpha = 0.06) {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) return `rgba(99,102,241,${bottomAlpha})`;

    const toRgb = (c) => {
      if (!c) return { r: 99, g: 102, b: 241 };
      const s = String(c).trim();
      if (s.startsWith("rgb")) {
        const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      }
      let h = s.replace("#", "");
      if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
      if (h.length !== 6) return { r: 99, g: 102, b: 241 };
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    };

    const { r, g, b } = toRgb(hexOrRgb);
    const g1 = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g1.addColorStop(0, `rgba(${r},${g},${b},${topAlpha})`);
    g1.addColorStop(1, `rgba(${r},${g},${b},${bottomAlpha})`);
    return g1;
  }

  function baseOptions({ yStep = null, yMin = null, yMax = null } = {}) {
    const t = theme();

    const yTicks = {
      color: t.textSoft,
      font: { weight: 600 }
    };
    if (Number.isFinite(yStep)) yTicks.stepSize = yStep;

    const yScale = {
      beginAtZero: true,
      ticks: yTicks,
      grid: { color: gridColor(), drawBorder: false },
      border: { display: false }
    };
    if (Number.isFinite(yMin)) yScale.min = yMin;
    if (Number.isFinite(yMax)) yScale.max = yMax;

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650 },
      interaction: { mode: "index", intersect: false },

      elements: {
        line: { borderCapStyle: "round", borderJoinStyle: "round" }
      },

      scales: {
        x: {
          ticks: { color: t.textSoft, font: { weight: 600 }, maxRotation: 0, autoSkip: true },
          grid: { display: false, drawBorder: false },
          border: { display: false }
        },
        y: yScale
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(15,23,42,0.92)",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          cornerRadius: 12,
          displayColors: true
        }
      }
    };
  }

  function lineDatasetBase(color) {
    return {
      borderColor: color,
      borderWidth: 3,
      tension: 0.42,
      cubicInterpolationMode: "monotone",
      fill: true,
      pointRadius: 4.5,
      pointHoverRadius: 5.5,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: color,
      pointBorderWidth: 2
    };
  }

  const charts = new Map();
  function destroyChart(id) {
    if (charts.has(id)) {
      charts.get(id).destroy();
      charts.delete(id);
    }
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

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [{
          label: "Completed SP",
          data: rows.map(r => r.completed),
          ...lineDatasetBase(t.indigo),
          backgroundColor: (ctx) => gradientFill(ctx, t.indigo, 0.42, 0.06)
        }]
      },
      options: baseOptions({ yStep: 10 })
    });

    charts.set(id, chart);
  }

  function renderPredictability(rows) {
    const id = "hist_predictChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    const t = theme();

    const pct = rows.map(r => {
      const committed = Number(r.committed || 0);
      const completed = Number(r.completed || 0);
      if (!committed) return 0;
      return Math.round((completed / committed) * 100);
    });

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [{
          label: "Predictability (%)",
          data: pct,
          ...lineDatasetBase(t.indigo),
          backgroundColor: (ctx) => gradientFill(ctx, t.indigo, 0.28, 0.04)
        }]
      },
      options: baseOptions({ yStep: 10, yMin: 0, yMax: 120 })
    });

    charts.set(id, chart);
  }

  function renderCapacity(rows) {
    const id = "hist_capacityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    const t = theme();

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          {
            label: "Capacity",
            data: rows.map(r => r.capacity),
            ...lineDatasetBase(t.amber),
            backgroundColor: (ctx) => gradientFill(ctx, t.amber, 0.16, 0.02)
          },
          {
            label: "Completed",
            data: rows.map(r => r.completed),
            ...lineDatasetBase(t.green),
            backgroundColor: (ctx) => gradientFill(ctx, t.green, 0.18, 0.02)
          }
        ]
      },
      options: baseOptions({ yStep: 10 })
    });

    charts.set(id, chart);
  }

  function renderDisruption(rows) {
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const added = rows.map(r => Number(r.added || 0));
    const removed = rows.map(r => Number(r.removed || 0));

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          { label: "Added", data: added, backgroundColor: "rgba(34,197,94,0.85)", borderRadius: 10, borderSkipped: false },
          { label: "Removed", data: removed, backgroundColor: "rgba(239,68,68,0.85)", borderRadius: 10, borderSkipped: false }
        ]
      },
      options: baseOptions({ yStep: 1 })
    });

    charts.set(id, chart);
  }

  function renderSick(rows) {
    const id = "hist_sickChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    const t = theme();

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [{
          label: "Sick Leave",
          data: rows.map(r => r.sick),
          ...lineDatasetBase(t.red),
          backgroundColor: (ctx) => gradientFill(ctx, t.red, 0.14, 0.02)
        }]
      },
      options: baseOptions({ yStep: 1 })
    });

    charts.set(id, chart);
  }

  function renderAll() {
    if (!window.Chart) return;
    const rows = loadRows();
    if (!rows.length) return;

    renderVelocity(rows);
    renderPredictability(rows);
    renderCapacity(rows);
    renderDisruption(rows);
    renderSick(rows);
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("scrummer:historyChanged", () => {
      if (window.Chart) renderAll();
    });

    let tries = 0;
    const tick = () => {
      tries++;
      if (window.Chart) return renderAll();
      if (tries < 60) return setTimeout(tick, 100);
      console.warn("[Scrummer] Chart.js not found. Charts will stay empty.");
    };
    tick();
  });
})();
