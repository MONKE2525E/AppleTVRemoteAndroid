import { ChevronUp, Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, withSpring, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import {
  COLORS,
  DRAWER_COMMIT_FRACTION,
  DRAWER_FLICK_VELOCITY,
  DRAWER_SPRING,
} from '../animations/constants';
import { openSettings } from '../settings/SettingsScreen';
import { PressableScale } from './PressableScale';

/** Height of the pull-up strip; pads keep their own controls clear of it. */
export const DRAWER_HANDLE_HEIGHT = 30;

interface PadOverlayProps {
  width: number;
  scale: number;
  drawerProgress: SharedValue<number>;
  sheetHeight: number;
  onDrawerDragStart: () => void;
  onDrawerSettle: (open: boolean) => void;
}

/**
 * Sits over either pad (swipe or buttons): a settings gear in the top-right
 * corner and the pull-up chevron along the bottom edge. Siblings of the pad
 * rather than children, so their touches never reach the pad's swipe/select
 * gestures.
 */
export function PadOverlay({
  width,
  scale,
  drawerProgress,
  sheetHeight,
  onDrawerDragStart,
  onDrawerSettle,
}: PadOverlayProps) {
  const handleHeight = DRAWER_HANDLE_HEIGHT * scale;
  const gearSlot = 44 * scale;

  const settle = (open: boolean, velocityY: number) => {
    'worklet';
    drawerProgress.value = withSpring(open ? 1 : 0, {
      ...DRAWER_SPRING,
      velocity: sheetHeight > 0 ? -velocityY / sheetHeight : 0,
    });
    runOnJS(onDrawerSettle)(open);
  };

  // The sheet tracks the finger 1:1 from the moment the pull activates.
  const pull = Gesture.Pan()
    .activeOffsetY(-6)
    .failOffsetY(12)
    .onStart(() => {
      'worklet';
      runOnJS(onDrawerDragStart)();
    })
    .onUpdate(event => {
      'worklet';
      if (sheetHeight <= 0) return;
      drawerProgress.value = Math.min(1, Math.max(0, -event.translationY / sheetHeight));
    })
    .onEnd(event => {
      'worklet';
      const open =
        event.velocityY < -DRAWER_FLICK_VELOCITY ||
        (event.velocityY < DRAWER_FLICK_VELOCITY && drawerProgress.value > DRAWER_COMMIT_FRACTION);
      settle(open, event.velocityY);
    });

  const tap = Gesture.Tap().onEnd((_event, success) => {
    'worklet';
    if (!success) return;
    runOnJS(onDrawerDragStart)();
    settle(true, 0);
  });

  const chevronStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerProgress.value, [0, 0.4], [1, 0], 'clamp'),
    transform: [{ translateY: interpolate(drawerProgress.value, [0, 0.4], [0, -10 * scale], 'clamp') }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { width }]}>
      <PressableScale
        accessibilityLabel="Settings"
        haptic="selection"
        onPress={openSettings}
        style={[styles.gear, { width: gearSlot, height: gearSlot, top: 6 * scale, right: 6 * scale }]}
      >
        <Settings size={20 * scale} color={COLORS.iconSecondary} strokeWidth={2} />
      </PressableScale>

      <GestureDetector gesture={Gesture.Exclusive(pull, tap)}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Open apps"
          style={[styles.handle, { width: Math.min(width, 140 * scale), height: handleHeight + 8 * scale }]}
        >
          <Animated.View style={chevronStyle}>
            <ChevronUp size={22 * scale} color={COLORS.iconSecondary} strokeWidth={2.4} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignSelf: 'center',
  },
  gear: {
    position: 'absolute',
  },
  handle: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
