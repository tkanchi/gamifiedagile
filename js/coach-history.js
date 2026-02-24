
// js/coach-history.js — Scrummer Coach (History Table) — v213
// ---------------------------------------------------------
// ✅ Single source of truth shared with Plan + Charts:
//    localStorage["scrummer_sprint_history_v1"] => { sprints: [...] }
//
// - Dropdown auto-loads demo scenario (no separate "Load Demo" button)
// // - Save triggers scrummer:historyChanged so charts/KPIs/insights refresh
// - CSV upload + template download kept

(() => {
  const HISTORY_KEY = "scrummer_sprint_history_v1";
  const VARIANT_KEY = "scrummer_coach_demo_variant_v1";

  const $ = (id) => document.getElementById(id);
  const SPRINTS = ["Sprint N-6","Sprint N-5","Sprint N-4","Sprint N-3","Sprint N-2","Sprint N-1"];

  function safeParse(str, fallback){ try { return JSON.parse(str); } catch { return fallback; } }
  function clamp0(v){
    if (v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  function emitChanged(){ window.dispatchEvent(new CustomEvent("scrummer:historyChanged")); }

  function defaultModel(){
    return {
      sprints: SPRINTS.map(id => ({
        id,
        forecastCapacitySP: 0,
        actualCapacitySP: 0,
        committedSP: 0,
        completedSP: 0,
        addedMid: 0,
        removedMid: 0,
        sickLeaveDays: 0
      }))
    };
  }

  function loadModel(){
    const raw = localStorage.getItem(HISTORY_KEY);
    const m = safeParse(raw || "null", null);
    if (!m || !Array.isArray(m.sprints)) return defaultModel();
    const last = m.sprints.slice(-6);
    return { sprints: last.map((s,i)=>({
      id: String(s?.id ?? SPRINTS[i]),
      forecastCapacitySP: clamp0(s?.forecastCapacitySP ?? s?.forecastCap ?? 0),
      actualCapacitySP: clamp0(s?.actualCapacitySP ?? s?.actualCap ?? 0),
      committedSP: clamp0(s?.committedSP ?? s?.committed ?? 0),
      completedSP: clamp0(s?.completedSP ?? s?.completed ?? 0),
      addedMid: clamp0(s?.addedMid ?? s?.unplannedSP ?? 0),
      removedMid: clamp0(s?.removedMid ?? 0),
      sickLeaveDays: clamp0(s?.sickLeaveDays ?? s?.sickLeave ?? 0)
    }))};
  }

  function saveModel(m){
    localStorage.setItem(HISTORY_KEY, JSON.stringify(m));
  }

  function setStatus(msg){
    const el = $("hist_status");
    if (el) el.textContent = msg || "—";
  }

  function inputCell(value, onInput){
    const inp = document.createElement("input");
    inp.className = "fun-input numSm";
    inp.type = "number";
    inp.min = "0";
    inp.max = "9999";
    inp.step = "1";
    inp.inputMode = "numeric";
    inp.value = String(value ?? 0);
    inp.addEventListener("input", () => onInput(inp.value));
    return inp;
  }

  function renderTable(){
    const tbody = $("hist_rows");
    if (!tbody) return;

    const m = loadModel();
    tbody.innerHTML = "";

    m.sprints.forEach((s, idx) => {
      const tr = document.createElement("tr");

      const tdSprint = document.createElement("td");
      tdSprint.textContent = s.id;
      tr.appendChild(tdSprint);

      const fields = [
        ["forecastCapacitySP"],
        ["actualCapacitySP"],
        ["committedSP"],
        ["completedSP"],
        ["addedMid"],
        ["removedMid"],
        ["sickLeaveDays"],
      ];

      fields.forEach(([k]) => {
        const td = document.createElement("td");
        td.appendChild(inputCell(s[k], (val) => {
          const cur = loadModel();
          cur.sprints[idx][k] = clamp0(val);
          saveModel(cur);
        }));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

    function prettyName(v){
    if (v === "excellent") return "Excellent";
    if (v === "risky") return "Risky";
    return "Normal";
  }

function demoVariant(name){
    const stable = [
      [40,38,38,37,2,1,0],
      [42,40,40,39,2,1,0],
      [41,40,40,40,1,1,0],
      [43,41,41,40,2,1,0],
      [42,41,41,41,1,1,0],
      [44,42,42,41,2,1,0],
    ];
    const recovery = [
      [30,24,40,18,14,3,4],
      [32,28,42,24,12,5,3],
      [35,32,40,30,8,6,2],
      [38,36,39,34,6,5,2],
      [40,39,40,38,4,3,1],
      [42,41,41,41,2,1,0],
    ];
    const overcommit = [
      [38,34,48,30,8,2,1],
      [40,36,50,32,7,3,1],
      [42,38,52,34,6,3,1],
      [44,40,54,36,5,3,1],
      [44,41,48,39,3,2,0],
      [44,42,44,41,2,1,0],
    ];
    const base = name === "excellent" ? stable : (name === "risky" ? overcommit : recovery);

    return { sprints: SPRINTS.map((id,i)=>{
      const [fc, ac, com, done, add, rem, sick] = base[i];
      return {
        id,
        forecastCapacitySP: fc,
        actualCapacitySP: ac,
        committedSP: com,
        completedSP: done,
        addedMid: add,
        removedMid: rem,
        sickLeaveDays: sick
      };
    })};
  }

  function applyDemo(name){
    const m = demoVariant(name);
    saveModel(m);
    renderTable();
    emitChanged();
    setStatus(`✅ Demo data loaded: ${prettyName(name)}.`);
  }

  // NOTE: Coach is intentionally self-contained.
  // Previously an "Auto-fill from Plan" block leaked into this file
  // and crashed Coach when opened directly. Keep Coach independent.

  function toCsv(model){
    const header = ["id","forecastCapacitySP","actualCapacitySP","committedSP","completedSP","addedMid","removedMid","sickLeaveDays"];
    const lines = [header.join(",")];
    model.sprints.forEach(s => {
      lines.push(header.map(k => String(s[k] ?? "")).join(","));
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
    const rows = text.trim().split(/\r?\n/).map(l => l.split(","));
    if (rows.length < 2) return null;
    const header = rows[0];
    const idx = (k) => header.indexOf(k);
    const need = ["id","forecastCapacitySP","actualCapacitySP","committedSP","completedSP","addedMid","removedMid","sickLeaveDays"];
    if (need.some(k => idx(k) === -1)) return null;

    const m = defaultModel();
    for (let i=1; i<rows.length && i<=6; i++){
      const r = rows[i];
      const id = String(r[idx("id")] || SPRINTS[i-1]);
      m.sprints[i-1] = {
        id,
        forecastCapacitySP: clamp0(r[idx("forecastCapacitySP")]),
        actualCapacitySP: clamp0(r[idx("actualCapacitySP")]),
        committedSP: clamp0(r[idx("committedSP")]),
        completedSP: clamp0(r[idx("completedSP")]),
        addedMid: clamp0(r[idx("addedMid")]),
        removedMid: clamp0(r[idx("removedMid")]),
        sickLeaveDays: clamp0(r[idx("sickLeaveDays")]),
      };
    }
    return m;
  }

  function wire(){
    // Collapse
    const wrap = $("hist_wrap");
    const toggle = $("hist_toggleBtn");
    const body = $("hist_body");
    if (wrap && toggle){
      toggle.addEventListener("click", () => {
        const isCollapsed = wrap.classList.toggle("is-collapsed");
        if (body) body.style.display = isCollapsed ? "none" : "";
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
      });
    }

    // dropdown restore + auto load on change
    const sel = $("hist_demoVariant");
    if (sel){
      try {
        const saved = localStorage.getItem(VARIANT_KEY);
        if (saved) {
          const map = { stable: 'excellent', recovery: 'normal', overcommit: 'risky' };
          sel.value = map[saved] || saved;
        }
      } catch {}
      sel.addEventListener("change", () => {
        try { localStorage.setItem(VARIANT_KEY, sel.value); } catch {}
        applyDemo(sel.value);
      });
    }

    $("hist_saveBtn")?.addEventListener("click", () => {
      emitChanged();
      setStatus("✅ Saved. Charts updated.");
    });

    $("hist_resetBtn")?.addEventListener("click", () => {
      try { localStorage.removeItem(VARIANT_KEY); } catch {}
      const m = defaultModel();
      saveModel(m);
      renderTable();
      emitChanged();
      setStatus("Reset ✔ (cleared)");
    });

    $("hist_downloadTplBtn")?.addEventListener("click", () => {
      downloadText("scrummer_sprint_history_template.csv", toCsv(defaultModel()));
      setStatus("Template downloaded ✔");
    });

    $("hist_uploadCsvBtn")?.addEventListener("click", () => $("hist_csvInput")?.click());

    $("hist_csvInput")?.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      const text = await f.text();
      const parsed = parseCsv(text);
      if (!parsed){
        setStatus("⚠️ CSV format not recognized. Use Download Template.");
        e.target.value = "";
        return;
      }

      saveModel(parsed);
      renderTable();
      emitChanged();
      setStatus("✅ CSV imported. Charts updated.");
      e.target.value = "";
    });
  }

  // Public API for charts module fallback
  function getRows(){
    const m = loadModel();
    return m.sprints.map(s => ({
      sprint: s.id,
      forecastCap: s.forecastCapacitySP,
      actualCap: s.actualCapacitySP,
      committed: s.committedSP,
      completed: s.completedSP,
      addedMid: s.addedMid,
      removedMid: s.removedMid,
      sickLeave: s.sickLeaveDays,
    }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Seed demo data on first open (so charts are not blank)
    const hasHistory = !!localStorage.getItem(HISTORY_KEY);
    if (!hasHistory) {
      const sel = $("hist_demoVariant");
      const v = (localStorage.getItem(VARIANT_KEY) || (sel && sel.value) || "normal");
      saveModel(demoVariant(v));
    } else {
      // Ensure model shape is normalized
      const m = loadModel();
      saveModel(m);
    }

    renderTable();
    wire();

    window.ScrummerCoachHistory = { getRows };
    emitChanged();
  });
})();
