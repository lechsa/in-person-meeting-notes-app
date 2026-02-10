// API & Service URLs
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

// Supabase Storage
export const AUDIO_BUCKET = 'meeting-audio';
export const AUDIO_EXTENSION = '.m4a';

// Recording
export const RECORDING_SAMPLE_RATE = 44100;
export const RECORDING_CHANNELS = 1; // mono
export const RECORDING_BIT_RATE = 128000;

// Upload
export const UPLOAD_MAX_RETRIES = 3;
export const UPLOAD_RETRY_BASE_DELAY_MS = 2000; // 2s, 4s, 8s with exponential backoff

// API Endpoints
export const API_PROCESS_MEETING = '/api/process-meeting';
export const API_HEALTH = '/health';

// Deep Linking
export const APP_SCHEME = 'meetingnotes';
