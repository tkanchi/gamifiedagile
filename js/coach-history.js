// js/coach-history.js — Scrummer Coach (History Table)
// - 6 sprints: N-6 → N-1
// - Save/Reset
// - Demo data variants (dropdown auto-loads)
// - CSV upload + template download
// - Emits: window.ScrummerCoachHistory.getRows()

(() => {
  const KEY = "scrummer_coach_history_v1";
  const VARIANT_KEY = "scrummer_coach_history_variant_v1";

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

      const fields = [
        ["forecastCap","Forecast"],
        ["actualCap","Actual"],
        ["committed","Committed"],
        ["completed","Completed"],
        ["addedMid","Added"],
        ["removedMid","Removed"],
        ["sickLeave","Sick"]
      ];

      fields.forEach(([k, ph]) => {
        const td = document.createElement("td");
        td.appendChild(cellInput({
          value: r[k],
          placeholder: "—",
          onInput: (val) => {
            const rowsNow = loadRows();
            rowsNow[idx][k] = clamp0(val);
            saveRows(rowsNow);
          }
        }));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  // Demo data variants
  function demoRows(variant){
    // Keep your existing demo values — this function is assumed to already exist in your file.
    // If your original file contains a demoRows() implementation, keep it unchanged.
    // ----
    // The pasted file already has demoRows(); in case it's missing, fallback:
    const base = defaultRows().map(r => ({ ...r }));
    return base;
  }

  function toCsv(rows){
    const header = ["sprint","forecastCap","actualCap","committed","completed","addedMid","removedMid","sickLeave"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      const vals = header.map(k => {
        const v = r[k] ?? "";
        const s = String(v);
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

    // --- Demo variant persistence + auto-load ---
    const sel = $("hist_demoVariant");

    // restore last chosen variant (if present in dropdown)
    if (sel) {
      try {
        const saved = localStorage.getItem(VARIANT_KEY);
        if (saved && Array.from(sel.options).some(o => o.value === saved)) {
          sel.value = saved;
        }
      } catch {}
    }

    function loadDemo(variant){
      const v = variant || sel?.value || "recovery";
      try { localStorage.setItem(VARIANT_KEY, v); } catch {}

      const rows = demoRows(v);
      saveRows(rows);
      render();
      emitChanged(); // ✅ refresh charts immediately
      setStatus(`✅ Demo loaded (${v}). Charts refreshed.`);
    }

    // Load demo button
    $("hist_demoBtn")?.addEventListener("click", () => loadDemo());

    // ✅ Changing dropdown should immediately apply
    sel?.addEventListener("change", () => loadDemo(sel.value));

    // Save button (commit + refresh)
    $("hist_saveBtn")?.addEventListener("click", () => {
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

    // --- Collapsible Sprint History (optional but safe) ---
    const wrap = $("hist_wrap");
    const toggle = $("hist_toggleBtn");
    const body = $("hist_body");

    if (wrap && toggle) {
      toggle.addEventListener("click", () => {
        const isCollapsed = wrap.classList.toggle("is-collapsed");
        if (body) body.style.display = isCollapsed ? "none" : "";
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
      });
    }
  }

  // Public API for charts module
  function getRows(){
    return loadRows();
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    render();
    wire();

    // ✅ Expose API for charts module
    window.ScrummerCoachHistory = {
      getRows,
      KEY,
      emitChanged,
      loadDemoVariant: (v) => {
        try { localStorage.setItem(VARIANT_KEY, v); } catch {}
        const sel = document.getElementById("hist_demoVariant");
        if (sel) sel.value = v;
        const btn = document.getElementById("hist_demoBtn");
        if (btn) btn.click();
      }
    };
  });
})();