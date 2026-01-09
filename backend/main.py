"""
Bypass Subtitles Backend - FastAPI Server

Provides WebSocket endpoint for real-time audio transcription
with translation support.
"""

import base64
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from services.transcriber_factory import TranscriberFactory
from services.translator import get_translator

# Global transcriber instance
transcriber: Any = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Lifespan context manager for FastAPI.
    Initializes the transcriber on startup.
    """
    global transcriber
    
    mode = settings.get_effective_mode()
    print(f"🚀 Starting Bypass Subtitles Backend (mode: {mode.value})...")
    
    # Initialize transcriber based on config
    transcriber = await TranscriberFactory.create()
    
    print("✅ Backend ready!")
    yield
    
    # Cleanup
    translator = get_translator()
    await translator.close()
    print("👋 Shutting down...")


app = FastAPI(
    title="Bypass Subtitles API",
    description="Real-time audio transcription with translation",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS configuration for Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    mode = settings.get_effective_mode()
    return {
        "status": "healthy",
        "model_loaded": transcriber is not None and transcriber.is_ready,
        "mode": mode.value,
    }


@app.get("/config")
async def get_config() -> dict:
    """Get current configuration."""
    mode = settings.get_effective_mode()
    return {
        "mode": mode.value,
        "groq_available": bool(settings.groq_api_key),
        "openai_available": bool(settings.openai_api_key),
        "local_model": settings.whisper_model_size,
    }


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time audio transcription with translation.
    
    Protocol:
        1. Client sends JSON: {"audio": "<base64>", "sourceLang": "auto", "targetLang": "vi"}
        2. Server responds: {"text": "...", "translated": "...", "original": "...", ...}
    
    OR (legacy):
        1. Client sends binary audio data
        2. Server responds with transcription only
    """
    await websocket.accept()
    client_id = id(websocket)
    print(f"🔌 Client {client_id} connected")
    
    translator = get_translator()
    
    try:
        while True:
            # Receive message (can be JSON or binary)
            message = await websocket.receive()
            
            audio_data: bytes
            source_lang: str = "auto"
            target_lang: str = ""
            show_original: bool = True
            
            if "bytes" in message:
                # Legacy binary protocol
                audio_data = message["bytes"]
            elif "text" in message:
                # JSON protocol with settings
                try:
                    data = json.loads(message["text"])
                    audio_data = base64.b64decode(data.get("audio", ""))
                    source_lang = data.get("sourceLang", "auto")
                    target_lang = data.get("targetLang", "")
                    show_original = data.get("showOriginal", True)
                except (json.JSONDecodeError, KeyError) as e:
                    await websocket.send_json({"error": f"Invalid message format: {e}"})
                    continue
            else:
                continue
            
            if not audio_data:
                continue
            
            if transcriber is None or not transcriber.is_ready:
                await websocket.send_json({
                    "error": "Transcriber not ready",
                    "text": "",
                })
                continue
            
            # Transcribe audio
            result = await transcriber.transcribe(audio_data)
            
            if result.get("error"):
                await websocket.send_json(result)
                continue
            
            original_text = result.get("text", "")
            
            # Translate if target language is specified
            if target_lang and original_text:
                detected_lang = result.get("language", source_lang)
                
                # Don't translate if source and target are the same
                if detected_lang != target_lang:
                    translation = await translator.translate(
                        text=original_text,
                        target_lang=target_lang,
                        source_lang=detected_lang if detected_lang != "auto" else "auto",
                    )
                    result["translated"] = translation.get("translated", "")
                    result["original"] = original_text
                else:
                    result["translated"] = original_text
                    result["original"] = original_text
            else:
                result["translated"] = ""
                result["original"] = original_text
            
            result["showOriginal"] = show_original
            
            # Send result back
            await websocket.send_json(result)
            
            if original_text:
                log_text = result.get("translated") or original_text
                print(f"📤 [{result.get('provider', 'local')}] {log_text[:80]}...")
            
    except WebSocketDisconnect:
        print(f"🔌 Client {client_id} disconnected")
    except Exception as e:
        print(f"❌ Error with client {client_id}: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
