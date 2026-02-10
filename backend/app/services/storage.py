import logging
import os
import uuid

import httpx

from app.config import SUPABASE_SERVICE_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)


class StorageService:
    """Download audio files from Supabase Storage to local temp files."""

    def __init__(self):
        self.supabase_url = SUPABASE_URL
        self.service_key = SUPABASE_SERVICE_KEY

    async def download_audio(self, audio_url: str) -> str:
        """
        Download audio from a Supabase Storage signed URL to a local temp file.

        Args:
            audio_url: Signed URL to the audio file in Supabase Storage.

        Returns:
            Local file path to the downloaded audio.
        """
        temp_path = f"/tmp/{uuid.uuid4()}.m4a"

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(audio_url)
            response.raise_for_status()

            with open(temp_path, "wb") as f:
                f.write(response.content)

        file_size_mb = os.path.getsize(temp_path) / (1024 * 1024)
        logger.info(f"Downloaded audio to {temp_path} ({file_size_mb:.1f} MB)")
        return temp_path
