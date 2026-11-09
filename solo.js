// =========================
// SUPABASE INIT
// =========================

const SUPABASE_URL ='https://dbfycihbcosuxxkrmbhl.supabase.co';

const SUPABASE_KEY ='sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX';


const supabaseClient =
supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);



// =========================
// SINGLE GLOBAL STATE (FIXED)
// =========================
let state = {
  sessionId: null,
  computerSeat : null,
  tableId: null,
  userId: null,
  nickname: null,
  seatNo: null,
  fixedSeatNo: null,
  joined: false,
  hand: [],
  groups : [
    [],
    [],
    [],
    [],
    []
   ],
   openPile: [],
  selectedCard: null,
  selectedCards: [],
  jokerCard:null,
  lobbyTimerHandle: null,
  turnStartedAt:null,
  turnEndAt:null,
  lastProcessedTurnEndAt: null,
  lastHandledTimeoutEvent : null,
  turnTimeoutProcessing: false,
  turnServerNowMs: null,
  turnServerSyncPerfMs: null,
  lastTurnSeat: null,
  dragCard: null,
  currentTurnSeat: null,
  ignoreResultWindow : false,
  dealerSeat: null,
  declarationMode : false,
  declarationTimerStarted: false,
  observationTimerInterval : null,
  lastEventTime: null,
  declarationTimerInterval : null,
  resultWindowOpened : false,
  isDropped : false,
  isEliminated : false,
  isInvalidDeclaration : false,
  eliminationScreenShown : false,
  eliminatedRefreshStarted : false,
  playerStatus : false,
  tableCompleted : false,
  deal_no : null,
  wildRank : null,
  dropType : null,
  myScore: null,
  settlementEligible: false,
  settlementId: null,
  settlementOpened: false,
  pickedCard: null,
  participatedInDeal : false,
  drawInProgress: false,
  myTurnPickDone: false,
  dealAnimationPending: false,
  dealAnimationKey: null,
  drawAnimationTarget: null
};




const pickupSound = new Audio("pickup.mp3");
const discardSound = new Audio("discard.mp3");

let savedUserId =
  localStorage.getItem("crdg_user_id");

if(!savedUserId){

  savedUserId = crypto.randomUUID();

  localStorage.setItem(
    "crdg_user_id",
    savedUserId
  );
}

let gameStarting = false;
let gameEntered = false;
let soloEntryInProgress = false;

let turnTimerHandle = null;
// Clock-like countdown tick, generated locally (does not use pickup.mp3).
let turnTickAudioContext = null;
let turnWarningKey = null;
let turnWarningLastSecond = null;

// Physical clock-style countdown sound stored beside the game files.
const turnTickAudio = new Audio("tiktik.mp3");
turnTickAudio.preload = "auto";
turnTickAudio.volume = 1.0;

function playClockTick() {
    try {
        // Restart the short two-click sound once per countdown second.
        turnTickAudio.pause();
        turnTickAudio.currentTime = 0;
        const playResult = turnTickAudio.play();
        if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => {});
        }
    } catch (_) {
        // Sound must never interrupt the game timer.
    }
}

function stopTurnCountdownTicking() {
    // There is no repeating audio loop; invalidate the current countdown guard.
    turnWarningKey = null;
    turnWarningLastSecond = null;
}

function playTurnWarningAtTenSeconds(remaining) {
    if (remaining > 10 || remaining <= 0) return;
    if (Number(state.seatNo) !== Number(state.currentTurnSeat)) return;

    const turnKey = [
        state.sessionId || "",
        state.currentTurnSeat ?? "",
        state.turnEndAt || ""
    ].join("|");

    // Reset the countdown guard when a new player's turn starts.
    if (turnWarningKey !== turnKey) {
        turnWarningKey = turnKey;
        turnWarningLastSecond = null;
    }

    const second = Math.ceil(remaining);
    if (second > 10 || second < 1 || second === turnWarningLastSecond) return;
    turnWarningLastSecond = second;
    playClockTick();
}


let observationTimeRemaining = 30;

const GAME_TYPE = "SOLO";

// ==========================================
// PREVENT ACCIDENTAL BACK DURING SOLO GAME
// ==========================================

let backNavigationArmed = false;

function enableBackProtection() {

    if (backNavigationArmed) {
        return;
    }

    backNavigationArmed = true;

    history.pushState(
        { soloGame: true },
        "",
        window.location.href
    );

    window.addEventListener(
        "popstate",
        function () {

            const leaveGame =
                confirm(
                    "ARE YOU SURE TO LEAVE THIS TABLE?\n\n" +
                    "Press OK to LEAVE\n" +
                    "Press Cancel to PLAY"
                );

            if (leaveGame) {

                history.back();

            } else {

                history.pushState(
                    { soloGame: true },
                    "",
                    window.location.href
                );
            }
        }
    );
}

enableBackProtection();

document.getElementById( "openVisual").onclick = () => {
  draw("open");
};

document.getElementById( "stockCard").onclick = () => {
 draw("stock");
};


document
    .getElementById("btnHistory")
    .addEventListener(
        "click",
        openHistoryPopup
    );


document
    .getElementById("btnCloseHistory")
    .addEventListener(
        "click",
        closeHistoryPopup
    );

document
    .getElementById("historyPopup")
    .addEventListener(
        "click",
        function(event) {

            if (
                event.target === this
            ) {
                closeHistoryPopup();
            }
        }
    );


// ==========================================
// OPEN / STOCK -> G1-G6 DRAG
// ==========================================

const openVisual =
    document.getElementById("openVisual");

const stockCard =
    document.getElementById("stockCard");


// ------------------------------------------
// OPEN CARD DRAG SOURCE
// ------------------------------------------

if (openVisual) {

    openVisual.addEventListener("dragstart", (e) => {

        e.dataTransfer.setData(
            "text/plain",
            "OPEN_CARD"
        );

        e.dataTransfer.effectAllowed = "move";
    });
}


// ------------------------------------------
// STOCK CARD DRAG SOURCE
// ------------------------------------------

if (stockCard) {

    stockCard.draggable = true;

    stockCard.addEventListener("dragstart", (e) => {

        e.dataTransfer.setData(
            "text/plain",
            "STOCK_CARD"
        );

        e.dataTransfer.effectAllowed = "move";
    });
}


// ------------------------------------------
// ALL G1-G6 ARE DROP TARGETS
// ------------------------------------------

for (let targetGroup = 0; targetGroup < 6; targetGroup++) {

    const groupEl =
        document.getElementById(
            "group" + targetGroup
        );

    if (!groupEl) {
        continue;
    }

    groupEl.addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    groupEl.addEventListener("drop", async (e) => {

        e.preventDefault();

        const source =
            e.dataTransfer.getData("text/plain");

        if (
            source !== "OPEN_CARD" &&
            source !== "STOCK_CARD"
        ) {
            return;
        }

        if (source === "OPEN_CARD") {

            await draw(
                "open",
                targetGroup
            );

        }
        else if (source === "STOCK_CARD") {

            await draw(
                "stock",
                targetGroup
            );
        }
    });
}


openVisual.addEventListener("dragover", (e) => {
    e.preventDefault();
});

openVisual.addEventListener("drop", async (e) => {

    e.preventDefault();

    if(!state.dragCard){
        return;
    }

    state.selectedCard = {
        card: state.dragCard.card,
        group: state.dragCard.group,
        index: state.dragCard.index
    };

    state.dragCard = null;

    await discard();
});


enableMobileCardDrag();

function enableMobileCardDrag() {

    if (window.innerWidth > 900) {
        return;
    }

    let dragType = null;
    let dragCardData = null;
    let dragGhost = null;

    const openVisual =
    document.getElementById("openVisual");

    const groupTargets = [];

    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById("group" + g);

        if (groupEl) {
            groupTargets.push({
                group: g,
                element: groupEl
            });
        }
    }




    const hand =
        document.getElementById("my-hand");

    if (!openVisual || !hand) {
      return;
    }

    function createGhost(text, x, y) {

        dragGhost = document.createElement("div");

        dragGhost.textContent = text;

        dragGhost.style.position = "fixed";
        dragGhost.style.left = x + "px";
        dragGhost.style.top = y + "px";

        dragGhost.style.width = "60px";
        dragGhost.style.height = "118px";

        dragGhost.style.background = "white";
        dragGhost.style.color = "black";

        dragGhost.style.border = "2px solid gold";
        dragGhost.style.borderRadius = "8px";

        dragGhost.style.display = "flex";
        dragGhost.style.alignItems = "center";
        dragGhost.style.justifyContent = "center";

        dragGhost.style.fontWeight = "bold";
        dragGhost.style.fontSize = "20px";

        dragGhost.style.pointerEvents = "none";

        dragGhost.style.transform =
            "translate(-50%, -50%) scale(.9)";

        dragGhost.style.opacity = ".9";

        dragGhost.style.zIndex = "99999";

        document.body.appendChild(dragGhost);
    }

    function moveGhost(x, y) {

        if (!dragGhost) {
            return;
        }

        dragGhost.style.left = x + "px";
        dragGhost.style.top = y + "px";
    }

    function removeGhost() {

        if (dragGhost) {
            dragGhost.remove();
            dragGhost = null;
        }
    }

    function cancelMobileDrag() {

        dragType = null;
        dragCardData = null;

        removeGhost();
    }

    function isInside(element, x, y) {

        const rect =
            element.getBoundingClientRect();

        return (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
        );
    }

    function getTargetGroup(x, y) {

    for (const target of groupTargets) {

        if (
            isInside(
                target.element,
                x,
                y
            )
        ) {
            return target.group;
        }
    }

    return -1;
    }


    /* =====================================
       OPEN CARD -> GROUP 5
    ===================================== */

    openVisual.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            dragType = "OPEN_CARD";

            createGhost(
                openVisual.innerText,
                e.clientX,
                e.clientY
            );

            openVisual.setPointerCapture(
                e.pointerId
            );
        }
    );

    openVisual.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "OPEN_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );

    openVisual.addEventListener(
        "pointerup",
        async function (e) {

            if (dragType !== "OPEN_CARD") {
                return;
            }

            const targetGroup =
                getTargetGroup(
                    e.clientX,
                    e.clientY
                );

            if (targetGroup !== -1) {

                await draw(
                    "open",
                    targetGroup
                );
            }

            dragType = null;

            removeGhost();
        }
    );

        openVisual.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    hand.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    openVisual.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );

    hand.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );


    /* =====================================
       HAND CARD -> OPEN PILE
    ===================================== */

    hand.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            const cardElement =
                e.target.closest(".card");

            if (!cardElement) {
                return;
            }

            if (state.isDropped) {
                return;
            }

            let found = false;

            for (
                let g = 0;
                g < state.groups.length;
                g++
            ) {

                const cards =
                    document.querySelectorAll(
                        "#group" + g + " .card"
                    );

                cards.forEach(
                    (cardEl, index) => {

                        if (
                            cardEl === cardElement
                        ) {

                            dragCardData = {
                                card:
                                    state.groups[g][index],
                                group: g,
                                index: index
                            };

                            found = true;
                        }
                    }
                );

                if (found) {
                    break;
                }
            }

            if (!dragCardData) {
                return;
            }

            dragType = "HAND_CARD";

            createGhost(
                dragCardData.card,
                e.clientX,
                e.clientY
            );

            cardElement.setPointerCapture(
                e.pointerId
            );
        }
    );

    hand.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "HAND_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );

    hand.addEventListener(
    "pointerup",
    async function (e) {

        if (
            dragType !== "HAND_CARD" ||
            !dragCardData
        ) {
            return;
        }

        let handled = false;

        /*
        =====================================
        1. HAND CARD -> OPEN PILE
        =====================================
        */

        if (
            isInside(
                openVisual,
                e.clientX,
                e.clientY
            )
        ) {

            state.selectedCard = {
                card: dragCardData.card,
                group: dragCardData.group,
                index: dragCardData.index
            };

            await discard();

            handled = true;
        }

        /*
        =====================================
        2. HAND CARD -> ANOTHER GROUP
        =====================================
        */

        if (!handled) {

            for (let targetGroup = 0; targetGroup < 6; targetGroup++) {

                const groupEl =
                    document.getElementById(
                        "group" + targetGroup
                    );

                if (!groupEl) {
                    continue;
                }

                if (
                    isInside(
                        groupEl,
                        e.clientX,
                        e.clientY
                    )
                ) {

                    const sourceGroup =
                        dragCardData.group;

                    const sourceIndex =
                        dragCardData.index;

                    const cardToMove =
                        dragCardData.card;

                    /*
                     Same group dropped into empty area:
                     do nothing for now.
                    */
                    if (sourceGroup === targetGroup) {

    const targetCards =
        groupEl.querySelectorAll(".card");

    let targetIndex = -1;

    targetCards.forEach((cardEl, index) => {

        const rect =
            cardEl.getBoundingClientRect();

        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            targetIndex = index;
        }
    });

    if (
        targetIndex !== -1 &&
        targetIndex !== sourceIndex
    ) {

        const movedCard =
            state.groups[sourceGroup]
                .splice(
                    sourceIndex,
                    1
                )[0];

        if (sourceIndex < targetIndex) {
            targetIndex--;
        }

        state.groups[targetGroup]
            .splice(
                targetIndex,
                0,
                movedCard
            );

        state.selectedCards = [];
        state.selectedCard = null;

        renderHand();
        calculateDealScore();
    }

    handled = true;
    break;
}

                    /*
                     Remove from source group
                    */

                    state.groups[sourceGroup]
                        .splice(
                            sourceIndex,
                            1
                        );

                    /*
                     Add to target group
                    */

                    state.groups[targetGroup]
                        .push(
                            cardToMove
                        );

                    state.selectedCards = [];
                    state.selectedCard = null;

                    renderHand();
                    calculateDealScore();

                    handled = true;
                    break;
                }
            }
        }

        dragType = null;
        dragCardData = null;

        removeGhost();
    }
);

// =====================================
// STOCK CARD -> G1-G6
// =====================================

const stockCard =
    document.getElementById("stockCard");

if (stockCard) {

    stockCard.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            dragType = "STOCK_CARD";

            createGhost(
                "CARD",
                e.clientX,
                e.clientY
            );

            stockCard.setPointerCapture(
                e.pointerId
            );
        }
    );


    stockCard.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "STOCK_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );


    stockCard.addEventListener(
        "pointerup",
        async function (e) {

            if (dragType !== "STOCK_CARD") {
                return;
            }

            const targetGroup =
                getTargetGroup(
                    e.clientX,
                    e.clientY
                );

            if (targetGroup !== -1) {

                await draw(
                    "stock",
                    targetGroup
                );
            }

            dragType = null;

            removeGhost();
        }
    );

    stockCard.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    stockCard.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );
}


}



// ==========================================
function getSingleSelectedCard() {
    if (!Array.isArray(state.selectedCards)) return null;
    if (state.selectedCards.length !== 1) return null;
    return state.selectedCards[0];
}

function clearCardSelection() {
    state.selectedCards = [];
    state.selectedCard = null;
}

// SIX-GROUP HELPERS
// ==========================================
function ensureSixGroups() {
    if (!Array.isArray(state.groups)) {
        state.groups = [];
    }

    while (state.groups.length < 6) {
        state.groups.push([]);
    }

    if (state.groups.length > 6) {
        state.groups = state.groups.slice(0, 6);
    }
}

function findAvailableGroup(startGroup = 0, endGroup = 4, excludeGroup = -1) {
    ensureSixGroups();

    for (let g = startGroup; g <= endGroup; g++) {
        if (g === excludeGroup) continue;
        if (!state.groups[g] || state.groups[g].length === 0) {
            return g;
        }
    }

    return 5;
}

// GROUP BUTTON
// ==========================================

function updateGroupButton() {

    // Remove existing button
    const oldButton =
        document.getElementById("groupActionButton");

    if (oldButton) {
        oldButton.remove();
    }


    // No selection
    if (
        !state.selectedCards ||
        state.selectedCards.length < 2
    ) {
        return;
    }


    // ==========================================
    // FIND NEXT AVAILABLE GROUP
    // G1 -> G2 -> G3 -> G4
    // ==========================================

    let targetGroup = -1;

    // G5 is the user-created grouping slot.
    // G6 is reserved for printed Jokers and overflow.
    ensureSixGroups();
    if (state.groups[4].length === 0) {
        targetGroup = 4;
    } else {
        targetGroup = 5;
    }


    // ==========================================
    // ALREADY 4 GROUPS
    // ==========================================

    if (targetGroup === -1) {

        return;
    }


    // ==========================================
    // GET SELECTED CARD ELEMENTS
    // ==========================================

    const selectedElements = [];

    state.selectedCards.forEach(selected => {

        const groupEl =
            document.getElementById(
                "group" + selected.group
            );

        if (!groupEl) {
            return;
        }

        const cards =
            groupEl.querySelectorAll(".card");

        const cardEl =
            cards[selected.index];

        if (cardEl) {
            selectedElements.push(cardEl);
        }

    });


    if (selectedElements.length === 0) {
        return;
    }


    // ==========================================
    // FIND POSITION ABOVE SELECTED CARDS
    // ==========================================

    let minTop = Infinity;
    let minLeft = Infinity;

    selectedElements.forEach(cardEl => {

        const rect =
            cardEl.getBoundingClientRect();

        minTop =
            Math.min(minTop, rect.top);

        minLeft =
            Math.min(minLeft, rect.left);

    });


    // ==========================================
    // CREATE BUTTON
    // ==========================================

    const button =
        document.createElement("button");

    button.id =
        "groupActionButton";

    button.textContent =
        "GROUP";


    button.style.position = "fixed";

    button.style.left =
        `${minLeft}px`;

    button.style.top =
        `${Math.max(10, minTop - 48)}px`;

    button.style.zIndex =
        "9999";

    button.style.padding =
        "8px 18px";

    button.style.fontSize =
        "14px";

    button.style.fontWeight =
        "bold";

    button.style.borderRadius =
        "8px";

    button.style.cursor =
        "pointer";


    // ==========================================
    // GROUP CLICK
    // ==========================================

    button.onclick = () => {

        groupSelectedCards();
    };


    document.body.appendChild(button);
}


