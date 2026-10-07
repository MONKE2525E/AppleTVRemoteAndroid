import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GEOMETRY } from '../adaptive/geometry';
import { track } from '../analytics/analytics';
import { useAdaptiveLayout } from '../adaptive/useAdaptiveLayout';
import { COLORS, DRAWER_SPRING, SELECTOR_SPRING } from '../animations/constants';
import { useAppleTV } from '../appletv/useAppleTV';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { PressableScale } from '../components/PressableScale';
import { TopBar } from '../components/TopBar';
import { ButtonPad } from '../components/ButtonPad';
import { TouchSurface } from '../components/TouchSurface';
import { TransportRow } from '../components/TransportRow';
import { AddAppleTvModal } from '../components/AddAppleTvModal';
import { AppDrawer } from '../components/AppDrawer';
import { DRAWER_HANDLE_HEIGHT, PadOverlay } from '../components/PadOverlay';
import { triggerHaptic } from '../haptics/haptics';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { PairingScreen } from '../pairing/PairingScreen';
import { useInputMode } from '../settings/preferences';

export function RemoteScreen() {
  const { devices, discovered, connection, playback, capabilities, commands } = useAppleTV();
  const inputMode = useInputMode();
  const layout = useAdaptiveLayout();
  const { scale, contentRect } = layout;
  const window = useWindowDimensions();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tvAsleep, setTvAsleep] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [devicePendingDelete, setDevicePendingDelete] = useState<AppleTVDeviceInfo | null>(null);
  const [padHeight, setPadHeight] = useState(0);
  const progress = useSharedValue(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPulling, setDrawerPulling] = useState(false);
  const drawerProgress = useSharedValue(0);

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
    setDrawerOpen(false);
    setDrawerPulling(false);
    drawerProgress.value = 0;
  }, [connection.state, drawerProgress]);

  const settleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    setDrawerPulling(false);
    if (open) triggerHaptic('selection');
  };

  // Android back dismisses the topmost overlay before leaving the app.
  useEffect(() => {
    if (!drawerOpen && !selectorOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        drawerProgress.value = withSpring(0, DRAWER_SPRING);
        setDrawerOpen(false);
      } else {
        setSelectorOpen(false);
      }
      return true;
    });
    return () => subscription.remove();
  }, [drawerOpen, selectorOpen, drawerProgress]);

  const connectedKind =
    connection.state === 'connected' ? (connection.device.model?.startsWith('Roku ') ? 'roku' : 'apple_tv') : null;
  useEffect(() => {
    if (connectedKind) track('device_connected', { kind: connectedKind });
  }, [connectedKind]);

  const listHeight = (Math.max(1, devices.length) + 1) * GEOMETRY.deviceRowHeight * scale;

  // List slot grows under the top bar; the pad flex-fills whatever remains
  // above the pinned transport footer. Play/Back/TV never move.
  const listSlotStyle = useAnimatedStyle(() => ({
    height: progress.value * listHeight,
  }));
  const selectorScrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

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

  const sheetHeight = Math.round(Math.min(window.height * 0.72, Math.max(320, window.height - 120)));
  const drawerHandleInset = DRAWER_HANDLE_HEIGHT * scale;

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

        {/* Click-away for the device list; the pill and list sit above it. */}
        <Animated.View
          pointerEvents={selectorOpen ? 'auto' : 'none'}
          style={[styles.selectorScrim, selectorScrimStyle]}
        >
          <Pressable
            accessibilityLabel="Close device list"
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectorOpen(false)}
          />
        </Animated.View>

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
          {padHeight > 0 && (inputMode === 'buttons' ? (
            <ButtonPad
              width={touchSurfaceWidth}
              height={padHeight}
              scale={scale}
              showContextualIcons={hasNowPlaying}
              bottomInset={drawerHandleInset}
              onSkipBack={() => commands.skipBy(-10)}
              onSkipForward={() => commands.skipBy(10)}
            />
          ) : (
            <TouchSurface
              width={touchSurfaceWidth}
              height={padHeight}
              borderRadius={GEOMETRY.touchSurfaceRadius * scale}
              scale={scale}
              showContextualIcons={hasNowPlaying}
              onSkipBack={() => commands.skipBy(-10)}
              onSkipForward={() => commands.skipBy(10)}
            />
          ))}
          {padHeight > 0 && (
            <PadOverlay
              width={touchSurfaceWidth}
              scale={scale}
              drawerProgress={drawerProgress}
              sheetHeight={sheetHeight}
              onDrawerDragStart={() => setDrawerPulling(true)}
              onDrawerSettle={settleDrawer}
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
          <TransportRow scale={scale} playback={playback} />
        </View>
      </View>

      <AppDrawer
        open={drawerOpen}
        active={drawerOpen || drawerPulling}
        progress={drawerProgress}
        sheetHeight={sheetHeight}
        width={contentRect.width}
        left={contentRect.x}
        scale={scale}
        device={connection.device}
        onSettle={settleDrawer}
      />

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
  selectorScrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
    elevation: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
