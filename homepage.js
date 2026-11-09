/* ============================================================
   SUPABASE CONFIGURATION
   ============================================================ */

const SUPABASE_URL =
    "https://dbfycihbcosuxxkrmbhl.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX";

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


/* ============================================================
   SESSION
   ============================================================ */

const SESSION_KEY =
    "crdgn_session_token";


function getSessionToken() {

    return localStorage.getItem(
        SESSION_KEY
    );
}


/* ============================================================
   SESSION VALIDATION
   ============================================================ */

async function validateSession() {

    const token =
        getSessionToken();


    if (!token) {

        location.replace(
            "index.html"
        );

        return false;
    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "crdgn_validate_session",
            {
                p_session_token:
                    token
            }
        );


    if (error) {

        console.error("Session validation error:", error);

        throw new Error(
            error.message ||
            "Unable to validate your login session."
        );
    }


    const result =
        Array.isArray(data)
            ? data[0]
            : data;


    if (
        !result ||
        result.success !== true
    ) {

        localStorage.removeItem(
            SESSION_KEY
        );

        location.replace(
            "index.html"
        );

        return false;
    }


    document.getElementById(
        "userName"
    ).textContent =
        result.name ||
        "PLAYER";


    document.getElementById(
        "balance"
    ).textContent =
        formatBalance(
            result.balance
        );


    return true;
}


/* ============================================================
   BALANCE FORMAT
   ============================================================ */

function formatBalance(
    value
) {

    return Number(
        value || 0
    ).toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}


/* ============================================================
   STARTUP PROFILE LOAD
   ============================================================ */

async function loadProfileFirst() {

    const token =
        getSessionToken();

    if (!token) {
        location.replace("index.html");
        return false;
    }

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "crdgn_get_profile",
            {
                p_session_token: token
            }
        );

    if (error) {
        console.error("Profile load error:", error);
        throw new Error(
            error.message ||
            "Unable to load your profile."
        );
    }

    const profile =
        Array.isArray(data)
            ? data[0]
            : data;

    if (!profile) {
        localStorage.removeItem(SESSION_KEY);
        throw new Error(
            "Your login session is no longer valid. Please login again."
        );
    }

    const name =
        profile.name || "PLAYER";

    document.getElementById(
        "userName"
    ).textContent = name;

    document.getElementById(
        "balance"
    ).textContent =
        formatBalance(profile.balance);

    localStorage.setItem(
        "crdgn_user_id",
        profile.user_id ||
        localStorage.getItem("crdgn_user_id") || ""
    );

    localStorage.setItem(
        "crdgn_user_name",
        name
    );

    return true;
}


/* ============================================================
   STARTUP ERROR
   ============================================================ */

function showStartupError(error) {

    const loading =
        document.getElementById("loading");

    const message =
        document.getElementById("loadingMessage");

    const retryButton =
        document.getElementById("retryHomeButton");

    if (message) {
        message.textContent =
            error?.message ||
            "Unable to load the homepage.";
    }

    if (retryButton) {
        retryButton.style.display = "inline-flex";
    }

    if (loading) {
        loading.classList.remove("hide");
    }
}


function retryHome() {
    location.reload();
}


/* ============================================================
   PROFILE
   ============================================================ */

async function openProfile() {

    clearMessage(
        "profileMessage"
    );


    const token =
        getSessionToken();


    if (!token) {

        location.replace(
            "index.html"
        );

        return;
    }


    document
        .getElementById(
            "profileModal"
        )
        .classList.add("show");


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "crdgn_get_profile",
            {
                p_session_token:
                    token
            }
        );


    if (error) {

        console.error(error);

        showMessage(
            "profileMessage",
            "Unable to load profile.",
            "error"
        );

        return;
    }


    const profile =
        Array.isArray(data)
            ? data[0]
            : data;


    if (!profile) {

        localStorage.removeItem(
            SESSION_KEY
        );

        location.replace(
            "index.html"
        );

        return;
    }


    document.getElementById(
        "profileName"
    ).textContent =
        profile.name || "-";


    document.getElementById(
        "profilePhone"
    ).textContent =
        profile.phone_no || "-";


    document.getElementById(
        "profileEmail"
    ).textContent =
        profile.email || "-";


    document.getElementById(
        "profileDob"
    ).textContent =
        profile.dob || "-";


    document.getElementById(
        "profileBalance"
    ).textContent =
        formatBalance(
            profile.balance
        );


    document.getElementById(
        "profileCreated"
    ).textContent =
        formatDate(
            profile.created_at
        );

    //await loadActiveGame();
}


