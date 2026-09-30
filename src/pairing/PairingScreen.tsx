import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { PressableScale } from '../components/PressableScale';
import { TVIcon } from '../components/icons/Icons';
import { requestDiscoveryPermission } from '../appletv/permissions';
import { openAppUpdates } from '../updates/AppUpdates';
import { useAppleTV } from '../appletv/useAppleTV';
import type { AppleTVDeviceInfo, ConnectionState } from '../appletv/types';

interface PairingScreenProps {
  devices: AppleTVDeviceInfo[];
  connection: ConnectionState;
}

type Stage =
  | { kind: 'browsing' }
  | { kind: 'pin'; device: AppleTVDeviceInfo; submitting: boolean; error: string | null };

/**
 * First-run discovery + PIN pairing, and the retry/forget path for a failed
 * reconnect. Shown by RemoteScreen whenever there's no live connection --
 * see AppleTVController.kt's submitPin, which connects automatically once
 * pairing succeeds, so this screen just needs to get a PIN entered.
 */
export function PairingScreen({ devices, connection }: PairingScreenProps) {
  const { commands } = useAppleTV();
  const [stage, setStage] = useState<Stage>({ kind: 'browsing' });
  const [pin, setPin] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const appleTvs = useMemo(
    () => devices.filter(d => !d.model || d.model.startsWith('AppleTV') || !d.model.startsWith('AudioAccessory')),
    [devices],
  );

  useEffect(() => {
    let cancelled = false;
    void requestDiscoveryPermission().finally(() => {
      if (!cancelled) commands.startDiscovery();
    });
    return () => {
      cancelled = true;
      commands.stopDiscovery();
    };
  }, [commands]);

  if (connection.state === 'connecting') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.icon} />
        <Text style={styles.status}>Connecting to {connection.device.name}…</Text>
      </View>
    );
  }

  if (connection.state === 'failed') {
    const { device, reason, stalePairing, canWake } = connection;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Couldn't connect{device ? ` to ${device.name}` : ''}</Text>
        <Text style={styles.status}>{reason}</Text>
        {canWake && device && (
          <PressableScale style={styles.primaryButton} onPress={() => commands.connect(device.id)}>
            <Text style={styles.primaryButtonLabel}>Retry</Text>
          </PressableScale>
        )}
        {stalePairing && device && (
          <PressableScale style={styles.secondaryButton} onPress={() => commands.forgetDevice(device.id)}>
            <Text style={styles.secondaryButtonLabel}>Forget &amp; Re-pair</Text>
          </PressableScale>
        )}
      </View>
    );
  }

  if (stage.kind === 'pin') {
    const { device, submitting, error } = stage;
    const submit = async () => {
      setStage({ ...stage, submitting: true, error: null });
      try {
        await commands.submitPin(device.id, pin);
        setPin('');
      } catch (e) {
        setStage({ kind: 'pin', device, submitting: false, error: (e as Error).message ?? 'Incorrect code' });
      }
    };
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter the code shown on {device.name}</Text>
        <Text style={styles.status}>
          A 4-digit code should appear on the TV. If it doesn’t, press a button on the Siri Remote and try pairing again.
        </Text>
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
        {error && <Text style={styles.error}>{error}</Text>}
        <PressableScale
          style={styles.primaryButton}
          disabled={pin.length < 4 || submitting}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryButtonLabel}>Pair</Text>}
        </PressableScale>
        <PressableScale
          style={styles.secondaryButton}
          onPress={() => {
            commands.cancelPairing(device.id);
            setPin('');
            setStage({ kind: 'browsing' });
            commands.startDiscovery();
          }}
        >
          <Text style={styles.secondaryButtonLabel}>Cancel</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Apple TVs and Roku TVs on your network</Text>
      <Pressable accessibilityRole="button" onPress={openAppUpdates} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>App updates</Text></Pressable>
      {appleTvs.length === 0 && (
        <View style={styles.searching}>
          <ActivityIndicator color={COLORS.icon} />
          <Text style={styles.status}>Searching…</Text>
        </View>
      )}
      {browseError ? <Text style={styles.error}>{browseError}</Text> : null}
      {appleTvs.map(device => (
        <Pressable
          key={device.id}
          style={styles.deviceRow}
          disabled={busyId != null}
          onPress={async () => {
            setBrowseError(null);
            setBusyId(device.id);
            try {
              if (device.model?.startsWith("Roku ")) {
                await commands.connect(device.id);
                return;
              }
              await commands.startPairing(device.id);
              setStage({ kind: 'pin', device, submitting: false, error: null });
            } catch (e) {
              setBrowseError((e as Error).message ?? 'Could not start pairing. Is the TV awake?');
              commands.startDiscovery();
            } finally {
              setBusyId(null);
            }
          }}
        >
          <TVIcon size={22} />
          <View>
            <Text style={styles.deviceLabel}>{device.name}</Text>
            {device.model ? <Text style={styles.status}>{device.model}</Text> : null}
            {busyId === device.id ? <ActivityIndicator color={COLORS.icon} style={{ marginTop: 6 }} /> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    color: COLORS.icon,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  status: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    color: '#FF453A',
    fontSize: 13,
  },
  searching: {
    alignItems: 'center',
    gap: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.controlFill,
    width: '100%',
  },
  deviceLabel: {
    color: COLORS.icon,
    fontSize: 16,
  },
  pinInput: {
    color: COLORS.icon,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
    minWidth: 140,
    paddingVertical: 8,
  },
  primaryButton: {
    backgroundColor: COLORS.icon,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 120,
  },
  primaryButtonLabel: {
    color: COLORS.background,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },
  secondaryButton: {
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  secondaryButtonLabel: {
    color: COLORS.accent,
    fontSize: 15,
    textAlign: 'center',
  },
});
