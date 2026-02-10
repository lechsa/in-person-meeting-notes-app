// ─── Meeting ─────────────────────────────────────────────

export type MeetingStatus =
  | 'recording'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Meeting {
  id: string;
  user_id: string;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  status: MeetingStatus;
  duration: number | null; // seconds
  created_at: string;
  updated_at: string;
}

// ─── Recording ───────────────────────────────────────────

export type RecordingStatus = 'idle' | 'recording' | 'uploading' | 'processing';

export interface RecordingState {
  isRecording: boolean;
  duration: number; // seconds elapsed
  recordingUri: string | null;
  status: RecordingStatus;
}

// ─── Auth ────────────────────────────────────────────────

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
}

// ─── API ─────────────────────────────────────────────────

export interface ProcessMeetingRequest {
  audio_url: string;
  meeting_id: string;
  push_token: string;
}

export interface ProcessMeetingResponse {
  status: 'completed' | 'failed';
  meeting_id: string;
}

export interface HealthResponse {
  status: 'ok';
}

// ─── Notifications ───────────────────────────────────────

export interface MeetingNotificationData {
  meetingId: string;
  url: string;
}
