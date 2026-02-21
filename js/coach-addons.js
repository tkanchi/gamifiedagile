/**
 * Scrummer — Coach Addons (Clean / No Snapshots) — v2 Premium + Robust
 * --------------------------------------------------------------
 * Uses last 6 sprints from:
 * localStorage["scrummer_sprint_history_v1"]
 *
 * Falls back to window.ScrummerCoachHistory.getRows()
 *
 * Fixes:
 * - Charts blank when canvas is hidden / 0 height at render time
 * - Sick leave scale (0..1) by using smart y max
 * - Premium look (grid/ticks/tooltip/legend), Stitch-like
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

      // Scope
      added: Number(s?.unplannedSP ?? s?.addedSP ?? s?.addedMid ?? 0),
      removed: Number(s?.removedMid ?? s?.removedSP ?? s?.scopeRemoved ?? 0),

      // Health
      sick: Number(s?.sickLeaveDays ?? s?.sickLeave ?? 0),
    }));
  }

  // Normalize any row shapes (from history.js) into a consistent shape
  function normalizeFallbackRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    return rows.map((r, i) => ({
      sprint: String(r?.sprint ?? r?.name ?? r?.label ?? `Sprint ${i + 1}`),

      // Capacity variants (use forecast capacity as "capacity" for the chart)
      capacity: Number(
        r?.forecastCap ??
        r?.capacity ??
        r?.forecast ??
        r?.forecastCapacity ??
        r?.forecastCapacitySP ??
        r?.forecastCapSP ??
        0
      ),

      // Commitment / delivery variants
      committed: Number(r?.committedSP ?? r?.committed ?? r?.commit ?? r?.commitSP ?? 0),
      completed: Number(r?.completedSP ?? r?.completed ?? r?.done ?? r?.doneSP ?? 0),

      // Scope variants
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

      // Sick leave variants
      sick: Number(r?.sickLeaveDays ?? r?.sickLeave ?? r?.sick ?? 0),
    }));
  }

  function loadRows() {
    const model = loadModel();
    if (model.sprints?.length) return rowsFromModel(model);

    const api = window.ScrummerCoachHistory;
    if (api?.getRows) {
      return normalizeFallbackRows(api.getRows());
    }

    return [];
  }

  /* =============================
     Theme Helpers
  ============================== */

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function withAlpha(hexOrRgb, alpha) {
    // supports "#RRGGBB" only; if not, return as-is
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
    // NOTE: your CSS may use different var names; we provide safe fallbacks.
    const textMain = cssVar("--text-main", "rgba(255,255,255,0.92)");
    const textDim = cssVar("--text-dim", "rgba(255,255,255,0.62)");
    const borderSoft = cssVar("--border-soft", "rgba(255,255,255,0.10)");
    const grid = cssVar("--grid-soft", "rgba(255,255,255,0.08)");

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
    // round up to a nice step
    const pow = Math.pow(10, Math.floor(Math.log10(base || 1)));
    const n = Math.ceil(base / pow) * pow;
    // if too aggressive (e.g. 12 -> 20), soften a bit
    if (n >= base * 1.8) return Math.ceil(base / (pow / 2)) * (pow / 2);
    return n;
  }

  /* =============================
     Chart.js Defaults (Premium)
  ============================== */

  function applyChartDefaults() {
    if (!window.Chart || !window.Chart.defaults) return;

    const t = theme();

    // Global
    window.Chart.defaults.responsive = true;
    window.Chart.defaults.maintainAspectRatio = false;
    window.Chart.defaults.animation = { duration: 450 };

    // Font
    window.Chart.defaults.font = {
      family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      size: 12,
      weight: "500",
    };

    // Interaction
    window.Chart.defaults.interaction = {
      mode: "index",
      intersect: false,
    };

    // Plugins
    window.Chart.defaults.plugins = window.Chart.defaults.plugins || {};
    window.Chart.defaults.plugins.legend = {
      display: true,
      position: "top",
      align: "start",
      labels: {
        color: t.textDim,
        usePointStyle: true,
        pointStyle: "circle",
        boxWidth: 10,
        boxHeight: 10,
        padding: 14,
      },
    };

    window.Chart.defaults.plugins.tooltip = {
      enabled: true,
      backgroundColor: "rgba(10,12,18,0.92)",
      borderColor: t.borderSoft,
      borderWidth: 1,
      titleColor: "rgba(255,255,255,0.92)",
      bodyColor: "rgba(255,255,255,0.88)",
      padding: 12,
      cornerRadius: 12,
      displayColors: true,
    };

    // Scales defaults (v3/v4)
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
      };
    }

    // Elements (line points)
    window.Chart.defaults.elements = window.Chart.defaults.elements || {};
    window.Chart.defaults.elements.point = {
      radius: 3,
      hoverRadius: 4,
      hitRadius: 12,
    };
    window.Chart.defaults.elements.line = {
      borderWidth: 2,
    };
  }

  function baseOptions(overrides = {}) {
    const t = theme();

    // per-chart options that keep things consistent
    const opt = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: t.textDim },
          grid: { color: t.grid, drawBorder: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: t.textDim },
          grid: { color: t.grid, drawBorder: false }
        }
      },
      plugins: {
        legend: {
          labels: { color: t.textDim }
        }
      }
    };

    return deepMerge(opt, overrides);
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
    // If parent has no height, Chart.js will compute 0 and appear blank.
    const rect = canvas.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40;
  }

  function waitForCanvasSize(canvas, cb) {
    // Try immediately
    if (canvasReady(canvas)) {
      cb();
      return;
    }

    // Observe parent/container resizing (best fix for hidden tabs / accordions)
    const host = canvas.parentElement || canvas;
    const ro = new ResizeObserver(() => {
      if (canvasReady(canvas)) {
        ro.disconnect();
        cb();
      }
    });

    try { ro.observe(host); } catch {}

    // Safety: also retry a few times
    let tries = 0;
    const tick = () => {
      tries++;
      if (canvasReady(canvas)) {
        try { ro.disconnect(); } catch {}
        cb();
        return;
      }
      if (tries < 20) requestAnimationFrame(tick);
      else {
        // last resort: still try to render (better than nothing)
        try { ro.disconnect(); } catch {}
        cb();
      }
    };
    requestAnimationFrame(tick);
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
            backgroundColor: withAlpha(t.green, 0.16),
            tension: 0.35,
            fill: true,
            pointBackgroundColor: t.green
          }]
        },
        options: baseOptions({
          scales: {
            y: { suggestedMax: yMax }
          }
        })
      });

      charts.set(id, chart);
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
              backgroundColor: withAlpha(t.indigo, 0.10),
              tension: 0.35,
              fill: false,
              pointBackgroundColor: t.indigo
            },
            {
              label: "Completed",
              data: completed,
              borderColor: t.green,
              backgroundColor: withAlpha(t.green, 0.10),
              tension: 0.35,
              fill: false,
              pointBackgroundColor: t.green
            }
          ]
        },
        options: baseOptions({
          scales: {
            y: { suggestedMax: yMax }
          }
        })
      });

      charts.set(id, chart);
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
              backgroundColor: withAlpha(t.amber, 0.10),
              tension: 0.35,
              fill: false,
              pointBackgroundColor: t.amber
            },
            {
              label: "Completed",
              data: completed,
              borderColor: t.green,
              backgroundColor: withAlpha(t.green, 0.10),
              tension: 0.35,
              fill: false,
              pointBackgroundColor: t.green
            }
          ]
        },
        options: baseOptions({
          scales: {
            y: { suggestedMax: yMax }
          }
        })
      });

      charts.set(id, chart);
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

      const added = rows.map(r => Number(r.added || 0));
      const removed = rows.map(r => Number(r.removed || 0));
      const yMax = niceMax([...added, ...removed], 4);

      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: rows.map(r => r.sprint),
          datasets: [
            {
              label: "Added",
              data: added,
              backgroundColor: withAlpha(t.green, 0.75),
              borderColor: withAlpha(t.green, 0.95),
              borderWidth: 1,
              borderRadius: 10
            },
            {
              label: "Removed",
              data: removed,
              backgroundColor: withAlpha(t.red, 0.70),
              borderColor: withAlpha(t.red, 0.95),
              borderWidth: 1,
              borderRadius: 10
            }
          ]
        },
        options: baseOptions({
          scales: {
            y: { suggestedMax: yMax }
          }
        })
      });

      charts.set(id, chart);
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

      const sick = rows.map(r => Number(r.sick || 0));
      // ✅ this avoids 0..1 scale issues
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
            pointBackgroundColor: t.red
          }]
        },
        options: baseOptions({
          scales: {
            y: {
              suggestedMax: yMax,
              ticks: {
                // keep days feeling like days
                precision: 0
              }
            }
          }
        })
      });

      charts.set(id, chart);
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

  // Re-render on theme change / resize (helps when switching tabs / resizing)
  let rerenderTimer = null;
  function scheduleRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => renderAll(), 120);
  }

  document.addEventListener("DOMContentLoaded", renderAll);
  window.addEventListener("resize", scheduleRerender);

  // If your app toggles theme by changing data-theme/class on <html>,
  // this catches it and redraws to match the new CSS vars.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") {
        scheduleRerender();
        break;
      }
    }
  });
  try {
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  } catch {}
})();
