import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAdaptiveLayout } from '../adaptive/useAdaptiveLayout';
import { COLORS } from '../animations/constants';
import { appleTV } from '../appletv/client';
import { useAppleTV } from '../appletv/useAppleTV';
import type { DiagnosticsSnapshot } from '../appletv/types';
import { PressableScale } from '../components/PressableScale';
import { useJsFps } from './useJsFps';

interface DiagnosticsScreenProps {
  visible: boolean;
  onClose: () => void;
}

const POLL_MS = 1000;

/**
 * Dev-only, hidden behind a long-press (see RemoteScreen.tsx) -- surfaces
 * the state described in the plan's diagnostics correction: protocol/MRP
 * connection state, discovery/reconnect counts, touch throughput, JS FPS,
 * window/fold/adaptive-layout state, and the Media3 session projection.
 * Removable later without touching any production path.
 */
export function DiagnosticsScreen({ visible, onClose }: DiagnosticsScreenProps) {
  const { connection, playback, capabilities } = useAppleTV();
  const layout = useAdaptiveLayout();
  const jsFps = useJsFps(visible);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [touchPerSec, setTouchPerSec] = useState(0);
  const [coalescedPerSec, setCoalescedPerSec] = useState(0);
  const previous = useRef<DiagnosticsSnapshot | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await appleTV.getDiagnosticsSnapshot();
        if (cancelled) return;
        const prev = previous.current;
        if (prev) {
          setTouchPerSec(Math.max(0, next.touchEventsSent - prev.touchEventsSent));
          setCoalescedPerSec(Math.max(0, next.touchEventsCoalesced - prev.touchEventsCoalesced));
        }
        previous.current = next;
        setSnapshot(next);
      } catch {
        // best-effort; diagnostics must never crash the app
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Diagnostics</Text>

          <Section title="Connection">
            <Row label="State" value={connection.state} />
            <Row label="Device" value={snapshot?.currentDeviceName ?? '—'} />
            <Row label="Discovered" value={String(snapshot?.discoveredDeviceCount ?? 0)} />
            <Row label="Reconnects" value={String(snapshot?.reconnectCount ?? 0)} />
            <Row label="MRP connected" value={String(snapshot?.mrpConnected ?? false)} />
          </Section>

          <Section title="Playback">
            <Row label="State" value={playback?.playbackState ?? '—'} />
            <Row label="Title" value={playback?.title ?? '—'} />
            <Row label="Media3 active" value={String(snapshot?.media3Active ?? false)} />
            <Row label="Media3 playWhenReady" value={String(snapshot?.media3PlayWhenReady ?? false)} />
            <Row label="Capabilities" value={capabilities ? Object.entries(capabilities).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none' : '—'} />
          </Section>

          <Section title="Touch">
            <Row label="Received (total)" value={String(snapshot?.touchEventsReceived ?? 0)} />
            <Row label="Sent (total)" value={String(snapshot?.touchEventsSent ?? 0)} />
            <Row label="Coalesced (total)" value={String(snapshot?.touchEventsCoalesced ?? 0)} />
            <Row label="Sent / sec (approx)" value={String(touchPerSec)} />
            <Row label="Coalesced / sec (approx)" value={String(coalescedPerSec)} />
          </Section>

          <Section title="Performance">
            <Row label="JS FPS" value={String(jsFps)} />
            <Row label="UI FPS" value="n/a (not obtainable from JS)" />
          </Section>

          <Section title="Layout / fold">
            <Row label="Window" value={`${Math.round(layout.windowWidth)} x ${Math.round(layout.windowHeight)}`} />
            <Row label="Adaptive mode" value={layout.mode} />
            <Row
              label="Content rect"
              value={`${Math.round(layout.contentRect.x)},${Math.round(layout.contentRect.y)} ${Math.round(layout.contentRect.width)}x${Math.round(layout.contentRect.height)}`}
            />
            <Row label="Fold posture" value={layout.fold.posture} />
            <Row label="Fold orientation" value={layout.fold.orientation} />
            <Row
              label="Hinge bounds"
              value={
                layout.fold.bounds
                  ? `${layout.fold.bounds.left},${layout.fold.bounds.top} - ${layout.fold.bounds.right},${layout.fold.bounds.bottom}`
                  : 'none'
              }
            />
            <Row label="Occlusion" value={layout.fold.occlusionType} />
          </Section>

          <PressableScale style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeLabel}>Close</Text>
          </PressableScale>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingTop: 48,
    gap: 20,
  },
  heading: {
    color: COLORS.icon,
    fontSize: 22,
    fontWeight: '700',
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    paddingVertical: 4,
  },
  rowLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  rowValue: {
    color: COLORS.icon,
    fontSize: 13,
    flexShrink: 1,
    marginLeft: 12,
    textAlign: 'right',
  },
  closeButton: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.controlFill,
  },
  closeLabel: {
    color: COLORS.icon,
    fontWeight: '600',
  },
});
