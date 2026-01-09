# Bypass Subtitles 🎬

> AI-powered Chrome Extension that generates real-time subtitles with translation for any video without built-in captions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🎯 **Real-time Transcription** - Powered by OpenAI Whisper (local or cloud)
- 🌍 **Multi-language Translation** - Translate to Vietnamese, English, Chinese, and more
- 🎮 **GPU Accelerated** - CUDA support for faster processing
- 🔒 **Privacy First** - Audio processed locally, no data sent to external servers
- 📦 **Multiple Transcription Modes** - Local (faster-whisper), Groq API, OpenAI API

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend

# Install dependencies
uv sync

# Run server (with CUDA support for WSL2)
./run.sh
# OR without CUDA
uv run python main.py

# Server runs at ws://localhost:8765
```

### 2. Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### 3. Usage

1. Open a webpage with video (YouTube, Bilibili, Vimeo, etc.)
2. Click the extension icon
3. Select source and target languages
4. Click **Enable Subtitles**
5. Subtitles will appear automatically!

## 🎛️ Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Transcription mode: local, groq, openai, auto
TRANSCRIPTION_MODE=local

# For cloud APIs (faster, recommended for weak machines)
GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key

# Local Whisper settings
WHISPER_MODEL_SIZE=small  # tiny, base, small, medium, large-v3
WHISPER_DEVICE=auto       # auto, cuda, cpu
```

## 📊 Model Requirements

| Model | VRAM (GPU) | RAM (CPU) | Speed | Accuracy |
|-------|------------|-----------|-------|----------|
| tiny | ~1 GB | ~2 GB | ⚡⚡⚡⚡ | ⭐⭐ |
| base | ~1.5 GB | ~3 GB | ⚡⚡⚡ | ⭐⭐⭐ |
| small | ~2.5 GB | ~5 GB | ⚡⚡ | ⭐⭐⭐⭐ |
| medium | ~5 GB | ~10 GB | ⚡ | ⭐⭐⭐⭐⭐ |
| large-v3 | ~10 GB | ~16 GB | 🐢 | ⭐⭐⭐⭐⭐⭐ |

## 📁 Project Structure

```
bypass-subtitles/
├── backend/                 # Python FastAPI backend
│   ├── main.py             # WebSocket server
│   ├── config.py           # Configuration
│   ├── run.sh              # Startup script (CUDA support)
│   └── services/
│       ├── transcriber.py  # Local Whisper
│       ├── cloud_transcriber.py  # Groq/OpenAI APIs
│       └── translator.py   # Translation service
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js          # Video detection & audio capture
│   ├── background.js       # Service worker
│   ├── popup/              # Extension UI
│   └── styles/             # Subtitle styling
├── .env.example            # Environment template
└── README.md
```

## 🔧 Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| YouTube | ✅ | Full support |
| Bilibili | ✅ | Global & CN |
| Vimeo | ✅ | Full support |
| Twitch | ✅ | Full support |
| Netflix | ⚠️ | DRM blocks audio capture |
| Crunchyroll | ⚠️ | DRM blocks premium content |

## 📝 License

MIT © 2026 wangzhi
