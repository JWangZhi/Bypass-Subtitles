"""
Transcriber Service - Faster Whisper Integration

Handles speech-to-text transcription with GPU/CPU support.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

# Thread pool for CPU-bound transcription
_executor = ThreadPoolExecutor(max_workers=2)


class TranscriberService:
    """
    Service for transcribing audio using faster-whisper.
    
    Supports both GPU (CUDA) and CPU with automatic fallback.
    """
    
    def __init__(self, model_size: str = "small", device: str = "auto") -> None:
        """
        Initialize the transcriber.
        
        Args:
            model_size: Whisper model size ('tiny', 'base', 'small', 'medium', 'large')
            device: Device to use ('auto', 'cuda', 'cpu')
        """
        self.model_size = model_size
        self.model = None
        self.is_ready = False
        self.device = device
        self.configured_device = device  # Store original config
        
    async def initialize(self) -> None:
        """
        Initialize the Whisper model.
        
        Attempts GPU first (if auto), falls back to CPU if not available.
        """
        print(f"📦 Loading Whisper model: {self.model_size} (device: {self.configured_device})")
        
        # Run model loading in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, self._load_model)
        
        self.is_ready = True
        print(f"✅ Model loaded successfully on {self.device.upper()}")
    
    def _load_model(self) -> None:
        """Load the Whisper model (blocking, run in thread pool)."""
        try:
            from faster_whisper import WhisperModel
            
            # If explicitly set to CPU, use CPU directly
            if self.configured_device == "cpu":
                print("🖥️ Using CPU for transcription (configured)")
                self.model = WhisperModel(
                    self.model_size,
                    device="cpu",
                    compute_type="int8",
                )
                self.device = "cpu"
                return
            
            # Try GPU first if auto or cuda
            if self.configured_device in ("auto", "cuda"):
                try:
                    self.model = WhisperModel(
                        self.model_size,
                        device="cuda",
                        compute_type="float16",
                    )
                    self.device = "cuda"
                    print("🎮 Using GPU (CUDA) for transcription")
                    return
                except Exception as gpu_error:
                    print(f"⚠️ GPU not available: {gpu_error}")
                    if self.configured_device == "cuda":
                        raise  # Don't fallback if explicitly set to cuda
                    print("🖥️ Falling back to CPU...")
            
            # Fallback to CPU
            self.model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type="int8",
            )
            self.device = "cpu"
            print("🖥️ Using CPU for transcription")
                
        except ImportError as e:
            print(f"❌ Failed to import faster-whisper: {e}")
            raise
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw audio bytes (PCM 16-bit, 16kHz, mono)
            
        Returns:
            Dictionary with 'text', 'segments', and timing information
        """
        if not self.is_ready or self.model is None:
            return {"error": "Model not ready", "text": ""}
        
        try:
            # Run transcription in thread pool
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                _executor,
                self._transcribe_sync,
                audio_data,
            )
            return result
            
        except Exception as e:
            print(f"❌ Transcription error: {e}")
            return {"error": str(e), "text": ""}
    
    def _transcribe_sync(self, audio_data: bytes) -> dict[str, Any]:
        """
        Synchronous transcription (run in thread pool).
        
        Args:
            audio_data: Raw audio bytes
            
        Returns:
            Transcription result dictionary
        """
        # Convert bytes to numpy array (assuming PCM 16-bit, 16kHz, mono)
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        
        # Transcribe
        segments, info = self.model.transcribe(
            audio_array,
            beam_size=5,
            language=None,  # Auto-detect language
            vad_filter=True,  # Voice activity detection
        )
        
        # Collect results
        segments_list = []
        full_text = []
        
        for segment in segments:
            segments_list.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            })
            full_text.append(segment.text.strip())
        
        return {
            "text": " ".join(full_text),
            "segments": segments_list,
            "language": info.language,
            "language_probability": info.language_probability,
            "provider": "local",
        }
