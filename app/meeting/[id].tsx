import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useMeeting } from '../../hooks/useMeetings';
import { TranscriptView } from '../../components/TranscriptView';
import { StatusBadge } from '../../components/StatusBadge';

/**
 * Format seconds to "Xh Ym Zs" duration string.
 */
function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { meeting, isLoading, error } = useMeeting(id!);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Meeting' }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </>
    );
  }

  if (error || !meeting) {
    return (
      <>
        <Stack.Screen options={{ title: 'Meeting' }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error ?? 'Meeting not found'}
          </Text>
        </View>
      </>
    );
  }

  const dateStr = new Date(meeting.created_at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Meeting Details' }} />
      <View style={styles.container}>
        {/* Header info */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.date}>{dateStr}</Text>
            <StatusBadge status={meeting.status} size="small" />
          </View>
          <Text style={styles.duration}>
            Duration: {formatDuration(meeting.duration)}
          </Text>
        </View>

        {/* Transcript & Summary */}
        <TranscriptView
          transcript={meeting.transcript}
          summary={meeting.summary}
          status={meeting.status}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  date: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  duration: {
    fontSize: 14,
    color: '#8E8E93',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
});
