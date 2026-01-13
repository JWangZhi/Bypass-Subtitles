/**
 * Bypass Subtitles - Popup Script
 * 
 * Controls the extension popup UI with language selection and API mode.
 */

// DOM Elements
const toggleBtn = document.getElementById('toggle-btn');
const toggleText = document.getElementById('toggle-text');
const videoDot = document.getElementById('video-dot');
const videoText = document.getElementById('video-text');
const backendDot = document.getElementById('backend-dot');
const backendText = document.getElementById('backend-text');
const sourceLang = document.getElementById('source-lang');
const targetLang = document.getElementById('target-lang');
const showOriginal = document.getElementById('show-original');
const apiMode = document.getElementById('api-mode');
const groqSettings = document.getElementById('groq-settings');
const groqApiKey = document.getElementById('groq-api-key');
const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
const reloadPageBtn = document.getElementById('reload-page-btn');

// State
let isEnabled = false;

// Default settings
const DEFAULT_SETTINGS = {
    sourceLang: 'auto',
    targetLang: 'vi',
    showOriginal: true,
    apiMode: 'groq',  // Default to Groq for non-tech users
    groqApiKey: '',
};

/**
 * Initialize popup
 */
async function init() {
    // Load saved settings
    await loadSettings();

    // Get current status
    await updateStatus();

    // Detect hardware and show recommendation (first time only)
    await detectHardwareAndRecommend();

    // Event listeners
    toggleBtn.addEventListener('click', toggleSubtitles);
    sourceLang.addEventListener('change', saveSettings);
    targetLang.addEventListener('change', saveSettings);
    showOriginal.addEventListener('change', saveSettings);
    apiMode.addEventListener('change', onApiModeChange);
    groqApiKey.addEventListener('change', saveSettings);
    groqApiKey.addEventListener('blur', saveSettings);
    toggleKeyVisibility.addEventListener('click', toggleApiKeyVisibility);
    reloadPageBtn.addEventListener('click', reloadCurrentPage);
}

/**
 * Reload current page to detect videos
 */
async function reloadCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.reload(tab.id);
        window.close(); // Close popup after reload
    } catch (error) {
        console.error('Failed to reload page:', error);
    }
}

/**
 * Detect hardware and recommend optimal mode
 */
async function detectHardwareAndRecommend() {
    try {
        // Check if already recommended
        const { hardwareChecked } = await chrome.storage.local.get('hardwareChecked');
        if (hardwareChecked) return;

        // Detect GPU via WebGL
        const gpuInfo = detectGPU();
        console.log('🖥️ Detected GPU:', gpuInfo);

        // Recommend based on GPU
        const recommendation = getRecommendation(gpuInfo);

        // Show recommendation if it differs from current setting
        if (recommendation.mode !== apiMode.value) {
            showHardwareRecommendation(gpuInfo, recommendation);
        }

        // Mark as checked
        await chrome.storage.local.set({ hardwareChecked: true });

    } catch (error) {
        console.error('Failed to detect hardware:', error);
    }
}

/**
 * Detect GPU via WebGL
 */
function detectGPU() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl) {
            return { vendor: 'Unknown', renderer: 'Unknown', tier: 'low' };
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) {
            return { vendor: 'Unknown', renderer: 'Unknown', tier: 'low' };
        }

        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        // Determine tier
        let tier = 'low';
        const rendererLower = renderer.toLowerCase();

        if (rendererLower.includes('rtx 40') || rendererLower.includes('rtx 30') ||
            rendererLower.includes('a100') || rendererLower.includes('h100')) {
            tier = 'high';
        } else if (rendererLower.includes('rtx 20') || rendererLower.includes('gtx 10') ||
            rendererLower.includes('gtx 16') || rendererLower.includes('radeon rx 6') ||
            rendererLower.includes('apple m')) {
            tier = 'medium';
        }

        return { vendor, renderer, tier };

    } catch (error) {
        return { vendor: 'Unknown', renderer: 'Unknown', tier: 'low' };
    }
}

/**
 * Get recommendation based on GPU tier
 */
function getRecommendation(gpuInfo) {
    switch (gpuInfo.tier) {
        case 'high':
            return {
                mode: 'local',
                model: 'small',
                reason: `Strong GPU detected (${gpuInfo.renderer}). Local mode recommended for best privacy.`
            };
        case 'medium':
            return {
                mode: 'local',
                model: 'tiny',
                reason: `Medium GPU detected (${gpuInfo.renderer}). Local mode possible with lightweight model.`
            };
        default:
            return {
                mode: 'groq',
                model: 'whisper-large-v3',
                reason: 'Groq API recommended for best performance on your hardware.'
            };
    }
}

/**
 * Show hardware recommendation to user
 */
