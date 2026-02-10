import React from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';

interface TranscriptViewProps {
  transcript: string | null;
  summary: string | null;
  status: string;
}

/**
 * Scrollable display for meeting transcript and summary.
 * Shows appropriate placeholders for processing/failed states.
 */
export function TranscriptView({
  transcript,
  summary,
  status,
}: TranscriptViewProps) {
  if (status === 'recording' || status === 'uploading') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderEmoji}>🎙️</Text>
        <Text style={styles.placeholderText}>
          {status === 'recording'
            ? 'Recording in progress…'
            : 'Uploading audio…'}
        </Text>
      </View>
    );
  }

  if (status === 'processing') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderEmoji}>⏳</Text>
        <Text style={styles.placeholderText}>
          Processing your recording…
        </Text>
        <Text style={styles.placeholderSubtext}>
          You'll get a notification when it's ready.
        </Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderEmoji}>❌</Text>
        <Text style={styles.placeholderText}>Processing failed</Text>
        <Text style={styles.placeholderSubtext}>
          There was an error processing this recording. Please try again.
        </Text>
      </View>
    );
  }

  // status === 'completed'
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator
    >
      {/* Summary */}
      {summary ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : null}

      {/* Transcript */}
      {transcript ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No transcript available</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#3A3A3C',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#3A3A3C',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    marginTop: 8,
  },
});
