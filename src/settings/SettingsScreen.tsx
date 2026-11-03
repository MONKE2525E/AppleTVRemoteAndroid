import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAnalyticsEnabled, setAnalyticsEnabled, sendTestError, track } from '../analytics/analytics';
import { useAppleTV } from '../appletv/useAppleTV';
import { clearAppCaches } from '../appletv/iconCache';
import { kindLabel } from '../appletv/deviceKinds';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { glassButton } from '../components/glassButton';
import { PlaybackPairing } from '../components/PlaybackPairing';
import { PressableScale } from '../components/PressableScale';
import { COLORS } from '../animations/constants';
import {
  getPermissionStatus,
  requestPermission,
  type PermissionId,
  type PermissionStatus,
} from '../appletv/permissions';
import NativeAppSettings from '../specs/NativeAppSettings';
import { openAppUpdates } from '../updates/AppUpdates';
import { setHapticsEnabled, setInputMode, useHapticsEnabled, useInputMode, type InputMode } from './preferences';
import { Action, Checkmark, Chevron, Row, Section, Value } from './SettingsParts';

let openPanel: (() => void) | undefined;
export function openSettings() { openPanel?.(); }

interface PermissionItem { id: PermissionId; title: string; detail: string }

const PERMISSIONS: PermissionItem[] = [
  { id: 'nearby', title: 'Nearby devices', detail: 'Find Apple TVs and Roku TVs on your Wi-Fi.' },
  { id: 'notifications', title: 'Playback activities and updates', detail: 'Playback controls and update alerts.' },
  ...(Platform.OS === 'android' && Number(Platform.Version) >= 36 ? [
    { id: 'liveUpdates' as const, title: 'Live Updates', detail: 'Playback chip and lock-screen controls.' },
  ] : []),
  { id: 'install', title: 'Install updates', detail: 'Install new versions you approve.' },
];

const INPUT_MODES: { value: InputMode; label: string; detail: string }[] = [
  { value: 'swipe', label: 'Swipe pad', detail: 'Swipe to move, tap to select.' },
  { value: 'buttons', label: 'Buttons', detail: 'Arrow keys like the Siri Remote.' },
];

const isSettled = (status: PermissionStatus | undefined) => status === 'granted' || status === 'notRequired';

