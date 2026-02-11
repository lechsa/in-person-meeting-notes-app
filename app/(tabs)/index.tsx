import { useState, useRef } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useRecording } from '../../hooks/useRecording';
import { RecordButton } from '../../components/RecordButton';
import { StatusBadge } from '../../components/StatusBadge';
import { createMeeting, updateMeetingStatus } from '../../services/meetings';
import { uploadAudio, getSignedUrl } from '../../services/upload';
import { triggerProcessing } from '../../services/processing';
import { usePushToken } from '../_layout';
import type { Meeting } from '../../types';

/**
 * Format seconds into MM:SS or HH:MM:SS display.
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export default function HomeScreen() {
  const {
    isRecording,
    duration,
    status,
    recordingUri,
    startRecording,
    stopRecording,
    setStatus,
  } = useRecording();

  const pushToken = usePushToken();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const meetingRef = useRef<Meeting | null>(null);

  const handlePress = async () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    try {
      if (isRecording) {
        // ─── Stop → Create meeting → Upload → Trigger processing ───
        const result = await stopRecording();

        // Create meeting record
        const meeting = meetingRef.current ?? (await createMeeting(result.duration));
        meetingRef.current = null;

        // Update duration
        await updateMeetingStatus(meeting.id, 'uploading', {
          duration: result.duration,
        });
        setStatus('uploading');

        // Upload audio
        try {
          const storagePath = await uploadAudio(result.uri, meeting.id);
          const audioUrl = await getSignedUrl(storagePath);

          await updateMeetingStatus(meeting.id, 'processing', {
            audio_url: storagePath,
          });
          setStatus('processing');

          try {
            // backend handles status updates and error handling + push notification
            await triggerProcessing({
              audio_url: audioUrl,
              meeting_id: meeting.id,
              push_token: pushToken,
            })
          } catch (triggerProcessingErr: any) {
            console.warn('Processing request failed:', triggerProcessingErr.message);
          }
        } catch (uploadErr: any) {
          console.error('Upload failed:', uploadErr);
          await updateMeetingStatus(meeting.id, 'failed');
          Alert.alert(
            'Upload Failed',
            uploadErr.message ?? 'Could not upload the recording.'
          );
        }

        setStatus('idle');
      } else {
        // ─── Start recording ───
        await startRecording();

        // Create meeting record (status: recording)
        try {
          const meeting = await createMeeting();
          meetingRef.current = meeting;
        } catch (dbErr: any) {
          console.warn('Could not create meeting record:', dbErr.message);
          // Recording continues even if DB insert fails — we'll create on stop
        }
      }
    } catch (error: any) {
      Alert.alert(
        'Recording Error',
        error.message ?? 'Something went wrong with the recording.'
      );
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meeting Notes</Text>

      {/* Status Badge */}
      <View style={styles.statusContainer}>
        <StatusBadge status={status} />
      </View>

      {/* Duration Display */}
      <Text style={[styles.duration, isRecording && styles.durationActive]}>
        {formatDuration(duration)}
      </Text>

      {/* Record / Stop Button */}
      <View style={styles.buttonContainer}>
        <RecordButton
          isRecording={isRecording}
          onPress={handlePress}
          disabled={isTransitioning}
        />
      </View>

      {/* Hint Text */}
      <Text style={styles.hint}>
        {isRecording
          ? 'Tap to stop recording'
          : 'Tap to start recording'}
      </Text>

      {/* Last recording info */}
      {!isRecording && recordingUri && (
        <Text style={styles.lastRecording} numberOfLines={1}>
          Last recording saved locally
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1C1C1E',
  },
  statusContainer: {
    marginBottom: 32,
  },
  duration: {
    fontSize: 56,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    color: '#8E8E93',
    marginBottom: 40,
  },
  durationActive: {
    color: '#FF3B30',
    fontWeight: '300',
  },
  buttonContainer: {
    marginBottom: 24,
  },
  hint: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 16,
  },
  lastRecording: {
    fontSize: 13,
    color: '#AEAEB2',
    marginTop: 8,
  },
});
