import { StyleSheet, Text, View } from 'react-native';

export default function MeetingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meetings</Text>
      <Text style={styles.subtitle}>No meetings yet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
