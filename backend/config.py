"""
Configuration settings for Bypass Subtitles Backend.

Supports environment variables and .env file.
"""

from enum import Enum
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class TranscriptionMode(str, Enum):
    """Transcription mode options."""
    LOCAL = "local"      # Use local faster-whisper
    GROQ = "groq"        # Use Groq Whisper API
    OPENAI = "openai"    # Use OpenAI Whisper API
    AUTO = "auto"        # Auto-detect best option


class Settings(BaseSettings):
    """
    Application settings.
    
    Load from environment variables or .env file.
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8765
    
    # Transcription mode
    transcription_mode: TranscriptionMode = TranscriptionMode.AUTO
    
    # Local Whisper settings
    whisper_model_size: str = "small"
    whisper_device: str = "auto"  # auto, cuda, cpu
    
    # Groq API settings
    groq_api_key: Optional[str] = None
    groq_model: str = "whisper-large-v3"
    
    # OpenAI API settings
    openai_api_key: Optional[str] = None
    openai_model: str = "whisper-1"
    
    # Performance settings
    max_audio_duration_seconds: int = 30
    enable_vad: bool = True  # Voice Activity Detection
    
    def get_effective_mode(self) -> TranscriptionMode:
        """
        Determine the effective transcription mode.
        
        AUTO mode will:
        1. Try Groq if API key is set
        2. Try OpenAI if API key is set
        3. Fall back to local
        """
        if self.transcription_mode != TranscriptionMode.AUTO:
            return self.transcription_mode
        
        # Auto-detect best option
        if self.groq_api_key:
            return TranscriptionMode.GROQ
        if self.openai_api_key:
            return TranscriptionMode.OPENAI
        
        return TranscriptionMode.LOCAL


# Global settings instance
settings = Settings()
