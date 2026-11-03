import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GEOMETRY } from '../adaptive/geometry';
import { track } from '../analytics/analytics';
import { useAdaptiveLayout } from '../adaptive/useAdaptiveLayout';
import { COLORS, DRAWER_CLOSE_SPRING, SELECTOR_SPRING } from '../animations/constants';
import { useAppleTV } from '../appletv/useAppleTV';
import { useAppIconCache } from '../appletv/useAppIconCache';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { isAirPlayTarget } from '../appletv/deviceKinds';
import { PressableScale } from '../components/PressableScale';
import { TopBar } from '../components/TopBar';
import { ButtonPad } from '../components/ButtonPad';
import { TouchSurface } from '../components/TouchSurface';
import { TextEntryPrompt } from '../components/TextEntry';
import { TransportRow } from '../components/TransportRow';
import { PlaybackPairing } from '../components/PlaybackPairing';
import { AddAppleTvModal } from '../components/AddAppleTvModal';
import { AppDrawer } from '../components/AppDrawer';
import { TransferSheet } from '../components/TransferSheet';
import { DRAWER_HANDLE_HEIGHT, PadOverlay } from '../components/PadOverlay';
import { triggerHaptic } from '../haptics/haptics';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { DiagnosticsScreen } from '../diagnostics/DiagnosticsScreen';
import { PairingScreen } from '../pairing/PairingScreen';
import { useInputMode } from '../settings/preferences';

export function RemoteScreen() {
  const { devices, discovered, connection, playback, capabilities, apps, commands } = useAppleTV();
  const inputMode = useInputMode();
  const layout = useAdaptiveLayout();
  const { scale, contentRect } = layout;

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tvAsleep, setTvAsleep] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [devicePendingDelete, setDevicePendingDelete] = useState<AppleTVDeviceInfo | null>(null);
  const [padHeight, setPadHeight] = useState(0);
  const progress = useSharedValue(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPulling, setDrawerPulling] = useState(false);
  const drawerProgress = useSharedValue(0);

  // Every piece that moves for open/close (Mute/Power fade, chevron
  // rotation, device-row fade-in, list-over-pad) reads this one
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
        drawerProgress.value = withSpring(0, DRAWER_CLOSE_SPRING);
        setDrawerOpen(false);
      } else {
        setSelectorOpen(false);
      }
      return true;
    });
    return () => subscription.remove();
  }, [drawerOpen, selectorOpen, drawerProgress]);

  // Apps and their icons are cached on disk and warmed as soon as a TV connects,
  // so the drawer opens with everything already drawn.
  useAppIconCache(connection.state === 'connected' ? connection.device : null, apps);

  const connectedKind =
    connection.state === 'connected' ? (connection.device.model?.startsWith('Roku ') ? 'roku' : 'apple_tv') : null;
  useEffect(() => {
    if (connectedKind) track('device_connected', { kind: connectedKind });
  }, [connectedKind]);

  // The device list floats over the pad instead of pushing it down. Resizing
  // the pad on every frame forced a layout pass, a padHeight state update and
  // a re-render of the whole pad while the list was still moving.
  const selectorScrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // The pad recedes as the app sheet rises out of it.
  const padRecedeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerProgress.value, [0, 0.8], [1, 0.25], 'clamp'),
    transform: [{ scale: interpolate(drawerProgress.value, [0, 1], [1, 0.95], 'clamp') }],
  }));

  if (connection.state !== 'connected') {
    return <PairingScreen devices={discovered} connection={connection} />;
  }

  const deviceLabel = connection.device.name;
  const touchSurfaceWidth = Math.max(0, contentRect.width - GEOMETRY.touchSurfaceSideMargin * scale * 2);
  const isRoku = connection.device.identifier?.startsWith('roku:') === true;
  const hasNowPlaying = (
    (playback != null && playback.playbackState !== 'unknown' && playback.playbackState !== 'stopped') ||
    capabilities?.skipForward === true ||
    capabilities?.skipBackward === true);
  // HomePods and AirPlay receivers have no Companion link, so seek, info and captions would silently fail.
  const showContextualIcons = hasNowPlaying && !isAirPlayTarget(connection.device);
  const transportFooterHeight =
    (GEOMETRY.gapSurfaceToTransport + GEOMETRY.transportBigSize + GEOMETRY.bottomMargin) * scale;

  // The sheet replaces the pad: same bounds, same corner radius.
  const sheetHeight = padHeight;
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
          importantForAccessibility={selectorOpen ? 'auto' : 'no-hide-descendants'}
          accessibilityElementsHidden={!selectorOpen}
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

        {!connection.airplayPaired && (
          <PlaybackPairing key={connection.device.id} deviceId={connection.device.id} deviceName={deviceLabel} prominent />
        )}

        <View
          style={[styles.padSlot, { marginTop: GEOMETRY.gapTopBarToSurface * scale }]}
          onLayout={onPadLayout}
        >
          {!isRoku && <TextEntryPrompt />}
          <Animated.View
            pointerEvents={drawerOpen ? 'none' : 'auto'}
            importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'}
            accessibilityElementsHidden={drawerOpen}
            style={[StyleSheet.absoluteFill, styles.padLayer, padRecedeStyle]}
          >
          {padHeight > 0 && (inputMode === 'buttons' ? (
            <ButtonPad
              width={touchSurfaceWidth}
              height={padHeight}
              scale={scale}
              showContextualIcons={showContextualIcons}
              bottomInset={drawerHandleInset}
              transportKeys={isRoku}
              onSkipBack={() => isRoku ? commands.pressButton('REWIND') : commands.skipBy(-10)}
              onSkipForward={() => isRoku ? commands.pressButton('FAST_FORWARD') : commands.skipBy(10)}
            />
          ) : (
            <TouchSurface
              width={touchSurfaceWidth}
              height={padHeight}
              borderRadius={GEOMETRY.touchSurfaceRadius * scale}
              scale={scale}
              showContextualIcons={showContextualIcons}
              transportKeys={isRoku}
              onSkipBack={() => isRoku ? commands.pressButton('REWIND') : commands.skipBy(-10)}
              onSkipForward={() => isRoku ? commands.pressButton('FAST_FORWARD') : commands.skipBy(10)}
            />
          ))}
          </Animated.View>
          {padHeight > 0 && (
            <PadOverlay
              width={touchSurfaceWidth}
              scale={scale}
              drawerProgress={drawerProgress}
              sheetHeight={sheetHeight}
              onDrawerDragStart={() => setDrawerPulling(true)}
              onDrawerSettle={settleDrawer}
              onTransfer={hasNowPlaying && !drawerOpen ? () => setTransferVisible(true) : undefined}
            />
          )}
          {padHeight > 0 && (
            <AppDrawer
              open={drawerOpen}
              active={drawerOpen || drawerPulling}
              progress={drawerProgress}
              sheetHeight={sheetHeight}
              width={touchSurfaceWidth}
              radius={GEOMETRY.touchSurfaceRadius * scale}
              scale={scale}
              device={connection.device}
              onSettle={settleDrawer}
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

      <DiagnosticsScreen visible={diagnosticsVisible} onClose={() => setDiagnosticsVisible(false)} />
      <AddAppleTvModal visible={addVisible} onClose={() => setAddVisible(false)} />
      <TransferSheet visible={transferVisible} onClose={() => setTransferVisible(false)} />
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
  },
  padLayer: {
    alignItems: 'center',
  },
  transportFooter: {
    flexShrink: 0,
  },
  selectorScrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
    elevation: 15,
    backgroundColor: 'rgba(0,0,0,0.78)',
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
