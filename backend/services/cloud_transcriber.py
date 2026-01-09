"""
Cloud Transcription Service - Groq & OpenAI Whisper APIs

Handles speech-to-text via cloud APIs for users without GPU.
"""

import tempfile
from abc import ABC, abstractmethod
from typing import Any


class CloudTranscriberBase(ABC):
    """Base class for cloud transcription services."""
    
    @abstractmethod
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        """Transcribe audio data."""
        pass
    
    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the service is available."""
        pass


class GroqTranscriber(CloudTranscriberBase):
    """
    Transcription using Groq Whisper API.
    
    Groq offers very fast Whisper inference with a generous free tier.
    """
    
    def __init__(self, api_key: str, model: str = "whisper-large-v3"):
        self.api_key = api_key
        self.model = model
        self._client = None
        
    async def _get_client(self):
        """Get or create Groq client."""
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=self.api_key)
        return self._client
    
    async def is_available(self) -> bool:
        """Check if Groq API is available."""
        try:
            await self._get_client()
            return True
        except Exception as e:
            print(f"⚠️ Groq not available: {e}")
            return False
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        """
        Transcribe audio using Groq Whisper API.
        """
        try:
            client = await self._get_client()
            
            # Convert PCM to WAV format for API
            wav_data = self._pcm_to_wav(audio_data)
            
            # Create temp file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as temp_file:
                temp_file.write(wav_data)
                temp_file.flush()
                temp_file.seek(0)
                
                with open(temp_file.name, "rb") as audio_file:
                    transcription = await client.audio.transcriptions.create(
                        file=audio_file,
                        model=self.model,
                        response_format="verbose_json",
                    )
            
            # Parse response
            segments = []
            if hasattr(transcription, 'segments') and transcription.segments:
                for seg in transcription.segments:
                    segments.append({
                        "start": seg.get("start", 0),
                        "end": seg.get("end", 0),
                        "text": seg.get("text", "").strip(),
                    })
            
            return {
                "text": transcription.text.strip() if transcription.text else "",
                "segments": segments,
                "language": getattr(transcription, 'language', 'unknown'),
                "provider": "groq",
            }
            
        except Exception as e:
            print(f"❌ Groq transcription error: {e}")
            return {"error": str(e), "text": "", "provider": "groq"}
    
    def _pcm_to_wav(self, pcm_data: bytes, sample_rate: int = 16000) -> bytes:
        """Convert PCM 16-bit data to WAV format."""
        import struct
        
        num_channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = len(pcm_data)
        
        header = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF',
            36 + data_size,
            b'WAVE',
            b'fmt ',
            16,
            1,
            num_channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
            b'data',
            data_size,
        )
        
        return header + pcm_data


class OpenAITranscriber(CloudTranscriberBase):
    """
    Transcription using OpenAI Whisper API.
    """
    
    def __init__(self, api_key: str, model: str = "whisper-1"):
        self.api_key = api_key
        self.model = model
        self._client = None
        
    async def _get_client(self):
        """Get or create OpenAI client."""
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client
    
    async def is_available(self) -> bool:
        """Check if OpenAI API is available."""
        try:
            await self._get_client()
            return True
        except Exception as e:
            print(f"⚠️ OpenAI not available: {e}")
            return False
    
    async def transcribe(self, audio_data: bytes) -> dict[str, Any]:
        """
        Transcribe audio using OpenAI Whisper API.
        """
        try:
            client = await self._get_client()
            
            # Convert PCM to WAV format
            wav_data = self._pcm_to_wav(audio_data)
            
            # Create temp file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as temp_file:
                temp_file.write(wav_data)
                temp_file.flush()
                
                with open(temp_file.name, "rb") as audio_file:
                    transcription = await client.audio.transcriptions.create(
                        file=audio_file,
                        model=self.model,
                        response_format="verbose_json",
                    )
            
            # Parse response
            segments = []
            if hasattr(transcription, 'segments') and transcription.segments:
                for seg in transcription.segments:
                    segments.append({
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text.strip(),
                    })
            
            return {
                "text": transcription.text.strip() if transcription.text else "",
                "segments": segments,
                "language": getattr(transcription, 'language', 'unknown'),
                "provider": "openai",
            }
            
        except Exception as e:
            print(f"❌ OpenAI transcription error: {e}")
            return {"error": str(e), "text": "", "provider": "openai"}
    
    def _pcm_to_wav(self, pcm_data: bytes, sample_rate: int = 16000) -> bytes:
        """Convert PCM 16-bit data to WAV format."""
        import struct
        
        num_channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = len(pcm_data)
        
        header = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF',
            36 + data_size,
            b'WAVE',
            b'fmt ',
            16,
            1,
            num_channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
            b'data',
            data_size,
        )
        
        return header + pcm_data
