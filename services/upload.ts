import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import {
  AUDIO_BUCKET,
  AUDIO_EXTENSION,
  UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_BASE_DELAY_MS,
} from '../lib/constants';

/**
 * Upload a local audio file to Supabase Storage.
 * Path: `{user_id}/{meeting_id}.m4a`
 *
 * Implements retry with exponential backoff (3 attempts: 2s, 4s, 8s).
 * Returns the storage path (not a signed URL).
 */
export async function uploadAudio(
  fileUri: string,
  meetingId: string
): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error('Not authenticated');

  const storagePath = `${user.id}/${meetingId}${AUDIO_EXTENSION}`;

  // Read the file as base64
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
    try {
      const { error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, bytes.buffer, {
          contentType: 'audio/mp4',
          upsert: true,
        });

      if (error) throw error;

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
