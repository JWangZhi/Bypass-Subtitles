"""
Transcriber Factory - Creates appropriate transcriber based on config.

Supports:
- Local (faster-whisper with GPU/CPU)
- Groq API
- OpenAI API
"""

from typing import Any, Protocol

from config import TranscriptionMode, settings


class Transcriber(Protocol):
    """Protocol for transcriber implementations."""
    
    is_ready: bool
    
    async def initialize(self) -> None:
        """Initialize the transcriber."""
        ...
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        """Transcribe audio data."""
        ...


class TranscriberFactory:
    """Factory for creating transcriber instances."""
    
    _instance: Transcriber | None = None
    _mode: TranscriptionMode | None = None
    
    @classmethod
    async def create(cls) -> Transcriber:
        """
        Create and initialize the appropriate transcriber.
        
        Based on config settings, will create either:
        - LocalTranscriber (faster-whisper)
        - GroqTranscriber
        - OpenAITranscriber
        """
        mode = settings.get_effective_mode()
        
        # Return cached instance if mode hasn't changed
        if cls._instance is not None and cls._mode == mode:
            return cls._instance
        
        print(f"🔧 Creating transcriber with mode: {mode.value}")
        
        if mode == TranscriptionMode.GROQ:
            cls._instance = await cls._create_groq()
        elif mode == TranscriptionMode.OPENAI:
            cls._instance = await cls._create_openai()
        else:
            cls._instance = await cls._create_local()
        
        cls._mode = mode
        return cls._instance
    
    @classmethod
    async def _create_local(cls) -> Transcriber:
        """Create local faster-whisper transcriber."""
        from services.transcriber import TranscriberService
        
        transcriber = TranscriberService(
            model_size=settings.whisper_model_size,
            device=settings.whisper_device,
        )
        await transcriber.initialize()
        return transcriber
    
    @classmethod
    async def _create_groq(cls) -> Transcriber:
        """Create Groq API transcriber."""
        if not settings.groq_api_key:
            print("⚠️ GROQ_API_KEY not set, falling back to local")
            return await cls._create_local()
        
        transcriber = GroqTranscriberWrapper(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
        )
        await transcriber.initialize()
        return transcriber
    
    @classmethod
    async def _create_openai(cls) -> Transcriber:
        """Create OpenAI API transcriber."""
        if not settings.openai_api_key:
            print("⚠️ OPENAI_API_KEY not set, falling back to local")
            return await cls._create_local()
        
        transcriber = OpenAITranscriberWrapper(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
        )
        await transcriber.initialize()
        return transcriber


class GroqTranscriberWrapper:
    """Wrapper for GroqTranscriber to match Transcriber protocol."""
    
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._transcriber = None
        self.is_ready = False
    
    async def initialize(self) -> None:
        from services.cloud_transcriber import GroqTranscriber
        self._transcriber = GroqTranscriber(api_key=self.api_key, model=self.model)
        self.is_ready = await self._transcriber.is_available()
        if self.is_ready:
            print("✅ Groq transcriber ready")
        else:
            print("❌ Groq transcriber not available")
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        if not self._transcriber:
            return {"error": "Not initialized", "text": ""}
        return await self._transcriber.transcribe(audio_data)


class OpenAITranscriberWrapper:
    """Wrapper for OpenAITranscriber to match Transcriber protocol."""
    
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._transcriber = None
        self.is_ready = False
    
    async def initialize(self) -> None:
        from services.cloud_transcriber import OpenAITranscriber
        self._transcriber = OpenAITranscriber(api_key=self.api_key, model=self.model)
        self.is_ready = await self._transcriber.is_available()
        if self.is_ready:
            print("✅ OpenAI transcriber ready")
        else:
            print("❌ OpenAI transcriber not available")
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        if not self._transcriber:
            return {"error": "Not initialized", "text": ""}
        return await self._transcriber.transcribe(audio_data)
