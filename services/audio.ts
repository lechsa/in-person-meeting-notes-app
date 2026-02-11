import {
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  type RecordingOptions,
} from 'expo-audio';
import {
  RECORDING_SAMPLE_RATE,
  RECORDING_CHANNELS,
  RECORDING_BIT_RATE,
} from '../lib/constants';

// ─── Recording Options ──────────────────────────────────

export const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: RECORDING_SAMPLE_RATE,
  numberOfChannels: RECORDING_CHANNELS,
  bitRate: RECORDING_BIT_RATE,
  extension: '.m4a',
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: 'aac ',
    audioQuality: 96, // AudioQuality.HIGH
  },
};

// ─── Audio Service ───────────────────────────────────────

/**
 * Configure the audio session for background recording.
 * Must be called before starting a recording.
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsBackgroundRecording: true,
  });
}

/**
 * Reset the audio session after recording stops.
 */
export async function resetAudioSession(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
  });
}

/**
 * Request microphone permissions.
 * Throws if not granted.
 */
export async function ensureMicPermission(): Promise<void> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) {
    throw new Error('Microphone permission not granted');
  }
}
