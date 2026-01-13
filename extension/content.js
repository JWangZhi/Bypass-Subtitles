/**
 * Bypass Subtitles - Content Script
 * 
 * Detects videos on the page, captures audio, and displays subtitles
 * with translation support.
 */

// Configuration
const CONFIG = {
    BACKEND_WS_URL: 'ws://localhost:8765/ws/transcribe',
    AUDIO_CHUNK_DURATION_MS: 3000, // 3 giây - vừa đúng Groq free tier (20 req/min)
    SAMPLE_RATE: 16000, // 16kHz for Whisper
    SUBTITLE_DISPLAY_DURATION_MS: 5000, // 5 giây
};

// State
let isEnabled = false;
let activeVideo = null;
let audioContext = null;
let mediaStreamSource = null;
let audioProcessor = null;
let websocket = null;
let audioChunks = [];
let subtitleOverlay = null;
let sendInterval = null;

// Adaptive chunk sizing state
let currentChunkDuration = CONFIG.AUDIO_CHUNK_DURATION_MS;
let lastProcessingTime = 0;
let lagAccumulator = 0;
const MAX_LAG_MS = 5000; // Skip chunks if lag > 5 seconds

// Language and API settings
let currentSettings = {
    sourceLang: 'auto',
    targetLang: 'vi',
    showOriginal: true,
    apiMode: 'groq',  // 'local' or 'groq'
    groqApiKey: '',
};

/**
 * Initialize the content script
 */
function init() {
    console.log('🎬 Bypass Subtitles: Content script loaded');

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener(handleMessage);

    // Load saved settings
    loadSettings();

    // Detect videos on page
    detectVideos();

    // Watch for dynamically added videos
    observeDOM();
}

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get({
            sourceLang: 'auto',
            targetLang: 'vi',
            showOriginal: true,
            apiMode: 'groq',
            groqApiKey: '',
        });
        currentSettings = result;
        console.log('⚙️ Loaded settings:', {
            apiMode: result.apiMode,
            hasApiKey: !!result.groqApiKey,
            sourceLang: result.sourceLang,
            targetLang: result.targetLang,
        });
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

/**
 * Handle messages from popup or background script
 */
function handleMessage(message, sender, sendResponse) {
    console.log('📨 Received message:', message);

    switch (message.action) {
        case 'enable':
            if (message.settings) {
                currentSettings = message.settings;
            }
            enableSubtitles();
            sendResponse({ success: true });
            break;

        case 'disable':
            disableSubtitles();
            sendResponse({ success: true });
            break;

        case 'getStatus':
            const videos = document.querySelectorAll('video');
            const existingSubs = activeVideo ? detectExistingSubtitles(activeVideo) :
                (videos.length > 0 ? detectExistingSubtitles(videos[0]) : []);
            sendResponse({
                isEnabled,
                hasVideo: activeVideo !== null || videos.length > 0,
                isConnected: websocket?.readyState === WebSocket.OPEN,
                existingSubtitles: existingSubs,
                hasExistingSubtitles: existingSubs.length > 0,
            });
            break;

        case 'updateSettings':
            if (message.settings) {
                currentSettings = message.settings;
                console.log('⚙️ Settings updated:', currentSettings);
            }
            sendResponse({ success: true });
            break;

        case 'selectVideo':
            selectVideoByIndex(message.index);
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown action' });
    }

    return true; // Keep channel open for async response
}

/**
 * Detect all video elements on the page
 */
function detectVideos() {
    const videos = document.querySelectorAll('video');
    console.log(`🔍 Found ${videos.length} video(s) on page`);

    videos.forEach((video, index) => {
        highlightVideo(video, index);

        // Check for existing subtitles
        const existingSubs = detectExistingSubtitles(video);
        if (existingSubs.length > 0) {
            console.log(`📝 Video ${index} has existing subtitles:`, existingSubs);
        }
    });

    // Auto-select first video if only one exists
    if (videos.length === 1) {
        activeVideo = videos[0];
        console.log('📺 Auto-selected single video');
    }

    return videos;
}

/**
 * Detect existing subtitle tracks in a video element
 * Checks for: <track> elements, YouTube captions, embedded text tracks
 */
