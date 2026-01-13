# Use Cases & Algorithms

This document outlines edge cases, challenges, and proposed solutions for the Bypass Subtitles extension.

---

## 📺 Use Case 1: Long Video Duration

### Scenario

User watches videos with duration: 1h, 4h, 8h, 16h, 24h+

### Challenges

| Duration | Groq API Requests (3s chunk) | Free Tier Status |
|----------|------------------------------|------------------|
| 1 hour | 1,200 requests | ✅ OK (7,200 ASH/hour) |
| 4 hours | 4,800 requests | ✅ OK (real-time) |
| 8 hours | 9,600 requests | ✅ OK (real-time) |
| 24 hours | 28,800 requests | ✅ OK (real-time) |

### Solution

- **Groq API**: Free tier allows 7,200 audio seconds/hour = 2x real-time. Sufficient for continuous watching.
- **Local Backend**: Unlimited, constrained only by hardware performance.
- **Rate Limit Handling**: Implement retry with exponential backoff on 429 errors.

### Algorithm: Rate Limit Handler

```javascript
async function sendWithRetry(request, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(request);
        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') || 60;
            await sleep(retryAfter * 1000);
            continue;
        }
        return response;
    }
    throw new Error('Rate limit exceeded');
}
```

---

## ⏩ Use Case 2: Playback Rate Changes

### Scenario

User changes video playback speed: x0.5, x1, x1.5, x2

### Challenges

| Rate | Audio Pitch | Whisper Accuracy | Subtitle Sync |
|------|-------------|------------------|---------------|
| x0.5 | Lower | ✅ Good (95%) | ✅ OK |
| x1.0 | Normal | ✅ Good (98%) | ✅ OK |
| x1.5 | Higher | ⚠️ Reduced (85%) | ⚠️ May lag |
| x2.0 | Much higher | ❌ Poor (60-70%) | ❌ Falls behind |

### Solution

- **Detect playback rate** via `video.playbackRate`
- **Adjust chunk duration** based on rate
- **Show warning** when rate > 1.5x
- **Disable transcription** when rate > 2x (not feasible)

### Algorithm: Adaptive Playback Rate Handler

```javascript
function getAdjustedChunkDuration(playbackRate) {
    const baseChunk = 3000; // 3 seconds
    
    if (playbackRate <= 1.0) {
        return baseChunk;
    } else if (playbackRate <= 1.5) {
        // Increase chunk to compensate for faster playback
        return Math.floor(baseChunk * playbackRate);
    } else if (playbackRate <= 2.0) {
        // Show warning, use larger chunks
        showWarning('Transcription may be less accurate at high speeds');
        return Math.floor(baseChunk * 1.5);
    } else {
        // Disable transcription
        showWarning('Transcription disabled at speeds > 2x');
        return null;
    }
}

// Listen for rate changes
video.addEventListener('ratechange', () => {
    const newDuration = getAdjustedChunkDuration(video.playbackRate);
    if (newDuration) {
        updateChunkDuration(newDuration);
    } else {
        pauseTranscription();
    }
});
```

---

## 🔄 Use Case 3: Video Switching

### Scenario

User watches Video A (1h), then switches to Video B (1h), continues all day.

### Challenges

- Need to reset audio buffer on video change
- Subtitle overlay needs repositioning
- API quota is per-organization

### Solution

- **Each user has own API key** = own quota (unlimited users)
- **Reset state** on video/page change
- **Daily limit**: ~12 hours/day with Groq free tier

### Algorithm: Video Change Handler

```javascript
function onVideoChange(newVideo) {
    // Clear old state
    audioChunks = [];
    clearSubtitleOverlay();
    stopAudioCapture();
    
    // Setup new video
    activeVideo = newVideo;
    setupVideoEventListeners();
    startAudioCapture();
    createSubtitleOverlay();
    
    console.log('Video changed, state reset');
}
```

---

## 💻 Use Case 4: Diverse Hardware

### Scenario

Users have different GPU capabilities: RTX 3090, RTX 3070, GTX 1060, or no GPU.

