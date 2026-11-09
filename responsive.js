/*
=========================================================
 CRDG RUMMY RESPONSIVE CONTROLLER
=========================================================

 Desktop / Laptop:
 - Normal full-width layout
 - Page scrolling allowed when necessary

 Mobile / Tablet:
 - Fixed 1280 × 720 game stage
 - Entire game scaled to fit screen
 - Stage centred correctly
=========================================================
*/

(function () {
    "use strict";

    const DESIGN_WIDTH = 1280;
    const DESIGN_HEIGHT = 720;
    const MOBILE_BREAKPOINT = 900;

    let resizeTimer = null;

    function getElements() {
        return {
            app: document.getElementById("app"),
            stage: document.getElementById("gameStage")
        };
    }

    function isMobileMode() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    /*
    =====================================================
     DESKTOP / LAPTOP
    =====================================================
    */

    function applyDesktopMode() {
        const { app, stage } = getElements();

        if (!app || !stage) {
            return;
        }

        document.documentElement.classList.remove("mobile-game-mode");
        document.body.classList.remove("mobile-game-mode");

        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";

        app.style.position = "relative";
        app.style.inset = "";
        app.style.width = "100%";
        app.style.height = "auto";
        app.style.minHeight = `${DESIGN_HEIGHT}px`;
        app.style.overflow = "visible";

        stage.style.position = "relative";
        stage.style.top = "0";
        stage.style.left = "0";
        stage.style.width = "100%";
        stage.style.minWidth = `${DESIGN_WIDTH}px`;
        stage.style.height = `${DESIGN_HEIGHT}px`;

        stage.style.transform = "none";
        stage.style.transformOrigin = "";
    }

    /*
    =====================================================
     MOBILE / TABLET
    =====================================================
    */

    function applyMobileMode() {
        
    const { app, stage } = getElements();

    if (!app || !stage) {
        return;
    }

    if (app.classList.contains("hidden")) {
        return;
    }

    const viewportWidth =
        window.visualViewport?.width || window.innerWidth;

    const viewportHeight =
        window.visualViewport?.height || window.innerHeight;

    /*
     Scale width and height separately so the game
     occupies the complete available mobile screen.
    */
     // Keep our game height fixed at 720,
// but calculate the width required to fill
// the complete mobile landscape viewport.

        const mobileDesignWidth =
            Math.max(
                DESIGN_WIDTH,
                DESIGN_HEIGHT *
                (viewportWidth / viewportHeight)
            );

        const scale =
            viewportHeight / DESIGN_HEIGHT;


    document.documentElement.classList.add("mobile-game-mode");
    document.body.classList.add("mobile-game-mode");

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    app.style.position = "fixed";
    app.style.inset = "0";
    app.style.width = "100%";
    app.style.height = "100%";
    app.style.minHeight = "0";
    app.style.overflow = "hidden";

    stage.style.position = "absolute";
    stage.style.top = "50%";
    stage.style.left = "50%";

    stage.style.width =
    `${mobileDesignWidth}px`;

    stage.style.minWidth =
        `${mobileDesignWidth}px`;

    stage.style.height =
        `${DESIGN_HEIGHT}px`;

    stage.style.transformOrigin = "center center";

    
     stage.style.transform =
    `translate(-50%, -50%) scale(${scale})`;

    
}

    /*
    =====================================================
     APPLY CURRENT MODE
    =====================================================
    */

    function refreshLayout() {
        if (isMobileMode()) {
            applyMobileMode();
        } else {
            applyDesktopMode();
        }
    }

    function delayedRefresh() {
        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(function () {
            refreshLayout();
        }, 100);
    }

    /*
    =====================================================
     WATCH APP OPEN / CLOSE
    =====================================================
    */

    function observeGameScreen() {
        const { app } = getElements();

        if (!app) {
            return;
        }

        const observer = new MutationObserver(function () {
            requestAnimationFrame(function () {
                refreshLayout();
            });
        });

        observer.observe(app, {
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    window.addEventListener("resize", delayedRefresh);

    window.addEventListener("orientationchange", function () {
        setTimeout(refreshLayout, 350);
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            "resize",
            delayedRefresh
        );
    }

    window.addEventListener("load", function () {
        refreshLayout();
        observeGameScreen();
    });

    window.refreshRummyLayout = refreshLayout;
})();