// ==========================================
// GROUP SELECTED CARDS
// ==========================================

function groupSelectedCards() {

    if (
        !state.selectedCards ||
        state.selectedCards.length < 2
    ) {
        return;
    }

    ensureSixGroups();

    // ==========================================================
    // GROUPING RULES
    // ==========================================================
    // G1-G5 = real user groups.
    // G6     = overflow / unassigned group.
    //
    // A) Selected cards from ONE normal group (G1-G5):
    //    selected cards stay in their parent group.
    //
    // B) Selected cards from MULTIPLE groups:
    //    there is no parent. Selected cards are assigned to the
    //    first available group in G1 -> G5.
    //
    // C) Selected cards from G6:
    //    G6 is not a parent. Selected cards are assigned to the
    //    first available group in G1 -> G5.
    //
    // D) Every remaining/unassigned card is redistributed by
    //    checking availability in strict order G1 -> G6.
    // ==========================================================

    const selected = [];
    const seen = new Set();

    state.selectedCards.forEach(item => {
        const group = Number(item.group);
        const index = Number(item.index);

        if (
            !Number.isInteger(group) ||
            group < 0 ||
            group > 5 ||
            !Number.isInteger(index) ||
            index < 0 ||
            !state.groups[group] ||
            index >= state.groups[group].length
        ) {
            return;
        }

        const key = `${group}:${index}`;
        if (seen.has(key)) return;

        seen.add(key);
        selected.push({
            card: state.groups[group][index],
            group,
            index
        });
    });

    if (selected.length < 2) {
        return;
    }

    const sourceGroups = new Map();

    selected.forEach(item => {
        if (!sourceGroups.has(item.group)) {
            sourceGroups.set(item.group, {
                cards: [...state.groups[item.group]],
                selectedIndexes: new Set()
            });
        }

        sourceGroups.get(item.group)
            .selectedIndexes.add(item.index);
    });

    const sourceNumbers = [...sourceGroups.keys()];
    const hasSingleNormalParent =
        sourceNumbers.length === 1 &&
        sourceNumbers[0] >= 0 &&
        sourceNumbers[0] <= 4;

    // ==========================================================
    // CASE A: SINGLE NORMAL PARENT G1-G5
    // ==========================================================
    if (hasSingleNormalParent) {

        const parentGroup = sourceNumbers[0];
        const source = sourceGroups.get(parentGroup);

        const selectedCards = source.cards.filter(
            (_, index) => source.selectedIndexes.has(index)
        );

        const remainingCards = source.cards.filter(
            (_, index) => !source.selectedIndexes.has(index)
        );

        // Selected cards stay with their parent.
        state.groups[parentGroup] = selectedCards;

        // Remaining cards are now invalid/unassigned.
        // If only ONE card remains, keep it in G6 so the
        // user does not see a one-card group.
        // Otherwise find ONE available group in G1 -> G5,
        // then put ALL remaining cards into that SAME group.
        let remainingTarget = -1;

        if (remainingCards.length === 1) {
            remainingTarget = 5; // G6
        } else {
            for (let g = 0; g < 5; g++) {
                if (state.groups[g].length === 0) {
                    remainingTarget = g;
                    break;
                }
            }

            // If no G1-G5 group is available, use G6.
            if (remainingTarget === -1) {
                remainingTarget = 5;
            }
        }

        state.groups[remainingTarget].push(...remainingCards);
    }

    // ==========================================================
    // CASE B/C: MULTIPLE GROUPS OR SELECTION FROM G6
    // ==========================================================
    else {

        const selectedCards = selected.map(item => item.card);
        const remainingCards = [];

        // Collect all unselected cards from the source groups.
        sourceGroups.forEach((source, groupNo) => {
            source.cards.forEach((card, index) => {
                if (!source.selectedIndexes.has(index)) {
                    remainingCards.push(card);
                }
            });
        });

        // Clear the source groups completely. This is important:
        // otherwise a source group's remaining cards would prevent
        // the G1 -> G5 availability search from finding a free group.
        sourceGroups.forEach((source, groupNo) => {
            state.groups[groupNo] = [];
        });

        // --------------------------------------------------------
        // FIRST assign the SELECTED cards.
        // No parent exists here, so ALWAYS check G1 -> G5.
        // --------------------------------------------------------
        let selectedTarget = -1;

        for (let g = 0; g < 5; g++) {
            if (state.groups[g].length === 0) {
                selectedTarget = g;
                break;
            }
        }

        // If all G1-G5 are occupied, G6 is the only safe place.
        if (selectedTarget === -1) {
            selectedTarget = 5;
        }

        state.groups[selectedTarget].push(...selectedCards);

        // --------------------------------------------------------
        // THEN redistribute the remaining cards.
        // IMPORTANT: check availability ONCE, then keep ALL
        // remaining cards together in that SAME group.
        // --------------------------------------------------------
        let remainingTarget = -1;

        for (let g = 0; g < 6; g++) {
            if (state.groups[g].length === 0) {
                remainingTarget = g;
                break;
            }
        }

        if (remainingTarget === -1) {
            remainingTarget = 5;
        }

        state.groups[remainingTarget].push(...remainingCards);
    }

            // ==========================================
        // CLEAN SINGLE-CARD GROUPS
        // ==========================================
        // Any G1-G5 containing exactly ONE card
        // is moved to G6.
        // G6 is the overflow / unassigned group.

        for (let g = 0; g < 5; g++) {

            if (
                state.groups[g] &&
                state.groups[g].length === 1
            ) {

                const singleCard =
                    state.groups[g].shift();

                state.groups[5].push(singleCard);
            }
        }

    clearCardSelection();

    const button =
        document.getElementById("groupActionButton");

    if (button) {
        button.remove();
    }

    renderHand();
    calculateDealScore();
}

// =========================
// RENDER HAND
// =========================

function renderHand() {


        const dropStatus =
            document.getElementById("dropStatus");

        if(state.isDropped)
        {
            dropStatus.style.display = "block";

            if(state.dropType === "INVALID_DECLARE")
            {
                dropStatus.innerHTML =
                    "🚫 INVALID DECLARE";
            }
            else if(state.dropType === "MID_DROP")
            {
                dropStatus.innerHTML =
                    "⛔ YOU MID DROPPED";
            }
            else
            {
                dropStatus.innerHTML =
                    "❌ YOU DROPPED";
            }
            return;
        }
        else
        {
            dropStatus.style.display = "none";
        }

    document.getElementById("dropBtn").disabled    = state.isDropped;
    
    showBaseTableHand();

    
    for(let g = 0; g < 6; g++) {

    const groupEl =
        document.getElementById("group" + g);

    if(!state.groups[g]) {
        state.groups[g] = [];
    }


    // ==========================================
    // G1-G6
    // All groups use the exact same visual/card layout.
    // Empty groups remain hidden.
    // ==========================================

    if(state.groups[g].length === 0) {
        groupEl.style.display = "none";
    }
    else {
        groupEl.style.display = "flex";
        groupEl.innerHTML =
            `<div class="group-title">G${g + 1}</div>`;
    }

        // DROP ON EMPTY GROUP / GROUP AREA

        groupEl.ondragover = (e) => {
            e.preventDefault();
        };

        groupEl.ondrop = (e) => {

            e.preventDefault();

            if(!state.dragCard){
                return;
            }

            const sourceGroup =
                state.dragCard.group;

            const sourceIndex =
                state.dragCard.index;

            const cardToMove =
                state.dragCard.card;

            if(sourceGroup === g){
                return;
            }

            state.groups[sourceGroup]
                .splice(sourceIndex, 1);

            state.groups[g]
                .push(cardToMove);

            state.dragCard = null;

            renderHand();
            calculateDealScore();
        };

        state.groups[g].forEach((card, index) => {

            const div =
                document.createElement("div");

            div.className =
                "card card-enter";

            // Hide the real drawn card until its flight animation reaches it.
            if (
                state.drawAnimationTarget &&
                state.drawAnimationTarget.group === g &&
                state.drawAnimationTarget.index === index
            ) {
                div.classList.add("draw-card-hidden");
            }

            div.draggable = true;

            // DRAG START

            div.ondragstart = () => {

                state.dragCard = {
                    card: card,
                    group: g,
                    index: index
                };

            };

            // NEW: DROP ON CARD

            div.ondragover = (e) => {
                e.preventDefault();
            };

            div.ondrop = (e) => {

                e.preventDefault();

                if(!state.dragCard){
                    return;
                }

                const sourceGroup =
                    state.dragCard.group;

                const sourceIndex =
                    state.dragCard.index;

                const cardToMove =
                    state.dragCard.card;

                // same exact card
                if(
                    sourceGroup === g &&
                    sourceIndex === index
                ){
                    return;
                }

                // remove from source

                state.groups[sourceGroup]
                    .splice(sourceIndex, 1);

                let targetIndex = index;

                // same group adjustment

                if(
                    sourceGroup === g &&
                    sourceIndex < index
                ){
                    targetIndex--;
                }

                // insert BEFORE target card

                state.groups[g]
                    .splice(
                        targetIndex,
                        0,
                        cardToMove
                    );

                state.dragCard = null;

                renderHand();
                calculateDealScore();
            };

            // DISPLAY

            // DISPLAY

            if (isJokerCard(card)) {

                if (card === "JOKER") {

                    // Printed joker
                    div.innerHTML = `
                        <span class="printed-joker-text">
                            JOKER
                        </span>
                    `;

                } else {

                    // Deal joker
                    const suit = card.slice(-1);
                    const rank = card.slice(0, -1);

                    div.innerHTML = `
                        <span class="card-rank">
                            ${rank}
                        </span>

                        <span class="card-suit">
                            ${suit}
                        </span>

                        <span class="deal-joker-star">
                            ★
                        </span>
                    `;
                }

                div.classList.add("joker-highlight");

            } else {

                const suit = card.slice(-1);
                const rank = card.slice(0, -1);

                div.innerHTML = `
                    <span class="card-rank">
                        ${rank}
                    </span>

                    <span class="card-suit">
                        ${suit}
                    </span>
                `;
            }

            if (
                card.includes("♥") ||
                card.includes("♦")
            ){
                div.classList.add(
                    "red-card"
                );
            }

            // NEWLY PICKED CARD HIGHLIGHT
            if (
                state.pickedCard &&
                state.pickedCard.group === g &&
                state.pickedCard.index === index
            ) {
                div.classList.add("picked-card");
            }


            // SELECTED CARD

                        // MULTI CARD SELECTION
            // ==========================================

            if (
                state.selectedCards &&
                state.selectedCards.some(
                    s =>
                        s.group === g &&
                        s.index === index
                )
            ) {
                div.classList.add("selected");
            }


            // ==========================================
            // CLICK
            // ==========================================

            div.onclick = () => {

                if (state.isDropped) {
                    return;
                }

                // Remove newly picked highlight
                state.pickedCard = null;

                if (!state.selectedCards) {
                    state.selectedCards = [];
                }

                // Check whether this card is already selected
                const selectedIndex =
                    state.selectedCards.findIndex(
                        s =>
                            s.group === g &&
                            s.index === index
                    );


                // ==========================================
                // ALREADY SELECTED → DESELECT
                // ==========================================

                if (selectedIndex !== -1) {

                    state.selectedCards.splice(
                        selectedIndex,
                        1
                    );

                }

                // ==========================================
                // NOT SELECTED → SELECT
                // ==========================================

                else {

                    state.selectedCards.push({

                        card: card,
                        group: g,
                        index: index

                    });

                }


                                // Keep legacy single-card selection in sync
                if (state.selectedCards.length === 1) {
                    state.selectedCard = state.selectedCards[0];
                } else {
                    //state.selectedCards = [];
                    state.selectedCard = null;
                }
                renderHand();
                calculateDealScore();
            };

            // All G1-G6 use identical card spacing.

groupEl.appendChild(div);

            setTimeout(() => {

                div.classList.remove(
                    "card-enter"
                );

                div.classList.add(
                    "card-show"
                );

            }, 30 * index);

        });

    }
  updateGroupButton();
}

function hideBaseTableHand() {

    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById(
                "group" + g
            );

        if (groupEl) {
            groupEl.style.visibility =
                "hidden";
        }
    }
}

function showBaseTableHand() {

    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById(
                "group" + g
            );

        if (groupEl) {
            groupEl.style.visibility =
                "visible";
        }
    }
}



function startObservationTimer()
{
    // --------------------------------------------------
    // Stop any previous observation timer
    // --------------------------------------------------

    if (state.observationTimerInterval)
    {
        clearInterval(
            state.observationTimerInterval
        );

        state.observationTimerInterval = null;
    }


    // --------------------------------------------------
    // No observation end time
    // --------------------------------------------------

    if (!state.observationEndAt)
    {
        return;
    }


    function updateObservationTimer()
    {
        if (!state.observationEndAt)
        {
            return;
        }


        const endTime =
            new Date(
                state.observationEndAt
            ).getTime();


        const seconds =
            Math.max(
                0,
                Math.ceil(
                    (endTime - Date.now()) / 1000
                )
            );


        document.getElementById(
            "observationTimer"
        ).innerText =
            "Observation (" +
            seconds +
            "s)";


        // --------------------------------------------------
        // OBSERVATION FINISHED
        // --------------------------------------------------

        if (seconds <= 0)
        {
            if (state.observationTimerInterval)
            {
                clearInterval(
                    state.observationTimerInterval
                );

                state.observationTimerInterval =
                    null;
            }


            onObservationTimerExpired();

            return;
        }
    }


    // --------------------------------------------------
    // IMPORTANT:
    // Check whether already expired BEFORE creating
    // another interval.
    // --------------------------------------------------

    const endTime =
        new Date(
            state.observationEndAt
        ).getTime();


    if (Date.now() >= endTime)
    {
        updateObservationTimer();

        return; // CRITICAL
    }


    // --------------------------------------------------
    // First display update
    // --------------------------------------------------

    updateObservationTimer();


    // --------------------------------------------------
    // Start timer only when observation is still active
    // --------------------------------------------------

    state.observationTimerInterval =
        setInterval(
            updateObservationTimer,
            250
        );
}


async function onObservationTimerExpired()
{
    


    // --------------------------------------------------
    // STOP OBSERVATION TIMER
    // --------------------------------------------------

    clearInterval(
        state.observationTimerInterval
    );

    state.observationTimerInterval = null;


    // --------------------------------------------------
    // SOLO GAME
    //
    // Observation finished → Complete the entire game.
    // No next deal.
    // --------------------------------------------------

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "SOLO"
    ) {



        const { data: soloData, error: soloError } =
            await supabaseClient.rpc(
                "crdg_solo_complete_game",
                {
                    p_session_id:
                        state.sessionId,

                    p_user_id:
                        state.userId
                }
            );


        if (soloError) {

            console.error(
                "Solo completion error:",
                soloError
            );

            alert(
                "Unable to complete Solo game."
            );

            return;
        }



        // --------------------------------------------------
        // Reload session immediately.
        //
        // This avoids depending only on Realtime.
        // loadSessionInfo() will detect:
        //
        // data.game_completed = true
        //
        // and call handleTableCompleted(data).
        // --------------------------------------------------

       // await loadSessionInfo();


    

            // --------------------------------------------------
            // REGISTERED ACCOUNT -> SOLO CHIP SETTLEMENT
            // --------------------------------------------------
            // The game is already completed above.
            // Now settle the final player/computer scores through
            // the DB-side crdgn settlement SP.
            // --------------------------------------------------

            const settlementSessionToken =
                localStorage.getItem("crdgn_session_token");

            if (!settlementSessionToken) {

                console.error(
                    "Solo settlement failed: session token is missing."
                );

                alert(
                    "Game completed, but chip settlement could not be completed. Please login again."
                );

                return;
            }

            const {
                data: settlementData,
                error: settlementError
            } = await supabaseClient.rpc(
                "crdgn_settle_solo_game",
                {
                    p_session_token:
                        settlementSessionToken,

                    p_game_session_id:
                        state.sessionId
                }
            );


            if (settlementError) {

                console.error(
                    "Solo chip settlement error:",
                    settlementError
                );

                alert(
                    "Game completed, but chip settlement could not be completed. Please try again."
                );

                return;
            }

            const settlementResult =
                Array.isArray(settlementData)
                    ? settlementData[0]
                    : settlementData;

            if (
                !settlementResult ||
                settlementResult.success !== true
            ) {

                console.error(
                    "Invalid Solo settlement result:",
                    settlementResult
                );

                alert(
                    settlementResult?.message ||
                    "Game completed, but chip settlement could not be completed. Please try again."
                );

                return;
            }

            // Existing Solo completion redirect remains unchanged.
            window.location.replace("index.html");

            return;
       
    }


    // --------------------------------------------------
    // NORMAL / FRIENDS GAME
    // --------------------------------------------------

    document.getElementById(
        "dealResultModal"
    ).style.display = "none";


    clearCurrentDealUI();


    // --------------------------------------------------
    // Reload session first.
    // Check whether this was the final deal.
    // --------------------------------------------------

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("*")
            .eq(
                "session_id",
                state.sessionId
            )
            .single();


    if (error) {

        console.error(
            "Final completion check failed:",
            error
        );

        return;
    }


    // --------------------------------------------------
    // GAME COMPLETED
    // --------------------------------------------------

    if (data.game_completed === true) {

        handleTableCompleted(data);

        return;
    }


    // --------------------------------------------------
    // NORMAL GAME → START NEXT DEAL
    // --------------------------------------------------

    await startNextDeal();
}