### Challenges

| Hardware | VRAM | Recommended Mode |
|----------|------|------------------|
| RTX 3090/4090 | 24GB | Local `large-v3` |
| RTX 3070/3080 | 8-10GB | Local `small`/`medium` |
| GTX 1070/1080 | 8GB | Local `base`/`small` |
| GTX 1060/1660 | 6GB | Local `tiny`/`base` |
| GTX 1050 | 4GB | Groq API |
| No GPU | - | Groq API |
| Mac M1/M2 | Shared | Local `small` (MPS) |

### Solution

- **Auto-detect GPU** via WebGL or backend probe
- **Suggest optimal mode** in popup
- **Fallback to Groq API** if local is too slow

### Algorithm: Hardware Detection & Recommendation

```javascript
async function detectHardwareAndRecommend() {
    // Check WebGL for GPU info
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    // Recommend based on GPU
    if (gpu.includes('RTX 30') || gpu.includes('RTX 40')) {
        return { mode: 'local', model: 'small', chunk: 3000 };
    } else if (gpu.includes('GTX 10') || gpu.includes('GTX 16')) {
        return { mode: 'local', model: 'tiny', chunk: 4000 };
    } else {
        return { mode: 'groq', model: 'whisper-large-v3', chunk: 3000 };
    }
}
```

---

## ⏱️ Use Case 5: Real-time Sync

### Scenario

Subtitles must sync with video within 1-2 seconds delay.

### Challenges

- Network latency (Groq API): 500ms-1s
- Processing time (Local): varies by model
- Audio buffer accumulation: chunk duration

### Solution

- **Chunk = 3 seconds** (balance speed/accuracy)
- **Pipeline processing** (capture while processing)
- **Skip old chunks** if falling behind

### Algorithm: Adaptive Chunk Sizing

```javascript
let lastProcessingTime = 1000;
let currentChunkDuration = 3000;

function adaptChunkSize(processingTime) {
    lastProcessingTime = processingTime;
    
    // If processing takes longer than chunk, increase chunk size
    if (processingTime > currentChunkDuration * 0.8) {
        currentChunkDuration = Math.min(6000, currentChunkDuration + 500);
        console.warn(`Increasing chunk to ${currentChunkDuration}ms`);
    }
    // If processing is fast, can decrease chunk for lower latency
    else if (processingTime < currentChunkDuration * 0.3) {
        currentChunkDuration = Math.max(2000, currentChunkDuration - 500);
        console.log(`Decreasing chunk to ${currentChunkDuration}ms`);
    }
    
    return currentChunkDuration;
}
```

### Algorithm: Skip Strategy (Prevent Lag Accumulation)

```javascript
let lagAccumulator = 0;
const MAX_LAG = 5000; // 5 seconds

function processChunk(chunk, captureTime) {
    const currentTime = Date.now();
    const chunkAge = currentTime - captureTime;
    
    lagAccumulator += chunkAge - CONFIG.AUDIO_CHUNK_DURATION_MS;
    
    // If too far behind, skip old chunks
    if (lagAccumulator > MAX_LAG) {
        console.warn(`Skipping chunk, lag: ${lagAccumulator}ms`);
        audioChunks = []; // Clear buffer
        lagAccumulator = 0;
        return null;
    }
    
    return transcribe(chunk);
}
```

---

## 📊 Summary: Recommended Configurations

| User Type | Mode | Model | Chunk | Notes |
|-----------|------|-------|-------|-------|
| **Non-tech user** | Groq API | whisper-large-v3 | 3s | Free, fast, easy |
| **Power user (RTX)** | Local | small | 3s | Privacy, unlimited |
| **Legacy GPU** | Local | tiny | 4s | Lower accuracy |
| **No GPU** | Groq API | whisper-large-v3 | 3s | Only option |
| **Long sessions** | Either | - | 3-4s | Monitor rate limits |
| **High speed playback** | Either | - | 4-5s | Show warning >1.5x |

---

## 🚀 Implementation Status

