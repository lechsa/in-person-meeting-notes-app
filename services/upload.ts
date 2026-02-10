import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import {
  AUDIO_BUCKET,
  AUDIO_EXTENSION,
  SUPABASE_URL,
  UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_BASE_DELAY_MS,
} from '../lib/constants';

/**
 * Upload a local audio file to Supabase Storage.
 * Path: `{user_id}/{meeting_id}.m4a`
 *
 * Uses FileSystem.uploadAsync() to stream the file directly without
 * loading the entire file into memory (avoids OOM on large recordings).
 *
 * Implements retry with exponential backoff (3 attempts: 2s, 4s, 8s).
 * Returns the storage path (not a signed URL).
 */
export async function uploadAudio(
  fileUri: string,
  meetingId: string
): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error('Not authenticated');

  const userId = session.user.id;
  const storagePath = `${userId}/${meetingId}${AUDIO_EXTENSION}`;

  // Build the Supabase Storage REST API URL
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${storagePath}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
    try {
      const response = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'audio/mp4',
          'x-upsert': 'true',
        },
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Storage upload returned ${response.status}: ${response.body}`
        );
      }

      return storagePath;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `Upload attempt ${attempt + 1}/${UPLOAD_MAX_RETRIES} failed:`,
        err.message
      );

      if (attempt < UPLOAD_MAX_RETRIES - 1) {
        const delay = UPLOAD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Upload failed after ${UPLOAD_MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Get a signed URL for a storage path (for backend access).
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
