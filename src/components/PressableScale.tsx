import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { PRESS_OPACITY, PRESS_SCALE, PRESS_TIMING } from '../animations/constants';
import { triggerHaptic, type HapticStyle } from '../haptics/haptics';

interface PressableScaleProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  haptic?: HapticStyle | false;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
}

/**
 * Hand-rolled press-state control: scale + opacity toward PRESS_* on
 * touch-down, spring back on release -- no ripple, no Material. All
 * animation state lives in shared values so the visual feedback stays on the
 * UI thread even though onPress/onLongPress hop to JS.
 */
export function PressableScale({
  onPress,
  onLongPress,
  disabled = false,
  haptic = 'light',
  style,
  children,
  accessibilityLabel,
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const handlePressIn = () => {
    if (haptic) triggerHaptic(haptic);
  };

  const activateFromAccessibility = () => {
    if (disabled || !onPress) return;
    handlePressIn();
    onPress();
  };

  const tap = Gesture.Tap()
    .maxDuration(400)
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      pressed.value = withTiming(1, PRESS_TIMING);
    })
    .onFinalize(() => {
      'worklet';
      pressed.value = withTiming(0, PRESS_TIMING);
    })
    .onStart(() => {
      'worklet';
      runOnJS(handlePressIn)();
      if (onPress) runOnJS(onPress)();
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(450)
    .onStart(() => {
      'worklet';
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composed = onLongPress ? Gesture.Exclusive(longPress, tap) : tap;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
    opacity: 1 - pressed.value * (1 - PRESS_OPACITY),
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'activate') activateFromAccessibility();
        }}
        onAccessibilityTap={activateFromAccessibility}
        style={[styles.base, style, animatedStyle]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
