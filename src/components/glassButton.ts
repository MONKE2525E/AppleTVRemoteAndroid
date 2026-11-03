import type { ViewStyle } from 'react-native';
import { COLORS } from '../animations/constants';

/** Shared frosted-glass look for buttons. Surfaces and cards do not use it. */
export const glassButton: ViewStyle = {
  backgroundColor: COLORS.glassButtonFill,
  backgroundImage: COLORS.glassButtonGradient,
  borderWidth: 1,
  borderColor: COLORS.glassButtonBorder,
  borderTopColor: COLORS.glassButtonRim,
  overflow: 'hidden',
};
