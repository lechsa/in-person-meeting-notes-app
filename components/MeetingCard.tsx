import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { StatusBadge } from './StatusBadge';
import type { Meeting } from '../types';

interface MeetingCardProps {
  meeting: Meeting;
  onPress: () => void;
}

/**
 * Format seconds to a human-readable duration string (e.g. "5m 30s", "1h 12m").
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

/**
 * Format an ISO date string to a readable date/time.
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return `Today, ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${timeStr}`;
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }) + `, ${timeStr}`;
}

/**
 * Meeting list item showing date, duration, and status badge.
 */
export function MeetingCard({ meeting, onPress }: MeetingCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.left}>
          <Text style={styles.date}>{formatDate(meeting.created_at)}</Text>
          <Text style={styles.duration}>
            Duration: {formatDuration(meeting.duration)}
          </Text>
        </View>
        <View style={styles.right}>
          <StatusBadge status={meeting.status} size="small" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  right: {
    alignItems: 'flex-end',
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  duration: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
