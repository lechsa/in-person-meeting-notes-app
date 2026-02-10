import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { RecordingState, RecordingStatus } from '../types';
import {
  startRecording as startAudioRecording,
  stopRecording as stopAudioRecording,
  getRecordingStatus,
} from '../services/audio';

/**
 * Hook managing the full recording lifecycle:
 * - Start / stop recording
 * - Live duration counter
 * - Recording status tracking
 * - App-state interruption handling
 */
export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    recordingUri: null,
    status: 'idle',
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const elapsedBeforePauseRef = useRef<number>(0);

  // ─── Duration Timer ──────────────────────────────────

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        const elapsed =
          elapsedBeforePauseRef.current +
          Math.floor((Date.now() - startTimeRef.current) / 1000);
        setState((prev) => ({ ...prev, duration: elapsed }));
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = null;
    elapsedBeforePauseRef.current = 0;
  }, []);

  // ─── App State Monitoring ────────────────────────────
  // Track app state changes for interruption handling

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (!state.isRecording) return;

      if (nextState === 'active') {
        // App came back to foreground — sync duration from recording status
        const status = await getRecordingStatus();
        if (status?.isRecording) {
          setState((prev) => ({
            ...prev,
            duration: Math.round((status.durationMillis ?? 0) / 1000),
          }));
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [state.isRecording]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Controls ────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      await startAudioRecording();

      setState({
        isRecording: true,
        duration: 0,
        recordingUri: null,
        status: 'recording',
      });

      elapsedBeforePauseRef.current = 0;
      startTimer();
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [startTimer]);

  const stopRecording = useCallback(async (): Promise<{
    uri: string;
    duration: number;
  }> => {
    try {
      stopTimer();

      const result = await stopAudioRecording();

      setState({
        isRecording: false,
        duration: result.duration,
        recordingUri: result.uri,
        status: 'idle',
      });

      return result;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setState((prev) => ({ ...prev, isRecording: false, status: 'idle' }));
      throw error;
    }
  }, [stopTimer]);

  const setStatus = useCallback((status: RecordingStatus) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    setState({
      isRecording: false,
      duration: 0,
      recordingUri: null,
      status: 'idle',
    });
  }, [stopTimer]);

  return {
    ...state,
    startRecording,
    stopRecording,
    setStatus,
    reset,
  };
}
