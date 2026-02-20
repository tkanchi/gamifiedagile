// js/coach-history.js — Scrummer Coach (History Table)
// - 6 sprints: N-6 → N-1
// - Save/Reset
// - Demo data variants
// - CSV upload + template download
// - Emits: window.ScrummerCoachHistory.getRows()

(() => {
  const KEY = "scrummer_coach_history_v1";

  const $ = (id) => document.getElementById(id);

  const SPRINTS = ["Sprint N-6","Sprint N-5","Sprint N-4","Sprint N-3","Sprint N-2","Sprint N-1"];

  function safeParse(str, fallback){
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function numOrBlank(v){
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return Number.isFinite(n) ? n : "";
  }

  function clamp0(n){
    n = Number(n);
    if (!Number.isFinite(n)) return "";
    return Math.max(0, n);
  }

  function defaultRows(){
    return SPRINTS.map(s => ({
      sprint: s,
      forecastCap: "",
      actualCap: "",
      committed: "",
      completed: "",
      addedMid: "",
      removedMid: "",
      sickLeave: ""
    }));
  }

  function loadRows(){
    const raw = localStorage.getItem(KEY);
    const rows = safeParse(raw || "null", null);
    if (!Array.isArray(rows) || rows.length !== 6) return defaultRows();

    // normalize
    return rows.map((r, i) => ({
      sprint: SPRINTS[i],
      forecastCap: numOrBlank(r.forecastCap),
      actualCap: numOrBlank(r.actualCap),
      committed: numOrBlank(r.committed),
      completed: numOrBlank(r.completed),
      addedMid: numOrBlank(r.addedMid),
      removedMid: numOrBlank(r.removedMid),
      sickLeave: numOrBlank(r.sickLeave),
    }));
  }

  function saveRows(rows){
    localStorage.setItem(KEY, JSON.stringify(rows));
  }

  function setStatus(msg){
    const el = $("hist_status");
    if (el) el.textContent = msg || "—";
  }

  function emitChanged(){
    window.dispatchEvent(new CustomEvent("scrummer:historyChanged"));
  }

  function cellInput({ value, onInput, placeholder="—" }){
    const inp = document.createElement("input");
    inp.className = "fun-input numSm";
    inp.type = "number";
    inp.min = "0";
    inp.max = "9999";
    inp.step = "1";
    inp.inputMode = "numeric";
    inp.value = (value === "" ? "" : String(value));
    inp.placeholder = placeholder;
    inp.addEventListener("input", () => onInput(inp.value));
    return inp;
  }

  function render(){
    const tbody = $("hist_rows");
    if (!tbody) return;

    const rows = loadRows();
    tbody.innerHTML = "";

    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");

      // Sprint label
      const tdS = document.createElement("td");
      tdS.style.fontWeight = "850";
      tdS.textContent = r.sprint;
      tr.appendChild(tdS);

      function addNumCell(key){
        const td = document.createElement("td");
        td.align = "right";
        td.appendChild(cellInput({
          value: r[key],
          onInput: (v) => {
            const rowsNow = loadRows();
            rowsNow[idx][key] = clamp0(v === "" ? "" : Number(v));
            saveRows(rowsNow);
            setStatus("Edited (not saved as snapshot — charts update on Save / Demo / CSV).");
          }
        }));
        tr.appendChild(td);
      }

      addNumCell("forecastCap");
      addNumCell("actualCap");
      addNumCell("committed");
      addNumCell("completed");
      addNumCell("addedMid");
      addNumCell("removedMid");
      addNumCell("sickLeave");

      tbody.appendChild(tr);
    });

    setStatus("Ready.");
  }

  // ---------- Demo data ----------
  function demoRows(variant){
    const v = String(variant || "recovery");

    if (v === "stable") {
      // steady velocity, low churn, good predictability
      const base = [
        {fc:38, ac:36, com:36, done:35, add:2, rem:1, sick:1},
        {fc:40, ac:39, com:40, done:39, add:3, rem:2, sick:0},
        {fc:39, ac:38, com:38, done:38, add:2, rem:1, sick:1},
        {fc:41, ac:40, com:41, done:40, add:2, rem:2, sick:0},
        {fc:40, ac:39, com:39, done:39, add:1, rem:1, sick:0},
        {fc:42, ac:41, com:41, done:41, add:2, rem:1, sick:0},
      ];
      return base.map((x,i)=>({
        sprint: SPRINTS[i],
        forecastCap:x.fc, actualCap:x.ac,
        committed:x.com, completed:x.done,
        addedMid:x.add, removedMid:x.rem,
        sickLeave:x.sick
      }));
    }

    if (v === "overcommit") {
      // overcommit streak then correction
      const base = [
        {fc:34, ac:32, com:44, done:30, add:10, rem:2, sick:2},
        {fc:35, ac:33, com:46, done:31, add:9,  rem:3, sick:1},
        {fc:36, ac:34, com:45, done:33, add:8,  rem:4, sick:1},
        {fc:36, ac:35, com:42, done:35, add:5,  rem:5, sick:1},
        {fc:38, ac:37, com:39, done:37, add:3,  rem:4, sick:0},
        {fc:40, ac:39, com:38, done:39, add:2,  rem:3, sick:0},
      ];
      return base.map((x,i)=>({
        sprint: SPRINTS[i],
        forecastCap:x.fc, actualCap:x.ac,
        committed:x.com, completed:x.done,
        addedMid:x.add, removedMid:x.rem,
        sickLeave:x.sick
      }));
    }

    // recovery (default): chaos → improved predictability
    const base = [
      {fc:30, ac:24, com:40, done:18, add:14, rem:3, sick:4},
      {fc:32, ac:28, com:42, done:24, add:12, rem:5, sick:3},
      {fc:35, ac:32, com:40, done:30, add:8,  rem:6, sick:2},
      {fc:38, ac:36, com:39, done:34, add:6,  rem:5, sick:2},
      {fc:40, ac:38, com:38, done:37, add:3,  rem:4, sick:1},
      {fc:42, ac:40, com:40, done:40, add:2,  rem:3, sick:1},
    ];
    return base.map((x,i)=>({
      sprint: SPRINTS[i],
      forecastCap:x.fc, actualCap:x.ac,
      committed:x.com, completed:x.done,
      addedMid:x.add, removedMid:x.rem,
      sickLeave:x.sick
    }));
  }

  // ---------- CSV ----------
  function toCsv(rows){
    const header = ["sprint","forecastCap","actualCap","committed","completed","addedMid","removedMid","sickLeave"];
    const lines = [header.join(",")];

    rows.forEach(r => {
      const vals = header.map(k => {
        const v = r[k] ?? "";
        const s = String(v);
        // simple escaping
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replaceAll('"','""')}"`;
        }
        return s;
      });
      lines.push(vals.join(","));
    });

    return lines.join("\n");
  }

  function downloadText(filename, text){
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text){
    // Simple CSV parser for this template (supports quoted cells).
    const rows = [];
    let i = 0, field = "", inQ = false;
    const out = [];
    function pushField(){ out.push(field); field = ""; }
    function pushRow(){ rows.push(out.slice()); out.length = 0; }

    while (i < text.length) {
      const c = text[i];

      if (inQ) {
        if (c === '"') {
          const nxt = text[i+1];
          if (nxt === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        } else {
          field += c; i++; continue;
        }
      } else {
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ",") { pushField(); i++; continue; }
        if (c === "\n") { pushField(); pushRow(); i++; continue; }
        if (c === "\r") { i++; continue; }
        field += c; i++; continue;
      }
    }
    pushField();
    if (out.length) pushRow();

    if (!rows.length) return null;

    const header = rows[0].map(s => String(s || "").trim());
    const idx = (name) => header.indexOf(name);

    const need = ["sprint","forecastCap","actualCap","committed","completed","addedMid","removedMid","sickLeave"];
    if (need.some(k => idx(k) === -1)) return null;

    const data = defaultRows();
    for (let r = 1; r < rows.length && r <= 6; r++){
      const row = rows[r];
      const sprint = String(row[idx("sprint")] || "").trim();
      const pos = SPRINTS.indexOf(sprint);
      const iPos = (pos >= 0 ? pos : (r-1));
      if (iPos < 0 || iPos > 5) continue;

      data[iPos] = {
        sprint: SPRINTS[iPos],
        forecastCap: clamp0(row[idx("forecastCap")]),
        actualCap: clamp0(row[idx("actualCap")]),
        committed: clamp0(row[idx("committed")]),
        completed: clamp0(row[idx("completed")]),
        addedMid: clamp0(row[idx("addedMid")]),
        removedMid: clamp0(row[idx("removedMid")]),
        sickLeave: clamp0(row[idx("sickLeave")]),
      };
    }
    return data;
  }

  function wire(){
    $("hist_demoBtn")?.addEventListener("click", () => {
      const variant = $("hist_demoVariant")?.value || "recovery";
      const rows = demoRows(variant);
      saveRows(rows);
      render();
      setStatus(`✅ Demo loaded (${variant}). Click Save to refresh charts.`);
    });

    $("hist_saveBtn")?.addEventListener("click", () => {
      // already persisted on every input; Save is a “commit + refresh”
      setStatus("✅ Saved. Charts refreshed.");
      emitChanged();
    });

    $("hist_resetBtn")?.addEventListener("click", () => {
      saveRows(defaultRows());
      render();
      emitChanged();
      setStatus("Reset ✔");
    });

    $("hist_downloadTplBtn")?.addEventListener("click", () => {
      downloadText("scrummer_sprint_history_template.csv", toCsv(defaultRows()));
      setStatus("Template downloaded ✔");
    });

    $("hist_uploadCsvBtn")?.addEventListener("click", () => {
      $("hist_csvInput")?.click();
    });

    $("hist_csvInput")?.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      const text = await f.text();
      const parsed = parseCsv(text);
      if (!parsed) {
        setStatus("⚠️ CSV format not recognized. Use Download Template.");
        e.target.value = "";
        return;
      }

      saveRows(parsed);
      render();
      emitChanged();
      setStatus("✅ CSV imported. Charts refreshed.");
      e.target.value = "";
    });
  }

  // Public API for charts module
  function getRows(){
    return loadRows();
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    render();
    wire();

    // Tabs (only health + copilot)
    const btns = Array.from(document.querySelectorAll(".tabBtn"));
    const panels = {
      health: $("panel-health"),
      copilot: $("panel-copilot"),
    };
    function setActive(name){
      btns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle("hidden", k !== name);
      });
      if (history.replaceState) history.replaceState(null, "", "#" + name);
    }
    btns.forEach(b => b.addEventListener("click", () => setActive(b.dataset.tab)));

    const hash = (location.hash || "").replace("#","");
    const initial = (hash && panels[hash]) ? hash : "health";
    setActive(initial);

    // expose
    window.ScrummerCoachHistory = { getRows, KEY, emitChanged };
  });
})();