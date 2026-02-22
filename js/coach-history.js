/**
 * Scrummer — Coach History (Elite) — v200
 * --------------------------------------
 * - Dropdown auto-loads demo scenario (no extra demo button)
 * - One button only: Auto-fill (plan if available else keep)
 * - Save triggers scrummer:historyChanged (charts + KPIs + insights update)
 * - Storage: localStorage["scrummer_sprint_history_v1"] => { sprints: [...] }
 */

(() => {
  const STORAGE_KEY = "scrummer_sprint_history_v1";
  const VARIANT_KEY = "scrummer_coach_demo_variant_v1";

  const $ = (id) => document.getElementById(id);
  const SPRINTS = ["Sprint N-6","Sprint N-5","Sprint N-4","Sprint N-3","Sprint N-2","Sprint N-1"];

  function safeParse(str, fallback){ try { return JSON.parse(str); } catch { return fallback; } }
  function clamp0(v){
    if (v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function emitChanged(){
    window.dispatchEvent(new CustomEvent("scrummer:historyChanged"));
  }

  function loadModel(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const m = safeParse(raw || "null", null);
    if (!m || !Array.isArray(m.sprints) || m.sprints.length < 6) {
      return { sprints: SPRINTS.map(id => ({
        id, forecastCapacitySP: 0, actualCapacitySP: 0,
        committedSP: 0, completedSP: 0,
        addedMid: 0, removedMid: 0, sickLeaveDays: 0
      })) };
    }
    // normalize to last 6
    const last = m.sprints.slice(-6);
    return { sprints: last.map((s, i) => ({
      id: String(s?.id ?? SPRINTS[i]),
      forecastCapacitySP: clamp0(s?.forecastCapacitySP ?? s?.forecastCap ?? 0),
      actualCapacitySP: clamp0(s?.actualCapacitySP ?? s?.actualCap ?? 0),
      committedSP: clamp0(s?.committedSP ?? s?.committed ?? 0),
      completedSP: clamp0(s?.completedSP ?? s?.completed ?? 0),
      addedMid: clamp0(s?.addedMid ?? s?.unplannedSP ?? 0),
      removedMid: clamp0(s?.removedMid ?? 0),
      sickLeaveDays: clamp0(s?.sickLeaveDays ?? s?.sickLeave ?? 0)
    })) };
  }

  function saveModel(model){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
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

    const model = loadModel();
    tbody.innerHTML = "";

    model.sprints.forEach((s, idx) => {
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
          const m = loadModel();
          m.sprints[idx][k] = clamp0(val);
          saveModel(m);
        }));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  /* Demo data (can be aligned to Plan later; this is the single source now) */
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

    const base =
      name === "stable" ? stable :
      name === "overcommit" ? overcommit :
      recovery;

    return { sprints: SPRINTS.map((id, i) => {
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
    saveModel(demoVariant(name));
    renderTable();
    emitChanged();
    setStatus(`✅ Scenario loaded: ${name}. Charts updated.`);
  }

  function wire(){
    // collapse
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

    // dropdown auto-load
    const sel = $("hist_demoVariant");
    if (sel) {
      try {
        const saved = localStorage.getItem(VARIANT_KEY);
        if (saved) sel.value = saved;
      } catch {}

      sel.addEventListener("change", () => {
        try { localStorage.setItem(VARIANT_KEY, sel.value); } catch {}
        applyDemo(sel.value);
      });
    }

    // Auto-fill button (single button)
    $("hist_autofillBtn")?.addEventListener("click", () => {
      // If later you wire Plan → Coach, do it here.
      // For now: just re-apply current dropdown scenario (keeps UX consistent).
      const v = sel?.value || "recovery";
      applyDemo(v);
    });

    $("hist_saveBtn")?.addEventListener("click", () => {
      emitChanged();
      setStatus("✅ Saved. Charts updated.");
    });

    $("hist_resetBtn")?.addEventListener("click", () => {
      saveModel(demoVariant("recovery"));
      renderTable();
      emitChanged();
      setStatus("Reset ✔");
    });

    // CSV template/export/import can be added later (kept simple here)
    $("hist_downloadTplBtn")?.addEventListener("click", () => {
      setStatus("Template download: not enabled in v200 (tell me if you want it back).");
    });

    $("hist_uploadCsvBtn")?.addEventListener("click", () => {
      setStatus("CSV upload: not enabled in v200 (tell me if you want it back).");
    });
  }

  // expose rows for fallback if needed
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
      sickLeave: s.sickLeaveDays
    }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    // ensure model exists
    const m = loadModel();
    saveModel(m);

    renderTable();
    wire();

    window.ScrummerCoachHistory = { getRows };
    emitChanged(); // initial render
  });
})();