function showHardwareRecommendation(gpuInfo, recommendation) {
    // Create recommendation banner
    const banner = document.createElement('div');
    banner.id = 'hardware-recommendation';
    banner.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px;
        margin: -15px -15px 15px -15px;
        border-radius: 12px 12px 0 0;
        font-size: 12px;
    `;
    banner.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">💡 Hardware Detected</div>
        <div style="opacity: 0.9; font-size: 11px;">${recommendation.reason}</div>
        <button id="apply-recommendation" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            margin-top: 8px;
            cursor: pointer;
            font-size: 11px;
        ">Apply Recommendation</button>
        <button id="dismiss-recommendation" style="
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.7);
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
        ">Dismiss</button>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    // Event handlers
    document.getElementById('apply-recommendation').addEventListener('click', () => {
        apiMode.value = recommendation.mode;
        onApiModeChange();
        saveSettings();
        banner.remove();
    });

    document.getElementById('dismiss-recommendation').addEventListener('click', () => {
        banner.remove();
    });
}

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        sourceLang.value = result.sourceLang;
        targetLang.value = result.targetLang;
        showOriginal.checked = result.showOriginal;
        apiMode.value = result.apiMode;
        groqApiKey.value = result.groqApiKey || '';

        // Show/hide Groq settings
        updateGroqSettingsVisibility();
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings() {
    try {
        const settings = {
            sourceLang: sourceLang.value,
            targetLang: targetLang.value,
            showOriginal: showOriginal.checked,
            apiMode: apiMode.value,
            groqApiKey: groqApiKey.value,
        };

        await chrome.storage.sync.set(settings);

        // Notify content script of settings change
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                action: 'updateSettings',
                settings,
            });
        } catch (e) {
            // Content script might not be loaded
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

/**
 * Handle API mode change
 */
function onApiModeChange() {
    updateGroqSettingsVisibility();
    saveSettings();
}

/**
 * Show/hide Groq settings based on API mode
 */
function updateGroqSettingsVisibility() {
    if (apiMode.value === 'groq') {
        groqSettings.style.display = 'block';
    } else {
        groqSettings.style.display = 'none';
    }
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
    if (groqApiKey.type === 'password') {
        groqApiKey.type = 'text';
        toggleKeyVisibility.textContent = '🙈';
    } else {
        groqApiKey.type = 'password';
        toggleKeyVisibility.textContent = '👁️';
    }
}

/**
 * Get status from content script
 */
async function updateStatus() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });

        isEnabled = response.isEnabled;

        // Update video status
        if (response.hasVideo) {
            videoDot.classList.add('connected');
            videoText.textContent = 'Found';
        } else {
            videoDot.classList.remove('connected');
            videoText.textContent = 'Not found';
        }

        // Update backend/API status
        if (apiMode.value === 'groq') {
            if (groqApiKey.value) {
                backendDot.classList.add('connected');
                backendText.textContent = 'Groq API';
            } else {
                backendDot.classList.remove('connected');
                backendText.textContent = 'Need API Key';
            }
        } else {
            if (response.isConnected) {
                backendDot.classList.add('connected');
                backendText.textContent = 'Connected';
            } else {
                backendDot.classList.remove('connected');
                backendText.textContent = 'Disconnected';
            }
        }

        // Update toggle button
        updateToggleButton();

    } catch (error) {
        console.error('Failed to get status:', error);
        videoText.textContent = 'No page';
        backendText.textContent = 'N/A';
    }
}

/**
 * Update toggle button appearance
 */
function updateToggleButton() {
    if (isEnabled) {
        toggleBtn.classList.remove('enable');
        toggleBtn.classList.add('disable');
        toggleBtn.innerHTML = '<span>⏹️</span><span>Disable Subtitles</span>';
    } else {
        toggleBtn.classList.remove('disable');
        toggleBtn.classList.add('enable');
        toggleBtn.innerHTML = '<span>▶️</span><span>Enable Subtitles</span>';
    }
}

/**
 * Toggle subtitles on/off
 */
async function toggleSubtitles() {
    try {
        // Validate Groq API key if using Groq mode
        if (apiMode.value === 'groq' && !groqApiKey.value) {
            alert('Please enter your Groq API key first.\n\nGet a free key at: https://console.groq.com/keys');
            return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const action = isEnabled ? 'disable' : 'enable';

        // Send settings along with enable action
        await chrome.tabs.sendMessage(tab.id, {
            action,
            settings: {
                sourceLang: sourceLang.value,
                targetLang: targetLang.value,
                showOriginal: showOriginal.checked,
                apiMode: apiMode.value,
                groqApiKey: groqApiKey.value,
            },
        });

        isEnabled = !isEnabled;
        updateToggleButton();

        // Update status after a short delay
        setTimeout(updateStatus, 500);

    } catch (error) {
        console.error('Failed to toggle subtitles:', error);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
