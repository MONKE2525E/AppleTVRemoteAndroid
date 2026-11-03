import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { kindIcon, kindLabel } from '../appletv/deviceKinds';
import type { AppleTVDeviceInfo } from '../appletv/types';

/**
 * Devices that answered discovery but can't be driven by this app (HomePods,
 * AirPlay speakers, Android TV). They stay visible so a missing device is never a
 * mystery, but are plainly marked and can't be tapped.
 */
export function OtherDevices({ devices }: { devices: AppleTVDeviceInfo[] }) {
  if (devices.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>Other devices nearby</Text>
      <Text style={styles.detail}>Found on your network, but this app can't control them yet.</Text>
      <View style={styles.group}>
        {devices.map((device, index) => {
          const Icon = kindIcon(device);
          return (
            <View
              key={device.id}
              accessible
              accessibilityLabel={`${device.name}, ${kindLabel(device)}, can't be controlled yet`}
              style={[styles.row, index > 0 && styles.divider]}
            >
              <Icon size={20} color={COLORS.iconSecondary} strokeWidth={1.9} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>{device.name}</Text>
                <Text numberOfLines={1} style={styles.kind}>{kindLabel(device)}</Text>
              </View>
              <Text style={styles.badge}>Not supported yet</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 12 },
  title: { color: COLORS.iconSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginLeft: 4 },
  detail: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 4, marginTop: 4, marginBottom: 8 },
  group: { paddingHorizontal: 14, borderRadius: 18, backgroundColor: COLORS.cardFill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, opacity: 0.85 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  copy: { flex: 1 },
  name: { color: COLORS.icon, fontSize: 15.5, fontWeight: '600' },
  kind: { color: COLORS.textSecondary, fontSize: 12.5, marginTop: 1 },
  badge: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
});