function detectExistingSubtitles(video) {
    const subtitles = [];

    // Check for <track> elements (standard HTML5 subtitles)
    const tracks = video.querySelectorAll('track');
    tracks.forEach((track) => {
        subtitles.push({
            type: 'track',
            kind: track.kind || 'subtitles',
            label: track.label || 'Unknown',
            language: track.srclang || 'unknown',
            src: track.src,
        });
    });

    // Check video.textTracks API
    if (video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
            const track = video.textTracks[i];
            // Avoid duplicates from <track> elements
            const isDuplicate = subtitles.some(s => s.label === track.label && s.language === track.language);
            if (!isDuplicate) {
                subtitles.push({
                    type: 'textTrack',
                    kind: track.kind || 'subtitles',
                    label: track.label || 'Unknown',
                    language: track.language || 'unknown',
                    mode: track.mode, // 'showing', 'hidden', 'disabled'
                });
            }
        }
    }

    // Check for YouTube-style captions (they use different container)
    const ytCaptions = document.querySelector('.ytp-caption-window-container');
    if (ytCaptions) {
        subtitles.push({
            type: 'youtube',
            label: 'YouTube Captions',
            language: 'auto',
        });
    }

    // Check for common video player subtitle containers
    const subtitleContainers = [
        '.vjs-text-track-display', // Video.js
        '.jw-captions',            // JW Player
        '.plyr__captions',         // Plyr
        '.mejs-captions-layer',    // MediaElement.js
        '[class*="subtitle"]',     // Generic
        '[class*="caption"]',      // Generic
    ];

    subtitleContainers.forEach((selector) => {
        const container = document.querySelector(selector);
        if (container && container.textContent.trim()) {
            const isDuplicate = subtitles.some(s => s.type === 'player');
            if (!isDuplicate) {
                subtitles.push({
                    type: 'player',
                    label: 'Player Captions',
                    language: 'auto',
                });
            }
        }
    });

    return subtitles;
}


/**
 * Add visual indicator to detected videos
 */
function highlightVideo(video, index) {
    // Skip if already processed
    if (video.dataset.bypassSubtitlesIndex !== undefined) return;

    // Add data attribute for identification
    video.dataset.bypassSubtitlesIndex = index;

    // Add subtle border on hover (removed when subtitles enabled)
    video.addEventListener('mouseenter', () => {
        if (!isEnabled) {
            video.style.outline = '3px solid rgba(99, 102, 241, 0.7)';
        }
    });

    video.addEventListener('mouseleave', () => {
        if (!isEnabled) {
            video.style.outline = '';
        }
    });

    // Click to select video
    video.addEventListener('click', (e) => {
        if (!isEnabled && e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            activeVideo = video;
            console.log(`📺 Selected video ${index}`);
            showNotification(`Video ${index + 1} selected`);
        }
    }, true);
}

/**
 * Observe DOM for dynamically added videos and video changes
 */
function observeDOM() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'VIDEO') {
                    handleNewVideoDetected(node);
                }

                // Check for videos inside added nodes
                if (node.querySelectorAll) {
                    const videos = node.querySelectorAll('video');
                    videos.forEach((video) => {
                        handleNewVideoDetected(video);
                    });
                }
            });

            // Detect video source changes (YouTube next video, etc.)
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const target = mutation.target;
                if (target.nodeName === 'VIDEO' || target.nodeName === 'SOURCE') {
                    const video = target.nodeName === 'VIDEO' ? target : target.closest('video');
                    if (video && video === activeVideo && isEnabled) {
                        console.log('🔄 Video source changed - resetting state');
                        resetTranscriptionState();
                    }
                }
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
    });
}

/**
 * Handle new video detected
 */
function handleNewVideoDetected(video) {
    const videos = document.querySelectorAll('video');
    const index = Array.from(videos).indexOf(video);
    highlightVideo(video, index);
    console.log('🆕 New video detected');

    // If subtitles enabled and this is the main video, switch to it
    if (isEnabled && videos.length === 1) {
        console.log('📺 Auto-switching to new video');
        switchToVideo(video);
    }
}

/**
 * Switch to a new video (reset state and start capture)
 */
function switchToVideo(newVideo) {
    // Stop current capture
    stopAudioCapture();

    // Reset state
    resetTranscriptionState();

    // Setup new video
    activeVideo = newVideo;
    setupVideoEventListeners();

    // Restart capture if enabled
    if (isEnabled) {
        startAudioCapture();
        showNotification('Switched to new video');
    }
}

/**
 * Reset transcription state (called on video change or seek)
 */
function resetTranscriptionState() {
    audioChunks = [];
    lagAccumulator = 0;
    currentChunkDuration = CONFIG.AUDIO_CHUNK_DURATION_MS;

    if (subtitleOverlay) {
        subtitleOverlay.innerHTML = '';
    }

    console.log('🔄 Transcription state reset');
}

/**
 * Select video by index
 */
function selectVideoByIndex(index) {
    const videos = document.querySelectorAll('video');
    if (index >= 0 && index < videos.length) {
        activeVideo = videos[index];
        console.log(`📺 Selected video ${index}`);
    }
}

