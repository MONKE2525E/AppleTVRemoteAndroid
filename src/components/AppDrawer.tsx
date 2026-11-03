import { useEffect, useState, type ComponentType } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Activity,
  Clapperboard,
  Film,
  Gamepad2,
  Image as ImageIcon,
  Mic,
  Monitor,
  Music,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Tv,
  type LucideProps,
} from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import {
  COLORS,
  DRAWER_CLOSE_SPRING,
  DRAWER_COMMIT_FRACTION,
  DRAWER_FLICK_VELOCITY,
  DRAWER_SPRING,
} from '../animations/constants';
import { isRokuDevice, lookupAppleArtwork, rokuIconUri } from '../appletv/appIcons';
import { systemAppIcon } from '../appletv/systemAppIcons';
import { appleTV } from '../appletv/client';
import type { AppInfo, AppleTVDeviceInfo } from '../appletv/types';
import { useAppleTV } from '../appletv/useAppleTV';
import { PressableScale } from './PressableScale';

const COLUMNS = 3;
/** Height over width. tvOS art is a wide tile; Roku channel art is closer to 4:3 and was cropped at 0.6. */
const TILE_ASPECT = 0.6;
const ROKU_TILE_ASPECT = 0.75;

interface AppDrawerProps {
  open: boolean;
  /** True as soon as a pull starts, so the list is loading before the sheet is fully up. */
  active: boolean;
  /** 0 closed, 1 open. Springs past 1 on release, so readers must clamp. */
  progress: SharedValue<number>;
  /** Height of the pad the sheet replaces; the sheet fills it exactly. */
  sheetHeight: number;
  /** Width of the pad. */
  width: number;
  /** Corner radius, matching the pad so the sheet reads as the pad itself opening. */
  radius: number;
  scale: number;
  device: AppleTVDeviceInfo;
  onSettle: (open: boolean) => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export function AppDrawer({ open, active, progress, sheetHeight, width, radius, scale, device, onSettle }: AppDrawerProps) {
  const { apps } = useAppleTV();
  const dragActive = useSharedValue(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [artwork, setArtwork] = useState<Record<string, string>>({});
  const roku = isRokuDevice(device);
  const aspect = roku ? ROKU_TILE_ASPECT : TILE_ASPECT;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoadState('loading');
    void appleTV.loadApps().then(ok => {
      if (!cancelled) setLoadState(ok ? 'ready' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [active, attempt, device.id]);

  useEffect(() => {
    if (roku || apps.length === 0) return;
    let cancelled = false;
    void lookupAppleArtwork(apps.map(app => app.bundleId)).then(found => {
      if (!cancelled) setArtwork(found);
    });
    return () => {
      cancelled = true;
    };
  }, [apps, roku]);

  const iconFor = (app: AppInfo): ImageSourcePropType | string | null => {
    if (roku) return rokuIconUri(device, app.bundleId);
    const systemIcon = systemAppIcon(app.bundleId);
    if (systemIcon) return systemIcon;
    return artwork[app.bundleId] ?? null;
  };

  const close = () => {
    progress.value = withSpring(0, DRAWER_CLOSE_SPRING);
    onSettle(false);
  };

  const launch = (app: AppInfo) => {
    void appleTV.launchApp(app.bundleId);
    close();
  };

  // Dragging the header pulls the sheet down with the finger; release
  // settles with the gesture's velocity, matching the pull-up handle.
  const drag = Gesture.Pan()
    .activeOffsetY(6)
    .onStart(() => {
      'worklet';
      dragActive.value = true;
    })
    .onUpdate(event => {
      'worklet';
      if (sheetHeight <= 0) return;
      progress.value = Math.min(1, Math.max(0, 1 - event.translationY / sheetHeight));
    })
    .onEnd((event, success) => {
      'worklet';
      if (!success) return;
      const dismiss =
        event.velocityY > DRAWER_FLICK_VELOCITY ||
        (event.velocityY > -DRAWER_FLICK_VELOCITY && progress.value < 1 - DRAWER_COMMIT_FRACTION);
      progress.value = withSpring(dismiss ? 0 : 1, {
        ...(dismiss ? DRAWER_CLOSE_SPRING : DRAWER_SPRING),
        velocity: sheetHeight > 0 ? -event.velocityY / sheetHeight : 0,
      });
      runOnJS(onSettle)(!dismiss);
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!dragActive.value) return;
      dragActive.value = false;
      if (!success) {
        progress.value = withSpring(1, DRAWER_SPRING);
        runOnJS(onSettle)(true);
      }
    });

  // The sheet may rise at most `clipTop` past fully open (into the gap under
  // the top bar), so an underdamped overshoot shows as a visible bounce. It is
  // built `clipTop` taller than the pad so that bounce never exposes a gap.
  const clipTop = 14 * scale;
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(-clipTop, (1 - progress.value) * (sheetHeight + 2)) }],
  }));
  // Icons fade in with the sheet rather than each tile springing in on its own,
  // which read as jittery while the sheet itself was still moving.
  const gridStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.9], [0, 1], 'clamp'),
  }));
  const handleHeight = 30 * scale;
  const fadeHeight = 26 * scale;

  const closeFromHandle = () => close();
  const tapHandle = Gesture.Tap().onEnd((_event, success) => {
    'worklet';
    if (success) runOnJS(closeFromHandle)();
  });

  const gap = 14 * scale;
  const padding = 18 * scale;
  // Floor so float rounding can never push the last column onto the next row.
  const tileWidth = Math.max(0, Math.floor((width - padding * 2 - gap * (COLUMNS - 1)) / COLUMNS));
  const showGrid = apps.length > 0 && loadState !== 'error';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.window, { top: -clipTop, width, height: sheetHeight + clipTop }]}
    >
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!open}
        accessibilityViewIsModal={open}
        style={[
          styles.sheet,
          {
            top: clipTop,
            width,
            height: sheetHeight + clipTop,
            borderRadius: radius,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={Gesture.Exclusive(drag, tapHandle)}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close apps"
            accessibilityActions={[{ name: 'activate', label: 'Close apps' }]}
            onAccessibilityAction={event => {
              if (event.nativeEvent.actionName === 'activate') close();
            }}
            onAccessibilityTap={close}
            style={[styles.handle, { height: handleHeight }]}
          >
            <View style={styles.grabber} />
          </View>
        </GestureDetector>

        {showGrid ? (
          <Animated.View style={[styles.flex, gridStyle]}>
            <ScrollView
              style={styles.flex}
              overScrollMode="always"
              bounces
              contentContainerStyle={[
                styles.grid,
                { paddingHorizontal: padding, gap, paddingTop: 4 * scale, paddingBottom: 28 * scale + clipTop },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {apps.map(app => (
                <View key={`${device.id}:${app.bundleId}`} style={{ width: tileWidth }}>
                  <AppTile app={app} icon={iconFor(app)} width={tileWidth} aspect={aspect} scale={scale} onPress={() => launch(app)} />
                </View>
              ))}
            </ScrollView>
            {/* Icons fade out under the handle and off the bottom edge instead of being cut. */}
            <View pointerEvents="none" style={[styles.fadeTop, { height: fadeHeight }]} />
            <View pointerEvents="none" style={[styles.fadeBottom, { height: fadeHeight + clipTop }]} />
          </Animated.View>
        ) : loadState === 'error' ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.message}>
            <Text style={[styles.messageText, { fontSize: 15 * scale }]}>Couldn't load apps from {device.name}.</Text>
            <PressableScale
              accessibilityLabel="Retry loading apps"
              onPress={() => setAttempt(n => n + 1)}
              style={[styles.retry, { marginTop: 14 * scale, paddingHorizontal: 18 * scale, height: 40 * scale }]}
            >
              <RefreshCw size={16 * scale} color={COLORS.icon} strokeWidth={2.2} />
              <Text style={[styles.retryLabel, { fontSize: 15 * scale, marginLeft: 8 * scale }]}>Retry</Text>
            </PressableScale>
          </Animated.View>
        ) : loadState === 'ready' ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.message}>
            <Text style={[styles.messageText, { fontSize: 15 * scale }]}>No apps found.</Text>
          </Animated.View>
        ) : (
          <SkeletonGrid tileWidth={tileWidth} aspect={aspect} gap={gap} padding={padding} scale={scale} />
        )}
      </Animated.View>
    </View>
  );
}