function resetSettlementControls() {

    const acceptBtn =
        document.getElementById(
            "btnSettlementAccept"
        );

    const cancelBtn =
        document.getElementById(
            "btnSettlementCancel"
        );

    const statusEl =
        document.getElementById(
            "settlementStatus"
        );

    const popup =
        document.getElementById(
            "settlementPopup"
        );

    if (acceptBtn) {
        acceptBtn.disabled = false;
    }

    if (cancelBtn) {
        cancelBtn.disabled = false;
    }

    if (statusEl) {
        statusEl.innerText = "";
    }

    if (popup) {
        popup.style.display = "none";
    }

    state.settlementOpened = false;
    state.settlementId = null;
}

async function startNextDeal()
{

    if (state.tableCompleted)
    {
        return;
    }

    closeSettlementPopup();


    // ==================================================
    // ELIMINATED PLAYER
    // ==================================================

    if (state.playerStatus === "ELIMINATED")
    {
        state.ignoreResultWindow = true;
        state.resultWindowOpened = false;
        state.resultWindowLoaded = false;

        clearInterval(
            state.observationTimerInterval
        );

        document.getElementById(
            "dealResultModal"
        ).style.display = "none";


        setTimeout(async () =>
        {
            try
            {
                await loadGame();
                //await loadSessionInfo();
                await loadPlayers();

                state.ignoreResultWindow = false;
            }
            catch (error)
            {
                console.error(
                    "Eliminated-player refresh failed:",
                    error
                );
            }

        }, 2500);

        return;
    }


    // ==================================================
    // RESET LOCAL RESULT WINDOW
    // ==================================================

    state.ignoreResultWindow = true;

    state.resultWindowOpened = false;
    state.resultWindowLoaded = false;

    state.isDropped = false;
    state.dropType = "";

    state.declarationTimerStarted = false;


    clearInterval(
        state.observationTimerInterval
    );


    document.getElementById(
        "dealResultsContainer"
    ).innerHTML = "";


    document.getElementById(
        "resultJokerCard"
    ).innerHTML = "";


    document.getElementById(
        "dealResultModal"
    ).style.display = "none";


    // ==================================================
    // Identify current dealer BEFORE seat rebuild
    // ==================================================

    const isCurrentDealer =
        Number(state.seatNo) ===
        Number(state.dealerSeat);


    // ==================================================
    // ONLY CURRENT DEALER STARTS NEXT DEAL
    // ==================================================

    if (isCurrentDealer)
    {
        try
        {
            // ------------------------------------------
            // 1. CHECK REJOIN QUEUE
            // ------------------------------------------

            const {
                data: queueData,
                error: queueError
            } =
            await supabaseClient
                .from(
                    "crdg_rejoin_queue"
                )
                .select(
                    "user_id"
                )
                .eq(
                    "session_id",
                    state.sessionId
                );


            if (queueError)
            {
                console.error(
                    "Failed to read rejoin queue:",
                    queueError
                );

                state.ignoreResultWindow = false;
                return;
            }


            const rejoinCount =
                Array.isArray(queueData)
                    ? queueData.length
                    : 0;


            // ------------------------------------------
            // 2. SAVE COMPLETED DEAL HISTORY
            // ------------------------------------------

            const {
                data: historyData,
                error: historyError
            } =
            await supabaseClient.rpc(
                "crdg_save_deal_history",
                {
                    p_session_id:
                        state.sessionId,

                    p_deal_no:
                        state.deal_no
                }
            );


            if (historyError)
            {
                console.error(
                    "crdg_save_deal_history ERROR:",
                    historyError
                );

                state.ignoreResultWindow = false;
                return;
            }


            // ------------------------------------------
            // 3. REBUILD SEATING IF REJOIN EXISTS
            // ------------------------------------------

            if (rejoinCount > 0)
            {
                const {
                    data: rebuildData,
                    error: rebuildError
                } =
                await supabaseClient.rpc(
                    "crdg_rebuild_turn_order",
                    {
                        p_session_id:
                            state.sessionId
                    }
                );


                if (rebuildError)
                {
                    console.error(
                        "crdg_rebuild_turn_order failed:",
                        rebuildError
                    );

                    state.ignoreResultWindow = false;
                    return;
                }
            }


            // ==========================================
            // 4. PREPARE + DEAL IN ONE DB TRANSACTION
            // ==========================================

            const {
                data: nextDealData,
                error: nextDealError
            } =
            await supabaseClient.rpc(
                "crdg_begin_next_deal",
                {
                    p_session_id:
                        state.sessionId,

                    p_skip_dealer_rotation:
                        rejoinCount > 0
                }
            );


            if (nextDealError)
            {
                console.error(
                    "crdg_begin_next_deal failed:",
                    nextDealError
                );

                state.ignoreResultWindow = false;
                return;
            }
        }
        catch (error)
        {
            console.error(
                "startNextDeal unexpected error:",
                error
            );

            state.ignoreResultWindow = false;
            return;
        }
    }


    // ==================================================
    // ALL ACTIVE PLAYERS LOAD NEW DEAL
    // ==================================================

    setTimeout(async () =>
    {
        try
        {
            // ------------------------------------------
            // IMPORTANT:
            // Fresh DB hand must be loaded first.
            // ------------------------------------------

            await prepareDealDistributionAnimation();
            await loadGame();


            // ------------------------------------------
            // New joker/open/turn/dealer
            // ------------------------------------------

            await loadSessionInfo();


            // ------------------------------------------
            // Seat/player information
            // ------------------------------------------

            await loadPlayers();


            // ------------------------------------------
            // Render freshly loaded 13 cards
            // ------------------------------------------

            renderHand();
            await runDealDistributionAnimation();


            state.ignoreResultWindow =
                false;
        }
        catch (error)
        {
            console.error(
                "New-deal refresh failed:",
                error
            );

            state.ignoreResultWindow =
                false;
        }

    }, 2500);
}


async function loadDealHistory() {

    const tableHead =
        document.getElementById("historyTableHead");

    const tableBody =
        document.getElementById("historyTableBody");

    tableHead.innerHTML = "";

    tableBody.innerHTML = `
        <tr>
            <td colspan="20" class="history-loading">
                Loading history...
            </td>
        </tr>
    `;

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "crdg_get_deal_history",
        {
            p_session_id: state.sessionId
        }
    );

    if (error) {

        console.error(
            "crdg_get_deal_history ERROR:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="20" class="history-error">
                    Unable to load history
                </td>
            </tr>
        `;

        return;
    }


    renderDealHistory(
        Array.isArray(data) ? data : []
    );
}
function renderDealHistory(historyRows) {

    const tableHead =
        document.getElementById("historyTableHead");

    const tableBody =
        document.getElementById("historyTableBody");

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    if (!historyRows.length) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="20" class="history-no-data">
                    No completed deal history available
                </td>
            </tr>
        `;

        return;
    }


    // --------------------------------------------------
    // 1. Build unique player list
    // --------------------------------------------------

    const playerMap = new Map();

    historyRows.forEach(row => {

        if (!playerMap.has(row.user_id)) {

            playerMap.set(
                row.user_id,
                {
                    userId: row.user_id,
                    displayName:
                        row.display_name || "Player",

                    displayOrder:
                        Number(row.display_order) || 999
                }
            );
        }
    });

    const players =
        Array.from(playerMap.values())
            .sort(
                (a, b) =>
                    a.displayOrder - b.displayOrder
            );


    // --------------------------------------------------
    // 2. Find all completed deal numbers
    // --------------------------------------------------

    const dealNumbers =
        [
            ...new Set(
                historyRows.map(
                    row => Number(row.deal_no)
                )
            )
        ]
        .filter(Number.isFinite)
        .sort((a, b) => a - b);


    // --------------------------------------------------
    // 3. Build fast lookup:
    // deal_no → user_id → history row
    // --------------------------------------------------

    const dealMap = new Map();

    historyRows.forEach(row => {

        const dealNo =
            Number(row.deal_no);

        if (!dealMap.has(dealNo)) {
            dealMap.set(
                dealNo,
                new Map()
            );
        }

        dealMap
            .get(dealNo)
            .set(
                row.user_id,
                row
            );
    });


    // --------------------------------------------------
    // 4. Create table header
    // --------------------------------------------------

    const headerRow =
        document.createElement("tr");

    const dealHeader =
        document.createElement("th");

    dealHeader.textContent = "Deal";

    headerRow.appendChild(
        dealHeader
    );

    players.forEach(player => {

        const th =
            document.createElement("th");

        th.textContent =
            player.displayName;

        headerRow.appendChild(th);
    });

    tableHead.appendChild(
        headerRow
    );


    // --------------------------------------------------
    // 5. Create deal rows
    // --------------------------------------------------

    dealNumbers.forEach(dealNo => {

        const tr =
            document.createElement("tr");

        const dealCell =
            document.createElement("td");

        dealCell.textContent =
            dealNo;

        tr.appendChild(
            dealCell
        );

        players.forEach(player => {

            const td =
                document.createElement("td");

            const row =
                dealMap
                    .get(dealNo)
                    ?.get(player.userId);

            if (!row) {

                td.textContent = "--";

                td.classList.add(
                    "history-empty-cell"
                );

            } else {

                const score =
                    row.deal_score;

                if (
                    score === null ||
                    score === undefined
                ) {

                    td.textContent = "--";

                    td.classList.add(
                        "history-empty-cell"
                    );

                } else {

                    if (row.is_rejoined) {

                        const symbol =
                            document.createElement("span");

                        symbol.className =
                            "history-rejoin-symbol";

                        symbol.textContent =
                            `↺${row.rejoin_count}`;

                        td.appendChild(symbol);

                        td.appendChild(
                            document.createTextNode(
                                String(score)
                            )
                        );

                        td.classList.add(
                            "history-rejoined-cell"
                        );

                    } else {

                        td.textContent =
                            String(score);
                    }
                }
            }

            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });


    // --------------------------------------------------
    // 6. Add Total row
    // --------------------------------------------------

    const totalRow =
        document.createElement("tr");

    totalRow.className =
        "history-total-row";

    const totalLabel =
        document.createElement("td");

    totalLabel.textContent =
        "Total";

    totalRow.appendChild(
        totalLabel
    );

    players.forEach(player => {

        const td =
            document.createElement("td");

        const playerRows =
            historyRows
                .filter(
                    row =>
                        row.user_id ===
                        player.userId
                )
                .sort(
                    (a, b) =>
                        Number(a.deal_no) -
                        Number(b.deal_no)
                );

        const latestRow =
            playerRows.length
                ? playerRows[playerRows.length - 1]
                : null;

        if (!latestRow) {

            td.textContent = "--";

        } else {

            td.textContent =
                String(
                    latestRow.total_score ?? 0
                );
        }

        totalRow.appendChild(td);
    });

    tableBody.appendChild(
        totalRow
    );
}


function openHistoryPopup() {

    const popup =
        document.getElementById(
            "historyPopup"
        );

    popup.classList.remove(
        "hidden"
    );

    loadDealHistory();
}


function closeHistoryPopup() {

    const popup =
        document.getElementById(
            "historyPopup"
        );

    popup.classList.add(
        "hidden"
    );
}

// Animate a successfully drawn SOLO card from the open/stock pile into its group.
// The actual hand card stays hidden until the flying copy arrives.
async function animateSoloDrawCardToGroup(sourceRect, groupIndex, cardIndex) {
    const groupEl = document.getElementById("group" + groupIndex);
    const target = groupEl
        ? Array.from(groupEl.querySelectorAll(":scope > .card"))[cardIndex]
        : null;

    if (!sourceRect || !target) {
        state.drawAnimationTarget = null;
        if (target) target.classList.remove("draw-card-hidden");
        try {
            pickupSound.currentTime = 0;
            const soundResult = pickupSound.play();
            if (soundResult && typeof soundResult.catch === "function") soundResult.catch(() => {});
        } catch (e) {}
        return;
    }

    const targetRect = target.getBoundingClientRect();
    const flyer = target.cloneNode(true);
    flyer.classList.remove(
        "picked-card", "selected", "card-enter", "card-show",
        "deal-card-hidden", "draw-card-hidden", "discard-card-hidden"
    );
    flyer.classList.add("crdg-solo-draw-fly-card");
    flyer.setAttribute("aria-hidden", "true");
    flyer.draggable = false;
    flyer.onclick = null;
    flyer.ondragstart = null;
    flyer.style.left = targetRect.left + "px";
    flyer.style.top = targetRect.top + "px";
    flyer.style.width = targetRect.width + "px";
    flyer.style.height = targetRect.height + "px";
    document.body.appendChild(flyer);

    try {
        pickupSound.currentTime = 0;
        const soundResult = pickupSound.play();
        if (soundResult && typeof soundResult.catch === "function") soundResult.catch(() => {});
    } catch (e) {}

    const reducedMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
        if (!reducedMotion && typeof flyer.animate === "function") {
            const dx = sourceRect.left - targetRect.left;
            const dy = sourceRect.top - targetRect.top;
            const sx = Math.max(0.2, sourceRect.width / Math.max(1, targetRect.width));
            const sy = Math.max(0.2, sourceRect.height / Math.max(1, targetRect.height));
            const animation = flyer.animate([
                {
                    transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy}) rotate(-3deg)`,
                    opacity: 0.98
                },
                {
                    transform: `translate3d(${dx * 0.48}px, ${dy * 0.48 - 16}px, 0) scale(${1 + (sx - 1) * 0.45}, ${1 + (sy - 1) * 0.45}) rotate(2deg)`,
                    opacity: 1,
                    offset: 0.58
                },
                {
                    transform: "translate3d(0, 0, 0) scale(1, 1) rotate(0deg)",
                    opacity: 1
                }
            ], {
                duration: 420,
                easing: "cubic-bezier(.2,.72,.22,1)",
                fill: "forwards"
            });
            await animation.finished.catch(() => {});
        } else {
            await new Promise(resolve => setTimeout(resolve, 120));
        }
    } finally {
        flyer.remove();
        state.drawAnimationTarget = null;
        const currentGroup = document.getElementById("group" + groupIndex);
        const currentTarget = currentGroup
            ? Array.from(currentGroup.querySelectorAll(":scope > .card"))[cardIndex]
            : null;
        if (currentTarget) currentTarget.classList.remove("draw-card-hidden");
    }
}

// =========================
// DRAW
// =========================
async function draw(source, targetGroup = 5) {

    // --------------------------------------------------
    // Prevent double-click / multiple draw requests
    // --------------------------------------------------
    if (state.drawInProgress === true) {
        console.log("DRAW ignored: another draw is already in progress.");
        return;
    }

    state.drawInProgress = true;

    try {

        if (!state.sessionId) return;

        if (state.declarationMode) {
            return;
        }

        // --------------------------------------------------
        // Must be player's turn
        // --------------------------------------------------
        if (
            Number(state.seatNo) !==
            Number(state.currentTurnSeat)
        ) {
            alert("Please wait. It is another player's turn.");
            return;
        }

        // --------------------------------------------------
        // Player must have exactly 13 cards before picking
        // --------------------------------------------------
        const cardCount = getTotalCards();

        if (cardCount !== 13) {
            alert(
                "You have already picked a card. Please discard or declare."
            );
            return;
        }

        // Capture the source pile position before Supabase updates the pile.
        const sourcePileEl = document.getElementById(
            source === "open" ? "openVisual" : "stockCard"
        );
        const sourceRect = sourcePileEl
            ? (() => {
                const r = sourcePileEl.getBoundingClientRect();
                return { left: r.left, top: r.top, width: r.width, height: r.height };
            })()
            : null;

        // --------------------------------------------------
        // Draw card from Supabase
        // --------------------------------------------------
        const { data, error } =
            await supabaseClient.rpc("crdg_draw_card", {
                p_session_id: state.sessionId,
                p_table_id: state.tableId,
                p_user_id: state.userId,
                p_source: source
            });

        if (error) {
            console.error(error);
            return;
        }

        // --------------------------------------------------
        // Cannot pick discarded Joker / Wild Joker
        // --------------------------------------------------
        if (
            data &&
            data.length > 0 &&
            data[0].status === "cannot_pick_joker"
        ) {
            alert(
                "Cannot pick discarded Joker / Wild Joker"
            );
            return;
        }

        const card = data?.[0]?.card;

        if (card) {

            // --------------------------------------------------
            // Stop pick-card animation
            // --------------------------------------------------
            state.myTurnPickAnimation = false;
            state.myTurnPickDone = true;

            document
                .getElementById("openVisual")
                ?.classList.remove("pick-card-pulse");

            document
                .getElementById("stockCard")
                ?.classList.remove("pick-card-pulse");

            ensureSixGroups();

            // --------------------------------------------------
            // Destination:
            // G1-G6 when dragged to a group.
            // G6 when using normal click.
            // --------------------------------------------------
            const destinationGroup =
                Number.isInteger(targetGroup) &&
                targetGroup >= 0 &&
                targetGroup <= 5
                    ? targetGroup
                    : 5;

            state.groups[destinationGroup].push(card);
            const destinationIndex = state.groups[destinationGroup].length - 1;

            // A newly drawn card is not a selected card; do not show selection glow.
            state.pickedCard = null;
            state.selectedCard = null;
            state.selectedCards = [];
            state.drawAnimationTarget = {
                group: destinationGroup,
                index: destinationIndex
            };

            renderHand();
            await animateSoloDrawCardToGroup(
                sourceRect,
                destinationGroup,
                destinationIndex
            );
            calculateDealScore();
            updateActionButtons();
        }

    } finally {

        // --------------------------------------------------
        // Allow next draw only after current draw is finished
        // --------------------------------------------------
        state.drawInProgress = false;

        console.log("DRAW lock released.");
    }
}


async function dropCurrentDeal()
{


    

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("You can drop only during your turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 13) {
        alert("You cannot drop after picking a card. Please discard or declare.");
        return;
    }

    // existing drop code...

    
    const msg = "Are you sure you want to DROP?";
    if (!confirm(msg))
    {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_drop_player",
            {
                p_session_id: state.sessionId,
                p_user_id: state.userId
            }
        );

    if(error)
    {
        console.error(error);
        return;
    }

    await loadSessionInfo();
    await loadPlayers();

    state.isDropped = true;
    state.dropType = data[0].drop_type;

    renderHand();
}
// Animate the selected SOLO hand card from any group onto the open pile.
// Called only after Supabase confirms the discard, so failed discards never animate.
async function animateSoloDiscardCardToOpenPile(cardInfo) {
    const groupEl = document.getElementById("group" + cardInfo.group);
    const source = groupEl
        ? Array.from(groupEl.querySelectorAll(":scope > .card"))[cardInfo.index]
        : null;
    const destination = document.getElementById("openVisual");

    if (!source || !destination) {
        try {
            discardSound.currentTime = 0;
            const soundResult = discardSound.play();
            if (soundResult && typeof soundResult.catch === "function") soundResult.catch(() => {});
        } catch (e) {}
        return;
    }

    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    const flyer = source.cloneNode(true);
    flyer.classList.remove(
        "picked-card", "selected", "card-enter", "card-show",
        "deal-card-hidden", "draw-card-hidden", "discard-card-hidden"
    );
    flyer.classList.add("crdg-solo-discard-fly-card");
    flyer.setAttribute("aria-hidden", "true");
    flyer.draggable = false;
    flyer.onclick = null;
    flyer.ondragstart = null;
    flyer.style.left = sourceRect.left + "px";
    flyer.style.top = sourceRect.top + "px";
    flyer.style.width = sourceRect.width + "px";
    flyer.style.height = sourceRect.height + "px";
    document.body.appendChild(flyer);

    // Keep the real card in place but invisible until the animation completes.
    source.classList.add("discard-card-hidden");

    try {
        discardSound.currentTime = 0;
        const soundResult = discardSound.play();
        if (soundResult && typeof soundResult.catch === "function") soundResult.catch(() => {});
    } catch (e) {}

    const reducedMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
        if (!reducedMotion && typeof flyer.animate === "function") {
            const dx = destinationRect.left - sourceRect.left;
            const dy = destinationRect.top - sourceRect.top;
            const sx = Math.max(0.2, destinationRect.width / Math.max(1, sourceRect.width));
            const sy = Math.max(0.2, destinationRect.height / Math.max(1, sourceRect.height));
            const animation = flyer.animate([
                { transform: "translate3d(0,0,0) scale(1,1) rotate(0deg)", opacity: 1 },
                {
                    transform: `translate3d(${dx * 0.52}px, ${dy * 0.52 - 14}px, 0) scale(${1 + (sx - 1) * 0.45}, ${1 + (sy - 1) * 0.45}) rotate(-2deg)`,
                    opacity: 1, offset: 0.55
                },
                { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy}) rotate(3deg)`, opacity: 0.96 }
            ], { duration: 420, easing: "cubic-bezier(.2,.72,.22,1)", fill: "forwards" });
            await animation.finished.catch(() => {});
        } else {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } finally {
        flyer.remove();
        source.classList.remove("discard-card-hidden");
    }
}

