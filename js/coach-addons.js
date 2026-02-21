/**
 * Scrummer — Coach Addons (Clean / No Snapshots)
 * --------------------------------------------------------------
 * Uses last 6 sprints from:
 * localStorage["scrummer_sprint_history_v1"]
 *
 * Falls back to window.ScrummerCoachHistory.getRows()
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
      removed: Number(s?.removedSP ?? s?.removedMid ?? s?.scopeRemoved ?? 0),

      // Health
      sick: Number(s?.sickLeaveDays ?? s?.sickLeave ?? 0),
    }));
  }

  // Normalize any row shapes (from history.js) into a consistent shape
  function normalizeFallbackRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    return rows.map((r, i) => ({
      sprint: String(r?.sprint ?? r?.name ?? r?.label ?? `S${i + 1}`),

      // Capacity variants
      capacity: Number(
        r?.capacity ??
        r?.forecastCap ??
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
        r?.unplannedSP ??
        r?.addedSP ??
        r?.addedMid ??
        r?.added ??
        r?.scopeAdded ??
        r?.scopeAddedSP ??
        0
      ),

      removed: Number(
        r?.removedSP ??
        r?.removedMid ??
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
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback;
  }

  function theme() {
    return {
      text: cssVar("--text-muted", "#6b7280"),
      border: cssVar("--border-soft", "rgba(0,0,0,0.1)"),
      indigo: cssVar("--indigo", "#6366f1"),
      green: cssVar("--green", "#22c55e"),
      red: cssVar("--red", "#ef4444"),
      amber: cssVar("--amber", "#f59e0b"),
    };
  }

  function baseOptions() {
    const t = theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: t.text },
          grid: { color: t.border }
        },
        y: {
          beginAtZero: true,
          ticks: { color: t.text },
          grid: { color: t.border }
        }
      },
      plugins: {
        legend: {
          labels: { color: t.text }
        }
      }
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
          borderColor: t.green,
          backgroundColor: "rgba(34,197,94,0.15)",
          tension: 0.35,
          fill: true
        }]
      },
      options: baseOptions()
    });

    charts.set(id, chart);
  }

  function renderPredictability(rows) {
    const id = "hist_predictChart";
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
            label: "Committed",
            data: rows.map(r => r.committed),
            borderColor: t.indigo,
            tension: 0.35
          },
          {
            label: "Completed",
            data: rows.map(r => r.completed),
            borderColor: t.green,
            tension: 0.35
          }
        ]
      },
      options: baseOptions()
    });

    charts.set(id, chart);
  }

  /* Capacity vs Completed */
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
            borderColor: t.amber,
            tension: 0.35
          },
          {
            label: "Completed",
            data: rows.map(r => r.completed),
            borderColor: t.green,
            tension: 0.35
          }
        ]
      },
      options: baseOptions()
    });

    charts.set(id, chart);
  }

  /* ✅ Always show Removed (even if 0) */
  function renderDisruption(rows) {
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);
    const t = theme();

    const added = rows.map(r => Number(r.added || 0));
    const removed = rows.map(r => Number(r.removed || 0));

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          { label: "Added", data: added, backgroundColor: t.green },
          { label: "Removed", data: removed, backgroundColor: t.red }
        ]
      },
      options: baseOptions()
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
          borderColor: t.red,
          tension: 0.35
        }]
      },
      options: baseOptions()
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

  document.addEventListener("DOMContentLoaded", renderAll);
})();