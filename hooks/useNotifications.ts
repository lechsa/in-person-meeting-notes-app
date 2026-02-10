import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  setupForegroundNotificationHandler,
  addNotificationResponseListener,
  addForegroundNotificationListener,
  handleInitialNotification,
} from '../services/notifications';

/**
 * Hook that manages the full notification lifecycle:
 *
 * 1. Registers for push notifications and stores the Expo Push Token
 * 2. Configures foreground notification display
 * 3. Sets up notification-tap listener (navigates to meeting detail)
 * 4. Sets up foreground notification listener (optional callback)
 * 5. Handles cold-start deep link from a notification tap
 *
 * Returns the push token so callers can pass it to the backend.
 */
export function useNotifications() {
  const [pushToken, setPushToken] = useState<string>('');
  const responseListenerRef =
    useRef<Notifications.EventSubscription | null>(null);
  const foregroundListenerRef =
    useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Configure foreground display behaviour
    setupForegroundNotificationHandler();

    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
        console.log('Expo Push Token:', token);
      }
    });

    // Listen for notification taps (foreground + background → navigate)
    responseListenerRef.current = addNotificationResponseListener();

    // Listen for notifications received in foreground (optional UI refresh)
    foregroundListenerRef.current = addForegroundNotificationListener();

    // Handle cold-start: if app was opened by tapping a notification
    handleInitialNotification();

    return () => {
      responseListenerRef.current?.remove();
      foregroundListenerRef.current?.remove();
    };
  }, []);

  return { pushToken };
}
