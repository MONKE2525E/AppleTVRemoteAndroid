import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { glassButton } from './glassButton';
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
    ...glassButton,
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
