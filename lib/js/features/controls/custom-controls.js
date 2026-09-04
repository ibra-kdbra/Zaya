$(document).ready(function () {
    const alwaysShownToggle = $("#bottomPanelAlwaysShown");
    // Touch-only devices have no hover, so the bottom bar must stay visible there (issue #11 / #8)
    const isTouchDevice = (window.matchMedia && window.matchMedia('(hover: none)').matches) || navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches;
    document.body.classList.toggle('touch-device', isTouchDevice);

    // Visibility Logic
    function updateVisibilityMode() {
        const isAlwaysShown = alwaysShownToggle.is(":checked") || isTouchDevice;
        const controlBar = $("#customControlBar");
        const hoverTrigger = $("#bottomHoverTrigger");

        if (isAlwaysShown) {
            controlBar.addClass("always-shown").removeClass("visible");
            if (hoverTrigger.length) hoverTrigger.hide();
        } else {
            controlBar.removeClass("always-shown visible");
            if (hoverTrigger.length) hoverTrigger.show();
        }
        try { localStorage.setItem("bottomPanelAlwaysShown", alwaysShownToggle.is(":checked")); } catch (e) { /* storage unavailable */ }
    }

    // Toggle event listener
    $(document).on("change", "#bottomPanelAlwaysShown", function() {
        updateVisibilityMode();
    });

    // Reliable hover detection using mousemove (throttled to one pass per animation frame)
    let mouseMoveScheduled = false;
    $(document).on("mousemove", function (e) {
        if (isTouchDevice || mouseMoveScheduled) return;
        if ($("#bottomPanelAlwaysShown").is(":checked")) return;
        mouseMoveScheduled = true;
        requestAnimationFrame(() => { mouseMoveScheduled = false; });

        const controlBar = $("#customControlBar");
        const moreMenu = $("#customMoreMenu");
        if (!controlBar.length) return;

        const mouseY = e.clientY; 
        const windowHeight = $(window).height();
        const threshold = 80; 

        // Check if mouse is within bar bounds manually
        const barRect = controlBar[0].getBoundingClientRect();
        const isHoveringBar = (
            e.clientX >= barRect.left &&
            e.clientX <= barRect.right &&
            e.clientY >= barRect.top &&
            e.clientY <= barRect.bottom
        );
        const isMoreMenuOpen = moreMenu.hasClass("show");

        if (mouseY > windowHeight - threshold || isHoveringBar || isMoreMenuOpen) {
            controlBar.addClass("visible");
        } else {
            controlBar.removeClass("visible");
        }

        // Pro-grade Zoom Fix: Global Interceptor
        const isHoveringSidebar = $(e.target).closest('.df-sidemenu').length > 0;
        const fb = getFlipbook();
        if (fb) {
            if (isHoveringSidebar) {
                // LOCK: Disable OrbitControls (Rotation/Pan) but keep global scrollWheel enabled for Zoom
                if (fb.stage && fb.stage.orbitControl) fb.stage.orbitControl.enabled = false;
                // if (fb.options) fb.options.scrollWheel = false; // Keep this enabled to allow Zoom logic
            } else {
                // UNLOCK: Restore interactions
                if (fb.stage && fb.stage.orbitControl) fb.stage.orbitControl.enabled = true;
                // if (fb.options) fb.options.scrollWheel = true;
            }
        }
    });

    // Flipbook Integration Helper
    function getFlipbook() {
        // More exhaustive check for the flipbook instance
        return window.dFlipBook || 
               $(".df-container").data("dFlip") || 
               (window.dfActiveLightBoxBook) ||
               (window.DFLIP && window.DFLIP.activeBook);
    }

    // MutationObserver to prevent the library from removing our UI
    const observer = new MutationObserver(function(mutations) {
        const bar = document.getElementById('customControlBar');
        const trigger = document.getElementById('bottomHoverTrigger');
        if (!bar || !trigger) return;
        
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        const targetParent = isFullscreen ? (document.fullscreenElement || document.webkitFullscreenElement) : document.body;

        if (bar.parentElement !== targetParent) {
            targetParent.appendChild(bar);
        }
        if (trigger.parentElement !== targetParent) {
            targetParent.appendChild(trigger);
        }
    });

    const config = { childList: true };
    observer.observe(document.body, config);

    // Explicitly handle fullscreen changes to ensure visibility
    $(document).on("fullscreenchange webkitfullscreenchange mozfullscreenchange MSFullscreenChange", function() {
        const controlBar = $("#customControlBar");
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        
        if (isFullscreen) {
            // Re-append to the fullscreen element if possible, or just force z-index
            const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsElem && controlBar[0].parentElement !== fsElem) {
                fsElem.appendChild(controlBar[0]);
            }
        } else {
            if (controlBar[0].parentElement !== document.body) {
                document.body.appendChild(controlBar[0]);
            }
        }
        syncUI();
    });

    // --- EVENT DELEGATION FOR BUTTONS ---
    $(document).on("click", "#customPrevBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) {
            if(fb.target && fb.target.prev) fb.target.prev();
            else if(fb.prev) fb.prev();
        } 
    });
    $(document).on("click", "#customNextBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) {
            if(fb.target && fb.target.next) fb.target.next();
            else if(fb.next) fb.next();
        } 
    });
    $(document).on("click", "#customZoomInBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) fb.zoom(1); 
    });
    $(document).on("click", "#customZoomOutBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb) fb.zoom(-1); 
    });
    $(document).on("click", "#customFullscreenBtn", function (e) { 
        e.preventDefault(); 
        e.stopImmediatePropagation(); 
        const fb = getFlipbook(); 
        if (fb && fb.ui) fb.ui.switchFullscreen(); 
    });

    $(document).on("click", "#customOutlineBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.outline) {
            fb.ui.outline.trigger("click");
        } else if (fb && fb.target && fb.target.outlineContainer) {
            fb.target.outlineContainer.toggleClass("df-sidemenu-visible");
            $(this).toggleClass("df-active");
        }
        setTimeout(syncUI, 100);
    });

    $(document).on("click", "#customThumbnailBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.thumbnail) {
            fb.ui.thumbnail.trigger("click");
        } else if (fb && fb.target && fb.target.thumbContainer) {
            fb.target.thumbContainer.toggleClass("df-sidemenu-visible");
            $(this).toggleClass("df-active");
        } else if (fb && fb.contentProvider && fb.contentProvider.initThumbs) {
            fb.contentProvider.initThumbs();
        }
        setTimeout(syncUI, 100);
    });

    $(document).on("click", "#customSearchBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.searchPanel) {
            fb.ui.searchPanel.trigger("click");
        } else if (fb && fb.target && fb.target.searchContainer) {
            fb.target.searchContainer.toggleClass("df-sidemenu-visible");
            $(this).toggleClass("active");
        }
        setTimeout(syncUI, 100);
    });

    // Ctrl/Cmd+F opens the in-document search instead of the browser's find bar
    $(document).on("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F")) {
            const fb = getFlipbook();
            if (!fb || !fb.ui || !fb.ui.searchPanel) return;
            e.preventDefault();
            if (!(fb.target && fb.target.searchContainer && fb.target.searchContainer.hasClass("df-sidemenu-visible"))) {
                fb.ui.searchPanel.trigger("click");
            } else if (fb.target.searchInput) {
                fb.target.searchInput.trigger("focus").trigger("select");
            }
            setTimeout(syncUI, 100);
        }
    });

    $(document).on("click", "#customShareBtn", function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.share) {
            fb.ui.share.trigger("click");
        }
    });

    // Page Input Logic
    $(document).on("keydown", "#customCurrentPageInput", function(e) {
        e.stopPropagation(); // Prevent flipbook shortcuts
    });

    $(document).on("focus", "#customCurrentPageInput", function() {
        $(this).select();
    });

    $(document).on("change", "#customCurrentPageInput", function() {
        const fb = getFlipbook();
        if (fb) {
            let page = parseInt($(this).val(), 10);
            if (!isNaN(page)) {
                if(fb.target && fb.target.gotoPage) fb.target.gotoPage(page);
                else if(fb.gotoPage) fb.gotoPage(page);
            }
        }
    });

    $(document).on("keyup", "#customCurrentPageInput", function(e) {
        e.stopPropagation();
        if (e.keyCode === 13) {
            const fb = getFlipbook();
            if (fb) {
                let page = parseInt($(this).val(), 10);
                if (!isNaN(page)) {
                    if(fb.target && fb.target.gotoPage) fb.target.gotoPage(page);
                    else if(fb.gotoPage) fb.gotoPage(page);
                }
            }
            $(this).blur();
        }
    });

    // Global Wheel Interceptor for Pro-grade fix
    const stopPropagation = (e) => {
        if ($(e.target).closest('.df-sidemenu').length > 0) {
            // Allow Ctrl+Wheel (Zoom) to propagate, but block normal Wheel (Scroll) from bubbling to the book
            if (e.ctrlKey) return;
            e.stopImmediatePropagation();
        }
    };
    window.addEventListener("wheel", stopPropagation, true); 

    $(document).on("click", "#customMoreBtn", function (e) {
        e.preventDefault(); e.stopPropagation();
        $("#customMoreMenu").toggleClass("show");
    });

    $(document).on("click", function (e) {
        if (!$(e.target).closest('#customMoreBtn').length) {
            $("#customMoreMenu").removeClass("show");
        }
    });

    // More Menu Actions
    $(document).on("click", "#menuDownloadBtn", function () {
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.download) {
            fb.ui.download[0].click();
        } else if (fb && fb.options && fb.options.source) {
            const src = String(fb.options.source);
            if (/^(https?:|blob:)/i.test(src)) window.open(src, '_blank', 'noopener');
        }
    });

    $(document).on("click", "#menuPageModeBtn", function () {
        const fb = getFlipbook();
        if (fb) {
            const isSingle = fb.target.pageMode === 1; 
            fb.setPageMode(!isSingle); 
            syncUI();
        }
    });

    $(document).on("click", "#menuFirstPageBtn", function () { const fb = getFlipbook(); if (fb) fb.start(); });
    $(document).on("click", "#menuLastPageBtn", function () { const fb = getFlipbook(); if (fb) fb.end(); });

    $(document).on("click", "#menuSoundBtn", function () {
        const fb = getFlipbook();
        if (fb && fb.ui && fb.ui.sound) {
            fb.ui.sound.trigger("click");
            syncUI();
        }
    });

    // Update UI State
    function syncUI() {
        const fb = getFlipbook();
        if (fb) {
            // Get current page from target or instance
            const current = (fb.target && fb.target._activePage) || fb._activePage || 1;
            
            // Get total pages from multiple possible locations
            let total = 1;
            if (fb.target && fb.target.pageCount) total = fb.target.pageCount;
            else if (fb.pageCount) total = fb.pageCount;
            else if (fb.contentProvider && fb.contentProvider.pageCount) total = fb.contentProvider.pageCount;
            
            if (!$("#customCurrentPageInput").is(":focus")) {
                $("#customCurrentPageInput").val(current);
            }
            $("#customTotalPages").text(total);

            // Sync Page Mode
            const pageMode = (fb.target && fb.target.pageMode) || fb.pageMode;
            const isSingle = pageMode === 1; 
            $("#menuPageModeBtn span").text(isSingle ? "Double Page Mode" : "Single Page Mode");
            $("#menuPageModeBtn i").attr('class', isSingle ? "fas fa-book-open" : "fas fa-file-alt");

            // Sync Sound
            const isSoundEnabled = (fb.options && fb.options.soundEnable);
            $("#menuSoundBtn span").text(isSoundEnabled ? "Sound: On" : "Sound: Off");
            $("#menuSoundBtn i").attr('class', isSoundEnabled ? "fas fa-volume-up" : "fas fa-volume-mute");
            
            // Sync Sidebar States (Outline/Thumbnail)
            if (fb.ui) {
                if (fb.ui.outline) {
                    const isOutlineActive = fb.ui.outline.hasClass('df-active') || 
                                          (fb.target && fb.target.outlineContainer && fb.target.outlineContainer.hasClass('df-sidemenu-visible'));
                    $("#customOutlineBtn").toggleClass('active', !!isOutlineActive);
                }
                if (fb.ui.thumbnail) {
                    const isThumbActive = fb.ui.thumbnail.hasClass('df-active') || 
                                        (fb.target && fb.target.thumbContainer && fb.target.thumbContainer.hasClass('df-sidemenu-visible'));
                    $("#customThumbnailBtn").toggleClass('active', !!isThumbActive);
                }
                if (fb.ui.searchPanel) {
                    const isSearchActive = fb.ui.searchPanel.hasClass('df-active') ||
                                        (fb.target && fb.target.searchContainer && fb.target.searchContainer.hasClass('df-sidemenu-visible'));
                    $("#customSearchBtn").toggleClass('active', !!isSearchActive);
                }
            }

            // Sync Fullscreen Icon
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            $("#customFullscreenBtn i").attr('class', isFullscreen ? "fas fa-compress" : "fas fa-expand");
        }
    }

    // Initialize state
    const savedAlwaysShown = localStorage.getItem("bottomPanelAlwaysShown") === "true";
    alwaysShownToggle.prop("checked", savedAlwaysShown);
    setTimeout(updateVisibilityMode, 500);

    // Constant maintenance loop
    setInterval(syncUI, 500);
});
