/**
 * Scrummer — Coach Addons — v200 (Elite)
 * --------------------------------------
 * - Slack palette only
 * - Predictability max 100%
 * - KPI tiles + Insights rendering
 * - Adds Commitment vs Delivery (rounded bars)
 * - No Team Health chart (Team Health is a KPI tile)
 *
 * Data source:
 * localStorage["scrummer_sprint_history_v1"]  (model {sprints:[]})
 * Fallback: window.ScrummerCoachHistory.getRows()
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "scrummer_sprint_history_v1";

  const COLORS = {
    blue: "#36C5F0",   // Slack
    green: "#2EB67D",
    yellow: "#ECB22E",
    red: "#E01E5A"
  };

  /* ----------------------------
     Storage / Model
  ----------------------------- */
  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

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

  function rowsFromModel(model) {
    return lastNSprints(model, 6).map((s, i) => ({
      sprint: String(s?.id ?? `Sprint ${i + 1}`),

      // Forecast capacity from table
      capacity: Number(s?.forecastCapacitySP ?? s?.forecastCap ?? s?.capacity ?? 0),

      actualCap: Number(s?.actualCapacitySP ?? s?.actualCap ?? 0),

      committed: Number(s?.committedSP ?? s?.committed ?? 0),
      completed: Number(s?.completedSP ?? s?.completed ?? 0),

      added: Number(s?.addedMid ?? s?.unplannedSP ?? s?.addedSP ?? 0),
      removed: Number(s?.removedMid ?? s?.removedSP ?? 0),

      sick: Number(s?.sickLeaveDays ?? s?.sickLeave ?? 0),
    }));
  }

  function normalizeFallbackRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    return rows.map((r, i) => ({
      sprint: String(r?.sprint ?? r?.name ?? r?.label ?? `Sprint ${i + 1}`),
      capacity: Number(r?.forecastCap ?? r?.capacity ?? 0),
      actualCap: Number(r?.actualCap ?? 0),
      committed: Number(r?.committed ?? r?.committedSP ?? 0),
      completed: Number(r?.completed ?? r?.completedSP ?? 0),
      added: Number(r?.addedMid ?? r?.added ?? 0),
      removed: Number(r?.removedMid ?? r?.removed ?? 0),
      sick: Number(r?.sickLeave ?? r?.sick ?? 0),
    }));
  }

  function loadRows() {
    const model = loadModel();
    if (model.sprints?.length) return rowsFromModel(model);
    const api = window.ScrummerCoachHistory;
    if (api?.getRows) return normalizeFallbackRows(api.getRows());
    return [];
  }

  /* ----------------------------
     Chart helpers
  ----------------------------- */
  function gridColor() { return "rgba(15, 23, 42, 0.06)"; }

  function gradientFill(context, colorHex, topAlpha = 0.32, bottomAlpha = 0.05) {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) return `${colorHex}22`;

    const toRgb = (hex) => {
      const h = String(hex).replace("#", "");
      const full = (h.length === 3) ? h.split("").map(c => c+c).join("") : h;
      const r = parseInt(full.slice(0,2),16);
      const g = parseInt(full.slice(2,4),16);
      const b = parseInt(full.slice(4,6),16);
      return { r,g,b };
    };

    const { r,g,b } = toRgb(colorHex);
    const g1 = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g1.addColorStop(0, `rgba(${r},${g},${b},${topAlpha})`);
    g1.addColorStop(1, `rgba(${r},${g},${b},${bottomAlpha})`);
    return g1;
  }

  function baseOptions({ yStep = 10, yMin = 0, yMax = null, yIsPercent = false, tooltipSuffix = "" } = {}) {
    const yTicks = {
      stepSize: yStep,
      color: "rgba(100,116,139,0.85)",
      font: { weight: 600 },
      callback: (v) => yIsPercent ? `${v}%` : v
    };

    const yScale = {
      beginAtZero: true,
      ticks: yTicks,
      grid: { color: gridColor(), drawBorder: false },
      border: { display: false }
    };
    if (Number.isFinite(yMax)) yScale.max = yMax;

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { color: "rgba(100,116,139,0.85)", font: { weight: 600 }, maxRotation: 0 },
          grid: { display: false },
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
          callbacks: {
            label: (ctx) => {
              const v = Number.isFinite(ctx.parsed?.y) ? ctx.parsed.y : (ctx.raw ?? 0);
              return `${ctx.dataset.label}: ${v}${tooltipSuffix}`;
            }
          }
        }
      }
    };
  }

  function lineDataset(color) {
    return {
      borderColor: color,
      borderWidth: 3,
      tension: 0.42,
      cubicInterpolationMode: "monotone",
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: color,
      pointBorderWidth: 2
    };
  }

  /* Predictability 100% target line */
  const predictTargetLine = {
    id: "predictTargetLine",
    afterDatasetsDraw(chart) {
      if (chart?.canvas?.id !== "hist_predictChart") return;
      const yScale = chart.scales?.y;
      if (!yScale) return;

      const y = yScale.getPixelForValue(100);
      const { left, right } = chart.chartArea;
      const ctx = chart.ctx;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(15,23,42,0.18)";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const charts = new Map();
  function destroyChart(id) {
    if (charts.has(id)) {
      charts.get(id).destroy();
      charts.delete(id);
    }
  }

  /* ----------------------------
     KPI + Insights
  ----------------------------- */
  const mean = (a) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
  const stdev = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    const v = mean(a.map(x => (x-m)*(x-m)));
    return Math.sqrt(v);
  };
  const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n)) : "—");

  function setText(id, txt){
    const el = $(id);
    if (el) el.textContent = txt;
  }

  function updateKPIs(rows){
    const completed = rows.map(r => r.completed || 0);
    const committed = rows.map(r => r.committed || 0);
    const cap = rows.map(r => r.capacity || 0);
    const churn = rows.map(r => (r.added||0) + (r.removed||0));
    const sick = rows.map(r => r.sick || 0);

    const velAvg = mean(completed);
    const velSd = stdev(completed);

    const pred = rows.map(r => {
      const c = r.committed || 0;
      const d = r.completed || 0;
      if (!c) return 0;
      return Math.min(100, Math.round((d/c)*100));
    });
    const predAvg = mean(pred);
    const predLatest = pred[pred.length-1] ?? 0;

    const churnAvg = mean(churn);
    const churnLatest = churn[churn.length-1] ?? 0;

    const sickTotal = sick.reduce((s,x)=>s+x,0);
    const sickLatest = sick[sick.length-1] ?? 0;

    const ocLatest = (cap[cap.length-1] ? (committed[committed.length-1] / cap[cap.length-1]) : 0);

    setText("kpi_velAvg", fmt(velAvg));
    setText("kpi_velVar", `Variance: ${fmt(velSd)}`);

    setText("kpi_predAvg", `${fmt(predAvg)}%`);
    setText("kpi_predLatest", `Latest: ${fmt(predLatest)}%`);

    setText("kpi_scopeAvg", fmt(churnAvg));
    setText("kpi_scopeHint", `Latest: ${fmt(churnLatest)}`);

    setText("kpi_sickTotal", fmt(sickTotal));
    setText("kpi_sickLatest", `Latest: ${fmt(sickLatest)}`);

    setText("kpi_overcommit", ocLatest ? `${Math.round(ocLatest*100)}%` : "—");
    setText("kpi_overcommitHint", "Committed ÷ Forecast");
  }

  function renderInsights(rows){
    const host = $("coach_insightsStack");
    if (!host) return;

    const last = rows[rows.length-1] || {};
    const predLatest = last.committed ? Math.min(100, Math.round((last.completed/last.committed)*100)) : 0;
    const overcommit = last.capacity ? (last.committed / last.capacity) : 0;
    const churnAvg = mean(rows.map(r => (r.added||0)+(r.removed||0)));
    const velSd = stdev(rows.map(r => r.completed||0));

    const items = [];

    if (overcommit > 1.05){
      items.push({
        tag: "RISK",
        title: "Overcommit risk detected",
        text: `Committed is above forecast capacity (${Math.round(overcommit*100)}%). Expect spillover.`,
        action: "Action: Reduce scope 5–10% or add buffer before start."
      });
    } else {
      items.push({
        tag: "INFO",
        title: "Commitment looks healthy",
        text: `Committed is within forecast capacity (${Math.round(overcommit*100)}%).`,
        action: "Keep it up: maintain the same buffer and refinement cadence."
      });
    }

    if (velSd >= 6){
      items.push({
        tag: "WATCH",
        title: "Velocity variance is high",
        text: `Completion varies sprint-to-sprint. Forecast confidence is lower.`,
        action: "Action: track carryover and reduce mid-sprint scope changes."
      });
    } else {
      items.push({
        tag: "INFO",
        title: "Velocity is stable",
        text: "Delivery trend looks stable across the last 6 sprints.",
        action: "You can forecast with higher confidence."
      });
    }

    if (churnAvg >= 6){
      items.push({
        tag: "WATCH",
        title: "Scope churn is high",
        text: `Average churn is ${Math.round(churnAvg)} SP (added+removed).`,
        action: "Action: tighten refinement + add a scope buffer."
      });
    } else {
      items.push({
        tag: "INFO",
        title: "Scope churn is under control",
        text: `Average churn is ${Math.round(churnAvg)} SP.`,
        action: "Keep protecting the sprint goal."
      });
    }

    // render
    host.innerHTML = items.slice(0,3).map(it => `
      <div class="insightCard">
        <div class="insightHeader">
          <span class="insightTag">${it.tag}</span>
          <h3 class="insightTitle">${it.title}</h3>
        </div>
        <div class="insightText">${it.text}</div>
        <div class="insightAction">${it.action}</div>
      </div>
    `).join("");
  }

  /* ----------------------------
     Charts
  ----------------------------- */

  function renderVelocity(rows){
    const id = "hist_velocityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [{
          label: "Completed",
          data: rows.map(r => r.completed),
          ...lineDataset(COLORS.green),
          backgroundColor: (ctx) => gradientFill(ctx, COLORS.green, 0.28, 0.04)
        }]
      },
      options: baseOptions({ yStep: 10 })
    });

    charts.set(id, chart);
  }

  function renderPredictability(rows){
    const id = "hist_predictChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const pct = rows.map(r => {
      const c = r.committed || 0;
      const d = r.completed || 0;
      if (!c) return 0;
      return Math.min(100, Math.round((d/c)*100));  // ✅ clamp to 100
    });

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [{
          label: "Predictability",
          data: pct,
          ...lineDataset(COLORS.blue),
          backgroundColor: (ctx) => gradientFill(ctx, COLORS.blue, 0.22, 0.03)
        }]
      },
      options: baseOptions({ yStep: 10, yMax: 100, yIsPercent: true, tooltipSuffix: "%" }),
      plugins: [predictTargetLine]
    });

    charts.set(id, chart);
  }

  function renderCommitment(rows){
    const id = "hist_commitChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          {
            label: "Committed",
            data: rows.map(r => r.committed),
            backgroundColor: "rgba(54,197,240,0.85)",
            borderRadius: 12,
            borderSkipped: false,
            barPercentage: 0.75,
            categoryPercentage: 0.75
          },
          {
            label: "Completed",
            data: rows.map(r => r.completed),
            backgroundColor: "rgba(46,182,125,0.85)",
            borderRadius: 12,
            borderSkipped: false,
            barPercentage: 0.75,
            categoryPercentage: 0.75
          }
        ]
      },
      options: (() => {
        const opt = baseOptions({ yStep: 10 });
        opt.scales.x.grid.display = false;
        opt.layout = { padding: { left: 6, right: 6 } };
        return opt;
      })()
    });

    charts.set(id, chart);
  }

  function renderCapacity(rows){
    const id = "hist_capacityChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          {
            label: "Forecast",
            data: rows.map(r => r.capacity),
            ...lineDataset(COLORS.yellow),
            backgroundColor: (ctx) => gradientFill(ctx, COLORS.yellow, 0.18, 0.03)
          },
          {
            label: "Completed",
            data: rows.map(r => r.completed),
            ...lineDataset(COLORS.green),
            backgroundColor: (ctx) => gradientFill(ctx, COLORS.green, 0.18, 0.03)
          }
        ]
      },
      options: baseOptions({ yStep: 10 })
    });

    charts.set(id, chart);
  }

  function renderDisruption(rows){
    const id = "hist_disruptionChart";
    const canvas = $(id);
    if (!canvas) return;

    destroyChart(id);

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map(r => r.sprint),
        datasets: [
          {
            label: "Added",
            data: rows.map(r => r.added),
            backgroundColor: "rgba(46,182,125,0.85)",
            borderRadius: 12,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: 0.72
          },
          {
            label: "Removed",
            data: rows.map(r => r.removed),
            backgroundColor: "rgba(224,30,90,0.85)",
            borderRadius: 12,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: 0.72
          }
        ]
      },
      options: (() => {
        const opt = baseOptions({ yStep: 10 });
        opt.scales.x.grid.display = false;
        opt.layout = { padding: { left: 6, right: 6 } };
        return opt;
      })()
    });

    charts.set(id, chart);
  }

  function renderAll(){
    if (!window.Chart) return;
    const rows = loadRows();
    if (!rows.length) return;

    updateKPIs(rows);
    renderInsights(rows);

    renderVelocity(rows);
    renderPredictability(rows);
    renderCommitment(rows);
    renderCapacity(rows);
    renderDisruption(rows);
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
