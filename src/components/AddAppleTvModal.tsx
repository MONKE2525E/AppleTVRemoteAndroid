import { X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '../animations/constants';
import { requestDiscoveryPermission } from '../appletv/permissions';
import { useAppleTV } from '../appletv/useAppleTV';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { TVIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

interface AddAppleTvModalProps {
  visible: boolean;
  onClose: () => void;
}

type Stage =
  | { kind: 'searching' }
  | { kind: 'list' }
  | { kind: 'pin'; device: AppleTVDeviceInfo; submitting: boolean; error: string | null };

export function AddAppleTvModal({ visible, onClose }: AddAppleTvModalProps) {
  const { devices, discovered, commands } = useAppleTV();
  const [stage, setStage] = useState<Stage>({ kind: 'searching' });
  const [pin, setPin] = useState('');

  const pairedIds = useMemo(() => new Set(devices.map(d => d.id)), [devices]);
  const found = discovered.filter(d => !pairedIds.has(d.id));

  useEffect(() => {
    if (!visible) {
      setStage({ kind: 'searching' });
      setPin('');
      commands.stopDiscovery();
      return;
    }

    let cancelled = false;
    void requestDiscoveryPermission().finally(() => {
      if (!cancelled) commands.startDiscovery();
    });
    const timer = setTimeout(() => {
      if (!cancelled) setStage(current => (current.kind === 'searching' ? { kind: 'list' } : current));
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      commands.stopDiscovery();
    };
  }, [visible, commands]);

  useEffect(() => {
    if (visible && found.length > 0) {
      setStage(current => (current.kind === 'searching' ? { kind: 'list' } : current));
    }
  }, [visible, found.length]);

  const close = () => {
    if (stage.kind === 'pin') commands.cancelPairing(stage.device.id);
    commands.stopDiscovery();
    onClose();
  };

  const [listError, setListError] = useState<string | null>(null);

  const pickDevice = async (device: AppleTVDeviceInfo) => {
    setListError(null);
    try {
      if (device.model?.startsWith("Roku ")) {
        await commands.connect(device.id);
        commands.stopDiscovery();
        onClose();
        return;
      }
      await commands.startPairing(device.id);
      setPin('');
      setStage({ kind: 'pin', device, submitting: false, error: null });
    } catch (e) {
      setListError((e as Error).message || 'Could not start pairing. Is the TV awake?');
    }
  };

  const submitPin = async () => {
    if (stage.kind !== 'pin') return;
    const { device } = stage;
    setStage({ kind: 'pin', device, submitting: true, error: null });
    try {
      await commands.submitPin(device.id, pin);
      // Native connection events retain the actual playback-pairing status.
      setPin('');
      commands.stopDiscovery();
      onClose();
    } catch (e) {
      setStage({
        kind: 'pin',
        device,
        submitting: false,
        error: (e as Error).message || 'Incorrect code. Try again.',
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.header}>
          <Pressable
            onPress={close}
            accessibilityLabel="Close"
            hitSlop={12}
            style={styles.closeHit}
          >
            <X size={22} color={COLORS.icon} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.headerTitle}>Add TV</Text>
          <View style={styles.headerSpacer} />
        </View>

        {stage.kind === 'searching' && (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.icon} />
            <Text style={styles.status}>Searching for TVs…</Text>
            <Text style={styles.hint}>Make sure this phone is on the same Wi-Fi as the TV.</Text>
          </View>
        )}

        {stage.kind === 'list' && (
          <View style={styles.body}>
            <Text style={styles.section}>Apple TVs and Roku TVs on your network</Text>
            {listError ? <Text style={styles.error}>{listError}</Text> : null}
            {found.length === 0 && (
              <Text style={styles.status}>No new TVs found. Check your Wi-Fi and try again.</Text>
            )}
            {found.map(device => (
              <PressableScale
                key={device.id}
                style={styles.deviceRow}
                onPress={() => pickDevice(device)}
                accessibilityLabel={device.name}
              >
                <TVIcon size={22} />
                <View style={styles.deviceCopy}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceMeta}>{device.address}</Text>
                </View>
              </PressableScale>
            ))}
          </View>
        )}

        {stage.kind === 'pin' && (
          <View style={styles.center}>
            <Text style={styles.title}>Enter the code on {stage.device.name}</Text>
            <Text style={styles.hint}>A 4-digit code is shown on the TV.</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              style={styles.pinInput}
              placeholder="0000"
              placeholderTextColor={COLORS.textSecondary}
            />
            {stage.error ? <Text style={styles.error}>{stage.error}</Text> : null}
            <PressableScale
              style={[styles.primary, pin.length < 4 || stage.submitting ? styles.primaryDisabled : null]}
              disabled={pin.length < 4 || stage.submitting}
              onPress={submitPin}
            >
              {stage.submitting ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.primaryLabel}>Pair</Text>
              )}
            </PressableScale>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                commands.cancelPairing(stage.device.id);
                setPin('');
                setStage({ kind: 'list' });
              }}
              accessibilityLabel="Back"
            >
              <Text style={styles.secondaryLabel}>Back</Text>
            </Pressable>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  closeHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: COLORS.icon,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  body: {
    paddingHorizontal: 20,
    gap: 10,
  },
  section: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    gap: 12,
  },
  title: {
    color: COLORS.icon,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  status: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.controlFill,
  },
  deviceCopy: {
    flex: 1,
  },
  deviceName: {
    color: COLORS.icon,
    fontSize: 16,
  },
  deviceMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  pinInput: {
    color: COLORS.icon,
    fontSize: 32,
    letterSpacing: 10,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
    minWidth: 160,
    paddingVertical: 8,
    marginTop: 8,
  },
  error: {
    color: '#FF453A',
    fontSize: 13,
  },
  primary: {
    backgroundColor: COLORS.icon,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 140,
    marginTop: 8,
  },
  primaryDisabled: {
    opacity: 0.35,
  },
  primaryLabel: {
    color: COLORS.background,
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  },
  secondary: {
    paddingVertical: 10,
  },
  secondaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
});
