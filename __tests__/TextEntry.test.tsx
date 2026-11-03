import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Keyboard, Modal } from 'react-native';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import { appleTVStore } from '../src/appletv/store';
import { TextEntryPrompt } from '../src/components/TextEntry';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  jest.clearAllMocks();
  appleTVStore.setTextInput({ current: null, focused: false });
});

test('shows nothing until the TV focuses a text field', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'Type on TV' })).toHaveLength(0);
  await act(async () => { appleTVStore.setTextInput({ current: '', focused: true }); });
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'Type on TV' }).length).toBeGreaterThan(0);
  await act(async () => { tree!.unmount(); });
});

test('Roku offers manual typing, sends edits in order, and starts a fresh session', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt roku rokuSessionId="session-a" />); });
  const open = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { open().props.onPress(); });
  await act(async () => { input().props.onChangeText('ab'); });
  await act(async () => { input().props.onChangeText('ac'); });
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenNthCalledWith(1, 'session-a', 0, 'ab');
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenNthCalledWith(2, 'session-a', 1, 'c');
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  expect(dismiss).toHaveBeenCalled();
  expect(tree!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => { open().props.onPress(); });
  expect(input().props.value).toBe('');
  await act(async () => { input().props.onChangeText('x'); });
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenLastCalledWith('session-a', 0, 'x');
  await act(async () => { tree!.unmount(); });
  dismiss.mockRestore();
});

test('Roku keeps the remote covered until queued text finishes after Done', async () => {
  let release: () => void = () => {};
  (NativeAppleTV.sendRokuEdit as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt roku rokuSessionId="session-a" />); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { pill.props.onPress(); });
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { input().props.onChangeText('a'); });
  await act(async () => { input().props.onChangeText('ab'); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  expect(tree!.root.findByType(Modal).props.visible).toBe(true);
  expect(input().props.editable).toBe(false);
  await act(async () => { release(); });
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenLastCalledWith('session-a', 0, 'b');
  expect(tree!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => { tree!.unmount(); });
});

test('Roku stops queued edits and reports a failed send', async () => {
  let reject: (error: Error) => void = () => {};
  (NativeAppleTV.sendRokuEdit as jest.Mock).mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt roku rokuSessionId="session-a" />); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { pill.props.onPress(); });
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { input().props.onChangeText('a'); });
  await act(async () => { input().props.onChangeText('ab'); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  await act(async () => { reject(new Error('network')); });
  expect(tree!.root.findByType(Modal).props.visible).toBe(true);
  expect(input().props.editable).toBe(false);
  expect(tree!.root.findAllByProps({ children: 'Text may be incomplete. Check your Roku before trying again.' }).length).toBeGreaterThan(0);
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenCalledTimes(1);
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  expect(tree!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => { tree!.unmount(); });
});

test('queued Roku edits retain the original session across a native device switch', async () => {
  let release: () => void = () => {};
  let activeSession = 'session-a';
  (NativeAppleTV.sendRokuEdit as jest.Mock).mockImplementation(async (session: string) => {
    if (session !== activeSession) throw new Error('Roku session changed');
    await new Promise<void>(resolve => { release = resolve; });
  });
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt roku rokuSessionId="session-a" />); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { pill.props.onPress(); });
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { input().props.onChangeText('a'); });
  await act(async () => { input().props.onChangeText('ab'); });
  activeSession = 'session-b';
  await act(async () => { release(); });
  expect(NativeAppleTV.sendRokuEdit).toHaveBeenNthCalledWith(2, 'session-a', 0, 'b');
  expect(input().props.editable).toBe(false);
  await act(async () => { tree!.unmount(); });
  (NativeAppleTV.sendRokuEdit as jest.Mock).mockReset().mockResolvedValue(undefined);
});

test('typing replaces the TV field and losing focus removes the prompt', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'ab', focused: true }); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { pill.props.onPress(); });
  const input = tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  expect(input.props.value).toBe('ab');
  await act(async () => { input.props.onChangeText('abc'); });
  expect(NativeAppleTV.sendText).toHaveBeenCalledWith('abc', true);
  await act(async () => { appleTVStore.setTextInput({ current: null, focused: false }); });
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'Text to send to TV' })).toHaveLength(0);
  await act(async () => { tree!.unmount(); });
});

test('reopening keeps the text typed while the TV still reports the stale snapshot', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'ab', focused: true }); });
  const openPill = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { openPill().props.onPress(); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' }).props.onChangeText('abc'); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  await act(async () => { openPill().props.onPress(); });
  expect(tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' }).props.value).toBe('abc');
  await act(async () => { tree!.unmount(); });
});

test('reopening keeps the latest text after several completed sends', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'ab', focused: true }); });
  const openPill = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { openPill().props.onPress(); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' }).props.onChangeText('abc'); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' }).props.onChangeText('abcd'); });
  await act(async () => { appleTVStore.setTextInput({ current: 'abc', focused: true }); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  await act(async () => { openPill().props.onPress(); });
  expect(tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' }).props.value).toBe('abcd');
  await act(async () => { tree!.unmount(); });
});

test('a queued edit is dropped when the TV field loses focus', async () => {
  let release: () => void = () => {};
  (NativeAppleTV.sendText as jest.Mock).mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'a', focused: true }); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  await act(async () => { pill.props.onPress(); });
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { input().props.onChangeText('ab'); });
  await act(async () => { input().props.onChangeText('abc'); });
  await act(async () => { appleTVStore.setTextInput({ current: null, focused: false }); });
  await act(async () => { release(); });
  expect(NativeAppleTV.sendText).toHaveBeenCalledTimes(1);
  expect(NativeAppleTV.sendText).toHaveBeenCalledWith('ab', true);
  await act(async () => { tree!.unmount(); });
});

test('adopting a new TV snapshot restarts the stale history', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'ab', focused: true }); });
  const openPill = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { openPill().props.onPress(); });
  await act(async () => { input().props.onChangeText('abc'); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  await act(async () => { appleTVStore.setTextInput({ current: 'xyz', focused: true }); });
  await act(async () => { openPill().props.onPress(); });
  expect(input().props.value).toBe('xyz');
  await act(async () => { input().props.onChangeText('xyz1'); });
  await act(async () => { appleTVStore.setTextInput({ current: 'xyz', focused: true }); });
  await act(async () => { tree!.root.findByProps({ accessibilityLabel: 'Done typing' }).props.onPress(); });
  await act(async () => { openPill().props.onPress(); });
  expect(input().props.value).toBe('xyz1');
  await act(async () => { tree!.unmount(); });
});

test('switching fields while the dialog is open adopts the new text and drops queued edits', async () => {
  let release: () => void = () => {};
  (NativeAppleTV.sendText as jest.Mock).mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TextEntryPrompt />); });
  await act(async () => { appleTVStore.setTextInput({ current: 'ab', focused: true }); });
  const pill = tree!.root.findAll(n => n.props.accessibilityLabel === 'Type on TV' && typeof n.props.onPress === 'function')[0];
  const input = () => tree!.root.findByProps({ accessibilityLabel: 'Text to send to TV' });
  await act(async () => { pill.props.onPress(); });
  await act(async () => { input().props.onChangeText('abc'); });
  await act(async () => { input().props.onChangeText('abcd'); });
  await act(async () => { appleTVStore.setTextInput({ current: 'xyz', focused: true }); });
  expect(input().props.value).toBe('xyz');
  await act(async () => { release(); });
  expect(NativeAppleTV.sendText).toHaveBeenCalledTimes(1);
  await act(async () => { tree!.unmount(); });
});
