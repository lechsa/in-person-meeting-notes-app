from pydantic import BaseModel


class ProcessMeetingRequest(BaseModel):
    audio_url: str  # Signed URL to audio file in Supabase Storage
    meeting_id: str  # UUID of the meeting record
    push_token: str  # Expo Push Token for notification delivery


class ProcessMeetingResponse(BaseModel):
    status: str  # "completed" or "failed"
    meeting_id: str
