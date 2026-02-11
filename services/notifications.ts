import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { MeetingNotificationData } from '../types';

/**
 * Register for push notifications and return the Expo Push Token.
 *
 * Flow:
 * 1. Check if running on a physical device (required for push)
 * 2. Get / request notification permissions
 * 3. Fetch Expo Push Token
 *
 * Returns the push token string, or empty string if unavailable.
 */
export async function registerForPushNotifications(): Promise<string> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return '';
  }

  // Check existing permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  // Request if not already granted
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted.');
    return '';
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
    });
  }

  // Get Expo Push Token (with retry for network timing issues)
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      return tokenData.data;
    } catch (error) {
      console.warn(`Failed to get Expo Push Token (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } else {
        console.error('Exhausted retries for Expo Push Token');
        return '';
      }
    }
  }
  return '';
}

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Shows an in-app banner with alert, sound, and badge.
 */
export function setupForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Set up a listener for notification taps (foreground + background).
 * Navigates to the meeting detail screen when a notification is tapped.
 *
 * Returns a subscription that should be cleaned up on unmount.
 */
export function addNotificationResponseListener(): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content
      .data as unknown as MeetingNotificationData;

    if (data?.meetingId) {
      router.push(`/meeting/${data.meetingId}`);
    }
  });
}

/**
 * Set up a listener for notifications received while app is in foreground.
 * Can be used for in-app UI updates (e.g., refresh meetings list).
 *
 * Returns a subscription that should be cleaned up on unmount.
 */
export function addForegroundNotificationListener(
  callback?: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    callback?.(notification);
  });
}

/**
 * Check for a notification response that launched the app (cold start).
 * If present, navigate to the meeting detail screen.
 */
export async function handleInitialNotification(): Promise<void> {
  const lastResponse =
    await Notifications.getLastNotificationResponseAsync();

  if (lastResponse) {
    const data = lastResponse.notification.request.content
      .data as unknown as MeetingNotificationData;

    if (data?.meetingId) {
      router.replace(`/meeting/${data.meetingId}`);
    }
  }
}
