/**
 * Scrummer — Coach Addons (Safe Extension)
 * -----------------------------------------
 * - DOES NOT override history
 * - DOES NOT modify setup
 * - Reads history safely
 * - Draws charts with theme-aware colors (light/dark)
 */

(() => {
  // ---------- Theme helpers ----------
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  const COLORS = {
    // Lines
    green:  cssVar("--green",  "#22c55e"),
    red:    cssVar("--red",    "#ef4444"),
    indigo: cssVar("--indigo", "#6366f1"),
    amber:  cssVar("--amber",  "#f59e0b"),
    cyan:   cssVar("--cyan",   "#06b6d4"),

    // UI
    axis:   cssVar("--border-soft", "rgba(17,24,39,0.18)"),
    text:   cssVar("--text-muted",  "#6b7280"),
    ink:    cssVar("--text-main",   "#111827"),
    bgSoft: cssVar("--bg-soft",     "#ffffff"),
  };

  // ---------- Snapshot charts (window.Scrummer.history) ----------
  function getHistorySafe() {
    return window.Scrummer?.history?.getHistory?.() || [];
  }

  function lastN(arr, n) {
    return arr.slice(-n);
  }

  function drawSimpleLine(canvasId, values, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height; // keep height attribute

    ctx.clearRect(0, 0, w, h);

    if (!values.length) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("No data yet", 10, 20);
      return;
    }

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const pad = 20;
    const stepX = (w - pad * 2) / (values.length - 1 || 1);

    // axis
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // line
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;

    values.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // dots
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderSnapshotCharts() {
    const history = lastN(getHistorySafe(), 10);

    const velocity = history.map(h => Number(h.avgVelocity || 0));
    const risk = history.map(h => Number(h.riskScore || 0));
    const predictability = history.map(h => {
      const cap = Number(h.capacitySP || 0);
      const com = Number(h.committedSP || 0);
      return cap > 0 ? (com / cap) : 0;
    });

    drawSimpleLine("chart_velocity", velocity, COLORS.green);
    drawSimpleLine("chart_risk", risk, COLORS.red);
    drawSimpleLine("chart_predictability", predictability, COLORS.indigo);
  }

  function autoRefreshHook() {
    const originalSave = window.Scrummer?.history?.saveSnapshot;
    if (!originalSave) return;

    window.Scrummer.history.saveSnapshot = function (...args) {
      const result = originalSave.apply(this, args);
      setTimeout(() => {
        renderSnapshotCharts();
        renderAllHistoryCharts();
      }, 60);
      return result;
    };
  }

  // ---------- History table charts (ScrummerCoachHistory / localStorage) ----------
  const $ = (id) => document.getElementById(id);
  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

  function loadSprintRows() {
    // Preferred: your coach-history.js exposes this
    if (window.ScrummerCoachHistory && typeof window.ScrummerCoachHistory.getRows === "function") {
      const rows = window.ScrummerCoachHistory.getRows();
      return Array.isArray(rows) ? rows : [];
    }

    // fallback keys (safe)
    const candidates = [
      "scrummer_coach_history_v1",
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

      const sprint = r.sprint || r.sprintLabel || r.label || r.name || `Sprint ${idx + 1}`;

      return {
        sprintLabel: String(sprint),
        forecastCap: n(r.forecastCap ?? r.forecast ?? r.capacityForecast),
        actualCap:   n(r.actualCap ?? r.actual ?? r.capacityActual),
        committed:   n(r.committed ?? r.committedSP),
        completed:   n(r.completed ?? r.completedSP ?? r.velocity ?? r.done),
        // your coach-history.js uses addedMid/removedMid/sickLeave:
        added:       n(r.addedMid ?? r.added ?? r.spAdded ?? r.scopeAdded),
        removed:     n(r.removedMid ?? r.removed ?? r.spRemoved ?? r.scopeRemoved),
        sick:        n(r.sickLeave ?? r.sick ?? r.sickDays),
      };
    });
  }

  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
  }

  function setupCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = Number(canvas.getAttribute("height")) || 140;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // reset transforms (important on re-render)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { ctx, W: cssW, H: cssH };
  }

  function text(ctx, x, y, str, align = "left") {
    ctx.textAlign = align;
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(str, x, y);
  }

  function drawAxes(ctx, W, H, pad) {
    ctx.strokeStyle = COLORS.axis;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function scalePoints(values, W, H, pad) {
    const max = Math.max(1, ...values);
    const min = 0;
    const n = values.length;
    const step = n > 1 ? (W - pad * 2) / (n - 1) : 0;

    return values.map((v, i) => {
      const x = pad + step * i;
      const t = (v - min) / (max - min);
      const y = (H - pad) - t * (H - pad * 2);
      return { x, y, v };
    });
  }

  function drawLine(ctx, points, color, alpha = 1) {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawDots(ctx, points, color, alpha = 1) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function renderVelocity(canvas, labels, completed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const pts = scalePoints(completed, W, H, pad);
    drawLine(ctx, pts, COLORS.green, 1);
    drawDots(ctx, pts, COLORS.green, 1);

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad * 2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l.replace("Sprint ", ""), "center");
    });

    text(ctx, pad, 16, "Completed SP (Velocity)");
  }

  function renderPredict(canvas, labels, committed, completed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsC = scalePoints(committed, W, H, pad);
    const ptsD = scalePoints(completed, W, H, pad);

    // Committed = indigo, Completed = green
    drawLine(ctx, ptsC, COLORS.indigo, 1);
    drawDots(ctx, ptsC, COLORS.indigo, 1);

    drawLine(ctx, ptsD, COLORS.green, 0.75);
    drawDots(ctx, ptsD, COLORS.green, 0.75);

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad * 2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l.replace("Sprint ", ""), "center");
    });

    text(ctx, pad, 16, "Committed (indigo) vs Completed (green)");

    const pcts = committed.map((c, i) => c > 0 ? Math.round((completed[i] / c) * 100) : 0);
    const last = pcts[pcts.length - 1] || 0;
    text(ctx, W - pad, 16, `Latest: ${last}%`, "right");
  }

  function renderCapacity(canvas, labels, forecast, actual) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsF = scalePoints(forecast, W, H, pad);
    const ptsA = scalePoints(actual, W, H, pad);

    // Forecast = amber, Actual = cyan
    drawLine(ctx, ptsF, COLORS.amber, 1);
    drawDots(ctx, ptsF, COLORS.amber, 1);

    drawLine(ctx, ptsA, COLORS.cyan, 0.8);
    drawDots(ctx, ptsA, COLORS.cyan, 0.8);

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad * 2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l.replace("Sprint ", ""), "center");
    });

    text(ctx, pad, 16, "Forecast (amber) vs Actual (cyan)");
  }

  function renderDisruption(canvas, labels, added, removed) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const max = Math.max(1, ...added, ...removed);
    const barW = (W - pad * 2) / labels.length;
    const inner = Math.max(10, barW * 0.32);

    labels.forEach((_, i) => {
      const ax = pad + barW * i + barW * 0.18;
      const rx = pad + barW * i + barW * 0.54;

      const ah = ((added[i] / max) * (H - pad * 2));
      const rh = ((removed[i] / max) * (H - pad * 2));

      // Added = green, Removed = red
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(ax, (H - pad) - ah, inner, ah);

      ctx.fillStyle = COLORS.red;
      ctx.fillRect(rx, (H - pad) - rh, inner, rh);
      ctx.globalAlpha = 1;
    });

    labels.forEach((l, i) => {
      const x = pad + barW * i + barW / 2;
      text(ctx, x, H - 10, l.replace("Sprint ", ""), "center");
    });

    text(ctx, pad, 16, "Added (green) vs Removed (red)");
  }

  function renderSick(canvas, labels, sick) {
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const pts = scalePoints(sick, W, H, pad);
    drawLine(ctx, pts, COLORS.red, 0.9);
    drawDots(ctx, pts, COLORS.red, 0.9);

    labels.forEach((l, i) => {
      const x = pad + (labels.length > 1 ? (W - pad * 2) / (labels.length - 1) * i : 0);
      text(ctx, x, H - 10, l.replace("Sprint ", ""), "center");
    });

    text(ctx, pad, 16, "Sick Leave (person-days)");
  }

  function renderAllHistoryCharts() {
    const rows = normalize(loadSprintRows());
    if (!rows.length) return;

    const labels   = rows.map(r => r.sprintLabel);
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

  function wireHistoryChartRefresh() {
    renderAllHistoryCharts();

    // Buttons in coach.html
    ["hist_demoBtn", "hist_saveBtn", "hist_resetBtn", "hist_autofillBtn"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => setTimeout(renderAllHistoryCharts, 80));
    });

    // Your coach-history.js emits this:
    window.addEventListener("scrummer:historyChanged", () => {
      setTimeout(renderAllHistoryCharts, 60);
    });

    // Resize
    window.addEventListener("resize", () => {
      clearTimeout(wireHistoryChartRefresh._t);
      wireHistoryChartRefresh._t = setTimeout(renderAllHistoryCharts, 150);
    });
  }

  function init() {
    // Snapshots
    renderSnapshotCharts();
    autoRefreshHook();

    // History table charts
    wireHistoryChartRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();