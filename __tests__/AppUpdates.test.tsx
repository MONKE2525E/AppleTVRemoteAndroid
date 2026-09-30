import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppUpdates, openAppUpdates } from '../src/updates/AppUpdates';
import NativeAppUpdates from '../src/specs/NativeAppUpdates';

const check = jest.spyOn(NativeAppUpdates, 'checkForUpdate');
const install = jest.spyOn(NativeAppUpdates, 'installUpdate');
afterEach(() => jest.clearAllMocks());

test('opens automatically for a newer release and installs its version', async () => {
  check.mockResolvedValue({ available: true, installedVersion: '1.0', versionName: '1.1.0', versionCode: 2, size: 80000000 });
  install.mockResolvedValue(undefined);
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<AppUpdates />); });
  const button = tree!.root.findByProps({ accessibilityLabel: 'Install update' });
  await act(async () => { await button.props.onPress(); });
  expect(install).toHaveBeenCalledWith(2);
  await act(async () => tree!.unmount());
});

test('manual check shows network errors and can retry', async () => {
  check.mockResolvedValueOnce({ available: false, installedVersion: '1.1.0' });
  let tree: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<AppUpdates />); });
  check.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => { openAppUpdates(); });
  expect(tree!.root.findAllByProps({ accessibilityRole: 'alert' })[0].props.children).toBe('Offline');
  check.mockResolvedValueOnce({ available: false, installedVersion: '1.1.0' });
  await act(async () => { openAppUpdates(); });
  expect(tree!.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
  await act(async () => tree!.unmount());
});
