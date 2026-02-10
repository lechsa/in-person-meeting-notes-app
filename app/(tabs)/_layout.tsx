import { Tabs } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
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
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: 'Meetings',
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
