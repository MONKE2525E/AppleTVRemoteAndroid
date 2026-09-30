import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GEOMETRY } from '../adaptive/geometry';
import { useAdaptiveLayout } from '../adaptive/useAdaptiveLayout';
import { COLORS, SELECTOR_SPRING } from '../animations/constants';
import { useAppleTV } from '../appletv/useAppleTV';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { PressableScale } from '../components/PressableScale';
import { TopBar } from '../components/TopBar';
import { PlaybackPairing } from '../components/PlaybackPairing';
import { TouchSurface } from '../components/TouchSurface';
import { TransportRow } from '../components/TransportRow';
import { AddAppleTvModal } from '../components/AddAppleTvModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { PairingScreen } from '../pairing/PairingScreen';

export function RemoteScreen() {
  const { devices, discovered, connection, playback, capabilities, commands } = useAppleTV();
  const layout = useAdaptiveLayout();
  const { scale, contentRect } = layout;

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tvAsleep, setTvAsleep] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [devicePendingDelete, setDevicePendingDelete] = useState<AppleTVDeviceInfo | null>(null);
  const [padHeight, setPadHeight] = useState(0);
  const progress = useSharedValue(0);

  // Every piece that moves for open/close (Mute/Power fade, chevron
  // rotation, device-row fade-in, touch-surface reflow) reads this one
  // shared value so they animate as a single overlapping motion -- see
  // TopBar.tsx and SELECTOR_SPRING.
  useEffect(() => {
    progress.value = withSpring(selectorOpen ? 1 : 0, SELECTOR_SPRING);
  }, [selectorOpen, progress]);

  // A connection change (new device picked, reconnect, disconnect) should
  // just reflect the new state, not strand the selector mid-animation.
  useEffect(() => {
    setSelectorOpen(false);
  }, [connection.state]);

  const listHeight = (Math.max(1, devices.length) + 2) * GEOMETRY.deviceRowHeight * scale;

  // List slot grows under the top bar; the pad flex-fills whatever remains
  // above the pinned transport footer. Play/Back/TV never move.
  const listSlotStyle = useAnimatedStyle(() => ({
    height: progress.value * listHeight,
  }));

  if (connection.state !== 'connected') {
    return <PairingScreen devices={discovered} connection={connection} />;
  }

  const deviceLabel = connection.device.name;
  const touchSurfaceWidth = Math.max(0, contentRect.width - GEOMETRY.touchSurfaceSideMargin * scale * 2);
  const hasNowPlaying = !connection.device.model?.startsWith("Roku ") && (
    (playback != null && playback.playbackState !== 'unknown' && playback.playbackState !== 'stopped') ||
    capabilities?.skipForward === true ||
    capabilities?.skipBackward === true);
  const transportFooterHeight =
    (GEOMETRY.gapSurfaceToTransport + GEOMETRY.transportBigSize + GEOMETRY.bottomMargin) * scale +
    (connection.airplayPaired ? 0 : 48);

  const onPadLayout = (event: LayoutChangeEvent) => {
    const next = Math.max(0, Math.floor(event.nativeEvent.layout.height));
    setPadHeight(prev => (prev === next ? prev : next));
  };

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.content,
          { left: contentRect.x, top: contentRect.y, width: contentRect.width, height: contentRect.height },
        ]}
      >
        <PressableScale
          haptic={false}
          onLongPress={() => setDiagnosticsVisible(true)}
          accessibilityLabel="Diagnostics"
          style={styles.diagnosticsHotspot}
        >
          <View />
        </PressableScale>

        <TopBar
          devices={devices}
          connectedDeviceId={connection.device.id}
          label={deviceLabel}
          muted={muted}
          selectorOpen={selectorOpen}
          progress={progress}
          scale={scale}
          onToggleSelector={() => setSelectorOpen(open => !open)}
          onSelectDevice={deviceId => {
            setSelectorOpen(false);
            if (deviceId !== connection.device.id) commands.connect(deviceId);
          }}
          onFindDevices={() => {
            setSelectorOpen(false);
            setAddVisible(true);
          }}
          onRequestDeleteDevice={deviceId => {
            const target = devices.find(d => d.id === deviceId) ?? null;
            setDevicePendingDelete(target);
          }}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            commands.setMuted(next);
          }}
          onPower={() => {
            if (tvAsleep) {
              commands.wake(connection.device.id);
              setTvAsleep(false);
            } else {
              commands.sleep();
              setTvAsleep(true);
            }
          }}
        />

        <Animated.View style={listSlotStyle} pointerEvents="none" />

        <View
          style={[styles.padSlot, { marginTop: GEOMETRY.gapTopBarToSurface * scale }]}
          onLayout={onPadLayout}
        >
          {padHeight > 0 && (
            <TouchSurface
              width={touchSurfaceWidth}
              height={padHeight}
              borderRadius={GEOMETRY.touchSurfaceRadius * scale}
              scale={scale}
              showContextualIcons={hasNowPlaying}
              onSkipBack={() => commands.skipBy(-10)}
              onSkipForward={() => commands.skipBy(10)}
            />
          )}
        </View>

        <View
          style={[
            styles.transportFooter,
            {
              height: transportFooterHeight,
              paddingTop: GEOMETRY.gapSurfaceToTransport * scale,
              paddingBottom: GEOMETRY.bottomMargin * scale,
              width: touchSurfaceWidth,
              alignSelf: 'center',
            },
          ]}
        >
          {!connection.airplayPaired && <PlaybackPairing key={connection.device.id} deviceId={connection.device.id} deviceName={connection.device.name} />}
          <TransportRow scale={scale} playback={playback} />
        </View>
      </View>

      <DiagnosticsScreen visible={diagnosticsVisible} onClose={() => setDiagnosticsVisible(false)} />
      <AddAppleTvModal visible={addVisible} onClose={() => setAddVisible(false)} />
      <ConfirmDeleteModal
        device={devicePendingDelete}
        onCancel={() => setDevicePendingDelete(null)}
        onConfirm={device => {
          setDevicePendingDelete(null);
          setSelectorOpen(false);
          commands.forgetDevice(device.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    position: 'absolute',
    flexDirection: 'column',
  },
  padSlot: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  transportFooter: {
    flexShrink: 0,
  },
  diagnosticsHotspot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    zIndex: 10,
  },
});
