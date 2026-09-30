import { StyleSheet, Text } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { COLORS } from '../animations/constants';
import { GEOMETRY } from '../adaptive/geometry';
import { ChevronIcon, TVIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

interface DeviceSelectorPillProps {
  label: string;
  progress: SharedValue<number>;
  scale: number;
  onPress: () => void;
}

/** Presentational only -- the open/close choreography's spring lives in RemoteScreen.tsx and is shared across every piece that moves. */
export function DeviceSelectorPill({ label, progress, scale, onPress }: DeviceSelectorPillProps) {
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 90])}deg` }],
  }));

  const height = GEOMETRY.topBarControlSize * scale;

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={`Apple TV: ${label}. Double tap to change device.`}
      style={[
        styles.pill,
        {
          height,
          flex: 1,
          paddingHorizontal: GEOMETRY.devicePillHorizontalPadding * scale,
          borderRadius: height / 2,
        },
      ]}
    >
      <TVIcon size={16 * scale} color={COLORS.icon} />
      <Text numberOfLines={1} style={[styles.label, { fontSize: 15 * scale, marginHorizontal: 7 * scale }]}>
        {label}
      </Text>
      <Animated.View style={chevronStyle}>
        <ChevronIcon size={GEOMETRY.chevronSize * scale} />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pillFill,
  },
  label: {
    color: COLORS.icon,
    fontWeight: '600',
  },
});
