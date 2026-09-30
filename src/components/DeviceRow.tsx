import { Check, Plus, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GEOMETRY } from '../adaptive/geometry';
import { COLORS } from '../animations/constants';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { TVIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

interface DeviceRowProps {
  device: AppleTVDeviceInfo;
  selected: boolean;
  scale: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export function DeviceRow({ device, selected, scale, onPress, onLongPress }: DeviceRowProps) {
  const checkSlot = GEOMETRY.deviceRowCheckSlot * scale;
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="selection"
      accessibilityLabel={device.name}
      style={[styles.row, { height: GEOMETRY.deviceRowHeight * scale }]}
    >
      <View style={[styles.checkmarkSlot, { width: checkSlot }]}>
        {selected ? <Check size={18 * scale} color={COLORS.icon} strokeWidth={2.4} /> : null}
      </View>
      <TVIcon size={GEOMETRY.deviceRowIconSize * scale} color={COLORS.icon} />
      <Text numberOfLines={1} style={[styles.label, { fontSize: 17 * scale, marginLeft: 10 * scale }]}>
        {device.name}
      </Text>
    </PressableScale>
  );
}

export function AddTvRow({ scale, onPress }: { scale: number; onPress: () => void }) {
  const checkSlot = GEOMETRY.deviceRowCheckSlot * scale;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel="Add Apple TV"
      style={[styles.row, { height: GEOMETRY.deviceRowHeight * scale }]}
    >
      <View style={[styles.checkmarkSlot, { width: checkSlot }]}>
        <Plus size={18 * scale} color={COLORS.icon} strokeWidth={2.4} />
      </View>
      <Text numberOfLines={1} style={[styles.label, { fontSize: 17 * scale }]}>
        Add Apple TV
      </Text>
    </PressableScale>
  );
}

export function CloseSelectorButton({ scale, onPress }: { scale: number; onPress: () => void }) {
  const size = 32 * scale;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Remove Apple TV"
      hitSlop={8}
      style={[
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: 8 * scale,
        },
      ]}
    >
      <X size={16 * scale} color={COLORS.icon} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  checkmarkSlot: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  label: {
    color: COLORS.icon,
    flexShrink: 1,
    fontWeight: '400',
  },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.controlFill,
    flexShrink: 0,
  },
});
