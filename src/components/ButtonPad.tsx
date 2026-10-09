import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { appleTV } from '../appletv/client';
import { CircleIconButton } from './CircleIconButton';
import { SkipIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

export const MIN_TOUCH_TARGET = 48;

interface ButtonPadProps {
  width: number;
  height: number;
  scale: number;
  showContextualIcons: boolean;
  /** Space kept clear along the bottom edge for the app drawer handle. */
  bottomInset?: number;
  transportKeys?: boolean;
  onSkipBack: () => void;
  onSkipForward: () => void;
}

const ARROWS = [
  { button: 'UP', label: 'Up', Icon: ChevronUp, at: (edge: number) => ({ top: 0, left: edge }) },
  { button: 'DOWN', label: 'Down', Icon: ChevronDown, at: (edge: number) => ({ bottom: 0, left: edge }) },
  { button: 'LEFT', label: 'Left', Icon: ChevronLeft, at: (edge: number) => ({ left: 0, top: edge }) },
  { button: 'RIGHT', label: 'Right', Icon: ChevronRight, at: (edge: number) => ({ right: 0, top: edge }) },
] as const;

/**
 * Click-wheel style alternative to TouchSurface: a large ring with
 * up/left/right/down arrows and a smaller Select disc in the middle.
 */
export function ButtonPad({
  width,
  height,
  scale,
  showContextualIcons,
  bottomInset = 0,
  transportKeys = false,
  onSkipBack,
  onSkipForward,
}: ButtonPadProps) {
  const skipSize = 44 * scale;
  // Same frosted disc as the transport buttons, and never under the 48dp touch minimum.
  const skipTarget = Math.max(MIN_TOUCH_TARGET, 56 * scale);
  const skipRow = showContextualIcons ? skipTarget + 16 * scale : 0;
  const diameter = Math.max(0, Math.min(width, height - skipRow - bottomInset));
  const zone = diameter * 0.3;
  const select = diameter * 0.36;

  return (
    <View style={[styles.container, { width, height, paddingBottom: bottomInset }]}>
      <View style={[styles.ring, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
        {ARROWS.map(({ button, label, Icon, at }) => (
          <PressableScale
            key={button}
            accessibilityLabel={label}
            style={[styles.arrow, { width: zone, height: zone }, at((diameter - zone) / 2)]}
            onPress={() => void appleTV.pressButton(button)}
          >
            <Icon size={diameter * 0.1} color={COLORS.icon} strokeWidth={2.4} />
          </PressableScale>
        ))}
        <PressableScale
          accessibilityLabel="Select"
          haptic="medium"
          style={[
            styles.select,
            { width: select, height: select, borderRadius: select / 2, top: (diameter - select) / 2, left: (diameter - select) / 2 },
          ]}
          onPress={() => void appleTV.pressButton('SELECT')}
        >
          <View />
        </PressableScale>
      </View>
      {showContextualIcons && (
        <View style={[styles.skipRow, { marginTop: 16 * scale, gap: 24 * scale }]}>
          <CircleIconButton
            size={skipTarget}
            accessibilityLabel={transportKeys ? 'Rewind' : 'Skip back 10 seconds'}
            onPress={onSkipBack}
          >
            <SkipIcon size={skipSize * 0.75} direction="back" transport={transportKeys} />
          </CircleIconButton>
          <CircleIconButton
            size={skipTarget}
            accessibilityLabel={transportKeys ? 'Fast forward' : 'Skip forward 10 seconds'}
            onPress={onSkipForward}
          >
            <SkipIcon size={skipSize * 0.75} direction="forward" transport={transportKeys} />
          </CircleIconButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    backgroundColor: COLORS.touchSurfaceFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.touchSurfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { position: 'absolute' },
  // Pinned like the arrows: flex-centering could lay it out against a stale,
  // smaller ring while the pad resizes under the device list animation.
  select: { position: 'absolute', backgroundColor: COLORS.controlFill },
  skipRow: { flexDirection: 'row', alignItems: 'center' },
});
