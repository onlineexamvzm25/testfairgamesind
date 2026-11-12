/* JANA OR PATTU - independent frontend
   Uses the existing CRDG login session and the JOP RPCs.
   No direct table access is performed from the browser. */

const SUPABASE_URL = "https://dbfycihbcosuxxkrmbhl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX";
const SESSION_KEY = "crdgn_session_token";

// The homepage selects the game through ?game_type=JANA or ?game_type=SETS.
const requestedGameType = new URLSearchParams(location.search).get("game_type");
const GAME_TYPE = String(requestedGameType || "JANA").trim().toUpperCase() === "SETS"
  ? "SETS"
  : "JANA";

const GAME_NAMES = {
  JANA: "JANA OR PATTU",
  SETS: "SETS"
};

const GAME_NAME = GAME_NAMES[GAME_TYPE];

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let sessionToken = localStorage.getItem(SESSION_KEY);
let profile = null;
let selectedPointValue = 10;
let activeTableCode = null;
let activeTableState = null;
let refreshTimer = null;
let presenceTimer = null;
let busy = false;

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const el = $("globalMessage");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2600);
}
function setBusy(value, message = "Please wait…") {
  busy = value;
  $("busyText").textContent = message;
  $("busyOverlay").classList.toggle("hidden", !value);
  document.querySelectorAll("button").forEach((b) => {
    if (b.id !== "refreshButton" && b.id !== "copyCodeButton") b.disabled = value;
  });
}
function showTableMessage(message, isError = true) {
  const el = $("tableMessage");
  el.textContent = message || "";
  el.style.color = isError ? "var(--red)" : "var(--green)";
}
function firstRow(data) {
  return Array.isArray(data) ? (data[0] || null) : data;
}
function rpcError(error, fallback) {
  console.error(fallback, error);
  return error?.message || fallback;
}

async function callRpc(name, args) {
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw new Error(rpcError(error, `Unable to call ${name}.`));
  return data;
}

function applyGameBranding() {
  document.title = GAME_NAME;
  $("brandGameName").innerHTML = GAME_TYPE === "JANA"
    ? 'JANA <b>OR</b> PATTU'
    : 'SETS';
  $("heroGameName").innerHTML = GAME_TYPE === "JANA"
    ? 'JANA <span>OR</span> PATTU'
    : 'SETS';
  $("heroDescription").textContent =
    `Create a private ${GAME_NAME} table and invite your friends using its table code.`;
  $("createDescription").textContent =
    `Choose the point value and create a private ${GAME_NAME} friends table.`;
  $("createButton").textContent = `CREATE ${GAME_TYPE} TABLE`;
  $("tableEyebrow").textContent = `YOUR PRIVATE ${GAME_NAME} TABLE`;
  $("waitingRoomTitle").textContent = `${GAME_NAME} · Waiting Room`;
}

async function initialize() {
  applyGameBranding();
  if (!sessionToken) {
    location.replace("index.html");
    return;
  }
  try {
    const validationData = await callRpc("crdgn_validate_session", {
      p_session_token: sessionToken
    });
    const validation = firstRow(validationData);
    if (!validation || validation.success !== true) {
      localStorage.removeItem(SESSION_KEY);
      location.replace("index.html");
      return;
    }

    const profileData = await callRpc("crdgn_get_profile", {
      p_session_token: sessionToken
    });
    profile = firstRow(profileData);
    if (!profile || !profile.user_id) {
      localStorage.removeItem(SESSION_KEY);
      location.replace("index.html");
      return;
    }
    $("userName").textContent = profile.name || "PLAYER";
    bindEvents();

    const params = new URLSearchParams(location.search);
    const code = params.get("table");
    if (code) await enterTable(code);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to load your account.");
    if (!profile) window.setTimeout(() => location.replace("index.html"), 1800);
  }
}

function bindEvents() {
  document.querySelectorAll(".point-option").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPointValue = Number(button.dataset.points);
      document.querySelectorAll(".point-option").forEach((b) => b.classList.toggle("selected", b === button));
    });
  });
  $("createButton").addEventListener("click", createTable);
  $("joinButton").addEventListener("click", () => joinTable($("joinCode").value));
  $("joinCode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinTable($("joinCode").value);
  });
  $("refreshButton").addEventListener("click", refreshTable);
  $("copyCodeButton").addEventListener("click", copyTableCode);
  $("startGameButton").addEventListener("click", startGame);
  $("leaveButton").addEventListener("click", leaveTable);
}

