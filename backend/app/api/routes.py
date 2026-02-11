import logging
import os

from fastapi import APIRouter, HTTPException

from app.models.schemas import ProcessMeetingRequest, ProcessMeetingResponse
from app.services.database import DatabaseService
from app.services.notifier import NotifierService
from app.services.storage import StorageService
from app.services.summarizer import SummarizerService
from app.services.transcriber import TranscriberService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service instances
storage_service = StorageService()
transcriber_service = TranscriberService()
summarizer_service = SummarizerService()
database_service = DatabaseService()
notifier_service = NotifierService()


@router.post("/process-meeting", response_model=ProcessMeetingResponse)
async def process_meeting(request: ProcessMeetingRequest):
    """
    Process a meeting audio file through the 5-step pipeline:
    1. Download audio from Supabase Storage
    2. Transcribe with OpenAI Whisper-1
    3. Summarize transcript
    4. Update meeting record in database
    5. Send push notification
    """
    meeting_id = request.meeting_id
    audio_path: str | None = None

    try:
        # Step 1: Download audio
        logger.info(f"[{meeting_id}] Step 1/5: Downloading audio...")
        audio_path = await storage_service.download_audio(request.audio_url)

        # Step 2: Transcribe
        logger.info(f"[{meeting_id}] Step 2/5: Transcribing audio...")
        transcript = await transcriber_service.transcribe(audio_path)

        # Step 3: Summarize
        logger.info(f"[{meeting_id}] Step 3/5: Generating summary...")
        summary = await summarizer_service.summarize(transcript)

        # Step 4: Update database
        logger.info(f"[{meeting_id}] Step 4/5: Updating database...")
        await database_service.update_meeting(meeting_id, transcript, summary)

        # Step 5: Send push notification
        logger.info(f"[{meeting_id}] Step 5/5: Sending notification...")
        await notifier_service.send_notification(request.push_token, meeting_id)

        logger.info(f"[{meeting_id}] Processing complete!")
        return ProcessMeetingResponse(status="completed", meeting_id=meeting_id)

    except HTTPException:
        raise
    except Exception as e:
        error_type = type(e).__name__
        logger.error(f"[{meeting_id}] Processing failed ({error_type}): {e}", exc_info=True)
        try:
            await database_service.update_meeting_status(meeting_id, "failed")
        except Exception as db_err:
            logger.error(
                f"[{meeting_id}] Failed to update status to 'failed': {db_err}"
            )
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {error_type}",
        )

    finally:
        # Clean up temp audio file
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
            logger.info(f"[{meeting_id}] Cleaned up temp file: {audio_path}")
