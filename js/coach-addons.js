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