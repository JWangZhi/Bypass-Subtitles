/**
 * Bypass Subtitles - Background Service Worker
 * 
 * Handles extension lifecycle and communication between popup and content scripts.
 */

// Extension state
let extensionEnabled = false;

/**
 * Handle extension icon click (when no popup)
 */
chrome.action.onClicked.addListener(async (tab) => {
    // Toggle enabled state
    extensionEnabled = !extensionEnabled;

    // Send message to content script
    try {
        await chrome.tabs.sendMessage(tab.id, {
            action: extensionEnabled ? 'enable' : 'disable',
        });

        // Update icon badge
        updateBadge(tab.id, extensionEnabled);
    } catch (error) {
        console.error('Failed to communicate with content script:', error);
    }
});

/**
 * Update extension badge
 */
function updateBadge(tabId, enabled) {
    chrome.action.setBadgeText({
        tabId,
        text: enabled ? 'ON' : '',
    });

    chrome.action.setBadgeBackgroundColor({
        tabId,
        color: enabled ? '#10B981' : '#6B7280',
    });
}

/**
 * Handle messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received:', message);

    switch (message.action) {
        case 'getGlobalState':
            sendResponse({ extensionEnabled });
            break;

        case 'setGlobalState':
            extensionEnabled = message.enabled;
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown action' });
    }

    return true;
});

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('🎉 Bypass Subtitles installed!');

        // Open welcome page or options
        // chrome.tabs.create({ url: 'welcome.html' });
    }
});

console.log('🚀 Bypass Subtitles background script loaded');
