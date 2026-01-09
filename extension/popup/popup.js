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

    // Event listeners
    toggleBtn.addEventListener('click', toggleSubtitles);
    sourceLang.addEventListener('change', saveSettings);
    targetLang.addEventListener('change', saveSettings);
    showOriginal.addEventListener('change', saveSettings);
    apiMode.addEventListener('change', onApiModeChange);
    groqApiKey.addEventListener('change', saveSettings);
    groqApiKey.addEventListener('blur', saveSettings);
    toggleKeyVisibility.addEventListener('click', toggleApiKeyVisibility);
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
