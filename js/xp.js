/* =========================================================
   SCRUMMER XP SYSTEM (Gamified v1 + Cheetah Mood + XP Bump)
   FIXES:
   1) Reads setup from BOTH keys:
      - scrummer_plan_setup_v1 (new)
      - scrummer_setup_v1 (legacy)
   2) Auto-refresh on:
      - storage changes (setup saved)
      - theme changes (data-theme swap)
   ========================================================= */

(function () {

  // NEW primary setup key used by plan.js
  const SETUP_KEY_PRIMARY = "scrummer_plan_setup_v1";
  // Legacy key fallback (older builds)
  const SETUP_KEY_LEGACY  = "scrummer_setup_v1";

  const XP_KEY = "scrummer_xp_v1";
  const LEVEL_SIZE = 300;

  const LEVEL_TITLES = [
    "Rookie",
    "Sprint Scout",
    "Sprint Runner",
    "Velocity Cheetah",
    "Scrum Legend",
    "Agile Mythic"
  ];

  const el = (id) => document.getElementById(id);

  /* ---------- Animation helper ---------- */
  function bumpXpWidget() {
    const w = document.querySelector(".xpWidget");
    if (!w) return;
    w.classList.remove("xp-bump");
    void w.offsetWidth; // reflow so animation can re-trigger
    w.classList.add("xp-bump");
    setTimeout(() => w.classList.remove("xp-bump"), 450);
  }

  function todayKey() {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }

  function safeParse(str, fallback) {
    try { return JSON.parse(str); }
    catch { return fallback; }
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------- Load Setup ---------- */
  function loadSetupFromLocalStorage() {
    // prefer new key, then fallback to legacy
    const raw1 = localStorage.getItem(SETUP_KEY_PRIMARY);
    if (raw1) return safeParse(raw1, {});
    const raw2 = localStorage.getItem(SETUP_KEY_LEGACY);
    if (raw2) return safeParse(raw2, {});
    return {};
  }

  function loadSetup() {
    // If a shared API exists, use it
    const api = window.Scrummer && window.Scrummer.setup;
    if (api && typeof api.loadSetup === "function") {
      try { return api.loadSetup() || {}; } catch {}
    }
    return loadSetupFromLocalStorage();
  }

  /* ---------- Fallback Metrics ---------- */
  function computeFallback(setup) {
    const sprintDays   = num(setup.sprintDays)   ?? 0;
    const teamMembers  = num(setup.teamMembers)  ?? 0;
    const leaveDays    = num(setup.leaveDays)    ?? 0;
    const committedSP  = num(setup.committedSP)  ?? 0;

    const v1 = num(setup.v1) ?? 0;
    const v2 = num(setup.v2) ?? 0;
    const v3 = num(setup.v3) ?? 0;

    const velocities = [v1, v2, v3].filter(x => x > 0);

    const avgVel = velocities.length
      ? velocities.reduce((a,b)=>a+b,0) / velocities.length
      : 0;

    let volatility = 0;
    if (velocities.length >= 2 && avgVel > 0) {
      const variance =
        velocities.reduce((acc,x)=>acc + Math.pow(x - avgVel,2),0)
        / velocities.length;

      volatility = Math.sqrt(variance) / avgVel;
    }

    const teamDays   = Math.max(1, sprintDays * Math.max(1, teamMembers));
    const leaveRatio = Math.min(0.6, Math.max(0, leaveDays / teamDays));

    const capacitySP = avgVel * (1 - leaveRatio);
    const overcommitRatio =
      capacitySP > 0 ? committedSP / capacitySP : 0;

    let risk = 0;
    if (committedSP <= 0 || avgVel <= 0) risk += 30;
    if (overcommitRatio > 1)
      risk += Math.min(50, (overcommitRatio - 1) * 120);

    risk += Math.min(30, volatility * 80);

    risk = Math.max(0, Math.min(100, Math.round(risk)));

    const confidence =
      Math.max(10, Math.min(95, Math.round(100 - risk)));

    return {
      riskScore: risk,
      confidence,
      overcommitRatio,
      volatility
    };
  }

  function computeSignals(setup) {
    const compute = window.Scrummer && window.Scrummer.computeSignals;
    if (typeof compute === "function") {
      try {
        const s = compute(setup);
        if (s && s.riskScore !== undefined) return s;
      } catch {}
    }
    return computeFallback(setup);
  }

  /* ---------- XP State ---------- */
  function loadXpState() {
    const s = safeParse(localStorage.getItem(XP_KEY) || "{}", {});
    return {
      totalXp: Number(s.totalXp) || 0,
      streak: Number(s.streak) || 0,
      bestStreak: Number(s.bestStreak) || 0,
      lastAwardDay: s.lastAwardDay || "",
      lastMetrics: s.lastMetrics || null
    };
  }

  function saveXpState(state) {
    localStorage.setItem(XP_KEY, JSON.stringify(state));
  }

  function levelInfo(totalXp) {
    const level = Math.floor(totalXp / LEVEL_SIZE) + 1;
    const inLevel = totalXp % LEVEL_SIZE;
    const title = LEVEL_TITLES[
      Math.min(level - 1, LEVEL_TITLES.length - 1)
    ];
    return { level, inLevel, next: LEVEL_SIZE, title };
  }

  /* ---------- Stability ---------- */
  function isStable(metrics) {
    const risk = Number(metrics.riskScore);
    const conf = Number(metrics.confidence);
    const over = Number(metrics.overcommitRatio);

    if (!Number.isFinite(risk) || !Number.isFinite(conf))
      return false;

    return (
      risk < 40 &&
      conf >= 70 &&
      (!Number.isFinite(over) || over <= 1)
    );
  }

  /* ---------- Mood (class-based) ---------- */
  function mood(metrics) {
    const risk = Number(metrics.riskScore);
    const conf = Number(metrics.confidence);
    const over = Number(metrics.overcommitRatio);

    if (!Number.isFinite(risk) || !Number.isFinite(conf)) {
      return { kind: "calm", text: "🐆 Calm" };
    }

    if (risk >= 70 || (Number.isFinite(over) && over > 1.15) || conf < 55) {
      return { kind: "sprinting", text: "🐆💨 Sprinting" };
    }

    if (risk >= 40 || (Number.isFinite(over) && over > 1.0) || conf < 70) {
      return { kind: "alert", text: "🐆⚡ Alert" };
    }

    return { kind: "calm", text: "🐆 Calm" };
  }

  /* ---------- XP Award (once/day) ---------- */
  function awardXp(state, metrics) {
    const today = todayKey();
    if (state.lastAwardDay === today) return;

    let gained = 0;

    const risk = Number(metrics.riskScore);
    const conf = Number(metrics.confidence);
    const over = Number(metrics.overcommitRatio);
    const vol  = Number(metrics.volatility);

    if (Number.isFinite(conf) && conf >= 75) gained += 15;
    if (Number.isFinite(over) && over > 0 && over <= 1) gained += 25;
    if (Number.isFinite(vol) && vol < 0.30) gained += 10;

    if (
      state.lastMetrics &&
      Number.isFinite(state.lastMetrics.riskScore) &&
      Number.isFinite(risk) &&
      state.lastMetrics.riskScore - risk >= 5
    ) {
      gained += 20;
    }

    if (isStable(metrics)) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      gained += 10;
    } else {
      state.streak = 0;
    }

    state.totalXp += gained;
    state.lastAwardDay = today;

    state.lastMetrics = {
      riskScore: risk,
      confidence: conf,
      overcommitRatio: over,
      volatility: vol
    };
  }

  /* ---------- Render ---------- */
  function render(state, metrics) {
    const info = levelInfo(state.totalXp);

    if (el("xpLevel")) el("xpLevel").textContent = `Level ${info.level}`;
    if (el("xpTitle")) el("xpTitle").textContent = info.title;

    const fill = el("xpFill");
    if (fill) {
      const pct = (info.inLevel / info.next) * 100;
      const prev = fill.getAttribute("data-pct");
      const next = String(Math.round(pct));

      fill.style.width = `${pct}%`;
      fill.setAttribute("data-pct", next);

      if (prev !== null && prev !== next) bumpXpWidget();
    }

    if (el("xpText"))
      el("xpText").textContent = `${info.inLevel} / ${info.next} XP`;

    if (el("streakText")) {
      el("streakText").textContent =
        state.streak > 0
          ? `🔥 ${state.streak} sprint-stable streak`
          : `🧊 streak reset`;
    }

    const badge = el("moodBadge");
    if (badge) {
      const m = mood(metrics);

      badge.textContent = m.text;

      badge.classList.remove("mood-calm", "mood-alert", "mood-sprinting");
      if (m.kind === "calm") badge.classList.add("mood-calm");
      if (m.kind === "alert") badge.classList.add("mood-alert");
      if (m.kind === "sprinting") badge.classList.add("mood-sprinting");
    }
  }

  /* ---------- Refresh ---------- */
  function refresh() {
    if (!el("xpLevel")) return;

    const setup = loadSetup();
    const metrics = computeSignals(setup);

    const state = loadXpState();
    awardXp(state, metrics);
    saveXpState(state);

    render(state, metrics);
  }

  /* ---------- Init ---------- */
  function init() {
    refresh();

    // Refresh when setup is saved in another tab / or same app triggers storage write
    window.addEventListener("storage", (e) => {
      if (!e || !e.key) return;
      if (e.key === SETUP_KEY_PRIMARY || e.key === SETUP_KEY_LEGACY) {
        refresh();
      }
      if (e.key === "scrummer_theme" || e.key === "scrummer-theme") {
        // theme changed; re-render badge state (styles come from CSS)
        refresh();
      }
    });

    // Refresh when theme changes in the same tab (MutationObserver on html[data-theme])
    const obs = new MutationObserver(() => refresh());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  document.addEventListener("DOMContentLoaded", init);

})();
