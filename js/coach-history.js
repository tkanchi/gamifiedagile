// js/coach-history.js — Scrummer Coach (Sprint History v1.1)
// Safe add-on: does NOT depend on existing coach.js internals.
// Features:
//  - 6-sprint editable table (N .. N-5)
//  - Save/Load to localStorage
//  - Reset (clear localStorage + reset UI)
//  - Auto-fill from Plan localStorage: committed + last 3 velocities
//  - CSV upload (template format) + template download
//  - Demo data loader (one-click) ✅

(function () {
  const qs = (id) => document.getElementById(id);

  const HISTORY_KEY = "scrummer_sprint_history_v1";
  const PLAN_KEY = "scrummer_plan_setup_v3";

  const ROW_COUNT = 6;
  const DEFAULT_ROWS = ["Sprint N", "Sprint N-1", "Sprint N-2", "Sprint N-3", "Sprint N-4", "Sprint N-5"];

  // Forecast capacity estimation defaults (same as plan defaults)
  const DEFAULT_FOCUS = 0.60;
  const DEFAULT_LEAVE_WEIGHT = 1.0;
  const DEFAULT_SP_PER_TEAM_DAY = 1.0;

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function clampInt3(n){
    if(!Number.isFinite(n)) return null;
    const x = Math.round(n);
    return Math.max(0, Math.min(999, x));
  }

  function setStatus(msg){
    const el = qs("hist_status");
    if(el) el.textContent = msg || "—";
  }

  function safeParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

  function loadHistory(){
    try{
      const raw = localStorage.getItem(HISTORY_KEY);
      if(!raw) return null;
      const data = safeParse(raw, null);
      if(!Array.isArray(data)) return null;
      return data;
    }catch{
      return null;
    }
  }

  function saveHistory(rows){
    try{
      localStorage.setItem(HISTORY_KEY, JSON.stringify(rows));
      return true;
    }catch{
      return false;
    }
  }

  function clearHistory(){
    try{ localStorage.removeItem(HISTORY_KEY); }catch{}
  }

  function loadPlanSetup(){
    try{
      const raw = localStorage.getItem(PLAN_KEY);
      if(!raw) return null;
      return safeParse(raw, null);
    }catch{
      return null;
    }
  }

  function calcCapacityForecastFromPlan(plan){
    // Uses Plan setup inputs + default knobs.
    // forecastSP = max(0, teamMembers*(sprintDays*focus) - leaveDays*weight) * spPerTeamDay
    if(!plan) return null;

    const sprintDays = clampInt3(num(plan.sprintDays));
    const teamMembers = clampInt3(num(plan.teamMembers));
    const leaveDays = clampInt3(num(plan.leaveDays));

    if([sprintDays, teamMembers, leaveDays].some(v => v == null)) return null;

    const idealPerPerson = sprintDays * DEFAULT_FOCUS;
    const totalIdealDays = teamMembers * idealPerPerson;
    const totalActualDays = totalIdealDays - (leaveDays * DEFAULT_LEAVE_WEIGHT);
    const effectiveDays = Math.max(0, totalActualDays);
    const forecastSP = effectiveDays * DEFAULT_SP_PER_TEAM_DAY;

    return forecastSP;
  }

  function makeBlankRows(){
    return DEFAULT_ROWS.map((label) => ({
      sprint: label,
      forecastCapacity: null,
      actualCapacity: null,
      committedSP: null,
      completedSP: null,
      addedMid: null,
      removedMid: null,
      sickLeaveDays: null,
      _meta: { auto: {} }
    }));
  }

  function renderTable(rows){
    const tbody = qs("hist_rows");
    if(!tbody) return;

    tbody.innerHTML = "";

    rows.slice(0, ROW_COUNT).forEach((r, idx) => {
      const tr = document.createElement("tr");

      // Sprint label
      const tdSprint = document.createElement("td");
      tdSprint.innerHTML = `<span class="histSprint">${r.sprint || DEFAULT_ROWS[idx]}</span>`;
      tr.appendChild(tdSprint);

      // helper to add numeric cell
      function addNumCell(field, placeholder){
        const td = document.createElement("td");
        td.setAttribute("align","right");

        const inp = document.createElement("input");
        inp.className = "fun-input numSm histNum";
        inp.type = "number";
        inp.min = "0";
        inp.max = "999";
        inp.step = "1";
        inp.inputMode = "numeric";
        inp.placeholder = placeholder || "—";
        inp.value = (r[field] == null || Number.isNaN(r[field])) ? "" : String(Math.round(r[field]));

        inp.addEventListener("input", () => {
          const v = clampInt3(num(inp.value));
          r[field] = v;
          if(r._meta && r._meta.auto) r._meta.auto[field] = false;
        });

        td.appendChild(inp);

        // show tiny "Auto" indicator if field was auto-filled
        const isAuto = !!(r._meta && r._meta.auto && r._meta.auto[field]);
        if(isAuto){
          const pill = document.createElement("span");
          pill.className = "histAutoPill";
          pill.textContent = "Auto";
          td.appendChild(pill);
        }

        tr.appendChild(td);
      }

      addNumCell("forecastCapacity","—");
      addNumCell("actualCapacity","—");
      addNumCell("committedSP","—");
      addNumCell("completedSP","—");
      addNumCell("addedMid","0");
      addNumCell("removedMid","0");
      addNumCell("sickLeaveDays","0");

      tbody.appendChild(tr);
    });
  }

  function normalizeRows(rows){
    const base = makeBlankRows();
    if(!Array.isArray(rows)) return base;

    return base.map((b, i) => {
      const r = rows[i] || {};
      return {
        sprint: r.sprint || b.sprint,
        forecastCapacity: num(r.forecastCapacity),
        actualCapacity: num(r.actualCapacity),
        committedSP: num(r.committedSP),
        completedSP: num(r.completedSP),
        addedMid: num(r.addedMid),
        removedMid: num(r.removedMid),
        sickLeaveDays: num(r.sickLeaveDays),
        _meta: r._meta && typeof r._meta === "object" ? r._meta : { auto: {} }
      };
    });
  }

  function doSave(rows){
    const ok = saveHistory(rows);
    setStatus(ok ? "Saved ✔ Sprint history stored locally." : "Could not save (browser storage blocked).");
  }

  function doReset(){
    clearHistory();
    const rows = makeBlankRows();
    renderTable(rows);
    setStatus("Reset ✔ Table cleared.");
    return rows;
  }

  function doAutofill(rows){
    const plan = loadPlanSetup();
    if(!plan){
      setStatus("No Plan setup found. Go to Plan → Save once, then try Auto-fill.");
      return rows;
    }

    const committed = clampInt3(num(plan.committedSP));
    const capForecast = calcCapacityForecastFromPlan(plan);

    rows[0].committedSP = committed;
    rows[0].forecastCapacity = capForecast != null ? Math.round(capForecast) : null;
    rows[0]._meta = rows[0]._meta || { auto: {} };
    rows[0]._meta.auto = rows[0]._meta.auto || {};
    if(committed != null) rows[0]._meta.auto.committedSP = true;
    if(capForecast != null) rows[0]._meta.auto.forecastCapacity = true;

    const v1 = clampInt3(num(plan.v1));
    const v2 = clampInt3(num(plan.v2));
    const v3 = clampInt3(num(plan.v3));

    const map = [
      { row: 1, v: v1 },
      { row: 2, v: v2 },
      { row: 3, v: v3 },
    ];

    map.forEach(({row, v}) => {
      rows[row]._meta = rows[row]._meta || { auto: {} };
      rows[row]._meta.auto = rows[row]._meta.auto || {};
      if(v != null){
        rows[row].completedSP = v;
        rows[row]._meta.auto.completedSP = true;
      }
    });

    renderTable(rows);
    setStatus("Auto-fill applied ✨ You can override any cell.");
    return rows;
  }

  // ✅ Demo data (realistic patterns)
  function makeDemoRows(){
    const rows = makeBlankRows();

    // Newest first: N, N-1, ... N-5
    // Pattern: slight overcommit, some disruption, sick leaves spikes
    const demo = [
      // sprint, forecast, actual, committed, completed, added, removed, sick
      ["Sprint N",   38, 36, 40,  null,  6, 2, 2],
      ["Sprint N-1", 40, 39, 42,  38,    5, 3, 1],
      ["Sprint N-2", 37, 35, 36,  34,    3, 1, 4],
      ["Sprint N-3", 41, 40, 40,  42,    2, 4, 0],
      ["Sprint N-4", 39, 37, 38,  36,    7, 2, 2],
      ["Sprint N-5", 36, 36, 35,  35,    1, 1, 1],
    ];

    demo.forEach((d, i) => {
      rows[i].sprint = d[0];
      rows[i].forecastCapacity = d[1];
      rows[i].actualCapacity = d[2];
      rows[i].committedSP = d[3];
      rows[i].completedSP = d[4];
      rows[i].addedMid = d[5];
      rows[i].removedMid = d[6];
      rows[i].sickLeaveDays = d[7];
      rows[i]._meta = { auto: {} }; // demo counts as manual
    });

    return rows;
  }

  function doDemo(state){
    state.rows = makeDemoRows();
    renderTable(state.rows);
    doSave(state.rows);
    setStatus("Demo data loaded 🧪 (you can edit + Save anytime).");
  }

  // CSV helpers
  function downloadTemplateCSV(){
    const header = "Sprint,ForecastCapacitySP,ActualCapacitySP,CommittedSP,CompletedSP,AddedMid,RemovedMid,SickLeaveDays\n";
    const lines = DEFAULT_ROWS.map(s =>
      `${s},,,,0,0,0,0`
    ).join("\n");
    const csv = header + lines + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "scrummer_sprint_history_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Template downloaded ✔");
  }

  function parseCSV(text){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if(lines.length < 2) return null;

    const header = lines[0].split(",").map(h => h.trim());
    const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());

    const iSprint = idx("Sprint");
    const iFC = idx("ForecastCapacitySP");
    const iAC = idx("ActualCapacitySP");
    const iCom = idx("CommittedSP");
    const iDone = idx("CompletedSP");
    const iAdd = idx("AddedMid");
    const iRem = idx("RemovedMid");
    const iSick = idx("SickLeaveDays");

    if(iSprint < 0) return null;

    const rows = makeBlankRows();

    for(let li=1; li<lines.length && li<=ROW_COUNT; li++){
      const cols = lines[li].split(",").map(c => c.trim());
      const r = rows[li-1];

      r.sprint = cols[iSprint] || r.sprint;

      const read = (i) => (i >= 0 && i < cols.length) ? cols[i] : "";
      const toNum = (s) => {
        const n = num(s);
        return n == null ? null : clampInt3(n);
      };

      if(iFC >= 0) r.forecastCapacity = toNum(read(iFC));
      if(iAC >= 0) r.actualCapacity = toNum(read(iAC));
      if(iCom >= 0) r.committedSP = toNum(read(iCom));
      if(iDone >= 0) r.completedSP = toNum(read(iDone));
      if(iAdd >= 0) r.addedMid = toNum(read(iAdd));
      if(iRem >= 0) r.removedMid = toNum(read(iRem));
      if(iSick >= 0) r.sickLeaveDays = toNum(read(iSick));

      r._meta = { auto: {} };
    }

    return rows;
  }

  function attachHandlers(state){
    const btnSave = qs("hist_saveBtn");
    const btnReset = qs("hist_resetBtn");
    const btnAuto = qs("hist_autofillBtn");
    const btnDemo = qs("hist_demoBtn");
    const btnUpload = qs("hist_uploadCsvBtn");
    const btnTpl = qs("hist_downloadTplBtn");
    const fileInput = qs("hist_csvInput");

    btnSave?.addEventListener("click", () => doSave(state.rows));
    btnReset?.addEventListener("click", () => { state.rows = doReset(); });
    btnAuto?.addEventListener("click", () => { state.rows = doAutofill(state.rows); });
    btnDemo?.addEventListener("click", () => doDemo(state));
    btnTpl?.addEventListener("click", () => downloadTemplateCSV());

    btnUpload?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if(!file) return;

      const text = await file.text();
      const parsed = parseCSV(text);

      if(!parsed){
        setStatus("CSV format not recognized. Use Download Template and fill it.");
        fileInput.value = "";
        return;
      }

      state.rows = normalizeRows(parsed);
      renderTable(state.rows);
      doSave(state.rows);
      setStatus("CSV imported ✔ Saved locally.");
      fileInput.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const tbody = qs("hist_rows");
    if(!tbody) return;

    const saved = loadHistory();
    const rows = normalizeRows(saved || makeBlankRows());

    const state = { rows };

    renderTable(state.rows);
    setStatus(saved ? "Loaded saved sprint history." : "No sprint history yet. Use Auto-fill, Demo, or enter values, then Save.");

    attachHandlers(state);
  });
})();