/**
 * Enable subtitles for active video
 */
async function enableSubtitles() {
    if (!activeVideo) {
        // Try to find a video
        const videos = detectVideos();
        if (videos.length === 0) {
            showNotification('No video found on this page', 'error');
            return;
        }
        activeVideo = videos[0];
    }

    console.log('🟢 Enabling subtitles...');
    console.log(`📡 Mode: ${currentSettings.apiMode}`);
    isEnabled = true;

    // Add video event listeners for sync
    setupVideoEventListeners();

    // Connect to backend only if using local mode
    if (currentSettings.apiMode === 'local') {
        await connectWebSocket();
    } else {
        console.log('⚡ Using Groq API - no WebSocket needed');
    }

    // Start audio capture
    await startAudioCapture();

    // Create subtitle overlay
    createSubtitleOverlay();

    const modeText = currentSettings.apiMode === 'groq' ? 'Groq API' : 'Local Backend';
    showNotification(`Subtitles enabled (${modeText})`);
}

/**
 * Setup video event listeners for better sync
 */
function setupVideoEventListeners() {
    if (!activeVideo) return;

    // Clear buffer and subtitle when seeking
    activeVideo.addEventListener('seeking', () => {
        console.log('⏩ Video seeking - clearing audio buffer');
        audioChunks = [];
        if (subtitleOverlay) {
            subtitleOverlay.innerHTML = '';
        }
    });

    // Clear subtitle when paused
    activeVideo.addEventListener('pause', () => {
        console.log('⏸️ Video paused');
    });

    // Resume when playing
    activeVideo.addEventListener('play', () => {
        console.log('▶️ Video playing');
    });

    // Handle playback rate changes
    activeVideo.addEventListener('ratechange', () => {
        handlePlaybackRateChange(activeVideo.playbackRate);
    });

    console.log('✅ Video event listeners setup');
}

/**
 * Handle playback rate changes - adjust chunk size and show warnings
 */
function handlePlaybackRateChange(rate) {
    console.log(`⚡ Playback rate changed to: ${rate}x`);

    if (rate > 2.0) {
        showNotification('⚠️ Speed too high! Subtitles may not work at >2x', 'warning');
        // Could disable transcription here
    } else if (rate > 1.5) {
        showNotification(`⚠️ Speed: ${rate}x - Accuracy may be reduced`, 'warning');
    } else if (rate < 0.5) {
        showNotification(`Speed: ${rate}x - Subtitles will be slower`, 'info');
    }
}

/**
 * Disable subtitles
 */
function disableSubtitles() {
    console.log('🔴 Disabling subtitles...');
    isEnabled = false;

    // Stop audio capture
    stopAudioCapture();

    // Disconnect WebSocket
    if (websocket) {
        websocket.close();
        websocket = null;
    }

    // Clear interval
    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
    }

    // Remove subtitle overlay
    removeSubtitleOverlay();

    showNotification('Subtitles disabled');
}

/**
 * Connect to backend WebSocket
 */
async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        console.log('🔌 Connecting to backend...');

        websocket = new WebSocket(CONFIG.BACKEND_WS_URL);

        websocket.onopen = () => {
            console.log('✅ Connected to backend');
            resolve();
        };

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleTranscription(data);
        };

        websocket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            showNotification('Failed to connect to backend', 'error');
            reject(error);
        };

        websocket.onclose = () => {
            console.log('🔌 Disconnected from backend');
            if (isEnabled) {
                // Try to reconnect after 3 seconds
                setTimeout(() => {
                    if (isEnabled) {
                        connectWebSocket();
                    }
                }, 3000);
            }
        };
    });
}

/**
 * Start capturing audio from video
 * Uses captureStream() to avoid muting the video
 */
