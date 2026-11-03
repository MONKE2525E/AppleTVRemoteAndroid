import Renderer, { act } from 'react-test-renderer';
import { deviceKind, isAirPlayTarget, isControllable, transferErrorMessage } from '../src/appletv/deviceKinds';
import { loadCachedApps, saveCachedApps } from '../src/appletv/iconCache';
import { appleTV } from '../src/appletv/client';
import { appleTVStore } from '../src/appletv/store';
import type { AppleTVDeviceInfo } from '../src/appletv/types';
import { OtherDevices } from '../src/components/OtherDevices';
import { TransferSheet } from '../src/components/TransferSheet';
import NativeAppSettings from '../src/specs/NativeAppSettings';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

const base = { address: '10.0.0.2', port: 7000, model: null, identifier: null };
const tv: AppleTVDeviceInfo = { ...base, id: 'tv', name: 'Living Room', model: 'AppleTV14,1' };
const homepod: AppleTVDeviceInfo = { ...base, id: 'hp', name: 'Kitchen HomePod', model: 'AudioAccessory5,1', kind: 'homepod', controllable: false };

afterEach(() => jest.restoreAllMocks());

test('device kind falls back to the model for older native builds', () => {
  expect(deviceKind({ ...base, id: 'a', name: 'a', model: 'Roku Ultra' })).toBe('roku');
  expect(deviceKind({ ...base, id: 'b', name: 'b', model: 'AudioAccessory1,1' })).toBe('homepod');
  expect(isControllable(tv)).toBe(true);
  expect(isControllable(homepod)).toBe(false);
  expect(isAirPlayTarget(homepod)).toBe(true);
  expect(isAirPlayTarget(tv)).toBe(false);
});

test('transfer failures map to readable messages', () => {
  expect(transferErrorMessage({ code: 'TRANSFER_UNSUPPORTED' })).toMatch(/isn't available yet/);
  expect(transferErrorMessage({ code: 'UNKNOWN_TARGET' })).toMatch(/isn't available anymore/);
  expect(transferErrorMessage({ code: 'ROUTING_TIMEOUT' })).toMatch(/didn't confirm/);
  expect(transferErrorMessage(new Error('boom'))).toBe('boom');
});

test('display-only devices are listed and marked as not supported', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<OtherDevices devices={[homepod]} />); });
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Kitchen HomePod');
  expect(json).toContain('Not supported yet');
  await act(async () => { tree.unmount(); });
});

test('the transfer sheet lists other devices and shows the native error inline', async () => {
  appleTVStore.setDevices([tv]);
  appleTVStore.setDiscovered([homepod]);
  appleTVStore.setConnection({ state: 'connected', device: tv, airplayPaired: true });
  const transfer = jest.spyOn(appleTV, 'transferPlayback').mockRejectedValue(Object.assign(new Error('x'), { code: 'TRANSFER_UNSUPPORTED' }));
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<TransferSheet visible onClose={jest.fn()} />); });
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Play on Living Room' })).toHaveLength(0);
  const row = tree.root.findAll(n => n.props.accessibilityLabel === 'Play on Kitchen HomePod' && typeof n.props.onPress === 'function')[0];
  await act(async () => { await row.props.onPress(); });
  expect(transfer).toHaveBeenCalledWith('hp');
  expect(JSON.stringify(tree.toJSON())).toContain("Moving playback to another device isn't available yet.");
  await act(async () => { tree.unmount(); });
  appleTVStore.setDevices([]);
  appleTVStore.setDiscovered([]);
  appleTVStore.setConnection({ state: 'disconnected' });
});

test('the app list for a TV round-trips through persistent storage', async () => {
  const apps = [{ name: 'Netflix', bundleId: 'com.netflix.Netflix' }];
  saveCachedApps('tv', apps);
  expect(NativeAppSettings.setPreference).toHaveBeenCalledWith('appList.v1:tv', JSON.stringify(apps));
  jest.mocked(NativeAppSettings.getPreference).mockResolvedValueOnce(JSON.stringify([...apps, { bad: true }]));
  expect(await loadCachedApps('tv')).toEqual(apps);
  saveCachedApps('empty', []);
  expect(NativeAppSettings.setPreference).not.toHaveBeenCalledWith('appList.v1:empty', expect.anything());
});

describe('App Store artwork cache', () => {
  const okResponse = (bundleId: string) => ({
    ok: true,
    json: async () => ({ results: [{ bundleId, artworkUrl512: `https://art/${bundleId}.png` }] }),
  });

  const loadModule = () => {
    let mod!: typeof import('../src/appletv/appIcons');
    jest.isolateModules(() => { mod = require('../src/appletv/appIcons'); });
    return mod;
  };

  test('entries older than their lifetime are looked up again in the same session', async () => {
    const fetchMock = jest.fn(async () => okResponse('com.netflix.Netflix'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { lookupAppleArtwork } = loadModule();
    expect(await lookupAppleArtwork(['com.netflix.Netflix'])).toEqual({ 'com.netflix.Netflix': 'https://art/com.netflix.Netflix.png' });
    const calls = fetchMock.mock.calls.length;
    await lookupAppleArtwork(['com.netflix.Netflix']);
    expect(fetchMock.mock.calls.length).toBe(calls);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    await lookupAppleArtwork(['com.netflix.Netflix']);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  test('clearing while a lookup is in flight does not store its result', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = jest.fn(async () => { await gate; return okResponse('com.hulu.Hulu'); });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { lookupAppleArtwork, clearArtworkCache } = loadModule();
    const inFlight = lookupAppleArtwork(['com.hulu.Hulu']);
    await act(async () => { await Promise.resolve(); });
    clearArtworkCache();
    jest.mocked(NativeAppSettings.setPreference).mockClear();
    release();
    await inFlight;
    expect(NativeAppSettings.setPreference).not.toHaveBeenCalledWith('iconArtwork.v1', expect.stringContaining('com.hulu.Hulu'));
    const calls = fetchMock.mock.calls.length;
    await lookupAppleArtwork(['com.hulu.Hulu']);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });
});
