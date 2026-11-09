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


// =====================================================
// TABLE GAME TYPE
// =====================================================

const GAME_TYPE =
    (
        localStorage.getItem(
            "crdg_game_type"
        ) || "FRIENDS"
    ).toUpperCase();



const IS_POINTS =
    GAME_TYPE === "POINTS";


// =========================
// SINGLE GLOBAL STATE (FIXED)
// =========================
let state = {
  sessionId: null,
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
  myTurnPickAnimation: false,
  registeredUserId: null,
  activeGameRegistered: false,
  groupsLocked : false,
  groupsDealNo: null,
   declarerWaitingWindowShown: false,
   declarerWaitingTimerInterval: null,
   resultWindowLoaded : false,
  dealAnimationPending: false,
  dealAnimationRenderActive: false,
  dealAnimationInProgress: false,
  drawAnimationTarget: null
};



const pickupSound = new Audio("pickup.mp3");
const discardSound = new Audio("discard.mp3");



// ==================================================
// POINTS : EXIT BUTTON
// ==================================================




let savedUserId =
  localStorage.getItem("crdg_user_id");

if(!savedUserId){

  savedUserId = crypto.randomUUID();

  localStorage.setItem(
    "crdg_user_id",
    savedUserId
  );
}

let gameEntered = false;

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


// ==========================================
// PREVENT ACCIDENTAL BACK DURING FRIENDS GAME
// ==========================================

let backNavigationArmed = false;

function enableBackProtection() {

    if (backNavigationArmed) {
        return;
    }

    backNavigationArmed = true;

    history.pushState(
        { friendsGame: true },
        "",
        window.location.href
    );

    window.addEventListener(
        "popstate",
        function () {

            const leaveGame =
                confirm(
                    "You are currently playing this table.\n\n" +
                    "Press OK to leave the table.\n" +
                    "Press Cancel to continue playing."
                );

            if (leaveGame) {

                // Allow Back navigation.
                history.back();

            } else {

                // Stay on the game page.
                history.pushState(
                    { friendsGame: true },
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

// Last completed deal history popup: separate from the existing score history.
document.getElementById("btnViewLastDeal")
    .addEventListener("click", openLastDealHistoryPopup);

document.getElementById("btnCloseLastDealHistory")
    .addEventListener("click", closeLastDealHistoryPopup);

document.getElementById("lastDealHistoryPopup")
    .addEventListener("click", function (event) {
        // Only a click on the dark backdrop closes this popup.
        if (event.target === this) closeLastDealHistoryPopup();
    });


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

    state.selectedCards = [{
        card: state.dragCard.card,
        group: state.dragCard.group,
        index: state.dragCard.index
    }];

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

            state.selectedCards = [{
        card: dragCardData.card,
        group: dragCardData.group,
        index: dragCardData.index
    }];

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

        clearCardSelection();

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

                    clearCardSelection();

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

    // SPECIAL CASE:
    // 3 or more selected cards from 3 or more different groups.
    // Move only the selected cards to a free group.
    // Keep every unselected card in its original group.
    // Skip single-card cleanup below so source groups remain intact.
    const isThreePlusGroupsCase =
        selected.length >= 3 &&
        sourceNumbers.length >= 3;

    if (isThreePlusGroupsCase) {

        // Remove only selected cards from their source groups.
        sourceGroups.forEach((source, groupNo) => {
            state.groups[groupNo] = source.cards.filter(
                (_, index) => !source.selectedIndexes.has(index)
            );
        });

        const sourceGroupSet = new Set(sourceNumbers);
        let selectedTarget = -1;

        // Find the next empty group G1-G5 that is not one of
        // the selected cards' source groups.
        for (let g = 0; g < 5; g++) {
            if (
                !sourceGroupSet.has(g) &&
                state.groups[g].length === 0
            ) {
                selectedTarget = g;
                break;
            }
        }

        // If no free user group exists, use G6 as the fallback.
        // Append rather than overwrite any cards already in G6.
        if (selectedTarget === -1) {
            selectedTarget = 5;
        }

        state.groups[selectedTarget].push(
            ...selected.map(item => item.card)
        );

    } else if (hasSingleNormalParent) {

        // EXISTING BEHAVIOR — selection from one normal group.
        const parentGroup = sourceNumbers[0];
        const source = sourceGroups.get(parentGroup);

        const selectedCards = source.cards.filter(
            (_, index) => source.selectedIndexes.has(index)
        );

        const remainingCards = source.cards.filter(
            (_, index) => !source.selectedIndexes.has(index)
        );

        // Selected cards stay in their parent group.
        state.groups[parentGroup] = selectedCards;

        // Preserve existing redistribution behavior.
        let remainingTarget = -1;

        if (remainingCards.length === 1) {
            remainingTarget = 5;
        } else {
            for (let g = 0; g < 5; g++) {
                if (state.groups[g].length === 0) {
                    remainingTarget = g;
                    break;
                }
            }

            if (remainingTarget === -1) {
                remainingTarget = 5;
            }
        }

        state.groups[remainingTarget].push(...remainingCards);

    } else {

        // EXISTING BEHAVIOR — multiple groups / G6 selection.
        // This branch remains unchanged for the other cases.
        const selectedCards = selected.map(item => item.card);
        const remainingCards = [];

        sourceGroups.forEach((source, groupNo) => {
            source.cards.forEach((card, index) => {
                if (!source.selectedIndexes.has(index)) {
                    remainingCards.push(card);
                }
            });
        });

        sourceGroups.forEach((source, groupNo) => {
            state.groups[groupNo] = [];
        });

        let selectedTarget = -1;

        for (let g = 0; g < 5; g++) {
            if (state.groups[g].length === 0) {
                selectedTarget = g;
                break;
            }
        }

        if (selectedTarget === -1) {
            selectedTarget = 5;
        }

        state.groups[selectedTarget].push(...selectedCards);

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

    // Keep the existing single-card cleanup for all old cases.
    // In the new 3+-groups case, do not move remaining cards,
    // because they must stay in their original groups.
    if (!isThreePlusGroupsCase) {
        for (let g = 0; g < 5; g++) {
            if (
                state.groups[g] &&
                state.groups[g].length === 1
            ) {
                const singleCard = state.groups[g].shift();
                state.groups[5].push(singleCard);
            }
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


function setGroupsLocked(locked) {

    state.groupsLocked = locked;

    // Disable or enable all six card groups.
    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById("group" + g);

        if (groupEl) {
            groupEl.style.pointerEvents =
                locked ? "none" : "";
        }
    }

    // Remove the GROUP button when locked.
    if (locked) {

        const groupButton =
            document.getElementById("groupActionButton");

        if (groupButton) {
            groupButton.remove();
        }
    }
}



async function loadTopGameType()
{
    // =====================================================
    // POINTS GAME
    // =====================================================

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "POINTS"
    )
    {
        const {
            data: multiplierData,
            error: multiplierError
        } =
            await supabaseClient.rpc(
                "crdgp_get_multiplier",
                {
                    p_table_id:
                        Number(state.tableId)
                }
            );

        if (multiplierError)
        {
            console.error(
                "POINTS multiplier load failed:",
                multiplierError
            );

            return;
        }

        const multiplier =
            Number(multiplierData) || 1;

        const el =
            document.getElementById(
                "topGameType"
            );

        if (el)
        {
            el.innerText =
                "Points:( 80 x " +
                multiplier +
                ")";
        }

        return;
    }


    // =====================================================
    // EXISTING POOL GAME
    // DO NOT CHANGE
    // =====================================================

    const { data, error } =
        await supabaseClient
            .from("crdg_game_tables")
            .select("max_elimination_score")
            .eq("table_id", state.tableId)
            .single();

    if (error)
    {
        console.error(
            "Failed to load game type:",
            error
        );

        return;
    }

    const gameType =
        Number(data.max_elimination_score) === 101
            ? "101 POOL"
            : "201 POOL";

    const el =
        document.getElementById(
            "topGameType"
        );

    if (el)
    {
        el.innerText =
            gameType;
    }
}

// =========================
// RENDER HAND
// =========================

// =====================================================
// NEW-DEAL CARD DISTRIBUTION ANIMATION + SOUND
// Visual only: uses the server-dealt hand and never calls
// any database/RPC function.
// =====================================================
let crdgDealAudioContext = null;

function crdgDealAnimationKey() {
    const dealNo = state.groupsDealNo ?? state.deal_no;
    if (state.sessionId == null || state.userId == null || dealNo == null) {
        return null;
    }
    return "crdg_deal_animation_" +
        String(state.sessionId) + "_" +
        String(state.userId) + "_" +
        String(dealNo);
}

function shouldAnimateCurrentDeal() {
    if (!state.dealAnimationPending) return false;

    const key = crdgDealAnimationKey();
    if (!key) return false;

    try {
        // Reserve the animation before rendering so duplicate realtime/load
        // calls cannot reveal the cards or start a second animation.
        if (localStorage.getItem(key)) {
            state.dealAnimationPending = false;
            return false;
        }
        localStorage.setItem(key, "pending");
    } catch (e) {
        // If storage is blocked, still allow the current live transition.
    }
    return true;
}

function playDealTick() {
    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        if (!crdgDealAudioContext) {
            crdgDealAudioContext = new AudioContextClass();
        }
        const ctx = crdgDealAudioContext;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const duration = 0.045;
        const buffer = ctx.createBuffer(
            1,
            Math.max(1, Math.floor(ctx.sampleRate * duration)),
            ctx.sampleRate
        );
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) {
            channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1900, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.14, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + duration);
    } catch (e) {
        // Sound is decorative; never let audio prevent a deal from rendering.
    }
}

async function playDealDistributionAnimation(reserved = false) {
    if (state.dealAnimationInProgress) return;

    const key = crdgDealAnimationKey();
    if (!key) return;

    try {
        if (!reserved && localStorage.getItem(key)) return;
        // The key may already contain "pending" from shouldAnimateCurrentDeal().
        // Replace it with the completed/started marker before flight begins.
        localStorage.setItem(key, "1");
    } catch (e) {
        // Continue with the current animation if localStorage is unavailable.
    }

    const stock = document.getElementById("stockCard");
    const cards = Array.from(document.querySelectorAll("#my-hand .card"));
    if (!stock || cards.length === 0) {
        cards.forEach(card => {
            card.classList.remove("deal-card-hidden", "card-enter");
            card.classList.add("card-show");
        });
        return;
    }

    state.dealAnimationInProgress = true;
    const sourceRect = stock.getBoundingClientRect();
    const reducedMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || typeof Element.prototype.animate !== "function") {
        await new Promise(resolve => setTimeout(resolve, 100));
        cards.forEach(card => {
            card.classList.remove("deal-card-hidden", "card-enter");
            card.classList.add("card-show");
        });
        state.dealAnimationInProgress = false;
        return;
    }

    const flightPromises = [];
    const cardWidth =  Math.max(32, Math.min(112, cards[0].getBoundingClientRect().width || 70));
    const cardHeight = Math.max(48, Math.min(165, cards[0].getBoundingClientRect().height || 100));

    cards.forEach((target, index) => {
        const targetRect = target.getBoundingClientRect();
        const flyer = document.createElement("div");
        flyer.className = "crdg-deal-fly-card";
        flyer.setAttribute("aria-hidden", "true");
        flyer.style.left = sourceRect.left + "px";
        flyer.style.top = sourceRect.top + "px";
        flyer.style.width = cardWidth + "px";
        flyer.style.height = cardHeight + "px";
        document.body.appendChild(flyer);

        const dx = targetRect.left - sourceRect.left;
        const dy = targetRect.top - sourceRect.top;
        const rotate = ((index % 5) - 2) * 2.2;
        const delay = index * 95;

        const animation = flyer.animate([
            {
                transform: "translate3d(0,0,0) scale(.52) rotate(0deg)",
                opacity: 0.98,
                offset: 0
            },
            {
                transform: `translate3d(${dx * 0.58}px,${dy * 0.58 - 22}px,0) scale(.82) rotate(${rotate * 1.6}deg)`,
                opacity: 1,
                offset: 0.62
            },
            {
                transform: `translate3d(${dx}px,${dy}px,0) scale(1) rotate(${rotate}deg)`,
                opacity: 1,
                offset: 1
            }
        ], {
            duration: 360,
            delay,
            easing: "cubic-bezier(.2,.72,.22,1)",
            fill: "forwards"
        });

        const flight = animation.finished.catch(() => {}).then(() => {
            flyer.remove();
            target.classList.remove("deal-card-hidden", "card-enter");
            target.classList.add("card-show");
        });

        flightPromises.push(flight);
        window.setTimeout(playDealTick, delay);
    });

    await Promise.all(flightPromises);
    state.dealAnimationInProgress = false;
}

// Called only when a live deal transition is detected. Initial page loads
// and ordinary reconnects do not set this flag.
function queueDealDistributionAnimation() {
    state.dealAnimationPending = true;
}

function renderHand() {

    const animateDealThisRender = state.dealAnimationRenderActive === true;

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

            if (animateDealThisRender) {
                div.classList.add("deal-card-hidden");
            }

            // Keep the newly drawn card hidden until its flight animation
            // from the selected pile reaches this exact group/index.
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

            // ==========================================
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


                renderHand();
                calculateDealScore();
            };



            // All G1-G6 use identical card spacing.

groupEl.appendChild(div);

            if (!animateDealThisRender) {
                setTimeout(() => {

                    div.classList.remove(
                        "card-enter"
                    );

                    div.classList.add(
                        "card-show"
                    );

                }, 30 * index);
            }

        });

    }

    saveGroupLayout();


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
    // Reset POINTS offline-check flag
    // --------------------------------------------------

    state.pointsOfflineCheckDone = false;


    // --------------------------------------------------
    // No observation end time
    // --------------------------------------------------

    if (!state.observationEndAt)
    {
        return;
    }


    async function updateObservationTimer()
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
        // POINTS:
        // Check offline players at 5 seconds
        // --------------------------------------------------

        if (
            typeof GAME_TYPE !== "undefined" &&
            GAME_TYPE === "POINTS" &&
            seconds === 5 &&
            !state.pointsOfflineCheckDone
        )
        {
            state.pointsOfflineCheckDone = true;


            const {
                data,
                error
            } = await supabaseClient.rpc(
                "crdgp_mark_offline_points_players",
                {
                    p_session_id: state.sessionId
                }
            );


            if (error)
            {
                console.error(
                    "POINTS: Offline player check failed:",
                    error
                );
            }
            else
            {
                console.log(
                    "POINTS: Offline players marked:",
                    data
                );
            }
        }


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



// ==================================================
// POINTS : EXIT TABLE
// ==================================================

