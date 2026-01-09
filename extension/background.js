/**
 * Bypass Subtitles - Background Service Worker
 * 
 * Handles extension lifecycle, Groq API calls, and communication.
 */

// Extension state
let extensionEnabled = false;

// Groq API endpoint
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

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
    console.log('Background received:', message.action);

    switch (message.action) {
        case 'getGlobalState':
            sendResponse({ extensionEnabled });
            break;

        case 'setGlobalState':
            extensionEnabled = message.enabled;
            sendResponse({ success: true });
            break;

        case 'transcribe':
            // Handle Groq API transcription
            handleGroqTranscription(message)
                .then(sendResponse)
                .catch(error => sendResponse({ error: error.message }));
            return true; // Keep channel open for async response

        default:
            sendResponse({ error: 'Unknown action' });
    }

    return true;
});

/**
 * Handle Groq API transcription
 */
async function handleGroqTranscription(message) {
    const { audio, apiKey, sourceLang } = message;

    if (!apiKey) {
        throw new Error('No API key provided');
    }

    try {
        // Convert base64 to Blob
        const audioBlob = base64ToBlob(audio, 'audio/wav');

        // Create form data for Groq API
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-large-v3');
        formData.append('response_format', 'json');

        // Set language if not auto
        if (sourceLang && sourceLang !== 'auto') {
            formData.append('language', sourceLang);
        }

        console.log('🔄 Calling Groq API...');

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Groq API response:', result.text?.substring(0, 50) + '...');

        // Return transcription result
        return {
            text: result.text,
            original: result.text,
            translated: null, // Translation handled separately if needed
            showOriginal: message.showOriginal,
        };

    } catch (error) {
        console.error('❌ Groq API error:', error);
        throw error;
    }
}

/**
 * Convert base64 PCM audio to WAV Blob
 */
function base64ToBlob(base64, mimeType) {
    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // PCM data
    const pcmData = new Int16Array(bytes.buffer);

    // Create WAV file
    const wavBuffer = createWavFile(pcmData, 16000);

    return new Blob([wavBuffer], { type: mimeType });
}

/**
 * Create WAV file from PCM data
 */
function createWavFile(pcmData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length * (bitsPerSample / 8);
    const headerSize = 44;

    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    const pcmOffset = 44;
    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(pcmOffset + i * 2, pcmData[i], true);
    }

    return buffer;
}

/**
 * Write string to DataView
 */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

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
