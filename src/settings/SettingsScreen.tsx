import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, Switch, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAnalyticsEnabled, setAnalyticsEnabled, sendTestError, track } from '../analytics/analytics';
import { useAppleTV } from '../appletv/useAppleTV';
import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { PlaybackPairing } from '../components/PlaybackPairing';
import { COLORS } from '../animations/constants';
import {
  getPermissionStatus,
  requestPermission,
  type PermissionId,
  type PermissionStatus,
} from '../appletv/permissions';
import { openAppUpdates } from '../updates/AppUpdates';
import { setInputMode, useInputMode, type InputMode } from './preferences';

let openPanel: (() => void) | undefined;
export function openSettings() { openPanel?.(); }

const PERMISSIONS: { id: PermissionId; title: string; detail: string }[] = [
  { id: 'nearby', title: 'Nearby devices', detail: 'Find Apple TVs and Roku TVs on your Wi-Fi.' },
  { id: 'notifications', title: 'Playback activities and updates', detail: 'Playback controls appear only while content is playing. Also allows app update alerts.' },
  ...(Platform.OS === 'android' && Number(Platform.Version) >= 36 ? [
    { id: 'liveUpdates' as const, title: 'Live Updates', detail: 'Allow the playback chip and lock-screen activity. Your phone controls availability and appearance.' },
  ] : []),
  { id: 'install', title: 'Install updates', detail: 'Let this app install new versions you approve.' },
];

const AUTOMATIC = [
  'Network access',
  'Wi-Fi multicast (device discovery)',
  'Vibration (button feedback)',
];

const INPUT_MODES: { mode: InputMode; label: string }[] = [
  { mode: 'swipe', label: 'Swipe pad' },
  { mode: 'buttons', label: 'Buttons' },
];

export function SettingsScreen() {
  const [visible, setVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>>>({});
  const [shareDiagnostics, setShareDiagnostics] = useState(isAnalyticsEnabled());
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
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
  const inputMode = useInputMode();
  const { connection } = useAppleTV();

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
    void refresh();
    setShareDiagnostics(isAnalyticsEnabled());
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Settings</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={12} onPress={() => setVisible(false)}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Remote</Text>
          <View style={styles.card}>
            <Text style={styles.rowTitle}>Navigation control</Text>
            <Text style={styles.rowDetail}>Swipe on the pad, or tap arrow buttons like the Apple TV remote.</Text>
            <View style={styles.segments}>
              {INPUT_MODES.map(({ mode, label }) => (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: inputMode === mode }}
                  style={[styles.segment, inputMode === mode && styles.segmentSelected]}
                  onPress={() => setInputMode(mode)}
                >
                  <Text style={[styles.segmentLabel, inputMode === mode && styles.segmentLabelSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {connection.state === 'connected' && !connection.airplayPaired && (
            <View style={styles.card}>
              <PlaybackPairing key={connection.device.id} deviceId={connection.device.id} deviceName={connection.device.name} />
            </View>
          )}

          <View style={styles.card}>
            <Pressable accessibilityRole="button" style={styles.row} onPress={() => setDiagnosticsVisible(true)}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Playback diagnostics</Text>
                <Text style={styles.rowDetail}>Check TV timing, system media controls, and Live Update status.</Text>
              </View>
              <Text style={styles.link}>Open</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Permissions</Text>
          <View style={styles.card}>
            {PERMISSIONS.map(({ id, title, detail }, index) => {
              const status = statuses[id];
              return (
                <View key={id} style={[styles.row, index > 0 && styles.rowDivider]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{title}</Text>
                    <Text style={styles.rowDetail}>{detail}</Text>
                  </View>
                  {status === 'denied' ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Request ${title}`} style={styles.request} onPress={() => request(id)}>
                      <Text style={styles.requestLabel}>Request</Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.status, status === 'granted' && styles.granted]}>
                      {status === 'granted' ? 'Allowed' : status === 'notRequired' ? 'Not needed' : '…'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.footnote}>
            If Android stops showing the prompt, Request opens this app's system settings instead.
          </Text>

          <Text style={styles.sectionTitle}>Granted automatically</Text>
          <View style={styles.card}>
            {AUTOMATIC.map((name, index) => (
              <View key={name} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Text style={[styles.rowTitle, styles.rowText]}>{name}</Text>
                <Text style={[styles.status, styles.granted]}>Allowed</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Share crash reports</Text>
                <Text style={styles.rowDetail}>Anonymous errors and basic usage help fix bugs. No device names, addresses or credentials are sent.</Text>
              </View>
              <Switch
                accessibilityLabel="Share crash reports"
                value={shareDiagnostics}
                trackColor={{ false: COLORS.controlFillPressed, true: '#30D158' }}
                thumbColor={COLORS.icon}
                onValueChange={value => { setShareDiagnostics(value); setAnalyticsEnabled(value); }}
              />
            </View>
          </View>

          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel="Send test error" disabled={!shareDiagnostics || testing} style={styles.row} onPress={testError}>
              <Text style={[styles.rowTitle, styles.rowText]}>Test crash reporting</Text>
              <Text style={styles.link}>{testing ? 'Sending…' : 'Send'}</Text>
            </Pressable>
            {testStatus && <Text accessibilityLiveRegion="polite" style={styles.footnote}>{testStatus}</Text>}
          </View>

          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" style={styles.row} onPress={openAppUpdates}>
              <Text style={[styles.rowTitle, styles.rowText]}>App updates</Text>
              <Text style={styles.link}>Check</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
      {diagnosticsVisible && <DiagnosticsScreen visible onClose={() => setDiagnosticsVisible(false)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: COLORS.icon, fontSize: 28, fontWeight: '700' },
  done: { color: COLORS.icon, fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginLeft: 4 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  rowText: { flex: 1 },
  rowTitle: { color: COLORS.icon, fontSize: 16, fontWeight: '500' },
  rowDetail: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 19, marginTop: 2 },
  status: { color: COLORS.textSecondary, fontSize: 15 },
  granted: { color: '#30D158' },
  request: { backgroundColor: COLORS.icon, borderRadius: 16, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center' },
  requestLabel: { color: COLORS.background, fontSize: 15, fontWeight: '600' },
  link: { color: COLORS.icon, fontSize: 16, fontWeight: '600' },
  footnote: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginLeft: 4, marginTop: 4 },
  segments: { flexDirection: 'row', backgroundColor: COLORS.controlFill, borderRadius: 12, padding: 3, marginVertical: 12 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: COLORS.icon },
  segmentLabel: { color: COLORS.icon, fontSize: 15, fontWeight: '500' },
  segmentLabelSelected: { color: COLORS.background },
});
