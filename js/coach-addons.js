/**
 * Scrummer — Coach Addons (Safe Extension)
 * -----------------------------------------
 * - DOES NOT override history
 * - DOES NOT modify setup
 * - Only reads window.Scrummer.history
 * - Draws charts safely
 */

(() => {

  function getHistorySafe() {
    return window.Scrummer?.history?.getHistory?.() || [];
  }

  function lastN(arr, n) {
    return arr.slice(-n);
  }

  function drawLineChart(canvasId, values, color = "#6366f1") {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!values.length) {
      ctx.fillStyle = "#9ca3af";
      ctx.fillText("No data yet", 10, 20);
      return;
    }

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const padding = 20;
    const stepX = (width - padding * 2) / (values.length - 1 || 1);

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;

    values.forEach((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  }

  function renderCharts() {
    const history = lastN(getHistorySafe(), 10);

    const velocity = history.map(h => Number(h.avgVelocity || 0));
    const risk = history.map(h => Number(h.riskScore || 0));
    const predictability = history.map(h => {
      const cap = Number(h.capacitySP || 0);
      const com = Number(h.committedSP || 0);
      return cap > 0 ? (com / cap) : 0;
    });

    drawLineChart("chart_velocity", velocity, "#22c55e");
    drawLineChart("chart_risk", risk, "#ef4444");
    drawLineChart("chart_predictability", predictability, "#6366f1");
  }

  function autoRefreshHook() {
    const originalSave = window.Scrummer?.history?.saveSnapshot;
    if (!originalSave) return;

    window.Scrummer.history.saveSnapshot = function(...args) {
      const result = originalSave.apply(this, args);
      setTimeout(renderCharts, 50);
      return result;
    };
  }

  function init() {
    renderCharts();
    autoRefreshHook();
  }

  document.addEventListener("DOMContentLoaded", init);

})();


// ------------------------------------------------------------
// Scrummer Coach Add-ons — History Table Charts (safe)
// - Works with coach-history.js (window.ScrummerCoachHistory.getRows())
// - Supports addedMid/removedMid column names
// - Re-renders on scrummer:historyChanged and resize
// ------------------------------------------------------------
(() => {
  const $ = (id) => document.getElementById(id);

  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

  function loadSprintRows() {
    // ✅ Your real API
    if (window.ScrummerCoachHistory && typeof window.ScrummerCoachHistory.getRows === "function") {
      const rows = window.ScrummerCoachHistory.getRows();
      return Array.isArray(rows) ? rows : [];
    }

    // fallback: localStorage
    const candidates = [
      "scrummer_coach_history_v1",          // ✅ your KEY
      "scrummer_coach_history_rows_v1",
      "scrummer_sprint_history_v1",
      "scrummer_history_table_v1"
    ];

    for (const k of candidates) {
      const raw = localStorage.getItem(k);
      const arr = safeParse(raw, null);
      if (Array.isArray(arr) && arr.length) return arr;
    }

    return [];
  }

  function normalize(rows) {
    return (rows || []).map((r, idx) => {
      const n = (v) => {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };

      const sprint =
        r.sprint || r.sprintLabel || r.label || r.name ||
        `Sprint ${idx + 1}`;

      return {
        sprintLabel: String(sprint),
        forecastCap: n(r.forecastCap ?? r.forecast ?? r.capacityForecast),
        actualCap:   n(r.actualCap ?? r.actual ?? r.capacityActual),
        committed:   n(r.committed ?? r.committedSP),
        completed:   n(r.completed ?? r.completedSP ?? r.velocity ?? r.done),

        // ✅ IMPORTANT: map your columns
        added:       n(r.added ?? r.addedMid ?? r.spAdded ?? r.scopeAdded),
        removed:     n(r.removed ?? r.removedMid ?? r.spRemoved ?? r.scopeRemoved),

        sick:        n(r.sick ?? r.sickLeave ?? r.sickDays),
      };
    });
  }

  // --- canvas helpers ---
  function clear(ctx, w, h) { ctx.clearRect(0, 0, w, h); }

  function drawAxes(ctx, w, h, pad) {
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawLine(ctx, points) {
    if (points.length < 2) return;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawDots(ctx, points) {
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBars(ctx, bars) {
    bars.forEach(b => {
      ctx.globalAlpha = 0.85;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
    });
  }

  function text(ctx, x, y, str, align="left") {
    ctx.textAlign = align;
    ctx.font = "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(str, x, y);
  }

  function scalePoints(values, w, h, pad) {
    const max = Math.max(1, ...values);
    const min = 0;

    const n = values.length;
    const step = n > 1 ? (w - pad*2) / (n - 1) : 0;

    return values.map((v, i) => {
      const x = pad + step * i;
      const t = (v - min) / (max - min);
      const y = (h - pad) - t * (h - pad*2);
      return { x, y, v };
    });
  }

  function setupCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;

    const cssW = canvas.clientWidth || canvas.offsetWidth || 600;
    const cssH = Number(canvas.getAttribute("height") || 140);

    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    return { ctx, W: cssW, H: cssH };
  }

  // --- renderers ---
  function renderVelocity(canvas, labels, completed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const pts = scalePoints(completed, W, H, pad);
    drawLine(ctx, pts);
    drawDots(ctx, pts);

    ctx.globalAlpha = 0.8;
    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad*2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l, "center");
    });
    ctx.globalAlpha = 1;

    text(ctx, pad, 16, "Completed SP (Velocity)");
  }

  function renderPredict(canvas, labels, committed, completed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsA = scalePoints(committed, W, H, pad);
    const ptsB = scalePoints(completed, W, H, pad);

    ctx.globalAlpha = 1;
    drawLine(ctx, ptsA);
    drawDots(ctx, ptsA);

    ctx.globalAlpha = 0.6;
    drawLine(ctx, ptsB);
    drawDots(ctx, ptsB);

    ctx.globalAlpha = 1;

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad*2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l, "center");
    });

    text(ctx, pad, 16, "Committed vs Completed");
    const pcts = committed.map((c, i) => c > 0 ? Math.round((completed[i] / c) * 100) : 0);
    text(ctx, W - pad, 16, `Latest: ${pcts[pcts.length - 1] || 0}%`, "right");
  }

  function renderCapacity(canvas, labels, forecast, actual) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsF = scalePoints(forecast, W, H, pad);
    const ptsA = scalePoints(actual, W, H, pad);

    ctx.globalAlpha = 1;
    drawLine(ctx, ptsF);
    drawDots(ctx, ptsF);

    ctx.globalAlpha = 0.6;
    drawLine(ctx, ptsA);
    drawDots(ctx, ptsA);
    ctx.globalAlpha = 1;

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad*2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l, "center");
    });

    text(ctx, pad, 16, "Forecast vs Actual Capacity");
  }

  function renderDisruption(canvas, labels, added, removed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const max = Math.max(1, ...added, ...removed);
    const barW = (W - pad*2) / labels.length;
    const inner = Math.max(10, barW * 0.32);

    const bars = [];
    labels.forEach((_, i) => {
      const ax = pad + barW*i + barW*0.18;
      const rx = pad + barW*i + barW*0.54;

      const ah = ((added[i] / max) * (H - pad*2));
      const rh = ((removed[i] / max) * (H - pad*2));

      bars.push({ x: ax, y: (H - pad) - ah, w: inner, h: ah });
      bars.push({ x: rx, y: (H - pad) - rh, w: inner, h: rh });
    });

    drawBars(ctx, bars);

    labels.forEach((l, i) => {
      const x = pad + barW*i + barW/2;
      text(ctx, x, H - 10, l, "center");
    });

    text(ctx, pad, 16, "Sprint Disruption (Added vs Removed)");
    text(ctx, W - pad, 16, "Left=Added  Right=Removed", "right");
  }

  function renderSick(canvas, labels, sick) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const pts = scalePoints(sick, W, H, pad);
    drawLine(ctx, pts);
    drawDots(ctx, pts);

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad*2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l, "center");
    });

    text(ctx, pad, 16, "Sick Leave (person-days)");
  }

  function renderAllCharts() {
    const rows = normalize(loadSprintRows());
    if (!rows.length) return;

    const labels    = rows.map(r => r.sprintLabel);
    const completed = rows.map(r => r.completed);
    const committed = rows.map(r => r.committed);
    const forecast  = rows.map(r => r.forecastCap);
    const actual    = rows.map(r => r.actualCap);
    const added     = rows.map(r => r.added);
    const removed   = rows.map(r => r.removed);
    const sick      = rows.map(r => r.sick);

    const c1 = $("hist_velocityChart");
    const c2 = $("hist_predictChart");
    const c3 = $("hist_capacityChart");
    const c4 = $("hist_disruptionChart");
    const c5 = $("hist_sickChart");

    if (c1) renderVelocity(c1, labels, completed);
    if (c2) renderPredict(c2, labels, committed, completed);
    if (c3) renderCapacity(c3, labels, forecast, actual);
    if (c4) renderDisruption(c4, labels, added, removed);
    if (c5) renderSick(c5, labels, sick);
  }

  function wire() {
    renderAllCharts();

    // ✅ Best: react to the event fired by coach-history.js (Save/Reset/CSV etc.)
    window.addEventListener("scrummer:historyChanged", () => {
      setTimeout(renderAllCharts, 50);
    });

    // still support button clicks (safe)
    ["hist_demoBtn", "hist_saveBtn", "hist_resetBtn", "hist_autofillBtn"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => setTimeout(renderAllCharts, 50));
    });

    window.addEventListener("resize", () => {
      clearTimeout(wire._t);
      wire._t = setTimeout(renderAllCharts, 120);
    });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();