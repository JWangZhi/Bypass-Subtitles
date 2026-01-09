"""
Translation Service - Translate subtitles to target language.

Uses free Google Translate API (unofficial).
"""

from typing import Any

import httpx


class TranslationService:
    """
    Service for translating text between languages.
    
    Uses free Google Translate API by default.
    """
    
    def __init__(self):
        self._client: httpx.AsyncClient | None = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10.0)
        return self._client
    
    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
    ) -> dict[str, Any]:
        """
        Translate text to target language.
        
        Args:
            text: Text to translate
            target_lang: Target language code (e.g., 'vi', 'en', 'zh')
            source_lang: Source language code or 'auto' for detection
            
        Returns:
            Dictionary with 'translated', 'original', 'detected_lang'
        """
        if not text or not text.strip():
            return {"translated": "", "original": "", "detected_lang": ""}
        
        if not target_lang:
            return {"translated": text, "original": text, "detected_lang": source_lang}
        
        try:
            result = await self._translate_google(text, target_lang, source_lang)
            return result
        except Exception as e:
            print(f"❌ Translation error: {e}")
            return {
                "translated": text,
                "original": text,
                "detected_lang": source_lang,
                "error": str(e),
            }
    
    async def _translate_google(
        self,
        text: str,
        target_lang: str,
        source_lang: str,
    ) -> dict[str, Any]:
        """
        Translate using Google Translate (free, unofficial API).
        """
        client = await self._get_client()
        
        # Google Translate API endpoint
        url = "https://translate.googleapis.com/translate_a/single"
        
        params = {
            "client": "gtx",
            "sl": source_lang,  # Source language
            "tl": target_lang,  # Target language
            "dt": "t",  # Return translated text
            "q": text,
        }
        
        response = await client.get(url, params=params)
        response.raise_for_status()
        
        # Parse response
        data = response.json()
        
        # Extract translated text
        translated_parts = []
        if data and len(data) > 0 and data[0]:
            for part in data[0]:
                if part and len(part) > 0:
                    translated_parts.append(part[0])
        
        translated_text = "".join(translated_parts)
        
        # Detect source language
        detected_lang = source_lang
        if len(data) > 2 and data[2]:
            detected_lang = data[2]
        
        return {
            "translated": translated_text,
            "original": text,
            "detected_lang": detected_lang,
        }
    
    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton instance
_translator: TranslationService | None = None


def get_translator() -> TranslationService:
    """Get translator singleton instance."""
    global _translator
    if _translator is None:
        _translator = TranslationService()
    return _translator
