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

/*
 * Showing and hiding here is done with inline display, not with the `hidden` class, because that
 * is what this pane has always done: an element the stylesheet hides by class is shown by giving
 * it a display of its own. Keeping that exact rule keeps every box in this pane laid out as it
 * was.
 */
function showEl(el) {
    if (!el) return;
    if (el.style.display === 'none') el.style.display = '';
    if (window.getComputedStyle(el).display === 'none') el.style.display = 'block';
}

function hideEl(el) {
    if (el) el.style.display = 'none';
}

function startMediaPane() {
    // Load YouTube API
    loadYouTubeAPI();

    // --- Core Media Elements ---
    const localAudioFile = document.getElementById('localAudioFile');
    const localAudioPlayer = document.getElementById('localAudioPlayer');
    const localAudioFileName = document.getElementById('localAudioFileName');
    const audioPlayPauseBtn = document.getElementById('audioPlayPauseBtn');
    const audioProgressSlider = document.getElementById('audioProgressSlider');
    const audioCurrentTime = document.getElementById('audioCurrentTime');
    const audioTotalTime = document.getElementById('audioTotalTime');
    const customAudioPlayer = document.getElementById('customAudioPlayer');
    const videoVolumeControl = document.getElementById('videoVolumeControl');
    const videoVolumeSlider = document.getElementById('videoVolumeSlider');
    const volumeSlider = document.getElementById('volumeSlider');
    const closeBtn = document.getElementById('closeMediaContainer');
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const youtubeFrame = document.getElementById('youtubePlayer');
    const youtubeContainer = document.getElementById('youtubePlayerContainer');
    const playerContainer = document.querySelector('.media-player-container');
    const loadYoutubeBtn = document.getElementById('loadYoutubeBtn');
    const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');

    // --- Media Mode Switching ---
    const switchYoutubeBtn = document.getElementById('switchYoutubeMode');
    const switchAudioBtn = document.getElementById('switchAudioMode');
    const youtubeInputGroup = document.getElementById('youtubeInputGroup');
    const audioInputGroup = document.getElementById('audioInputGroup');

    if (!localAudioPlayer || !playerContainer) return; // not the reader page

    /* ---- The soundtrack a document was last read with ------------------------------------- */

    /*
     * The media fields used to be global: whatever was last pasted stayed there whichever book was
     * open. The last source is now kept with the document (in its `settings` record, keyed by the
     * document key), with the last source of all as the default for a document that has none of
     * its own. Opening a document puts its own source back in the fields and selects its mode;
     * nothing starts playing by itself, since a browser will not autoplay sound unasked. A local
     * audio file cannot be kept, so only the mode it was in is remembered.
     */
    const GLOBAL_SOURCE_KEY = 'zayaMediaSource';
    let source = { mode: window.appState.get('mediaMode') || 'youtube', youtube: '' };
    let appliedMode = null;

    function readGlobalSource() {
        try {
            const raw = JSON.parse(localStorage.getItem(GLOBAL_SOURCE_KEY) || 'null');
            return raw && typeof raw === 'object' ? raw : null;
        } catch (e) { return null; }
    }

    /** Keep this source as the document's own, and as the default for documents without one. */
    function rememberSource(patch) {
        source = { ...source, ...patch };
        try { localStorage.setItem(GLOBAL_SOURCE_KEY, JSON.stringify(source)); } catch (e) { /* storage unavailable */ }
        const key = window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : '';
        if (key && window.ZayaDocPrefs) window.ZayaDocPrefs.set(key, { media: source });
    }

    /** Put the fields back to what this document was last read with (or to the global default). */
    function applyDocumentSource() {
        const key = window.ZayaCurrentDocKey ? window.ZayaCurrentDocKey() : '';
        const use = (own) => {
            const chosen = own || readGlobalSource() || source;
            if (!chosen) return;
            source = { mode: chosen.mode === 'audio' ? 'audio' : 'youtube', youtube: chosen.youtube || '' };
            if (youtubeUrlInput) youtubeUrlInput.value = source.youtube;
            // Only when it really changes: switching modes stops whatever is playing.
            if (source.mode !== appliedMode) setMediaMode(source.mode, false);
        };
        if (!key || !window.ZayaDocPrefs) { use(null); return Promise.resolve(); }
        return window.ZayaDocPrefs.get(key).then((rec) => use(rec && rec.media ? rec.media : null));
    }

    document.addEventListener('zaya:pdfLoaded', () => { applyDocumentSource(); });

    function setMediaMode(mode, persist = true) {
        appliedMode = mode === 'audio' ? 'audio' : 'youtube';
        if (persist) {
            window.appState.setMediaMode(mode);
            rememberSource({ mode: appliedMode });
        }
        if (mode === 'youtube') {
            switchYoutubeBtn.classList.add('media-mode-active');
            switchYoutubeBtn.classList.remove('text-gray-400', 'hover:text-white');
            switchAudioBtn.classList.remove('media-mode-active');
            switchAudioBtn.classList.add('text-gray-400', 'hover:text-white');
            showEl(youtubeInputGroup);
            hideEl(audioInputGroup);
        } else {
            switchAudioBtn.classList.add('media-mode-active');
            switchAudioBtn.classList.remove('text-gray-400', 'hover:text-white');
            switchYoutubeBtn.classList.remove('media-mode-active');
            switchYoutubeBtn.classList.add('text-gray-400', 'hover:text-white');
            showEl(audioInputGroup);
            hideEl(youtubeInputGroup);
        }
        // Cleanup when switching modes
        hideMediaPlayer();
    }

    switchYoutubeBtn.addEventListener('click', () => setMediaMode('youtube'));
    switchAudioBtn.addEventListener('click', () => setMediaMode('audio'));

    // --- Media Loop Synchronization ---
    const mediaLoopToggle = document.getElementById('mediaLoopToggle');
    const videoMediaLoopToggle = document.getElementById('videoMediaLoopToggle');

    function syncLoopToggles(isLoopOn) {
        mediaLoopToggle.checked = isLoopOn;
        videoMediaLoopToggle.checked = isLoopOn;

        window.appState.setMediaLoop(isLoopOn);

        // Update local audio player loop in real-time
        if (localAudioPlayer) {
            localAudioPlayer.loop = isLoopOn;
        }

        // For YouTube, we need to reload the embed with updated params
        if (youtubePlayer && (currentYouTubeVideoId || currentYouTubePlaylistId)) {
            const newEmbedUrl = buildYouTubeEmbedUrl(currentYouTubeVideoId, currentYouTubePlaylistId, isLoopOn);
            youtubeFrame.setAttribute('src', newEmbedUrl);
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
    mediaLoopToggle.checked = savedLoop;
    videoMediaLoopToggle.checked = savedLoop;
    if (localAudioPlayer) {
        localAudioPlayer.loop = savedLoop;
    }

    // Listen for toggle changes (both inputs)
    mediaLoopToggle.addEventListener('change', () => syncLoopToggles(mediaLoopToggle.checked));
    videoMediaLoopToggle.addEventListener('change', () => syncLoopToggles(videoMediaLoopToggle.checked));

    // Handle keyboard shortcut for loading URL (Ctrl+V or Cmd+V like)
    youtubeUrlInput.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            loadYoutubeBtn.click();
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

    localAudioFile.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        localAudioFileName.textContent = file.name;
        localAudioFileName.classList.remove('hidden');
        rememberSource({ mode: 'audio' });

        if (youtubePlayer) {
            youtubePlayer.stopVideo();
            youtubeFrame.setAttribute('src', '');
            hideEl(youtubeContainer);
        }

        if (currentAudioObjectUrl) URL.revokeObjectURL(currentAudioObjectUrl);
        currentAudioObjectUrl = URL.createObjectURL(file);
        localAudioPlayer.setAttribute('src', currentAudioObjectUrl);

        // Ensure YouTube is hidden
        hideEl(youtubeContainer);
        youtubeFrame.setAttribute('src', '');

        customAudioPlayer.classList.remove('hidden');
        showEl(customAudioPlayer);

        showEl(playerContainer);
        isMediaPlaying = true;
        updateMediaControls();

        // Apply loop setting
        const isLoopOn = mediaLoopToggle.checked;
        localAudioPlayer.loop = isLoopOn;

        playLocalAudio();

        // Set initial volume for local player
        const savedVolume = window.appState.get('mediaVolume');
        localAudioPlayer.volume = savedVolume / 100;
        volumeSlider.value = savedVolume;

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
        const icon = audioPlayPauseBtn.querySelector('i');
        if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-pause'); }
        if (started && typeof started.catch === 'function') {
            started.catch(() => {
                if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
            });
        }
    }

    audioPlayPauseBtn.addEventListener('click', function () {
        if (localAudioPlayer.paused) {
            playLocalAudio();
        } else {
            localAudioPlayer.pause();
            const icon = audioPlayPauseBtn.querySelector('i');
            if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
        }
    });

    localAudioPlayer.addEventListener('timeupdate', function () {
        const current = localAudioPlayer.currentTime;
        const total = localAudioPlayer.duration;
        if (!isNaN(total)) {
            const progress = (current / total) * 100;
            audioProgressSlider.value = progress;
            audioCurrentTime.textContent = formatTime(current);
            audioTotalTime.textContent = formatTime(total);
        }
    });

    audioProgressSlider.addEventListener('input', function () {
        const total = localAudioPlayer.duration;
        if (!isNaN(total)) {
            localAudioPlayer.currentTime = (this.value / 100) * total;
        }
    });

    // Stop local audio and release its blob URL.
    function stopLocalAudio() {
        if (!localAudioPlayer) return;
        localAudioPlayer.pause();
        localAudioPlayer.setAttribute('src', '');
        if (currentAudioObjectUrl) {
            URL.revokeObjectURL(currentAudioObjectUrl);
            currentAudioObjectUrl = null;
        }
        hideEl(customAudioPlayer);
        localAudioFileName.classList.add('hidden');
        const icon = audioPlayPauseBtn.querySelector('i');
        if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
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

        showEl(youtubeContainer);
        showEl(videoVolumeControl);
        youtubeFrame.setAttribute('src', embedUrl);

        // Initialize player for volume control after a delay
        setTimeout(() => initializeYouTubePlayer(), 1500);

        showEl(playerContainer);
        isMediaPlaying = true;
        updateMediaControls();

        videoVolumeSlider.value = window.appState.get('mediaVolume');
    }

    // Load YouTube video button
    loadYoutubeBtn.addEventListener('click', function () {
        const youtubeUrl = youtubeUrlInput.value.trim();

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
        const isLoopOn = mediaLoopToggle.checked;
        const embedUrl = buildYouTubeEmbedUrl(videoId, playlistId, isLoopOn);

        rememberSource({ mode: 'youtube', youtube: youtubeUrl });

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
    loadPlaylistBtn.addEventListener('click', function () {
        const youtubeUrl = youtubeUrlInput.value.trim();

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
        const isLoopOn = mediaLoopToggle.checked;
        const embedUrl = buildYouTubeEmbedUrl(null, playlistId, isLoopOn);

        rememberSource({ mode: 'youtube', youtube: youtubeUrl });

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
        videoVolumeSlider.value = savedVolume;
    }

    function onYouTubePlayerStateChange(event) {
        // We want the close button to stay if media was loaded, regardless of play state
        // but let's keep it consistent with your requirement
        // isMediaPlaying = event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED;
        // updateMediaControls();
    }

    function updateMediaControls() {
        if (isMediaPlaying) {
            closeBtn.classList.remove('hidden');
            showEl(closeBtn);
        } else {
            hideEl(closeBtn);
        }
    }

    closeBtn.addEventListener('click', hideMediaPlayer);

    // Audio Volume
    volumeSlider.addEventListener('input', function () {
        const volume = volumeSlider.value;
        const normalizedVolume = volume / 100;
        window.appState.setMediaVolume(parseInt(volume, 10));
        if (localAudioPlayer) {
            localAudioPlayer.volume = normalizedVolume;
        }
        // Sync the other slider if visible
        videoVolumeSlider.value = volume;
    });

    // Video Volume
    videoVolumeSlider.addEventListener('input', function () {
        const volume = videoVolumeSlider.value;
        window.appState.setMediaVolume(parseInt(volume, 10));
        if (youtubePlayer && youtubePlayer.setVolume) {
            youtubePlayer.setVolume(volume);
        }
        // Sync the other slider if visible
        volumeSlider.value = volume;
    });

    function hideMediaPlayer() {
        if (youtubePlayer) {
            try { youtubePlayer.destroy(); } catch(e) {}
            youtubePlayer = null;
        }
        stopLocalAudio();
        youtubeFrame.setAttribute('src', '');
        hideEl(youtubeContainer);
        hideEl(videoVolumeControl);
        hideEl(playerContainer);
        isMediaPlaying = false;
        updateMediaControls();
    }

    // Initialize with saved volume
    const initialVolume = window.appState.get('mediaVolume');
    volumeSlider.value = initialVolume;
    videoVolumeSlider.value = initialVolume;
    if (localAudioPlayer) localAudioPlayer.volume = initialVolume / 100;

    // Start hidden, in the media mode the reader last used
    hideEl(playerContainer);
    updateMediaControls();
    setMediaMode(window.appState.get('mediaMode') || 'youtube', false);
    applyDocumentSource();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMediaPane);
} else {
    setTimeout(startMediaPane, 0);
}

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
