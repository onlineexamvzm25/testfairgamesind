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
let lastActionNo = 0;

function firstRow(data) { return Array.isArray(data) ? (data[0] || null) : data; }
function setConnection(state, label) {
  const el = $("connectionStatus");
  el.className = `connection ${state}`;
  el.lastChild && (el.lastChild.textContent = label);
  if (!el.lastChild || el.lastChild.nodeType !== Node.TEXT_NODE) el.textContent = label;
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
function visibleCards(player, isMe) {
  const cards = Array.isArray(player.cards) ? player.cards : [];
  if (isMe) return cards;
  return cards.filter(c => c.is_public === true);
}
function renderCard(card) {
  const p = cardParts(card.card_code);
  return `<div class="playing-card ${p.red ? "red" : ""}">
    <span class="rank">${escapeHtml(p.rank)}</span>
    <span class="center-suit">${p.suit}</span>
    <span class="suit">${p.suit}</span>
  </div>`;
}
function renderMiniCards(player, isMe) {
  const cards = visibleCards(player, isMe);
  const html = cards.slice(0, 5).map(c => {
    const p = cardParts(c.card_code);
    return `<span class="mini-card ${p.red ? "red" : ""}">${escapeHtml(p.rank)}${p.suit}</span>`;
  }).join("");
  const hiddenCount = Math.max(0, Number(player.card_count || 0) - cards.length);
  return html + (hiddenCount ? `<span class="mini-card back">?</span><span class="more-cards">+${hiddenCount}</span>` : "");
}
function statusLabel(status) {
  return ({ PLAYING: "PLAYING", PATLU: "PATLU", BUSTED: "BUSTED", WON: "WINNER" })[status] || status || "—";
}
function renderPlayers(state) {
  const players = Array.isArray(state.players) ? state.players : [];
  $("playersGrid").innerHTML = players.map(p => {
    const isMe = p.user_id === myUserId;
    const current = p.is_current_turn === true || p.user_id === state.round?.current_turn_user_id;
    const status = String(p.player_status || "").toUpperCase();
    const classes = ["player-card", current ? "current" : "", isMe ? "me" : "",
      status === "BUSTED" ? "busted" : "", status === "WON" ? "winner" : ""].filter(Boolean).join(" ");
    const score = p.current_score == null ? "—" : p.current_score;
    return `<article class="${classes}">
      <div class="player-top"><span class="player-name">${escapeHtml(p.name || (isMe ? "You" : "Player"))}${isMe ? " (YOU)" : ""}</span><span class="seat-tag">SEAT ${escapeHtml(p.seat_no ?? "—")}</span></div>
      <span class="player-status ${status.toLowerCase()}">${escapeHtml(statusLabel(status))}</span>
      <div class="player-score"><strong>${escapeHtml(score)}</strong><span>POINTS</span></div>
      <div class="mini-cards">${renderMiniCards(p, isMe)}</div>
    </article>`;
  }).join("") || '<div class="loading-player">Waiting for player details…</div>';
}
function renderMyHand(state) {
  const me = state.me || {};
  const cards = Array.isArray(me.cards) ? me.cards : [];
  $("myName").textContent = me.name || "Your hand";
  $("myScore").textContent = me.current_score == null ? "—" : me.current_score;
  $("myCards").innerHTML = cards.length ? cards.map(renderCard).join("") :
    '<div class="card-placeholder">No cards to display</div>';
  $("myPlayerStatus").textContent = statusLabel(me.player_status);
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
  latestState = state;
  const round = state.round || {};
  const me = state.me || {};
  $("tableCode").textContent = tableCode || "—";
  $("sessionNumber").textContent = safeText(state.session?.session_no);
  $("roundNumber").textContent = safeText(round.round_no);
  $("potAmount").textContent = safeText(round.pot_amount, "0");
  $("stockCount").textContent = `STOCK · ${safeText(round.stock_count, "0")}`;
  $("stockCountLarge").textContent = safeText(round.stock_count, "0");
  const phase = phaseMessage(state);
  $("phaseLabel").textContent = phase.phase;
  $("statusMessage").textContent = phase.message;
  renderPlayers(state);
  renderMyHand(state);
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
    !actionBusy;
  $("hitButton").disabled = !canAct;
  $("patluButton").disabled = !canAct;
  if (canAct) $("turnHint").textContent = "It's your turn. Choose your next action.";
  else if (isMyTurn && Number(me.current_score) < 18) $("turnHint").textContent = "Your score is below 18. The server is drawing automatically.";
  else $("turnHint").textContent = "Waiting for your turn…";
}
function updateClock() {
  const round = latestState?.round || {};
  const me = latestState?.me || {};
  const isMyTurn = round.current_turn_user_id === myUserId;
  const deadline = round.turn_deadline_at ? new Date(round.turn_deadline_at).getTime() : 0;
  const shouldShow = isMyTurn && deadline > 0 &&
    String(round.round_status).toUpperCase() === "PLAYING" &&
    Number(me.current_score) >= 18 && Number(me.current_score) <= 20;
  $("timerBox").classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $("timerValue").textContent = seconds;
  $("timerLabel").textContent = "YOUR TURN";
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
function bindEvents() {
  $("refreshButton").addEventListener("click", pollCycle);
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
