import { BACKEND_URL, API_PROCESS_MEETING } from '../lib/constants';
import type { ProcessMeetingRequest, ProcessMeetingResponse } from '../types';

/**
 * Trigger the backend processing pipeline for a meeting.
 * Sends audio_url, meeting_id, and push_token to `POST /api/process-meeting`.
 *
 * Fails gracefully if the backend is not yet available (Phase 5).
 */
export async function triggerProcessing(
  request: ProcessMeetingRequest
): Promise<ProcessMeetingResponse | null> {
  try {
    const response = await fetch(`${BACKEND_URL}${API_PROCESS_MEETING}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('Backend processing request failed:', response.status, text);
      return null;
    }

    return (await response.json()) as ProcessMeetingResponse;
  } catch (error: any) {
    // Backend may not exist yet — fail gracefully
    console.warn(
      'Could not reach backend for processing (expected until Phase 5):',
      error.message
    );
    return null;
  }
}
