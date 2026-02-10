import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  View,
  Animated,
  StyleSheet,
  AccessibilityRole,
} from 'react-native';

interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}

/**
 * Animated record/stop button.
 * - Idle: large red circle
 * - Recording: pulsing red circle with inner stop square
 */
export function RecordButton({
  isRecording,
  onPress,
  disabled = false,
  size = 80,
}: RecordButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const outerSize = size + 16;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole={'button' as AccessibilityRole}
      accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
      accessibilityState={{ disabled }}
    >
      {/* Pulsing outer ring */}
      <Animated.View
        style={[
          styles.outerRing,
          {
            width: outerSize,
            height: outerSize,
            borderRadius: outerSize / 2,
            transform: [{ scale: isRecording ? pulseAnim : 1 }],
            borderColor: isRecording ? '#FF3B30' : '#FF453A',
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {/* Inner shape: circle when idle, stop square when recording */}
        <View
          style={
            isRecording
              ? [
                  styles.stopSquare,
                  {
                    width: size * 0.35,
                    height: size * 0.35,
                    borderRadius: 4,
                  },
                ]
              : [
                  styles.recordCircle,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                  },
                ]
          }
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  outerRing: {
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCircle: {
    backgroundColor: '#FF3B30',
  },
  stopSquare: {
    backgroundColor: '#FF3B30',
  },
});
