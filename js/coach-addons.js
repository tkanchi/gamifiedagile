/**
 * Scrummer — Coach Addons (Classy Charts)
 * --------------------------------------
 * - No libs
 * - Theme-aware colors via CSS vars (with fallbacks)
 * - DPR sharp rendering (phone-friendly)
 * - Grid + ticks + padding + optional smoothing + subtle fill
 * - Re-render on: historyChanged, Save/Demo/Reset, tab open, resize, ResizeObserver
 */

(() => {
  // ---------- Theme helpers ----------
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  const C = () => ({
    green:  cssVar("--green",  "#22c55e"),
    red:    cssVar("--red",    "#ef4444"),
    indigo: cssVar("--indigo", "#6366f1"),
    amber:  cssVar("--amber",  "#f59e0b"),
    cyan:   cssVar("--cyan",   "#06b6d4"),

    text:   cssVar("--text-muted", "#6b7280"),
    ink:    cssVar("--text-main",  "#111827"),
    border: cssVar("--border-soft","rgba(17,24,39,0.16)"),
    grid:   cssVar("--border-soft","rgba(17,24,39,0.14)"),
    bg:     cssVar("--bg-soft",    "#ffffff"),
  });

  const $ = (id) => document.getElementById(id);

  // ---------- DPR canvas setup ----------
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.offsetWidth || 0;
    const cssH = Number(canvas.getAttribute("height")) || 160;

    const ctx = canvas.getContext("2d");
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { ctx, W: cssW, H: cssH };
  }

  // ---------- Chart kit ----------
  function niceTicks(maxVal, steps = 4) {
    // pick a rounded max for nicer axes
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(maxVal, 1))));
    const norm = maxVal / pow;
    const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    const niceMax = niceNorm * pow;
    const step = niceMax / steps;
    return { niceMax, step };
  }

  function drawFrame(ctx, W, H, pad, col) {
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(pad, pad, W - pad * 2, H - pad * 2);
    ctx.stroke();
  }

  function drawGrid(ctx, W, H, pad, ySteps, col) {
    ctx.strokeStyle = col.grid;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;

    // horizontal grid
    for (let i = 0; i <= ySteps; i++) {
      const y = pad + (H - pad * 2) * (i / ySteps);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W - pad, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function drawText(ctx, x, y, text, col, align = "left", weight = 600) {
    ctx.fillStyle = col.text;
    ctx.textAlign = align;
    ctx.font = `${weight} 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(text, x, y);
  }

  function scaleY(v, max, H, pad) {
    const t = max <= 0 ? 0 : (v / max);
    return (H - pad) - t * (H - pad * 2);
  }

  function scaleX(i, n, W, pad) {
    if (n <= 1) return pad;
    return pad + (W - pad * 2) * (i / (n - 1));
  }

  function pathSmooth(ctx, pts, tension = 0.32) {
    // light smoothing for a classy curve (not too curvy)
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  function drawLineSeries(ctx, pts, color, col, fill = true, alpha = 1) {
    if (!pts.length) return;

    // Fill under line (subtle)
    if (fill) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      pathSmooth(ctx, pts);
      const last = pts[pts.length - 1];
      const first = pts[0];
      ctx.lineTo(last.x, col._H - col._pad);
      ctx.lineTo(first.x, col._H - col._pad);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Stroke
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    pathSmooth(ctx, pts);
    ctx.stroke();
    ctx.restore();

    // Dots
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.min(1, alpha + 0.1);
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // tiny white highlight
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col.bg;
      ctx.beginPath();
      ctx.arc(p.x - 1, p.y - 1, 1.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.min(1, alpha + 0.1);
    }
    ctx.restore();
  }

  function drawBarPair(ctx, W, H, pad, labels, aVals, bVals, aColor, bColor, col) {
    const maxVal = Math.max(1, ...aVals, ...bVals);
    const { niceMax } = niceTicks(maxVal, 4);
    const n = labels.length;

    drawGrid(ctx, W, H, pad, 4, col);
    drawFrame(ctx, W, H, pad, col);

    const band = (W - pad * 2) / Math.max(1, n);
    const bw = Math.max(10, band * 0.28);

    for (let i = 0; i < n; i++) {
      const x0 = pad + band * i + band * 0.20;
      const x1 = pad + band * i + band * 0.56;

      const aH = ((aVals[i] / niceMax) * (H - pad * 2));
      const bH = ((bVals[i] / niceMax) * (H - pad * 2));

      // bars
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = aColor;
      ctx.fillRect(x0, (H - pad) - aH, bw, aH);

      ctx.fillStyle = bColor;
      ctx.fillRect(x1, (H - pad) - bH, bw, bH);

      ctx.globalAlpha = 1;

      // x labels (compact)
      drawText(ctx, pad + band * i + band / 2, H - 10, labels[i], col, "center", 650);
    }

    // y labels (0..niceMax)
    drawText(ctx, pad, pad - 8, `${niceMax}`, col, "left", 650);
    drawText(ctx, pad, H - pad + 16, `0`, col, "left", 650);
  }

  function drawLineChart(canvas, labels, series, options) {
    const col = C();
    const { ctx, W, H } = setupCanvas(canvas);
    const pad = 30;

    // expose for series fill closure
    col._H = H;
    col._pad = pad;

    ctx.clearRect(0, 0, W, H);

    const allVals = series.flatMap(s => s.values);
    const maxVal = Math.max(1, ...allVals);
    const { niceMax, step } = niceTicks(maxVal, 4);

    // Grid + frame
    drawGrid(ctx, W, H, pad, 4, col);
    drawFrame(ctx, W, H, pad, col);

    // Y-axis labels
    for (let i = 0; i <= 4; i++) {
      const v = Math.round((niceMax * (1 - i / 4)));
      const y = pad + (H - pad * 2) * (i / 4);
      drawText(ctx, pad - 8, y + 4, String(v), col, "right", 650);
    }

    // X-axis labels (compact)
    for (let i = 0; i < labels.length; i++) {
      const x = scaleX(i, labels.length, W, pad);
      drawText(ctx, x, H - 10, labels[i], col, "center", 650);
    }

    // series
    for (const s of series) {
      const pts = s.values.map((v, i) => ({
        x: scaleX(i, s.values.length, W, pad),
        y: scaleY(v, niceMax, H, pad),
      }));
      drawLineSeries(ctx, pts, s.color, col, s.fill ?? true, s.alpha ?? 1);
    }

    // Optional header text inside chart (very subtle)
    if (options?.caption) {
      ctx.globalAlpha = 0.95;
      drawText(ctx, pad + 8, pad + 14, options.caption, { ...col, text: col.ink }, "left", 800);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Data sources ----------
  // Sprint history table rows
  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

  function loadSprintRows() {
    if (window.ScrummerCoachHistory && typeof window.ScrummerCoachHistory.getRows === "function") {
      const rows = window.ScrummerCoachHistory.getRows();
      return Array.isArray(rows) ? rows : [];
    }
    const raw = localStorage.getItem("scrummer_coach_history_v1");
    const arr = safeParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function normalize(rows) {
    return (rows || []).map((r, idx) => {
      const n = (v) => {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };
      const sprint = r.sprint || `Sprint ${idx + 1}`;
      return {
        sprintLabel: String(sprint).replace("Sprint ", "N-"),
        forecastCap: n(r.forecastCap),
        actualCap:   n(r.actualCap),
        committed:   n(r.committed),
        completed:   n(r.completed),
        added:       n(r.addedMid),
        removed:     n(r.removedMid),
        sick:        n(r.sickLeave),
      };
    });
  }

  // Snapshot history (if your app has window.Scrummer.history)
  function getHistorySafe() {
    return window.Scrummer?.history?.getHistory?.() || [];
  }
  function lastN(arr, n) { return arr.slice(-n); }

  // ---------- Renderers ----------
  function renderHistoryCharts() {
    const rows = normalize(loadSprintRows());
    if (!rows.length) return;

    const labels = rows.map(r => r.sprintLabel);
    const col = C();

    // Velocity
    const c1 = $("hist_velocityChart");
    if (c1) drawLineChart(c1, labels, [
      { values: rows.map(r => r.completed), color: col.green, fill: true, alpha: 1 }
    ], { caption: "Velocity" });

    // Predictability
    const c2 = $("hist_predictChart");
    if (c2) drawLineChart(c2, labels, [
      { values: rows.map(r => r.committed), color: col.indigo, fill: true, alpha: 0.95 },
      { values: rows.map(r => r.completed), color: col.green, fill: false, alpha: 0.9 },
    ], { caption: "Committed vs Completed" });

    // Capacity
    const c3 = $("hist_capacityChart");
    if (c3) drawLineChart(c3, labels, [
      { values: rows.map(r => r.forecastCap), color: col.amber, fill: true, alpha: 0.95 },
      { values: rows.map(r => r.actualCap), color: col.cyan, fill: false, alpha: 0.9 },
    ], { caption: "Forecast vs Actual" });

    // Disruption (bars look nicer for this)
    const c4 = $("hist_disruptionChart");
    if (c4) {
      const { ctx, W, H } = setupCanvas(c4);
      ctx.clearRect(0, 0, W, H);
      drawBarPair(ctx, W, H, 30, labels,
        rows.map(r => r.added),
        rows.map(r => r.removed),
        col.green,
        col.red,
        col
      );
      drawText(ctx, 38, 22, "Added vs Removed", { ...col, text: col.ink }, "left", 800);
    }

    // Sick leave
    const c5 = $("hist_sickChart");
    if (c5) drawLineChart(c5, labels, [
      { values: rows.map(r => r.sick), color: col.red, fill: true, alpha: 0.9 },
    ], { caption: "Sick leave" });
  }

  function renderSnapshotCharts() {
    const history = lastN(getHistorySafe(), 10);
    if (!history.length) return;

    const col = C();
    const labels = history.map((_, i) => String(i + 1));

    const vel = history.map(h => Number(h.avgVelocity || 0));
    const risk = history.map(h => Number(h.riskScore || 0));
    const pred = history.map(h => {
      const cap = Number(h.capacitySP || 0);
      const com = Number(h.committedSP || 0);
      return cap > 0 ? Math.round((com / cap) * 100) : 0;
    });

    const c1 = $("chart_velocity");
    if (c1) drawLineChart(c1, labels, [{ values: vel, color: col.green, fill: true }], { caption: "Snapshot velocity" });

    const c2 = $("chart_risk");
    if (c2) drawLineChart(c2, labels, [{ values: risk, color: col.red, fill: true }], { caption: "Snapshot risk" });

    const c3 = $("chart_predictability");
    if (c3) drawLineChart(c3, labels, [{ values: pred, color: col.indigo, fill: true }], { caption: "Predictability %" });
  }

  // ---------- Smart re-render (important for phone + hidden tabs) ----------
  function canRenderNow() {
    const any = $("hist_velocityChart") || $("chart_velocity");
    if (!any) return false;
    return (any.clientWidth || 0) > 60;
  }

  function renderAll() {
    if (!canRenderNow()) return;
    renderHistoryCharts();
    renderSnapshotCharts();
  }

  function renderAllSoon(ms = 120) {
    clearTimeout(renderAllSoon._t);
    renderAllSoon._t = setTimeout(renderAll, ms);
  }

  function wire() {
    // Initial
    renderAllSoon(80);

    // Buttons (history)
    ["hist_demoBtn","hist_saveBtn","hist_resetBtn","hist_autofillBtn"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => renderAllSoon(140));
    });

    // history changed event
    window.addEventListener("scrummer:historyChanged", () => renderAllSoon(140));

    // when tabs are clicked (important because canvases can be width=0 when hidden)
    document.querySelectorAll(".tabBtn").forEach(btn => {
      btn.addEventListener("click", () => renderAllSoon(170));
    });
    window.addEventListener("hashchange", () => renderAllSoon(170));

    // resize / orientation
    window.addEventListener("resize", () => renderAllSoon(220));

    // ResizeObserver on chart container (best for phone)
    const wrap = document.querySelector(".chartGrid") || document.querySelector(".coachWrap") || document.body;
    if ("ResizeObserver" in window && wrap) {
      const ro = new ResizeObserver(() => renderAllSoon(220));
      ro.observe(wrap);
    }

    // theme toggle repaint (if your theme.js toggles vars)
    const themeBtn = $("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", () => renderAllSoon(220));
  }

  document.addEventListener("DOMContentLoaded", wire);
})();