interface AppTileProps {
  app: AppInfo;
  icon: ImageSourcePropType | string | null;
  width: number;
  aspect: number;
  scale: number;
  onPress: () => void;
}

function AppTile({ app, icon, width, aspect, scale, onPress }: AppTileProps) {
  const [failed, setFailed] = useState(false);
  const height = width * aspect;
  const radius = 12 * scale;

  useEffect(() => setFailed(false), [icon]);

  return (
    <PressableScale accessibilityLabel={`Open ${app.name}`} haptic="medium" bouncy onPress={onPress}>
      <View style={[styles.tile, { width, height, borderRadius: radius }]}>
        {icon && !failed ? (
          <Image
            source={typeof icon === 'string' ? { uri: icon } : icon}
            resizeMode="cover"
            onError={() => setFailed(true)}
            style={{ width, height }}
          />
        ) : (
          <GlyphTile app={app} width={width} height={height} />
        )}
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, { fontSize: 12 * scale, marginTop: 6 * scale, width }]}>
        {app.name}
      </Text>
    </PressableScale>
  );
}

const SYSTEM_GLYPHS: Record<string, ComponentType<LucideProps>> = {
  'com.apple.TVWatchList': Tv,
  'com.apple.TVMusic': Music,
  'com.apple.TVPhotos': ImageIcon,
  'com.apple.TVSettings': Settings,
  'com.apple.TVAppStore': ShoppingBag,
  'com.apple.TVSearch': Search,
  'com.apple.Arcade': Gamepad2,
  'com.apple.TVMovies': Film,
  'com.apple.TVShows': Clapperboard,
  'com.apple.Fitness': Activity,
  'com.apple.podcasts': Mic,
  'com.apple.TVHomeSharing': Monitor,
};