async function startAudioCapture() {
    if (!activeVideo) return;

    console.log('🎤 Starting audio capture...');

    try {
        // Method 1: Use captureStream() - doesn't mute video
        let stream;

        if (activeVideo.captureStream) {
            stream = activeVideo.captureStream();
        } else if (activeVideo.mozCaptureStream) {
            stream = activeVideo.mozCaptureStream();
        }

        if (!stream) {
            console.error('❌ captureStream not supported');
            showNotification('Audio capture not supported in this browser', 'error');
            return;
        }

        // Get audio tracks from stream
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.error('❌ No audio tracks found');
            showNotification('No audio found in video', 'error');
            return;
        }

        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: CONFIG.SAMPLE_RATE,
        });

        // Create media stream source (this doesn't affect video playback)
        const audioStream = new MediaStream(audioTracks);
        mediaStreamSource = audioContext.createMediaStreamSource(audioStream);

        // Create script processor for capturing audio
        const bufferSize = 4096;
        audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

        audioProcessor.onaudioprocess = (event) => {
            if (!isEnabled) return;

            const inputData = event.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }

            audioChunks.push(int16Data);
        };

        // Connect: stream -> processor (no need to connect to destination)
        // This captures audio without affecting playback
        mediaStreamSource.connect(audioProcessor);
        audioProcessor.connect(audioContext.destination); // Required for processing to work

        // Send audio chunks periodically
        sendInterval = setInterval(() => {
            if (audioChunks.length > 0) {
                // For Groq mode, don't need WebSocket check
                if (currentSettings.apiMode === 'groq') {
                    sendAudioChunks();
                } else if (websocket?.readyState === WebSocket.OPEN) {
                    sendAudioChunks();
                }
            }
        }, CONFIG.AUDIO_CHUNK_DURATION_MS);

        console.log('✅ Audio capture started (video audio preserved)');

    } catch (error) {
        console.error('❌ Failed to start audio capture:', error);
        showNotification('Failed to capture audio. Try refreshing the page.', 'error');
    }
}
/**
 * Send accumulated audio chunks to backend with settings and video timestamp
 */
function sendAudioChunks() {
    if (audioChunks.length === 0) return;
    if (!activeVideo) return;

    // Get current video timestamp
    const videoTime = activeVideo.currentTime;

    // Merge all chunks
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedData = new Int16Array(totalLength);

    let offset = 0;
    audioChunks.forEach((chunk) => {
        mergedData.set(chunk, offset);
        offset += chunk.length;
    });

    // Clear chunks
    audioChunks = [];

    // Convert to base64 for JSON transmission
    const base64Audio = arrayBufferToBase64(mergedData.buffer);

    // Send based on API mode
    if (currentSettings.apiMode === 'groq') {
        // Send to background script for Groq API
        sendToGroqAPI(base64Audio, videoTime);
    } else {
        // Send to local backend via WebSocket
        sendToLocalBackend(base64Audio, videoTime);
    }
}

/**
 * Send audio to Groq API via background script
 */
async function sendToGroqAPI(base64Audio, videoTime) {
    const startTime = Date.now();

    try {
        // Check if we're too far behind - skip if so
        const chunkAge = Date.now() - (videoTime * 1000);
        if (chunkAge > MAX_LAG_MS) {
            console.warn(`⏭️ Skipping chunk: too far behind (${Math.round(chunkAge / 1000)}s lag)`);
            lagAccumulator = 0;
            return;
        }

        console.log(`📤 Sending to Groq API @ ${formatTime(videoTime)}`);

        const response = await chrome.runtime.sendMessage({
            action: 'transcribe',
            audio: base64Audio,
            apiKey: currentSettings.groqApiKey,
            sourceLang: currentSettings.sourceLang,
            targetLang: currentSettings.targetLang,
            showOriginal: currentSettings.showOriginal,
        });

        // Track processing time for adaptive sizing
        const processingTime = Date.now() - startTime;
        lastProcessingTime = processingTime;
        adaptChunkSize(processingTime);

        if (response.error) {
            console.error('❌ Groq API error:', response.error);
            return;
        }

        // Handle transcription result
        handleTranscription(response);

    } catch (error) {
        console.error('❌ Failed to send to Groq API:', error);
    }
}

/**
 * Adapt chunk size based on processing time
 */
function adaptChunkSize(processingTime) {
    const threshold = currentChunkDuration * 0.8;

    // If processing takes too long, increase chunk size
    if (processingTime > threshold && currentChunkDuration < 6000) {
        currentChunkDuration = Math.min(6000, currentChunkDuration + 500);
        console.warn(`⏱️ Processing slow (${processingTime}ms). Increasing chunk to ${currentChunkDuration}ms`);
        restartSendInterval();
    }
    // If processing is fast, can decrease for lower latency
    else if (processingTime < currentChunkDuration * 0.3 && currentChunkDuration > 2000) {
        currentChunkDuration = Math.max(2000, currentChunkDuration - 500);
        console.log(`⚡ Processing fast (${processingTime}ms). Decreasing chunk to ${currentChunkDuration}ms`);
        restartSendInterval();
    }
}

/**
 * Restart send interval with new chunk duration
 */
function restartSendInterval() {
    if (sendInterval) {
        clearInterval(sendInterval);
    }
    sendInterval = setInterval(() => {
        if (audioChunks.length > 0) {
            if (currentSettings.apiMode === 'groq') {
                sendAudioChunks();
            } else if (websocket?.readyState === WebSocket.OPEN) {
                sendAudioChunks();
            }
        }
    }, currentChunkDuration);
}

