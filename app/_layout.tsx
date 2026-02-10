import { createContext, useContext, useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../hooks/useNotifications';

// ─── Push Token Context ────────────────────────────────

const PushTokenContext = createContext<string>('');

export function usePushToken(): string {
  return useContext(PushTokenContext);
}

// ─── Root Layout ───────────────────────────────────────

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Set up push notifications (token registration, listeners, cold-start)
  const { pushToken } = useNotifications();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      // Not signed in — redirect to login
      router.replace('/login');
    } else if (session && inAuthGroup) {
      // Signed in — redirect to home
      router.replace('/');
    }
  }, [session, segments, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <PushTokenContext.Provider value={pushToken}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="meeting/[id]"
          options={{
            headerShown: true,
            headerBackTitle: 'Back',
            title: 'Meeting Details',
          }}
        />
      </Stack>
    </PushTokenContext.Provider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
