import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { GEOMETRY } from '../adaptive/geometry';
import type { AppleTVDeviceInfo } from '../appletv/types';
import { CircleIconButton } from './CircleIconButton';
import { AddTvRow, CloseSelectorButton, DeviceRow } from './DeviceRow';
import { DeviceSelectorPill } from './DeviceSelectorPill';
import { MuteIcon, PowerIcon } from './icons/Icons';

interface TopBarProps {
  devices: AppleTVDeviceInfo[];
  connectedDeviceId: string | null;
  label: string;
  muted: boolean;
  selectorOpen: boolean;
  progress: SharedValue<number>;
  scale: number;
  onToggleSelector: () => void;
  onSelectDevice: (deviceId: string) => void;
  onFindDevices: () => void;
  onRequestDeleteDevice: (deviceId: string) => void;
  onToggleMute: () => void;
  onPower: () => void;
}

/**
 * Owns the top row (Mute / device pill / Power) and the device list that
 * opens underneath it. Both are driven by the single `progress` shared value
 * created in RemoteScreen.tsx so the fade-out of Mute/Power, the chevron
 * rotation, and the fade-in of the device list move as one overlapping
 * motion rather than a sequence -- see SELECTOR_SPRING.
 */
export function TopBar({
  devices,
  connectedDeviceId,
  label,
  muted,
  selectorOpen,
  progress,
  scale,
  onToggleSelector,
  onSelectDevice,
  onFindDevices,
  onRequestDeleteDevice,
  onToggleMute,
  onPower,
}: TopBarProps) {
  const sideButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -4]) }],
  }));

  const listStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-6, 0]) }],
  }));

  // Mute / pill / Power share one control size so the row is one even band.
  const rowSize = GEOMETRY.topBarControlSize * scale;
  const listTop = rowSize + 8 * scale;

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View
        pointerEvents="box-none"
        style={[
          styles.row,
          {
            height: rowSize,
            marginHorizontal: GEOMETRY.topBarSideMargin * scale,
            gap: GEOMETRY.topBarGap * scale,
          },
        ]}
      >
        <Animated.View
          style={[sideButtonStyle, styles.side]}
          pointerEvents={selectorOpen ? 'none' : 'auto'}
          importantForAccessibility={selectorOpen ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={selectorOpen}
        >
          <CircleIconButton size={rowSize} onPress={onToggleMute} accessibilityLabel={muted ? 'Unmute' : 'Mute'}>
            <MuteIcon size={rowSize * 0.4} />
          </CircleIconButton>
        </Animated.View>

        <DeviceSelectorPill label={label} progress={progress} scale={scale} onPress={onToggleSelector} />

        <Animated.View
          style={[sideButtonStyle, styles.side]}
          pointerEvents={selectorOpen ? 'none' : 'auto'}
          importantForAccessibility={selectorOpen ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={selectorOpen}
        >
          <CircleIconButton size={rowSize} onPress={onPower} accessibilityLabel="Power">
            <PowerIcon size={rowSize * 0.4} />
          </CircleIconButton>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.list,
          {
            top: listTop,
            paddingHorizontal: GEOMETRY.topBarSideMargin * scale,
          },
          listStyle,
        ]}
        pointerEvents={selectorOpen ? 'auto' : 'none'}
        importantForAccessibility={selectorOpen ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!selectorOpen}
      >
        {devices.map(device => (
          <View
            key={device.id}
            style={[styles.deviceLine, { height: GEOMETRY.deviceRowHeight * scale }]}
          >
            <DeviceRow
              device={device}
              selected={device.id === connectedDeviceId}
              scale={scale}
              onPress={() => onSelectDevice(device.id)}
            />
            <CloseSelectorButton
              scale={scale}
              onPress={() => onRequestDeleteDevice(device.id)}
            />
          </View>
        ))}
        <AddTvRow scale={scale} onPress={onFindDevices} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 20,
    elevation: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flexShrink: 0,
  },
  list: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 21,
    elevation: 21,
  },
  deviceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
