import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { GEOMETRY } from '../adaptive/geometry';
import { COLORS, TOUCH_HIGHLIGHT_TIMING } from '../animations/constants';
import { appleTV } from '../appletv/client';
import type { RemoteButton } from '../appletv/types';
import { CaptionsIcon, InfoIcon, SkipIcon } from './icons/Icons';

interface TouchSurfaceProps {
  width: number;
  height: number;
  borderRadius: number;
  scale: number;
  showContextualIcons: boolean;
  onSkipBack: () => void;
  onSkipForward: () => void;
}

const SWIPE_MIN = 24;

/**
 * Discrete pad: tap = Select, swipe = one arrow. Continuous HID touch was
 * gimmicky (taps didn't click, swipes reversed/doubled).
 */
export function TouchSurface({
  width,
  height,
  borderRadius,
  scale,
  showContextualIcons,
  onSkipBack,
  onSkipForward,
}: TouchSurfaceProps) {
  const highlight = useSharedValue(0);
  const swipeDir = useSharedValue(0);
  const contextualProgress = useSharedValue(showContextualIcons ? 1 : 0);

  useEffect(() => {
    contextualProgress.value = withTiming(showContextualIcons ? 1 : 0, { duration: 220 });
  }, [showContextualIcons, contextualProgress]);

  const iconSize = GEOMETRY.contextualIconSize * scale;
  const bottomInset = GEOMETRY.contextualBottomInset * scale;
  const iconBandHeight = iconSize + bottomInset * 1.5;
  const iconZoneTop = height - iconBandHeight;

  const handleSelect = useCallback(() => {
    void appleTV.pressButton('SELECT');
  }, []);

  const handleDirection = useCallback((name: RemoteButton) => {
    void appleTV.pressButton(name);
  }, []);

  const handleIconPress = useCallback(
    (slot: number) => {
      if (slot === 0) onSkipBack();
      else if (slot === 3) onSkipForward();
    },
    [onSkipBack, onSkipForward],
  );

  const tap = Gesture.Tap()
    .maxDuration(350)
    .maxDistance(14)
    .onBegin(() => {
      'worklet';
      highlight.value = withTiming(1, TOUCH_HIGHLIGHT_TIMING);
    })
    .onFinalize(() => {
      'worklet';
      highlight.value = withTiming(0, TOUCH_HIGHLIGHT_TIMING);
    })
    .onEnd((event, success) => {
      'worklet';
      if (!success) return;
      if (showContextualIcons && event.y >= iconZoneTop) {
        const slot = Math.min(3, Math.max(0, Math.floor(event.x / (width / 4))));
        runOnJS(handleIconPress)(slot);
        return;
      }
      runOnJS(handleSelect)();
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(SWIPE_MIN)
    .onBegin(() => {
      'worklet';
      highlight.value = withTiming(1, TOUCH_HIGHLIGHT_TIMING);
      swipeDir.value = 0;
    })
    .onUpdate(event => {
      'worklet';
      const ax = Math.abs(event.translationX);
      const ay = Math.abs(event.translationY);
      const dist = ax > ay ? ax : ay;
      if (swipeDir.value === 0) {
        if (dist < SWIPE_MIN) return;
        const dir =
          ax > ay ? (event.translationX > 0 ? 4 : 3) : event.translationY > 0 ? 2 : 1;
        swipeDir.value = dir;
        runOnJS(handleDirection)(dir === 1 ? 'UP' : dir === 2 ? 'DOWN' : dir === 3 ? 'LEFT' : 'RIGHT');
        return;
      }
    })
    .onFinalize(() => {
      'worklet';
      highlight.value = withTiming(0, TOUCH_HIGHLIGHT_TIMING);
      swipeDir.value = 0;
    });

  const composed = Gesture.Exclusive(pan, tap);

  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));
  const iconRowStyle = useAnimatedStyle(() => ({
    opacity: contextualProgress.value,
    transform: [{ translateY: interpolate(contextualProgress.value, [0, 1], [12, 0]) }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.surface, { width, height, borderRadius }]}>
        <Animated.View pointerEvents="none" style={[styles.highlight, { borderRadius }, highlightStyle]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.iconRow, iconRowStyle, { height: iconBandHeight, paddingBottom: bottomInset }]}
        >
          <SkipIcon size={iconSize} direction="back" />
          <InfoIcon size={iconSize} />
          <CaptionsIcon size={iconSize} />
          <SkipIcon size={iconSize} direction="forward" />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: COLORS.touchSurfaceFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.touchSurfaceBorder,
    overflow: 'hidden',
  },
  highlight: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.touchSurfaceHighlight,
  },
  iconRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
});