// =========================
// DISCARD
// =========================
async function discard() {
     

    if (!state.sessionId) return;
    if(state.declarationMode){
     return;
    }

   

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 14) {
        alert("Please pick a card before discarding.");
        return;
    }

    if (!state.selectedCard) {
        alert("Please select a card to discard.");
        return;
    }

    // existing discard code...

    const totalCards =
        state.groups.reduce(
            (a, g) => a + g.length,
            0
        );

    if (totalCards < 14) {

        alert("Pick a card first");
        return;
    }

    if (!state.selectedCard) {

        alert("Select a card to discard");
        return;
    }

    const cardToRemove =
        state.selectedCard;

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_discard_card",
            {
                p_session_id: state.sessionId,
                p_table_id: state.tableId,
                p_user_id: state.userId,
                p_card: cardToRemove.card
            }
        );

    if (error) {

        console.error(error);
        return;
    }

    if (
        data &&
        data.length &&
        data[0].status === "success"
    ) 
    {
        stopTurnCountdownTicking();
        // Animate the card from its current group to the open pile before
        // removing it from the local hand and rendering the next state.
        await animateSoloDiscardCardToOpenPile(cardToRemove);

        state.groups[
            cardToRemove.group
        ].splice(
            cardToRemove.index,
            1
        );

          
        document.getElementById(
            "turnTimer"
        ).innerText = "0";

        // Clear old card selection
        state.selectedCards = [];
        state.selectedCard = null;
        state.dragCard = null;

        // Load the new turn and its new central timer
       // await loadGame();
            // New turn is already returned by discard RPC
        state.currentTurnSeat = Number(data[0].next_turn_seat);
        state.turnEndAt = data[0].turn_end_at;

        // Start the new turn timer immediately
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;

       // syncTurnClock();
        startTurnTimer();

        updateActionButtons();

        renderHand();
        calculateDealScore();        

       // await loadSessionInfo();
    }



}


let sessionRefreshPending = false;
let sessionRefreshTimer = null;
let sessionRealtimeChannel = null;



function subscribeRealtime() {

    if (!state.sessionId) {
        return;
    }

    // Prevent duplicate realtime subscriptions
    if (sessionRealtimeChannel) {
        return;
    }

    sessionRealtimeChannel =
        supabaseClient
            .channel(
                "game-session-" +
                state.sessionId +
                "-" +
                state.userId
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "crdg_game_sessions",
                    filter:
                        "session_id=eq." +
                        state.sessionId
                },
                (payload) => {


                    // ------------------------------------------
                    // Do NOT discard realtime events.
                    // Every event resets the debounce timer.
                    // ------------------------------------------

                    if (sessionRefreshTimer) {

                        clearTimeout(
                            sessionRefreshTimer
                        );

                    }


                    sessionRefreshTimer =
                        setTimeout(
                            async () => {

                                // ------------------------------------------
                                // If another refresh is still running,
                                // try again shortly.
                                // ------------------------------------------

                                if (sessionRefreshPending) {

                                    sessionRefreshTimer =
                                        setTimeout(
                                            () => {

                                                sessionRefreshTimer =
                                                    null;

                                                loadSessionInfo()
                                                    .then(
                                                        () => {

                                                            updateActionButtons();

                                                        }
                                                    )
                                                    .catch(
                                                        error => {

                                                            console.error(
                                                                "Realtime delayed refresh error:",
                                                                error
                                                            );

                                                        }
                                                    );

                                            },
                                            200
                                        );

                                    return;
                                }


                                sessionRefreshPending =
                                    true;

                                sessionRefreshTimer =
                                    null;


                                try {

                                    await loadSessionInfo();

                                    updateActionButtons();

                                }
                                catch (error) {

                                    console.error(
                                        "Realtime session refresh error:",
                                        error
                                    );

                                }
                                finally {

                                    sessionRefreshPending =
                                        false;

                                }

                            },
                            350
                        );

                }
            )
            .subscribe(
                (status, err) => {

                    if (err) {

                        console.error(
                            "Session realtime error:",
                            err
                        );

                    }

                }
            );
}



async function handleTableCompleted(data)
{
    // Prevent duplicate execution
    if(state.tableCompleted)
    {
        return;
    }


    state.tableCompleted = true;

    // Stop timers
    clearInterval(
        state.turnTimerInterval
    );
    state.turnTimerInterval = null; //MAH

    clearInterval(
        state.observationTimerInterval
    );


    // Stop DB polling / realtime processing
   // stopGamePolling();


    // Disable buttons
    const btnDiscard =
        document.getElementById("btnDiscard");

    const btnDeclare =
        document.getElementById("btnDeclare");


    if(btnDiscard)
    {
        btnDiscard.disabled = true;
    }


    if(btnDeclare)
    {
        btnDeclare.disabled = true;
    }


    // Disable card selection / stock actions

    const openVisual =
        document.getElementById("openVisual");

    const stockCard =
        document.getElementById("stockCard");


    if(openVisual)
    {
        openVisual.style.pointerEvents = "none";
    }


    if(stockCard)
    {
        stockCard.style.pointerEvents = "none";
    }


    // Stop any active declaration/drop UI

    const dealResultModal =
        document.getElementById(
            "dealResultModal"
        );

    if(dealResultModal)
    {
        dealResultModal.style.display = "none";
    }

    showTableCompletedScreen(data);


    // Future:
    // load final table result here
}


