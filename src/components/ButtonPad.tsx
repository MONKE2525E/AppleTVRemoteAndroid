import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { appleTV } from '../appletv/client';
import { SkipIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

interface ButtonPadProps {
  width: number;
  height: number;
  scale: number;
  showContextualIcons: boolean;
  /** Space kept clear along the bottom edge for the app drawer handle. */
  bottomInset?: number;
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
  onSkipBack,
  onSkipForward,
}: ButtonPadProps) {
  const skipSize = 44 * scale;
  const skipRow = showContextualIcons ? skipSize + 16 * scale : 0;
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
          style={[styles.select, { width: select, height: select, borderRadius: select / 2 }]}
          onPress={() => void appleTV.pressButton('SELECT')}
        >
          <View />
        </PressableScale>
      </View>
      {showContextualIcons && (
        <View style={[styles.skipRow, { marginTop: 16 * scale, gap: 48 * scale }]}>
          <PressableScale accessibilityLabel="Skip back 10 seconds" onPress={onSkipBack}>
            <SkipIcon size={skipSize * 0.75} direction="back" />
          </PressableScale>
          <PressableScale accessibilityLabel="Skip forward 10 seconds" onPress={onSkipForward}>
            <SkipIcon size={skipSize * 0.75} direction="forward" />
          </PressableScale>
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
  select: { backgroundColor: COLORS.controlFill },
  skipRow: { flexDirection: 'row', alignItems: 'center' },
});
