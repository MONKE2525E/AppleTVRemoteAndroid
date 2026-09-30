import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '../animations/constants';
import type { AppleTVDeviceInfo } from '../appletv/types';

interface ConfirmDeleteModalProps {
  device: AppleTVDeviceInfo | null;
  onCancel: () => void;
  onConfirm: (device: AppleTVDeviceInfo) => void;
}

export function ConfirmDeleteModal({ device, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  return (
    <Modal visible={device != null} transparent animationType="fade" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Remove “{device?.name}”?</Text>
          <Text style={styles.body}>
            This Apple TV will be unpaired from this phone. You can add it again later.
          </Text>
          <Pressable
            style={styles.destructive}
            onPress={() => {
              if (device) onConfirm(device);
            }}
            accessibilityLabel="Remove"
          >
            <Text style={styles.destructiveLabel}>Remove</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityLabel="Cancel">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingTop: 22,
    paddingBottom: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    color: COLORS.icon,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  destructive: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  destructiveLabel: {
    color: '#FF453A',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancel: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  cancelLabel: {
    color: COLORS.accent,
    fontSize: 17,
    textAlign: 'center',
  },
});