async function showTableCompletedScreen(data)
{
    const tbody =
        document.getElementById(
            "finalScoreBody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";


    // ==================================================
    // SETTLEMENT COMPLETION
    // ==================================================

    if (
        data.completion_type ===
        "SETTLEMENT"
    )
    {
        const {
            data: settlementData,
            error: settlementError
        } =
        await supabaseClient.rpc(
            "crdg_get_settlement_final_result",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if (settlementError)
        {
            console.error(
                "Settlement final result error:",
                settlementError
            );

            return;
        }


        if (
            settlementData &&
            settlementData.length > 0
        )
        {
            settlementData.forEach(
                player =>
                {
                    const tr =
                        document.createElement(
                            "tr"
                        );


                    tr.classList.add(
                        "winner-row"
                    );


                    tr.innerHTML =
                    `
                    <td>
                        🏆 ${player.display_name}
                    </td>

                    <td>
                        ${player.final_score}
                    </td>

                    <td>
                        WINNER - ${player.settlement_percentage}%
                    </td>
                    `;


                    tbody.appendChild(
                        tr
                    );
                }
            );
        }
        else
        {
            console.warn(
                "No settlement final result found"
            );
        }
    }


    // ==================================================
    // NORMAL TABLE COMPLETION
    // ==================================================

    else
    {
        const {
            data: resultData,
            error
        } =
        await supabaseClient.rpc(
            "crdg_get_table_final_result",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if(error)
        {
            console.error(
                "Final result error:",
                error
            );

            return;
        }


        if (
            resultData &&
            resultData.length > 0
        )
        {
            resultData.forEach(
                player =>
                {
                    const tr =
                        document.createElement(
                            "tr"
                        );


                    if(player.is_winner)
                    {
                        tr.classList.add(
                            "winner-row"
                        );
                    }


                    tr.innerHTML =
                    `
                    <td>
                        ${
                            player.is_winner
                            ? "🏆 "
                            : ""
                        }

                        ${player.display_name}
                    </td>

                    <td>
                        ${player.final_score}
                    </td>

                    <td>
                        ${
                            player.is_winner
                            ? "WINNER"
                            : "PLAYER"
                        }
                    </td>
                    `;


                    tbody.appendChild(
                        tr
                    );
                }
            );
        }
        else
        {
            console.warn(
                "No normal final result found"
            );
        }
    }


    // ==================================================
    // CLOSE OTHER POPUPS / MODALS
    // ==================================================

    const settlementPopup =
        document.getElementById(
            "settlementPopup"
        );

    if (settlementPopup)
    {
        settlementPopup.style.display =
            "none";
    }


    const dealResultModal =
        document.getElementById(
            "dealResultModal"
        );

    if (dealResultModal)
    {
        dealResultModal.style.display =
            "none";
    }


    // ==================================================
    // SHOW TABLE COMPLETION SCREEN
    // ==================================================

    const screen =
        document.getElementById(
            "tableCompletedScreen"
        );


    if(screen)
    {
        screen.style.display =
            "flex";
    }
}


function goToHome()
{
    window.location.replace("index.html");
}


function getTableCardHTML(card) {

    if (!card || card === "-") {
        return "-";
    }

    // Printed joker
    if (card === "JOKER") {
        return `
            <span class="printed-joker-text">JOKER</span>
        `;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0, -1);

    return `
        <span class="card-rank">${rank}</span>
        <span class="card-suit">${suit}</span>
    `;
}


async function loadSessionInfo() {

    if (state.tableCompleted) {
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("*")
            .eq("session_id", state.sessionId)
            .single();

    if (error) {
        console.error(error);
        return;
    }

    if (data.game_completed) {

        // If deal results are ready, allow the normal
        // result/observation flow to continue.
        if (data.deal_results_ready === true) {

            console.log(
                "GAME COMPLETED - WAITING FOR OBSERVATION FLOW"
            );

        }
        else {

            // No result window pending.
            // Safe to show final completion.
            handleTableCompleted(data);
            return;

        }
    }


    state.dealerSeat =
        Number(data.dealer_seat);

    state.currentTurnSeat =
        Number(data.current_turn_seat);

    state.deal_no =
        data.deal_no;

    state.declarationEndAt =
        data.declaration_end_at;

    state.observationEndAt =
        data.observation_end_at;


    // ==========================================
    // SOLO / MY TURN - PICK CARD ANIMATION
    // ==========================================

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "SOLO"
    ) {

        const myTurn =
            Number(state.currentTurnSeat) ===
            Number(state.seatNo);

        const computerTurn =
            Number(state.currentTurnSeat) ===
            Number(state.computerSeat);


        // ==========================================
        // COMPUTER TURN
        // STOP MY PICK ANIMATION
        // ==========================================

        if (computerTurn) {

            state.myTurnPickAnimation = false;
            state.myTurnPickDone = false;

            const openVisual =
                document.getElementById("openVisual");

            const stockCard =
                document.getElementById("stockCard");


            if (openVisual) {

                openVisual.classList.remove(
                    "pick-card-pulse"
                );

            }


            if (stockCard) {

                stockCard.classList.remove(
                    "pick-card-pulse"
                );

            }

        }


        // ==========================================
        // MY TURN
        // START PICK ANIMATION
        // ==========================================

        else if (
            myTurn &&
            getTotalCards() === 13 &&
            state.myTurnPickDone === false

        ) {

            // Start only once
            if (!state.myTurnPickAnimation) {

                state.myTurnPickAnimation = true;

                // 📳 Vibrate only once
                startMyTurnVibration();

            }


            // ==========================================
            // APPLY RED PICK ANIMATION
            // ==========================================

            const openVisual =
                document.getElementById("openVisual");

            const stockCard =
                document.getElementById("stockCard");


            if (openVisual) {

                openVisual.classList.add(
                    "pick-card-pulse"
                );

            }


            if (stockCard) {

                stockCard.classList.add(
                    "pick-card-pulse"
                );

            }

        }
    }


    // ------------------------------------------
    // SOLO COMPUTER TURN
    // ------------------------------------------

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "SOLO" &&
        Number(state.currentTurnSeat) ===
        Number(state.computerSeat)
    ) {

        playSoloComputerTurn();

    }


    // ==========================================
    // HANDLE TURN TIMEOUT EVENT
    // ==========================================

    if (
        data.last_event_type === "TURN_TIMEOUT" &&
        data.last_event_user_id === state.userId &&
        data.last_event_time &&
        state.lastHandledTimeoutEvent !==
            data.last_event_time
    ) {

        state.lastHandledTimeoutEvent =
            data.last_event_time;

        await loadGame();

        renderHand();

        updateActionButtons();

    }


    // ==========================================
    // REFRESH MY DYNAMIC SEAT
    // AFTER REJOIN / REBUILD
    // ==========================================

    const {
        data: players,
        error: playersError
    } =
        await supabaseClient.rpc(
            "crdg_get_lobby_players",
            {
                p_table_id: state.tableId
            }
        );


    if (playersError) {

        console.error(playersError);

        return;

    }


    const me =
        players?.find(
            player =>
                Number(player.fixed_seat_no) ===
                Number(state.fixedSeatNo)
        );


    if (me) {

        state.seatNo =
            Number(me.seat_no);

    }


    await loadPlayers(players);


    state.turnStartedAt =
        new Date(
            data.turn_started_at
        ).getTime();

    state.turnEndAt =
        data.turn_end_at;


    // ==========================================
    // COMPLETE CURRENT OPEN PILE
    // ==========================================

    state.openPile =
        data.open_pile || [];


    const topOpenCard =
        data.open_pile?.slice(-1)[0];


    const openEl =
        document.getElementById(
            "openVisual"
        );


    openEl.innerHTML =
        getTableCardHTML(
            topOpenCard || "-"
        );


    openEl.classList.remove(
        "red-card"
    );


    if (
        topOpenCard?.includes("♥") ||
        topOpenCard?.includes("♦")
    ) {

        openEl.classList.add(
            "red-card"
        );

    }


    // ==========================================
    // JOKER CARD
    // ==========================================

    const jokerCard =
        data.joker_card || "-";


    const jokerEl =
        document.getElementById(
            "jokerVisual"
        );


    jokerEl.innerHTML =
        getTableCardHTML(
            jokerCard
        );


    jokerEl.classList.remove(
        "red-card"
    );


    if (
        jokerCard?.includes("♥") ||
        jokerCard?.includes("♦")
    ) {

        jokerEl.classList.add(
            "red-card"
        );

    }


    state.jokerCard =
        data.joker_card;

    state.wildRank =
        data.wild_rank;


    state.declarationMode =
        data.declaration_started || false;


    // ==========================================
    // DECLARATION TIMER
    // ==========================================

    if (
        state.declarationMode &&
        !state.declarationTimerStarted
    ) {

        clearInterval(
            state.turnTimerInterval
        );

        state.turnTimerInterval = null;


        const {
            data: declarationEndAt,
            error: dectmrerror
        } =
            await supabaseClient.rpc(
                "crdg_start_declaration_timer",
                {
                    p_session_id:
                        state.sessionId,

                    p_user_id:
                        state.userId
                }
            );


        if (dectmrerror) {

            console.error(
                "Declaration timer start error:",
                dectmrerror
            );

            return;

        }


        state.declarationEndAt =
            declarationEndAt;

        state.declarationTimerStarted =
            true;


        if (
            state.declarationEndAt &&
            !state.declarationTimerInterval
        ) {

            startDeclarationTimer();

        }

    }


    document.getElementById(
        "stockCard"
    ).innerText =
        data.stock_pile?.length || 0;


    // ==========================================
    // START / SYNC TURN TIMER
    // ==========================================

    if (
        state.playerStatus !== "ELIMINATED" &&
        data.deal_results_ready !== true &&
        !state.resultWindowOpened &&
        !state.declarationMode &&
        state.turnEndAt &&
        (
            state.lastTurnSeat !==
                data.current_turn_seat ||
            !state.turnTimerInterval
        )
    ) {

        state.lastTurnSeat =
            data.current_turn_seat;


        await syncTurnClock();


        startTurnTimer();

    }


    // ==========================================
    // DEAL RESULT / OBSERVATION WINDOW
    // ==========================================

    if (
        data.deal_results_ready === true &&
        !state.resultWindowOpened &&
        state.participatedInDeal === true &&
        !state.ignoreResultWindow
    ) {

        clearInterval(
            state.turnTimerInterval
        );

        state.turnTimerInterval = null;


        document.getElementById(
            "turnTimer"
        ).innerText = "-";


        state.resultWindowOpened =
            true;


        hideBaseTableHand();

        resetSettlementControls();

        loadDealResults();


        await checkSettlementEligibility();


        const {
            data: observationEndAt,
            error: obstmrerror
        } =
            await supabaseClient.rpc(
                "crdg_start_observation_timer",
                {
                    p_session_id:
                        state.sessionId
                }
            );


        if (obstmrerror) {

            console.error(
                obstmrerror
            );

            return;

        }


        state.observationEndAt =
            observationEndAt;


        if (
            state.observationEndAt &&
            !state.observationTimerInterval
        ) {

            startObservationTimer();

        }

    }


    updateActionButtons();

}

function startMyTurnVibration() {
    if (!("vibrate" in navigator)) return;

    navigator.vibrate(300);
}


async function loadAcceptedSettlement()
{
    const { data, error } =
        await supabaseClient
            .from("crdg_settlement")
            .select(`
                player1_user_id,
                player2_user_id,
                player1_percentage,
                player2_percentage,
                player1_score,
                player2_score,
                status
            `)
            .eq(
                "session_id",
                state.sessionId
            )
            .eq(
                "status",
                "ACCEPTED"
            )
            .order(
                "settlement_id",
                {
                    ascending: false
                }
            )
            .limit(1)
            .maybeSingle();

    if (error)
    {
        console.error(
            "Settlement result error:",
            error
        );

        return null;
    }

    return data;
}

function startDeclarationTimer() {

    clearInterval(
        state.declarationTimerInterval
    );

    function updateDeclarationTimer() {

        if (!state.declarationEndAt) {
            document.getElementById(
                "declarationTimer"
            ).innerText = "";
            return;
        }

        const endTime =
            new Date(
                state.declarationEndAt
            ).getTime();

        const seconds =
            Math.max(
                0,
                Math.ceil(
                    (endTime - Date.now()) / 1000
                )
            );

        document.getElementById(
            "declarationTimer"
        ).innerText =
            "Declared..Arrange Cards (" +
            seconds +
            "s)";

        if (seconds <= 0) {

            clearInterval(
                state.declarationTimerInterval
            );

            state.declarationTimerInterval =
                null;

            document.getElementById(
                "declarationTimer"
            ).innerText = "";

            onDeclarationTimerExpired();
        }
    }

    updateDeclarationTimer();

    state.declarationTimerInterval =
        setInterval(
            updateDeclarationTimer,
            250
        );
}

let computerTurnRunning = false;

async function playSoloComputerTurn() {

    if (computerTurnRunning) {
        return;
    }

    if (state.tableCompleted) {
        return;
    }

    if (state.declarationMode) {
        return;
    }

    if (
        Number(state.currentTurnSeat) !==
        Number(state.computerSeat)
    ) {
        return;
    }

    computerTurnRunning = true;


    try {

        // Small delay so the human can see
        // that the turn changed to Computer.
        await new Promise(
            resolve =>
                setTimeout(resolve, 5000)
        );


        const { data, error } =
            await supabaseClient.rpc(
                "crdg_solo_play_computer_turn",
                {
                    p_session_id:
                        state.sessionId,

                    p_table_id:
                        state.tableId
                }
            );


        if (error) {

            console.error(
                "Computer turn error:",
                error
            );

            return;
        }



        // Reload the game/session state.
       // await loadGame();

       // await loadSessionInfo();


    }
    finally {

        computerTurnRunning = false;

    }
}



function ensureDiscardHistoryStyles()
{
    if (document.getElementById("discardHistoryPlayerWiseStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "discardHistoryPlayerWiseStyles";
    style.textContent = `
        .discard-player-row {
            width: 100%;
            display: grid;
            grid-template-columns: 108px minmax(0, 1fr);
            align-items: center;
            column-gap: 10px;
            margin: 0 0 8px;
            text-align: left;
        }

        .discard-player-name {
            margin: 0;
            padding: 0;
            min-width: 0;
            font-size: 14px;
            font-weight: 900;
            color: #111;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .discard-player-strip {
            width: 100%;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .discard-nav-btn {
            flex: 0 0 28px;
            width: 28px;
            height: 52px;
            padding: 0;
            border: none;
            border-radius: 6px;
            background: #333;
            color: #fff;
            font-size: 20px;
            font-weight: 900;
            line-height: 1;
            cursor: pointer;
        }

        .discard-nav-btn:disabled {
            opacity: .28;
            cursor: default;
        }

        .discard-cards-viewport {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
        }

        .discard-cards-line {
            width: max-content;
            min-width: 100%;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 5px;
            min-height: 54px;
        }

        .discard-history-card {
            flex: 0 0 42px;
            width: 42px;
            height: 54px;
            box-sizing: border-box;
            background: #fff;
            border: 1px solid #444;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 900;
            box-shadow: 0 2px 4px rgba(0,0,0,.20);
        }

        .discard-page-label {
            grid-column: 2;
            margin: 1px 0 0;
            font-size: 9px;
            font-weight: 700;
            color: #666;
            text-align: left;
        }

        .discard-history-empty {
            padding: 12px 4px 4px;
            color: #555;
            font-weight: 700;
        }

        /* Hidden navigation still reserves the same space, so all rows align. */
        .discard-nav-btn[style*="display: none"] {
            visibility: hidden;
        }

        #openPileHistoryCards[data-player-count="5"] .discard-player-row,
        #openPileHistoryCards[data-player-count="6"] .discard-player-row {
            margin-bottom: 5px;
            grid-template-columns: 96px minmax(0, 1fr);
        }

        #openPileHistoryCards[data-player-count="5"] .discard-history-card,
        #openPileHistoryCards[data-player-count="6"] .discard-history-card {
            flex-basis: 40px;
            width: 40px;
            height: 50px;
            font-size: 13px;
        }

        #openPileHistoryCards[data-player-count="5"] .discard-nav-btn,
        #openPileHistoryCards[data-player-count="6"] .discard-nav-btn {
            flex-basis: 24px;
            width: 24px;
            height: 48px;
        }

        @media (max-width: 700px) {
            .discard-player-row {
                grid-template-columns: 86px minmax(0, 1fr);
                column-gap: 7px;
                margin-bottom: 6px;
            }

            .discard-player-name {
                font-size: 12px;
            }

            .discard-nav-btn {
                flex-basis: 24px;
                width: 24px;
                height: 48px;
                font-size: 18px;
            }

            .discard-history-card {
                flex-basis: 40px;
                width: 40px;
                height: 50px;
                font-size: 13px;
            }

            #openPileHistoryCards[data-player-count="5"] .discard-player-row,
            #openPileHistoryCards[data-player-count="6"] .discard-player-row {
                grid-template-columns: 78px minmax(0, 1fr);
                column-gap: 6px;
                margin-bottom: 4px;
            }

            #openPileHistoryCards[data-player-count="5"] .discard-history-card,
            #openPileHistoryCards[data-player-count="6"] .discard-history-card {
                flex-basis: 38px;
                width: 38px;
                height: 48px;
                font-size: 12px;
            }

            #openPileHistoryCards[data-player-count="5"] .discard-nav-btn,
            #openPileHistoryCards[data-player-count="6"] .discard-nav-btn {
                flex-basis: 22px;
                width: 22px;
                height: 46px;
                font-size: 17px;
            }
        }
    `;

    document.head.appendChild(style);
}


async function showOpenPileHistory(event)
{
    if (event) {
        event.stopPropagation();
    }

    const popup =
        document.getElementById(
            "openPilePopup"
        );

    const container =
        document.getElementById(
            "openPileHistoryCards"
        );

    if (!popup || !container || !state.sessionId) {
        return;
    }

    ensureDiscardHistoryStyles();

    container.innerHTML = `
        <div class="discard-history-empty">
            Loading discarded cards...
        </div>
    `;

    popup.style.display = "flex";

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_current_deal_discards",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {
        console.error(
            "crdg_get_current_deal_discards ERROR:",
            error
        );

        container.innerHTML = `
            <div class="discard-history-empty">
                Unable to load discarded cards
            </div>
        `;

        return;
    }

    const rows =
        Array.isArray(data) ? data : [];

    if (rows.length === 0) {
        container.innerHTML = `
            <div class="discard-history-empty">
                No discarded cards in this deal
            </div>
        `;
        return;
    }

    const playerMap = new Map();

    rows.forEach(row => {
        if (!playerMap.has(row.user_id)) {
            playerMap.set(
                row.user_id,
                {
                    userId: row.user_id,
                    displayName:
                        row.display_name || "PLAYER",
                    cards: []
                }
            );
        }

        playerMap
            .get(row.user_id)
            .cards
            .push(row.card);
    });

    container.innerHTML = "";
    container.dataset.playerCount = String(playerMap.size);

    // 8 cards per row on normal landscape screens,
    // 6 on smaller screens. Extra cards use navigation.
    const pageSize =
        window.innerWidth <= 700 ? 6 : 8;

    playerMap.forEach(player => {
        const row =
            document.createElement("div");

        row.className =
            "discard-player-row";

        const name =
            document.createElement("div");

        name.className =
            "discard-player-name";

        name.textContent =
            player.displayName;

        row.appendChild(name);

        const strip =
            document.createElement("div");

        strip.className =
            "discard-player-strip";

        const prevBtn =
            document.createElement("button");

        prevBtn.type = "button";
        prevBtn.className =
            "discard-nav-btn";
        prevBtn.textContent = "‹";
        prevBtn.title = "Previous discarded cards";

        const viewport =
            document.createElement("div");

        viewport.className =
            "discard-cards-viewport";

        const cardLine =
            document.createElement("div");

        cardLine.className =
            "discard-cards-line";

        viewport.appendChild(cardLine);

        const nextBtn =
            document.createElement("button");

        nextBtn.type = "button";
        nextBtn.className =
            "discard-nav-btn";
        nextBtn.textContent = "›";
        nextBtn.title = "Next discarded cards";

        strip.appendChild(prevBtn);
        strip.appendChild(viewport);
        strip.appendChild(nextBtn);

        row.appendChild(strip);

        const pageLabel =
            document.createElement("div");

        pageLabel.className =
            "discard-page-label";

        row.appendChild(pageLabel);

        container.appendChild(row);

        let page = 0;
        const pageCount =
            Math.ceil(
                player.cards.length /
                pageSize
            );

        function renderPage()
        {
            const start =
                page * pageSize;

            const visibleCards =
                player.cards.slice(
                    start,
                    start + pageSize
                );

            cardLine.innerHTML = "";

            visibleCards.forEach(card => {
                const cardDiv =
                    document.createElement("div");

                cardDiv.className =
                    "discard-history-card";

                cardDiv.innerText =
                    card;

                if (
                    card &&
                    (
                        card.includes("♥") ||
                        card.includes("♦")
                    )
                ) {
                    cardDiv.style.color = "#e00000";
                }
                else {
                    cardDiv.style.color = "#111111";
                }

                cardLine.appendChild(
                    cardDiv
                );
            });

            const showNavigation =
                pageCount > 1;

            prevBtn.style.display =
                showNavigation ? "flex" : "none";

            nextBtn.style.display =
                showNavigation ? "flex" : "none";

            if (showNavigation) {
                prevBtn.disabled = page <= 0;
                nextBtn.disabled =
                    page >= pageCount - 1;

                pageLabel.textContent =
                    `Page ${page + 1} / ${pageCount}`;
            }
            else {
                pageLabel.textContent = "";
            }
        }

        prevBtn.addEventListener(
            "click",
            function(e) {
                e.stopPropagation();

                if (page > 0) {
                    page--;
                    renderPage();
                }
            }
        );

        nextBtn.addEventListener(
            "click",
            function(e) {
                e.stopPropagation();

                if (page < pageCount - 1) {
                    page++;
                    renderPage();
                }
            }
        );

        renderPage();
    });
}

function closeOpenPileHistory()
{
    const popup =
        document.getElementById(
            "openPilePopup"
        );

    if (popup)
    {
        popup.style.display =
            "none";
    }
}

async function openSettlement() {

    if (!state.settlementEligible) {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_create_settlement_proposal",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {

        console.error(
            "Settlement proposal error:",
            error
        );

        alert(
            "Unable to create settlement proposal."
        );

        return;
    }

    const proposal = data?.[0];

    if (!proposal) {
        return;
    }

    state.settlementId =
        proposal.settlement_id;

    state.settlementOpened = true;

    document.getElementById(
            "settlementPlayers"
        ).innerHTML = `
            <div style="
                display:flex;
                justify-content:space-between;
                padding:10px;
                font-size:18px;
                border-bottom:1px solid #ddd;
            ">
                <b>${proposal.player1_name}</b>

                <span style="
                color:#000000;
                font-weight:bold;
            ">
                ${proposal.player1_percentage}%
            </span>
            </div>

            <div style="
                display:flex;
                justify-content:space-between;
                padding:10px;
                font-size:18px;
            ">
                <b>${proposal.player2_name}</b>

                <span style="
                color:#000000;
                font-weight:bold;
            ">
                ${proposal.player2_percentage}%
            </span>
            </div>
        `;

    document.getElementById(
        "settlementStatus"
    ).innerText = "";

    document.getElementById(
        "settlementPopup"
    ).style.display = "block";
}


function closeSettlementPopup() {

    const popup =
        document.getElementById(
            "settlementPopup"
        );

    if (popup) {
        popup.style.display = "none";
    }

    const status =
        document.getElementById(
            "settlementStatus"
        );

    if (status) {
        status.innerText = "";
    }

    state.settlementOpened = false;
    state.settlementId = null;
    state.settlementEligible = false;
}

async function onDeclarationTimerExpired(){

    hideBaseTableHand();

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_submit_final_groups",
            {
                p_session_id:
                    state.sessionId,

                p_table_id:
                    state.tableId,

                p_user_id:
                    state.userId,

                p_groups:
                    state.groups,

                p_joker_card:
                    state.jokerCard
            }
        );

    if(error){

        console.error(error);

        return;
    }
}

async function respondSettlement(response) {

    if (!state.sessionId || !state.userId) {
        return;
    }

    const acceptBtn =
        document.getElementById(
            "btnSettlementAccept"
        );

    const cancelBtn =
        document.getElementById(
            "btnSettlementCancel"
        );

    // Prevent double-clicks
    acceptBtn.disabled = true;
    cancelBtn.disabled = true;

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdg_respond_settlement",
            {
                p_session_id:
                    state.sessionId,

                p_user_id:
                    state.userId,

                p_response:
                    response
            }
        );

        if (error) {

            console.error(
                "Settlement response error:",
                error
            );

            acceptBtn.disabled = false;
            cancelBtn.disabled = false;

            return;
        }

        const result =
            data?.[0];

        if (!result) {

            acceptBtn.disabled = false;
            cancelBtn.disabled = false;
            return;
        }


        // ------------------------------------------
        // CANCEL
        // ------------------------------------------

        if (
            result.status ===
            "CANCELLED"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Settlement cancelled";

            setTimeout(() => {

                document.getElementById(
                    "settlementPopup"
                ).style.display =
                    "none";

            }, 700);

            return;
        }


        // ------------------------------------------
        // BOTH ACCEPTED
        // ------------------------------------------

        if (
            result.status ===
            "ACCEPTED"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Settlement accepted";

            return;
        }


        // ------------------------------------------
        // ONE PLAYER ACCEPTED
        // ------------------------------------------

        if (
            result.status ===
            "PENDING"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Accepted — waiting for other player";

            // This player has already accepted.
            // Do not allow changing response.
            acceptBtn.disabled = true;
            cancelBtn.disabled = true;
        }

    }
    catch (error) {

        console.error(
            "Settlement unexpected error:",
            error
        );

        acceptBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

function getTotalCards(){

    let total = 0;

    for(let g = 0; g < 6; g++){

        if(state.groups[g]){

            total +=
                state.groups[g].length;
        }
    }

    return total;
}

function updateActionButtons() {

    const btnDiscard =
        document.getElementById("btnDiscard");

    const btnDeclare =
        document.getElementById("btnDeclare");

    const btnDrop =
        document.getElementById("dropBtn");

    const openPile =
        document.getElementById("openVisual");

    const stockPile = document.getElementById("stockCard");


    // --------------------------------------------------
    // Eliminate / dropped / declaration mode
    // --------------------------------------------------

    if (
        state.playerStatus === "ELIMINATED" ||
        state.isDropped ||
        state.declarationMode
    ) {

        if (btnDiscard) {
            btnDiscard.disabled = true;
        }

        if (btnDeclare) {
            btnDeclare.disabled = true;
        }

        if (btnDrop) {
            btnDrop.disabled = true;
        }

        if (openPile) {
            openPile.style.opacity = "0.4";
            openPile.style.pointerEvents = "none";
        }

        if (stockPile) {
            stockPile.style.opacity = "0.4";
            stockPile.style.pointerEvents = "none";
        }

        return;
    }


    // --------------------------------------------------
    // Current turn
    // --------------------------------------------------

    const myTurn =
        Number(state.seatNo) ===
        Number(state.currentTurnSeat);

    const cardCount =
        getTotalCards();

    const canDraw =
        myTurn &&
        cardCount === 13;

    const canDiscard =
        myTurn &&
        cardCount === 14;


    // --------------------------------------------------
    // Discard / Declare
    // --------------------------------------------------

    if (btnDiscard) {
        btnDiscard.disabled =
            !canDiscard;
    }

    if (btnDeclare) {
        btnDeclare.disabled =
            !canDiscard;
    }


    // --------------------------------------------------
    // Drop only before picking
    // --------------------------------------------------

    if (btnDrop) {
        btnDrop.disabled =
            !canDraw;
    }


    // --------------------------------------------------
    // Open / Stock only before picking
    // --------------------------------------------------

    if (openPile) {

        openPile.style.opacity =
            canDraw ? "1" : "0.4";

        openPile.style.pointerEvents =
            canDraw ? "auto" : "none";
    }

    if (stockPile) {

        stockPile.style.opacity =
            canDraw ? "1" : "0.4";

        stockPile.style.pointerEvents =
            canDraw ? "auto" : "none";
    }
}



  


// ==========================================================
// SOLO NEW-DEAL DISTRIBUTION ANIMATION + SOUND
// Cards stay hidden until all flying cards finish (< 1 sec).
// deal.mp3 must be hosted beside solo.html / solo.js.
// ==========================================================
async function prepareDealDistributionAnimation() {
    state.dealAnimationPending = false;
    state.dealAnimationKey = null;

    if (!state.sessionId || !state.userId) return false;

    // Read the authoritative deal number before loading/rendering the hand.
    const { data, error } = await supabaseClient
        .from("crdg_game_sessions")
        .select("deal_no")
        .eq("session_id", state.sessionId)
        .single();

    if (error || !data || data.deal_no == null) {
        if (error) console.warn("Could not prepare Solo deal animation:", error);
        return false;
    }

    state.deal_no = data.deal_no;
    const key = `crdg_solo_deal_animation_${state.sessionId}_${state.userId}_${state.deal_no}`;

    try {
        if (localStorage.getItem(key) === "1") return false;
    } catch (error) {
        // Storage can be unavailable in some WebViews; animation can still run.
    }

    state.dealAnimationKey = key;
    state.dealAnimationPending = true;
    document.body.classList.add("crdg-solo-dealing");
    return true;
}

async function runDealDistributionAnimation() {
    if (!state.dealAnimationPending) return;

    const hand = document.getElementById("my-hand");
    const stock = document.getElementById("stockCard");
    const targets = hand ? Array.from(hand.querySelectorAll(".card")) : [];

    if (!stock || targets.length === 0) {
        document.body.classList.remove("crdg-solo-dealing");
        state.dealAnimationPending = false;
        return;
    }

    const stockRect = stock.getBoundingClientRect();
    const stockCenterX = stockRect.left + stockRect.width / 2;
    const stockCenterY = stockRect.top + stockRect.height / 2;
    const duration = 350;
    const stagger = 35;
    const audioUrl = new URL("deal.mp3", document.baseURI).href;
    const animationPromises = [];

    targets.forEach((target, index) => {
        const targetRect = target.getBoundingClientRect();
        const flyCard = document.createElement("div");
        flyCard.className = "crdg-solo-deal-fly-card";
        flyCard.setAttribute("aria-hidden", "true");
        flyCard.style.left = `${stockCenterX - stockRect.width / 2}px`;
        flyCard.style.top = `${stockCenterY - stockRect.height / 2}px`;
        flyCard.style.width = `${stockRect.width}px`;
        flyCard.style.height = `${stockRect.height}px`;
        document.body.appendChild(flyCard);

        const dx = targetRect.left - (stockCenterX - stockRect.width / 2);
        const dy = targetRect.top - (stockCenterY - stockRect.height / 2);
        const sx = targetRect.width / Math.max(stockRect.width, 1);
        const sy = targetRect.height / Math.max(stockRect.height, 1);

        const animation = flyCard.animate(
            [
                { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.95, offset: 0.88 },
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 }
            ],
            {
                duration,
                delay: index * stagger,
                easing: "cubic-bezier(.22,.75,.25,1)",
                fill: "forwards"
            }
        );

        animationPromises.push(
            animation.finished.catch(() => {}).then(() => flyCard.remove())
        );

        // One short deal sound for each card, staggered with the flight.
        window.setTimeout(() => {
            try {
                const sound = new Audio(audioUrl);
                sound.volume = 0.3;
                sound.play().catch(() => {});
            } catch (_) {}
        }, index * stagger);
    });

    await Promise.all(animationPromises);

    // Synchronize the real hand/group DOM while it is still hidden.
    // This prevents the empty group containers from flashing between
    // the flying-card animation and the final grouped cards.
    renderHand();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    document.body.classList.remove("crdg-solo-dealing");
    state.dealAnimationPending = false;

    try {
        if (state.dealAnimationKey) {
            localStorage.setItem(state.dealAnimationKey, "1");
        }
    } catch (error) {}

    state.dealAnimationKey = null;
}

// =========================
// LOAD STATE

async function loadGame() {

    if(state.tableCompleted)
{
    return;
}

  const { data, error } = await supabaseClient.rpc(
    "crdg_get_game_state",
    {
      p_session_id: state.sessionId,
      p_user_id: state.userId
    }
  );

  if (error) return console.error(error);

  if (!data) return;

  state.hand = data.hand || [];
  
  state.playerStatus = data.player_status;
  state.participatedInDeal =   data.participated_in_deal === true;

  if (state.playerStatus === "ELIMINATED" && !state.eliminatedRefreshStarted)
{
    state.eliminatedRefreshStarted = true;

    setInterval(async () => {

        await loadSessionInfo();
        await loadPlayers();

    }, 1000);
}

    if (
        state.playerStatus === "ELIMINATED" &&
        !state.eliminationScreenShown
    )
    {
        state.eliminationScreenShown = true;
        handleEliminatedPlayer();
    }

// ==========================================
// INITIAL HAND ORDER
// G1-G4 = USER GROUPS
// G5    = UNGROUPED CARDS
// ==========================================

const spades = [];
const hearts = [];
const diamonds = [];
const clubs = [];
const jokers = [];


// ------------------------------------------
// Separate cards by suit
// ------------------------------------------

state.hand.forEach(card => {

    if (card === "JOKER") {

        jokers.push(card);

    }
    else if (card.includes("♥")) {

        hearts.push(card);

    }
    else if (card.includes("♠")) {

        spades.push(card);

    }
    else if (card.includes("♦")) {

        diamonds.push(card);

    }
    else if (card.includes("♣")) {

        clubs.push(card);

    }

});


// ------------------------------------------
// Sort each suit by rank
// A,2,3,4,5,6,7,8,9,10,J,Q,K
// ------------------------------------------

hearts.sort(
    (a, b) => getRank(a) - getRank(b)
);

spades.sort(
    (a, b) => getRank(a) - getRank(b)
);

diamonds.sort(
    (a, b) => getRank(a) - getRank(b)
);

clubs.sort(
    (a, b) => getRank(a) - getRank(b)
);


// ------------------------------------------
// All cards initially go into G5
//
// G1-G4 = empty user groups
// G5    = ungrouped bucket
//
// Order:
// ♥ → ♠ → ♦ → ♣ → JOKER
// ------------------------------------------

const ungroupedCards = [
    ...hearts,
    ...spades,
    ...diamonds,
    ...clubs,
    ...jokers
];

state.groups = [
    [...hearts],      // G1 = Hearts
    [...spades],      // G2 = Spades
    [...diamonds],    // G3 = Diamonds
    [...clubs],       // G4 = Clubs
    [],               // G5 = User-created group
    [...jokers]       // G6 = Printed Jokers / overflow
];
 //document.getElementById("openVisual").innerText = data.open_pile?.slice(-1)[0] || "-";

//document.getElementById("jokerVisual").innerText = data.joker_card || "-";

  //document.getElementById("stockCard").innerText = data.stock_pile?.length || 0;

    // Clear selection belonging to the old hand
state.selectedCards = [];
state.selectedCard = null;
state.dragCard = null;

// Display the refreshed database hand
renderHand();

// Recalculate controls using the refreshed card count
updateActionButtons();

  
}

function getEstimatedTurnServerNow() {

    if (
        state.turnServerNowMs == null ||
        state.turnServerSyncPerfMs == null
    ) {
        return null;
    }

    return (
        state.turnServerNowMs +
        (
            performance.now() -
            state.turnServerSyncPerfMs
        )
    );
}

async function syncTurnClock() {

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_turn_clock",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {
        console.error(
            "crdg_get_turn_clock error:",
            error
        );
        return false;
    }

    if (!data || data.length === 0) {
        return false;
    }

    const row = data[0];

    state.currentTurnSeat =
        Number(row.current_turn_seat);

    state.turnEndAt =
        row.turn_end_at;

    state.turnServerNowMs =
        new Date(
            row.server_now
        ).getTime();

    state.turnServerSyncPerfMs =
        performance.now();

    return true;
}