/**
 * Send audio to local backend via WebSocket
 */
function sendToLocalBackend(base64Audio, videoTime) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket not connected');
        return;
    }

    const message = {
        audio: base64Audio,
        sourceLang: currentSettings.sourceLang,
        targetLang: currentSettings.targetLang,
        showOriginal: currentSettings.showOriginal,
        videoTime: videoTime,
    };

    websocket.send(JSON.stringify(message));
    console.log(`📤 Sent to local backend @ ${formatTime(videoTime)}`);
}

/**
 * Format seconds to MM:SS format
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Stop audio capture
 */
function stopAudioCapture() {
    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    if (mediaStreamSource) {
        mediaStreamSource.disconnect();
        mediaStreamSource = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    audioChunks = [];
    console.log('🔇 Audio capture stopped');
}

/**
 * Handle transcription result from backend (with translation)
 */
function handleTranscription(data) {
    if (data.error) {
        console.error('❌ Transcription error:', data.error);
        return;
    }

    const original = data.original || data.text || '';
    const translated = data.translated || '';
    const showOriginal = data.showOriginal !== false && currentSettings.showOriginal;

    if (original.trim() || translated.trim()) {
        console.log(`📝 Original: ${original}`);
        if (translated) {
            console.log(`🌐 Translated: ${translated}`);
        }
        displaySubtitle(original, translated, showOriginal);
    }
}

/**
 * Create subtitle overlay element
 */
function createSubtitleOverlay() {
    if (subtitleOverlay) return;

    subtitleOverlay = document.createElement('div');
    subtitleOverlay.id = 'bypass-subtitles-overlay';
    subtitleOverlay.className = 'bypass-subtitles-container';

    // Position relative to video
    positionOverlay();

    document.body.appendChild(subtitleOverlay);

    // Reposition on video resize
    if (activeVideo) {
        const resizeObserver = new ResizeObserver(() => {
            positionOverlay();
        });
        resizeObserver.observe(activeVideo);
    }

    // Reposition on scroll
    window.addEventListener('scroll', positionOverlay);

    console.log('📺 Subtitle overlay created');
}

/**
 * Position overlay relative to video
 */
function positionOverlay() {
    if (!subtitleOverlay || !activeVideo) return;

    const rect = activeVideo.getBoundingClientRect();

    subtitleOverlay.style.position = 'fixed';
    subtitleOverlay.style.left = `${rect.left}px`;
    subtitleOverlay.style.width = `${rect.width}px`;
    subtitleOverlay.style.bottom = `${window.innerHeight - rect.bottom + 40}px`;
}

/**
 * Display subtitle text (with optional translation)
 */
function displaySubtitle(original, translated, showOriginal) {
    if (!subtitleOverlay) return;

    // Create subtitle container
    const subtitleContainer = document.createElement('div');
    subtitleContainer.className = 'bypass-subtitle-wrapper';

    // Show translated text (main)
    if (translated) {
        const translatedEl = document.createElement('div');
        translatedEl.className = 'bypass-subtitle-text bypass-subtitle-translated';
        translatedEl.textContent = translated;
        subtitleContainer.appendChild(translatedEl);
    }

    // Show original text (smaller, above translated)
    if (showOriginal && original && translated && original !== translated) {
        const originalEl = document.createElement('div');
        originalEl.className = 'bypass-subtitle-text bypass-subtitle-original';
        originalEl.textContent = original;
        subtitleContainer.insertBefore(originalEl, subtitleContainer.firstChild);
    } else if (!translated && original) {
        // No translation, just show original
        const originalEl = document.createElement('div');
        originalEl.className = 'bypass-subtitle-text bypass-subtitle-translated';
        originalEl.textContent = original;
        subtitleContainer.appendChild(originalEl);
    }

    // Clear previous subtitle
    subtitleOverlay.innerHTML = '';
    subtitleOverlay.appendChild(subtitleContainer);

    // Auto-hide after duration
    setTimeout(() => {
        subtitleContainer.classList.add('fade-out');
        setTimeout(() => {
            if (subtitleContainer.parentNode === subtitleOverlay) {
                subtitleOverlay.removeChild(subtitleContainer);
            }
        }, 500);
    }, CONFIG.SUBTITLE_DISPLAY_DURATION_MS);
}

/**
 * Remove subtitle overlay
 */
function removeSubtitleOverlay() {
    if (subtitleOverlay) {
        subtitleOverlay.remove();
        subtitleOverlay = null;
    }
    window.removeEventListener('scroll', positionOverlay);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `bypass-notification bypass-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
