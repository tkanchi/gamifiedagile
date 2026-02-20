// js/coach-history.js — Scrummer Coach (Sprint History v1.2)
// Safe add-on: does NOT depend on existing coach.js internals.
// Features:
//  - 6-sprint editable table (Sprint N-6 .. Sprint N-1)
//  - Save/Load to localStorage
//  - Reset (clear localStorage + reset UI)
//  - Auto-fill from Plan localStorage: committed (N-1) + last 3 velocities as completed (N-1..N-3)
//  - CSV upload (template format) + template download
//  - Demo data loader with variant dropdown (stable / recovery / overcommit)

(function () {
  const qs = (id) => document.getElementById(id);

  const HISTORY_KEY = "scrummer_sprint_history_v1";
  const PLAN_KEY = "scrummer_plan_setup_v3";

  const ROW_COUNT = 6;
  // Historical ONLY (no Sprint N here)
  const DEFAULT_ROWS = ["Sprint N-6", "Sprint N-5", "Sprint N-4", "Sprint N-3", "Sprint N-2", "Sprint N-1"];

  // Forecast capacity estimation defaults (matches Plan defaults)
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

  function renderTable(rows){
    const tbody = qs("hist_rows");
    if(!tbody) return;

    tbody.innerHTML = "";

    rows.slice(0, ROW_COUNT).forEach((r, idx) => {
      const tr = document.createElement("tr");

      const tdSprint = document.createElement("td");
      tdSprint.innerHTML = `<span class="histSprint">${r.sprint || DEFAULT_ROWS[idx]}</span>`;
      tr.appendChild(tdSprint);

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

  // Auto-fill strategy:
  // - Map Plan committedSP + capacity forecast to latest sprint: Sprint N-1 (last row)
  // - Map v1,v2,v3 (N-1,N-2,N-3 velocities) to completedSP on corresponding rows:
  //    N-1 => last row
  //    N-2 => second last
  //    N-3 => third last
  function doAutofill(rows){
    const plan = loadPlanSetup();
    if(!plan){
      setStatus("No Plan setup found. Go to Plan → Save once, then try Auto-fill.");
      return rows;
    }

    const committed = clampInt3(num(plan.committedSP));
    const capForecast = calcCapacityForecastFromPlan(plan);

    const idxN1 = ROW_COUNT - 1; // last row = Sprint N-1

    rows[idxN1].committedSP = committed;
    rows[idxN1].forecastCapacity = capForecast != null ? Math.round(capForecast) : null;
    rows[idxN1]._meta = rows[idxN1]._meta || { auto: {} };
    rows[idxN1]._meta.auto = rows[idxN1]._meta.auto || {};
    if(committed != null) rows[idxN1]._meta.auto.committedSP = true;
    if(capForecast != null) rows[idxN1]._meta.auto.forecastCapacity = true;

    const v1 = clampInt3(num(plan.v1)); // N-1
    const v2 = clampInt3(num(plan.v2)); // N-2
    const v3 = clampInt3(num(plan.v3)); // N-3

    const map = [
      { row: idxN1,     v: v1 }, // N-1
      { row: idxN1 - 1, v: v2 }, // N-2
      { row: idxN1 - 2, v: v3 }, // N-3
    ];

    map.forEach(({row, v}) => {
      if(row < 0) return;
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

  // Demo scenarios (6 rows: N-6..N-1, oldest->newest)
  function makeDemoRows(variant){
    const rows = makeBlankRows();

    // sprint, forecast, actual, committed, completed, added, removed, sick
    let demo;

    if(variant === "stable"){
      demo = [
        ["Sprint N-6", 34, 34, 35, 34, 1, 1, 0],
        ["Sprint N-5", 36, 35, 36, 35, 2, 1, 1],
        ["Sprint N-4", 35, 35, 34, 35, 1, 2, 0],
        ["Sprint N-3", 37, 36, 36, 36, 2, 1, 1],
        ["Sprint N-2", 36, 36, 36, 36, 1, 1, 0],
        ["Sprint N-1", 38, 37, 38, 37, 2, 2, 1],
      ];
    } else if(variant === "overcommit"){
      demo = [
        ["Sprint N-6", 36, 35, 42, 34, 6, 1, 2],
        ["Sprint N-5", 35, 34, 41, 33, 7, 2, 1],
        ["Sprint N-4", 37, 35, 43, 34, 8, 2, 3],
        ["Sprint N-3", 36, 34, 44, 32, 9, 3, 2],
        ["Sprint N-2", 38, 36, 40, 35, 5, 4, 1],
        ["Sprint N-1", 39, 38, 37, 38, 2, 5, 0], // correction
      ];
    } else {
      // "recovery" default
      demo = [
        ["Sprint N-6", 33, 32, 36, 30, 6, 1, 3],
        ["Sprint N-5", 34, 32, 37, 31, 7, 2, 2],
        ["Sprint N-4", 35, 33, 36, 32, 5, 3, 4],
        ["Sprint N-3", 36, 34, 35, 34, 3, 4, 2],
        ["Sprint N-2", 37, 36, 36, 36, 2, 3, 1],
        ["Sprint N-1", 39, 38, 38, 38, 1, 2, 0],
      ];
    }

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

  function getDemoVariant(){
    const sel = qs("hist_demoVariant");
    const v = sel ? String(sel.value || "").trim() : "";
    if(v === "stable" || v === "recovery" || v === "overcommit") return v;
    return "recovery";
  }

  function doDemo(state){
    const variant = getDemoVariant();
    state.rows = makeDemoRows(variant);
    renderTable(state.rows);
    doSave(state.rows);

    const label =
      variant === "stable" ? "Stable mature team" :
      variant === "overcommit" ? "Overcommit streak → correction" :
      "Chaos → recovery arc";

    setStatus(`Demo data loaded 🧪 (${label}). You can edit + Save anytime.`);
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