function handleEliminatedPlayer()
{
    state.myTurn = false;

    clearInterval(state.turnTimerInterval);
    state.turnTimerInterval = null; //MAH

    document.getElementById("dropBtn").disabled = true;
    document.getElementById("btnDeclare").disabled = true;
    document.getElementById("btnDiscard").disabled = true;
}


function getRank(card){

    const rank =
        card.replace(/[♠♥♦♣]/g,'');

    switch(rank){
        case 'A': return 1;
        case 'J': return 11;
        case 'Q': return 12;
        case 'K': return 13;
        default: return parseInt(rank);
    }

}

// =========================
// JOIN TABLE (FIXED)
// =========================
async function joinTable() {

  const tableId = 777777;// document.getElementById("tableIdInput").value;
  const password = '5E2D';//document.getElementById("password").value;
  const nickname = document.getElementById("nickname").value;

  // ✅ THIS IS WHERE IT GOES
  const userId = savedUserId;

  const { data, error } =
            await supabaseClient.rpc(
                "crdg_join_table",
                {
                    p_table_id: parseInt(tableId),
                    p_password: password,
                    p_user_id: userId,
                    p_display_name: nickname
                }
            );

        const joinResult = data?.[0];

        if (error) {
            console.error(error);
            alert("Join failed");
            return;
        }

        if (!joinResult) {
            alert("Join failed");
            return;
        }

        if (
            joinResult.status !== "success" &&
            joinResult.status !== "reconnected"
        ) {
            alert(
                joinResult.message ||
                "Unable to join table"
            );

            return;
        }


        // ------------------------------------------
        // ONLY SUCCESS / RECONNECTED comes below
        // ------------------------------------------

        state.userId =
            joinResult.user_id;

        state.tableId =
            parseInt(tableId);

        state.nickname =
            nickname;

        state.seatNo =
            Number(joinResult.seat_no);

        state.fixedSeatNo =
            Number(joinResult.fixed_seat_no);

        localStorage.setItem(
            "crdg_user_id",
            state.userId
        );

        const isReconnect =
            joinResult.status ===
            "reconnected";

        if (
            isReconnect &&
            joinResult.session_id
        ) {
            state.sessionId =
                Number(joinResult.session_id);

            state.joined = true;

            document.getElementById(
                "joinScreen"
            ).style.display = "none";

            document.getElementById(
                "lobbyScreen"
            ).style.display = "none";

            document.getElementById(
                "app"
            ).style.display = "block";

            await loadGame();
            await loadSessionInfo();
            await loadPlayers();
            renderHand();
            updateActionButtons();
            return;

           // subscribeRealtime();

           // updateActionButtons();

           // return;
        }

        // Otherwise continue existing lobby flow
        state.joined = true;

        // your existing lobby code continues here

  localStorage.setItem("crdg_table", tableId);

  // UI switch → LOBBY
  document.getElementById("joinScreen").classList.add("hidden");
  document.getElementById("lobbyScreen").classList.remove("hidden");

  document.getElementById("lobbyTableId").innerText = tableId;
  document.getElementById("lobbySeat").innerText = state.seatNo;

  alert('Joined Successfully');
  // start lobby polling

  await postJoinFlow();
  loadLobbyState();
  state.lobbyTimerHandle = setInterval(loadLobbyState, 1000);
}


// ==================================================
// SOLO NETWORK / SUPABASE AVAILABILITY MONITOR
// Reuses Solo's existing join/reconnect and game-state functions.
// ==================================================
let refreshInProgress = false;
let networkOffline = false;
let networkMonitorHandle = null;