async function createTable() {
  if (busy) return;
  setBusy(true, "Creating your private table…");
  try {
    const data = await callRpc("jop_create_table", {
      p_session_token: sessionToken,
      p_point_value: selectedPointValue,
      p_game_type: GAME_TYPE
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || "Could not create the table.");
    showToast("Table created successfully.");
    await enterTable(result.out_table_code);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function joinTable(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    showToast("Enter the table code first.");
    $("joinCode").focus();
    return;
  }
  if (busy) return;
  setBusy(true, "Joining your friend's table…");
  try {
    const data = await callRpc("jop_join_table", {
      p_session_token: sessionToken,
      p_table_code: normalized,
      p_game_type: GAME_TYPE
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || "Could not join the table.");
    await enterTable(normalized);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function enterTable(code) {
  activeTableCode = String(code).trim().toUpperCase();
  $("homeView").classList.add("hidden");
  $("tableView").classList.remove("hidden");
  history.replaceState(
    {},
    "",
    `${location.pathname}?game_type=${GAME_TYPE}&table=${encodeURIComponent(activeTableCode)}`
  );
  showTableMessage("");
  await refreshTable();
  startBackgroundUpdates();
}

function startBackgroundUpdates() {
  stopBackgroundUpdates();
  refreshTimer = window.setInterval(() => refreshTable(true), 5000);
  presenceTimer = window.setInterval(() => updatePresence(), 15000);
}
function stopBackgroundUpdates() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (presenceTimer) window.clearInterval(presenceTimer);
  refreshTimer = null;
  presenceTimer = null;
}

async function refreshTable(silent = false) {
  if (!activeTableCode || busy) return;
  try {
    const data = await callRpc("jop_get_table_state", {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    });
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const first = rows[0];
    if (!first || first.success === false) {
      throw new Error(first?.message || "Unable to load this table.");
    }
    const actualGameType = String(first.game_type || "").trim().toUpperCase();
    if (actualGameType !== GAME_TYPE) {
      throw new Error(
        `This is a ${actualGameType || "different"} table. Please open the ${actualGameType || "correct"} lobby.`
      );
    }
    activeTableState = first;
    renderTable(rows, first);
    showTableMessage("");
  } catch (error) {
    if (!silent) showTableMessage(error.message);
    console.error("Table refresh failed:", error);
  }
}

function renderTable(rows, state) {
  $("tableEyebrow").textContent = `YOUR PRIVATE ${GAME_NAME} TABLE`;
  $("waitingRoomTitle").textContent = `${GAME_NAME} · Waiting Room`;
  $("tableCode").textContent = state.out_table_code || activeTableCode;
  $("tablePoints").textContent = state.point_value ?? "—";
  $("playerCount").textContent = `${state.player_count ?? rows.length} / 6`;
  $("gameNumber").textContent = Number(state.current_game_no) > 0 ? `#${state.current_game_no}` : "Not started";

  const players = rows.filter((r) => r.player_user_id && r.seat_no != null);
  const bySeat = new Map(players.map((p) => [Number(p.seat_no), p]));
  const list = $("playersList");
  list.innerHTML = "";
  for (let seat = 1; seat <= 6; seat++) {
    const player = bySeat.get(seat);
    if (!player) {
      const empty = document.createElement("div");
      empty.className = "empty-seat";
      empty.innerHTML = `<span class="seat-number">${seat}</span><span>Waiting for a player…</span>`;
      list.appendChild(empty);
      continue;
    }
    const item = document.createElement("div");
    item.className = "player-seat";
    const isMe = player.player_user_id === profile.user_id;
    const status = player.is_eliminated ? "ELIMINATED" : (player.is_host ? "HOST" : "PLAYER");
    const name = escapeHtml(player.player_name || "Player");
    item.innerHTML = `
      <span class="seat-number">${seat}</span>
      <div class="player-info">
        <div class="player-name">${name}${isMe ? " (You)" : ""}</div>
        <div class="player-meta">${player.is_eliminated ? "Permanently eliminated" : "Joined table"}</div>
      </div>
      ${player.is_host && !player.is_eliminated ? '<span class="host-tag">HOST</span>' : ""}
      ${player.is_eliminated ? '<span class="host-tag" style="color:#ff9c9c;border-color:#75404e">OUT</span>' : ""}
    `;
    list.appendChild(item);
  }

  const me = players.find((p) => p.player_user_id === profile.user_id);
  const isEligible = !!me && !me.is_eliminated;
  const firstGame = Number(state.current_game_no) === 0;
  const isJana = GAME_TYPE === "JANA";
  const canStartFirst = firstGame && !!me?.is_host;
  const canAttemptNext = Number(state.current_game_no) > 0 && isEligible;
  const startButton = $("startGameButton");

  // JANA has one persistent game session per table. Once started,
  // eligible members reopen the same game instead of starting another one.
  const canOpenJana = isJana && !firstGame && isEligible;
  const canShowStart = isJana
    ? (canStartFirst || canOpenJana)
    : (canStartFirst || canAttemptNext);

  startButton.classList.toggle("hidden", !canShowStart);
  startButton.textContent = isJana
    ? (firstGame ? "START JANA GAME" : "OPEN JANA GAME")
    : (firstGame ? "START FIRST GAME" : "START NEXT GAME");
  startButton.disabled = !isEligible || !canShowStart;
  if (state.table_status === "CLOSED") {
    startButton.classList.add("hidden");
    showTableMessage("This table is closed.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function updatePresence() {
  if (!activeTableCode || busy) return;
  try {
    await callRpc("jop_update_player_presence", {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    });
  } catch (error) {
    console.warn("Presence update failed:", error.message);
  }
}

async function startGame() {
  if (!activeTableCode || busy) return;

  const isJana = GAME_TYPE === "JANA";
  const currentGameNo = Number(activeTableState?.current_game_no || 0);

  // A JANA table has one active session. After its first start,
  // the button simply opens that same session for reconnecting players.
  if (isJana && currentGameNo > 0) {
    location.href = `jana-game.html?table=${encodeURIComponent(activeTableCode)}`;
    return;
  }

  const confirmMessage = isJana
    ? "Start the JANA game? The server will check every player's wallet balance before starting."
    : "Start a new game? The server will check every player's wallet balance before starting.";

  if (!confirm(confirmMessage)) return;

  setBusy(true, isJana
    ? "Checking player eligibility and starting JANA…"
    : "Checking player eligibility and starting game…");

  try {
    if (isJana) {
      const data = await callRpc("jop_jana_start_session", {
        p_session_token: sessionToken,
        p_table_code: activeTableCode
      });
      const result = firstRow(data);
      if (!result?.success) {
        throw new Error(result?.message || "Unable to start the JANA game.");
      }

      showToast(result.message || "JANA game started.");
      stopBackgroundUpdates();
      location.href = `jana-game.html?table=${encodeURIComponent(activeTableCode)}`;
      return;
    }

    // Preserve the existing SETS start flow.
    const data = await callRpc("jop_start_new_game", {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || "Unable to start the game.");
    showToast(result.message || "Game started.");
    setBusy(false);
    await refreshTable();
  } catch (error) {
    showTableMessage(error.message);
  } finally {
    setBusy(false);
  }
}

async function leaveTable() {
  if (!activeTableCode || busy) return;
  if (!confirm("Leave this table permanently? You cannot rejoin this same table.")) return;
  setBusy(true, "Leaving table…");
  try {
    const data = await callRpc("jop_leave_table", {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || "Unable to leave the table.");
    stopBackgroundUpdates();
    activeTableCode = null;
    activeTableState = null;
    history.replaceState({}, "", `${location.pathname}?game_type=${GAME_TYPE}`);
    $("tableView").classList.add("hidden");
    $("homeView").classList.remove("hidden");
    $("joinCode").value = "";
    showToast(result.message || "You have left the table.");
  } catch (error) {
    showTableMessage(error.message);
  } finally {
    setBusy(false);
  }
}

async function copyTableCode() {
  const code = $("tableCode").textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast("Table code copied.");
  } catch {
    showToast(`Table code: ${code}`);
  }
}

window.addEventListener("beforeunload", stopBackgroundUpdates);
initialize();
