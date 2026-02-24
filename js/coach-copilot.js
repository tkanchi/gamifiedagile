/**
 * Scrummer — Coach Copilot (embedded) — v213
 * --------------------------------------------------------------
 * Local, deterministic copilot (no LLM calls).
 * Goal: replicate the feel of Modern-Joy /workspace.html inside Coach.
 * Stores decisions in localStorage so it works offline.
 */

(() => {
  const $ = (id) => document.getElementById(id);

  const HISTORY_KEY = "scrummer_sprint_history_v1";
  const NOTES_KEY = "scrummer_copilot_notes_v1";
  const STATE_KEY = "scrummer_copilot_state_v1";

  const CEREMONIES = ["planning", "daily", "refinement", "review", "retro"];
  const LABEL = {
    planning: "Planning",
    daily: "Daily",
    refinement: "Refinement",
    review: "Review",
    retro: "Retro",
  };

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const s = safeParse(localStorage.getItem(STATE_KEY) || "{}", {});
    return {
      ceremony: CEREMONIES.includes(s.ceremony) ? s.ceremony : "planning",
      angle: Number.isFinite(Number(s.angle)) ? Number(s.angle) : 0,
    };
  }

  function saveState(st) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch {}
  }

  function loadNotes() {
    const m = safeParse(localStorage.getItem(NOTES_KEY) || "{}", {});
    const items = Array.isArray(m.items) ? m.items : [];
    return { items };
  }

  function saveNotes(m) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(m)); } catch {}
  }

  function normalizeRows() {
    const raw = localStorage.getItem(HISTORY_KEY);
    const m = safeParse(raw || "null", null);
    const sprints = Array.isArray(m?.sprints) ? m.sprints.slice(-6) : [];
    return sprints.map((s, i) => ({
      sprint: String(s?.id ?? `Sprint ${i + 1}`),
      capacity: Number(s?.forecastCapacitySP ?? 0),
      committed: Number(s?.committedSP ?? 0),
      completed: Number(s?.completedSP ?? 0),
      added: Number(s?.addedMid ?? 0),
      removed: Number(s?.removedMid ?? 0),
      sick: Number(s?.sickLeaveDays ?? 0),
    }));
  }

  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

  function metrics() {
    const rows = normalizeRows();
    const last = rows[rows.length - 1] || {};

    const completed = rows.map(r => r.completed || 0);
    const committed = rows.map(r => r.committed || 0);
    const cap = rows.map(r => r.capacity || 0);

    const velAvg = mean(completed);
    const vel3 = mean(completed.slice(-3));

    const predAvg = mean(rows.map(r => {
      const c = r.committed || 0, d = r.completed || 0;
      return c ? Math.round((d / c) * 100) : 0;
    }));

    const churnPctAvg = mean(rows.map(r => {
      const c = r.committed || 0;
      const ch = (r.added || 0) + (r.removed || 0);
      return c ? Math.round((ch / c) * 100) : 0;
    }));

    const overcommitLatest = (last.capacity ? (last.committed / last.capacity) : 0);
    const carryoverLatest = Math.max(0, (last.committed || 0) - (last.completed || 0));

    return {
      hasData: rows.some(r => (r.capacity + r.committed + r.completed + r.added + r.removed + r.sick) > 0),
      rows,
      last,
      velAvg: Math.round(velAvg),
      vel3: Math.round(vel3),
      predAvg: Math.round(predAvg),
      churnPctAvg: Math.round(churnPctAvg),
      overcommitPctLatest: Math.round(overcommitLatest * 100),
      carryoverLatest,
      sickLatest: Number(last.sick || 0),
    };
  }

  // Prompt bank (4–6 per ceremony). "New angle" rotates the set.
  const BANK = {
    planning: (m) => ([
      {
        title: "Capacity-first commitment",
        body: `Latest forecast capacity is ${m.last.capacity || 0} SP and your 3-sprint avg completed is ${m.vel3} SP. What commitment range keeps overcommit ≤ 100%?`,
      },
      {
        title: "Protect the sprint goal",
        body: `List the top 1–2 sprint goals. What change rule will you use if scope is added mid-sprint (e.g., swap equal SP)?`,
      },
      {
        title: "Risk check",
        body: `Carryover last sprint was ${m.carryoverLatest} SP and churn avg is ${m.churnPctAvg}%. What buffer will you reserve (10–15%)?`,
      },
      {
        title: "Definition of Ready",
        body: `Pick one Ready rule to reduce churn: clear acceptance criteria, dependencies identified, size ≤ 8 SP, test notes included. Which one is weakest today?`,
      },
      {
        title: "Forecast confidence",
        body: `Your avg predictability is ${m.predAvg}%. What single planning change would move it +5% next sprint?`,
      },
    ]),

    daily: (m) => ([
      {
        title: "Flow pulse",
        body: `What is the #1 item blocking progress today? Name the owner + next step + when it will be cleared.`,
      },
      {
        title: "WIP guardrail",
        body: `Are we starting more than we finish? If yes, pick 1 task to stop or defer today to reduce WIP.`,
      },
      {
        title: "Goal check",
        body: `Are we still on-track for the sprint goal? If not, what trade-off do we make today (scope swap, swarm, or escalate)?`,
      },
      {
        title: "Interruptions",
        body: `Churn avg is ${m.churnPctAvg}%. What intake rule will we follow for new requests today?`,
      },
      {
        title: "Team health",
        body: `Sick leave latest is ${m.sickLatest} person-days. Any overload signals? What can we lighten for sustainable pace?`,
      },
    ]),

    refinement: (m) => ([
      {
        title: "Make work ready",
        body: `Pick the next 3 items. For each: acceptance criteria, dependencies, and test notes. What is missing?`,
      },
      {
        title: "Size sanity",
        body: `Anything > 8 SP? Split it now. What is the smallest shippable slice?`,
      },
      {
        title: "Churn reducer",
        body: `Your churn avg is ${m.churnPctAvg}%. What changes will prevent mid-sprint scope: clearer DoR, better discovery, or smaller batches?`,
      },
      {
        title: "Dependency early warning",
        body: `Which item depends on another team/system? What is the escalation path if it blocks?`,
      },
    ]),

    review: (m) => ([
      {
        title: "Outcome story",
        body: `Tell the story: what did we deliver, what changed for users, and what evidence do we have (demo + metrics)?`,
      },
      {
        title: "Predictability signal",
        body: `Avg predictability is ${m.predAvg}%. What one improvement will increase release confidence next iteration?`,
      },
      {
        title: "Scope management",
        body: `Churn avg is ${m.churnPctAvg}%. What change-control guardrail will we agree with stakeholders?`,
      },
      {
        title: "Next sprint alignment",
        body: `Given 3-sprint avg completed ${m.vel3} SP, what is the realistic scope for next sprint?`,
      },
    ]),

    retro: (m) => ([
      {
        title: "1 thing to start / stop / continue",
        body: `Start: ____  Stop: ____  Continue: ____ (keep it brutally small).`,
      },
      {
        title: "Root cause",
        body: `Carryover last sprint was ${m.carryoverLatest} SP. What was the primary cause (overcommit, churn, dependencies, quality, or interruptions)?`,
      },
      {
        title: "Experiment",
        body: `Pick 1 experiment for next sprint: WIP limit, scope swap rule, capacity-first commitment, or dependency daily check. What is the success metric?`,
      },
      {
        title: "Team health",
        body: `Sick leave latest is ${m.sickLatest}. Any sustainability concern? What boundary do we set?`,
      },
      {
        title: "Close the loop",
        body: `Which retro action from last sprint was completed? If not done, why, and how do we make it stick?`,
      },
    ]),
  };

  function rotate(arr, by) {
    const n = arr.length;
    if (!n) return arr;
    const k = ((by % n) + n) % n;
    return arr.slice(k).concat(arr.slice(0, k));
  }

  function fmtTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  function setStatus(msg) {
    const el = $("copilot_status");
    if (el) el.textContent = msg || "—";
  }

  function setActivePill(ceremony) {
    const wrap = $("copilot_pills");
    if (!wrap) return;
    wrap.querySelectorAll('.pillBtn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-ceremony') === ceremony);
    });
  }

  function renderPrompts(st) {
    const list = $("copilot_prompts");
    const empty = $("copilot_promptsEmpty");
    if (!list) return;

    const m = metrics();
    const make = BANK[st.ceremony];
    const prompts = typeof make === 'function' ? make(m) : [];

    // "New angle" rotates; show 4 prompts.
    const shown = rotate(prompts, st.angle).slice(0, 4);

    list.innerHTML = shown.map((p, idx) => `
      <div class="promptItem">
        <div class="promptTitle">${idx + 1}. ${p.title}</div>
        <div class="promptBody">${p.body}</div>
      </div>
    `).join('');

    if (empty) empty.style.display = shown.length ? 'none' : '';

    // If no history data, give a gentle hint.
    if (!m.hasData) {
      setStatus('Tip: Add Sprint History data in Health tab to personalize prompts.');
    }
  }

  function renderSaved(st) {
    const host = $("copilot_saved");
    if (!host) return;

    const notes = loadNotes();
    const items = notes.items
      .filter(x => x && x.ceremony === st.ceremony && String(x.text || '').trim())
      .sort((a,b) => (b.ts||0) - (a.ts||0));

    if (!items.length) {
      host.innerHTML = `<div class="mutedText" style="padding:10px 2px;">No saved decisions yet.</div>`;
      return;
    }

    host.innerHTML = items.slice(0, 12).map((it) => {
      return `
        <div class="savedCard">
          <div class="savedMeta">
            <span class="chip">${LABEL[st.ceremony] || 'Ceremony'}</span>
            <span class="time">${fmtTime(it.ts)}</span>
          </div>
          <div class="savedText">${escapeHtml(it.text)}</div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  async function copySummary(st) {
    const notes = loadNotes();
    const items = notes.items
      .filter(x => x && x.ceremony === st.ceremony && String(x.text || '').trim())
      .sort((a,b) => (a.ts||0) - (b.ts||0));

    if (!items.length) {
      setStatus('Nothing to copy yet. Save one decision first.');
      return;
    }

    const lines = [];
    lines.push(`Scrummer — ${LABEL[st.ceremony] || 'Ceremony'} Summary`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');

    items.forEach((it, idx) => {
      const t = String(it.text || '').trim();
      if (!t) return;
      // Keep as bullet; preserve multi-line decisions.
      const parts = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!parts.length) return;
      lines.push(`• ${parts[0]}`);
      for (const extra of parts.slice(1)) lines.push(`  - ${extra}`);
    });

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied ✔');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setStatus('Copied ✔'); }
      catch { setStatus('Copy failed. Select text manually.'); }
      ta.remove();
    }
  }

  function wire() {
    const pills = $("copilot_pills");
    const newAngleBtn = $("copilot_newAngleBtn");
    const saveBtn = $("copilot_saveBtn");
    const resetBtn = $("copilot_resetBtn");
    const copyBtn = $("copilot_copyBtn");
    const notesEl = $("copilot_notes");

    if (!pills || !newAngleBtn || !saveBtn || !resetBtn || !copyBtn || !notesEl) return;

    let st = loadState();

    const refresh = () => {
      setActivePill(st.ceremony);
      renderPrompts(st);
      renderSaved(st);
      saveState(st);
    };

    pills.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.pillBtn');
      if (!btn) return;
      const c = btn.getAttribute('data-ceremony');
      if (!CEREMONIES.includes(c)) return;
      st = { ceremony: c, angle: 0 };
      notesEl.value = '';
      setStatus('—');
      refresh();
    });

    newAngleBtn.addEventListener('click', () => {
      st.angle = (st.angle || 0) + 1;
      refresh();
      setStatus('New angle ✨');
    });

    saveBtn.addEventListener('click', () => {
      const txt = String(notesEl.value || '').trim();
      if (!txt) {
        setStatus('Add a decision first.');
        return;
      }
      const notes = loadNotes();
      notes.items.push({ ceremony: st.ceremony, text: txt, ts: Date.now() });
      saveNotes(notes);
      notesEl.value = '';
      setStatus('Saved ✔');
      renderSaved(st);
    });

    resetBtn.addEventListener('click', () => {
      notesEl.value = '';
      setStatus('Cleared.');
    });

    copyBtn.addEventListener('click', () => copySummary(st));

    // When Sprint History changes, refresh prompts (they are metric-aware)
    window.addEventListener('scrummer:historyChanged', () => renderPrompts(st));

    refresh();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
