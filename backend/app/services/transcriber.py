import logging
import math
import os

from openai import OpenAI
from pydub import AudioSegment

from app.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)


class TranscriberService:
    """Transcribe audio files using OpenAI Whisper-1."""

    # Whisper-1 file upload limit
    MAX_FILE_SIZE_MB = 25
    # Supported input formats
    SUPPORTED_FORMATS = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"}

    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)

    async def transcribe(self, audio_path: str) -> str:
        """
        Transcribe audio file to text using OpenAI Whisper-1.

        - Files <= 25 MB: Single API call
        - Files > 25 MB: Split into chunks, transcribe each, concatenate

        Returns the full transcript as a string.
        """
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        logger.info(f"Transcribing {audio_path} ({file_size_mb:.1f} MB)")

        if file_size_mb <= self.MAX_FILE_SIZE_MB:
            return await self._transcribe_single(audio_path)
        else:
            return await self._transcribe_chunked(audio_path)

    async def _transcribe_single(self, audio_path: str) -> str:
        """Transcribe a single audio file (<= 25 MB)."""
        try:
            with open(audio_path, "rb") as audio_file:
                response = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="en",
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )
            logger.info(f"Transcription complete: {len(response.text)} characters")
            logger.info(f"Transcription text: {response.text[:100]}...")
            return response.text
        except Exception as e:
            logger.error(f"OpenAI transcription failed for {audio_path}: {e}")
            raise RuntimeError(f"Transcription failed: {e}") from e

    async def _transcribe_chunked(self, audio_path: str) -> str:
        """
        Split audio into <= 25 MB chunks and transcribe sequentially.
        Uses the previous chunk's transcript as a prompt for continuity.
        """
        audio = AudioSegment.from_file(audio_path)
        duration_ms = len(audio)
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

        # Calculate chunk duration to stay under 25 MB
        num_chunks = math.ceil(file_size_mb / self.MAX_FILE_SIZE_MB)
        chunk_duration_ms = duration_ms // num_chunks

        logger.info(
            f"Splitting into {num_chunks} chunks "
            f"({chunk_duration_ms / 1000:.0f}s each)"
        )

        transcripts: list[str] = []
        previous_text = ""

        for i in range(num_chunks):
            start = i * chunk_duration_ms
            end = min((i + 1) * chunk_duration_ms, duration_ms)
            chunk = audio[start:end]

            chunk_path = f"/tmp/chunk_{i}.m4a"
            chunk.export(chunk_path, format="ipod")  # ipod = m4a format

            try:
                with open(chunk_path, "rb") as chunk_file:
                    response = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=chunk_file,
                        language="en",
                        response_format="text",
                        prompt=previous_text[-224:] if previous_text else None,
                    )

                transcripts.append(response)
                previous_text = response
                logger.info(f"Chunk {i + 1}/{num_chunks} transcribed")
            except Exception as e:
                logger.error(
                    f"OpenAI transcription failed on chunk {i + 1}/{num_chunks}: {e}"
                )
                raise RuntimeError(
                    f"Transcription failed on chunk {i + 1}/{num_chunks}: {e}"
                ) from e
            finally:
                if os.path.exists(chunk_path):
                    os.remove(chunk_path)

        return " ".join(transcripts)