async function checkSupabaseAvailability() {
    if (!navigator.onLine) return false;

    let timeoutHandle;
    try {
        const controller = new AbortController();
        timeoutHandle = setTimeout(() => controller.abort(), 5000);

        // Any HTTP response means the Supabase endpoint is reachable.
        await fetch(SUPABASE_URL + "/rest/v1/", {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });
        return true;
    } catch (error) {
        console.warn("SOLO SUPABASE AVAILABILITY CHECK FAILED:", error?.message || error);
        return false;
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
}

async function refreshGame() {
    if (refreshInProgress) return false;
    if (!state.sessionId || !state.tableId || !state.userId || state.tableCompleted) return false;

    refreshInProgress = true;
    try {
        // The player is already in this Solo session. Do not call joinTable()
        // here: that function uses the join-screen table/password and can
        // incorrectly report "table not found" after a temporary disconnection.
        await loadGame();
        await loadSessionInfo();
        await loadPlayers();

        if (state.tableCompleted || !state.sessionId) return false;

        renderHand();
        updateActionButtons();

        // If the computer owns the turn, retry its action after reconnect.
        // loadSessionInfo() may have attempted the RPC while the connection
        // was still recovering; this retry prevents the computer turn freezing.
        if (
            typeof GAME_TYPE !== "undefined" &&
            GAME_TYPE === "SOLO" &&
            Number(state.currentTurnSeat) === Number(state.computerSeat)
        ) {
            setTimeout(() => {
                if (!computerTurnRunning && !state.tableCompleted && !state.declarationMode) {
                    playSoloComputerTurn();
                }
            }, 5500);
        }

        // Stop lobby polling once an active game session exists.
        if (state.lobbyTimerHandle) {
            clearInterval(state.lobbyTimerHandle);
            state.lobbyTimerHandle = null;
        }

        return true;
    } catch (error) {
        console.error("SOLO GAME REFRESH ERROR:", error);
        return false;
    } finally {
        refreshInProgress = false;
    }
}

async function checkNetworkAndReconnect() {
    if (refreshInProgress || state.tableCompleted || !state.sessionId || !state.userId) return;

    const available = await checkSupabaseAvailability();
    if (!available) {
        if (!networkOffline) console.warn("SOLO NETWORK OFFLINE: waiting for connection...");
        networkOffline = true;
        return;
    }

    if (networkOffline) {
        const refreshed = await refreshGame();
        if (refreshed) {
            networkOffline = false;
            console.log("SOLO NETWORK RESTORED: game state refreshed.");
        } else {
            // Keep offline flag set so the next check retries.
            networkOffline = true;
            console.warn("SOLO NETWORK RESTORE REFRESH FAILED; will retry.");
        }
    }
}

function startNetworkMonitor() {
    if (networkMonitorHandle) return;
    checkNetworkAndReconnect();
    networkMonitorHandle = setInterval(checkNetworkAndReconnect, 7000);
}

function startTurnTimer() {
 
    if (
        state.tableCompleted ||
        state.resultWindowOpened ||
        state.declarationMode
    ) {
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;

        document.getElementById(
            "turnTimer"
        ).innerText = "-";

        return;
    }

    clearInterval(
        state.turnTimerInterval
    );
    state.turnTimerInterval = null; //MAH

    function updateTurnTimer() {

        if (!state.turnEndAt) {
            return;
        }

        const serverNow =
            getEstimatedTurnServerNow();

        if (serverNow == null) {
            return;
        }

        const endTime =
            new Date(
                state.turnEndAt
            ).getTime();

        const remaining =
            Math.max(
                0,
                Math.ceil(
                    (
                        endTime -
                        serverNow
                    ) / 1000
                )
            );

        document.getElementById(
            "turnTimer"
        ).innerText =
            remaining;

        playTurnWarningAtTenSeconds(remaining);

        if (remaining <= 0) {

            clearInterval(
                state.turnTimerInterval
            );

            state.turnTimerInterval = null;

            processTurnTimeout();

            return;
        }
    }

    updateTurnTimer();

    state.turnTimerInterval =
        setInterval(
            updateTurnTimer,
            250
        );
}


async function refreshTurnAfterTimeout() {

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select(
                "current_turn_seat, turn_started_at, turn_end_at"
            )
            .eq(
                "session_id",
                state.sessionId
            )
            .single();

    if (error) {

        console.error(
            "refreshTurnAfterTimeout error:",
            error
        );

        return;
    }

    // Authoritative DB values
    state.currentTurnSeat =
        Number(data.current_turn_seat);

    state.turnStartedAt =
        data.turn_started_at
            ? new Date(
                data.turn_started_at
              ).getTime()
            : null;

    state.turnEndAt =
        data.turn_end_at;

    // Stop whatever old timer is still present
    clearInterval(
        state.turnTimerInterval
    );

    state.turnTimerInterval = null;

    // Enable/disable controls for new turn
    updateActionButtons();
}

async function processTurnTimeout() {

    if (!state.sessionId) {
        return;
    }

    if (!state.turnEndAt) {
        return;
    }

    // Already requested processing for this exact turn
    if (
        state.lastProcessedTurnEndAt ===
        state.turnEndAt
    ) {
        return;
    }

    // Mark BEFORE RPC to prevent duplicate calls
    state.lastProcessedTurnEndAt =
        state.turnEndAt;

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdg_process_turn_timeout",
            {
                p_session_id: state.sessionId
            }
        );

        if (error) {

            console.error(
                "Turn timeout RPC error:",
                error
            );

            // Allow retry if RPC genuinely failed
            state.lastProcessedTurnEndAt = null;

            return;
        }

        /*
        IMPORTANT:

        DO NOT:
        - change currentTurnSeat here
        - call loadGame()
        - call loadSessionInfo()
        - call updateActionButtons()
        - remove cards locally

        The SP updates the DB.
        Realtime handles everything normally.
        */

       await refreshTurnAfterTimeout();

    }
    catch (error) {

        console.error(
            "Turn timeout unexpected error:",
            error
        );

        state.lastProcessedTurnEndAt = null;
    }
}

async function loadPlayers(playersData = null) {

    let dlr_name = "YOU";

    let players = playersData;

    if (!players) {
        const { data, error } =
            await supabaseClient.rpc(
                "crdg_get_lobby_players",
                {
                    p_table_id: state.tableId
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        players = data;
    }

    if (!players) return;

    for (let i = 1; i <= 5; i++) {

        document.getElementById(
            "opp" + i
        ).innerHTML = `
            <div>Empty</div>
        `;
    }

    state.myScore = 0;

    players.forEach(player => {

        if (
            Number(player.fixed_seat_no) === Number(state.fixedSeatNo)
        ) {
            state.myScore = player.points || 0;
            return;
        }

        let relative =
            Number(player.fixed_seat_no) -
            Number(state.fixedSeatNo);

        if (relative < 0) {
            relative += 6;
        }

        let target = null;

        switch (relative) {

            case 1:
                target = "opp4";
                break;

            case 2:
                target = "opp2";
                break;

            case 3:
                target = "opp1";
                break;

            case 4:
                target = "opp3";
                break;

            case 5:
                target = "opp5";
                break;
        }

        if (!target) return;

        let icons = "";
        
        

        if (
            Number(player.seat_no) ===
            Number(state.dealerSeat)
        ) {
            icons += " 🎲";
            dlr_name = player.display_name;
        }

        // Show rejoin icon
        if (Number(player.rejoin_count) > 0) {
            icons += ` ↺${player.rejoin_count}`;
        }

        let cardsDisplay = `
        <div style="font-size:24px;">
            🂠🂠🂠🂠🂠
        </div>
        `;

        if(player.is_out_of_deal)
        {
            
            let txt = "";

            switch(player.drop_type)
            {
                case "DROP":
                    txt = "❌ DROP";
                    break;

                case "MID_DROP":
                    txt = "⛔ MID DROP";
                    break;

                case "INVALID_DECLARE":
                    txt = "🚫 INVALID";
                    break;

                default:
                    txt = "wait";
            }

            cardsDisplay = `
            <div
                style="
                    color:#d32f2f;
                    font-weight:bold;
                    font-size:18px;
                    margin-top:8px;
                ">
                ${txt}
            </div>
            `;
        }

        
        let statusHtml = "";

        if(player.player_status === "ELIMINATED")
        {
            statusHtml = `
            <div style="
                color:red;
                font-weight:bold;
                margin-top:4px;
            ">
                ELIMINATED
            </div>
            `;
        }

        document.getElementById(target).innerHTML = `
        <div>
            <b>${player.display_name}${icons}</b>
        </div>

        ${cardsDisplay}

        <div>
            Score : ${player.points || 0}
        </div>
        ${statusHtml}
        `;
    });
    document.getElementById("dealerName").textContent = dlr_name;
    let myIcons = "";

    if (
        Number(state.seatNo) ===
        Number(state.dealerSeat)
    ) {
        myIcons += " 🎲";
    }

    document.getElementById(
        "myInfo"
    ).innerHTML =
        `You ${myIcons}`;


        let myScoreHtml =
            `Score : ${state.myScore || 0}`;

        if(state.playerStatus === "ELIMINATED")
        {
            myScoreHtml +=
                `<br><span style="color:red;font-weight:bold">
                    ELIMINATED
                </span>`;
        }

        document.getElementById("myScore").innerHTML =
            myScoreHtml;

            
    const turnPlayer =
        players.find(
            p =>
                Number(p.seat_no) ===
                Number(state.currentTurnSeat)
        );


    if(turnPlayer)
    {
        document.getElementById(
            "currentTurnPlayer"
        ).innerText =
            turnPlayer.display_name;
    }
    else
    {
        document.getElementById(
            "currentTurnPlayer"
        ).innerText =
            "-";
    }
}


async function loadLobbyState() {

  // Do not keep querying the lobby once a game session is active.
  if (state.sessionId || state.tableCompleted) {
    if (state.lobbyTimerHandle) {
      clearInterval(state.lobbyTimerHandle);
      state.lobbyTimerHandle = null;
    }
    return;
  }

  try {
  const { data, error } =
    await supabaseClient.rpc(
      "crdg_get_table_state",
      {
        p_table_id: state.tableId
      }
    );

  if(error){
    console.error(error);
    return;
  }

  if(!data || !data.length){
    return;
  }

  const s = data[0];

  document.getElementById("lobbyPlayers").innerText =    s.player_count;

 // document.getElementById("lobbyTimer").innerText =    s.seconds_remaining;

  const now = new Date().getTime();
  const start = new Date(s.lobby_started_at).getTime();

  const diff = Math.floor((now - start) / 1000);
  const remaining = 60 - diff;

document.getElementById("lobbyTimer").innerText =  remaining > 0 ? remaining : 0;


const { data: players } =
await supabaseClient.rpc(
    "crdg_get_lobby_players",
    {
        p_table_id: state.tableId
    }
);

for(let i = 1; i <= 6; i++) {

  document.getElementById(
    "seat" + i
  ).innerText =
    `Seat ${i} : Empty`;

}


players.forEach(p => {

  document.getElementById(
    "seat" + p.seat_no
  ).innerText =
    `Seat ${p.seat_no} : ${p.display_name}`;

});



  if (
  !gameStarting &&
  state.seatNo === 1 &&
  s.player_count >= 2 &&
  s.seconds_remaining <= 0 &&
  s.status === "waiting"
){
    gameStarting = true;
    await startGame();
}

  if(s.status === "running"){

    const { data: sessions } =
    await supabaseClient
      .from("crdg_game_sessions")
      .select("session_id")
      .eq("table_id", state.tableId)
      .order("session_id", { ascending: false })
      .limit(1);

    if(sessions && sessions.length){

        state.sessionId =
          sessions[0].session_id;

        await enterGame();
    }
}
  } catch (error) {
    console.error("Solo lobby state request failed:", error);
  }
}



async function enterGame(){

  if (gameEntered) return;
   gameEntered = true;

  clearInterval(state.lobbyTimerHandle);

  document
    .getElementById("lobbyScreen")
    .classList.add("hidden");

  document
    .getElementById("app")
    .classList.remove("hidden");

  document
    .getElementById("tableIdDisplay")
    .innerText = state.tableId;

    await prepareDealDistributionAnimation();
    await loadGame();
   
    await loadSessionInfo();

    await loadPlayers();
    renderHand();
    await runDealDistributionAnimation();
    calculateDealScore();

    subscribeRealtime();

}



async function startGame(){

  const { data, error } =
    await supabaseClient.rpc(
      "crdg_start_game",
      {
        
        p_table_id: state.tableId,
        p_user_id: state.userId
      }
    );

  if(error){
    console.error(error);
    return;
  }

  if(data && data.length){

      state.sessionId =
        data[0].session_id;

      await enterGame();
  }
}




async function declareGame() {

  if(state.declarationMode){

    return;
   }


   

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 14) {
        alert("Please pick a card before declaring.");
        return;
    }

    if (!state.selectedCards || state.selectedCards.length !== 1) {
        alert("Please select exactly one card to declare");
        return;
    }

    const selected = state.selectedCards[0];

    state.selectedCard = selected;

    // existing declaration code...




    const totalCards =
        state.groups.reduce(
            (a, g) => a + g.length,
            0
        );

    if(totalCards !== 14){

        alert(
            "You must have 14 cards to declare"
        );

        return;
    }

    if(!state.selectedCard){

        alert(
            "Select one card before declaration"
        );

        return;
    }

    if(!confirm( "Confirm Declaration?" )){
        return;
    }

    const declareCard =  state.selectedCard.card;

    // Create copy of groups

      const groupsForDeclaration =
          JSON.parse(
              JSON.stringify(state.groups)
          );

      // Remove selected card

      groupsForDeclaration[
          state.selectedCard.group
      ].splice(
          state.selectedCard.index,
          1
      );

          
        const { data, error } =
        await supabaseClient.rpc(
            "crdg_calculate_running_score",
            {
                p_groups: groupsForDeclaration,
                p_joker_card: state.jokerCard
            }
        );

    if(error){

        console.error(error);

        return;
    }

    const declarationScore = Number(data || 0);
    const declarationStatus =  data?.[0]?.status;

    //const declarationScore =  0;

    if(declarationScore === 0){

            const declareCard = state.selectedCard.card;

            const { data, error } =
                await supabaseClient.rpc(
                    "crdg_submit_declaration",
                    {
                        p_session_id: state.sessionId,
                        p_table_id: state.tableId,
                        p_user_id: state.userId,
                        p_declare_card: declareCard,
                        p_groups: groupsForDeclaration,
                        p_joker_card: state.jokerCard
                    }
                );

            if(data?.[0]?.status === "valid")
            {
            // NOW remove from actual UI

            state.groups[
                state.selectedCard.group
            ].splice(
                state.selectedCard.index,
                1
            );

            state.selectedCards = [];
            state.selectedCard = null;

            renderHand();

            calculateDealScore();
        }

            if(error){

                console.error(error);

                return;
            }


      }
      else{

         alert("OOPS...! INVALID DECLARATION");


        state.isInvalidDeclaration = true;
        state.isDropped = true;
        state.dropType = "INVALID_DECLARE";
        const declareCard = state.selectedCard.card;

        const { data, error } =
            await supabaseClient.rpc(
                "crdg_submit_declaration",
                {
                    p_session_id: state.sessionId,
                    p_table_id: state.tableId,
                    p_user_id: state.userId,
                    p_declare_card: declareCard,
                    p_groups: groupsForDeclaration,
                    p_joker_card: state.jokerCard
                }
            );

            renderHand();

        if(error){
            console.error(error);
            return;
        }
    }


}



async function calculateDealScore() {

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_calculate_running_score",
            {
                p_groups: state.groups,
                p_joker_card: state.jokerCard
            }
        );

    if (error) {

        console.error(error);

        return;
    }

    document.getElementById("dealScore").innerText =
        "Deal Score : " + (data || 0);
}

function getCardValue(card) {

    if (!card) return 0;

    if (card === "JOKER") {
        return 0;
    }

    let rank =
        card.replace(/[♠♥♦♣]/g, "");

    if (
        rank === "A" ||
        rank === "J" ||
        rank === "Q" ||
        rank === "K"
    ) {
        return 10;
    }

    return parseInt(rank) || 0;
}

async function checkSettlementEligibility() {

    if (!state.sessionId) {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_check_settlement_eligibility",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {
        console.error(
            "Settlement eligibility error:",
            error
        );
        return;
    }

    const result = data?.[0];

    state.settlementEligible =
        result?.eligible === true;

    const btn =
        document.getElementById(
            "btnSettlement"
        );

    if (!btn) {
        return;
    }

    btn.style.display =
        state.settlementEligible
            ? "inline-block"
            : "none";
}