let activeGameData = null;

// Verify an active-game pointer against the live session and player state
// before making the homepage Resume option visible.
async function inspectActiveGameRecord(record) {
    const { data: gameStateData, error: gameStateError } =
        await supabaseClient.rpc("crdg_get_game_state", {
            p_session_id: record.session_id,
            p_user_id: record.game_user_id
        });

    const { data: sessionData, error: sessionError } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("game_completed")
            .eq("session_id", record.session_id)
            .maybeSingle();

    if (gameStateError || sessionError) {
        console.error("ACTIVE GAME VALIDATION ERROR:", {
            gameStateError,
            sessionError
        });
        return {
            usable: false,
            cleanup: false,
            reason: "Unable to verify the saved game."
        };
    }

    const gameState = Array.isArray(gameStateData)
        ? gameStateData[0]
        : gameStateData;

    const playerStatus = String(
        gameState?.player_status || gameState?.playerStatus || ""
    ).toUpperCase();

    const eliminated =
        playerStatus === "ELIMINATED" ||
        gameState?.is_eliminated === true ||
        gameState?.isEliminated === true;

    const completed = sessionData?.game_completed === true;
    const stateMissing = !sessionData || !gameState;

    if (completed || eliminated || stateMissing) {
        return {
            usable: false,
            cleanup: true,
            reason: completed
                ? "This table has already been completed."
                : eliminated
                    ? "This player has been eliminated from the table."
                    : "The saved game is no longer available."
        };
    }

    return { usable: true, cleanup: false, reason: "" };
}

async function cleanupStaleActiveGameRecord(record) {
    const token = getSessionToken();
    if (!token || !record?.session_id) return;

    const { error } = await supabaseClient.rpc(
        "crdgn_cleanup_active_game",
        {
            p_session_token: token,
            p_session_id: record.session_id,
            p_game_user_id: record.game_user_id || null
        }
    );

    if (error) {
        console.error("STALE ACTIVE GAME CLEANUP ERROR:", error);
    }
}

async function loadActiveGame() {

    const btn = document.getElementById("activeGameBtn");
    activeGameData = null;
    if (btn) btn.style.display = "none";

    const token = getSessionToken();
    if (!token) return;

    const registeredUserId = localStorage.getItem("crdgn_user_id");
    if (!registeredUserId) return;

    // Keep the existing active-game lookup, but safely choose the most
    // recently updated active record if older duplicate records exist.
    const { data, error } = await supabaseClient
        .from("crdgn_active_games")
        .select(`
            active_game_id,
            user_id,
            game_user_id,
            display_name,
            table_id,
            session_id,
            seat_no,
            fixed_seat_no,
            status,
            created_at,
            updated_at
        `)
        .eq("user_id", registeredUserId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("ACTIVE GAME LOAD ERROR:", error);
        return;
    }

    if (!data) {
        activeGameData = null;
        console.log("NO ACTIVE GAME FOUND");
        return;
    }

    console.log("ACTIVE GAME FOUND - VERIFYING:", data);

    const validation = await inspectActiveGameRecord(data);
    if (!validation.usable) {
        activeGameData = null;
        if (validation.cleanup) {
            await cleanupStaleActiveGameRecord(data);
        } else {
            console.warn("Active Game remains hidden:", validation.reason);
        }
        return;
    }

    activeGameData = data;
    if (btn) btn.style.display = "block";
}


async function resumeActiveGame() {

    if (!activeGameData) {
        alert("No active game found.");
        return;
    }

    // Revalidate on click as well, so a table completed or player
    // eliminated moments ago cannot be reopened from a stale page.
    const record = activeGameData;
    const validation = await inspectActiveGameRecord(record);

    if (!validation.usable) {
        activeGameData = null;
        const btn = document.getElementById("activeGameBtn");
        if (btn) btn.style.display = "none";

        if (validation.cleanup) {
            await cleanupStaleActiveGameRecord(record);
            alert(validation.reason + " Active Game has been disabled.");
        } else {
            alert(validation.reason + " Please refresh the homepage and try again.");
        }
        return;
    }

    // Save the exact game identity required by existing joinTable()
    localStorage.setItem(
        "crdg_table",
        String(activeGameData.table_id)
    );

    localStorage.setItem(
        "crdg_nickname",
        activeGameData.display_name
    );

    // Keep the existing game user ID
    localStorage.setItem(
        "crdg_user_id",
        activeGameData.game_user_id
    );

    // Go through the EXISTING tablepage reconnect flow
    window.location.href = "friends.html";
}

