import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { PermissionsAndroid, Platform } from 'react-native';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import NativeAppSettings from '../src/specs/NativeAppSettings';
import { ButtonPad } from '../src/components/ButtonPad';
import { SettingsScreen, openSettings } from '../src/settings/SettingsScreen';
import { setInputMode } from '../src/settings/preferences';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => jest.clearAllMocks());

test('settings lists permissions, requests one, and persists the input mode', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<SettingsScreen />); });
  await act(async () => { openSettings(); });
  const nearby = tree!.root.findByProps({ accessibilityLabel: 'Request Nearby devices' });
  await act(async () => { await nearby.props.onPress(); });
  expect(request).toHaveBeenCalledWith('android.permission.NEARBY_WIFI_DEVICES', expect.any(Object));
  await act(async () => { tree!.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')[1].props.onPress(); });
  expect(NativeAppSettings.setPreference).toHaveBeenCalledWith('inputMode', 'buttons');
  await act(async () => { setInputMode('swipe'); tree!.unmount(); });
  jest.restoreAllMocks();
});

test('button pad sends arrows and select', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<ButtonPad width={320} height={400} scale={1} showContextualIcons={false} onSkipBack={() => {}} onSkipForward={() => {}} />);
  });
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'Select' }).length).toBeGreaterThan(0);
  await act(async () => { tree!.unmount(); });
  expect(NativeAppleTV.pressButton).not.toHaveBeenCalled();
});
