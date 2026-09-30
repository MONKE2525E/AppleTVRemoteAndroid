import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { appleTV } from '../appletv/client';
import { COLORS } from '../animations/constants';

export function PlaybackPairing({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setOpen(true);
    setError(null);
    setBusy(true);
    try {
      await appleTV.startAirPlayPairing(deviceId);
      setStarted(true);
    } catch (e) {
      setError((e as Error).message || 'Could not start playback pairing.');
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    appleTV.cancelPairing(deviceId);
    setOpen(false);
    setStarted(false);
    setPin('');
  };
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await appleTV.submitAirPlayPin(deviceId, pin);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || 'Pairing failed. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable onPress={start} accessibilityRole="button" style={styles.link}>
        <Text style={styles.text}>Enable playback details and background controls</Text>
      </Pressable>
      <Modal visible={open} transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>Playback controls for {deviceName}</Text>
            <Text style={styles.text}>Enter the AirPlay code shown on your TV. This lets the remote read playback status and content details.</Text>
            {started && <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4}
              autoFocus accessibilityLabel="AirPlay pairing code" style={styles.input} />}
            {error && <Text style={styles.error}>{error}</Text>}
            {busy ? <ActivityIndicator color={COLORS.icon} /> : (
              <Pressable onPress={started ? submit : start} disabled={started && pin.length !== 4} accessibilityRole="button">
                <Text style={styles.title}>{started ? 'Pair' : 'Try again'}</Text>
              </Pressable>
            )}
            <Pressable onPress={close} disabled={busy} accessibilityRole="button"><Text style={styles.text}>Later</Text></Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  link: { padding: 8, alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: COLORS.controlFill, padding: 24, borderRadius: 20, gap: 20 },
  title: { color: COLORS.icon, fontSize: 18, textAlign: 'center' },
  text: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' },
  input: { color: COLORS.icon, fontSize: 28, textAlign: 'center', borderBottomWidth: 1, borderColor: COLORS.separator },
  error: { color: '#FF453A', textAlign: 'center' },
});
