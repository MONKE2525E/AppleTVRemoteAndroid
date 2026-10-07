import { appleTVStore } from '../src/appletv/store';
import type { AppInfo, AppleTVDeviceInfo } from '../src/appletv/types';

const deviceA: AppleTVDeviceInfo = {
  id: 'tv-a',
  name: 'TV A',
  address: '192.168.0.10',
  port: 7000,
  model: 'AppleTV6,2',
  identifier: null,
};

const deviceB: AppleTVDeviceInfo = {
  id: 'tv-b',
  name: 'TV B',
  address: '192.168.0.11',
  port: 7000,
  model: 'AppleTV14,1',
  identifier: null,
};

const appA: AppInfo = { name: 'A Video', bundleId: 'tv.a.video' };
const appB: AppInfo = { name: 'B Music', bundleId: 'tv.b.music' };

beforeEach(() => {
  appleTVStore.setDevices([]);
  appleTVStore.setApps([]);
  appleTVStore.setConnection({ state: 'disconnected' });
});

test("a delayed app response from TV A cannot replace TV B's app list after a switch", async () => {
  expect(appleTVStore.setAppsForDevice(deviceA.id, [appA])).toBe(false);
  appleTVStore.setConnection({ state: 'connected', device: deviceA, airplayPaired: true });

  let resolveA!: (apps: AppInfo[]) => void;
  const responseA = new Promise<AppInfo[]>(resolve => {
    resolveA = resolve;
  });
  const deliverA = responseA.then(apps => appleTVStore.setAppsForDevice(deviceA.id, apps));

  appleTVStore.setConnection({ state: 'connecting', device: deviceB });
  expect(appleTVStore.setAppsForDevice(deviceA.id, [appA])).toBe(false);
  expect(appleTVStore.setAppsForDevice(deviceB.id, [appB])).toBe(false);
  appleTVStore.setConnection({ state: 'connected', device: deviceB, airplayPaired: true });
  expect(appleTVStore.setAppsForDevice(deviceB.id, [appB])).toBe(true);

  resolveA([appA]);
  expect(await deliverA).toBe(false);
  expect(appleTVStore.getSnapshot().apps).toEqual([appB]);
});

test('forgetting a failed target clears that failure while preserving other paired TVs', () => {
  appleTVStore.setDevices([deviceA, deviceB]);
  appleTVStore.setApps([appB]);
  appleTVStore.setConnection({
    state: 'failed',
    device: deviceB,
    reason: 'Connection timed out',
    stalePairing: false,
    canWake: true,
  });

  appleTVStore.removePairedDevice(deviceB.id);

  expect(appleTVStore.getSnapshot().connection).toEqual({ state: 'disconnected' });
  expect(appleTVStore.getSnapshot().devices).toEqual([deviceA]);
  expect(appleTVStore.getSnapshot().apps).toEqual([]);
});
