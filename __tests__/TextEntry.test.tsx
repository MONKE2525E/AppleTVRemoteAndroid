import React from 'react';
import Renderer, { act } from 'react-test-renderer';
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
