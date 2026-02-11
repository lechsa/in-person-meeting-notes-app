import { BACKEND_URL, API_PROCESS_MEETING } from '../lib/constants';
import type { ProcessMeetingRequest, ProcessMeetingResponse } from '../types';

/**
 * Trigger the backend processing pipeline for a meeting.
 * Sends audio_url, meeting_id, and push_token to `POST /api/process-meeting`.
 *
 * Throws on failure so callers can handle errors (e.g. show alerts, update status).
 */
export async function triggerProcessing(
  request: ProcessMeetingRequest
): Promise<ProcessMeetingResponse> {
  const response = await fetch(`${BACKEND_URL}${API_PROCESS_MEETING}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Processing request failed (${response.status}): ${text}`
    );
  }

  return (await response.json()) as ProcessMeetingResponse;
}
