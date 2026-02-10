import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RecordingStatus, MeetingStatus } from '../types';

type BadgeStatus = RecordingStatus | MeetingStatus;

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'small' | 'normal';
}

const STATUS_CONFIG: Record<
  BadgeStatus,
  { label: string; bg: string; text: string }
> = {
  idle: { label: 'Ready', bg: '#E5E5EA', text: '#8E8E93' },
  recording: { label: 'Recording', bg: '#FFE5E5', text: '#FF3B30' },
  uploading: { label: 'Uploading', bg: '#FFF3CD', text: '#FF9500' },
  processing: { label: 'Processing', bg: '#CCE5FF', text: '#007AFF' },
  completed: { label: 'Completed', bg: '#D4EDDA', text: '#34C759' },
  failed: { label: 'Failed', bg: '#F8D7DA', text: '#FF3B30' },
};

/**
 * Colored badge indicating the current status of a recording or meeting.
 */
export function StatusBadge({ status, size = 'normal' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg },
        size === 'small' && styles.badgeSmall,
      ]}
    >
      {status === 'recording' && <View style={styles.dot} />}
      <Text
        style={[
          styles.label,
          { color: config.text },
          size === 'small' && styles.labelSmall,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'center',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: 12,
  },
});