### Phase 1: Core Features ✅

| # | Feature | Status | File |
|---|---------|--------|------|
| 1 | Groq API mode | ✅ Done | `background.js`, `content.js` |
| 2 | Local backend mode | ✅ Done | `content.js`, `backend/` |
| 3 | Rate Limit Retry Handler | ✅ Done | `background.js` |
| 4 | Playback Rate Detection | ✅ Done | `content.js` |
| 5 | Adaptive Chunk Sizing | ✅ Done | `content.js` |
| 6 | Skip Strategy (Lag Prevention) | ✅ Done | `content.js` |
| 7 | Video Change Handler | ✅ Done | `content.js` |
| 8 | Hardware Auto-Detection | ✅ Done | `popup.js` |

---

### Phase 2: Local Mode for Non-Tech Users 🎯

**Goal:** Cho phép non-tech users dùng local mode mà không cần Docker/command line.

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 9 | WASM Whisper Integration | ⏳ Pending | 🔴 High |
| 10 | IndexedDB Subtitle Storage | ⏳ Pending | 🔴 High |
| 11 | Model Download & Cache | ⏳ Pending | 🔴 High |
| 12 | Offline Mode | ⏳ Pending | 🟡 Medium |

---

## 🧠 Use Case 6: WASM Local Mode (Non-Tech Users)

### Scenario

Non-tech user muốn dùng local mode để privacy, nhưng không biết Docker/command line.

### User Flow

```
1. User install extension
2. User mở video
3. User chọn "Local (Privacy)" mode
4. [First time] Extension tự download model (~39-74MB)
5. Model được cache trong browser
6. Transcription chạy hoàn toàn trong browser (WASM)
7. Không cần internet sau khi có model
```

### Technical Requirements

| Component | Technology | Notes |
|-----------|------------|-------|
| **Runtime** | WebAssembly (WASM) | whisper.cpp compiled to WASM |
| **Model** | tiny (39MB) or base (74MB) | Balance speed/accuracy |
| **Storage** | Cache API / OPFS | Persist model across sessions |
| **Performance** | ~2-3x realtime | Acceptable for most use cases |

### Challenges

| Challenge | Solution |
|-----------|----------|
| Model size (39-74MB) | Download once, cache forever |
| Browser performance | Use tiny/base models only |
| Background tab throttling | Warn user to keep tab active |
| Browser compatibility | Require WASM SIMD support |

---

## 💾 Use Case 7: Subtitle Storage (IndexedDB)

### Scenario

User xem video, muốn lưu subtitles để xem lại sau hoặc export.

### Requirements

- Lưu subtitles locally trong browser
- Persist across browser sessions
- Search/filter by video
- Export to SRT/VTT format
- Sync across devices (future)

### Database Schema

```javascript
// IndexedDB Store: subtitles
{
  id: "uuid",
  videoHash: "sha256_of_url",
  videoTitle: "Video Title",
  videoUrl: "https://...",
  createdAt: Date,
  updatedAt: Date,
  duration: 3600, // seconds
  segments: [
    { start: 0.0, end: 3.5, text: "Hello", translated: "Xin chào" }
  ],
  metadata: {
    sourceLanguage: "en",
    targetLanguage: "vi",
    mode: "groq" | "local" | "wasm"
  }
}
```

### Storage Limits

| Browser | IndexedDB Limit | Notes |
|---------|-----------------|-------|
| Chrome | 80% of disk | Practically unlimited |
| Firefox | 50% of disk | Practically unlimited |
| Safari | 1GB | May need cleanup |

---

## 🔮 Phase 3: Community Features (Future)

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 13 | Cloud Subtitle Sync | ⏳ Pending | 🟡 Medium |
| 14 | Crowd-sourced Subtitles | ⏳ Pending | 🟡 Medium |
| 15 | User Authentication | ⏳ Pending | 🟢 Low |
| 16 | Voting/Moderation | ⏳ Pending | 🟢 Low |

**Note:** Phase 3 sẽ implement sau khi Phase 2 hoàn thành và có user base.