function showActiveGameInfo() {

    if (!activeGameData) return;

    const details = document.getElementById("activeGameDetails");

    details.innerHTML = `
        <p><strong>Player:</strong> ${activeGameData.display_name}</p>
        <p><strong>Table ID:</strong> ${activeGameData.table_id}</p>
        <p><strong>Session ID:</strong> ${activeGameData.session_id}</p>
        <p><strong>Seat No:</strong> ${activeGameData.seat_no}</p>
        <p><strong>Fixed Seat:</strong> ${activeGameData.fixed_seat_no}</p>
        <p><strong>Status:</strong> ${activeGameData.status}</p>
    `;

    document.getElementById("activeGameInfoBox").style.display = "flex";
}


function closeActiveGameInfo() {

    document.getElementById("activeGameInfoBox").style.display = "none";
}


/* ============================================================
   CHANGE PASSWORD
   ============================================================ */

function openChangePassword() {

    clearMessage(
        "passwordMessage"
    );


    document.getElementById(
        "currentPassword"
    ).value = "";


    document.getElementById(
        "newPassword"
    ).value = "";


    document.getElementById(
        "confirmPassword"
    ).value = "";


    document
        .getElementById(
            "passwordModal"
        )
        .classList.add("show");
}


async function changePassword() {

    clearMessage(
        "passwordMessage"
    );


    const currentPassword =
        document.getElementById(
            "currentPassword"
        ).value;


    const newPassword =
        document.getElementById(
            "newPassword"
        ).value;


    const confirmPassword =
        document.getElementById(
            "confirmPassword"
        ).value;


    if (!currentPassword) {

        showMessage(
            "passwordMessage",
            "Enter your current password.",
            "error"
        );

        return;
    }


    if (
        newPassword.length < 4 ||
        newPassword.length > 7
    ) {

        showMessage(
            "passwordMessage",
            "New password must contain 4 to 7 characters.",
            "error"
        );

        return;
    }


    if (
        newPassword !==
        confirmPassword
    ) {

        showMessage(
            "passwordMessage",
            "New password and confirmation do not match.",
            "error"
        );

        return;
    }


    const token =
        getSessionToken();


    if (!token) {

        location.replace(
            "index.html"
        );

        return;
    }


    const button =
        document.getElementById(
            "changePasswordButton"
        );


    button.disabled = true;

    button.textContent =
        "CHANGING...";


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "crdgn_change_password",
            {
                p_session_token:
                    token,

                p_current_password:
                    currentPassword,

                p_new_password:
                    newPassword
            }
        );


    button.disabled = false;

    button.textContent =
        "CHANGE PASSWORD";


    if (error) {

        console.error(error);

        showMessage(
            "passwordMessage",
            "Unable to change password.",
            "error"
        );

        return;
    }


    const result =
        Array.isArray(data)
            ? data[0]
            : data;


    if (
        !result ||
        result.success !== true
    ) {

        showMessage(
            "passwordMessage",
            result?.message ||
            "Password change failed.",
            "error"
        );

        return;
    }


    showMessage(
        "passwordMessage",
        "Password changed successfully. Please login again.",
        "success"
    );


    setTimeout(
        () => {

            localStorage.removeItem(
                SESSION_KEY
            );

            location.replace(
                "index.html"
            );

        },
        1200
    );
}


/* ============================================================
   STATEMENT
   ============================================================ */

