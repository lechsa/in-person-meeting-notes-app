import { Tabs } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
// @ts-ignore — @expo/vector-icons ships with Expo but lacks TS declarations
import Ionicons from '@expo/vector-icons/Ionicons';
import { signOut } from '../../services/auth';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerRight: () => (
          <TouchableOpacity style={styles.signOut} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mic-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: 'Meetings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  signOut: {
    marginRight: 16,
  },
  signOutText: {
    color: '#007AFF',
    fontSize: 14,
  },
});
