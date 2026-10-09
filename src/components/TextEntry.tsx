import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const send = useCallback((text: string) => {
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
  // Drops a queued value so it can't land in a different field after the one
  // it was typed for loses focus. A request already in flight still completes.
  const cancel = useCallback(() => { pending.current = null; }, []);
  return { send, cancel };
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
  const { send: sync, cancel: cancelSync } = useTextSync();
  // The TV re-reports the pre-send text after each of our own edits, so the
  // snapshot it reports trails what we typed. Remember the latest text plus
  // every value we know to be stale (the original text and each earlier edit),
  // and reuse the latest text while the TV only reports one of those.
  const typed = useRef<{ text: string; stale: Set<string> } | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // The field lost focus on the TV (submitted, cancelled, navigated away), so
  // there is nothing left to type into.
  useEffect(() => {
    if (!textInput.focused) {
      setOpen(false);
      typed.current = null;
      cancelSync();
    }
  }, [textInput.focused, cancelSync]);
  useEffect(() => cancelSync, [cancelSync]);

  // The TV can move straight to another populated field without reporting a
  // loss of focus. Text we didn't produce (not the latest edit or a known-stale
  // snapshot) means a different field: drop queued edits, restart the history,
  // and refresh the editor if it is open.
  const tvText = textInput.current ?? '';
  const tvFocused = textInput.focused;
  useEffect(() => {
    const last = typed.current;
    if (!tvFocused || !last) return;
    const reported = tvText;
    if (reported === last.text || last.stale.has(reported)) return;
    typed.current = null;
    cancelSync();
    setValue(reported);
  }, [tvText, tvFocused, cancelSync]);

  // autoFocus is unreliable inside an Android Modal: the input can mount
  // before the window can take focus, leaving the keyboard down. Focus
  // explicitly once the dialog is up, with a retry for slow transitions.
  useEffect(() => {
    if (!open) return;
    const timers = [60, 250].map(ms => setTimeout(() => inputRef.current?.focus(), ms));
    return () => timers.forEach(clearTimeout);
  }, [open]);

  if (!textInput.focused) return null;

  const show = () => {
    const last = typed.current;
    if (last && last.stale.has(textInput.current ?? '')) {
      setValue(last.text);
    } else {
      // The TV reports text we didn't produce (for example it moved to another
      // populated field), so adopt it and restart the stale history from it.
      typed.current = null;
      setValue(textInput.current ?? '');
    }
    setOpen(true);
  };
  const onChangeText = (text: string) => {
    setValue(text);
    const stale = typed.current?.stale ?? new Set([textInput.current ?? '']);
    if (typed.current) stale.add(typed.current.text);
    typed.current = { text, stale };
    sync(text);
  };

  return (
    <>
      <PressableScale onPress={show} accessibilityLabel="Type on TV" style={styles.pill}>
        <KeyboardIcon size={20} />
        <Text style={styles.pillText}>Type with keyboard</Text>
      </PressableScale>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onShow={() => inputRef.current?.focus()}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.header}>
              <KeyboardIcon size={18} color={COLORS.iconSecondary} />
              <Text style={styles.title}>Type on TV</Text>
            </View>
            <View style={styles.field}>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                onSubmitEditing={() => setOpen(false)}
                autoFocus
                blurOnSubmit={false}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                accessibilityLabel="Text to send to TV"
                placeholder="Appears on your TV as you type"
                placeholderTextColor={COLORS.textSecondary}
                selectionColor="rgba(255,255,255,0.35)"
                cursorColor={COLORS.icon}
                selectionHandleColor={COLORS.icon}
                underlineColorAndroid="transparent"
                style={styles.input}
              />
            </View>
            <PressableScale onPress={() => setOpen(false)} accessibilityLabel="Done typing" style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </PressableScale>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 20, paddingTop: 64 },
  dialog: {
    backgroundColor: '#141414',
    borderRadius: 32,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: COLORS.touchSurfaceBorder,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { color: COLORS.iconSecondary, fontSize: 15, fontWeight: '600' },
  field: { backgroundColor: COLORS.controlFill, borderRadius: 22, paddingHorizontal: 18, minHeight: 56, justifyContent: 'center' },
  input: { color: COLORS.icon, fontSize: 20, paddingVertical: 12 },
  done: { height: 48, borderRadius: 24, backgroundColor: COLORS.controlFillPressed, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: COLORS.icon, fontSize: 16, fontWeight: '600' },
});
