import { Check, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '../animations/constants';
import { requestDiscoveryPermission } from '../appletv/permissions';
import { isControllable, kindIcon, kindLabel, transferErrorMessage } from '../appletv/deviceKinds';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { useAppleTV } from '../appletv/useAppleTV';
import { glassButton } from './glassButton';
import { PressableScale } from './PressableScale';

interface TransferSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * "Play on..." sheet. Lists every other device the app knows about or can see
 * nearby; picking one asks the native layer to move what is playing there.
 * Native currently reports transfer as unsupported (README, "AirPlay targets"),
 * so failures are shown inline instead of being swallowed.
 */
export function TransferSheet({ visible, onClose }: TransferSheetProps) {
  const { devices, discovered, connection, playback, commands } = useAppleTV();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentId = connection.state === 'connected' ? connection.device.id : null;

  const targets = useMemo(() => {
    const byId = new Map<string, AppleTVDeviceInfo>();
    [...devices, ...discovered].forEach(device => {
      if (device.id !== currentId && !byId.has(device.id)) byId.set(device.id, device);
    });
    return [...byId.values()];
  }, [devices, discovered, currentId]);

  useEffect(() => {
    if (!visible) {
      setBusyId(null);
      setDoneId(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    void requestDiscoveryPermission().finally(() => {
      if (!cancelled) commands.startDiscovery();
    });
    return () => {
      cancelled = true;
      commands.stopDiscovery();
    };
  }, [visible, commands]);

  const transfer = async (device: AppleTVDeviceInfo) => {
    setError(null);
    setDoneId(null);
    setBusyId(device.id);
    try {
      await commands.transferPlayback(device.id);
      setDoneId(device.id);
      setTimeout(onClose, 700);
    } catch (e) {
      setError(transferErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Pressable accessibilityLabel="Close play on" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={styles.title}>Play on</Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {playback?.title ?? 'Move what is playing to another device'}
              </Text>
            </View>
            <PressableScale accessibilityLabel="Close" haptic="selection" onPress={onClose} style={styles.close}>
              <X size={18} color={COLORS.icon} strokeWidth={2.4} />
            </PressableScale>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {targets.length === 0 && (
              <View style={styles.empty}>
                <ActivityIndicator color={COLORS.icon} />
                <Text style={styles.emptyText}>Looking for other devices…</Text>
              </View>
            )}
            {targets.map(device => {
              const Icon = kindIcon(device);
              const supported = isControllable(device);
              return (
                <PressableScale
                  key={device.id}
                  accessibilityLabel={`Play on ${device.name}`}
                  haptic="selection"
                  bouncy
                  disabled={busyId != null}
                  onPress={() => void transfer(device)}
                  style={styles.row}
                >
                  <View style={styles.rowIcon}>
                    <Icon size={22} color={COLORS.icon} strokeWidth={1.8} />
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.name}>{device.name}</Text>
                    <Text numberOfLines={1} style={styles.kind}>
                      {kindLabel(device)}{supported ? '' : ' · display only'}
                    </Text>
                  </View>
                  {busyId === device.id ? (
                    <ActivityIndicator color={COLORS.icon} />
                  ) : doneId === device.id ? (
                    <Check size={20} color={COLORS.success} strokeWidth={3} />
                  ) : null}
                </PressableScale>
              );
            })}
          </ScrollView>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { marginHorizontal: 10, marginBottom: 10, maxHeight: '70%', padding: 18, borderRadius: 28, backgroundColor: COLORS.cardFill },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { color: COLORS.icon, fontSize: 22, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 13.5, marginTop: 2 },
  close: { ...glassButton, width: 34, height: 34, borderRadius: 17 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 8, justifyContent: 'flex-start' },
  rowIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.controlFill, alignItems: 'center', justifyContent: 'center' },
  name: { color: COLORS.icon, fontSize: 16.5, fontWeight: '600' },
  kind: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
  error: { color: COLORS.danger, fontSize: 13.5, marginTop: 10, textAlign: 'center' },
});
