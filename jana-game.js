/* JANA OR PATTU - gameplay client
 *
 * Required server RPC contract (the game-state RPC is the next backend step):
 *   jop_jana_get_game_state({p_session_token, p_table_code})
 *     -> {success, session:{session_no}, round:{round_id,round_no,round_status,
 *        current_turn_user_id,winner_user_id,winner_reason,pot_amount,stock_count,
 *        turn_deadline_at,observation_ends_at}, me:{user_id,name,seat_no,
 *        player_status,current_score,card_count,cards:[{card_code,is_public}]},
 *        players:[{user_id,name,seat_no,player_status,current_score,card_count,
 *        is_current_turn,cards:[{card_code,is_public}]}], actions:[{action_type,
 *        user_name,card_code,created_at,action_no}]}
 *
 * Worker and player-action RPCs already created in Supabase:
 *   jop_jana_worker({p_session_token,p_table_code})
 *   jop_jana_player_action({p_session_token,p_table_code,p_action})
 *
 * The server is authoritative. This page only displays state/countdowns and
 * sends player intentions; it never changes scores, cards, or deadlines locally.
 */
"use strict";

const SUPABASE_URL = "https://dbfycihbcosuxxkrmbhl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX";
const SESSION_KEY = "crdgn_session_token";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const params = new URLSearchParams(location.search);
const tableCode = String(params.get("table") || "").trim().toUpperCase();
const sessionToken = localStorage.getItem(SESSION_KEY);
const $ = (id) => document.getElementById(id);

let myUserId = null;
let latestState = null;
let pollTimer = null;
let clockTimer = null;
let pollBusy = false;
let actionBusy = false;
let toastTimer = null;
let lastActionNo = null;
let serverClockOffsetMs = 0;
let lastTurnUserId = null;
let transitionUntilMs = 0;
let transitionUserId = null;

