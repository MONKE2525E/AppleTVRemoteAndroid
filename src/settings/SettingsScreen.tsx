import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, Switch, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAnalyticsEnabled, setAnalyticsEnabled, track } from '../analytics/analytics';
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
  { id: 'notifications', title: 'Notifications', detail: 'Now-playing details and pause controls while connected.' },
  { id: 'install', title: 'Install updates', detail: 'Let this app install new versions you approve.' },
];

const AUTOMATIC = [
  'Network access',
  'Wi-Fi multicast (device discovery)',
  'Vibration (button feedback)',
  'Background connection',
];

const INPUT_MODES: { mode: InputMode; label: string }[] = [
  { mode: 'swipe', label: 'Swipe pad' },
  { mode: 'buttons', label: 'Buttons' },
];

export function SettingsScreen() {
  const [visible, setVisible] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<PermissionId, PermissionStatus>>>({});
  const [shareDiagnostics, setShareDiagnostics] = useState(isAnalyticsEnabled());
  const inputMode = useInputMode();

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
                onValueChange={value => { setShareDiagnostics(value); setAnalyticsEnabled(value); }}
              />
            </View>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { color: COLORS.icon, fontSize: 28, fontWeight: '700' },
  done: { color: COLORS.accent, fontSize: 17, fontWeight: '600' },
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
  request: { backgroundColor: COLORS.accent, borderRadius: 16, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center' },
  requestLabel: { color: COLORS.icon, fontSize: 15, fontWeight: '600' },
  link: { color: COLORS.accent, fontSize: 16 },
  footnote: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginLeft: 4, marginTop: 4 },
  segments: { flexDirection: 'row', backgroundColor: COLORS.controlFill, borderRadius: 12, padding: 3, marginVertical: 12 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: COLORS.icon },
  segmentLabel: { color: COLORS.icon, fontSize: 15, fontWeight: '500' },
  segmentLabelSelected: { color: COLORS.background },
});
