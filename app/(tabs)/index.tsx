import { useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useRecording } from '../../hooks/useRecording';
import { RecordButton } from '../../components/RecordButton';
import { StatusBadge } from '../../components/StatusBadge';

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
  } = useRecording();

  const [isTransitioning, setIsTransitioning] = useState(false);

  const handlePress = async () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    try {
      if (isRecording) {
        const result = await stopRecording();
        console.log('Recording saved:', result.uri, `(${result.duration}s)`);
        // In Phase 4 this will trigger upload + processing
      } else {
        await startRecording();
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
