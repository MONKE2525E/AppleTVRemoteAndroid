import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import NativeAppUpdates from '../specs/NativeAppUpdates';
import { COLORS } from '../animations/constants';

let openPanel: (() => void) | undefined;
export function openAppUpdates() { openPanel?.(); }
interface ReleaseStatus { available: boolean; installedVersion: string; versionName?: string; versionCode?: number; size?: number }

export function AppUpdates() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<ReleaseStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const checking = useRef(false);
  const installing = useRef(false);
  const checkedAt = useRef(0);
  const check = useCallback(async (manual: boolean) => {
    if (manual) setVisible(true);
    if (checking.current || installing.current) return;
    if (!manual && Date.now() - checkedAt.current < 60 * 60 * 1000) return;
    checking.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await NativeAppUpdates.checkForUpdate() as ReleaseStatus;
      setStatus(result);
      checkedAt.current = Date.now();
      if (result.available) setVisible(true);
    } catch (e) {
      if (manual) setError((e as Error).message || 'Could not check GitHub. Try again when you are online.');
    } finally { checking.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    openPanel = () => { void check(true); };
    void check(false);
    const handleLink = (url: string | null | undefined) => { if (url === 'tvremote://updates') void check(true); };
    void Linking.getInitialURL().then(handleLink).catch(() => {});
    const links = Linking.addEventListener('url', event => handleLink(event.url));
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check(false);
    });
    return () => { openPanel = undefined; subscription.remove(); links.remove(); };
  }, [check]);
  const install = async () => {
    if (!status?.versionCode || busy) return;
    installing.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await NativeAppUpdates.installUpdate(status.versionCode);
      setVisible(false);
    } catch (e) { setError((e as Error).message || 'Could not install the update.'); }
    finally { installing.current = false; setBusy(false); }
  };
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.title}>App updates</Text>
          {status && <Text style={styles.text}>Installed version {status.installedVersion}</Text>}
          {status?.available ? (
            <Text style={styles.text}>Version {status.versionName} is available{status.size ? ` (${Math.ceil(status.size / 1024 / 1024)} MB)` : ''}. Android will ask you to confirm installation.</Text>
          ) : status && <Text style={styles.text}>You have the latest published version.</Text>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {busy && <View style={styles.progress}><ActivityIndicator color={COLORS.icon} /><Text style={styles.text}>{installing.current ? 'Downloading and verifying update…' : 'Checking GitHub…'}</Text></View>}
          {status?.available && <Pressable accessibilityRole="button" accessibilityLabel="Install update" disabled={busy} style={styles.primary} onPress={install}><Text style={styles.primaryText}>Install update</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => check(true)}><Text style={styles.link}>Check for updates</Text></Pressable>
          <Pressable accessibilityRole="link" style={styles.button} onPress={() => NativeAppUpdates.openReleases()}><Text style={styles.link}>Release notes on GitHub</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setVisible(false)}><Text style={styles.link}>Close</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 24 },
  panel: { backgroundColor: '#1C1C1E', borderRadius: 20, maxHeight: '90%', flexGrow: 0 },
  content: { padding: 24, gap: 16 },
  title: { color: COLORS.icon, fontSize: 22, fontWeight: '600' },
  text: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 23 },
  error: { color: '#FF6961', fontSize: 15, lineHeight: 22 },
  progress: { gap: 12 },
  primary: { backgroundColor: COLORS.icon, padding: 14, borderRadius: 16, minHeight: 48 },
  primaryText: { color: COLORS.background, fontSize: 16, textAlign: 'center', fontWeight: '600' },
  button: { minHeight: 44, justifyContent: 'center' },
  link: { color: COLORS.icon, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