async function exitPointsTable()
{
    // --------------------------------------------------
    // POINTS ONLY
    // --------------------------------------------------

    if (
        typeof GAME_TYPE === "undefined" ||
        GAME_TYPE !== "POINTS"
    )
    {
        return;
    }


    // --------------------------------------------------
    // CONFIRM
    // --------------------------------------------------

    const confirmed =
        confirm(
            "Exit this POINTS table?\n\n" +
            "The current deal will be settled first, " +
            "then you will be eliminated."
        );


    if (!confirmed)
    {
        return;
    }


    // --------------------------------------------------
    // BUTTON
    // --------------------------------------------------

    const button =
        document.getElementById(
            "btnExitPointsTable"
        );


    if (button)
    {
        button.disabled = true;

        button.innerText =
            "PROCESSING...";
    }


    try
    {
        const sessionToken =
            localStorage.getItem(
                "crdgn_session_token"
            );


        if (!sessionToken)
        {
            alert(
                "Login session is not available. Please login again."
            );

            if (button)
            {
                button.disabled = false;
                button.innerText = "EXIT TABLE";
            }

            return;
        }


        // --------------------------------------------------
        // SETTLEMENT → ELIMINATION → PLAYER COUNT
        // --------------------------------------------------


        const {
            data,
            error
        } =
        await supabaseClient.rpc(
            "crdgp_exit_points_table",
            {
                p_session_token:
                    sessionToken,

                p_session_id:
                    state.sessionId
            }
        );


        if (error)
        {
            console.error(
                "POINTS exit error:",
                error
            );

            alert(
                error.message ||
                "Unable to exit POINTS table."
            );

            if (button)
            {
                button.disabled = false;
                button.innerText = "EXIT TABLE";
            }

            return;
        }


        const result =
            Array.isArray(data)
                ? data[0]
                : data;


        if (
            !result ||
            result.success !== true
        )
        {
            alert(
                result?.message ||
                "Unable to exit POINTS table."
            );

            if (button)
            {
                button.disabled = false;
                button.innerText = "EXIT TABLE";
            }

            return;
        }


        // --------------------------------------------------
        // TABLE COMPLETED
        // --------------------------------------------------

        if (
            result.table_completed === true
        )
        {



            // Reload session so handleTableCompleted
            // receives the latest state.

            const {
                data: sessionData,
                error: sessionError
            } =
            await supabaseClient
                .from("crdg_game_sessions")
                .select("*")
                .eq(
                    "session_id",
                    state.sessionId
                )
                .single();


            if (sessionError)
            {
                console.error(
                    "POINTS final session reload failed:",
                    sessionError
                );

                return;
            }


            handleTableCompleted(
                sessionData
            );


            return;
        }


        // --------------------------------------------------
        // TABLE CONTINUES
        // --------------------------------------------------


        // The exiting player should not
        // start the next deal.

        state.playerStatus =
            "ELIMINATED";


        state.ignoreResultWindow =
            true;


        state.resultWindowOpened =
            false;


        state.resultWindowLoaded =
            false;


        clearInterval(
            state.observationTimerInterval
        );


        document.getElementById(
            "dealResultModal"
        ).style.display = "none";


        // --------------------------------------------------
        // IMPORTANT
        //
        // Existing dealer will start the next deal.
        // We simply refresh this eliminated player.
        // --------------------------------------------------

        setTimeout(
            async () =>
            {
                try
                {
                    await loadGame();

                    await loadSessionInfo();

                    await loadPlayers();

                    state.ignoreResultWindow =
                        false;
                }
                catch (error)
                {
                    console.error(
                        "POINTS exited-player refresh failed:",
                        error
                    );
                }
            },
            2500
        );

    }
    catch (error)
    {
        console.error(
            "POINTS exit unexpected error:",
            error
        );


        alert(
            error.message ||
            "Unable to exit POINTS table."
        );


        if (button)
        {
            button.disabled = false;
            button.innerText = "EXIT TABLE";
        }
    }
}

