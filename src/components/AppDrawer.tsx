import { useEffect, useState, type ComponentType } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
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
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COLORS,
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
/** tvOS and Roku both draw app art as landscape tiles. */
const TILE_ASPECT = 0.6;

interface AppDrawerProps {
  open: boolean;
  /** True as soon as a pull starts, so the list is loading before the sheet is fully up. */
  active: boolean;
  progress: SharedValue<number>;
  sheetHeight: number;
  width: number;
  left: number;
  scale: number;
  device: AppleTVDeviceInfo;
  onSettle: (open: boolean) => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export function AppDrawer({ open, active, progress, sheetHeight, width, left, scale, device, onSettle }: AppDrawerProps) {
  const { apps } = useAppleTV();
  const insets = useSafeAreaInsets();
  const dragActive = useSharedValue(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [artwork, setArtwork] = useState<Record<string, string>>({});
  const roku = isRokuDevice(device);

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
    progress.value = withSpring(0, DRAWER_SPRING);
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
        ...DRAWER_SPRING,
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

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6 }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (sheetHeight + insets.bottom + 24) }],
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.85], [0, 1], 'clamp'),
  }));

  const gap = 14 * scale;
  const padding = 20 * scale;
  // Floor so float rounding can never push the last column onto the next row.
  const tileWidth = Math.max(0, Math.floor((width - padding * 2 - gap * (COLUMNS - 1)) / COLUMNS));
  const showGrid = apps.length > 0 && loadState !== 'error';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.scrim, scrimStyle]}>
        <Pressable accessibilityLabel="Close apps" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.sheet,
          {
            left,
            width,
            height: sheetHeight + insets.bottom,
            paddingBottom: insets.bottom,
            borderTopLeftRadius: 28 * scale,
            borderTopRightRadius: 28 * scale,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={drag}>
          <View style={{ paddingHorizontal: padding, paddingBottom: 12 * scale }}>
            <View style={[styles.grabber, { marginTop: 8 * scale, marginBottom: 14 * scale }]} />
            <Animated.View style={[styles.headerRow, headerStyle]}>
              <View style={styles.flex}>
                <Text style={[styles.title, { fontSize: 22 * scale }]}>Apps</Text>
                <Text numberOfLines={1} style={[styles.subtitle, { fontSize: 13 * scale }]}>
                  {device.name}
                </Text>
              </View>
              {loadState === 'loading' && showGrid && <Spinner size={16 * scale} />}
            </Animated.View>
          </View>
        </GestureDetector>

        {showGrid ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.grid, { paddingHorizontal: padding, gap, paddingBottom: 24 * scale }]}
            showsVerticalScrollIndicator={false}
          >
            {apps.map((app, index) => (
              <Animated.View
                key={`${device.id}:${app.bundleId}`}
                entering={FadeInDown.delay(Math.min(index, 14) * 22).duration(260)}
                style={{ width: tileWidth }}
              >
                <AppTile app={app} icon={iconFor(app)} width={tileWidth} scale={scale} onPress={() => launch(app)} />
              </Animated.View>
            ))}
          </ScrollView>
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
          <SkeletonGrid tileWidth={tileWidth} gap={gap} padding={padding} scale={scale} />
        )}
      </Animated.View>
    </View>
  );
}

interface AppTileProps {
  app: AppInfo;
  icon: ImageSourcePropType | string | null;
  width: number;
  scale: number;
  onPress: () => void;
}

function AppTile({ app, icon, width, scale, onPress }: AppTileProps) {
  const [failed, setFailed] = useState(false);
  const height = width * TILE_ASPECT;
  const radius = 12 * scale;

  useEffect(() => setFailed(false), [icon]);

  return (
    <PressableScale accessibilityLabel={`Open ${app.name}`} haptic="medium" onPress={onPress}>
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

function SkeletonGrid({ tileWidth, gap, padding, scale }: { tileWidth: number; gap: number; padding: number; scale: number }) {
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
          <View style={[styles.skeleton, { height: tileWidth * TILE_ASPECT, borderRadius: 12 * scale }]} />
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

function Spinner({ size }: { size: number }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: 900 }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <Animated.View accessibilityLabel="Refreshing apps" style={style}>
      <RefreshCw size={size} color={COLORS.iconSecondary} strokeWidth={2.2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Above TopBar's elevation 20, which otherwise draws over overlays on Android.
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.scrim,
    zIndex: 30,
    elevation: 30,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: COLORS.sheetFill,
    overflow: 'hidden',
    zIndex: 31,
    elevation: 31,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: COLORS.icon,
    fontWeight: '700',
  },
  subtitle: {
    color: COLORS.textSecondary,
    marginTop: 2,
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
