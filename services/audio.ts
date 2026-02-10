import { Audio } from 'expo-av';
import {
  RECORDING_SAMPLE_RATE,
  RECORDING_CHANNELS,
  RECORDING_BIT_RATE,
} from '../lib/constants';

// ─── Recording Options ──────────────────────────────────

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: RECORDING_SAMPLE_RATE,
    numberOfChannels: RECORDING_CHANNELS,
    bitRate: RECORDING_BIT_RATE,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: RECORDING_SAMPLE_RATE,
    numberOfChannels: RECORDING_CHANNELS,
    bitRate: RECORDING_BIT_RATE,
  },
  web: {},
};

// ─── Module State ────────────────────────────────────────

let currentRecording: Audio.Recording | null = null;

// ─── Audio Service ───────────────────────────────────────

/**
 * Configure the audio session for background recording.
 * Must be called before starting a recording.
 */
export async function configureAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });
}

/**
 * Start a new audio recording.
 * Requests microphone permissions if not already granted.
 * Returns the Recording instance.
 */
export async function startRecording(): Promise<Audio.Recording> {
  // Request permissions
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) {
    throw new Error('Microphone permission not granted');
  }

  // Configure audio session for background recording
  await configureAudioSession();

  // Create and start the recording
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(RECORDING_OPTIONS);
  await recording.startAsync();

  currentRecording = recording;
  return recording;
}

/**
 * Stop the current recording and return the local file URI and duration.
 */
export async function stopRecording(): Promise<{
  uri: string;
  duration: number;
}> {
  if (!currentRecording) {
    throw new Error('No active recording to stop');
  }

  // Get status before stopping (for duration)
  const status = await currentRecording.getStatusAsync();

  await currentRecording.stopAndUnloadAsync();

  // Reset audio mode so audio from other apps can resume
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
  });

  const uri = currentRecording.getURI();
  if (!uri) {
    throw new Error('Recording URI is null after stopping');
  }

  const durationSeconds = Math.round((status.durationMillis ?? 0) / 1000);

  currentRecording = null;

  return { uri, duration: durationSeconds };
}

/**
 * Get the status of the active recording (duration, metering, etc.)
 */
export async function getRecordingStatus(): Promise<Audio.RecordingStatus | null> {
  if (!currentRecording) return null;
  return currentRecording.getStatusAsync();
}

/**
 * Returns whether a recording is currently active.
 */
export function isRecordingActive(): boolean {
  return currentRecording !== null;
}

/**
 * Handle audio interruptions (phone calls, alarms, etc.)
 * Call this once at app init to register the handler.
 */
export function setupInterruptionHandler(): void {
  // expo-av doesn't expose a direct interruption callback in newer SDK,
  // but we can handle AppState changes + recording status polling in the hook.
  // This is a placeholder for platform-specific interruption handling.
}