async function onObservationTimerExpired()
{
    

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
    // POINTS GAME
    //
    // 1. Settle the completed deal
    // 2. Eliminate offline players marked at 5 seconds
    // 3. Check remaining active players
    // 4. If only one remains → finish table
    // 5. Otherwise → start next deal
    // --------------------------------------------------

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "POINTS"
    ) {


        // --------------------------------------------------
        // SETTLE CURRENT DEAL
        // --------------------------------------------------

        const {
            data: settlementData,
            error: settlementError
        } =
        await supabaseClient.rpc(
            "crdgp_settle_points_deal",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if (settlementError)
        {
            console.error(
                "POINTS settlement failed:",
                settlementError
            );

            return;
        }


    


        // --------------------------------------------------
        // RELOAD SESSION AFTER SETTLEMENT
        // --------------------------------------------------

        const {
            data: settledSession,
            error: settledSessionError
        } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("*")
            .eq(
                "session_id",
                state.sessionId
            )
            .single();


        if (settledSessionError)
        {
            console.error(
                "POINTS post-settlement session check failed:",
                settledSessionError
            );

            return;
        }


        // --------------------------------------------------
        // TABLE COMPLETED AFTER SETTLEMENT?
        // --------------------------------------------------

        if (
            settledSession.game_completed === true
        )
        {
            

            handleTableCompleted(
                settledSession
            );

            return;
        }


        // --------------------------------------------------
        // ELIMINATE FLAGGED OFFLINE PLAYERS
        //
        // Players marked at the 5-second observation
        // checkpoint are eliminated only AFTER the
        // current deal has been settled.
        // --------------------------------------------------


        const {
            data: eliminatedCount,
            error: eliminationError
        } =
        await supabaseClient.rpc(
            "crdgp_eliminate_flagged_points_players",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if (eliminationError)
        {
            console.error(
                "POINTS: Offline player elimination failed:",
                eliminationError
            );

            return;
        }


        // --------------------------------------------------
        // CHECK REMAINING ACTIVE PLAYERS
        // --------------------------------------------------

        const {
            data: remainingPlayers,
            error: remainingPlayersError
        } =
        await supabaseClient
            .from("crdg_table_players")
            .select("user_id, seat_no")
            .eq(
                "table_id",
                state.tableId
            )
            .eq(
                "is_active",
                true
            )
            .eq(
                "is_eliminated",
                false
            );


        if (remainingPlayersError)
        {
            console.error(
                "POINTS: Failed to check remaining players:",
                remainingPlayersError
            );

            return;
        }


        


        // --------------------------------------------------
        // ONLY ONE PLAYER REMAINS
        //
        // Finish table directly.
        // DO NOT start another deal.
        // --------------------------------------------------

        if (
            remainingPlayers.length <= 1
        )
        {


            const {
                data: finishData,
                error: finishError
            } =
            await supabaseClient.rpc(
                "crdg_finish_table",
                {
                    p_session_id:
                        state.sessionId
                }
            );


            if (finishError)
            {
                console.error(
                    "POINTS: Table finish failed:",
                    finishError
                );

                return;
            }


            


            // --------------------------------------------------
            // RELOAD FINAL SESSION
            // --------------------------------------------------

            const {
                data: finalSession,
                error: finalSessionError
            } =
            await supabaseClient
                .from("crdg_game_sessions")
                .select("*")
                .eq(
                    "session_id",
                    state.sessionId
                )
                .single();


            if (finalSessionError)
            {
                console.error(
                    "POINTS: Final session reload failed:",
                    finalSessionError
                );

                return;
            }


            // --------------------------------------------------
            // SHOW TABLE COMPLETED WINDOW
            // --------------------------------------------------

            handleTableCompleted(
                finalSession
            );

            return;
        }


        // --------------------------------------------------
        // MORE THAN ONE PLAYER REMAINS
        // START NEXT DEAL
        // --------------------------------------------------


        await startNextDeal();

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

    // Re-evaluate eligibility for each observation window; never carry
    // a previous deal's button state into the next deal.
    const settlementBtn =
        document.getElementById("btnSettlement");

    if (settlementBtn) {
        settlementBtn.style.display = "none";
    }

    state.settlementEligible = false;
    state.settlementOpened = false;
    state.settlementId = null;
}

async function startNextDeal()
{

    if (state.tableCompleted)
    {
        return;
    }

    state.myTurnPickAnimation = false;
    document
            .getElementById("openVisual")
            .classList.remove("pick-card-pulse");

        document
            .getElementById("stockCard")
            .classList.remove("pick-card-pulse");

    closeSettlementPopup();

    // A new deal must never inherit the previous declaration countdown.
    clearDeclarationTimerDisplay();


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

        document.getElementById(
            "declarationTimer"
        ).innerText ="";


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

    // New deal is starting: unlock this player's groups.
     setGroupsLocked(false);


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

    queueDealDistributionAnimation();

    setTimeout(async () =>
    {
        try
        {
            // ------------------------------------------
            // IMPORTANT:
            // Fresh DB hand must be loaded first.
            // ------------------------------------------

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


function escapeLastDealHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function closeLastDealHistoryPopup() {
    const popup = document.getElementById("lastDealHistoryPopup");
    popup.classList.add("hidden");
    popup.setAttribute("aria-hidden", "true");
}

function openLastDealHistoryPopup() {
    const popup = document.getElementById("lastDealHistoryPopup");
    // Move the overlay to body so transformed game containers or other
    // modal stacking contexts cannot place it behind Deal Results.
    if (popup.parentElement !== document.body) {
        document.body.appendChild(popup);
    }
    popup.style.zIndex = "2147483000";
    popup.classList.remove("hidden");
    popup.setAttribute("aria-hidden", "false");

    const content = document.getElementById("lastDealHistoryContent");
    const meta = document.getElementById("lastDealHistoryMeta");
    meta.textContent = state.sessionId
        ? `Session ${state.sessionId}${state.tableId ? ` • Table ${state.tableId}` : ""}`
        : "";
    content.innerHTML = '<div class="last-deal-history-message">Loading last completed deal...</div>';
    loadLastDealHistory();
}

function lastDealCardHtml(card, historicalJokerCard) {
    const value = String(card ?? "");
    if (value === "JOKER") {
        return '<div class="result-card"><span class="result-card-printed-joker">JOKER</span></div>';
    }

    const isRed = value.includes("♥") || value.includes("♦");
    const jokerValue = String(historicalJokerCard ?? "");
    const cardRank = value.slice(0, -1);
    const jokerRank = jokerValue.slice(0, -1);
    // Historical highlighting must use the joker from the saved deal,
    // not state.jokerCard from whatever deal is currently on screen.
    const isHistoricalJoker = !!jokerRank && cardRank === jokerRank;
    const classes = ["result-card"];
    if (isRed) classes.push("red-card");
    if (isHistoricalJoker) classes.push("joker-highlight");
    const rank = escapeLastDealHtml(value.slice(0, -1));
    const suit = escapeLastDealHtml(value.slice(-1));
    return `<div class="${classes.join(" ")}"><span class="result-card-rank">${rank}</span><span class="result-card-suit">${suit}</span></div>`;
}

function normalizeLastDealArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    return [];
}

async function loadLastDealHistory() {
    const content = document.getElementById("lastDealHistoryContent");
    const meta = document.getElementById("lastDealHistoryMeta");

    if (!state.sessionId) {
        content.innerHTML = '<div class="last-deal-history-message">The current game session is not available.</div>';
        return;
    }

    const { data, error } = await supabaseClient.rpc(
        "crdg_get_last_deal_history",
        { p_session_id: state.sessionId }
    );

    if (error) {
        console.error("crdg_get_last_deal_history ERROR:", error);
        content.innerHTML = '<div class="last-deal-history-message">Unable to load last deal history.</div>';
        return;
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
        meta.textContent = `Session ${state.sessionId}${state.tableId ? ` • Table ${state.tableId}` : ""}`;
        content.innerHTML = '<div class="last-deal-history-message">No previous completed deal history available.</div>';
        return;
    }

    // RPC returns one row per player, ordered by display_order.
    const first = rows[0];
    const dealNo = first.deal_no ?? "—";
    const jokerCard = first.joker_card || "Not available";
    meta.textContent = `Session ${first.session_id ?? state.sessionId} • Table ${first.table_id ?? state.tableId ?? "—"} • Deal ${dealNo}`;

    const jokerIsRed = String(jokerCard).includes("♥") || String(jokerCard).includes("♦");
    let html = `<div class="last-deal-history-joker">Joker: <span style="color:${jokerIsRed ? "#d00" : "#172033"}">${escapeLastDealHtml(jokerCard)}</span></div>`;
    html += `
        <div class="result-scroll last-deal-result-scroll">
            <table class="result-table last-deal-result-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Cards</th>
                        <th>Score</th>
                        <th>Total</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

    rows.forEach(row => {
        const dropType = String(row.drop_type ?? "");
        const status = String(row.player_status ?? dropType ?? "—");
        const groupedHand = normalizeLastDealArray(row.grouped_hand);
        const originalHand = normalizeLastDealArray(row.original_hand);
        const hideCards = dropType === "DROP" || dropType === "MID_DROP";
        let cardsHtml = "";

        if (hideCards) {
            cardsHtml = '<span class="last-deal-hidden-cards">✕ DROP</span>';
        } else if (groupedHand.length) {
            // Preserve each saved group as its own visual group. Do not flatten
            // grouped_hand into one row of cards.
            groupedHand.forEach(group => {
                if (!Array.isArray(group) || !group.length) return;
                cardsHtml += '<div class="result-card-group">';
                group.forEach(card => {
                    cardsHtml += lastDealCardHtml(card, jokerCard);
                });
                cardsHtml += '</div>';
            });
        } else if (originalHand.length) {
            // Fallback only when the database has no saved groups.
            cardsHtml = '<div class="result-card-group">';
            originalHand.forEach(card => {
                cardsHtml += lastDealCardHtml(card, jokerCard);
            });
            cardsHtml += '</div>';
        } else {
            cardsHtml = '<span>Cards not available</span>';
        }

        html += `
            <tr>
                <td class="last-deal-result-player">${escapeLastDealHtml(row.display_name || "Player")}</td>
                <td class="last-deal-result-cards">${cardsHtml}</td>
                <td class="last-deal-result-score">${escapeLastDealHtml(row.deal_score ?? 0)}</td>
                <td class="last-deal-result-total">${escapeLastDealHtml(row.total_score ?? 0)}</td>
                <td class="last-deal-result-status">${escapeLastDealHtml(status)}</td>
            </tr>`;
    });

    html += `</tbody></table></div>`;
    content.innerHTML = html;
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

// Animate a successfully drawn face-up card from the selected pile into
// its destination group. The real target stays invisible until the flight ends.
async function animateDrawCardToGroup(sourceRect, groupIndex, cardIndex) {
    const groupEl = document.getElementById("group" + groupIndex);
    const target = groupEl
        ? Array.from(groupEl.querySelectorAll(":scope > .card"))[cardIndex]
        : null;

    if (!sourceRect || !target) {
        state.drawAnimationTarget = null;
        if (target) target.classList.remove("draw-card-hidden");
        return;
    }

    const targetRect = target.getBoundingClientRect();
    const flyer = target.cloneNode(true);
    flyer.classList.remove(
        "draw-card-hidden", "card-enter", "card-show", "picked-card", "selected"
    );
    flyer.classList.add("crdg-draw-fly-card");
    flyer.setAttribute("aria-hidden", "true");
    flyer.draggable = false;
    flyer.onclick = null;
    flyer.ondragstart = null;
    flyer.style.left = targetRect.left + "px";
    flyer.style.top = targetRect.top + "px";
    flyer.style.width = targetRect.width + "px";
    flyer.style.height = targetRect.height + "px";
    document.body.appendChild(flyer);

    // Existing pickup sound is used for this short draw action.
    try {
        pickupSound.currentTime = 0;
        const soundResult = pickupSound.play();
        if (soundResult && typeof soundResult.catch === "function") {
            soundResult.catch(() => {});
        }
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
        // A realtime refresh may have replaced the target node during flight,
        // so look it up again rather than relying on the old element reference.
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
// =========================
// DRAW
// =========================
// Track the latest drawn card until a discard succeeds.
let pendingDrawnCardForBackup = null;

async function draw(source, targetGroup = 5) {

    // =====================================================
    // PREVENT DOUBLE / MULTIPLE CLICK DRAW
    // =====================================================

    if (state.drawInProgress === true) {
        return;
    }

    // Lock immediately BEFORE any async operation.
    state.drawInProgress = true;


    try
    {
        if (!state.sessionId) {
            return;
        }

        if (state.declarationMode) {
            return;
        }


        if (
            Number(state.seatNo) !==
            Number(state.currentTurnSeat)
        ) {
            alert(
                "Please wait. It is another player's turn."
            );
            return;
        }


        const cardCount =
            getTotalCards();


        if (cardCount !== 13) {
            alert(
                "You have already picked a card. Please discard or declare."
            );
            return;
        }


        // Remember the source pile position before the RPC changes its contents.
        const sourcePileEl = document.getElementById(
            source === "open" ? "openVisual" : "stockCard"
        );
        const sourceRect = sourcePileEl
            ? (() => {
                const r = sourcePileEl.getBoundingClientRect();
                return { left: r.left, top: r.top, width: r.width, height: r.height };
            })()
            : null;

        // =================================================
        // EXISTING DRAW CODE STARTS HERE
        // =================================================

        const { data, error } =
            await supabaseClient.rpc(
                "crdg_draw_card",
                {
                    p_session_id:
                        state.sessionId,

                    p_table_id:
                        state.tableId,

                    p_user_id:
                        state.userId,

                    p_source:
                        source
                }
            );


        if (error) {
            console.error(error);
            return;
        }


        if (
            data &&
            data.length > 0 &&
            data[0].status ===
                "cannot_pick_joker"
        ) {
            alert(
                "Cannot pick discarded Joker / Wild Joker"
            );

            return;
        }


        const card =
            data?.[0]?.card;


        if (card) {

                    // =================================================
        // STOP PICK CARD ANIMATION
        // Card was successfully picked
        // =================================================
        state.myTurnPickAnimation = false;

        document
            .getElementById("openVisual")
            .classList.remove("pick-card-pulse");

        document
            .getElementById("stockCard")
            .classList.remove("pick-card-pulse");

            ensureSixGroups();

            const destinationGroup =
                Number.isInteger(targetGroup) &&
                targetGroup >= 0 &&
                targetGroup <= 5
                    ? targetGroup
                    : 5;

            state.groups[destinationGroup].push(card);
            // Keep this card tracked until a successful discard.
            pendingDrawnCardForBackup = card;
            const destinationIndex = state.groups[destinationGroup].length - 1;

            // A drawn card is not a selection: clear stale selections and
            // never apply the picked-card glow to the newly drawn card.
            state.pickedCard = null;
            state.selectedCard = null;
            state.selectedCards = [];
            state.drawAnimationTarget = {
                group: destinationGroup,
                index: destinationIndex
            };

            renderHand();
            await animateDrawCardToGroup(
                sourceRect,
                destinationGroup,
                destinationIndex
            );

            calculateDealScore();

            updateActionButtons();
        }
    }
    finally
    {
        // =================================================
        // ALWAYS RELEASE DRAW LOCK
        // =================================================

        state.drawInProgress = false;

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

    
        state.myTurnPickAnimation = false;

        document
            .getElementById("openVisual")
            .classList.remove("pick-card-pulse");

        document
            .getElementById("stockCard")
            .classList.remove("pick-card-pulse");

    await loadSessionInfo();
    await loadPlayers();

    state.isDropped = true;
    state.dropType = data[0].drop_type;

    renderHand();
}



// ==========================================
// MY TURN - MOBILE VIBRATION
// ==========================================

function startMyTurnVibration() {

    if (!("vibrate" in navigator)) {
        return;
    }

    // Vibrate once when it becomes my turn
    navigator.vibrate(300);
}

// ==========================================================
// SINGLE-CARD ACTION SELECTION
// Multi-select remains in state.selectedCards.
// Discard / Declare use this helper and require exactly 1.
// ==========================================================
function getSingleSelectedCard() {
    if (!Array.isArray(state.selectedCards)) {
        return null;
    }

    if (state.selectedCards.length !== 1) {
        return null;
    }

    return state.selectedCards[0];
}

function clearCardSelection() {
    state.selectedCards = [];
    state.selectedCard = null;
}



let dealBackupTimer = null;
let dealBackupInProgress = false;

function stopDealBackupTimer() {
    if (dealBackupTimer !== null) {
        clearInterval(dealBackupTimer);
        dealBackupTimer = null;
    }
}

function startDealBackupTimer() {
    // Start only once for this browser's current deal.
    if (dealBackupTimer !== null) {
        return;
    }

    if (
        !state.sessionId ||
        !state.tableId ||
        !state.userId ||
        state.declarationMode ||
        state.groupsLocked
    ) {
        return;
    }

    // First save occurs after 1 second.
    dealBackupTimer = setInterval(async function () {
        if (
            dealBackupInProgress ||
            !state.sessionId ||
            !state.tableId ||
            !state.userId ||
            state.declarationMode ||
            state.groupsLocked ||
            state.resultWindowOpened
        ) {
            if (state.declarationMode || state.resultWindowOpened) {
                stopDealBackupTimer();
            }
            return;
        }

        dealBackupInProgress = true;
        try {
            // Work only on a detached copy; never mutate the live hand/groups.
            const groupsToSave = JSON.parse(JSON.stringify(state.groups));
            const snapshotCardCount = groupsToSave.reduce(
                (total, group) => total + (Array.isArray(group) ? group.length : 0),
                0
            );

            // If the player drew but did not discard, remove that one card
            // from the backup copy only. Preserve the remaining group layout.
            if (snapshotCardCount === 14) {
                if (!pendingDrawnCardForBackup) {
                    console.warn("Backup skipped: 14 cards found, but the pending drawn card is unknown.");
                    return;
                }

                let removedPickedCard = false;
                for (let g = groupsToSave.length - 1; g >= 0 && !removedPickedCard; g--) {
                    const group = groupsToSave[g];
                    if (!Array.isArray(group)) continue;
                    const cardIndex = group.lastIndexOf(pendingDrawnCardForBackup);
                    if (cardIndex !== -1) {
                        group.splice(cardIndex, 1);
                        removedPickedCard = true;
                    }
                }

                if (!removedPickedCard) {
                    console.warn("Backup skipped: pending drawn card was not found in the 14-card snapshot.");
                    return;
                }

            }

            const finalCardCount = groupsToSave.reduce(
                (total, group) => total + (Array.isArray(group) ? group.length : 0),
                0
            );

            if (finalCardCount !== 13) {
                console.warn(
                    `Backup skipped: expected 13 cards after correction, found ${finalCardCount}.`
                );
                return;
            }

            const { data, error } = await supabaseClient.rpc(
                "crdg_save_declaration_backup",
                {
                    p_session_id: state.sessionId,
                    p_table_id: state.tableId,
                    p_user_id: state.userId,
                    p_groups: groupsToSave,
                    p_session_token: localStorage.getItem("crdgn_session_token")
                }
            );

            if (error) {
                console.error("Deal backup save failed:", error);
                return;
            }
        } finally {
            dealBackupInProgress = false;
        }
    }, 6000);
}

// Animate the selected hand card from any group onto the open pile.
// The server discard must succeed before this animation is played.
async function animateDiscardCardToOpenPile(cardInfo) {
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
        "picked-card", "selected", "draw-card-hidden", "card-enter",
        "card-show", "deal-card-hidden", "discard-card-hidden"
    );
    flyer.classList.add("crdg-discard-fly-card");
    flyer.setAttribute("aria-hidden", "true");
    flyer.draggable = false;
    flyer.onclick = null;
    flyer.ondragstart = null;
    flyer.style.left = sourceRect.left + "px";
    flyer.style.top = sourceRect.top + "px";
    flyer.style.width = sourceRect.width + "px";
    flyer.style.height = sourceRect.height + "px";
    document.body.appendChild(flyer);

    // Hide the real card while its animated copy travels to the open pile.
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

    const singleSelectedCard = getSingleSelectedCard();

    if (!singleSelectedCard) {
        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card to discard.");
        } else {
            alert("Please select a card to discard.");
        }
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

    const cardToRemove = getSingleSelectedCard();

    if (!cardToRemove) {
        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card to discard.");
        } else {
            alert("Please select a card to discard.");
        }
        return;
    }


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
        // Animate from the original group to the open pile before removing
        // the card from local state and rerendering the hand.
        await animateDiscardCardToOpenPile(cardToRemove);

        state.groups[
            cardToRemove.group
        ].splice(
            cardToRemove.index,
            1
        );

        // The discard succeeded, so no undiscarded picked card remains.
        pendingDrawnCardForBackup = null;


            // Stop the completed turn timer immediately
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;

        document.getElementById(
            "turnTimer"
        ).innerText = "0";

        // Clear old card selection
        clearCardSelection();
        state.dragCard = null;


        // New turn is already returned by discard RPC
        state.currentTurnSeat =
            Number(data[0].next_turn_seat);

        state.turnEndAt =
            data[0].turn_end_at;

        // Start the new turn timer immediately
        clearInterval(
            state.turnTimerInterval
        );

        state.turnTimerInterval = null;

        startTurnTimer();

        updateActionButtons();

        renderHand();

        await calculateDealScore();

        // Start the periodic backup after the first successful discard.
        // Subsequent discards won't create additional timers.
       // startDealBackupTimer();
    }



}


let sessionRefreshPending = false;
let sessionRefreshTimer = null;

function subscribeRealtime() {

    if (!state.sessionId) {
        return;
    }

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
            () => {

                // ------------------------------------------
                // Do NOT discard events.
                //
                // Every new event resets this timer.
                // We refresh only after the burst finishes.
                // ------------------------------------------

                if (sessionRefreshTimer) {
                    clearTimeout(
                        sessionRefreshTimer
                    );
                }

                sessionRefreshTimer =
                    setTimeout(
                        async () => {

                            // If another refresh is still running,
                            // try again shortly instead of losing event.
                            if (sessionRefreshPending) {

                                sessionRefreshTimer =
                                    setTimeout(
                                        () => {
                                            sessionRefreshTimer = null;

                                            // trigger fresh DB read
                                            loadSessionInfo()
                                                .then(() => {
                                                    updateActionButtons();
                                                })
                                                .catch(error => {
                                                    console.error(
                                                        "Realtime delayed refresh error:",
                                                        error
                                                    );
                                                });
                                        },
                                        200
                                    );

                                return;
                            }

                            sessionRefreshPending = true;
                            sessionRefreshTimer = null;

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

                                sessionRefreshPending = false;
                            }

                        },
                        350
                    );
            }
        )
        .subscribe((status, err) => {

            if (err) {
                console.error(
                    "Session realtime error:",
                    err
                );
            }
        });
}



async function cleanupActiveGamePointer(gameUserId = null, reason = "")
{
    const sessionToken = localStorage.getItem("crdgn_session_token");

    if (!sessionToken || !state.sessionId) {
        return false;
    }

    const { data, error } = await supabaseClient.rpc(
        "crdgn_cleanup_active_game",
        {
            p_session_token: sessionToken,
            p_session_id: state.sessionId,
            p_game_user_id: gameUserId || null
        }
    );

    if (error) {
        console.error(
            "Active-game cleanup failed" + (reason ? " (" + reason + ")" : "") + ":",
            error
        );
        return false;
    }

    state.activeGameRegistered = false;

    return true;
}


async function handleTableCompleted(data)
{
    // Prevent duplicate execution
    if(state.tableCompleted)
    {
        return;
    }


    state.tableCompleted = true;
    clearActiveTurnSeatDisplay();
    await disconnectCrdgVoice();

    // POINTS heartbeat is no longer required.
    stopPointsHeartbeat();

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

    
        stopDealBackupTimer();

        const { error: backupCleanupError } = await supabaseClient
            .from("crdg_declaration_backups")
            .delete()
            .eq("session_id", state.sessionId);

        if (backupCleanupError) {
            console.error(
                "Table-completion backup cleanup failed:",
                backupCleanupError
            );
        }


    await completeFriendsGamePayout();

    // Payout/finalization may still need the active-game mapping. Remove
    // the pointer only after that processing has finished.
    await cleanupActiveGamePointer(
        null,
        "table completed"
    );

    showTableCompletedScreen(data);


    // Future:
    // load final table result here
}


async function goToHome()
{
    await disconnectCrdgVoice();
    window.location.replace("index.html");
}

async function showTableCompletedScreen(data)
{


        // ==================================================
    // POINTS GAME - SIMPLE TABLE COMPLETION SCREEN
    // ==================================================

    if (IS_POINTS) {

        const screen = document.getElementById(
            "tableCompletedScreen"
        );

        if (!screen) {
            return;
        }

        // Hide trophy, player scores and thank-you message.
        const elementsToHide = [
            screen.querySelector(".trophy"),
            screen.querySelector(".table-scroll"),
            screen.querySelector("p")
        ];

        elementsToHide.forEach(element => {
            if (element) {
                element.style.display = "none";
            }
        });

        // Show only heading and HOME button.
        screen.style.display = "flex";

        return;
    }
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

async function completeFriendsGamePayout()
{
    try
    {
        const sessionToken =
            localStorage.getItem(
                "crdgn_session_token"
            );


        if(!sessionToken)
        {
            console.error(
                "crdgn_session_token not found"
            );

            return;
        }


        const {
            data,
            error
        } =
        await supabaseClient.rpc(
            "crdgn_complete_friends_game",
            {
                p_session_token:
                    sessionToken,

                p_session_id:
                    state.sessionId
            }
        );


        if(error)
        {
            console.error(
                "Friends game payout error:",
                error
            );

            return;
        }


        if(
            data &&
            data.length > 0
        )
        {
            const result =
                data[0];


            if(result.success)
            {


                if(result.already_paid)
                {
                    console.log(
                        "Payout was already processed."
                    );
                }
            }
            else
            {
                console.warn(
                    "Payout was not completed:",
                    result.message
                );
            }
        }
    }
    catch(error)
    {
        console.error(
            "Unexpected payout error:",
            error
        );
    }
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


function showDeclarerWaitingWindow() {

    hideBaseTableHand();

    const timer = document.getElementById("observationTimer");
    if (timer) {
        timer.innerText = "Waiting...";
    }

    const container = document.getElementById("dealResultsContainer");
    if (container) {
        container.innerHTML = `
            <div class="declarer-waiting-message">
                <div class="declarer-waiting-title">Valid declaration accepted ✓</div>
                <div>Waiting for the other players' declaration timers to finish...</div>
                <div class="declarer-waiting-countdown-line">
                    Declaration timer: <strong><span id="declarerWaitingCountdown">--</span>s</strong>
                </div>
            </div>
        `;
    }

    const modal = document.getElementById("dealResultModal");
    if (modal) {
        modal.style.display = "block";
    }

    state.declarerWaitingWindowShown = true;

    if (state.declarerWaitingTimerInterval) {
        clearInterval(state.declarerWaitingTimerInterval);
        state.declarerWaitingTimerInterval = null;
    }

    const updateCountdown = () => {
        const countdown = document.getElementById("declarerWaitingCountdown");
        if (!countdown) {
            if (state.declarerWaitingTimerInterval) {
                clearInterval(state.declarerWaitingTimerInterval);
                state.declarerWaitingTimerInterval = null;
            }
            return;
        }

        const endTime = state.declarationEndAt
            ? new Date(state.declarationEndAt).getTime()
            : NaN;
        const seconds = Number.isFinite(endTime)
            ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
            : null;

        countdown.innerText = seconds === null ? "--" : String(seconds);
        countdown.classList.toggle("timer-finished", seconds === 0);
    };

    updateCountdown();
    state.declarerWaitingTimerInterval = setInterval(updateCountdown, 250);
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

            // --------------------------------------------------
        // GAME COMPLETION
        //
        // Even when the game is completed, the final deal
        // must first pass through the observation window.
        //
        // Only show the table-completion window after the
        // observation period has finished.
        // --------------------------------------------------

        // --------------------------------------------------
        // GAME COMPLETION
        //
        // Final deal must show observation window first.
        // --------------------------------------------------

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

    // Detect a genuine server-side deal transition. The Friends Pool
    // worker can start the next deal without this browser running
    // startNextDeal(), so realtime must refresh the authoritative hand.
    const previousDealNo = state.deal_no;
    const dealChanged =
        !IS_POINTS &&
        previousDealNo != null &&
        String(previousDealNo) !== String(data.deal_no);

    state.dealerSeat = Number(data.dealer_seat);
    state.currentTurnSeat = Number(data.current_turn_seat);
    state.deal_no = data.deal_no;
    state.declarationEndAt = data.declaration_end_at;
    state.observationEndAt = data.observation_end_at;

    if (dealChanged) {

        queueDealDistributionAnimation();

        // Clear only deal-specific client state. Keep identity, seat,
        // connection, and active-table/resume state untouched.
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;
        clearDeclarationTimerDisplay();
        clearInterval(state.observationTimerInterval);
        state.observationTimerInterval = null;
        stopDeclarationTimeoutMonitor();
        clearInterval(state.declarerWaitingTimerInterval);
        state.declarerWaitingTimerInterval = null;

        state.declarationMode = false;
        state.declarationTimerStarted = false;
        state.resultWindowOpened = false;
        state.resultWindowLoaded = false;
        state.ignoreResultWindow = false;
        state.declarerWaitingWindowShown = false;
        state.isInvalidDeclaration = false;
        state.isDropped = false;
        state.dropType = null;
        state.pickedCard = null;
        pendingDrawnCardForBackup = null;
        state.myTurnPickAnimation = false;
        state.lastTurnSeat = null;

        setGroupsLocked(false);
        clearCardSelection();

        const resultModal = document.getElementById("dealResultModal");
        if (resultModal) resultModal.style.display = "none";

        const resultsContainer = document.getElementById("dealResultsContainer");
        if (resultsContainer) resultsContainer.innerHTML = "";

        // loadGame() fetches crdg_get_game_state and rebuilds this player's
        // hand/groups for data.deal_no; its storage keys are deal-specific.
        await loadGame();
    }

    // =====================================================
        // =====================================================
        // LOCAL PLAYER PICK-PILE ANIMATION
        // Blink only while THIS player can still pick a card.
        // This is local-device UI; other players do not see it.
        // =====================================================
        const isMyActiveTurn =
            Number(state.seatNo) > 0 &&
            Number(state.seatNo) === Number(state.currentTurnSeat);

        const localCardCount = getTotalCards();

        const canLocalPlayerPick =
            isMyActiveTurn &&
            localCardCount === 13 &&
            !state.declarationMode &&
            !state.resultWindowOpened &&
            !state.tableCompleted &&
            !state.isDropped &&
            !state.isEliminated;

        state.myTurnPickAnimation = canLocalPlayerPick;

        const openPileForAnimation = document.getElementById("openVisual");
        const stockPileForAnimation = document.getElementById("stockCard");

        openPileForAnimation?.classList.toggle(
            "pick-card-pulse",
            canLocalPlayerPick
        );

        stockPileForAnimation?.classList.toggle(
            "pick-card-pulse",
            canLocalPlayerPick
        );

        if (canLocalPlayerPick) {
            startMyTurnVibration();
        }


    if (
            data.last_event_type === "TURN_TIMEOUT" &&
            data.last_event_user_id === state.userId &&
            data.last_event_time &&
            state.lastHandledTimeoutEvent !== data.last_event_time
        ) {
            state.lastHandledTimeoutEvent =
                data.last_event_time;

            await loadGame();

            renderHand();

            updateActionButtons();
        }

    // Refresh my dynamic seat after rejoin/rebuild
    const { data: players, error: playersError } =
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


    const me = players?.find(
        player =>
                String(player.user_id).toLowerCase() ===
                String(state.userId).toLowerCase()
        );

        if (me) {
            // Refresh both seats using the player's permanent identity.
            state.seatNo = Number(me.seat_no);
            state.fixedSeatNo = Number(me.fixed_seat_no);

            // Keep saved browser state synchronized with the database.
            localStorage.setItem(
                "crdg_seat_no",
                String(state.seatNo)
            );

            localStorage.setItem(
                "crdg_fixed_seat_no",
                String(state.fixedSeatNo)
            );
        }

    await loadPlayers(players);


  state.turnStartedAt =    new Date(
        data.turn_started_at
    ).getTime();

    state.turnEndAt = data.turn_end_at;

 
    // Complete current open pile
    state.openPile =
        data.open_pile || [];

        
    const topOpenCard =
        data.open_pile?.slice(-1)[0];

    const openEl =
        document.getElementById("openVisual");

    openEl.innerHTML =
        getTableCardHTML(topOpenCard || "-");

    openEl.classList.remove("red-card");

    if (
        topOpenCard?.includes("♥") ||
        topOpenCard?.includes("♦")
    ) {
        openEl.classList.add("red-card");
    }


    // JOKER CARD

    const jokerCard =
        data.joker_card || "-";

    const jokerEl =
        document.getElementById("jokerVisual");

    jokerEl.innerHTML =
        getTableCardHTML(jokerCard);

    jokerEl.classList.remove("red-card");

    if (
        jokerCard?.includes("♥") ||
        jokerCard?.includes("♦")
    ) {
        jokerEl.classList.add("red-card");
    }

    state.jokerCard = data.joker_card;
    state.wildRank  = data.wild_rank;

    state.declarationMode =
    data.declaration_started || false;

    // Clear the declaration message when declaration mode has ended or
    // results are ready. Do NOT reset declarationTimerStarted merely
    // because results became ready: crdg_start_declaration_timer() clears
    // observation_end_at, so calling it again would restart the declaration
    // phase and prevent the observation timer from starting.
    if (
        !state.declarationMode ||
        data.deal_results_ready === true
    ) {
        clearDeclarationTimerDisplay();
    }

    // Reset the local guard only when the server is not in the declaration
    // phase. A new deal also resets this flag in the deal-change block above.
    if (
        !state.declarationMode &&
        data.deal_results_ready !== true
    ) {
        state.declarationTimerStarted = false;
    }

    
    // Stop regular 10-second backups as soon as any player declares.
    if (
        state.declarationMode ||
        data.deal_results_ready === true ||
        data.game_completed === true
    ) {
        stopDealBackupTimer();
    }



    const iAmValidDeclarer =
        state.declarationMode &&
        data.declaration_user_id &&
        String(data.declaration_user_id).toLowerCase() ===
            String(state.userId).toLowerCase();

    
    if (
        state.declarationMode &&
        data.deal_results_ready !== true
    ) {
        startDeclarationTimeoutMonitor();
    }
    else {
        stopDeclarationTimeoutMonitor();
    }


    
    // The valid declarer moves to the waiting/observation screen
    // immediately. The actual observation countdown still starts
    // only when the server marks deal_results_ready.
    if (
        iAmValidDeclarer &&
        data.deal_results_ready !== true &&
        !state.resultWindowOpened &&
        !state.declarerWaitingWindowShown
    ) {
        showDeclarerWaitingWindow();
    }

    if (
        data.deal_results_ready === true
    ) {
        state.declarerWaitingWindowShown = false;
    }

     if (
          state.declarationMode &&
          data.deal_results_ready !== true &&
          !iAmValidDeclarer &&
          !state.declarationTimerStarted
      ) {

          clearInterval(state.turnTimerInterval);
          state.turnTimerInterval = null;

          // crdg_submit_declaration sets declaration_end_at on the server
          // when the valid declaration is accepted. Reconnects must only
          // display that existing deadline; they must never start/reset it.
          state.declarationTimerStarted = true;

          if (!state.declarationEndAt) {
              console.error(
                  "Declaration is active but the server has no declaration_end_at."
              );
              return;
          }

          // Save the player's current arrangement immediately.
          // Do not wait for the player to move a card again.
          if (
              Array.isArray(state.groups) &&
              !state.groupsLocked
          ) {
              scheduleDeclarationBackupSave();
          }

          if (!state.declarationTimerInterval) {
              startDeclarationTimer();
          }
      }


    document.getElementById("stockCard").innerText =
        data.stock_pile?.length || 0;
        
        if (
            state.playerStatus !== "ELIMINATED" &&
            data.deal_results_ready !== true &&
            !state.resultWindowOpened &&
            !state.declarationMode &&
            state.turnEndAt &&
            (
                state.lastTurnSeat !== data.current_turn_seat ||
                !state.turnTimerInterval
            )
        ) {
            state.lastTurnSeat =
                data.current_turn_seat;

            await syncTurnClock();

            startTurnTimer();
        }


        if (
            data.deal_results_ready === true &&
            !state.resultWindowOpened &&
            state.participatedInDeal === true &&
            !state.ignoreResultWindow
        )
        {
            clearInterval(state.turnTimerInterval);
            state.turnTimerInterval = null;

            document.getElementById(
                "turnTimer"
            ).innerText = "-";


            state.resultWindowOpened = true;
            clearActiveTurnSeatDisplay();

            hideBaseTableHand();

            resetSettlementControls();

            loadDealResults();

            if (typeof GAME_TYPE !== "undefined" && GAME_TYPE === "FRIENDS") {
              await checkSettlementEligibility();
            }

            const {
                data: observationEndAt,
                error: obstmrerror
            } =
            await supabaseClient.rpc(
                "crdg_start_observation_timer",
                {
                    p_session_id: state.sessionId
                }
            );

            if(obstmrerror){
                console.error(obstmrerror);

                // Allow a later authoritative refresh to retry starting
                // observation instead of leaving the result window stuck.
                state.resultWindowOpened = false;
                return;
            }

            // The RPC is authoritative; the session row is a safe fallback
            // if its scalar response is empty but the deadline is already set.
            state.observationEndAt =
                observationEndAt || data.observation_end_at || null;

            if(
                state.observationEndAt &&
                !state.observationTimerInterval
            ){
                startObservationTimer();
            }
            else if (!state.observationEndAt) {
                console.error(
                    "Observation timer was not started: no observation deadline returned."
                );
                state.resultWindowOpened = false;
            }
        }

   updateActionButtons();
   
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

function clearDeclarationTimerDisplay() {
    if (state.declarationTimerInterval) {
        clearInterval(state.declarationTimerInterval);
    }
    state.declarationTimerInterval = null;

    const label = document.getElementById("declarationTimer");
    if (label) {
        label.innerText = "";
    }
}

function startDeclarationTimer() {

    clearDeclarationTimerDisplay();
    if (!state.declarationEndAt) {
        return;
    }
    state.myTurnPickAnimation = false;
    document
            .getElementById("openVisual")
            .classList.remove("pick-card-pulse");

        document
            .getElementById("stockCard")
            .classList.remove("pick-card-pulse");


    function updateDeclarationTimer() {

        if (!state.declarationEndAt) {
            clearDeclarationTimerDisplay();
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
            clearDeclarationTimerDisplay();
            onDeclarationTimerExpired();
        }
    }

    // Start the interval before the first update so an already-expired
    // deadline can clear the actual interval and cannot fire repeatedly.
    state.declarationTimerInterval =
        setInterval(
            updateDeclarationTimer,
            250
        );

    updateDeclarationTimer();
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

        /* Keep navigation space even when hidden */
        .discard-nav-btn[style*="display: none"] {
            visibility: hidden;
        }

        /* 5 or 6 players */
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

    // End the declaration countdown before finalizing the current hand.
    clearDeclarationTimerDisplay();
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

    // Re-read the authoritative session immediately. If this submission
    // completes the declaration phase, loadSessionInfo() sees
    // deal_results_ready=true and starts the observation countdown.
    // If other players are still arranging, it leaves their declaration
    // phase alone; their final submission will trigger the same flow.
    try {
        await loadSessionInfo();
    }
    catch (refreshError) {
        console.error(
            "Session refresh after declaration timer failed:",
            refreshError
        );
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



  


function getGroupLayoutStorageKey(dealNo = state.groupsDealNo) {

    if (
        !state.sessionId ||
        !state.userId ||
        dealNo == null
    ) {
        return null;
    }

    return (
        "crdg_group_layout_" +
        state.sessionId + "_" +
        state.userId + "_" +
        dealNo
    );
}



let declarationBackupSaveTimer = null;
let declarationTimeoutMonitorInterval = null;
let declarationTimeoutProcessorRunning = false;


async function checkDeclarationTimeout() {

    if (
        !state.sessionId ||
        !state.tableId ||
        !state.declarationMode ||
        state.resultWindowOpened ||
        state.tableCompleted
    ) {
        return;
    }

    if (!state.declarationEndAt) {
        return;
    }

    const deadline =
        new Date(state.declarationEndAt).getTime();

    if (!Number.isFinite(deadline) || Date.now() < deadline) {
        return;
    }

    if (declarationTimeoutProcessorRunning) {
        return;
    }

    declarationTimeoutProcessorRunning = true;

    try {

        const { data, error } =
            await supabaseClient.rpc(
                "crdg_process_declaration_timeout",
                {
                    p_session_id: state.sessionId,
                    p_table_id: state.tableId
                }
            );

        if (error) {
            console.error(
                "Declaration timeout processing failed:",
                error
            );
            return;
        }

        // Reload authoritative server state.
        // If all players are accounted for,
        // loadSessionInfo() opens the result/observation flow.
        await loadSessionInfo();
        await loadPlayers();

    }
    catch (error) {

        console.error(
            "Declaration timeout monitor error:",
            error
        );

    }
    finally {

        declarationTimeoutProcessorRunning = false;

    }
}


function startDeclarationTimeoutMonitor() {

    if (declarationTimeoutMonitorInterval) {
        return;
    }

    declarationTimeoutMonitorInterval =
        setInterval(
            checkDeclarationTimeout,
            1000
        );

    // Check immediately as well.
    checkDeclarationTimeout();
}


function stopDeclarationTimeoutMonitor() {

    if (declarationTimeoutMonitorInterval) {
        clearInterval(declarationTimeoutMonitorInterval);
        declarationTimeoutMonitorInterval = null;
    }
}


function scheduleDeclarationBackupSave() {

    // Only save while the declaration countdown is active.
    if (
        !state.sessionId ||
        !state.tableId ||
        !state.userId ||
        !state.declarationMode ||
        !state.declarationTimerStarted ||
        !state.declarationEndAt ||
        state.resultWindowOpened ||
        state.groupsLocked
    ) {
        return;
    }

    const remaining =
        new Date(state.declarationEndAt).getTime() -
        Date.now();

    if (remaining <= 0) {
        return;
    }

    // Combine rapid card movements into one database update.
    clearTimeout(declarationBackupSaveTimer);

    declarationBackupSaveTimer = setTimeout(
        async function () {

            // Recheck before making the request.
            if (
                !state.declarationMode ||
                !state.declarationTimerStarted ||
                state.resultWindowOpened ||
                !state.groups
            ) {
                return;
            }

            const remainingNow =
                new Date(state.declarationEndAt).getTime() -
                Date.now();

            if (remainingNow <= 0) {
                return;
            }

            const groupsToSave =
                JSON.parse(JSON.stringify(state.groups));

            const { data, error } =
                await supabaseClient.rpc(
                    "crdg_save_declaration_backup",
                    {
                        p_session_id: state.sessionId,
                        p_table_id: state.tableId,
                        p_user_id: state.userId,
                        p_groups: groupsToSave,
                        p_session_token: localStorage.getItem("crdgn_session_token")
                    }
                );

            if (error) {
                console.error(
                    "Declaration backup save failed:",
                    error
                );
                return;
            }
        },
        500
    );
}


function saveGroupLayout() {

    const key = getGroupLayoutStorageKey();

    if (!key || !Array.isArray(state.groups)) {
        return;
    }

    try {
        localStorage.setItem(
            key,
            JSON.stringify(state.groups)
        );
    }
    catch (error) {
        console.error(
            "Group layout save failed:",
            error
        );
    }

    // New: save to Supabase only during declaration countdown.
    scheduleDeclarationBackupSave();
}



function arrangeHandBySuit(hand) {

    const hearts = [];
    const spades = [];
    const diamonds = [];
    const clubs = [];
    const jokers = [];

    hand.forEach(card => {

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

    hearts.sort((a, b) => getRank(a) - getRank(b));
    spades.sort((a, b) => getRank(a) - getRank(b));
    diamonds.sort((a, b) => getRank(a) - getRank(b));
    clubs.sort((a, b) => getRank(a) - getRank(b));

    return [
        hearts,
        spades,
        diamonds,
        clubs,
        [],
        jokers
    ];
}


function reconcileGroupLayout(previousGroups, currentHand) {

    const groups = Array.from(
        { length: 6 },
        (_, index) =>
            Array.isArray(previousGroups?.[index])
                ? [...previousGroups[index]]
                : []
    );

    // Count each card in the authoritative hand.
    // Counts handle duplicate cards from two decks.
    const remaining = new Map();

    currentHand.forEach(card => {
        remaining.set(
            card,
            (remaining.get(card) || 0) + 1
        );
    });

    // Preserve the group and order of cards still in the hand.
    const preservedGroups = groups.map(group => {

        const kept = [];

        group.forEach(card => {

            const count = remaining.get(card) || 0;

            if (count > 0) {
                kept.push(card);
                remaining.set(card, count - 1);
            }

        });

        return kept;
    });

    // Place newly acquired cards into G5.
    // Keep newly acquired printed jokers in G6.
    currentHand.forEach(card => {

        const count = remaining.get(card) || 0;

        if (count > 0) {

            const targetGroup =
                card === "JOKER" ? 5 : 4;

            preservedGroups[targetGroup].push(card);

            remaining.set(card, count - 1);
        }

    });

    return preservedGroups;
}



// =========================
// LOAD STATE
async function loadGame() {

    if (state.tableCompleted) {
        return;
    }

    const { data, error } = await supabaseClient.rpc(
        "crdg_get_game_state",
        {
            p_session_id: state.sessionId,
            p_user_id: state.userId
        }
    );

    if (error) {
        console.error(error);
        return;
    }

    if (!data) {
        return;
    }

    // ==========================================
    // UPDATE PLAYER STATE
    // ==========================================

    state.hand = data.hand || [];
    state.playerStatus = data.player_status;
    state.participatedInDeal =
        data.participated_in_deal === true;

    // ==========================================
    // ELIMINATED PLAYER HANDLING
    // ==========================================

    
        if (state.playerStatus === "ELIMINATED") {


            stopPointsHeartbeat();

            state.eliminationScreenShown = true;

            handleEliminatedPlayer();

            // Do not continue loading the old hand or deal.
            return;
        }


    // ==========================================
    // PRESERVE GROUPS WITHIN THE SAME DEAL
    // AUTO-ARRANGE ONLY FOR A NEW DEAL
    // ==========================================

    // Read the authoritative deal number because
    // loadGame() may run before loadSessionInfo().

    const {
        data: dealInfo,
        error: dealInfoError
    } = await supabaseClient
        .from("crdg_game_sessions")
        .select("deal_no")
        .eq("session_id", state.sessionId)
        .single();

    if (dealInfoError || !dealInfo) {
        console.error(
            "Unable to read current deal number:",
            dealInfoError
        );
        return;
    }

    const currentDealNo = dealInfo.deal_no;

    // A valid declaration uses 14 cards temporarily, but the selected
    // declaration card is not part of the player's final 13-card hand.
    // Remember that card per session/player/deal so refreshes cannot add it back.
    const declarationStorageKey =
        "crdg_valid_declaration_" +
        state.sessionId + "_" +
        state.userId + "_" +
        currentDealNo;

    let savedDeclaration = null;

    try {
        const savedDeclarationText =
            localStorage.getItem(declarationStorageKey);

        if (savedDeclarationText) {
            savedDeclaration = JSON.parse(savedDeclarationText);
        }
    } catch (declarationStorageError) {
        console.error(
            "Unable to restore valid declaration:",
            declarationStorageError
        );
    }

    if (
        savedDeclaration?.valid === true &&
        typeof savedDeclaration.card === "string"
    ) {
        // Remove exactly one physical occurrence; duplicate cards can exist
        // because the game uses two decks.
        const declaredCardIndex = state.hand.indexOf(
            savedDeclaration.card
        );

        if (declaredCardIndex >= 0) {
            state.hand.splice(declaredCardIndex, 1);
        }

        setGroupsLocked(true);
    }

    const sameDeal =
        state.groupsDealNo != null &&
        String(state.groupsDealNo) ===
        String(currentDealNo);

    let previousGroups = null;

    // First preference: existing groups in memory.
    if (
        sameDeal &&
        Array.isArray(state.groups) &&
        state.groups.some(
            group => Array.isArray(group) &&
                   group.length > 0
        )
    ) {
        previousGroups = state.groups;
    }

    // Second preference: saved groups from localStorage.
    if (!previousGroups) {

        const storageKey =
            getGroupLayoutStorageKey(currentDealNo);

        if (storageKey) {
            try {
                const savedLayout =
                    localStorage.getItem(storageKey);

                if (savedLayout) {
                    const parsedLayout =
                        JSON.parse(savedLayout);

                    if (Array.isArray(parsedLayout)) {
                        previousGroups = parsedLayout;
                    }
                }
            } catch (storageError) {
                console.error(
                    "Unable to restore saved groups:",
                    storageError
                );
            }
        }
    }

    // Restore existing groups or arrange a new deal.
    if (previousGroups) {

        state.groups = reconcileGroupLayout(
            previousGroups,
            state.hand
        );

    } else {

        state.groups = arrangeHandBySuit(state.hand);

    }

    state.groupsDealNo = currentDealNo;

    // ==========================================
    // RESET SELECTION AND RENDER
    // ==========================================

    clearCardSelection();
    state.dragCard = null;

    const animateNewDeal = shouldAnimateCurrentDeal();
    state.dealAnimationRenderActive = animateNewDeal;
    renderHand();
    state.dealAnimationRenderActive = false;
    if (animateNewDeal) {
        state.dealAnimationPending = false;
        // Let the DOM finish layout before measuring the stock and hand cards.
        requestAnimationFrame(() => {
            playDealDistributionAnimation(true);
        });
    }
    updateActionButtons();

    // Save the current 13-card hand and server-calculated score every 6 seconds.
    // This starts when the deal's groups are ready, not only after the first discard.
    startDealBackupTimer();
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




async function handleEliminatedPlayer() {

    if (state.eliminationRedirecting) {
        return;
    }

    state.eliminationRedirecting = true;
    await disconnectCrdgVoice();
    state.myTurn = false;

    // Remove this player's saved active-game pointer before redirecting.
    // The server verifies that this account really is eliminated.
    await cleanupActiveGamePointer(
        state.userId,
        "player eliminated"
    );

    // Stop all game timers.
    clearInterval(state.turnTimerInterval);
    state.turnTimerInterval = null;

    clearInterval(state.observationTimerInterval);
    state.observationTimerInterval = null;

    clearInterval(state.declarationTimerInterval);
    state.declarationTimerInterval = null;

    // Stop the declaration-timeout monitor from Step 1.
    if (typeof stopDeclarationTimeoutMonitor === "function") {
        stopDeclarationTimeoutMonitor();
    }

    stopPointsHeartbeat();

    // Remove stale game pointers so the app does not
    // automatically reconnect to the eliminated table.
    localStorage.removeItem("crdg_table");
    localStorage.removeItem("crdg_session_id");

    // Keep the player's account, game-user ID and nickname.
    // Only clear the old table/session reference.

    window.location.replace("homepage.html");
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


// ==================================================
// MANUAL GAME REFRESH / RECONNECT
// ==================================================

let refreshInProgress = false;

// ==================================================
// ==================================================
// NETWORK / SUPABASE AVAILABILITY MONITOR
// ==================================================
let networkOffline = false;
let networkMonitorHandle = null;


async function checkSupabaseAvailability() {

    if (!navigator.onLine) {
        return false;
    }

    try {

        const controller = new AbortController();

        const timeoutHandle = setTimeout(
            () => controller.abort(),
            5000
        );

        // Any HTTP response means Supabase is reachable.
        // Only a real fetch/network failure is treated as offline.
        await fetch(
            SUPABASE_URL + "/rest/v1/",
            {
                method: "GET",
                cache: "no-store",
                signal: controller.signal
            }
        );

        clearTimeout(timeoutHandle);

        return true;

    } catch (error) {

        console.warn(
            "SUPABASE AVAILABILITY CHECK FAILED:",
            error?.message || error
        );

        return false;
    }
}


async function checkNetworkAndReconnect() {

    if (refreshInProgress) {
        return;
    }

    const available = await checkSupabaseAvailability();

    // Connection unavailable: remember the state and wait.
    if (!available) {

        if (!networkOffline) {
            networkOffline = true;
            console.warn(
                "NETWORK OFFLINE: waiting for connection..."
            );
        }

        return;
    }

    // Connection has returned after an offline period.
    if (networkOffline) {

    

        try {

            const refreshed = await refreshGame();

            if (!refreshed) {
                throw new Error(
                    "Game refresh did not complete successfully."
                );
            }

            networkOffline = false;

            

        } catch (error) {

            console.error(
                "NETWORK RESTORE REFRESH FAILED:",
                error
            );

            // Keep true so the next 7-second check retries.
            networkOffline = true;
        }
    }
}

function startNetworkMonitor() {

    if (networkMonitorHandle) {
        return;
    }

    

    // Initial check, then every 7 seconds.
    checkNetworkAndReconnect();

    networkMonitorHandle = setInterval(
        checkNetworkAndReconnect,
        7000
    );
}

// POINTS : PLAYER HEARTBEAT
// ==================================================

let pointsHeartbeatHandle = null;
let pointsHeartbeatInProgress = false;

async function sendPointsHeartbeat() {

    // POINTS ONLY
    if (
        typeof GAME_TYPE === "undefined" ||
        GAME_TYPE !== "POINTS"
    ) {
        return;
    }

    // No heartbeat after table/game is over.
    if (
        state.tableCompleted ||
        state.isEliminated ||
        state.playerStatus === "ELIMINATED"
    ) {
        return;
    }

    // During an actual network outage, let the existing
    // 7-second network monitor handle recovery.
    if (typeof networkOffline !== "undefined" && networkOffline) {
        return;
    }

    if (
        !state.tableId ||
        !state.userId
    ) {
        return;
    }

    if (pointsHeartbeatInProgress) {
        return;
    }

    pointsHeartbeatInProgress = true;

    try {

        const { data, error } =
            await supabaseClient.rpc(
                "crdgp_update_heartbeat",
                {
                    p_user_id: state.userId,
                    p_table_id: state.tableId
                }
            );

        if (error) {

            console.warn(
                "POINTS HEARTBEAT ERROR:",
                error
            );

            return;
        }

        if (data !== true) {

            console.warn(
                "POINTS HEARTBEAT: player row not updated.",
                {
                    tableId: state.tableId,
                    userId: state.userId,
                    result: data
                }
            );

            return;
        }

        

    }
    catch (error) {

        console.warn(
            "POINTS HEARTBEAT EXCEPTION:",
            error
        );

    }
    finally {

        pointsHeartbeatInProgress = false;
    }
}


function stopPointsHeartbeat() {

    if (pointsHeartbeatHandle) {

        clearInterval(
            pointsHeartbeatHandle
        );

        pointsHeartbeatHandle = null;
    }
}


function startPointsHeartbeat() {

    // Always prevent duplicate heartbeat timers.
    stopPointsHeartbeat();

    // POINTS ONLY.
    if (
        typeof GAME_TYPE === "undefined" ||
        GAME_TYPE !== "POINTS"
    ) {
        return;
    }

    

    // Send one immediately, then every 3 seconds.
    sendPointsHeartbeat();

    pointsHeartbeatHandle =
        setInterval(
            sendPointsHeartbeat,
            3000
        );
}


async function refreshGame() {

    if (refreshInProgress) {
        return;
    }

    refreshInProgress = true;

    try {

        // Reuse the existing JOIN / RECONNECT flow
        await joinTable();

        // If reconnect returned us to the existing game,
        // explicitly reload the authoritative server state.
        if (
            state.sessionId &&
            state.userId &&
            gameEntered
        ) {

            await loadGame();

            await loadSessionInfo();

            await loadPlayers();

            renderHand();

            calculateDealScore();

            

            return true;
        }

        return false;

    }
    catch (error) {

        console.error(
            "MANUAL GAME REFRESH ERROR:",
            error
        );

        return false;

    }
    finally {

        refreshInProgress = false;
    }
}

// =========================
// JOIN TABLE (FIXED)
// =========================
// =========================
// JOIN TABLE
// =========================
async function joinTable() {

    let tableId = localStorage.getItem("crdg_table");
    let nickname = localStorage.getItem("crdg_nickname");

    if (!tableId) {
        tableId = document.getElementById("tableIdInput").value;
    }

    if (!nickname) {
        nickname = document.getElementById("nickname").value;
    }

    tableId = parseInt(tableId);
    nickname = (nickname || "").trim();

    const password = "5E2D";

    // --------------------------------------------------
    // LOGIN SESSION
    // --------------------------------------------------

    const sessionToken =
        localStorage.getItem("crdgn_session_token");

    const gameType = (
        localStorage.getItem("crdg_game_type") || "FRIENDS"
    ).toUpperCase();

    if (!sessionToken) {

        alert("Please login before joining a Friends game.");

        return;
    }

    // --------------------------------------------------
    // GET / CREATE PERMANENT GAME USER ID
    // --------------------------------------------------

    const { data: mappingData, error: mappingError } =
        await supabaseClient.rpc(
            "crdgn_get_or_create_game_user_id",
            {
                p_session_token: sessionToken,
                p_game_type: gameType
            }
        );

    const mappingResult =
        Array.isArray(mappingData)
            ? mappingData[0]
            : mappingData;

    if (mappingError) {

        console.error(
            "GAME USER MAPPING ERROR:",
            mappingError
        );

        alert(
            mappingError.message ||
            "Unable to identify game user."
        );

        return;
    }

    if (
        !mappingResult ||
        mappingResult.success !== true ||
        !mappingResult.game_user_id
    ) {

        console.error(
            "INVALID GAME USER MAPPING:",
            mappingResult
        );

        alert(
            mappingResult?.message ||
            "Unable to identify game user."
        );

        return;
    }

    // --------------------------------------------------
    // REGISTERED ACCOUNT USER ID
    // --------------------------------------------------

    const userId = mappingResult.game_user_id;

    state.registeredUserId = mappingResult.user_id;

    // --------------------------------------------------
    // VALIDATE TABLE / NICKNAME
    // --------------------------------------------------

    if (
        !tableId ||
        tableId < 100000 ||
        tableId > 999999
    ) {

        alert("Invalid Table ID");

        return;
    }

    if (!nickname) {

        alert("Please enter player name");

        return;
    }

    // --------------------------------------------------
    // JOIN / RECONNECT EXISTING PLAYER
    // --------------------------------------------------

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_join_table",
            {
                p_table_id: tableId,
                p_password: password,
                p_user_id: userId,
                p_display_name: nickname
            }
        );

    const joinResult =
        data?.[0];

    // --------------------------------------------------
    // JOIN ERROR
    // --------------------------------------------------

    if (error) {

        console.error(
            "JOIN TABLE ERROR:",
            error
        );

        alert(
            error.message ||
            "Unable to join table."
        );

        return;
    }

    if (!joinResult) {

        console.error(
            "JOIN TABLE RETURNED NO RESULT"
        );

        alert("Join failed.");

        return;
    }

    // --------------------------------------------------
    // ACCEPT ONLY SUCCESS / RECONNECTED
    // --------------------------------------------------

    if (
        joinResult.status !== "success" &&
        joinResult.status !== "reconnected"
    ) {

        console.error(
            "JOIN TABLE FAILED:",
            joinResult
        );

        alert(
            joinResult.message ||
            "Unable to join table."
        );

        return;
    }

    // --------------------------------------------------
    // SAVE PLAYER STATE
    // --------------------------------------------------

    state.userId =
        joinResult.user_id;

    state.tableId =
        tableId;

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

    localStorage.setItem(
        "crdg_table",
        tableId
    );

    localStorage.setItem(
        "crdg_nickname",
        nickname
    );

// --------------------------------------------------
// CHECK RECONNECT
// --------------------------------------------------

const isReconnect =
    joinResult.status === "reconnected";

// ==================================================
// RECONNECT EXISTING ACTIVE GAME
// ==================================================

if (
    isReconnect &&
    joinResult.session_id
) {

    state.sessionId =
        Number(joinResult.session_id);

    localStorage.setItem(
        "crdg_session_id",
        String(state.sessionId)
    );

    state.joined = true;

    // Hide join/lobby screens
    document
        .getElementById("joinScreen")
        .classList.add("hidden");

    document
        .getElementById("lobbyScreen")
        .classList.add("hidden");

    // Normal reconnect:
    // initialize the game.
    //
    // Manual refresh:
    // refreshGame() will reload the state itself.
    if (!refreshInProgress) {

        await enterGame();

    }

    return;
}
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

// Remove the active-turn highlight from every seat.
// The highlight is reapplied by loadPlayers() using the authoritative turn seat.
function clearActiveTurnSeatDisplay() {
    document
        .querySelectorAll(".opponent-seat.active-turn-seat")
        .forEach(element => element.classList.remove("active-turn-seat"));

    document
        .getElementById("myInfo")
        ?.classList.remove("active-turn-self");
}


async function loadPlayers(playersData = null) {

    //let dlr_name = "YOU";

    let data = playersData;

    if (!data) {

        const { data: rpcData, error } =
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

        data = rpcData;
    }

    if (!data) return;

    // Seats are rebuilt on every player refresh; remove the previous turn glow first.
    clearActiveTurnSeatDisplay();

            // =================================================
        // UPDATE TOP BAR POT
        // Friends Rummy entry fee = 80 per player
        // =================================================

        const potAmount =
            (Array.isArray(data) ? data.length : 0) * 80;

        const potEl =
            document.getElementById("topPot");

        if (potEl) {
            potEl.innerText = potAmount;
        }


        const playerCountEl =
            document.getElementById("topPlayerCount");

        if (playerCountEl) {
            playerCountEl.innerText = data.length;
        }

    
        for (let i = 1; i <= 5; i++) {
            const seat = document.getElementById("opp" + i);

            if (seat) {
                seat.innerHTML = "";
                seat.style.display = "none";
            }
        }


    state.myScore = 0;

    data.forEach(player => {

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

        const targetEl = document.getElementById(target);

        if (!targetEl) return;

        targetEl.style.display = "block";

        document.getElementById(target).innerHTML = `
        <div>
            <b>${player.display_name}${icons}</b>
        </div>

        <div>
            Score : ${player.points || 0}
        </div>
        ${statusHtml}
        `;

        // Show the same active-turn highlight on every connected player's screen.
        // The local player uses #myPlayerPanel; opponents use their mapped seat box.
        const turnDisplayAllowed =
            !state.tableCompleted &&
            !state.resultWindowOpened &&
            !state.declarationMode &&
            Number.isFinite(Number(state.currentTurnSeat)) &&
            Number(state.currentTurnSeat) > 0;

        if (
            turnDisplayAllowed &&
            Number(player.seat_no) === Number(state.currentTurnSeat)
        ) {
            targetEl.classList.add("active-turn-seat");
        }
    });
   
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

    const mySeatIsActive =
        !state.tableCompleted &&
        !state.resultWindowOpened &&
        !state.declarationMode &&
        Number(state.seatNo) === Number(state.currentTurnSeat) &&
        Number(state.currentTurnSeat) > 0;

    // Keep the local player's turn indicator compact: animate only "You".
    const myInfoElement = document.getElementById("myInfo");
    myInfoElement?.classList.toggle("active-turn-self", mySeatIsActive);


        // =====================================================
// MY SCORE DISPLAY
// POINTS = no cumulative Score display
// POOL   = keep cumulative Score display
// =====================================================

        let myScoreHtml = "";

        if (
            typeof GAME_TYPE === "undefined" ||
            GAME_TYPE !== "POINTS"
        )
        {
            myScoreHtml =
                `Score : ${state.myScore || 0}`;
        }

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
        data.find(
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

    return data;
}

// =====================================================
// FIRST GAME ENTRY: ONE FACE-DOWN CARD TO EACH PLAYER
// Uses the final seat_no values saved by the start-game RPC.
// This is visual only and never changes game/database state.
// =====================================================

async function animateInitialSeatCardDistribution(players) {
    if (
        !Array.isArray(players) ||
        players.length === 0 ||
        !state.sessionId ||
        !state.userId
    ) {
        return;
    }

    const stock = document.getElementById("stockCard");
    if (!stock) return;

    const animationKey =
        `crdg_initial_seat_cards_${state.sessionId}_${state.userId}`;

    try {
        // Do not replay on refresh/rejoin in the same session.
        if (localStorage.getItem(animationKey)) return;
        localStorage.setItem(animationKey, "started");
    } catch (_) {}

    // =====================================================
    // DETERMINE TOSS ORDER
    // First-turn player -> clockwise -> dealer
    // =====================================================

    const seatSorted = [...players].sort(
        (a, b) => Number(a.seat_no) - Number(b.seat_no)
    );

    const firstTurnSeat = Number(state.currentTurnSeat);
    const dealerSeat = Number(state.dealerSeat);

    let firstIndex = seatSorted.findIndex(
        p => Number(p.seat_no) === firstTurnSeat
    );

    if (firstIndex < 0) firstIndex = 0;

    const rotatedPlayers = seatSorted
        .slice(firstIndex)
        .concat(seatSorted.slice(0, firstIndex));

    const dealerIndex = rotatedPlayers.findIndex(
        p => Number(p.seat_no) === dealerSeat
    );

    const orderedPlayers = dealerIndex >= 0
        ? rotatedPlayers.slice(0, dealerIndex + 1)
        : rotatedPlayers;

    // =====================================================
    // TOSS CARD VALUES
    // First-turn player gets highest; dealer gets lowest.
    // Visual only: does not change actual game cards.
    // =====================================================

    const tossRanksByCount = {
        2: [9, 2],
        3: [9, 6, 2],
        4: [9, 6, 5, 2],
        5: [9, 6, 5, 4, 2],
        6: [9, 6, 5, 4, 3, 2]
    };

    const ranks =
        tossRanksByCount[Math.min(6, orderedPlayers.length)] ||
        [9, 6, 5, 4, 3, 2];

    const suits = ["♣", "♦", "♥", "♠", "♣", "♦"];

    const tossCards = orderedPlayers.map(
        (_, i) => `${ranks[i] ?? Math.max(2, 9 - i)}${suits[i % suits.length]}`
    );

    // =====================================================
    // SOURCE: STOCK CARD
    // =====================================================

    const sourceRect = stock.getBoundingClientRect();

    const sourceX = sourceRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top + sourceRect.height / 2;

    const canAnimate =
        typeof Element.prototype.animate === "function" &&
        !(
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );

    const tossFlyers = [];

    // =====================================================
    // CREATE ALL PLAYER CARDS FIRST
    // Do not animate inside this loop.
    // =====================================================

    for (
        let seatIndex = 0;
        seatIndex < orderedPlayers.length;
        seatIndex++
    ) {
        const player = orderedPlayers[seatIndex];

        let target = null;

        const isMe =
            String(player.user_id).toLowerCase() ===
            String(state.userId).toLowerCase();

        if (isMe) {
            target =
                document.getElementById("myInfo") ||
                document.querySelector(".my-player-panel");
        } else {
            // Preserve existing visual-seat mapping.
            let relative =
                Number(player.fixed_seat_no) -
                Number(state.fixedSeatNo);

            if (relative < 0) relative += 6;

            const targetIdByRelativeSeat = {
                1: "opp4",
                2: "opp2",
                3: "opp1",
                4: "opp3",
                5: "opp5"
            };

            target = document.getElementById(
                targetIdByRelativeSeat[relative]
            );
        }

        if (!target) continue;

        const targetRect = target.getBoundingClientRect();

        if (!targetRect.width || !targetRect.height) continue;

        // Larger face-up toss card.
        const cardWidth = 64;
        const cardHeight = 90;

        const cardValue = tossCards[seatIndex];

        const isRed =
            cardValue.includes("♥") ||
            cardValue.includes("♦");

        const flyer = document.createElement("div");

        flyer.setAttribute("aria-hidden", "true");

        Object.assign(flyer.style, {
            position: "fixed",
            left: `${sourceX - cardWidth / 2}px`,
            top: `${sourceY - cardHeight / 2}px`,
            width: `${cardWidth}px`,
            height: `${cardHeight}px`,
            zIndex: "100000",
            pointerEvents: "none",
            border: "2px solid #f4f4f4",
            borderRadius: "9px",
            boxSizing: "border-box",
            background: "linear-gradient(145deg,#fff,#f4f4f4)",
            boxShadow: "0 5px 14px rgba(0,0,0,.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isRed ? "#d01824" : "#172033",
            fontWeight: "900",
            fontFamily: "Arial,sans-serif",
            fontSize: "30px",
            lineHeight: "1"
        });

        flyer.textContent = cardValue;

        document.body.appendChild(flyer);

        const dx =
            targetRect.left + targetRect.width / 2 - sourceX;

        const dy =
            targetRect.top + targetRect.height / 2 - sourceY;

        // Save each destination for simultaneous animation.
        flyer.dataset.dx = String(dx);
        flyer.dataset.dy = String(dy);

        tossFlyers.push(flyer);
    }

    // =====================================================
    // ANIMATE ALL CARDS SIMULTANEOUSLY
    // =====================================================

    const tossFlightPromises = tossFlyers.map(flyer => {
        const dx = Number(flyer.dataset.dx || 0);
        const dy = Number(flyer.dataset.dy || 0);

        if (canAnimate) {
            try {
                const flight = flyer.animate(
                    [
                        {
                            transform:
                                "translate3d(0,0,0) scale(.72) rotate(0deg)",
                            opacity: 1
                        },
                        {
                            transform:
                                `translate3d(${dx * .62}px,${dy * .62 - 18}px,0) scale(.92) rotate(7deg)`,
                            opacity: 1,
                            offset: .68
                        },
                        {
                            transform:
                                `translate3d(${dx}px,${dy}px,0) scale(.9) rotate(0deg)`,
                            opacity: 1
                        }
                    ],
                    {
                        duration: 300,
                        easing: "cubic-bezier(.2,.72,.22,1)",
                        fill: "forwards"
                    }
                );

                return flight.finished.catch(() => {});
            } catch (_) {}
        }

        return new Promise(resolve => setTimeout(resolve, 300));
    });

    // Play one tick for the simultaneous toss.
    try {
        playDealTick();
    } catch (_) {}

    // Wait for every card to finish its flight.
    await Promise.all(tossFlightPromises);

    // =====================================================
    // KEEP ALL TOSS CARDS VISIBLE TOGETHER
    // =====================================================

    await new Promise(resolve => setTimeout(resolve, 1000));

    // =====================================================
    // CLEAN UP TOSS CARDS
    // =====================================================

    // CLEAN UP TOSS CARDS AND TEMPORARY EMPTY BOXES
    tossFlyers.forEach(flyer => flyer.remove());

    // Hide temporary empty toss/card placeholders, if present.
    document.querySelectorAll(
        ".initial-seat-card, .initial-toss-card, .empty-toss-card"
    ).forEach(el => el.remove());

    try {
        localStorage.setItem(animationKey, "1");
    } catch (_) {}
}


async function loadLobbyState() {

    // =================================================
    // GET TABLE STATE
    // =================================================

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_table_state",
            {
                p_table_id: state.tableId
            }
        );


    if (error) {

        console.error(
            "Lobby table state error:",
            error
        );

        return;
    }


    if (!data || !data.length) {
        return;
    }


    const s = data[0];


    // =================================================
    // SHOW PLAYER COUNT
    // =================================================

    document.getElementById(
        "lobbyPlayers"
    ).innerText = s.player_count;


    // =================================================
    // GET LOBBY PLAYERS
    // =================================================

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

        console.error(
            "Lobby players error:",
            playersError
        );

        return;
    }


    // =================================================
    // CLEAR SEATS
    // =================================================

    for (let i = 1; i <= 6; i++) {

        const seat =
            document.getElementById(
                "seat" + i
            );

        if (seat) {

            seat.innerText =
                `Seat ${i} : Empty`;
        }
    }


    // =================================================
    // DISPLAY PLAYERS
    // =================================================

    if (players) {

        players.forEach(p => {

            const seat =
                document.getElementById(
                    "seat" + p.seat_no
                );

            if (seat) {

                seat.innerText =
                    `Seat ${p.seat_no} : ${p.display_name}`;
            }

        });
    }


    // =================================================
    // DETERMINE HOST
    // =================================================

    const currentUser =
    String(state.userId).toLowerCase();

const currentPlayer =
    players?.find(
        p =>
            String(p.user_id).toLowerCase() === currentUser
    );

const isHost =
    currentPlayer?.is_host === true;


    // =================================================
    // HOST START AREA
    // =================================================

    const hostStartArea =
        document.getElementById(
            "hostStartArea"
        );

    const guestWaitingMessage =
        document.getElementById(
            "guestWaitingMessage"
        );

    const startButton =
        document.getElementById(
            "btnStartGame"
        );

    const hostStartMessage =
        document.getElementById(
            "hostStartMessage"
        );


    if (isHost) {

        // ---------------------------------------------
        // HOST
        // ---------------------------------------------

        hostStartArea.style.display =
            "block";

        guestWaitingMessage.style.display =
            "none";


        if (s.player_count >= 2) {

            startButton.disabled =
                false;

            hostStartMessage.innerText =
                "Players are ready. You can start the game.";

        } else {

            startButton.disabled =
                true;

            hostStartMessage.innerText =
                "Waiting for at least 2 players...";
        }

    } else {

        // ---------------------------------------------
        // OTHER PLAYERS
        // ---------------------------------------------

        hostStartArea.style.display =
            "none";

        guestWaitingMessage.style.display =
            "block";
    }


    // =================================================
    // TABLE ALREADY RUNNING
    // =================================================

    if (s.status === "running") {

        const {
            data: sessions
        } =
            await supabaseClient
                .from("crdg_game_sessions")
                .select("session_id")
                .eq(
                    "table_id",
                    state.tableId
                )
                .order(
                    "session_id",
                    {
                        ascending: false
                    }
                )
                .limit(1);


        if (
            sessions &&
            sessions.length
        ) {

            state.sessionId =
                sessions[0].session_id;

            await enterGame();
        }
    }

}

// =====================================================
// HOST START GAME
// =====================================================

// =====================================================
// HOST START FRIENDS GAME
// =====================================================

// =====================================================
// HOST START GAME
// =====================================================

async function hostStartGame() {

    // -----------------------------------------------
    // Prevent accidental double-click
    // -----------------------------------------------

    const button =
        document.getElementById(
            "btnStartGame"
        );

    if (!button) {
        return;
    }

    if (button.disabled) {
        return;
    }

    button.disabled = true;

    button.innerText =
        "STARTING...";

    try {

        // =================================================
        // REGISTERED ACCOUNT SESSION
        // =================================================

        const sessionToken =
            localStorage.getItem(
                "crdgn_session_token"
            );

        if (!sessionToken) {

            alert(
                "Your login session is not available. Please login again."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // DETERMINE GAME TYPE
        // =================================================

        const gameType =
            (
                localStorage.getItem(
                    "crdg_game_type"
                ) || "FRIENDS"
            ).toUpperCase();


        // =================================================
        // CRDGP START
        // POINTS ONLY
        // =================================================

        if (gameType === "POINTS") {

            const {
                data,
                error
            } = await supabaseClient.rpc(
                "crdgp_start_points_game",
                {
                    p_session_token:
                        sessionToken,

                    p_table_id:
                        state.tableId
                }
            );


            // =================================================
            // DATABASE ERROR
            // =================================================

            if (error) {

                console.error(
                    "POINTS start game error:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to start POINTS game."
                );

                button.disabled = false;

                button.innerText =
                    "▶ START GAME";

                return;
            }


            // =================================================
            // READ RESULT
            // =================================================

            const result =
                Array.isArray(data)
                    ? data[0]
                    : data;


            // =================================================
            // POINTS START REJECTED
            // =================================================

            if (
                !result ||
                result.status !== "success" ||
                !result.session_id
            ) {

                console.error(
                    "POINTS start game rejected:",
                    result
                );

                alert(
                    result?.message ||
                    "Unable to start POINTS game."
                );

                button.disabled = false;

                button.innerText =
                    "▶ START GAME";

                return;
            }


            // =================================================
            // POINTS START SUCCESS
            // =================================================


            state.sessionId =
                result.session_id;


            await enterGame();

            return;
        }


        // =================================================
        // EXISTING FRIENDS START
        // =================================================
        //
        // IMPORTANT:
        // Existing Friends behavior is unchanged.
        // =================================================

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdgn_start_friends_game",
            {
                p_session_token:
                    sessionToken,

                p_table_id:
                    state.tableId
            }
        );


        // =================================================
        // DATABASE ERROR
        // =================================================

        if (error) {

            console.error(
                "Friends start game error:",
                error
            );

            alert(
                error.message ||
                "Unable to start Friends game."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // READ RESULT
        // =================================================

        const result =
            Array.isArray(data)
                ? data[0]
                : data;


        // =================================================
        // FRIENDS START REJECTED
        // =================================================

        if (
            !result ||
            result.success !== true ||
            !result.session_id
        ) {

            console.error(
                "Friends start game rejected:",
                result
            );

            alert(
                result?.message ||
                "Unable to start Friends game."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // FRIENDS START SUCCESS
        // =================================================


        state.sessionId =
            result.session_id;


        await enterGame();


    } catch (error) {

        console.error(
            "Start game exception:",
            error
        );

        alert(
            error.message ||
            "Unable to start game."
        );

        button.disabled = false;

        button.innerText =
            "▶ START GAME";
    }

}



// =====================================================
// LIVEKIT VOICE CHAT
// =====================================================

let crdgVoiceRoom = null;
let crdgVoiceConnecting = false;
let crdgVoiceMicEnabled = false;

function updateVoiceMicButton(enabled, message) {
    const btn = document.getElementById("btnVoiceMic");
    if (!btn) return;

    crdgVoiceMicEnabled = enabled;

    btn.style.background = enabled ? "#168b45" : "#444";
    btn.style.borderColor = enabled ? "#65e69a" : "rgba(255,255,255,0.4)";
    btn.style.color = "#fff";

    btn.innerText = enabled ? "🎙" : "🎙";
    btn.title = message;
    btn.setAttribute("aria-pressed", String(enabled));
    btn.setAttribute(
        "aria-label",
        enabled ? "Mute microphone" : "Turn microphone on"
    );
}

async function connectCrdgVoice() {

    if (crdgVoiceRoom || crdgVoiceConnecting) return;

    if (!window.LivekitClient) {
        console.error("LiveKit SDK is not loaded");
        return;
    }

    if (!state.activeGameRegistered) {
        console.warn("Voice connection blocked: active game not registered");
        return;
    }

    crdgVoiceConnecting = true;

    try {
        const sessionToken =
            localStorage.getItem("crdgn_session_token");

        if (!sessionToken) {
            throw new Error("Login session token not found");
        }

        const { data, error } =
            await supabaseClient.functions.invoke(
                "crdg_voice_token",
                {
                    body: {
                        sessionToken: sessionToken,
                        gameUserId: state.userId,
                        tableId: state.tableId,
                        sessionId: state.sessionId
                    }
                }
            );

        if (error) throw error;

        if (!data || data.success !== true) {
            throw new Error(
                data?.message || "Unable to obtain voice token"
            );
        }

        const room = new LivekitClient.Room();

        room.on(
            LivekitClient.RoomEvent.TrackSubscribed,
            (track, publication, participant) => {

                if (track.kind === "audio") {

                    const audioElement = track.attach();

                    audioElement.autoplay = true;

                    // Respect the current speaker ON/OFF setting.
                    audioElement.muted = !crdgVoiceSpeakerEnabled;

                    crdgVoiceAudioElements.add(audioElement);

                    document.body.appendChild(audioElement);

                    console.log(
                        "Voice received from:",
                        participant.name
                    );
                }
            }
        );

        room.on(
            LivekitClient.RoomEvent.TrackUnsubscribed,
            (track) => {

                track.detach().forEach(element => {

                    crdgVoiceAudioElements.delete(element);

                    element.remove();
                });
            }
        );

        room.on(
            LivekitClient.RoomEvent.Disconnected,
            () => {
                console.log("LiveKit disconnected");
                crdgVoiceRoom = null;
                updateVoiceMicButton(false, "Voice disconnected");
            }
        );

        room.on(
            LivekitClient.RoomEvent.AudioPlaybackStatusChanged,
            () => {
                if (!room.canPlaybackAudio) {
                    console.warn("Voice audio needs user interaction");
                }
            }
        );

        await room.connect(data.url, data.token);

        crdgVoiceRoom = room;

        // Join with microphone OFF.
        await room.localParticipant.setMicrophoneEnabled(false);

        updateVoiceMicButton(false, "Voice connected — microphone muted");

        console.log(
            "Rummy voice connected:",
            data.roomName,
            data.participantName
        );

    } catch (error) {
        console.error("Rummy voice connection failed:", error);

        updateVoiceMicButton(
            false,
            "Voice connection failed"
        );

    } finally {
        crdgVoiceConnecting = false;
    }
}


async function disconnectCrdgVoice() {

    const room = crdgVoiceRoom;

    // Clear the reference immediately to prevent duplicate operations.
    crdgVoiceRoom = null;
    crdgVoiceMicEnabled = false;

    updateVoiceMicButton(false, "Voice disconnected");

    if (!room) return;

    try {
        await room.disconnect();
        console.log("Rummy voice disconnected");
    } catch (error) {
        console.error("Voice disconnection failed:", error);
    }
}


// Incoming voice audio control
let crdgVoiceSpeakerEnabled = true;
let crdgVoiceAudioElements = new Set();

function updateVoiceSpeakerButton() {

    const btn = document.getElementById("btnVoiceSpeaker");
    if (!btn) return;

    btn.style.background =
        crdgVoiceSpeakerEnabled ? "#168b45" : "#444";

    btn.style.borderColor =
        crdgVoiceSpeakerEnabled
            ? "#65e69a"
            : "rgba(255,255,255,0.4)";

    btn.innerText =
        crdgVoiceSpeakerEnabled ? "🔊" : "🔇";

    btn.title =
        crdgVoiceSpeakerEnabled
            ? "Voice Chat ON"
            : "Voice Chat OFF";

    btn.setAttribute(
        "aria-pressed",
        String(crdgVoiceSpeakerEnabled)
    );

    btn.setAttribute(
        "aria-label",
        crdgVoiceSpeakerEnabled
            ? "Turn voice chat off"
            : "Turn voice chat on"
    );
}


function setCrdgVoiceSpeaker(enabled) {

    crdgVoiceSpeakerEnabled = enabled;

    // 1. Control incoming voice from other players.
    crdgVoiceAudioElements.forEach(audio => {
        audio.muted = !enabled;
    });

    // 2. Control card pickup sound.
   // pickupSound.muted = !enabled;

    // 3. Control card discard sound.
   // discardSound.muted = !enabled;

    // 4. Control turn countdown sound.
   // turnTickAudio.muted = !enabled;

    // Immediately stop currently playing game sounds when OFF.
    if (!enabled) {

        [pickupSound, discardSound, turnTickAudio].forEach(audio => {

            audio.pause();
            audio.currentTime = 0;

        });
    }

    updateVoiceSpeakerButton();
}



// =====================================================
// MICROPHONE BUTTON
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

    const btn = document.getElementById("btnVoiceMic");

    const speakerBtn =
        document.getElementById("btnVoiceSpeaker");

    if (speakerBtn) {

        updateVoiceSpeakerButton();

        speakerBtn.addEventListener("click", () => {

            setCrdgVoiceSpeaker(!crdgVoiceSpeakerEnabled);

        });
    }

    if (!btn) {
        console.warn("Voice microphone button not found");
        return;
    }

    updateVoiceMicButton(false, "Microphone muted");

    btn.addEventListener("click", async () => {

        if (!crdgVoiceRoom) {
            alert("Voice is not connected yet. Please wait.");
            return;
        }

        try {
            // Also handles browsers that require a user gesture
            // before remote audio playback can begin.
            if (!crdgVoiceRoom.canPlaybackAudio) {
                await crdgVoiceRoom.startAudio();
            }

            const enableMic = !crdgVoiceMicEnabled;

            await crdgVoiceRoom.localParticipant
                .setMicrophoneEnabled(enableMic);

            updateVoiceMicButton(
                enableMic,
                enableMic ? "Microphone ON — tap to mute" :
                            "Microphone OFF — tap to speak"
            );

        } catch (error) {
            console.error("Microphone operation failed:", error);

            updateVoiceMicButton(
                false,
                "Microphone unavailable"
            );

            alert("Unable to access microphone. Check microphone permission.");
        }
    });

});



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

  // Hide all real-game cards immediately after Start Game, before any async
  // load can paint the stock, open pile, joker, or 13-card hand prematurely.
  const initialAnimationElements = [
    document.getElementById("stockCard"),
    document.getElementById("openVisual"),
    document.getElementById("jokerVisual"),
    document.getElementById("my-hand")
  ].filter(Boolean);
  const previousCardVisibility = initialAnimationElements.map(el => el.style.visibility);
  initialAnimationElements.forEach(el => { el.style.visibility = "hidden"; });

  await loadTopGameType();
  await loadSessionInfo();

  // Load final server-saved seating. This is read-only; no DB/RPC state is changed.
  const { data: initialSeatPlayers, error: initialSeatPlayersError } =
    await supabaseClient.rpc("crdg_get_lobby_players", {
      p_table_id: state.tableId
    });

  if (initialSeatPlayersError) {
    console.error("Initial seat order load failed:", initialSeatPlayersError);
  }

  await loadPlayers(initialSeatPlayers || null);
  await animateInitialSeatCardDistribution(initialSeatPlayers || []);

  // Load the authoritative hand/open/joker data while the real-card UI remains hidden.
  await loadGame();
  startTurnTimer();
  updateActionButtons();
  renderHand();

  // Rummy toss result pause: briefly show only the actual discarded/open card,
  // then reveal stock, joker and the real 13-card hand together.
  const openEl = document.getElementById("openVisual");
  if (openEl) openEl.style.visibility = "visible";
  await new Promise(resolve => setTimeout(resolve, 1000));

  initialAnimationElements.forEach((el, index) => {
    el.style.visibility = previousCardVisibility[index] || "";
  });

  calculateDealScore();

  // Save an active-game pointer only for a genuinely active player/table.
  if (
      !state.activeGameRegistered &&
      state.playerStatus !== "ELIMINATED" &&
      state.tableCompleted !== true
  ) {
      await setActiveGame();
  }

    // Connect voice only after active-game registration succeeds.
  if (
      state.activeGameRegistered &&
      state.playerStatus !== "ELIMINATED" &&
      state.tableCompleted !== true
  ) {
      connectCrdgVoice();
  }



  subscribeRealtime();
  startPointsHeartbeat();
  startNetworkMonitor();
}


async function setActiveGame() {
    if (state.tableCompleted === true) {
        await cleanupActiveGamePointer(null, "registration blocked: table completed");
        return;
    }

    if (String(state.playerStatus || "").toUpperCase() === "ELIMINATED") {
        await cleanupActiveGamePointer(state.userId, "registration blocked: player eliminated");
        return;
    }

    const sessionToken =
        localStorage.getItem("crdgn_session_token");

    if (!sessionToken) {
        console.warn("Active game: session token not found");
        return;
    }

    // Recover account mapping if this entry path did not set it.
    if (!state.registeredUserId) {
        const gameType = (
            localStorage.getItem("crdg_game_type") || "FRIENDS"
        ).toUpperCase();

        const {
            data: mappingData,
            error: mappingError
        } = await supabaseClient.rpc(
            "crdgn_get_or_create_game_user_id",
            {
                p_session_token: sessionToken,
                p_game_type: gameType
            }
        );

        const mappingResult = Array.isArray(mappingData)
            ? mappingData[0]
            : mappingData;

        if (mappingError) {
            console.error(
                "ACTIVE GAME ACCOUNT MAPPING ERROR:",
                mappingError
            );
            return;
        }

        if (!mappingResult?.success || !mappingResult.user_id) {
            console.error(
                "ACTIVE GAME ACCOUNT ID NOT FOUND:",
                mappingResult
            );
            return;
        }

        state.registeredUserId = mappingResult.user_id;
    }

    const { data, error } = await supabaseClient.rpc(
        "crdgn_set_active_game",
        {
            p_session_token: sessionToken,
            p_game_user_id: state.userId,
            p_table_id: state.tableId,
            p_session_id: state.sessionId
        }
    );

    if (error) {
        console.error("Active game save failed:", error);
        return;
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.success) {
        console.warn(
            "Active game not saved:",
            result?.message || "No successful response",
            result
        );
        return;
    }
    state.activeGameRegistered = true;
}



async function startGame() {

    const sessionToken =
        localStorage.getItem(
            "crdgn_session_token"
        );


    if (!sessionToken) {

        console.error(
            "Friends login session missing."
        );

        return false;
    }


    const {
        data,
        error
    } = await supabaseClient.rpc(
        "crdgn_start_friends_game",
        {
            p_session_token:
                sessionToken,

            p_table_id:
                state.tableId
        }
    );


    if (error) {

        console.error(
            "Friends automatic start error:",
            error
        );

        alert(
            error.message ||
            "Unable to start Friends game."
        );

        return false;
    }


    const result =
        Array.isArray(data)
            ? data[0]
            : data;


    if (
        !result ||
        result.success !== true ||
        !result.session_id
    ) {

        console.error(
            "Friends automatic start rejected:",
            result
        );

        alert(
            result?.message ||
            "Unable to start Friends game."
        );

        return false;
    }



    state.sessionId =
        result.session_id;


    await enterGame();


    return true;
}







async function declareGame() {

    if (state.declarationMode || state.groupsLocked) {
        return;
    }

    if (
        Number(state.seatNo) !== Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const totalCards = state.groups.reduce(
        (total, group) => total + group.length,
        0
    );

    if (totalCards !== 14 || getTotalCards() !== 14) {
        alert("Please pick a card before declaring.");
        return;
    }

    // Capture the selected card and its exact position once.
    const selection = getSingleSelectedCard();

    if (!selection) {
        alert(
            state.selectedCards?.length > 1
                ? "Please select only one card before declaration."
                : "Please select one card to discard before declaration."
        );
        return;
    }

    const selectedGroup = Number(selection.group);
    const selectedIndex = Number(selection.index);

    if (
        !Number.isInteger(selectedGroup) ||
        !Number.isInteger(selectedIndex) ||
        selectedGroup < 0 ||
        selectedGroup >= state.groups.length ||
        selectedIndex < 0 ||
        selectedIndex >= (state.groups[selectedGroup]?.length ?? 0)
    ) {
        alert("The selected card position is invalid. Please select again.");
        return;
    }

    // Read the card directly from the current group position.
    const declareCard = state.groups[selectedGroup][selectedIndex];

    // Ensure the selection still refers to that exact card.
    if (declareCard !== selection.card) {
        console.error("Declaration selection mismatch:", {
            selectedCard: selection.card,
            cardAtPosition: declareCard,
            selectedGroup,
            selectedIndex
        });

        alert("The selected card changed. Please select it again.");
        return;
    }

    if (!confirm("Confirm Declaration?")) {
        return;
    }

    // Freeze a copy of the 14-card arrangement before any RPC awaits.
    const groupsBeforeRemoval = JSON.parse(
        JSON.stringify(state.groups)
    );

    // Remove ONLY the selected discard card from the copied groups.
    const groupsForDeclaration = JSON.parse(
        JSON.stringify(groupsBeforeRemoval)
    );

    const removedCard = groupsForDeclaration[selectedGroup].splice(
        selectedIndex,
        1
    )[0];

    const remainingCards = groupsForDeclaration.flat();

    // Strict checks: 14 cards before, 13 after, and the right card removed.
    if (
        removedCard !== declareCard ||
        remainingCards.length !== 13 ||
        remainingCards.includes(declareCard)
    ) {
        console.error("Declaration removal validation failed:", {
            declareCard,
            removedCard,
            selectedGroup,
            selectedIndex,
            groupsBeforeRemoval,
            groupsForDeclaration,
            remainingCardCount: remainingCards.length,
            declarationCardStillPresent: remainingCards.includes(declareCard)
        });

        alert(
            "Declaration card removal failed. Please arrange your cards and try again."
        );
       // return;
    }

    // Validate the remaining 13 cards.
    const {
        data: scoreData,
        error: scoreError
    } = await supabaseClient.rpc(
        "crdg_calculate_running_score",
        {
            p_groups: groupsForDeclaration,
            p_joker_card: state.jokerCard
        }
    );

    if (scoreError) {
        console.error("Declaration score validation failed:", scoreError);
        return;
    }

    const declarationScore = Number(scoreData || 0);

    if (declarationScore !== 0) {

        alert("OOPS...! INVALID DECLARATION");

        state.isInvalidDeclaration = true;
        state.isDropped = true;
        state.dropType = "INVALID_DECLARE";

        const {
            data,
            error
        } = await supabaseClient.rpc(
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

        if (error) {
            console.error("Invalid declaration RPC failed:", error);
            return;
        }

        renderHand();
        return;
    }

    // Submit the valid declaration with the same captured card and groups.
    const {
        data: declarationData,
        error: declarationError
    } = await supabaseClient.rpc(
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

    if (declarationError) {
        console.error("Declaration RPC failed:", declarationError);
        return;
    }

    if (declarationData?.[0]?.status !== "valid") {
        console.error("Declaration was not accepted:", declarationData);
        alert("Declaration was not accepted by the server.");
        return;
    }

    // Stop the regular turn countdown.
    clearInterval(state.turnTimerInterval);
    state.turnTimerInterval = null;
    stopTurnCountdownTicking();

    const turnTimerLabel = document.getElementById("turnTimer");

    if (turnTimerLabel) {
        turnTimerLabel.innerText = "-";
    }

    clearDeclarationTimerDisplay();

    // Save exactly the same 13-card groups as the final snapshot.
    const {
        data: finalGroupsData,
        error: finalGroupsError
    } = await supabaseClient.rpc(
        "crdg_submit_final_groups",
        {
            p_session_id: state.sessionId,
            p_table_id: state.tableId,
            p_user_id: state.userId,
            p_groups: groupsForDeclaration,
            p_joker_card: state.jokerCard
        }
    );

    console.log("DECLARATION SNAPSHOT CHECK", {
        declareCard,
        groupsForDeclaration,
        groupedCardCount: groupsForDeclaration.reduce(
            (total, group) => total + group.length,
            0
        ),
        finalGroupsData,
        finalGroupsError
    });

    if (finalGroupsError) {
        console.error(
            "Failed to submit final declaration groups:",
            finalGroupsError
        );
        return;
    }

    // The server accepted the declaration. Stop the active-seat animation
    // immediately, before the remaining local UI/score work completes.
    state.declarationMode = true;
    clearActiveTurnSeatDisplay();

    // Remember the declaration card for refresh/reconnect handling.
    try {
        const declarationStorageKey =
            "crdg_valid_declaration_" +
            state.sessionId + "_" +
            state.userId + "_" +
            state.groupsDealNo;

        localStorage.setItem(
            declarationStorageKey,
            JSON.stringify({
                valid: true,
                card: declareCard
            })
        );

    } catch (storageError) {
        console.error(
            "Unable to save valid declaration:",
            storageError
        );
    }

    // Lock groups after server confirmation.
    setGroupsLocked(true);

    // Update the local hand using the captured declaration card.
    const handIndex = state.hand.indexOf(declareCard);

    if (handIndex >= 0) {
        state.hand.splice(handIndex, 1);
    }

    // Remove the same selected position from the local grouped hand.
    // Do not use the mutable selection object again.
    const currentCardAtPosition =
        state.groups[selectedGroup]?.[selectedIndex];

    if (currentCardAtPosition === declareCard) {
        state.groups[selectedGroup].splice(selectedIndex, 1);
    } else {
        console.error(
            "Local groups changed after declaration submission:",
            {
                declareCard,
                currentCardAtPosition,
                selectedGroup,
                selectedIndex
            }
        );
    }

    clearCardSelection();

    renderHand();

    await calculateDealScore();

    // Enter the declarer's waiting state.
    state.declarationTimerStarted = true;

    clearDeclarationTimerDisplay();

    showDeclarerWaitingWindow();
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
        return null;
    }

    const score = Number(data || 0);

    document.getElementById("dealScore").innerText =
        "Deal Score : " + score;

    return score;
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


function getObservationResultCardHTML(card, cardClass) {
    if (card === "JOKER") {
        return `<div class="${cardClass}"><span class="result-card-printed-joker">JOKER</span></div>`;
    }

    const value = String(card ?? "");
    const suit = value.slice(-1);
    const rank = value.slice(0, -1);

    return `
        <div class="${cardClass}">
            <span class="result-card-rank">${rank}</span>
            <span class="result-card-suit">${suit}</span>
        </div>
    `;
}


async function loadDealResults()
{
    if (state.declarerWaitingTimerInterval) {
        clearInterval(state.declarerWaitingTimerInterval);
        state.declarerWaitingTimerInterval = null;
    }

    if (state.resultWindowLoaded) {
        return;
    }

    state.resultWindowLoaded = true;
    observationTimeRemaining = 30;

    document.getElementById("observationTimer").innerText = 30;

    const { data, error } = await supabaseClient.rpc(
        "crdg_get_deal_results_for_observation",
        {
            p_session_id: state.sessionId
        }
    );

    if (error) {
        console.error(error);
        return;
    }

    // The observation RPC filters players eliminated in earlier deals.
    const visibleData = Array.isArray(data) ? data : [];

    const jokerCard = state.jokerCard || "";

    const isRedJoker =
        jokerCard.includes("♥") ||
        jokerCard.includes("♦");

    const jokerStyle = isRedJoker
        ? 'color:red !important; -webkit-text-fill-color:red !important;'
        : 'color:white !important; -webkit-text-fill-color:white !important;';

    document.getElementById("resultJokerCard").innerHTML = `
        <span class="result-joker">
            Joker :
            <span style="${jokerStyle}">
                ${jokerCard}
            </span>
        </span>
    `;

    const container = document.getElementById("dealResultsContainer");

    container.innerHTML = `
        <div class="result-scroll">
            <table class="result-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Cards</th>
                        <th>Score</th>
                        <th>
                            ${
                                typeof GAME_TYPE !== "undefined" &&
                                GAME_TYPE === "POINTS"
                                    ? "Win/Loss"
                                    : "Total"
                            }
                        </th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="resultTableBody"></tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById("resultTableBody");

    // =====================================================
    // POINTS MULTIPLIER
    // =====================================================

    let pointsMultiplier = 1;
    let pointsTableId = null;

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "POINTS"
    ) {
        const { data: sessionInfo, error: sessionInfoError } =
            await supabaseClient
                .from("crdg_game_sessions")
                .select("table_id")
                .eq("session_id", state.sessionId)
                .maybeSingle();

        if (sessionInfoError || !sessionInfo) {
            console.error(
                "POINTS session table lookup failed:",
                sessionInfoError || state.sessionId
            );
            return;
        }

        pointsTableId = Number(sessionInfo.table_id);

        const { data: multiplierData, error: multiplierError } =
            await supabaseClient.rpc("crdgp_get_multiplier", {
                p_table_id: pointsTableId
            });

        if (multiplierError) {
            console.error(
                "POINTS multiplier RPC failed:",
                multiplierError
            );
            return;
        }

        pointsMultiplier = Number(multiplierData) || 1;
    }

    // =====================================================
    // RENDER OBSERVATION RESULTS
    // =====================================================

    visibleData.forEach(row => {

        // =====================================================
        // POINTS WIN / LOSS
        // =====================================================

        let pointsWinLoss = null;

        if (
            typeof GAME_TYPE !== "undefined" &&
            GAME_TYPE === "POINTS"
        ) {
            const dealScore = Number(row.current_deal_score) || 0;
            const multiplier = Number(pointsMultiplier) || 1;

            if (dealScore === 0) {

                // Winner receives the total loss points
                // multiplied by the table multiplier.

                const totalLoserScore = visibleData.reduce(
                    (sum, player) =>
                        sum + (Number(player.current_deal_score) || 0),
                    0
                );

                pointsWinLoss = totalLoserScore * multiplier;

            } else {

                // Loser loses his deal score multiplied by
                // the table multiplier.

                pointsWinLoss = -(dealScore * multiplier);
            }
        }

        // =====================================================
        // CARD VISIBILITY
        // =====================================================

        const isDroppedPlayer =
            row.drop_type === "DROP" ||
            row.drop_type === "MID_DROP";

        // Only the player who dropped has hidden cards.
        const showCards = !isDroppedPlayer;

        const hasGroupedHand =
            Array.isArray(row.grouped_hand) &&
            row.grouped_hand.length > 0;

        const hasOriginalHand =
            Array.isArray(row.original_hand) &&
            row.original_hand.length > 0;

        // A successful declarer should use their submitted groups,
        // not the original hand that might contain 14 cards.
        //
        // IMPORTANT:
        // Require a non-empty grouped_hand. An automatic winner
        // can match declaration_user_id while grouped_hand is NULL.
        // That player must fall back to original_hand.

        const isSuccessfulDeclarer =
            row.user_id &&
            row.declaration_user_id &&
            row.user_id === row.declaration_user_id &&
            row.drop_type !== "INVALID_DECLARE" &&
            hasGroupedHand;

        let html = "";

        // =====================================================
        // DISPLAY GROUPED CARDS OR FALL BACK TO ORIGINAL HAND
        // =====================================================

        if (showCards) {

            if (hasGroupedHand) {

                // Show submitted groups when available.

                row.grouped_hand.forEach(group => {

                    if (!Array.isArray(group) || group.length === 0) {
                        return;
                    }

                    html += `<div class="result-card-group">`;

                    group.forEach(card => {

                        let cardClass = "result-card";

                        if (
                            card.includes("♥") ||
                            card.includes("♦")
                        ) {
                            cardClass += " red-card";
                        }

                        if (isJokerCard(card)) {
                            cardClass += " joker-highlight";
                        }

                        html += getObservationResultCardHTML(
                            card,
                            cardClass
                        );
                    });

                    html += `</div>`;
                });

            } else if (
                !isSuccessfulDeclarer &&
                hasOriginalHand
            ) {

                // Fallback for non-declarers and automatic winners
                // whose grouped_hand is NULL or empty.

                html += `<div class="result-card-group">`;

                row.original_hand.forEach(card => {

                    let cardClass = "result-card";

                    if (
                        card.includes("♥") ||
                        card.includes("♦")
                    ) {
                        cardClass += " red-card";
                    }

                    if (isJokerCard(card)) {
                        cardClass += " joker-highlight";
                    }

                    html += getObservationResultCardHTML(
                        card,
                        cardClass
                    );
                });

                html += `</div>`;
            }
        }

        // =====================================================
        // CARDS CELL CONTENT
        // =====================================================

        let cardsContent = "-";

        if (isDroppedPlayer) {

            cardsContent =
                row.drop_type === "DROP"
                    ? "❌ DROP"
                    : "⛔ MID DROP";

        } else if (row.drop_type === "INVALID_DECLARE") {

            // Keep invalid declarer's hand visible when available.
            cardsContent =
                (hasGroupedHand || hasOriginalHand)
                    ? html
                    : "🚫 INVALID DECLARE";

        } else if (showCards && (hasGroupedHand || hasOriginalHand)) {

            cardsContent = html;
        }

        // =====================================================
        // ADD PLAYER ROW
        // =====================================================

        tbody.innerHTML += `
            <tr>
                <td>
                    ${row.display_name}
                </td>

                <td>
                    ${cardsContent}
                </td>

                <td style="text-align:center">
                    ${row.current_deal_score}
                </td>

                <td style="text-align:center;font-weight:bold;">
                    ${
                        typeof GAME_TYPE !== "undefined" &&
                        GAME_TYPE === "POINTS"
                            ? (
                                pointsWinLoss > 0
                                    ? "+" + pointsWinLoss
                                    : pointsWinLoss
                            )
                            : row.points
                    }
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

    // =====================================================
    // REJOIN CANDIDATES
    // =====================================================

    const rejoinPlayers = await loadRejoinCandidates();

    if (rejoinPlayers.length > 0) {

        const me = rejoinPlayers.find(
            p => p.user_id === state.userId
        );

        if (me) {
            showReJoinWindow(me);
        }
    }

    // =====================================================
    // POINTS : EXIT BUTTON
    // =====================================================

    if (
        typeof GAME_TYPE !== "undefined" &&
        GAME_TYPE === "POINTS"
    ) {
        const header = document.querySelector(
            "#dealResultModal .result-header"
        );

        if (header) {

            const oldButton = document.getElementById(
                "btnExitPointsTable"
            );

            if (oldButton) {
                oldButton.remove();
            }

            header.insertAdjacentHTML(
                "beforeend",
                `
                <button
                    id="btnExitPointsTable"
                    type="button"
                    onclick="exitPointsTable()"
                    style="
                        margin-left:auto;
                        margin-right:12px;
                        padding:8px 18px;
                        border:none;
                        border-radius:7px;
                        background:#c62828;
                        color:white;
                        font-size:14px;
                        font-weight:bold;
                        cursor:pointer;
                    "
                >
                    EXIT TABLE
                </button>
                `
            );
        }
    }

    // =====================================================
    // SHOW OBSERVATION MODAL
    // =====================================================

    document.getElementById("dealResultModal").style.display = "block";
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

window.onload = () => {

    const savedTable =
        localStorage.getItem("crdg_table");

    const savedUser =
        localStorage.getItem("crdg_user_id");

    // Restore only the minimum state.
    // Do NOT change screen visibility here.
    if (savedTable && savedUser) {

        state.tableId =
            parseInt(savedTable);

        state.userId =
            savedUser;
    }
};




// =====================================================
// RESTORE MY TABLE SEAT
// =====================================================
async function restoreMyTableSeat() {

    const savedSeat =
        localStorage.getItem("crdg_seat_no");

    const savedFixedSeat =
        localStorage.getItem("crdg_fixed_seat_no");

    if (
        savedSeat !== null &&
        savedFixedSeat !== null &&
        Number.isFinite(Number(savedSeat)) &&
        Number.isFinite(Number(savedFixedSeat))
    ) {
        state.seatNo = Number(savedSeat);
        state.fixedSeatNo = Number(savedFixedSeat);

        return true;
    }

    // Fallback for older localStorage / older tablepage.
    const {
        data: players,
        error
    } = await supabaseClient.rpc(
        "crdg_get_lobby_players",
        {
            p_table_id: state.tableId
        }
    );

    if (error) {
        console.error(
            "RESTORE MY SEAT ERROR:",
            error
        );
        return false;
    }

    const me = players?.find(
        player =>
            String(player.user_id).toLowerCase() ===
            String(state.userId).toLowerCase()
    );

    if (!me) {
        console.error(
            "RESTORE MY SEAT: Current player not found.",
            {
                userId: state.userId,
                tableId: state.tableId
            }
        );
        return false;
    }

    state.seatNo = Number(me.seat_no);
    state.fixedSeatNo = Number(me.fixed_seat_no);

    localStorage.setItem(
        "crdg_seat_no",
        String(state.seatNo)
    );

    localStorage.setItem(
        "crdg_fixed_seat_no",
        String(state.fixedSeatNo)
    );


    return true;
}



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


// =====================================================
// FRIENDS PAGE AUTO JOIN
// =====================================================
document.addEventListener(
    "DOMContentLoaded",
    async function () {

        const joinMode =
            localStorage.getItem("crdg_join_mode");


        // =================================================
        // NEW TABLE / NORMAL TABLEPAGE FLOW
        // =================================================

        if (joinMode === "new") {

            const tableId =
                localStorage.getItem("crdg_table");

            const nickname =
                localStorage.getItem("crdg_nickname");

            if (
                !tableId ||
                !nickname
            ) {
                return;
            }

            state.tableId =
                parseInt(tableId);

            state.nickname =
                nickname;

            state.userId =
                localStorage.getItem("crdg_user_id");

            // Restore the exact seat BEFORE entering the lobby/game.
            // tablepage already joined this player, so do not join again.
            await restoreMyTableSeat();

            state.joined = true;

            // ---------------------------------------------
            // Restore lobby display values
            // ---------------------------------------------

            document
                .getElementById("lobbyTableId")
                .innerText = state.tableId;

            document
                .getElementById("lobbySeat")
                .innerText = state.seatNo;

            await postJoinFlow();


            // Consume the one-time mode.
            localStorage.removeItem(
                "crdg_join_mode"
            );

            return;
        }


        // =================================================
        // ACTIVE GAME RECOVERY
        // =================================================

        if (joinMode === "active") {

            const tableId =
                localStorage.getItem("crdg_table");

            const nickname =
                localStorage.getItem("crdg_nickname");

            if (
                !tableId ||
                !nickname
            ) {
                return;
            }


            const tableInput =
                document.getElementById(
                    "tableIdInput"
                );

            const nicknameInput =
                document.getElementById(
                    "nickname"
                );


            if (tableInput) {
                tableInput.value =
                    tableId;
            }

            if (nicknameInput) {
                nicknameInput.value =
                    nickname;
            }


            // IMPORTANT:
            // Active game MUST use the existing
            // reconnect logic.

            await joinTable();


            // Consume the one-time handoff mode.

            localStorage.removeItem(
                "crdg_join_mode"
            );

            return;
        }


        // =================================================
        // NO AUTOMATIC JOIN
        // =================================================
        //
        // Manual Join button continues to use
        // the existing joinTable() function.
        //

    }
);