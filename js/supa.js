/* =========================================================
   Scrummer — Minimal SaaS (Zero-refactor mode)
   ✅ Works with current pages + localStorage
   ✅ Adds Auth + Cloud Sync
   ✅ No need to change your existing page scripts
   ---------------------------------------------------------
   What it does:
   - Uses Supabase Auth session
   - Ensures a Team exists (RPC create_team)
   - Ensures a Draft Sprint exists
   - Syncs localStorage setup -> Supabase sprints row
   - Can load cloud -> localStorage on page load
   ========================================================= */

(function () {
  const SUPABASE_URL = "https://yenljhilvtnijsmuybph.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_Xp0YXEWEmJDugzoBZHI8Qw_SGDbJktD";

  const LOCAL_SETUP_KEY = "scrummer_setup_v1";

  const TEAM_KEY = "scrummer_team_id_v1";
  const SPRINT_KEY = "scrummer_sprint_id_v1";

  window.Scrummer = window.Scrummer || {};
  window.Scrummer.cloud = window.Scrummer.cloud || {};

  function getClient() {
    if (!window.supabase) return null;
    if (!window.Scrummer.cloud._client) {
      window.Scrummer.cloud._client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
    }
    return window.Scrummer.cloud._client;
  }

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function readLocalSetup() {
    return safeParse(localStorage.getItem(LOCAL_SETUP_KEY) || "{}", {});
  }

  function writeLocalSetup(obj) {
    localStorage.setItem(LOCAL_SETUP_KEY, JSON.stringify(obj || {}));
  }

  async function getUser() {
    const supabase = getClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user || null;
  }

  async function ensureTeam() {
    const supabase = getClient();
    if (!supabase) return null;

    let teamId = localStorage.getItem(TEAM_KEY);
    if (teamId) return teamId;

    const user = await getUser();
    if (!user) return null;

    const { data, error } = await supabase.rpc("create_team", { p_name: "My First Team" });
    if (error) {
      console.error("[Scrummer.cloud] create_team failed:", error);
      return null;
    }

    teamId = data;
    localStorage.setItem(TEAM_KEY, teamId);
    return teamId;
  }

  async function ensureDraftSprint() {
    const supabase = getClient();
    if (!supabase) return null;

    let sprintId = localStorage.getItem(SPRINT_KEY);
    if (sprintId) return sprintId;

    const user = await getUser();
    if (!user) return null;

    const teamId = await ensureTeam();
    if (!teamId) return null;

    const { data, error } = await supabase
      .from("sprints")
      .insert({
        team_id: teamId,
        name: "Draft Sprint",
        created_by: user.id
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Scrummer.cloud] create draft sprint failed:", error);
      return null;
    }

    sprintId = data.id;
    localStorage.setItem(SPRINT_KEY, sprintId);
    return sprintId;
  }

  function mapSetupToSprintUpdate(setup) {
    return {
      sprint_days: setup.sprintDays ?? null,
      team_members: setup.teamMembers ?? null,
      leave_days: setup.leaveDays ?? null,
      interrupt_pct: setup.interruptPct ?? null,
      committed_sp: setup.committedSP ?? null,
      v1: setup.v1 ?? null,
      v2: setup.v2 ?? null,
      v3: setup.v3 ?? null
    };
  }

  function mapSprintToSetup(row) {
    return {
      sprintDays: row.sprint_days ?? "",
      teamMembers: row.team_members ?? "",
      leaveDays: row.leave_days ?? "",
      interruptPct: row.interrupt_pct ?? "",
      committedSP: row.committed_sp ?? "",
      v1: row.v1 ?? "",
      v2: row.v2 ?? "",
      v3: row.v3 ?? ""
    };
  }

  async function pushLocalToCloud() {
    const supabase = getClient();
    if (!supabase) return;

    const user = await getUser();
    if (!user) return; // not logged in = no cloud sync

    const sprintId = await ensureDraftSprint();
    if (!sprintId) return;

    const setup = readLocalSetup();
    const update = mapSetupToSprintUpdate(setup);

    const { error } = await supabase
      .from("sprints")
      .update(update)
      .eq("id", sprintId);

    if (error) console.error("[Scrummer.cloud] sync up failed:", error);
  }

  async function pullCloudToLocal() {
    const supabase = getClient();
    if (!supabase) return;

    const user = await getUser();
    if (!user) return;

    const sprintId = await ensureDraftSprint();
    if (!sprintId) return;

    const { data, error } = await supabase
      .from("sprints")
      .select("*")
      .eq("id", sprintId)
      .single();

    if (error) {
      console.error("[Scrummer.cloud] sync down failed:", error);
      return;
    }

    const setup = mapSprintToSetup(data);
    writeLocalSetup(setup);
  }

  // Public helpers
  window.Scrummer.cloud.signUp = async (email, password) => {
    const supabase = getClient();
    if (!supabase) return { error: { message: "Supabase not loaded" } };
    return await supabase.auth.signUp({ email, password });
  };

  window.Scrummer.cloud.signIn = async (email, password) => {
    const supabase = getClient();
    if (!supabase) return { error: { message: "Supabase not loaded" } };
    return await supabase.auth.signInWithPassword({ email, password });
  };

  window.Scrummer.cloud.signOut = async () => {
    const supabase = getClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem(TEAM_KEY);
    localStorage.removeItem(SPRINT_KEY);
  };

  window.Scrummer.cloud.syncUp = pushLocalToCloud;
  window.Scrummer.cloud.syncDown = pullCloudToLocal;

  // Auto: on load, if logged in, pull cloud -> local once, then push local -> cloud.
  async function boot() {
    await pullCloudToLocal();
    await pushLocalToCloud();

    // NOTE: "storage" only fires across tabs, not same tab.
    // Your existing pages already save localStorage, so this still helps for multi-tab.
    let t = null;
    window.addEventListener("storage", (e) => {
      if (e.key !== LOCAL_SETUP_KEY) return;
      clearTimeout(t);
      t = setTimeout(() => pushLocalToCloud(), 450);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();