async function loadDealResults()
{
    if(state.resultWindowLoaded)
    {
        return;
    }

    state.resultWindowLoaded = true;

    observationTimeRemaining = 30;

    document.getElementById(
        "observationTimer"
    ).innerText = 30;


    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_deal_results",
            {
                p_session_id: state.sessionId
            }
        );


    if(error)
    {
        console.error(error);
        return;
    }


    document.getElementById(
        "resultJokerCard"
    ).innerHTML =
    `
    <span class="result-joker">
        Joker : ${state.jokerCard}
    </span>
    `;


    const container =
        document.getElementById(
            "dealResultsContainer"
        );


    container.innerHTML = "";


    container.innerHTML =
    `
        <div class="result-scroll">

        <table class="result-table">

            <thead>
                <tr>
                    <th>Player</th>
                    <th>Cards</th>
                    <th>Score</th>
                    <th>Total</th>
                    <th>Status</th>
                </tr>
            </thead>

            <tbody id="resultTableBody">
            </tbody>

        </table>

        </div>
    `;


    const tbody =
        document.getElementById(
            "resultTableBody"
        );


    data.forEach(row => {

        let showCards = true;


        if(
            row.drop_type === "DROP" ||
            row.drop_type === "MID_DROP" ||
            row.drop_type === "INVALID_DECLARE" ||
            row.player_status === "ELIMINATED"
        )
        {
            showCards = false;
        }


        let html = "";


        const usedCards = [];


        let displayedCardCount = 0;


        const MAX_RESULT_CARDS = 13;


        /* ==========================================
           PREPARE DISPLAY GROUPS

           IMPORTANT:
           grouped_hand now already contains the
           exact correct groups from database.

           For computer declaration, the exact AI
           declaration groups are saved and loaded
           into the final snapshot.

           NO suit-wise rearrangement needed.
        ========================================== */

        const displayGroups =
            row.grouped_hand;


        /* ==========================================
           SHOW GROUPED CARDS
        ========================================== */

        if(
            showCards &&
            displayGroups &&
            displayGroups.length > 0
        )
        {

            displayGroups.forEach(group => {

                if(
                    displayedCardCount >= MAX_RESULT_CARDS
                )
                {
                    return;
                }


                let groupHtml = "";


                group.forEach(card => {

                    if(
                        displayedCardCount >= MAX_RESULT_CARDS
                    )
                    {
                        return;
                    }


                    usedCards.push(card);


                    displayedCardCount++;


                    let cardClass =
                        "result-card";


                    if(
                        card.includes("♥") ||
                        card.includes("♦")
                    )
                    {
                        cardClass += " red-card";
                    }


                    if(
                        isJokerCard(card)
                    )
                    {
                        cardClass += " joker-highlight";
                    }


                    groupHtml +=
                    `
                        <div class="${cardClass}">
                            ${card}
                        </div>
                    `;

                });


                if(groupHtml !== "")
                {
                    html +=
                    `
                        <div class="result-card-group">
                            ${groupHtml}
                        </div>
                    `;
                }

            });

        }


        /* ==========================================
           FIND UNGROUPED CARDS

           Handles duplicate physical cards correctly.
        ========================================== */

        const remainingCards = [];


        if(
            showCards &&
            row.original_hand &&
            row.original_hand.length > 0
        )
        {

            const originalCardCount =
                row.original_hand.length;


            const groupedCardCount =
                usedCards.length;


            /*
               If grouped cards already contain all
               original cards, nothing remains.
            */

            if(
                groupedCardCount < originalCardCount
            )
            {

                const groupedCopy =
                    [...usedCards];


                row.original_hand.forEach(card => {

                    const index =
                        groupedCopy.indexOf(card);


                    if(index >= 0)
                    {

                        /*
                           Remove only ONE occurrence.

                           Important for two-deck rummy
                           where identical card values
                           can physically occur twice.
                        */

                        groupedCopy.splice(
                            index,
                            1
                        );

                    }
                    else
                    {

                        remainingCards.push(card);

                    }

                });

            }

        }


        /* ==========================================
           SHOW UNGROUPED CARDS AS FINAL GROUP
        ========================================== */

        if(
            remainingCards.length > 0
        )
        {

            html +=
            `
                <div class="result-card-group ungrouped-group">
            `;


            remainingCards.forEach(card => {

                if(
                    displayedCardCount >= MAX_RESULT_CARDS
                )
                {
                    return;
                }


                displayedCardCount++;


                let cardClass =
                    "result-card ungrouped-card";


                if(
                    card.includes("♥") ||
                    card.includes("♦")
                )
                {
                    cardClass += " red-card";
                }


                if(
                    isJokerCard(card)
                )
                {
                    cardClass += " joker-highlight";
                }


                html +=
                `
                    <div class="${cardClass}">
                        ${card}
                    </div>
                `;

            });


            html +=
                `</div>`;

        }


        /* ==========================================
           NO GROUPING CASE
        ========================================== */

        if(
            showCards &&
            (
                !displayGroups ||
                displayGroups.length === 0
            ) &&
            row.original_hand &&
            remainingCards.length === 0
        )
        {

            html +=
                `<div class="result-card-group">`;


            row.original_hand.forEach(card => {

                if(
                    displayedCardCount >= MAX_RESULT_CARDS
                )
                {
                    return;
                }


                displayedCardCount++;


                let cardClass =
                    "result-card";


                if(
                    card.includes("♥") ||
                    card.includes("♦")
                )
                {
                    cardClass += " red-card";
                }


                if(
                    isJokerCard(card)
                )
                {
                    cardClass += " joker-highlight";
                }


                html +=
                `
                    <div class="${cardClass}">
                        ${card}
                    </div>
                `;

            });


            html +=
                `</div>`;

        }


        /* ==========================================
           ADD RESULT ROW
        ========================================== */

        tbody.innerHTML +=
        `
            <tr>

                <td>
                    ${row.display_name}
                </td>


                <td>
                    ${
                        showCards &&
                        (
                            displayGroups ||
                            row.original_hand
                        )
                        ? html
                        :
                        (
                            row.drop_type === "DROP"
                                ? "❌ DROP"

                            : row.drop_type === "MID_DROP"
                                ? "⛔ MID DROP"

                            : row.drop_type === "INVALID_DECLARE"
                                ? "🚫 INVALID DECLARE"

                            : "-"
                        )
                    }
                </td>


                <td style="text-align:center">
                    ${row.current_deal_score}
                </td>


                <td style="text-align:center">
                    ${row.points}
                </td>


                <td style="text-align:center;font-weight:bold;">
                    ${
                        row.player_status === "PLAYING"
                            ? ""
                            : row.player_status
                    }
                </td>

            </tr>
        `;

    });


    /* ==========================================
       CHECK REJOIN PLAYERS
    ========================================== */

    const rejoinPlayers =
        await loadRejoinCandidates();


    if(
        rejoinPlayers.length > 0
    )
    {

        const me =
            rejoinPlayers.find(
                p =>
                    p.user_id === state.userId
            );


        if(me)
        {
            showReJoinWindow(me);
        }

    }


    /* ==========================================
       SHOW OBSERVATION WINDOW
    ========================================== */

    document.getElementById(
        "dealResultModal"
    ).style.display = "block";

}



function isJokerCard(card) {

    // Printed Joker
    if (card === "JOKER") {
        return true;
    }

    if (!state.wildRank) {
        return false;
    }

    const cardRank =
        card.replace(
            /[♠♥♦♣]/g,
            ""
        );

    return cardRank === state.wildRank;
}

function showReJoinWindow(player)
{

    const container =
        document.getElementById(
            "dealResultsContainer"
        );

    container.insertAdjacentHTML(
        "beforeend",
        `
        <div
            id="rejoinPanel"
            style="
                margin-top:20px;
                padding:15px;
                border:2px solid orange;
                border-radius:8px;
                text-align:center;
                background:#fff8e1;
            ">

            <h3>
                ReJoin Available
            </h3>

            <div>
                <b>${player.display_name}</b>
            </div>

            <br>
            
            <p
            style="
            color:#000;
            font-weight:bold;
            ">
            You can Join Again
            <br>
            Would you like to ReJoin this table?
            </p>

            <br>

            <button id="btnReJoin">
                ReJoin
            </button>

            &nbsp;&nbsp;

            <button id="btnCancelReJoin">
                Cancel
            </button>

        </div>
        `
    );

    document.getElementById('btnReJoin').onclick = async function () {

        // prevent double click
        this.disabled = true;

        // 1. restore player score/status
        const r1 = await supabaseClient.rpc(
            'crdg_rejoin_player',
            {
                p_session_id: state.sessionId,
                p_user_id: state.userId
            }
        );

        if (r1.error) {
            console.error(r1.error);
            this.disabled = false;
            return;
        }

        // 2. add player to rejoin queue
        const r2 = await supabaseClient
            .from('crdg_rejoin_queue')
            .upsert({
                session_id: state.sessionId,
                user_id: state.userId
            });

        if (r2.error) {
            console.error(r2.error);
            this.disabled = false;
            return;
        }

        // 3. UI feedback
        document.getElementById('btnReJoin').innerText = 'ReJoined';
        document.getElementById('btnReJoin').style.background = '#2e7d32';

       

    };

}


async function loadRejoinCandidates()
{

    const 
    {
        data: rejoinData,
        error: rejoinError

    } = await supabaseClient.rpc(
        "crdg_get_rejoin_candidates",
        {
            p_session_id: state.sessionId
        }
    );



    if(rejoinError)
    {
        console.error(
            "Rejoin candidates error",
            rejoinError
        );

        return [];
    }


    return rejoinData || [];

}

function clearCurrentDealUI()
{
    state.groups = [];

    renderHand();

    document.getElementById(
        "openVisual"
    ).innerText = "-";

    document.getElementById("jokerVisual").innerText = "-";
    
    document.getElementById(
        "stockCard"
    ).innerText = "";

    document.getElementById(
        "currentTurnPlayer"
    ).innerText = "-";
}

async function loadRegisteredSoloPlayer() {
  const nicknameElement = document.getElementById("nickname");
  const joinButton = document.getElementById("joinGameBtn");
  const statusElement = document.getElementById("accountJoinStatus");

  const sessionToken = localStorage.getItem("crdgn_session_token");

  if (!sessionToken) {
    if (nicknameElement) nicknameElement.value = "LOGIN REQUIRED";
    if (statusElement) {
      statusElement.textContent = "Please login to continue.";
      statusElement.classList.add("error");
    }
    if (joinButton) joinButton.disabled = true;
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "crdgn_get_profile",
    {
      p_session_token: sessionToken
    }
  );

  const profile = Array.isArray(data) ? data[0] : data;

  if (error || !profile || !profile.name) {
    console.error("Unable to load registered account profile:", error || profile);

    if (nicknameElement) nicknameElement.value = "LOGIN REQUIRED";
    if (statusElement) {
      statusElement.textContent = "Your login session is invalid. Please login again.";
      statusElement.classList.add("error");
    }
    if (joinButton) joinButton.disabled = true;
    return;
  }

  const displayName = String(profile.name).trim().toUpperCase();

  if (nicknameElement) nicknameElement.value = displayName;

  if (statusElement) {
    statusElement.textContent = "Account ready • Tap JOIN GAME";
    statusElement.classList.add("ready");
  }

  if (joinButton) joinButton.disabled = false;
}

window.onload = async () => {

  const savedTable = localStorage.getItem("crdg_table");
  const savedUser = localStorage.getItem("crdg_user_id");

  // only restore minimal state, DO NOT ENTER GAME
  if (savedTable && savedUser) {
    state.tableId = parseInt(savedTable);
    state.userId = savedUser;
  }

  // ALWAYS show login screen first
  document.getElementById("joinScreen").classList.remove("hidden");
  document.getElementById("lobbyScreen").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");

  await loadRegisteredSoloPlayer();
};




async function postJoinFlow() {

  const { data } = await supabaseClient.rpc(
    "crdg_get_table_state",
    {
      p_table_id: state.tableId
    }
  );

  const s = data?.[0];
  if (!s) return;

  // WAITING → LOBBY
  if (s.status === "waiting") {

    document.getElementById("joinScreen").classList.add("hidden");
    document.getElementById("lobbyScreen").classList.remove("hidden");

    loadLobbyState();
    state.lobbyTimerHandle = setInterval(loadLobbyState, 1000);
  }

  // STARTED → GAME
  if (s.status === "started") {
    await enterGame();
  }
}

async function startSoloGame  () {

    // Prevent double-click / duplicate entry deduction.
    if (soloEntryInProgress) {
        return;
    }

    soloEntryInProgress = true;

    const nicknameElement =
        document.getElementById("nickname");

    const nickname =
        nicknameElement?.value?.trim();

    if (!nickname) {
        alert("Please enter your nickname.");
        soloEntryInProgress = false;
        return;
    }

    // --------------------------------------------------
    // REGISTERED ACCOUNT -> EXISTING RUMMY GAME USER ID
    // --------------------------------------------------
    // Do NOT generate a new game UUID here.
    // Get the stable game_user_id mapped to the
    // currently logged-in crdgn account.
    // --------------------------------------------------

    const sessionToken =
        localStorage.getItem("crdgn_session_token");

    if (!sessionToken) {
        alert("Your login session is not available. Please login again.");
        soloEntryInProgress = false;
        window.location.replace("index.html");
        return;
    }

    const {
        data: gameUserData,
        error: gameUserError
    } = await supabaseClient.rpc(
        "crdgn_get_or_create_game_user_id",
        {
            p_session_token: sessionToken,
            p_game_type: "SOLO"
        }
    );

    if (gameUserError) {
        console.error(
            "Game user ID lookup failed:",
            gameUserError
        );

        alert(
            gameUserError.message ||
            "Unable to prepare your Solo game account."
        );

        soloEntryInProgress = false;
        return;
    }

    const gameUserResult =
        Array.isArray(gameUserData)
            ? gameUserData[0]
            : gameUserData;

    if (
        !gameUserResult ||
        gameUserResult.success !== true ||
        !gameUserResult.game_user_id
    ) {
        console.error(
            "Invalid game user result:",
            gameUserResult
        );

        alert(
            gameUserResult?.message ||
            "Unable to prepare your Solo game account."
        );

        soloEntryInProgress = false;
        return;
    }

    // --------------------------------------------------
    // RUMMY SOLO ENTRY - 80 CHIPS
    // --------------------------------------------------
    // Deduct the entry fee from the registered account
    // BEFORE creating the existing crdg_ game.
    // The DB function performs the balance check and
    // transaction atomically.
    // --------------------------------------------------

    const entryReference =
        "SOLO_ENTRY:" + crypto.randomUUID();

    const {
        data: entryData,
        error: entryError
    } = await supabaseClient.rpc(
        "crdgn_rummy_entry",
        {
            p_session_token: sessionToken,
            p_reference_id: entryReference
        }
    );

    if (entryError) {
        console.error(
            "Solo Rummy entry failed:",
            entryError
        );

        alert(
            entryError.message ||
            "Unable to start Solo Rummy."
        );

        soloEntryInProgress = false;
        return;
    }

    const entryResult =
        Array.isArray(entryData)
            ? entryData[0]
            : entryData;

    if (
        !entryResult ||
        entryResult.success !== true
    ) {
        console.error(
            "Solo Rummy entry rejected:",
            entryResult
        );

        alert(
            entryResult?.message ||
            "Unable to start Solo Rummy."
        );

        soloEntryInProgress = false;
        return;
    }

    // Keep the latest registered-account balance available
    // to the current page if the UI uses it later.
    if (entryResult.balance !== undefined) {
        localStorage.setItem(
            "crdgn_balance",
            String(entryResult.balance)
        );
    }

    const userId =
        gameUserResult.game_user_id;

    // Keep the existing crdg_ game flow compatible.
    localStorage.setItem(
        "crdg_user_id",
        userId
    );

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_create_solo_game",
            {
                p_user_id: userId,
                p_display_name: nickname
            }
        );

    if (error) {
        console.error(
            "Solo game creation failed:",
            error
        );

        alert(
            error.message ||
            "Unable to create Solo game."
        );

        return;
    }

    const result = data?.[0];

    if (!result) {
        alert("Unable to create Solo game.");
        return;
    }

    if (result.status !== "success") {
        alert(
            result.message ||
            "Unable to create Solo game."
        );

        return;
    }

    // -----------------------------------------
    // SAVE SOLO STATE
    // -----------------------------------------

    state.userId = userId;

    state.tableId =
        Number(result.table_id);

    state.nickname =
        nickname;

    state.seatNo =
        Number(result.human_seat);

    state.fixedSeatNo =
        Number(result.human_seat);

    state.computerSeat =
        Number(result.computer_seat);

    state.sessionId = null;

    state.joined = true;


    localStorage.setItem(
        "crdg_user_id",
        state.userId
    );

    localStorage.setItem(
        "crdg_table",
        state.tableId
    );


    


    // -----------------------------------------
    // SHOW EXISTING LOBBY
    // -----------------------------------------

    document
        .getElementById("joinScreen")
        .classList
        .add("hidden");

    document
        .getElementById("lobbyScreen")
        .classList
        .remove("hidden");


    const lobbyTableId =
        document.getElementById(
            "lobbyTableId"
        );

    if (lobbyTableId) {
        lobbyTableId.innerText =
            state.tableId;
    }


    const lobbySeat =
        document.getElementById(
            "lobbySeat"
        );

    if (lobbySeat) {
        lobbySeat.innerText =
            state.seatNo;
    }


    // -----------------------------------------
    // EXISTING LOBBY FLOW
    // -----------------------------------------

    await postJoinFlow();

    await loadLobbyState();


    if (state.lobbyTimerHandle) {

        clearInterval(
            state.lobbyTimerHandle
        );

    }


    state.lobbyTimerHandle =
        setInterval(
            loadLobbyState,
            1000
        );







        // -----------------------------------------
// SOLO GAME STARTED DIRECTLY
// Run this fallback only if postJoinFlow/loadLobbyState has not
// already entered the game. Otherwise the deal animation plays twice.
// -----------------------------------------

if (!gameEntered) {
    gameEntered = true;

document
    .getElementById("joinScreen")
    .classList
    .add("hidden");

document
    .getElementById("lobbyScreen")
    .classList
    .add("hidden");

document
    .getElementById("app")
    .classList
    .remove("hidden");


// -----------------------------------------
// LOAD THE STARTED GAME
// -----------------------------------------

await prepareDealDistributionAnimation();
await loadGame();

await loadSessionInfo();

await loadPlayers();
renderHand();
await runDealDistributionAnimation();


// -----------------------------------------
// START REALTIME
// -----------------------------------------

subscribeRealtime();

} // End direct-start fallback; enterGame() already handled it if entered earlier.

// Automatically reconnect Solo after network/Supabase connectivity returns.
startNetworkMonitor();

// -----------------------------------------
// UPDATE BUTTONS / TURN
// -----------------------------------------

updateActionButtons();

};