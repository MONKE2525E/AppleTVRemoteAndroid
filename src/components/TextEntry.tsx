import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS } from '../animations/constants';
import { appleTV } from '../appletv/client';
import { useAppleTV } from '../appletv/useAppleTV';
import { KeyboardIcon } from './icons/Icons';
import { PressableScale } from './PressableScale';

/**
 * Sends the latest text to the TV one request at a time. Each send replaces
 * the whole field, so skipping intermediate values while one is in flight is
 * safe and keeps the TV from lagging behind fast typing.
 */
function useTextSync() {
  const pending = useRef<string | null>(null);
  const running = useRef(false);

  return useCallback((text: string) => {
    pending.current = text;
    if (running.current) return;
    running.current = true;
    (async () => {
      while (pending.current !== null) {
        const next = pending.current;
        pending.current = null;
        await appleTV.sendText(next, true);
      }
      running.current = false;
    })();
  }, []);
}

/**
 * Offers the phone keyboard whenever the TV focuses a text field: a pill
 * appears while a field is focused, and tapping it opens a keyboard whose
 * contents are mirrored into the field as you type.
 */
export function TextEntryPrompt() {
  const { textInput } = useAppleTV();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const sync = useTextSync();

  // The field lost focus on the TV (submitted, cancelled, navigated away), so
  // there is nothing left to type into.
  useEffect(() => {
    if (!textInput.focused) setOpen(false);
  }, [textInput.focused]);

  if (!textInput.focused) return null;

  const show = () => {
    setValue(textInput.current ?? '');
    setOpen(true);
  };
  const onChangeText = (text: string) => {
    setValue(text);
    sync(text);
  };

  return (
    <>
      <PressableScale onPress={show} accessibilityLabel="Type on TV" style={styles.pill}>
        <KeyboardIcon size={20} />
        <Text style={styles.pillText}>Type with keyboard</Text>
      </PressableScale>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>Type on TV</Text>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              onSubmitEditing={() => setOpen(false)}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              accessibilityLabel="Text to send to TV"
              placeholder="Text appears on your TV as you type"
              placeholderTextColor={COLORS.textSecondary}
              style={styles.input}
            />
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Done typing">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.controlFillPressed,
    zIndex: 5,
  },
  pillText: { color: COLORS.icon, fontSize: 15, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-start', padding: 24, paddingTop: 96 },
  dialog: { backgroundColor: '#1C1C1E', padding: 24, borderRadius: 20, gap: 20 },
  title: { color: COLORS.icon, fontSize: 18, textAlign: 'center' },
  input: { color: COLORS.icon, fontSize: 22, borderBottomWidth: 1, borderColor: COLORS.separator, paddingVertical: 8 },
  done: { color: COLORS.accent, fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
