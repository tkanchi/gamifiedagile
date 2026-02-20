/**
 * Scrummer — Coach Addons (Safe Extension)
 * -----------------------------------------
 * - DOES NOT override history table logic
 * - DOES NOT modify setup
 * - Reads history safely
 * - Draws charts with theme-aware colors (light/dark)
 * - Mobile-safe: re-renders when tab becomes visible (canvas width > 0)
 */

(() => {
  // -----------------------------
  // Theme + color helpers
  // -----------------------------
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function computeColors() {
    return {
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
  }

  let COLORS = computeColors();

  // Recompute colors after theme toggle
  function wireThemeColorRefresh() {
    // Your theme toggle button
    const themeBtn = document.getElementById("themeToggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        // theme.js likely updates DOM classes/vars asynchronously
        setTimeout(() => {
          COLORS = computeColors();
          requestRender();
        }, 80);
      });
    }

    // If OS theme changes (optional)
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", () => {
        setTimeout(() => {
          COLORS = computeColors();
          requestRender();
        }, 80);
      });
    }
  }

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const dpr = () => (window.devicePixelRatio || 1);

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function lastN(arr, n) {
    return arr.slice(-n);
  }

  // Ensure canvas renders sharp and correct width/height
  function setupCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const ratio = dpr();

    const cssW = canvas.clientWidth; // real rendered width
    const cssH = Number(canvas.getAttribute("height")) || 140;

    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);

    // reset transform every time (important on re-render)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    return { ctx, W: cssW, H: cssH };
  }

  function clear(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
  }

  function text(ctx, x, y, str, align = "left") {
    ctx.textAlign = align;
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(str, x, y);
  }

  function drawAxes(ctx, W, H, pad) {
    ctx.strokeStyle = COLORS.axis;
    ctx.globalAlpha = 0.95;
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

  // -----------------------------
  // Snapshot charts (window.Scrummer.history)
  // -----------------------------
  function getHistorySafe() {
    return window.Scrummer?.history?.getHistory?.() || [];
  }

  function drawSnapshotLine(canvasId, values, color) {
    const canvas = $(canvasId);
    if (!canvas) return;

    // If hidden tab, width can be 0 — skip (will render later)
    if (canvas.clientWidth < 40) return;

    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 20;

    clear(ctx, W, H);

    if (!values.length) {
      text(ctx, 10, 20, "No data yet");
      return;
    }

    drawAxes(ctx, W, H, pad);

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = (max - min) || 1;

    const stepX = (W - pad * 2) / (values.length - 1 || 1);

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    values.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const x = pad + i * stepX;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
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

    drawSnapshotLine("chart_velocity", velocity, COLORS.green);
    drawSnapshotLine("chart_risk", risk, COLORS.red);
    drawSnapshotLine("chart_predictability", predictability, COLORS.indigo);
  }

  function autoRefreshHook() {
    const originalSave = window.Scrummer?.history?.saveSnapshot;
    if (!originalSave || !window.Scrummer?.history) return;

    // Don’t double-wrap if called again
    if (window.Scrummer.history._coachAddonsWrapped) return;
    window.Scrummer.history._coachAddonsWrapped = true;

    window.Scrummer.history.saveSnapshot = function (...args) {
      const result = originalSave.apply(this, args);
      setTimeout(requestRender, 80);
      return result;
    };
  }

  // -----------------------------
  // History table charts (ScrummerCoachHistory / localStorage)
  // -----------------------------
  function loadSprintRows() {
    // Preferred: coach-history.js exposes this
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

        // coach-history.js uses addedMid/removedMid/sickLeave:
        added:       n(r.addedMid ?? r.added ?? r.spAdded ?? r.scopeAdded),
        removed:     n(r.removedMid ?? r.removed ?? r.spRemoved ?? r.scopeRemoved),
        sick:        n(r.sickLeave ?? r.sick ?? r.sickDays),
      };
    });
  }

  function renderVelocity(canvas, labels, completed) {
    if (canvas.clientWidth < 40) return;

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
    if (canvas.clientWidth < 40) return;

    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsC = scalePoints(committed, W, H, pad);
    const ptsD = scalePoints(completed, W, H, pad);

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
    if (canvas.clientWidth < 40) return;

    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 28;

    clear(ctx, W, H);
    drawAxes(ctx, W, H, pad);

    const ptsF = scalePoints(forecast, W, H, pad);
    const ptsA = scalePoints(actual, W, H, pad);

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
    if (canvas.clientWidth < 40) return;

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
    if (canvas.clientWidth < 40) return;

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

  // -----------------------------
  // Mobile-safe rendering scheduler
  // -----------------------------
  function requestRender() {
    clearTimeout(requestRender._t);
    requestRender._t = setTimeout(() => {
      // Only render when at least one canvas has a real width
      const anyCanvas =
        $("hist_velocityChart") ||
        $("chart_velocity");

      if (!anyCanvas) return;

      const w = anyCanvas.clientWidth;
      if (!w || w < 40) {
        // Still hidden/not laid out → retry
        requestRender();
        return;
      }

      renderAllHistoryCharts();
      renderSnapshotCharts();
    }, 120);
  }

  function wireRenderTriggers() {
    // Buttons in coach.html
    ["hist_demoBtn", "hist_saveBtn", "hist_resetBtn", "hist_autofillBtn"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => requestRender());
    });

    // coach-history.js emits this event
    window.addEventListener("scrummer:historyChanged", () => requestRender());

    // Tabs: re-render after switching
    document.querySelectorAll(".tabBtn").forEach(btn => {
      btn.addEventListener("click", () => setTimeout(requestRender, 140));
    });

    // Hash navigation (coach.html#health)
    window.addEventListener("hashchange", () => setTimeout(requestRender, 140));

    // Resize / orientation changes
    window.addEventListener("resize", () => {
      clearTimeout(wireRenderTriggers._r);
      wireRenderTriggers._r = setTimeout(requestRender, 220);
    });

    // Best: ResizeObserver for mobile layout changes
    const wrap = document.querySelector(".chartGrid") || document.querySelector(".coachWrap") || document.body;
    if ("ResizeObserver" in window && wrap) {
      const ro = new ResizeObserver(() => {
        clearTimeout(wireRenderTriggers._ro);
        wireRenderTriggers._ro = setTimeout(requestRender, 180);
      });
      ro.observe(wrap);
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function init() {
    wireThemeColorRefresh();
    wireRenderTriggers();

    // First render (may be hidden, requestRender will retry)
    requestRender();

    // If snapshots exist:
    autoRefreshHook();
  }

  document.addEventListener("DOMContentLoaded", init);
})();