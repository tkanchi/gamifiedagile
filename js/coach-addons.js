/**
 * Scrummer — Coach Addons — v218 (Elite)
 * --------------------------------------------------------------
 * Reads last 6 sprints from localStorage["scrummer_sprint_history_v1"].
 * Renders:
 *  - Color-coded KPI tiles + formula hints
 *  - Stitch2-style Coach Insights (ribbons + role lens)
 *  - Tiles (max 4, customizable modal)
 *  - Charts (2-up on wide screens):
 *      Velocity (+ 3-sprint rolling avg), Predictability, Commitment vs Delivery,
 *      Capacity Fit, Scope Disruption, Carryover, Overcommit Ratio, Scope Churn %, Sick Leave
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const HISTORY_KEY = "scrummer_sprint_history_v1";
  const ROLE_KEY = "scrummer_coach_role_v1";

  const COLORS = {
    indigo: "#4F46E5",
    purple: "#9333EA",
    orange: "#F97316",
    yellow: "#FACC15",
    green: "#16A34A",
    teal: "#06B6D4",
    rose: "#E11D48",
    slate: "#64748b"
  };

  const DPR = Math.max(3, window.devicePixelRatio || 1);
  if (window.Chart && Chart.defaults){
    Chart.defaults.devicePixelRatio = DPR;
    Chart.defaults.font.family = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    Chart.defaults.font.weight = '600';
  }


  function sprintLabelForIndex(i, len){
    const k = Math.max(1, (len - i)); // 6 rows => N-6 .. N-1
    return `N-${k}`;
  }

  function safeParse(str, fallback){ try { return JSON.parse(str); } catch { return fallback; } }

  function loadHistoryModel(){
    const raw = localStorage.getItem(HISTORY_KEY);
    const m = safeParse(raw || "null", null);
    if (!m || !Array.isArray(m.sprints)) return { sprints: [] };
    return m;
  }

  function normalizeRowsFromModel(m){
    const sprints = (m.sprints || []).slice(-6);
    const len = sprints.length;
    return sprints.map((s, i) => ({
      sprint: sprintLabelForIndex(i, len),
      capacity: Number(s?.forecastCapacitySP ?? 0),
      actualCap: Number(s?.actualCapacitySP ?? 0),
      committed: Number(s?.committedSP ?? 0),
      completed: Number(s?.completedSP ?? 0),
      added: Number(s?.addedMid ?? 0),
      removed: Number(s?.removedMid ?? 0),
      sick: Number(s?.sickLeaveDays ?? 0),
    }));
  }

  function normalizeFallbackRows(rawRows){
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const tail = rows.slice(-6);
    const len = tail.length;
    return tail.map((r, i) => ({
      sprint: sprintLabelForIndex(i, len),
      capacity: Number(r?.forecastCap ?? r?.capacity ?? 0),
      actualCap: Number(r?.actualCap ?? 0),
      committed: Number(r?.committed ?? r?.committedSP ?? 0),
      completed: Number(r?.completed ?? r?.completedSP ?? 0),
      added: Number(r?.addedMid ?? r?.added ?? 0),
      removed: Number(r?.removedMid ?? r?.removed ?? 0),
      sick: Number(r?.sickLeave ?? r?.sick ?? 0),
    }));
  }

  function loadRows(){
    const m = loadHistoryModel();
    if (m.sprints?.length) return normalizeRowsFromModel(m);

    const api = window.ScrummerCoachHistory;
    if (api?.getRows) return normalizeFallbackRows(api.getRows());

    return [];
  }

  const mean = (a)=> a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
  const stdev = (a)=>{
    if (a.length < 2) return 0;
    const m = mean(a);
    const v = mean(a.map(x => (x-m)*(x-m)));
    return Math.sqrt(v);
  };

  const clampPct = (p)=> Math.max(0, Math.min(100, p));
  const fmt = (n)=> Number.isFinite(n) ? String(Math.round(n)) : "—";
  const fmt1 = (n)=> Number.isFinite(n) ? (Math.round(n*10)/10).toFixed(1) : "—";
  const fmt2 = (n)=> Number.isFinite(n) ? (Math.round(n*100)/100).toFixed(2) : "—";

  function setText(id, txt){ const el=$(id); if(el) el.textContent = txt; }

  function setKpiStateByValueId(valueId, state){
    const el = $(valueId);
    const tile = el?.closest?.('.kpiTile') || el?.closest?.('.metricCard');
    if (!tile) return;
    tile.classList.remove('kpi--good','kpi--warn','kpi--risk','kpi--info');
    if (state) tile.classList.add(state);
  }

  function niceStep(max){
    const m = Math.max(0, Number(max||0));
    if (m <= 5) return 1;
    if (m <= 10) return 2;
    if (m <= 25) return 5;
    if (m <= 50) return 10;
    if (m <= 100) return 20;
    return 50;
  }

  function paddedMax(max, pct=0.15, minPad=2){
    const m = Math.max(0, Number(max||0));
    const pad = Math.max(minPad, m * pct);
    return m + pad;
  }

  function movingAvg(arr, win=3){
    const out = new Array(arr.length).fill(null);
    for (let i=0;i<arr.length;i++){
      const from = i - win + 1;
      if (from < 0) continue;
      const slice = arr.slice(from, i+1);
      out[i] = mean(slice);
    }
    return out;
  }

  function gridColor(){ return "rgba(15, 23, 42, 0.06)"; }

  function gradientFill(ctxObj, colorHex, topAlpha=0.28, bottomAlpha=0.04){
    const chart = ctxObj.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) return colorHex + "11";

    const h = colorHex.replace("#","");
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);

    const g1 = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g1.addColorStop(0, `rgba(${r},${g},${b},${topAlpha})`);
    g1.addColorStop(1, `rgba(${r},${g},${b},${bottomAlpha})`);
    return g1;
  }

  function baseOptions({ yStep=10, yMax=null, yMin=null, yIsPercent=false, tooltipSuffix="" } = {}){
    const yTicks = {
      stepSize: yStep,
      color: "rgba(100,116,139,0.85)",
      font: { weight: 600 },
      callback: (v)=> yIsPercent ? `${v}%` : v
    };

    const yScale = {
      beginAtZero: true,
      ticks: yTicks,
      grid: { color: gridColor(), drawBorder: false },
      border: { display: false }
    };
    if (Number.isFinite(yMax)) yScale.max = yMax;
    if (Number.isFinite(yMin)) yScale.min = yMin;

    return {
      responsive: true,
      devicePixelRatio: Math.max(3, window.devicePixelRatio || 1),
      maintainAspectRatio: false,
      layout: { padding: { top: 10, left: 6, right: 6 } },
      animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { color: "rgba(100,116,139,0.85)", font: { weight: 600 }, maxRotation: 0 },
          grid: { display:false },
          border: { display:false }
        },
        y: yScale
      },
      plugins: {
        legend: { display:false },
        tooltip: {
          enabled:true,
          backgroundColor:"rgba(15,23,42,0.92)",
          titleColor:"#fff",
          bodyColor:"#fff",
          padding:10,
          cornerRadius:12,
          callbacks:{
            label:(c)=> `${c.dataset.label}: ${c.parsed.y}${tooltipSuffix}`
          }
        }
      }
    };
  }

  function lineDataset(color, { dashed=false, fill=true, point=true } = {}){
    return {
      borderColor: color,
      borderWidth: dashed ? 2 : 3,
      borderDash: dashed ? [6,6] : undefined,
      tension: 0.42,
      cubicInterpolationMode: "monotone",
      fill: fill,
      pointRadius: point ? 4 : 0,
      pointHoverRadius: point ? 5 : 0,
      pointBackgroundColor: "#fff",
      pointBorderColor: color,
      pointBorderWidth: point ? 2 : 0
    };
  }

  function hLinePlugin({ canvasId, value, color="rgba(15,23,42,0.18)", dash=[6,6] }){
    return {
      id: `hLine:${canvasId}:${value}`,
      afterDatasetsDraw(chart){
        if (chart?.canvas?.id !== canvasId) return;
        const yScale = chart.scales?.y;
        if (!yScale) return;
        const y = yScale.getPixelForValue(value);
        const { left, right } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash(dash);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.restore();
      }
    };
  }

  const charts = new Map();
  function destroyChart(id){
    if (charts.has(id)){
      charts.get(id).destroy();
      charts.delete(id);
    }
  }

  const TILES_KEY = "scrummer_coach_tiles_v1";
  const DEFAULT_TILES = ["predictability","overcommit","teamHealth","stabilityIndex"];
  const MAX_TILES = 4;

  function computeMetrics(rows){
    const completed = rows.map(r=>r.completed||0);
    const committed = rows.map(r=>r.committed||0);
    const cap = rows.map(r=>r.capacity||0);
    const churnSp = rows.map(r => (r.added||0)+(r.removed||0));
    const sick = rows.map(r=>r.sick||0);

    const velAvg = mean(completed);
    const velSd = stdev(completed);
    const velCv = velAvg ? (velSd / velAvg) : 0;

    const pred = rows.map(r=>{
      const c = r.committed||0, d=r.completed||0;
      if(!c) return 0;
      return clampPct(Math.round((d/c)*100));
    });
    const predAvg = mean(pred);
    const predLatest = pred[pred.length-1] ?? 0;

    const churnPct = rows.map(r=>{
      const c = r.committed||0;
      const ch = (r.added||0)+(r.removed||0);
      return c ? (ch/c)*100 : 0;
    });
    const churnPctAvg = mean(churnPct);

    const forecastAcc = rows.map(r=>{
      const f = r.capacity||0;
      const d = r.completed||0;
      return f ? clampPct(Math.round((d/f)*100)) : 0;
    });
    const forecastAccAvg = mean(forecastAcc);

    const commitRel = rows.map(r=>{
      const c=r.committed||0, d=r.completed||0;
      return c ? clampPct(Math.round((d/c)*100)) : 0;
    });
    const commitRelAvg = mean(commitRel);

    const carry = rows.map(r => {
      const c=r.committed||0, d=r.completed||0;
      return Math.max(0, c-d);
    });
    const carryPct = rows.map((_,i)=>{
      const c=committed[i]||0;
      return c ? (carry[i]/c)*100 : 0;
    });
    const carryPctAvg = mean(carryPct);

    const ocLatest = cap[cap.length-1] ? (committed[committed.length-1] / cap[cap.length-1]) : null;
    const ocPctLatest = ocLatest==null ? null : Math.round(ocLatest*100);

    // Stability index (0–100): lower CV + closer forecast accuracy => higher.
    const stabilityRaw = 100 - (velCv*220) - (Math.abs(forecastAccAvg-100)*0.9);
    const stabilityIndex = Math.max(0, Math.min(100, Math.round(stabilityRaw)));

    // Team health (0–100): blended signal (no sick trend shown, but interruptions influence score)
    const sickTotal = sick.reduce((s,x)=>s+x,0);
    const overPct = ocPctLatest==null ? 0 : Math.max(0, ocPctLatest-100);
    const healthRaw = 100 - (churnPctAvg*1.1) - (carryPctAvg*0.9) - (velCv*120) - (overPct*0.6) - (sickTotal*1.6);
    const teamHealth = Math.max(0, Math.min(100, Math.round(healthRaw)));

    const last3Avg = mean(completed.slice(-3));
    const prev3Avg = mean(completed.slice(0, Math.max(0, completed.length - 3)).slice(-3));
    const velTrendPct = prev3Avg ? ((last3Avg - prev3Avg) / prev3Avg) * 100 : null;

    return {
      velAvg, velCv, velTrendPct,
      predAvg, predLatest,
      churnPctAvg,
      forecastAccAvg,
      commitRelAvg,
      carryPctAvg,
      ocPctLatest,
      teamHealth,
      stabilityIndex,
    };
  }

  function kpiStateFromScore(score){
    if (score >= 80) return 'kpi--good';
    if (score >= 65) return 'kpi--warn';
    return 'kpi--risk';
  }
  function kpiStateFromPctHighBad(pct, warnAt, riskAt){
    if (pct >= riskAt) return 'kpi--risk';
    if (pct >= warnAt) return 'kpi--warn';
    return 'kpi--good';
  }

  function tileHTML({ id, title, icon, value, unit, badge, vizHTML, state }){
    return `
      <div class="metricCard ${state||''}" data-tile="${id}">
        <div class="metricTop">
          <div class="metricName">
            <span class="material-symbols-rounded">${icon}</span>
            <span class="metricTitle" title="${String(title).replace(/\"/g,'&quot;')}">${title}</span>
          </div>
          <div class="metricDelta">${badge || '—'}</div>
        </div>
        <div class="metricValue">${value} ${unit ? `<span class="metricUnit">${unit}</span>` : ''}</div>
        ${vizHTML || ''}
      </div>
    `;
  }

  

  function facesHTML(score){
    const faces = ["😖","😕","😐","🙂","😄"];
    const level = score >= 90 ? 5 : score >= 80 ? 4 : score >= 70 ? 3 : score >= 60 ? 2 : 1;
    return `<div class="metricViz metricViz--faces" aria-hidden="true">
      <div class="faces">${faces.map((f,i)=>`<span class="${i < level ? 'is-on':''}">${f}</span>`).join('')}</div>
      <div class="ringSub">${score>=80?'Energized':score>=65?'Okay':'Tired'}</div>
    </div>`;
  }

  function sparklineSVG(values){
    const vals = (values||[]).map(v=>Number(v)).filter(v=>Number.isFinite(v));
    if (vals.length < 2) return `<svg class="spark" viewBox="0 0 120 26" aria-hidden="true"></svg>`;
    const w=120, h=26, pad=2;
    const minV = Math.min(...vals); const maxV = Math.max(...vals);
    const range = (maxV-minV) || 1;
    const pts=[];
    for (let i=0;i<vals.length;i++){
      const x = pad + (i/(vals.length-1))*(w-2*pad);
      const y = (h-pad) - ((vals[i]-minV)/range)*(h-2*pad);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" /></svg>`;
  }

  function ringHTML(pctRaw){
    const raw = Number(pctRaw);
    const p = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
    const sub = Number.isFinite(raw) ? `${Math.round(raw)}% of forecast` : '—';
    return `<div class="metricViz metricViz--ring" aria-hidden="true"><div class="ring" style="--p:${p}"></div><div class="ringSub">${sub}</div></div>`;
  }

const TILE_REGISTRY = {
    predictability: {
      label: 'Predictability',
      desc: 'Avg(Completed ÷ Committed) × 100',
      render: (m)=>{
        const badge = m.predLatest >= 90 ? 'Stable' : m.predLatest >= 80 ? 'Watch' : 'Risk';
        const state = m.predLatest >= 90 ? 'kpi--good' : m.predLatest >= 80 ? 'kpi--warn' : 'kpi--risk';
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${clampPct(m.predAvg)}%"></div></div></div>`;
        return tileHTML({ id:'predictability', title:'Predictability', icon:'shield', value:`${fmt(m.predAvg)}%`, unit:'last 6', badge, vizHTML:viz, state });
      }
    },
    overcommit: {
      label: 'Overcommit Ratio',
      desc: 'Committed ÷ Forecast Capacity (latest)',
      render: (m)=>{
        const p = m.ocPctLatest;
        const ratio = (p==null) ? null : (p/100);
        const badge = p==null ? '—' : (p >= 110 ? 'Over' : p >= 103 ? 'Tight' : p >= 90 ? 'Healthy' : 'Under');
        const state = p==null ? 'kpi--info' : (p >= 110 ? 'kpi--risk' : p >= 103 ? 'kpi--warn' : 'kpi--good');
        const ringPct = p==null ? 0 : Math.max(0, Math.min(100, Math.round(((p - 70) / 60) * 100)));
        const viz = ringHTML(p==null ? null : p, ringPct);
        return tileHTML({
          id:'overcommit',
          title:'Overcommit Ratio',
          icon:'speed',
          value: ratio==null ? '—' : `${fmt2(ratio)}×`,
          unit:'latest',
          badge,
          vizHTML: viz,
          state
        });
      }
    },
    teamHealth: {
      label: 'Team Health',
      desc: '0–100 stability score (no sick trend shown)',
      render: (m)=>{
        const score = m.teamHealth;
        const badge = score >= 80 ? 'Healthy' : score >= 65 ? 'Watch' : 'Risk';
        const state = kpiStateFromScore(score);
        const viz = facesHTML(score);
        return tileHTML({ id:'teamHealth', title:'Team Health', icon:'sentiment_satisfied', value:`${score}`, unit:'/100', badge, vizHTML:viz, state });
      }
    },
    stabilityIndex: {
      label: 'Stability Index',
      desc: '0–100 volatility + forecast stability',
      render: (m, rows)=>{
        const score = m.stabilityIndex;
        const badge = score >= 80 ? 'Stable' : score >= 65 ? 'Improving' : 'Volatile';
        const state = kpiStateFromScore(score);
        // sparkline: predictability per sprint
        const vals = (rows||[]).map(r=>{
          const c=r.committed||0, d=r.completed||0;
          if(!c) return 0;
          return clampPct((d/c)*100);
        });
        const viz = `<div class="metricViz metricViz--spark">${sparklineSVG(vals)}<div class="ringSub">last 6</div></div>`;
        return tileHTML({ id:'stabilityIndex', title:'Stability Index', icon:'auto_graph', value:`${score}`, unit:'/100', badge, vizHTML:viz, state });
      }
    },
    avgVelocity: {
      label: 'Avg Velocity',
      desc: 'Avg(Completed SP) last 6',
      render: (m, rows)=>{
        const completed = rows.map(r=>r.completed||0);
        const vals = completed.slice(-5);
        const maxV = Math.max(1, ...vals);
        const bars = vals.map(v=>`<span class="mbar" style="--h:${Math.max(12, Math.round((v/maxV)*100))}%"></span>`).join('');
        const viz = `<div class="metricViz metricViz--bars" aria-hidden="true">${bars}</div>`;
        const state = (m.velCv >= 0.25) ? 'kpi--risk' : (m.velCv >= 0.15) ? 'kpi--warn' : 'kpi--good';
        const badge = m.velTrendPct==null ? '—' : `${m.velTrendPct>=0?'▲':'▼'}${Math.abs(Math.round(m.velTrendPct))}%`;
        return tileHTML({ id:'avgVelocity', title:'Avg Velocity', icon:'trending_up', value:`${fmt1(m.velAvg)}`, unit:'pts avg', badge, vizHTML:viz, state });
      }
    },
    scopeChurn: {
      label: 'Scope Churn %',
      desc: '(Added + Removed) ÷ Committed',
      render: (m)=>{
        const pct = Math.round(m.churnPctAvg);
        const badge = pct >= 20 ? 'High' : pct >= 12 ? 'Watch' : 'Low';
        const state = kpiStateFromPctHighBad(pct, 12, 20);
        const w = Math.max(0, Math.min(100, Math.round((pct / 30) * 100)));
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${w}%"></div></div></div>`;
        return tileHTML({ id:'scopeChurn', title:'Scope Churn %', icon:'swap_horiz', value:`${pct}%`, unit:'avg', badge, vizHTML:viz, state });
      }
    },
    forecastAccuracy: {
      label: 'Forecast Accuracy',
      desc: 'Avg(Completed ÷ Forecast) × 100',
      render: (m)=>{
        const pct = Math.round(m.forecastAccAvg);
        const badge = pct >= 90 ? 'Good' : pct >= 80 ? 'Watch' : 'Risk';
        const state = pct >= 90 ? 'kpi--good' : pct >= 80 ? 'kpi--warn' : 'kpi--risk';
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${pct}%"></div></div></div>`;
        return tileHTML({ id:'forecastAccuracy', title:'Forecast Accuracy', icon:'track_changes', value:`${pct}%`, unit:'avg', badge, vizHTML:viz, state });
      }
    },
    commitmentReliability: {
      label: 'Commitment Reliability',
      desc: 'Avg(Completed ÷ Committed) × 100',
      render: (m)=>{
        const pct = Math.round(m.commitRelAvg);
        const badge = pct >= 90 ? 'Good' : pct >= 80 ? 'Watch' : 'Risk';
        const state = pct >= 90 ? 'kpi--good' : pct >= 80 ? 'kpi--warn' : 'kpi--risk';
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${pct}%"></div></div></div>`;
        return tileHTML({ id:'commitmentReliability', title:'Commitment Reliability', icon:'verified', value:`${pct}%`, unit:'avg', badge, vizHTML:viz, state });
      }
    },
    carryover: {
      label: 'Carryover %',
      desc: 'Avg(max(0, Committed-Completed) ÷ Committed)',
      render: (m)=>{
        const pct = Math.round(m.carryPctAvg);
        const badge = pct <= 10 ? 'Low' : pct <= 20 ? 'Watch' : 'High';
        const state = pct >= 25 ? 'kpi--risk' : pct >= 15 ? 'kpi--warn' : 'kpi--good';
        const w = Math.max(0, Math.min(100, Math.round((pct / 35) * 100)));
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${w}%"></div></div></div>`;
        return tileHTML({ id:'carryover', title:'Carryover %', icon:'repeat', value:`${pct}%`, unit:'avg', badge, vizHTML:viz, state });
      }
    },
    capacityFit: {
      label: 'Capacity Fit',
      desc: 'Committed vs Forecast capacity (latest)',
      render: (m)=>{
        const p = m.ocPctLatest;
        const badge = p==null ? '—' : (p >= 110 ? 'Over' : p >= 103 ? 'Tight' : p >= 90 ? 'Healthy' : 'Under');
        const state = p==null ? 'kpi--info' : (p >= 110 ? 'kpi--risk' : p >= 103 ? 'kpi--warn' : 'kpi--good');
        const w = p==null ? 0 : Math.max(0, Math.min(100, Math.round(((p - 70) / 60) * 100)));
        const viz = `<div class="metricViz metricViz--progress" aria-hidden="true"><div class="mprog"><div class="mprogFill" style="width:${w}%"></div></div></div>`;
        return tileHTML({ id:'capacityFit', title:'Capacity Fit', icon:'target', value: p==null ? '—' : `${p}%`, unit:'latest', badge, vizHTML:viz, state });
      }
    }
  };

  function loadSelectedTiles(){
    try{
      const raw = localStorage.getItem(TILES_KEY);
      const arr = safeParse(raw || 'null', null);
      const list = Array.isArray(arr) ? arr : null;
      const cleaned = (list || DEFAULT_TILES)
        .map(x=>String(x||''))
        .filter(x=>TILE_REGISTRY[x]);
      // enforce uniqueness + max
      return Array.from(new Set(cleaned)).slice(0, MAX_TILES);
    }catch{
      return DEFAULT_TILES.slice();
    }
  }
  function saveSelectedTiles(list){
    try{ localStorage.setItem(TILES_KEY, JSON.stringify(list.slice(0,MAX_TILES))); }catch{}
  }

  function renderTiles(rows){
    const host = $("tileGrid");
    if(!host) return;
    const m = computeMetrics(rows);
    const selected = loadSelectedTiles();
    host.innerHTML = selected.map(id => TILE_REGISTRY[id].render(m, rows)).join('');
  }

  function initTileModal(){
    const btn = $("tileCustomizeBtn");
    const modal = $("tileModal");
    const body = $("tileModalBody");
    const count = $("tileModalCount");
    const saveBtn = $("tileModalSave");
    const resetBtn = $("tileModalReset");
    if(!btn || !modal || !body || !count || !saveBtn || !resetBtn) return;

    let draft = loadSelectedTiles();

    function open(){
      draft = loadSelectedTiles();
      modal.style.display = "block";
      modal.setAttribute("aria-hidden","false");
      renderPickList();
    }
    function close(){
      modal.style.display = "none";
      modal.setAttribute("aria-hidden","true");
    }
    function renderPickList(){
      const entries = Object.entries(TILE_REGISTRY);
      const selectedSet = new Set(draft);
      const selectedCount = draft.length;
      count.textContent = `Select up to ${MAX_TILES} tiles • Selected ${selectedCount}/${MAX_TILES}`;

      body.innerHTML = entries.map(([id, t])=>{
        const checked = selectedSet.has(id);
        const disabled = !checked && selectedCount >= MAX_TILES;
        return `
          <label class="tilePickRow">
            <div class="tilePickMeta">
              <div class="tilePickName">${t.label}</div>
              <div class="tilePickDesc">${t.desc}</div>
            </div>
            <input type="checkbox" data-tile="${id}" ${checked?'checked':''} ${disabled?'disabled':''} />
          </label>
        `;
      }).join('');

      body.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          const id = cb.getAttribute('data-tile');
          if (!id) return;
          if (cb.checked){
            if (draft.length < MAX_TILES) draft = Array.from(new Set([...draft, id]));
            else cb.checked = false;
          }else{
            draft = draft.filter(x=>x!==id);
          }
          renderPickList();
        });
      });
    }

    btn.addEventListener('click', open);
    modal.addEventListener('click', (e)=>{
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });
    resetBtn.addEventListener('click', ()=>{ draft = DEFAULT_TILES.slice(); renderPickList(); });
    saveBtn.addEventListener('click', ()=>{ saveSelectedTiles(draft); close(); renderAll(); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && modal.style.display === 'block') close(); });
  }

  function roleName(role){
    if (role === 'dm') return 'Delivery Manager';
    if (role === 'em') return 'Enterprise Manager';
    return 'Scrum Master';
  }

  function roleAction(role, type){
    const A = {
      sm: {
        carryover: "In Planning, cut commitment by 10–15% and add a clear buffer item (tech debt / support). In Retro, ask: what blocked completion?",
        overcommit: "Use capacity-based planning: forecast first, then commit. Protect the sprint goal by parking mid-sprint requests into a buffer lane.",
        churn: "Tighten refinement definition: 'done = ready'. Add a change-control rule: any added scope must remove equal scope.",
        stability: "Keep WIP low and make impediments visible daily. Celebrate predictability streaks.",
        health: "Watch overload signals. If sick leave spikes, reduce parallel work and renegotiate urgent items."
      },
      dm: {
        carryover: "Escalate external dependencies early and re-plan scope with PO. Track spillover % as a delivery risk indicator.",
        overcommit: "Align commitment to true capacity. If demand stays high, negotiate trade-offs or add capacity explicitly.",
        churn: "Reduce unplanned work: enforce intake + triage. Measure churn % and set a guardrail target (<15%).",
        stability: "Use rolling average velocity for forecasts. Stabilize by reducing context switching across teams.",
        health: "Check load vs staffing. Ensure support demand isn't silently draining sprint capacity."
      },
      em: {
        carryover: "Treat repeated carryover as a portfolio signal: too much demand vs capacity. Rebalance initiatives or reduce WIP.",
        overcommit: "Set enterprise guardrails: commitment should track capacity; use predictability trends for release planning.",
        churn: "Churn indicates unstable priorities. Improve intake governance and decision cadence (weekly triage).",
        stability: "Low variance enables reliable roadmaps. Protect stable teams from randomization and frequent reprioritization.",
        health: "Use team health trends as leading indicators. Sustainable pace prevents burnout and attrition."
      }
    };
    return (A[role] && A[role][type]) || A.sm[type];
  }

  function renderInsights(rows){
    const host = $("coach_insightsStack");
    if (!host) return;

    const roleSel = $("coach_roleSel");
    const role = (roleSel?.value || localStorage.getItem(ROLE_KEY) || 'sm');

    // If everything is zero, show a friendly hint
    const allZero = rows.every(r => (r.capacity+r.actualCap+r.committed+r.completed+r.added+r.removed+r.sick) === 0);
    if (allZero){
      host.innerHTML = `
        <div class="insightCard is-info" data-ico="lightbulb">
          <div class="insightHeader">
            <span class="insightTag">INFO</span>
            <h3 class="insightTitle">Load demo data to see insights</h3>
          </div>
          <div class="insightText">Pick <b>Excellent / Normal / Risky</b> from the dropdown above, or enter your sprint history values and hit <b>Save</b>.</div>
          <div class="insightAction">Tip: Start with <b>Normal</b> to see a realistic recovery arc.</div>
        </div>
      `;
      return;
    }

    const last = rows[rows.length-1] || {};
    const lastCap = last.capacity || 0;
    const lastCommitted = last.committed || 0;
    const lastCompleted = last.completed || 0;

    const overcommit = lastCap ? (lastCommitted / lastCap) : 0;
    const carryover = Math.max(0, lastCommitted - lastCompleted);
    const carryoverPct = lastCommitted ? (carryover / lastCommitted) : 0;

    const churnAvg = mean(rows.map(r => (r.added||0)+(r.removed||0)));
    const churnPctAvg = mean(rows.map(r => {
      const c = r.committed||0;
      const ch = (r.added||0)+(r.removed||0);
      return c ? (ch/c) : 0;
    }));

    const vel = rows.map(r => r.completed||0);
    const velSd = stdev(vel);
    const velAvg = mean(vel);
    const velCv = velAvg ? (velSd/velAvg) : 0;

    const predLatest = (lastCommitted ? clampPct((lastCompleted/lastCommitted)*100) : 0);

    // Trend: last 3 vs prev 3
    const last3 = vel.slice(-3);
    const prev3 = vel.slice(0, Math.max(0, vel.length-3));
    const trend = mean(last3) - mean(prev3.slice(-3));

    const items = [];

    // Carryover
    if (carryoverPct > 0.25){
      items.push({
        sev: 'risk',
        tag: 'RISK',
        ico: 'warning',
        title: 'Carryover spike',
        text: `${Math.round(carryoverPct*100)}% of committed work carried over last sprint. This often indicates overcommitment or blocked dependencies.`,
        action: roleAction(role,'carryover'),
        chart: 'hist_carryoverChart'
      });
    } else if (carryoverPct > 0.12){
      items.push({
        sev: 'watch',
        tag: 'WATCH',
        ico: 'visibility',
        title: 'Carryover creeping up',
        text: `Carryover is ${Math.round(carryoverPct*100)}% last sprint. Small but worth watching if it repeats.`,
        action: roleAction(role,'carryover'),
        chart: 'hist_carryoverChart'
      });
    } else {
      items.push({
        sev: 'good',
        tag: 'INFO',
        ico: 'check_circle',
        title: 'Carryover looks healthy',
        text: `Carryover is ${Math.max(0,Math.round(carryoverPct*100))}% last sprint. You're delivering close to what you commit.`,
        action: roleAction(role,'stability'),
        chart: 'hist_carryoverChart'
      });
    }

    // Overcommit ratio
    if (overcommit > 1.10){
      items.push({
        sev: 'risk',
        tag: 'RISK',
        ico: 'error',
        title: 'Overcommit risk detected',
        text: `Committed is ~${Math.round(overcommit*100)}% of forecast capacity. Expect spillover and quality risk.`,
        action: roleAction(role,'overcommit'),
        chart: 'hist_capacityChart'
      });
    } else if (overcommit > 1.03){
      items.push({
        sev: 'watch',
        tag: 'WATCH',
        ico: 'priority_high',
        title: 'Commitment slightly above capacity',
        text: `Committed is ~${Math.round(overcommit*100)}% of capacity. A small buffer will improve predictability.`,
        action: roleAction(role,'overcommit'),
        chart: 'hist_capacityChart'
      });
    } else if (overcommit > 0.0) {
      items.push({
        sev: 'good',
        tag: 'INFO',
        ico: 'verified',
        title: 'Commitment matches capacity',
        text: `Committed is ~${Math.round(overcommit*100)}% of forecast capacity. This is a healthy planning posture.`,
        action: roleAction(role,'stability'),
        chart: 'hist_capacityChart'
      });
    }

    // Scope churn
    if (churnPctAvg >= 0.20){
      items.push({
        sev: 'risk',
        tag: 'RISK',
        ico: 'swap_horiz',
        title: 'Scope churn is high',
        text: `Average churn is ${Math.round(churnAvg)} SP (${Math.round(churnPctAvg*100)}% of committed). This reduces focus and predictability.`,
        action: roleAction(role,'churn'),
        chart: 'hist_churnPctChart'
      });
    } else if (churnPctAvg >= 0.12){
      items.push({
        sev: 'watch',
        tag: 'WATCH',
        ico: 'swap_horiz',
        title: 'Scope churn is moderate',
        text: `Average churn is ${Math.round(churnAvg)} SP (${Math.round(churnPctAvg*100)}%). Aim for <15% as a guardrail.`,
        action: roleAction(role,'churn'),
        chart: 'hist_churnPctChart'
      });
    } else {
      items.push({
        sev: 'good',
        tag: 'INFO',
        ico: 'shield',
        title: 'Scope is well-protected',
        text: `Average churn is ${Math.round(churnAvg)} SP (${Math.round(churnPctAvg*100)}%). Great job protecting the sprint goal.`,
        action: roleAction(role,'stability'),
        chart: 'hist_churnPctChart'
      });
    }

    // Stability + predictability
    if (velCv >= 0.25){
      items.push({
        sev: 'watch',
        tag: 'WATCH',
        ico: 'timeline',
        title: 'Velocity is volatile',
        text: `Velocity variance is high (CV ${fmt1(velCv)}). Forecast confidence drops when variance is high.`,
        action: roleAction(role,'stability'),
        chart: 'hist_velocityChart'
      });
    } else {
      items.push({
        sev: 'good',
        tag: 'INFO',
        ico: 'timeline',
        title: 'Stability is improving',
        text: `Velocity variance is low (CV ${fmt1(velCv)}). ${trend>0 ? 'Trend is improving.' : 'Trend is stable.'}`,
        action: roleAction(role,'stability'),
        chart: 'hist_velocityChart'
      });
    }

    // Team health (no sick-leave trend shown; use blended stability score)
    const mh = computeMetrics(rows);
    if (mh.teamHealth < 65){
      items.push({
        sev: 'risk',
        tag: 'RISK',
        ico: 'favorite',
        title: 'Team health needs attention',
        text: `Team Health is ${mh.teamHealth}/100. This usually correlates with volatility, churn, and carryover. Treat it as an early warning signal (not blame).`,
        action: roleAction(role,'health'),
        chart: 'hist_carryoverChart'
      });
    } else if (mh.teamHealth < 80){
      items.push({
        sev: 'watch',
        tag: 'WATCH',
        ico: 'favorite',
        title: 'Watch team load + interruptions',
        text: `Team Health is ${mh.teamHealth}/100. Small changes (WIP limit, fewer interrupts, scope guardrails) can move this quickly.`,
        action: roleAction(role,'health'),
        chart: 'hist_churnPctChart'
      });
    } else {
      items.push({
        sev: 'good',
        tag: 'INFO',
        ico: 'favorite',
        title: 'Team health looks strong',
        text: `Team Health is ${mh.teamHealth}/100. Keep protecting focus and sustainable pace.`,
        action: roleAction(role,'stability'),
        chart: 'hist_velocityChart'
      });
    }

    // Compose a short playbook card
    const play = {
      sm: [
        "Before Planning: forecast capacity → then commit.",
        "During Sprint: limit WIP and protect the sprint goal.",
        "In Retro: identify 1 systemic cause (churn / blockers / overload) + 1 action."
      ],
      dm: [
        "Track guardrails: overcommit % and churn % weekly.",
        "Escalate dependencies early; renegotiate scope, not timelines.",
        "Use rolling avg velocity for forecasts, not single-sprint spikes."
      ],
      em: [
        "Use predictability trend as a release confidence signal.",
        "Control demand: reduce WIP / stabilize priorities to cut churn.",
        "Treat team health as a leading metric for sustainable delivery."
      ]
    };

    const cards = items.slice(0,4).map(it => {
      const cls = it.sev === 'risk' ? 'is-risk' : it.sev === 'watch' ? 'is-watch' : it.sev === 'good' ? 'is-good' : 'is-info';
      const related = it.chart ? `<div class="insightRelated">Related: <b>${chartName(it.chart)}</b></div>` : '';
      return `
        <div class="insightCard ${cls}" data-ico="${it.ico}">
          <div class="insightHeader">
            <span class="insightTag">${it.tag}</span>
            <h3 class="insightTitle">${it.title}</h3>
          </div>
          <div class="insightText">${it.text}</div>
          <div class="insightAction"><span class="material-symbols-rounded" style="font-size:18px; vertical-align:-3px; margin-right:6px;">psychology</span><b>${roleName(role)} move:</b> ${it.action}</div>
          ${related}
        </div>
      `;
    }).join('');

    const playCard = `
      <div class="insightCard is-info" data-ico="checklist">
        <div class="insightHeader">
          <span class="insightTag">PLAYBOOK</span>
          <h3 class="insightTitle">Next 3 moves</h3>
        </div>
        <div class="insightText">
          <ul style="margin:8px 0 0; padding-left:18px;">
            ${(play[role] || play.sm).map(x => `<li style="margin:8px 0; font-weight:650;">${x}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    host.innerHTML = cards + playCard;
  }

  function installInsightJumpHandlers(){
    // Removed: "Jump to chart" behavior was confusing and felt inconsistent.
    // Keeping this as a no-op preserves module call sites.
  }

  function chartName(canvasId){
    const map = {
      hist_velocityChart: 'Velocity Trend',
      hist_commitChart: 'Commitment vs Delivery',
      hist_capacityChart: 'Capacity Fit',
      hist_disruptionChart: 'Scope Disruption',
      hist_churnPctChart: 'Scope Churn %',
      hist_carryoverChart: 'Carryover Trend',
      hist_overcommitChart: 'Overcommit Ratio',
      hist_sickChart: 'Sick Leave Trend'
    };
    return map[canvasId] || 'Chart';
  }

  function renderVelocity(rows){
    const id="hist_velocityChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const completed = rows.map(r=>r.completed);
    const roll = movingAvg(completed, 3);
    const yMax = Math.max(...completed, ...roll.filter(v=>v!=null).map(v=>v||0), 0);

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[
          {
            label:"Completed",
            data: completed,
            ...lineDataset(COLORS.green, { dashed:false, fill:true, point:true }),
            backgroundColor:(c)=>gradientFill(c, COLORS.green)
          },
          {
            label:"3-sprint avg",
            data: roll,
            ...lineDataset(COLORS.indigo, { dashed:true, fill:false, point:false }),
            backgroundColor:"transparent"
          }
        ]
      },
      options: baseOptions({ yStep: niceStep(yMax) })
    });
    charts.set(id, chart);
  }

  function renderPredictability(rows){
    const id="hist_predictChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const pct = rows.map(r=>{
      const c=r.committed||0, d=r.completed||0;
      if(!c) return 0;
      return clampPct(Math.round((d/c)*100));
    });

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[{
          label:"Predictability",
          data: pct,
          ...lineDataset(COLORS.teal, { dashed:false, fill:true, point:true }),
          backgroundColor:(c)=>gradientFill(c, COLORS.teal, 0.22, 0.03)
        }]
      },
      options: baseOptions({ yStep:10, yMax:100, yIsPercent:true, tooltipSuffix:"%" }),
      plugins: [hLinePlugin({ canvasId:id, value:100 })]
    });
    charts.set(id, chart);
  }

  function renderCommitment(rows){
    const id="hist_commitChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const maxV = Math.max(
      ...rows.map(r => Math.max(r.committed||0, r.completed||0)),
      0
    );

    const chart = new Chart(canvas, {
      type:"bar",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[
          { label:"Committed", data: rows.map(r=>r.committed), backgroundColor:"rgba(147,51,234,0.88)", borderRadius:0, borderSkipped:false, barPercentage:0.75, categoryPercentage:0.75 },
          { label:"Completed", data: rows.map(r=>r.completed), backgroundColor:"rgba(22,163,74,0.88)", borderRadius:0, borderSkipped:false, barPercentage:0.75, categoryPercentage:0.75 },
        ]
      },
      options:(()=>{
        const opt = baseOptions({ yStep: niceStep(maxV) });
        opt.scales.x.grid.display=false;
        opt.layout={ padding:{ left:6, right:6 } };
        return opt;
      })()
    });
    charts.set(id, chart);
  }

  function renderCapacity(rows){
    const id="hist_capacityChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const cap = rows.map(r=>r.capacity||0);
    const committed = rows.map(r=>r.committed||0);
    const yMax = Math.max(...cap, ...committed, 0);
    const yTop = paddedMax(yMax, 0.18, 3);

    const chart = new Chart(canvas, {
      type:"bar",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[
          {
            type:"bar",
            label:"Committed",
            data: committed,
            backgroundColor:"rgba(249,115,22,0.88)",
            borderRadius:0,
            borderSkipped:false,
            barPercentage:0.72,
            categoryPercentage:0.72
          },
          {
            type:"line",
            label:"Forecast cap",
            data: cap,
            ...lineDataset(COLORS.indigo, { fill:false, point:true }),
            backgroundColor:"transparent"
          }
        ]
      },
      options: (()=>{
        const opt = baseOptions({ yStep: niceStep(yTop), yMax: yTop });
        opt.scales.x.grid.display=false;
        return opt;
      })()
    });
    charts.set(id, chart);
  }

  function renderDisruption(rows){
    const id="hist_disruptionChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const maxV = Math.max(
      ...rows.map(r => Math.max(r.added||0, r.removed||0)),
      0
    );

    const chart = new Chart(canvas, {
      type:"bar",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[
          { label:"Added", data: rows.map(r=>r.added), backgroundColor:"rgba(249,115,22,0.90)", borderRadius:0, borderSkipped:false, barPercentage:0.72, categoryPercentage:0.72 },
          { label:"Removed", data: rows.map(r=>r.removed), backgroundColor:"rgba(225,29,72,0.90)", borderRadius:0, borderSkipped:false, barPercentage:0.72, categoryPercentage:0.72 },
        ]
      },
      options:(()=>{
        const opt = baseOptions({ yStep: niceStep(maxV) });
        opt.scales.x.grid.display=false;
        opt.layout={ padding:{ left:6, right:6 } };
        return opt;
      })()
    });
    charts.set(id, chart);
  }

  function renderCarryover(rows){
    const id="hist_carryoverChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    // Carryover = max(0, Committed − Completed)
    const carry = rows.map(r => Math.max(0, (r.committed||0) - (r.completed||0)));
    const yMax = Math.max(...carry, 0);
    const yTop = Math.max(5, paddedMax(yMax, 0.22, 2));

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[{
          label:"Carryover",
          data: carry,
          ...lineDataset(COLORS.rose, { fill:true, point:true }),
          backgroundColor:(c)=>gradientFill(c, COLORS.rose, 0.16, 0.03)
        }]
      },
      options: baseOptions({ yStep: niceStep(yTop), yMin: 0, yMax: yTop }),
      plugins: [hLinePlugin({ canvasId:id, value:0, dash:[4,6] })]
    });
    charts.set(id, chart);
  }

  function renderOvercommitRatio(rows){
    const id="hist_overcommitChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const pct = rows.map(r => {
      const cap = r.capacity||0;
      const c = r.committed||0;
      return cap ? Math.round((c/cap)*100) : 0;
    });
    const yMax = Math.max(150, ...pct, 0);

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[{
          label:"Overcommit",
          data: pct,
          ...lineDataset(COLORS.yellow, { fill:true }),
          backgroundColor:(c)=>gradientFill(c, COLORS.yellow, 0.16, 0.03)
        }]
      },
      options: baseOptions({ yStep:10, yMax: yMax, yIsPercent:true, tooltipSuffix:"%" }),
      plugins: [hLinePlugin({ canvasId:id, value:100 })]
    });
    charts.set(id, chart);
  }

  function renderChurnPct(rows){
    const id="hist_churnPctChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const pct = rows.map(r => {
      const c = r.committed||0;
      const ch = (r.added||0)+(r.removed||0);
      return c ? Math.round((ch/c)*100) : 0;
    });
    const yMax = Math.max(40, ...pct, 0);

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[{
          label:"Churn %",
          data: pct,
          ...lineDataset(COLORS.teal, { fill:true }),
          backgroundColor:(c)=>gradientFill(c, COLORS.teal, 0.14, 0.03)
        }]
      },
      options: baseOptions({ yStep:10, yMax: yMax, yIsPercent:true, tooltipSuffix:"%" }),
      plugins: [hLinePlugin({ canvasId:id, value:15, color:"rgba(236,178,46,0.35)", dash:[3,6] })]
    });
    charts.set(id, chart);
  }

  function renderSick(rows){
    const id="hist_sickChart";
    const canvas=$(id); if(!canvas) return;
    destroyChart(id);

    const sick = rows.map(r=>r.sick||0);
    const yMax = Math.max(...sick, 0);

    const chart = new Chart(canvas, {
      type:"line",
      data:{
        labels: rows.map(r=>r.sprint),
        datasets:[{
          label:"Sick leave",
          data: sick,
          ...lineDataset(COLORS.red, { fill:true, point:true }),
          backgroundColor:(c)=>gradientFill(c, COLORS.red, 0.12, 0.02)
        }]
      },
      options: baseOptions({ yStep: niceStep(yTop), yMin: 0, yMax: yTop })
    });
    charts.set(id, chart);
  }

  function renderAll(){
    if(!window.Chart) return;
    const rows = loadRows();
    if(!rows.length) return;

    renderTiles(rows);
    renderInsights(rows);

    renderVelocity(rows);
    renderPredictability(rows);
    renderCommitment(rows);
    renderCapacity(rows);
    renderDisruption(rows);
    renderCarryover(rows);
    renderChurnPct(rows);
  }

  function wireRoleLens(){
    const sel = $("coach_roleSel");
    if(!sel) return;
    try {
      const saved = localStorage.getItem(ROLE_KEY);
      if (saved) sel.value = saved;
    } catch {}
    sel.addEventListener('change', () => {
      try { localStorage.setItem(ROLE_KEY, sel.value); } catch {}
      renderAll();
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    wireRoleLens();
    installInsightJumpHandlers();
    initTileModal();

    window.addEventListener("scrummer:historyChanged", ()=>{ if(window.Chart) renderAll(); });

    let tries=0;
    const tick=()=>{
      tries++;
      if(window.Chart) return renderAll();
      if(tries<60) return setTimeout(tick,100);
      console.warn("[Scrummer] Chart.js not found. Charts will stay empty.");
    };
    tick();
  });
})();
