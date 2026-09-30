import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { COLORS } from '../animations/constants';
import { PressableScale } from './PressableScale';

interface CircleIconButtonProps {
  size: number;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  children: ReactNode;
}

export function CircleIconButton({ size, onPress, onLongPress, disabled, accessibilityLabel, children }: CircleIconButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.circle,
        disabled ? styles.disabled : styles.enabled,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: COLORS.controlFill,
    // No hard border -- Apple's top-row circles are soft frosted discs.
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enabled: {
    opacity: 1,
  },
  disabled: {
    opacity: 0.35,
  },
});
