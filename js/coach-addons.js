/**
 * Scrummer — Coach Addons (No Snapshots) — v2.0
 * --------------------------------------------------------------
 * One source of truth: last 6 sprints.
 * Storage key: localStorage["scrummer_sprint_history_v1"]
 *
 * Backward compatible:
 * - If the model doesn't exist / has no sprints, falls back to:
 *     window.ScrummerCoachHistory.getRows()
 *
 * Requires:
 *  - Chart.js loaded before this file
 */

(() => {
  const $ = (id) => document.getElementById(id);

  // =========================
  // Storage model (no snapshots)
  // =========================
  const STORAGE_KEY = "scrummer_sprint_history_v1";

  const defaultModel = {
    version: 1,
    team: { name: "Demo Team", focusFactor: 0.8 },
    sprints: [] // oldest -> newest
  };

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadModel() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultModel);
    const m = safeParse(raw, null);
    if (!m || !Array.isArray(m.sprints)) return structuredClone(defaultModel);
    return m;
  }

  function lastNSprints(model, n = 6) {
    const s = Array.isArray(model?.sprints) ? model.sprints : [];
    return s.slice(Math.max(0, s.length - n));
  }

  // 1 focused person-day = 1 SP
  function calcCapacitySP(s) {
    const sprintDays = num(s?.sprintDays);
    const teamMembers = num(s?.teamMembers);
    const holidays = num(s?.holidays);
    const leaveDays = num(s?.leaveDays); // total person-days
    const focus = clamp01(s?.focusFactor ?? 0.8);

    const ideal = sprintDays * teamMembers;
    const available = Math.max(0, ideal - holidays - leaveDays);
    const focused = available * focus;
    return Math.round(focused);
  }

  function rowsFromModel(model) {
    const sprints = lastNSprints(model, 6);
    return sprints.map((s, idx) => {
      const committed = num(s?.committedSP);
      const completed = num(s?.completedSP);
      const cap = calcCapacitySP(s);

      return {
        sprint: String(s?.id ?? s?.name ?? `Sprint ${idx + 1}`),
        forecastCap: cap,
        actualCap: cap,
        committedSP: committed,
        completedSP: completed,
        addedSP: num(s?.unplannedSP ?? s?.addedSP ?? 0),
        removedSP: num(s?.removedSP ?? 0),
        sickLeaveDays: num(s?.sickLeaveDays ?? 0)
      };
    });
  }

  function loadRows() {
    const model = loadModel();
    if (Array.isArray(model?.sprints) && model.sprints.length) {
      return rowsFromModel(model);
    }

    const api = window.ScrummerCoachHistory;
    if (api && typeof api.getRows === "function") {
      const rows = api.getRows();
      return Array.isArray(rows) ? rows : [];
    }

    return [];
  }

  // =========================
  // Theme helpers
  // =========================
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function theme() {
    return {
      text: cssVar("--text-muted", "#6b7280"),
      ink: cssVar("--text-main", "#111827"),
      border: cssVar("--border-soft", "rgba(17,24,39,0.12)"),
      bg: cssVar("--bg-soft", "#ffffff"),
      indigo: cssVar("--indigo", "#6366f1"),
      green: cssVar("--green", "#22c55e"),
      red: cssVar("--red", "#ef4444"),
      amber: cssVar("--amber", "#f59e0b"),
      cyan: cssVar("--cyan", "#06b6d4"),
    };
  }

  function isDark() {
    const root = document.documentElement;
    if (root.classList.contains("dark")) return true;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // =========================
  // Data helpers
  // =========================
  function num(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function clamp01(v) {
    const x = Number(v);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function pick(r, keys, fallback = 0) {
    for (const k of keys) {
      if (r && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return r[k];
    }
    return fallback;
  }

  function normalize(rows) {
    return (rows || []).map((r, idx) => ({
      sprint: String(pick(r, ["sprint", "name", "label"], `Sprint ${idx + 1}`)),
      forecast: num(pick(r, ["forecastCap", "forecast", "forecastCapacity", "forecastCapacitySP", "forecastCapSP"])),
      actual: num(pick(r, ["actualCap", "actual", "actualCapacity", "actualCapacitySP", "actualCapSP"])),
      committed: num(pick(r, ["committed", "committedSP", "commit", "commitSP"])),
      completed: num(pick(r, ["completed", "completedSP", "done", "doneSP"])),
      added: num(pick(r, ["addedMid", "added", "addedSP", "scopeAdded", "scopeAddedSP", "unplannedSP"])),
      removed: num(pick(r, ["removedMid", "removed", "removedSP", "scopeRemoved", "scopeRemovedSP"])),
      sick: num(pick(r, ["sickLeave", "sick", "sickLeaveDays", "sickLeavePD", "sickLeavePersonDays"])),
    }));
  }

  // =========================
  // Chart.js helpers
  // =========================
  const charts = new Map();

  function destroyChart(id) {
    const c = charts.get(id);
    if (c) {
      c.destroy();
      charts.delete(id);
    }
  }

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function makeGradient(ctx, area, colorHex, alphaTop = 0.22, alphaBottom = 0.02) {
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, hexToRgba(colorHex, alphaTop));
    g.addColorStop(1, hexToRgba(colorHex, alphaBottom));
    return g;
  }

  function baseOptions() {
    const t = theme();
    const dark = isDark();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: t.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial", weight: "600" }
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: dark ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.96)",
          titleColor: dark ? "#fff" : t.ink,
          bodyColor: dark ? "rgba(255,255,255,0.85)" : t.text,
          borderColor: t.border,
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          caretPadding: 8,
          cornerRadius: 12
        }
      },
      scales: {
        x: {
          grid: { color: t.border, drawBorder: false },
          ticks: { color: t.text, font: { family: "Inter, system-ui", weight: "600" } }
        },
        y: {
          beginAtZero: true,
          grid: { color: t.border, drawBorder: false },
          ticks: { color: t.text, font: { family: "Inter, system-ui", weight: "600" } }
        }
      }
    };
  }

  function thinLineDataset(label, data, color) {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.0),
      tension: 0.35,
      fill: false,
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      pointBorderWidth: 0,
      pointBackgroundColor: color
    };
  }

  // =========================
  // Renderers
  // =========================
  function renderVelocity(rows) {
    const id = "hist_velocityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    const labels = rows.map(r => String(r.sprint).replace("Sprint ", ""));
    const data = rows.map(r => r.completed);

    const ctx = canvas.getContext("2d");

    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Completed SP",
          data,
          borderColor: t.green,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return hexToRgba(t.green, 0.14);
            return makeGradient(ctx, chartArea, t.green, 0.22, 0.02);
          },
          tension: 0.38,
          fill: true,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBorderWidth: 0,
          pointBackgroundColor: t.green,
        }]
      },
      options: baseOptions()
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderPredictability(rows) {
    const id = "hist_predictChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    const labels = rows.map(r => String(r.sprint).replace("Sprint ", ""));
    const committed = rows.map(r => r.committed);
    const completed = rows.map(r => r.completed);

    const ctx = canvas.getContext("2d");
    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          thinLineDataset("Committed", committed, t.indigo),
          thinLineDataset("Completed", completed, t.green),
        ]
      },
      options: baseOptions()
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderCapacity(rows) {
    const id = "hist_capacityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    const labels = rows.map(r => String(r.sprint).replace("Sprint ", ""));
    const forecast = rows.map(r => r.forecast);
    const actual = rows.map(r => r.actual);

    const ctx = canvas.getContext("2d");
    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          thinLineDataset("Forecast", forecast, t.amber),
          thinLineDataset("Actual", actual, t.cyan),
        ]
      },
      options: baseOptions()
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderDisruption(rows) {
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    const labels = rows.map(r => String(r.sprint).replace("Sprint ", ""));
    const added = rows.map(r => r.added);
    const removed = rows.map(r => r.removed);

    const ctx = canvas.getContext("2d");
    const cfg = {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Added",
            data: added,
            backgroundColor: hexToRgba(t.green, 0.85),
            borderRadius: 10,
            borderSkipped: false,
            barThickness: 18
          },
          {
            label: "Removed",
            data: removed,
            backgroundColor: hexToRgba(t.red, 0.85),
            borderRadius: 10,
            borderSkipped: false,
            barThickness: 18
          }
        ]
      },
      options: {
        ...baseOptions(),
        plugins: {
          ...baseOptions().plugins,
          legend: { ...baseOptions().plugins.legend, position: "top" }
        }
      }
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderSick(rows) {
    const id = "hist_sickChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const t = theme();
    const labels = rows.map(r => String(r.sprint).replace("Sprint ", ""));
    const sick = rows.map(r => Number(r.sick || 0));

    const maxVal = sick.length ? Math.max(...sick) : 0;
    const suggestedMax = Math.max(5, Math.ceil(maxVal + 1));

    const ctx = canvas.getContext("2d");
    const opts = baseOptions();

    opts.scales = opts.scales || {};
    opts.scales.y = {
      beginAtZero: true,
      suggestedMax,
      ticks: {
        color: theme().text,
        font: { family: "Inter, system-ui", weight: "600" },
        stepSize: 1
      },
      grid: { color: theme().border, drawBorder: false }
    };

    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Sick leave (person-days)",
          data: sick,
          borderColor: t.red,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return hexToRgba(t.red, 0.14);
            return makeGradient(ctx, chartArea, t.red, 0.18, 0.02);
          },
          tension: 0.35,
          fill: true,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBorderWidth: 0,
          pointBackgroundColor: t.red,
        }]
      },
      options: opts
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderAll() {
    if (!window.Chart) return;

    const rows = normalize(loadRows());
    if (!rows.length) return;

    renderVelocity(rows);
    renderPredictability(rows);
    renderCapacity(rows);
    renderDisruption(rows);
    renderSick(rows);

    // Debug signal in console so you know v2.0 loaded
    // eslint-disable-next-line no-console
    console.debug("[Scrummer] coach-addon.js v2.0 rendered", { source: localStorage.getItem(STORAGE_KEY) ? "model" : "fallback", points: rows.length });
  }

  // =========================
  // Rerender when visible
  // =========================
  function rerenderWhenVisible() {
    const tryNow = () => {
      const any = $("hist_velocityChart");
      if (!any) return;

      if (any.clientWidth < 60) {
        clearTimeout(tryNow._t);
        tryNow._t = setTimeout(tryNow, 120);
        return;
      }
      renderAll();
    };
    tryNow();
  }

  function wire() {
    setTimeout(renderAll, 0);

    // History table buttons (fallback mode)
    ["hist_demoBtn", "hist_saveBtn", "hist_resetBtn", "hist_autofillBtn"].forEach(id => {
      $(id)?.addEventListener("click", () => setTimeout(rerenderWhenVisible, 120));
    });

    window.addEventListener("scrummer:historyChanged", () => setTimeout(rerenderWhenVisible, 120));

    document.querySelectorAll(".tabBtn").forEach(btn => {
      btn.addEventListener("click", () => setTimeout(rerenderWhenVisible, 140));
    });

    window.addEventListener("hashchange", () => setTimeout(rerenderWhenVisible, 140));

    window.addEventListener("resize", () => {
      clearTimeout(wire._r);
      wire._r = setTimeout(rerenderWhenVisible, 180);
    });

    const wrap = document.querySelector(".chartGrid") || document.querySelector(".coachWrap");
    if ("ResizeObserver" in window && wrap) {
      const ro = new ResizeObserver(() => {
        clearTimeout(wire._ro);
        wire._ro = setTimeout(rerenderWhenVisible, 160);
      });
      ro.observe(wrap);
    }

    $("themeToggle")?.addEventListener("click", () => setTimeout(rerenderWhenVisible, 180));
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
