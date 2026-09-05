// YouTube player variable
let youtubePlayer;
let isMediaPlaying = false;
let currentYouTubeVideoId = null;
let currentYouTubePlaylistId = null;
let currentAudioObjectUrl = null;

// Load YouTube IFrame API
function loadYouTubeAPI() {
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
}

// Initialize YouTube API when ready
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API ready for Zaya');
};

$(document).ready(function () {
    // Load YouTube API
    loadYouTubeAPI();

    // --- Core Media Elements ---
    const localAudioFile = $("#localAudioFile");
    const localAudioPlayer = $("#localAudioPlayer")[0];
    const localAudioFileName = $("#localAudioFileName");
    const audioPlayPauseBtn = $("#audioPlayPauseBtn");
    const audioProgressSlider = $("#audioProgressSlider");
    const audioCurrentTime = $("#audioCurrentTime");
    const audioTotalTime = $("#audioTotalTime");
    const customAudioPlayer = $("#customAudioPlayer");
    const videoVolumeControl = $("#videoVolumeControl");
    const videoVolumeSlider = $("#videoVolumeSlider");
    const volumeSlider = $("#volumeSlider");
    const closeBtn = $("#closeMediaContainer");

    // --- Media Mode Switching ---
    const switchYoutubeBtn = $("#switchYoutubeMode");
    const switchAudioBtn = $("#switchAudioMode");
    const youtubeInputGroup = $("#youtubeInputGroup");
    const audioInputGroup = $("#audioInputGroup");

    function setMediaMode(mode, persist = true) {
        if (persist) window.appState.setMediaMode(mode);
        if (mode === 'youtube') {
            switchYoutubeBtn.addClass("media-mode-active").removeClass("text-gray-400 hover:text-white");
            switchAudioBtn.removeClass("media-mode-active").addClass("text-gray-400 hover:text-white");
            youtubeInputGroup.show();
            audioInputGroup.hide();
        } else {
            switchAudioBtn.addClass("media-mode-active").removeClass("text-gray-400 hover:text-white");
            switchYoutubeBtn.removeClass("media-mode-active").addClass("text-gray-400 hover:text-white");
            audioInputGroup.show();
            youtubeInputGroup.hide();
        }
        // Cleanup when switching modes
        hideMediaPlayer();
    }

    switchYoutubeBtn.on("click", () => setMediaMode('youtube'));
    switchAudioBtn.on("click", () => setMediaMode('audio'));

    // --- Media Loop Synchronization ---
    const mediaLoopToggle = $("#mediaLoopToggle");
    const videoMediaLoopToggle = $("#videoMediaLoopToggle");

    function syncLoopToggles(isLoopOn) {
        mediaLoopToggle.prop('checked', isLoopOn);
        videoMediaLoopToggle.prop('checked', isLoopOn);
        
        window.appState.setMediaLoop(isLoopOn);

        // Update local audio player loop in real-time
        if (localAudioPlayer) {
            localAudioPlayer.loop = isLoopOn;
        }

        // For YouTube, we need to reload the embed with updated params
        if (youtubePlayer && (currentYouTubeVideoId || currentYouTubePlaylistId)) {
            const newEmbedUrl = buildYouTubeEmbedUrl(currentYouTubeVideoId, currentYouTubePlaylistId, isLoopOn);
            $("#youtubePlayer").attr("src", newEmbedUrl);
            setTimeout(() => initializeYouTubePlayer(), 1500);
        }

        Toastify({
            text: ZayaT(isLoopOn ? "media.loopOn" : "media.loopOff"),
            duration: 1500,
            gravity: "bottom",
            position: "right"
        }).showToast();
    }

    // Initialize toggles from saved state
    const savedLoop = window.appState.get('mediaLoop');
    mediaLoopToggle.prop('checked', savedLoop);
    videoMediaLoopToggle.prop('checked', savedLoop);
    if (localAudioPlayer) {
        localAudioPlayer.loop = savedLoop;
    }

    // Listen for toggle changes (both inputs)
    mediaLoopToggle.on('change', function() { syncLoopToggles($(this).is(':checked')); });
    videoMediaLoopToggle.on('change', function() { syncLoopToggles($(this).is(':checked')); });

    // Handle keyboard shortcut for loading URL (Ctrl+V or Cmd+V like)
    $(document).on('keydown', '#youtubeUrl', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            $("#loadYoutubeBtn").click();
        }
    });

    // --- Local Audio Initialization ---

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s]
            .map(v => v < 10 ? "0" + v : v)
            .filter((v, i) => v !== "00" || i > 0)
            .join(":");
    }

    localAudioFile.on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;

        localAudioFileName.text(file.name).removeClass("hidden");

        if (youtubePlayer) {
            youtubePlayer.stopVideo();
            $("#youtubePlayer").attr("src", "");
            $("#youtubePlayerContainer").hide();
        }

        if (currentAudioObjectUrl) URL.revokeObjectURL(currentAudioObjectUrl);
        currentAudioObjectUrl = URL.createObjectURL(file);
        $("#localAudioPlayer").attr("src", currentAudioObjectUrl);
        
        // Ensure YouTube is hidden
        $("#youtubePlayerContainer").hide();
        $("#youtubePlayer").attr("src", "");
        
        customAudioPlayer.removeClass("hidden").show();
        
        $(".media-player-container").show();
        isMediaPlaying = true;
        updateMediaControls();

        // Apply loop setting
        const isLoopOn = mediaLoopToggle.is(':checked');
        localAudioPlayer.loop = isLoopOn;

        playLocalAudio();

        // Set initial volume for local player
        const savedVolume = window.appState.get('mediaVolume');
        localAudioPlayer.volume = savedVolume / 100;
        volumeSlider.val(savedVolume);

        Toastify({
            text: ZayaT("media.audioPlaying"),
            duration: 2000,
            gravity: "bottom",
            position: "right"
        }).showToast();
    });

    // play() rejects when the browser blocks autoplay; show the paused icon instead of throwing.
    function playLocalAudio() {
        const started = localAudioPlayer.play();
        audioPlayPauseBtn.find("i").removeClass("fa-play").addClass("fa-pause");
        if (started && typeof started.catch === 'function') {
            started.catch(() => audioPlayPauseBtn.find("i").removeClass("fa-pause").addClass("fa-play"));
        }
    }

    audioPlayPauseBtn.on("click", function() {
        if (localAudioPlayer.paused) {
            playLocalAudio();
        } else {
            localAudioPlayer.pause();
            $(this).find("i").removeClass("fa-pause").addClass("fa-play");
        }
    });

    $(localAudioPlayer).on("timeupdate", function() {
        const current = localAudioPlayer.currentTime;
        const total = localAudioPlayer.duration;
        if (!isNaN(total)) {
            const progress = (current / total) * 100;
            audioProgressSlider.val(progress);
            audioCurrentTime.text(formatTime(current));
            audioTotalTime.text(formatTime(total));
        }
    });

    audioProgressSlider.on("input", function() {
        const total = localAudioPlayer.duration;
        if (!isNaN(total)) {
            localAudioPlayer.currentTime = (this.value / 100) * total;
        }
    });

    // Stop local audio and release its blob URL.
    function stopLocalAudio() {
        if (!localAudioPlayer) return;
        localAudioPlayer.pause();
        $("#localAudioPlayer").attr("src", "");
        if (currentAudioObjectUrl) {
            URL.revokeObjectURL(currentAudioObjectUrl);
            currentAudioObjectUrl = null;
        }
        customAudioPlayer.hide();
        localAudioFileName.addClass("hidden");
        audioPlayPauseBtn.find("i").removeClass("fa-pause").addClass("fa-play");
    }

    // Swap the iframe over to `embedUrl` and put the UI into "YouTube is playing" state.
    function showYouTubeEmbed(embedUrl) {
        // Clean up existing YouTube resources and destroy the previous player
        window.memoryManager.cleanupYouTube();
        if (youtubePlayer) {
            try { youtubePlayer.destroy(); } catch(e) { /* already gone */ }
            youtubePlayer = null;
        }

        stopLocalAudio();

        $("#youtubePlayerContainer").show();
        videoVolumeControl.show();
        $("#youtubePlayer").attr("src", embedUrl);

        // Initialize player for volume control after a delay
        setTimeout(() => initializeYouTubePlayer(), 1500);

        $(".media-player-container").show();
        isMediaPlaying = true;
        updateMediaControls();

        videoVolumeSlider.val(window.appState.get('mediaVolume'));
    }

    // Load YouTube video button
    $("#loadYoutubeBtn").click(function () {
        const youtubeUrl = $("#youtubeUrl").val().trim();

        if (!youtubeUrl) {
            Toastify({
                text: ZayaT("media.pasteVideo"),
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        const validation = window.ValidationUtils.validateYouTubeUrl(youtubeUrl);

        if (!validation.isValid) {
            Toastify({
                text: validation.error,
                duration: 4000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        const videoId = validation.videoId;
        const playlistId = validation.playlistId;

        // Store current IDs for loop toggle updates
        currentYouTubeVideoId = videoId;
        currentYouTubePlaylistId = playlistId;

        // Build embed URL with loop setting
        const isLoopOn = mediaLoopToggle.is(':checked');
        const embedUrl = buildYouTubeEmbedUrl(videoId, playlistId, isLoopOn);



        showYouTubeEmbed(embedUrl);

        // Show success notification
        Toastify({
            text: ZayaT("media.videoPlaying"),
            duration: 2000,
            gravity: "bottom",
            position: "right"
        }).showToast();
    });

    // Load YouTube playlist button
    $("#loadPlaylistBtn").click(function () {
        const youtubeUrl = $("#youtubeUrl").val().trim();

        if (!youtubeUrl) {
            Toastify({
                text: ZayaT("media.pastePlaylist"),
                duration: 3000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        const validation = window.ValidationUtils.validateYouTubeUrl(youtubeUrl);
        if (!validation.isValid || !validation.playlistId) {
            Toastify({
                text: ZayaT("media.noPlaylist"),
                duration: 4000,
                gravity: "bottom",
                position: "right",
                backgroundColor: "#ef4444"
            }).showToast();
            return;
        }

        const playlistId = validation.playlistId;

        // Store current IDs for loop toggle updates
        currentYouTubeVideoId = null;
        currentYouTubePlaylistId = playlistId;

        // Build embed URL with loop setting
        const isLoopOn = mediaLoopToggle.is(':checked');
        const embedUrl = buildYouTubeEmbedUrl(null, playlistId, isLoopOn);

        showYouTubeEmbed(embedUrl);

        Toastify({
            text: ZayaT("media.playlistPlaying"),
            duration: 2000,
            gravity: "bottom",
            position: "right"
        }).showToast();
    });

    // Initialize YouTube player for volume control
    function initializeYouTubePlayer() {
        setTimeout(() => {
            if (window.YT && window.YT.Player) {
                youtubePlayer = new YT.Player('youtubePlayer', {
                    events: {
                        'onStateChange': onYouTubePlayerStateChange,
                        'onReady': onYouTubePlayerReady
                    }
                });

                // Register with memory manager for cleanup
                window.memoryManager.registerResource({
                    destroy: () => {
                        try {
                            if (youtubePlayer) {
                                youtubePlayer.destroy();
                                youtubePlayer = null;
                            }
                        } catch (e) {
                            console.error('Error destroying YouTube player:', e);
                        }
                    }
                }, 'youtube');
            }
        }, 1000);
    }

    function onYouTubePlayerReady(event) {
        const savedVolume = window.appState.get('mediaVolume');
        if (youtubePlayer && youtubePlayer.setVolume) {
            youtubePlayer.setVolume(savedVolume);
        }
        videoVolumeSlider.val(savedVolume);
    }

    function onYouTubePlayerStateChange(event) {
        // We want the close button to stay if media was loaded, regardless of play state
        // but let's keep it consistent with your requirement
        // isMediaPlaying = event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED;
        // updateMediaControls();
    }

    function updateMediaControls() {
        if (isMediaPlaying) {
            closeBtn.removeClass("hidden").show();
        } else {
            closeBtn.hide();
        }
    }

    closeBtn.click(hideMediaPlayer);

    // Audio Volume
    volumeSlider.on("input", function() {
        const volume = $(this).val();
        const normalizedVolume = volume / 100;
        window.appState.setMediaVolume(parseInt(volume, 10));
        if (localAudioPlayer) {
            localAudioPlayer.volume = normalizedVolume;
        }
        // Sync the other slider if visible
        videoVolumeSlider.val(volume);
    });

    // Video Volume
    videoVolumeSlider.on("input", function() {
        const volume = $(this).val();
        window.appState.setMediaVolume(parseInt(volume, 10));
        if (youtubePlayer && youtubePlayer.setVolume) {
            youtubePlayer.setVolume(volume);
        }
        // Sync the other slider if visible
        volumeSlider.val(volume);
    });

    function hideMediaPlayer() {
        if (youtubePlayer) {
            try { youtubePlayer.destroy(); } catch(e) {}
            youtubePlayer = null;
        }
        stopLocalAudio();
        $("#youtubePlayer").attr("src", "");
        $("#youtubePlayerContainer").hide();
        videoVolumeControl.hide();
        $(".media-player-container").hide();
        isMediaPlaying = false;
        updateMediaControls();
    }

    // Initialize with saved volume
    const initialVolume = window.appState.get('mediaVolume');
    volumeSlider.val(initialVolume);
    videoVolumeSlider.val(initialVolume);
    if (localAudioPlayer) localAudioPlayer.volume = initialVolume / 100;

    // Start hidden, in the media mode the reader last used
    $(".media-player-container").hide();
    updateMediaControls();
    setMediaMode(window.appState.get('mediaMode') || 'youtube', false);
});

// Helper: Build YouTube embed URL with optional loop params
function buildYouTubeEmbedUrl(videoId, playlistId, loop) {
    const origin = encodeURIComponent(window.location.origin);
    videoId = videoId ? encodeURIComponent(String(videoId)) : videoId;
    playlistId = playlistId ? encodeURIComponent(String(playlistId)) : playlistId;
    let url;

    if (playlistId && videoId) {
        // Video in playlist
        url = `https://www.youtube.com/embed/${videoId}?list=${playlistId}&autoplay=1&enablejsapi=1&origin=${origin}`;
    } else if (playlistId) {
        // Playlist only
        url = `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&enablejsapi=1&origin=${origin}`;
    } else if (videoId) {
        // Single video
        url = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${origin}`;
    } else {
        return '';
    }

    if (loop) {
        url += '&loop=1';
        // YouTube requires playlist param to loop a single video
        if (videoId && !playlistId) {
            url += `&playlist=${videoId}`;
        }
    }

    return url;
}