const GLYPH_FILLS = ['#2C2C2E', '#1E3A5F', '#3A2A4F', '#1F4436', '#4A2E22', '#203F4A', '#46243A'];

/** Fallback art: Apple's built-in apps get a matching glyph, anything else its initial. */
function GlyphTile({ app, width, height }: { app: AppInfo; width: number; height: number }) {
  const Glyph = SYSTEM_GLYPHS[app.bundleId];
  let hash = 0;
  for (const char of app.bundleId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const fill = Glyph ? GLYPH_FILLS[0] : GLYPH_FILLS[Math.abs(hash) % GLYPH_FILLS.length];
  return (
    <View style={[styles.glyph, { width, height, backgroundColor: fill }]}>
      {Glyph ? (
        <Glyph size={height * 0.38} color={COLORS.icon} strokeWidth={1.8} />
      ) : (
        <Text style={[styles.initial, { fontSize: height * 0.4 }]}>{app.name.trim().charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function SkeletonGrid({ tileWidth, aspect, gap, padding, scale }: { tileWidth: number; aspect: number; gap: number; padding: number; scale: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.45, 0.9]) }));

  return (
    <Animated.View
      accessibilityLabel="Loading apps"
      style={[styles.grid, { paddingHorizontal: padding, gap }, pulseStyle]}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <View key={index} style={{ width: tileWidth }}>
          <View style={[styles.skeleton, { height: tileWidth * aspect, borderRadius: 12 * scale }]} />
          <View
            style={[
              styles.skeleton,
              styles.skeletonLabel,
              { height: 10 * scale, width: tileWidth * 0.6, marginTop: 8 * scale, borderRadius: 5 * scale },
            ]}
          />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Clip window over the pad: lets the sheet bounce a little above the pad's
  // top edge while still hiding it below the pad's bottom edge when closed.
  window: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    zIndex: 5,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    backgroundColor: COLORS.sheetFill,
    overflow: 'hidden',
  },
  handle: { alignItems: 'center', justifyContent: 'center' },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundImage: 'linear-gradient(180deg, rgb(28,28,30), rgba(28,28,30,0))',
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundImage: 'linear-gradient(180deg, rgba(28,28,30,0), rgb(28,28,30))',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    overflow: 'hidden',
    backgroundColor: COLORS.controlFill,
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: COLORS.icon,
    fontWeight: '700',
  },
  skeleton: {
    backgroundColor: COLORS.controlFill,
  },
  skeletonLabel: {
    alignSelf: 'center',
  },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  messageText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retry: {
    flexDirection: 'row',
    borderRadius: 20,
    backgroundColor: COLORS.controlFill,
  },
  retryLabel: {
    color: COLORS.icon,
    fontWeight: '600',
  },
});
