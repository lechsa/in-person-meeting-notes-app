import logging
from datetime import datetime, timezone

from supabase import create_client

from app.config import SUPABASE_SERVICE_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)


class DatabaseService:
    """Update meeting records in Supabase Postgres via the service role."""

    def __init__(self):
        self.client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    async def update_meeting(
        self,
        meeting_id: str,
        transcript: str,
        summary: str,
        status: str = "completed",
    ) -> None:
        """Update meeting record with transcript, summary, and status."""
        self.client.table("meetings").update(
            {
                "transcript": transcript,
                "summary": summary,
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", meeting_id).execute()

        logger.info(f"Meeting {meeting_id} updated → status={status}")

    async def update_meeting_status(
        self,
        meeting_id: str,
        status: str,
    ) -> None:
        """Update only the status field of a meeting record."""
        self.client.table("meetings").update(
            {
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", meeting_id).execute()

        logger.info(f"Meeting {meeting_id} status → {status}")