function firstRow(data) { return Array.isArray(data) ? (data[0] || null) : data; }
function setConnection(state, label) {
  const el = $("connectionStatus");
  el.className = `connection ${state}`;
  el.innerHTML = `<i></i> ${escapeHtml(label)}`;
}
function toast(message) {
  $("toast").textContent = message || "";
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}
function showBusy(show, message = "Loading game…") {
  $("busyText").textContent = message;
  $("busyOverlay").classList.toggle("hidden", !show);
}
async function rpc(name, args) {
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw new Error(error.message || `Unable to call ${name}.`);
  return data;
}
function safeText(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function cardParts(code) {
  const value = String(code || "");
  const suitCode = value.slice(-1).toUpperCase();
  const rank = value.slice(0, -1).toUpperCase();
  const suits = { S: "♠", H: "♥", D: "♦", C: "♣" };
  return { rank, suit: suits[suitCode] || "?", red: suitCode === "H" || suitCode === "D" };
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function isObservation(state = latestState) {
  return String(state?.round?.round_status || "").toUpperCase() === "OBSERVATION";
}
function visibleCards(player, isMe, revealAll = false) {
  const cards = Array.isArray(player.cards) ? player.cards : [];
  if (isMe || revealAll) return cards;
  return cards.filter(c => c.is_public === true);
}
function serverNow() { return Date.now() + serverClockOffsetMs; }
function updateServerClock(state) {
  const stamp = state?.server_time || state?.round?.server_time;
  if (stamp) {
    const parsed = new Date(stamp).getTime();
    if (Number.isFinite(parsed)) serverClockOffsetMs = parsed - Date.now();
  }
}
function renderCard(card) {
  const p = cardParts(card.card_code);
  return `<div class="playing-card ${p.red ? "red" : ""}">
    <span class="rank">${escapeHtml(p.rank)}</span>
    <span class="center-suit">${p.suit}</span>
    <span class="suit">${p.suit}</span>
  </div>`;
}
function renderSeatCards(player, isMe, revealAll = false) {
  const cards = visibleCards(player, isMe, revealAll);
  const hiddenCount = (isMe || revealAll) ? 0 : Math.max(0, Number(player.card_count || 0) - cards.length);
  const backs = Array.from({ length: hiddenCount }, () => '<span class="seat-card back" aria-label="Hidden card"></span>').join("");
  const faces = cards.map(c => {
    const p = cardParts(c.card_code);
    return `<span class="seat-card ${p.red ? "red" : ""}" aria-label="${escapeHtml(p.rank)} ${p.suit}"><span class="rank">${escapeHtml(p.rank)}</span><span class="suit">${p.suit}</span></span>`;
  }).join("");
  return backs + faces;
}
function statusLabel(status) {
  return ({ PLAYING: "PLAYING", PATLU: "PATLU", BUSTED: "BUSTED", WON: "WINNER" })[status] || status || "WAITING";
}
function relativeSeatPosition(player, mySeat) {
  if (player.user_id === myUserId) return "me";
  const offset = (Number(player.seat_no) - Number(mySeat) + 6) % 6;
  return `pos-${offset}`;
}
function renderPlayers(state) {
  const revealAll = isObservation(state);
  const players = Array.isArray(state.players) ? state.players : [];
  const me = state.me || {};
  const mySeat = Number(me.seat_no || 1);
  const ordered = [...players].sort((a, b) => {
    const da = (Number(a.seat_no) - mySeat + 6) % 6;
    const db = (Number(b.seat_no) - mySeat + 6) % 6;
    return da - db;
  });

  $("playerStatusList").innerHTML = ordered.map(p => {
    const status = String(p.player_status || "PLAYING").toUpperCase();
    const current = p.user_id === state.round?.current_turn_user_id;
    const displayStatus = status === "PLAYING" ? (current ? "TURN" : "WAITING") : status;
    const classes = ["status-row", current ? "current" : "", status.toLowerCase()].filter(Boolean).join(" ");
    return `<div class="${classes}"><span>${escapeHtml(p.name || "Player")}${p.user_id === myUserId ? " (YOU)" : ""}</span><b>${escapeHtml(displayStatus)}</b></div>`;
  }).join("") || '<div class="status-row"><span>Waiting for players</span><b>—</b></div>';

  $("playersGrid").innerHTML = ordered.map(p => {
    const isMe = p.user_id === myUserId;
    const current = p.user_id === state.round?.current_turn_user_id;
    const status = String(p.player_status || "PLAYING").toUpperCase();
    const classes = ["player-seat", relativeSeatPosition(p, mySeat), current ? "current" : "",
      isMe ? "me" : "", status === "PATLU" ? "patlu" : "", status === "BUSTED" ? "busted" : "",
      status === "WON" ? "winner" : ""].filter(Boolean).join(" ");
    const displayStatus = status === "PLAYING" ? (current ? "TURN" : "WAITING") : status;
    return `<article class="${classes}" data-player-id="${escapeHtml(p.user_id)}">
      <div class="seat-head"><span class="player-name">${escapeHtml(p.name || (isMe ? "You" : "Player"))}${isMe ? " (YOU)" : ""}</span><span class="seat-no">S${escapeHtml(p.seat_no ?? "—")}</span></div>
      <span class="seat-state ${status.toLowerCase()}">${escapeHtml(displayStatus)}</span>
      <div class="seat-cards">${renderSeatCards(p, isMe, revealAll)}</div>
    </article>`;
  }).join("") || '<div class="seat-loading">Waiting for player details…</div>';
}
function renderObservation(state) {
  const round = state.round || {};
  const players = Array.isArray(state.players) ? state.players : [];
  const winner = players.find(p => p.user_id === round.winner_user_id);
  $("observationWinner").textContent = winner
    ? `🏆 ${winner.name || "Player"} WINS${round.winner_reason ? ` · ${String(round.winner_reason).replaceAll("_", " ")}` : ""}`
    : "ROUND COMPLETE · NO WINNER";
  $("observationPlayers").innerHTML = players
    .slice().sort((a,b) => Number(a.seat_no || 0) - Number(b.seat_no || 0))
    .map(player => {
      const status = String(player.player_status || "PLAYING").toUpperCase();
      const cards = Array.isArray(player.cards) ? player.cards : [];
      const cardHtml = cards.map(card => {
        const p = cardParts(card.card_code);
        return `<span class="observation-card ${p.red ? "red" : ""}"><span class="rank">${escapeHtml(p.rank)}</span><span class="suit">${p.suit}</span></span>`;
      }).join("");
      const isWinner = player.user_id === round.winner_user_id || status === "WON";
      return `<article class="observation-player ${isWinner ? "is-winner" : ""}">
        <span class="observation-player-name">${escapeHtml(player.name || "Player")}${player.user_id === myUserId ? " (YOU)" : ""}</span>
        <span class="observation-player-score">${player.current_score == null ? "—" : escapeHtml(player.current_score)}</span>
        <span class="observation-player-status ${status.toLowerCase()}">${escapeHtml(statusLabel(status))}</span>
        <div class="observation-cards">${cardHtml || '<span class="observation-no-cards">No cards</span>'}</div>
      </article>`;
    }).join("");
  $("observationOverlay").classList.remove("hidden");
  $("exitTableButton").classList.remove("hidden");
}

function updateTurnTransition(state) {
  const round = state.round || {};
  const currentId = round.current_turn_user_id || null;
  const nextActionAt = round.next_action_at ? new Date(round.next_action_at).getTime() : 0;
  const status = String(round.round_status || "").toUpperCase();
  if (status !== "PLAYING") {
    transitionUntilMs = 0;
    transitionUserId = null;
    $("turnTransitionOverlay").classList.add("hidden");
    lastTurnUserId = currentId;
    return;
  }
  if (lastTurnUserId !== null && currentId && currentId !== lastTurnUserId && nextActionAt > serverNow()) {
    transitionUntilMs = nextActionAt;
    transitionUserId = currentId;
  }
  lastTurnUserId = currentId;
  const active = transitionUntilMs > serverNow() && transitionUserId === currentId;
  $("turnTransitionOverlay").classList.toggle("hidden", !active);
  if (active) {
    const player = (state.players || []).find(p => p.user_id === currentId);
    $("transitionPlayerName").textContent = player?.name || "NEXT PLAYER";
    const seconds = Math.max(0, Math.ceil((transitionUntilMs - serverNow()) / 1000));
    $("transitionCountdown").textContent = seconds;
  } else if (transitionUntilMs && transitionUntilMs <= serverNow()) {
    transitionUntilMs = 0;
    transitionUserId = null;
  }
}
function updateObservationCountdown() {
  const round = latestState?.round || {};
  const observing = isObservation(latestState);
  $("observationOverlay").classList.toggle("hidden", !observing);
  $("exitTableButton").classList.toggle("hidden", !observing);
  if (!observing) return;
  const end = round.observation_ends_at ? new Date(round.observation_ends_at).getTime() : 0;
  const seconds = end ? Math.max(0, Math.ceil((end - serverNow()) / 1000)) : 0;
  $("observationCountdown").textContent = seconds;
}

function renderMyHand(state) {
  // The player's large cards and score are rendered inside their bottom seat.
  // This function intentionally does not create a second hand panel.
}
function addMyScoreToSeat(state) {
  const me = state.me || {};
  const seat = document.querySelector('.player-seat.me');
  if (!seat) return;
  let score = seat.querySelector('.seat-score-large');
  if (!score) {
    score = document.createElement('div');
    score.className = 'seat-score-large';
    seat.appendChild(score);
  }
  score.textContent = `SCORE ${me.current_score == null ? '—' : me.current_score}`;
}
function playDrawSound() {
  const audio = $('drawSound');
  if (!audio) return;
  try { audio.currentTime = 0; const promise = audio.play(); if (promise?.catch) promise.catch(() => {}); } catch (_) {}
}
function animateDraw(action) {
  const target = document.querySelector(`.player-seat[data-player-id="${CSS.escape(action.user_id || '')}"]`);
  const deck = $('stockStack');
  if (!target || !deck) return;
  target.classList.remove('draw-flash');
  void target.offsetWidth;
  target.classList.add('draw-flash');
  const from = deck.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const p = cardParts(action.card_code || '');
  const card = document.createElement('div');
  card.className = `flying-card ${p.red ? 'red' : ''}`;
  card.innerHTML = `<span class="rank">${escapeHtml(p.rank || '★')}</span><span class="suit">${p.suit || '♠'}</span>`;
  card.style.left = `${from.left + from.width/2 - 21}px`;
  card.style.top = `${from.top + from.height/2 - 29}px`;
  $('flyingCardLayer').appendChild(card);
  requestAnimationFrame(() => {
    const x = to.left + to.width/2 - (from.left + from.width/2);
    const y = to.top + to.height/2 - (from.top + from.height/2);
    card.style.transform = `translate(${x}px,${y}px) scale(.72) rotate(12deg)`;
    card.style.opacity = '.15';
  });
  setTimeout(() => card.remove(), 700);
  playDrawSound();
}
function processNewDrawActions(state) {
  const actions = Array.isArray(state.actions) ? state.actions : [];
  if (lastActionNo === null) {
    lastActionNo = Math.max(0, ...actions.map(a => Number(a.action_no || 0)));
    return;
  }
  const fresh = actions.filter(a => Number(a.action_no || 0) > lastActionNo)
    .sort((a,b) => Number(a.action_no) - Number(b.action_no));
  if (fresh.length) lastActionNo = Math.max(lastActionNo, ...fresh.map(a => Number(a.action_no || 0)));
  fresh.filter(a => a.action_type === 'CARD_DRAWN').forEach(animateDraw);
}
function renderActivity(state) {
  const actions = Array.isArray(state.actions) ? state.actions.slice(-12).reverse() : [];
  if (!actions.length) {
    $("activityList").innerHTML = '<div class="activity-empty">No activity yet.</div>';
    return;
  }
  $("activityList").innerHTML = actions.map(a => {
    const who = a.user_name || "Table";
    const label = String(a.action_type || "").replaceAll("_", " ");
    const detail = a.card_code ? ` · ${a.card_code}` : "";
    const time = a.created_at ? new Date(a.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "";
    return `<div class="activity-item"><span>${escapeHtml(who)} · ${escapeHtml(label)}${escapeHtml(detail)}</span><time>${escapeHtml(time)}</time></div>`;
  }).join("");
}
function phaseMessage(state) {
  const round = state.round || {};
  const me = state.me || {};
  const status = String(round.round_status || "").toUpperCase();
  const playerStatus = String(me.player_status || "").toUpperCase();
  const current = round.current_turn_user_id === myUserId;
  if (status === "OBSERVATION") return { phase: "ROUND COMPLETE", message: round.winner_user_id ? "Round finished · winner declared" : "Round finished · no winner" };
  if (status === "COMPLETED") return { phase: "SETTLED", message: "Round settled. Preparing the next round…" };
  if (status === "CANCELLED") return { phase: "CANCELLED", message: "This round was cancelled." };
  if (playerStatus === "WON") return { phase: "WINNER", message: "You won this round!" };
  if (playerStatus === "BUSTED") return { phase: "BUSTED", message: "You are busted. Waiting for the round to finish." };
  if (playerStatus === "PATLU") return { phase: "PATLU", message: "You have completed your turn. Waiting for other players." };
  if (current) return { phase: "YOUR TURN", message: Number(me.current_score) >= 18 ? "Choose HIT or PATLU." : "Drawing cards automatically…" };
  return { phase: "WAITING", message: "Waiting for the current player…" };
}
function renderState(state) {
  updateServerClock(state);
  latestState = state;
  const round = state.round || {};
  const me = state.me || {};
  $("tableCode").textContent = tableCode || "—";
  $("sessionNumber").textContent = safeText(state.session?.session_no);
  $("roundNumber").textContent = safeText(round.round_no);
  $("potAmount").textContent = safeText(round.pot_amount, "0");
  const stockCountLabel = $("stockCount");
  if (stockCountLabel) stockCountLabel.textContent = `STOCK · ${safeText(round.stock_count, "0")}`;
  $("stockCountLarge").textContent = safeText(round.stock_count, "0");
  const centre = $("centreAnnouncement");
  if (String(round.round_status).toUpperCase() === "OBSERVATION" || String(round.round_status).toUpperCase() === "COMPLETED") {
    const winner = (state.players || []).find(p => p.user_id === round.winner_user_id);
    centre.textContent = winner ? `🏆 ${winner.name} WINS` : "ROUND COMPLETE · NO WINNER";
    centre.classList.remove("hidden");
    centre.classList.toggle("winner-announcement", !!winner);
  } else {
    centre.classList.add("hidden");
    centre.classList.remove("winner-announcement");
  }
  const phase = phaseMessage(state);
  $("phaseLabel").textContent = phase.phase;
  $("statusMessage").textContent = phase.message;
  renderPlayers(state);
  if (String(round.round_status).toUpperCase() === "OBSERVATION") renderObservation(state);
  else $("observationOverlay").classList.add("hidden");
  updateTurnTransition(state);
  renderMyHand(state);
  addMyScoreToSeat(state);
  processNewDrawActions(state);
  renderActivity(state);
  updateControls(state);
  updateClock();
}
function updateControls(state) {
  const round = state.round || {};
  const me = state.me || {};
  const isMyTurn = round.current_turn_user_id === myUserId;
  const canAct = String(round.round_status).toUpperCase() === "PLAYING" &&
    isMyTurn && String(me.player_status).toUpperCase() === "PLAYING" &&
    Number(me.current_score) >= 18 && Number(me.current_score) <= 20 &&
    !(transitionUntilMs > serverNow() && transitionUserId === round.current_turn_user_id) &&
    !actionBusy;
  $("hitButton").disabled = !canAct;
  $("patluButton").disabled = !canAct;
  if (canAct) $("turnHint").textContent = "It's your turn. Choose your next action.";
  else if (isMyTurn && Number(me.current_score) < 18) $("turnHint").textContent = "Your score is below 18. The server is drawing automatically.";
  else {
    const currentPlayer = (state.players || []).find(p => p.user_id === round.current_turn_user_id);
    $("turnHint").textContent = currentPlayer ? `Current turn: ${currentPlayer.name}` : "Waiting for the next turn…";
  }
}
function updateClock() {
  const round = latestState?.round || {};
  const me = latestState?.me || {};
  const isMyTurn = round.current_turn_user_id === myUserId;
  const deadline = round.turn_deadline_at ? new Date(round.turn_deadline_at).getTime() : 0;
  const inTransition = transitionUntilMs > serverNow() && transitionUserId === round.current_turn_user_id;
  const shouldShow = isMyTurn && !inTransition && deadline > 0 &&
    String(round.round_status).toUpperCase() === "PLAYING" &&
    Number(me.current_score) >= 18 && Number(me.current_score) <= 20;
  $("timerBox").classList.toggle("hidden", !shouldShow);
  updateObservationCountdown();
  if (latestState) updateTurnTransition(latestState);
  if (!shouldShow) return;
  const seconds = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  $("timerValue").textContent = seconds;
  const currentPlayer = (latestState?.players || []).find(p => p.user_id === round.current_turn_user_id);
  $("timerLabel").textContent = currentPlayer?.name ? `${currentPlayer.name} TURN` : "PLAYER TURN";
  $("timerBox").classList.toggle("urgent", seconds <= 3);
}
async function refreshGameState() {
  if (pollBusy || !tableCode || !sessionToken) return;
  pollBusy = true;
  try {
    const data = await rpc("jop_jana_get_game_state", {
      p_session_token: sessionToken,
      p_table_code: tableCode
    });
    const state = firstRow(data);
    if (!state?.success) throw new Error(state?.message || "Unable to load game state.");
    if (state.me?.user_id) myUserId = state.me.user_id;
    renderState(state);
    setConnection("online", "Connected");
  } catch (error) {
    console.error("JANA game state:", error);
    setConnection("offline", "Reconnecting");
    $("statusMessage").textContent = error.message || "Connection interrupted.";
  } finally {
    pollBusy = false;
  }
}
async function runWorker() {
  if (!tableCode || !sessionToken || document.hidden) return;
  try {
    await rpc("jop_jana_worker", {
      p_session_token: sessionToken,
      p_table_code: tableCode
    });
  } catch (error) {
    // A temporary worker failure should not stop state polling.
    console.warn("JANA worker:", error.message || error);
  }
}
async function pollCycle() {
  if (document.hidden) return;
  await runWorker();
  await refreshGameState();
}
async function sendAction(action) {
  if (actionBusy || !latestState) return;
  actionBusy = true;
  updateControls(latestState);
  $("turnHint").textContent = action === "HIT" ? "Drawing your card…" : "Ending your turn…";
  try {
    const data = await rpc("jop_jana_player_action", {
      p_session_token: sessionToken,
      p_table_code: tableCode,
      p_action: action
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || `Unable to ${action}.`);
    toast(action === "HIT" ? "HIT accepted." : "PATLU accepted.");
    await refreshGameState();
  } catch (error) {
    toast(error.message || "Action could not be completed.");
    await refreshGameState();
  } finally {
    actionBusy = false;
    if (latestState) updateControls(latestState);
  }
}
async function exitJanaTable() {
  if (actionBusy || !isObservation(latestState)) return;
  const confirmed = confirm("Exit this JANA table permanently?\n\nYour current round will be settled, and you will not participate in future rounds.");
  if (!confirmed) return;
  const button = $("exitTableButton");
  actionBusy = true;
  button.disabled = true;
  button.textContent = "EXITING…";
  try {
    const data = await rpc("jop_jana_exit_table", {
      p_session_token: sessionToken,
      p_table_code: tableCode
    });
    const result = firstRow(data);
    if (!result?.success) throw new Error(result?.message || "Unable to exit the JANA table.");
    clearInterval(pollTimer);
    clearInterval(clockTimer);
    toast(result.message || "You left the JANA table.");
    setTimeout(() => {
      location.href = result.table_closed
        ? "jana.html?game_type=JANA"
        : `jana.html?game_type=JANA&table=${encodeURIComponent(tableCode)}`;
    }, 700);
  } catch (error) {
    toast(error.message || "Unable to exit the table.");
    button.disabled = false;
    button.textContent = "EXIT TABLE";
    actionBusy = false;
  }
}

function bindEvents() {
  $("refreshButton").addEventListener("click", pollCycle);
  $("exitTableButton").addEventListener("click", exitJanaTable);
  $("hitButton").addEventListener("click", () => sendAction("HIT"));
  $("patluButton").addEventListener("click", () => sendAction("PATLU"));
  $("backToTableButton").addEventListener("click", () => {
    location.href = `jana.html?game_type=JANA&table=${encodeURIComponent(tableCode)}`;
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pollCycle();
  });
  window.addEventListener("beforeunload", () => {
    clearInterval(pollTimer);
    clearInterval(clockTimer);
  });
}
async function initialize() {
  bindEvents();
  if (!sessionToken) {
    location.replace("index.html");
    return;
  }
  if (!tableCode) {
    toast("Missing table code. Open this game from your JANA table.");
    $("statusMessage").textContent = "A table code is required.";
    return;
  }
  showBusy(true, "Connecting to JANA table…");
  try {
    const validationData = await rpc("crdgn_validate_session", { p_session_token: sessionToken });
    const validation = firstRow(validationData);
    if (!validation || validation.success !== true) {
      localStorage.removeItem(SESSION_KEY);
      location.replace("index.html");
      return;
    }
    await refreshGameState();
    pollTimer = setInterval(pollCycle, 1000);
    clockTimer = setInterval(updateClock, 250);
  } catch (error) {
    console.error(error);
    toast(error.message || "Unable to connect to the game.");
    $("statusMessage").textContent = error.message || "Unable to connect.";
  } finally {
    showBusy(false);
  }
}
document.addEventListener("DOMContentLoaded", initialize);
