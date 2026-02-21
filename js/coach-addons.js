/**
 * Scrummer — Coach Addons (Premium Charts / Analytics look) — v1.1
 * --------------------------------------------------------------
 * Uses Chart.js for polished charts:
 * - gradients, smooth lines, tooltips, legends
 * - crisp grid + theme-aware colors
 * - mobile friendly (handles hidden tab sizing)
 *
 * Requires:
 *  - coach-history.js exposes window.ScrummerCoachHistory.getRows()
 *  - Chart.js loaded before this file
 */

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Theme helpers ----------
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

      // Accent palette (premium)
      indigo: cssVar("--indigo", "#6366f1"),
      green: cssVar("--green", "#22c55e"),
      red: cssVar("--red", "#ef4444"),
      amber: cssVar("--amber", "#f59e0b"),
      cyan: cssVar("--cyan", "#06b6d4"),
    };
  }

  function isDark() {
    // If your theme.js toggles a class like "dark", this will work.
    // If not, we fall back to prefers-color-scheme.
    const root = document.documentElement;
    if (root.classList.contains("dark")) return true;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // ---------- Data ----------
  function loadRows() {
    // 1) Preferred: coach-history.js API
    const api = window.ScrummerCoachHistory;
    if (api && typeof api.getRows === "function") {
      const rows = api.getRows();
      return Array.isArray(rows) ? rows : [];
    }

    // 2) Fallback: read directly from the history table DOM (always works)
    const tbody = document.getElementById("hist_rows");
    if (!tbody) return [];

    const rows = [];
    const trs = Array.from(tbody.querySelectorAll("tr"));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length) continue;

      // helper to read either input value or text
      const readCell = (i) => {
        const td = tds[i];
        if (!td) return "";
        const inp = td.querySelector("input, textarea, select");
        if (inp) return String(inp.value ?? "").trim();
        return String(td.textContent ?? "").trim();
      };

      rows.push({
        sprint: readCell(0),
        forecastCap: readCell(1),
        actualCap: readCell(2),
        committed: readCell(3),
        completed: readCell(4),
        addedMid: readCell(5),
        removedMid: readCell(6),
        sickLeave: readCell(7),
      });
    }
    return rows;
  }
    return [];
  }

  function toNum(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  // Accept multiple possible field names (prevents "empty chart" when keys differ)
  function pick(r, keys, fallback = 0) {
    for (const k of keys) {
      if (r && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return r[k];
    }
    return fallback;
  }

  function normalize(rows) {
    // Support both variants:
    // - forecastCap, actualCap, committed, completed, addedMid, removedMid, sickLeave
    // - forecastCapSP, actualCapSP, committedSP, completedSP, addedSP, removedSP, sickLeaveDays, etc.
    return (rows || []).map((r, idx) => ({
      sprint: String(pick(r, ["sprint", "name", "label"], `Sprint ${idx + 1}`)),
      forecast: toNum(pick(r, ["forecastCap", "forecast", "forecastCapacity", "forecastCapacitySP", "forecastCapSP"])),
      actual: toNum(pick(r, ["actualCap", "actual", "actualCapacity", "actualCapacitySP", "actualCapSP"])),
      committed: toNum(pick(r, ["committed", "committedSP", "commit", "commitSP"])),
      completed: toNum(pick(r, ["completed", "completedSP", "done", "doneSP"])),
      added: toNum(pick(r, ["addedMid", "added", "addedSP", "scopeAdded", "scopeAddedSP"])),
      removed: toNum(pick(r, ["removedMid", "removed", "removedSP", "scopeRemoved", "scopeRemovedSP"])),
      sick: toNum(pick(r, ["sickLeave", "sick", "sickLeaveDays", "sickLeavePD", "sickLeavePersonDays"])),
    }));
  }

  // ---------- Chart.js helpers ----------
  const charts = new Map(); // canvasId -> chartInstance

  function destroyChart(id) {
    const c = charts.get(id);
    if (c) {
      c.destroy();
      charts.delete(id);
    }
  }

  function makeGradient(ctx, area, colorHex, alphaTop = 0.22, alphaBottom = 0.02) {
    // Premium soft fill gradient
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, hexToRgba(colorHex, alphaTop));
    g.addColorStop(1, hexToRgba(colorHex, alphaBottom));
    return g;
  }

  function hexToRgba(hex, a) {
    const h = String(hex || "").replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
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

  function lineDataset(label, data, color, ctx, chartArea) {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: chartArea ? makeGradient(ctx, chartArea, color) : hexToRgba(color, 0.12),
      tension: 0.35,
      fill: true,
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBorderWidth: 0,
      pointBackgroundColor: color
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

  function emptyStatePlugin(message) {
    return {
      id: "emptyState",
      afterDraw(chart) {
        const ds = (chart.data?.datasets || []).flatMap(d => d?.data || []);
        const hasAny = ds.some(v => Number(v) !== 0) || ds.length > 0;
        if (!hasAny) return;

        // If all points are 0, we still consider it "data" and we don't overlay.
      }
    };
  }

  // ---------- Renderers ----------
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
      data: { labels, datasets: [] },
      options: baseOptions(),
      plugins: [{
        // lazy gradient fill once chart has layout
        id: "gradientFillVelocity",
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          chart.data.datasets[0] = lineDataset("Completed SP", data, t.green, ctx, chartArea);
        }
      }]
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
    const sick = rows.map(r => r.sick);

    const ctx = canvas.getContext("2d");
    const cfg = {
      type: "line",
      data: { labels, datasets: [] },
      options: baseOptions(),
      plugins: [{
        id: "gradientFillSick",
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          chart.data.datasets[0] = lineDataset("Sick leave (person-days)", sick, t.red, ctx, chartArea);
        }
      }]
    };

    const chart = new Chart(ctx, cfg);
    charts.set(id, chart);
  }

  function renderAll() {
    if (!window.Chart) return; // Chart.js not loaded
    const rows = normalize(loadRows());

    // Even if everything is zero, we still render (so user sees a baseline)
    if (!rows.length) {
      // Nothing to render yet
      return;
    }

    renderVelocity(rows);
    renderPredictability(rows);
    renderCapacity(rows);
    renderDisruption(rows);
    renderSick(rows);
  }

  // ---------- “Hidden tab” + Mobile fixes ----------
  function rerenderWhenVisible() {
    // When a canvas is in a hidden tab, clientWidth is 0 and charts look broken.
    // So: re-render after tab switch with a short delay.
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
    // initial
    setTimeout(renderAll, 0);

    // History table buttons
    ["hist_demoBtn", "hist_saveBtn", "hist_resetBtn", "hist_autofillBtn"].forEach(id => {
      $(id)?.addEventListener("click", () => setTimeout(rerenderWhenVisible, 120));
    });

    // coach-history.js emits this event
    window.addEventListener("scrummer:historyChanged", () => setTimeout(rerenderWhenVisible, 120));

    // tab open (health/copilot buttons)
    document.querySelectorAll(".tabBtn").forEach(btn => {
      btn.addEventListener("click", () => setTimeout(rerenderWhenVisible, 140));
    });

    window.addEventListener("hashchange", () => setTimeout(rerenderWhenVisible, 140));

    // resize / orientation change
    window.addEventListener("resize", () => {
      clearTimeout(wire._r);
      wire._r = setTimeout(rerenderWhenVisible, 180);
    });

    // ResizeObserver (best for mobile layout shifts)
    const wrap = document.querySelector(".chartGrid") || document.querySelector(".coachWrap");
    if ("ResizeObserver" in window && wrap) {
      const ro = new ResizeObserver(() => {
        clearTimeout(wire._ro);
        wire._ro = setTimeout(rerenderWhenVisible, 160);
      });
      ro.observe(wrap);
    }

    // If your theme toggle flips CSS variables, re-render to refresh colors
    $("themeToggle")?.addEventListener("click", () => setTimeout(rerenderWhenVisible, 180));
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