export function SettingsScreen() {
  const [visible, setVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>>>({});
  const [shareDiagnostics, setShareDiagnostics] = useState(isAnalyticsEnabled());
  const [version, setVersion] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const inputMode = useInputMode();
  const haptics = useHapticsEnabled();
  const { connection, devices, commands } = useAppleTV();

  const testError = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      await sendTestError();
      setTestStatus('Test report sent. Check PostHog Error Tracking.');
    } catch (error) {
      setTestStatus((error as Error).message || 'Could not send the test report.');
    } finally {
      setTesting(false);
    }
  };

  const refresh = useCallback(async () => {
    const entries = await Promise.all(PERMISSIONS.map(async ({ id }) => [id, await getPermissionStatus(id)] as const));
    setStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    openPanel = () => setVisible(true);
    return () => { openPanel = undefined; };
  }, []);

  // Grants happen in system screens; re-read them whenever the app returns.
  useEffect(() => {
    if (!visible) return;
    setCacheCleared(false);
    void refresh();
    setShareDiagnostics(isAnalyticsEnabled());
    void NativeAppSettings.getAppInfo().then(
      info => setVersion((info as { version?: string }).version ?? null),
      () => {},
    );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [visible, refresh]);

  const request = async (id: PermissionId) => {
    const status = await requestPermission(id);
    track('permission_requested', { permission: id, result: status });
    setStatuses(current => ({ ...current, [id]: status }));
  };

  const connected = connection.state === 'connected' ? connection.device : null;

  const permissionRight = (id: PermissionId) => {
    const status = statuses[id];
    if (status === undefined) return null;
    if (status === 'notRequired') return <Value tone="muted">Not needed</Value>;
    if (status === 'granted') return <Value>Allowed</Value>;
    return <Action>Allow</Action>;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={styles.flex}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Settings</Text>
            <PressableScale
              accessibilityLabel="Close settings"
              haptic="selection"
              onPress={() => setVisible(false)}
              style={styles.done}
            >
              <Text style={styles.doneLabel}>Done</Text>
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} overScrollMode="always" showsVerticalScrollIndicator={false}>
            <Section title="Connected TV">
              <Row
                first
                title={connected ? connected.name : 'No TV connected'}
                detail={
                  connected
                    ? connection.state === 'connected' && connection.airplayPaired
                      ? 'Connected, playback details on'
                      : 'Connected'
                    : 'Pick a TV from the remote.'
                }
              />
              {connected && (
                <>
                  <Row title="Type" right={<Value>{kindLabel(connected)}</Value>} />
                  {connected.model ? <Row title="Model" right={<Value>{connected.model}</Value>} /> : null}
                  <Row title="Address" right={<Value>{`${connected.address}:${connected.port}`}</Value>} />
                </>
              )}
              {connection.state === 'connected' && !connection.airplayPaired && (
                <View style={styles.pairing}>
                  <PlaybackPairing key={connection.device.id} deviceId={connection.device.id} deviceName={connection.device.name} />
                </View>
              )}
              {connected && (
                <Row
                  title="Forget this TV"
                  destructive
                  accessibilityLabel="Forget this TV"
                  onPress={() => setConfirmForget(true)}
                />
              )}
            </Section>

            <Section title="Remote layout">
              {INPUT_MODES.map((mode, index) => (
                <Row
                  key={mode.value}
                  first={index === 0}
                  title={mode.label}
                  detail={mode.detail}
                  accessibilityRole="radio"
                  selected={inputMode === mode.value}
                  onPress={() => setInputMode(mode.value)}
                  right={inputMode === mode.value ? <Checkmark /> : null}
                />
              ))}
            </Section>

            <Section title="Feedback">
              <Row
                first
                title="Haptic feedback"
                detail="Short vibrations on button presses, swipes and app launches."
                right={
                  <Switch
                    accessibilityLabel="Haptic feedback"
                    value={haptics}
                    trackColor={{ false: COLORS.controlFillPressed, true: COLORS.success }}
                    thumbColor={COLORS.icon}
                    onValueChange={setHapticsEnabled}
                  />
                }
              />
            </Section>

            <Section
              title="Permissions"
              footer="If Android stops showing a prompt, Allow opens this app's system settings instead."
            >
              {PERMISSIONS.map(({ id, title, detail }, index) => {
                const status = statuses[id];
                const actionable = status !== undefined && !isSettled(status);
                return (
                  <Row
                    key={id}
                    first={index === 0}
                    title={title}
                    detail={detail}
                    accessibilityLabel={actionable ? `Request ${title}` : title}
                    onPress={actionable ? () => void request(id) : undefined}
                    right={permissionRight(id)}
                  />
                );
              })}
              <Row
                title="Network and discovery"
                detail="Network access, Wi-Fi multicast and vibration are granted automatically."
                right={<Value>Allowed</Value>}
              />
            </Section>

            <Section
              title="Privacy"
              footer="Anonymous errors and basic usage only. No device names, addresses or credentials are sent."
            >
              <Row
                first
                title="Share crash reports"
                right={
                  <Switch
                    accessibilityLabel="Share crash reports"
                    value={shareDiagnostics}
                    trackColor={{ false: COLORS.controlFillPressed, true: COLORS.success }}
                    thumbColor={COLORS.icon}
                    onValueChange={value => { setShareDiagnostics(value); setAnalyticsEnabled(value); }}
                  />
                }
              />
            </Section>

            <Section
              title="Storage"
              footer="Saved app lists and artwork let the drawer open with icons already drawn. Clearing them means the next open reloads from your TV and the App Store."
            >
              <Row
                first
                title="Clear cached apps and icons"
                accessibilityLabel="Clear cached apps and icons"
                disabled={cacheCleared}
                onPress={() => {
                  clearAppCaches(devices.map(device => device.id));
                  setCacheCleared(true);
                }}
                right={cacheCleared ? <Value>Cleared</Value> : <Action>Clear</Action>}
              />
            </Section>

            <Section title="About">
              <Row first title="Version" right={version ? <Value>{version}</Value> : null} />
              <Row title="Check for updates" accessibilityLabel="Check for app updates" onPress={openAppUpdates} right={<Chevron />} />
              <Row title="Playback diagnostics" onPress={() => setDiagnosticsVisible(true)} right={<Chevron />} />
              <Row
                title="Send test crash report"
                detail={testStatus ?? undefined}
                accessibilityLabel="Send test error"
                disabled={!shareDiagnostics || testing}
                onPress={testError}
                right={<Action>{testing ? 'Sending…' : 'Send'}</Action>}
              />
            </Section>
          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
      <ConfirmDeleteModal
        device={confirmForget ? connected : null}
        onCancel={() => setConfirmForget(false)}
        onConfirm={device => {
          setConfirmForget(false);
          setVisible(false);
          commands.forgetDevice(device.id);
        }}
      />
      {diagnosticsVisible && <DiagnosticsScreen visible onClose={() => setDiagnosticsVisible(false)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  title: { color: COLORS.icon, fontSize: 30, fontWeight: '700' },
  done: { ...glassButton, height: 38, paddingHorizontal: 18, borderRadius: 19 },
  doneLabel: { color: COLORS.icon, fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 56 },
  pairing: { paddingHorizontal: 16, paddingBottom: 14 },
});