async function openStatement() {

    clearMessage(
        "statementMessage"
    );


    document.getElementById(
        "statementList"
    ).innerHTML =
        `
        <div class="statement-empty">
            Loading statement...
        </div>
        `;


    document
        .getElementById(
            "statementModal"
        )
        .classList.add("show");


    const token =
        getSessionToken();


    if (!token) {

        location.replace(
            "index.html"
        );

        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "crdgn_get_statement",
            {
                p_session_token:
                    token
            }
        );


    if (error) {

        console.error(error);

        showMessage(
            "statementMessage",
            "Unable to load statement.",
            "error"
        );

        document.getElementById(
            "statementList"
        ).innerHTML = "";

        return;
    }


    if (
        !data ||
        data.length === 0
    ) {

        document.getElementById(
            "statementList"
        ).innerHTML =
            `
            <div class="statement-empty">
                No transactions found.
            </div>
            `;

        return;
    }


    document.getElementById(
        "statementList"
    ).innerHTML =

        data.map(
            tx => {

                const isCredit =
                    [
                        "REGISTER",
                        "DEPOSIT",
                        "RUMMY_WIN",
                        "ADMIN_CREDIT"
                    ].includes(
                        tx.transaction_type
                    );


                const sign =
                    isCredit
                        ? "+"
                        : "-";


                const amountClass =
                    isCredit
                        ? "credit"
                        : "debit";


                return `

                    <div class="transaction">

                        <div class="tx-row">

                            <div class="tx-type">
                                ${escapeHtml(
                                    tx.transaction_type
                                )}
                            </div>

                            <div
                                class="
                                    tx-amount
                                    ${amountClass}
                                "
                            >
                                ${sign}${formatBalance(
                                    tx.amount
                                )}
                            </div>

                        </div>


                        <div class="tx-description">
                            ${escapeHtml(
                                tx.description || ""
                            )}
                        </div>


                        <div class="tx-date">

                            ${formatDate(
                                tx.created_at
                            )}

                            &nbsp; • &nbsp;

                            Balance:
                            ${formatBalance(
                                tx.balance_after
                            )}

                        </div>

                    </div>

                `;

            }
        ).join("");
}


/* ============================================================
   DEPOSIT / WITHDRAW - FUTURE
   ============================================================ */

function featureAlert(
    feature
) {

    alert(
        feature +
        " feature will be available soon."
    );
}


/* ============================================================
   LOGOUT
   ============================================================ */

async function logout() {

    const token =
        getSessionToken();


    if (token) {

        try {

            await supabaseClient.rpc(
                "crdgn_logout",
                {
                    p_session_token:
                        token
                }
            );

        } catch (error) {

            console.error(error);
        }
    }


    localStorage.removeItem(
        SESSION_KEY
    );


    location.replace(
        "index.html"
    );
}


/* ============================================================
   MODAL HELPERS
   ============================================================ */

function closeModal(
    id
) {

    document
        .getElementById(id)
        .classList.remove("show");
}


function closeOnBackdrop(
    event,
    id
) {

    if (
        event.target.id === id
    ) {

        closeModal(id);
    }
}


/* ============================================================
   MESSAGE HELPERS
   ============================================================ */

function showMessage(
    id,
    text,
    type
) {

    const element =
        document.getElementById(id);


    element.textContent =
        text;


    element.className =
        "message show " +
        type;
}


function clearMessage(
    id
) {

    const element =
        document.getElementById(id);


    element.textContent =
        "";


    element.className =
        "message";
}


/* ============================================================
   DATE FORMAT
   ============================================================ */

function formatDate(
    value
) {

    if (!value) {
        return "-";
    }


    return new Date(
        value
    ).toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* ============================================================
   HTML SAFETY
   ============================================================ */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );
}


/* ============================================================
   START HOMEPAGE
   ============================================================ */

(async function startHome() {

    try {

        const valid =
            await validateSession();

        if (!valid) {
            return;
        }

        // IMPORTANT: keep the homepage hidden until the
        // complete profile has been loaded successfully.
        const profileLoaded =
            await loadProfileFirst();
        await loadActiveGame();

        if (profileLoaded) {

            document
                .getElementById("loading")
                .classList.add("hide");
        }

    } catch (error) {

        console.error("Homepage startup error:", error);

        showStartupError(error);
    }

})();


/* ============================================================
   ANDAR BAHAR NAVIGATION
   Pass the currently loaded account details to andar.html.
   The game page will use the same-origin localStorage session
   later for authenticated Supabase calls.
   ============================================================ */
function openAndarBahar() {
    const userId = localStorage.getItem("crdgn_user_id") || "";
    const userName = localStorage.getItem("crdgn_user_name") ||
        document.getElementById("userName")?.textContent?.trim() || "PLAYER";
    const balanceText = document.getElementById("balance")?.textContent || "0";
    const balance = Number(String(balanceText).replace(/[^0-9.-]/g, "")) || 0;

    if (!userId) {
        alert("Your account details are not loaded yet. Please refresh the home page and try again.");
        return;
    }

    const params = new URLSearchParams({
        user_id: userId,
        name: userName,
        balance: String(balance)
    });
    location.href = "andar.html?" + params.toString();
}
