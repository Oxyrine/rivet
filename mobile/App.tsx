import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://rivet-lyart.vercel.app/api';

export default function App() {
  const [status, setStatus] = useState('Checking the server…');
  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.json())
      .then(h => setStatus(`Server says: ${JSON.stringify(h)}`))
      .catch(e => setStatus(`Cannot reach the server: ${e.message}`));
  }, []);
  return (
    <View style={s.screen}>
      <Text style={s.brand}>Rivet</Text>
      <Text style={s.sub}>Field app · native build</Text>
      <Text style={s.status}>{status}</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F1E8', alignItems: 'center', justifyContent: 'center', padding: 24 },
  brand: { fontSize: 40, fontWeight: '700', color: '#23352E' },
  sub: { fontSize: 16, color: '#5B6B63', marginBottom: 24 },
  status: { fontSize: 14, color: '#23352E', textAlign: 'center' },
});
