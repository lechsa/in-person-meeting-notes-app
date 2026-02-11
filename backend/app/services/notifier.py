import logging

import httpx

logger = logging.getLogger(__name__)


class NotifierService:
    """Send Expo push notifications."""

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    async def send_notification(
        self,
        push_token: str,
        meeting_id: str,
    ) -> None:
        """
        Send an Expo push notification with deep link data.

        Args:
            push_token: Expo Push Token (e.g. ExponentPushToken[xxx]).
            meeting_id: UUID of the completed meeting.
        """
        payload = {
            "to": push_token,
            "title": "Meeting Ready",
            "body": "Your transcript and summary are ready.",
            "data": {
                "meetingId": meeting_id,
                "url": f"/meeting/{meeting_id}",
            },
            "sound": "default",
            "priority": "high",
        }

        logger.info(f"push_token: {push_token}")
        logger.info(f"meeting_id: {meeting_id}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.EXPO_PUSH_URL, json=payload)
            response.raise_for_status()

        logger.info(f"Notification response: {response.json()}")
        logger.info(f"Push notification sent for meeting {meeting_id}")
