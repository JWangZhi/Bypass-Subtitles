/**
 * Bypass Subtitles - Popup Script
 * 
 * Controls the extension popup UI with language selection.
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

// State
let isEnabled = false;

// Default settings
const DEFAULT_SETTINGS = {
    sourceLang: 'auto',
    targetLang: 'vi',
    showOriginal: true,
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
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings() {
    try {
        await chrome.storage.sync.set({
            sourceLang: sourceLang.value,
            targetLang: targetLang.value,
            showOriginal: showOriginal.checked,
        });

        // Notify content script of settings change
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, {
            action: 'updateSettings',
            settings: {
                sourceLang: sourceLang.value,
                targetLang: targetLang.value,
                showOriginal: showOriginal.checked,
            },
        });
    } catch (error) {
        console.error('Failed to save settings:', error);
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

        // Update backend status
        if (response.isConnected) {
            backendDot.classList.add('connected');
            backendText.textContent = 'Connected';
        } else {
            backendDot.classList.remove('connected');
            backendText.textContent = 'Disconnected';
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
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const action = isEnabled ? 'disable' : 'enable';

        // Send settings along with enable action
        await chrome.tabs.sendMessage(tab.id, {
            action,
            settings: {
                sourceLang: sourceLang.value,
                targetLang: targetLang.value,
                showOriginal: showOriginal.checked,
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
