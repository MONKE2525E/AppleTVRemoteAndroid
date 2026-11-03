import { useEffect } from 'react';
import { appleTVStore } from './store';
import { loadCachedApps, saveCachedApps, warmAppIcons } from './iconCache';
import type { AppInfo, AppleTVDeviceInfo } from './types';

/**
 * Keeps the app drawer warm for the connected TV: seeds the app list from disk
 * (so the grid can draw before the TV answers), saves each fresh list, and
 * pulls every icon into the native image cache ahead of the first pull-up.
 */
export function useAppIconCache(device: AppleTVDeviceInfo | null, apps: AppInfo[]) {
  const deviceId = device?.id;

  useEffect(() => {
    if (!deviceId) return undefined;
    let cancelled = false;
    void loadCachedApps(deviceId).then(cached => {
      if (cancelled || cached.length === 0) return;
      // A live list from the TV always wins over the disk copy.
      if (appleTVStore.getSnapshot().apps.length === 0) appleTVStore.setAppsForDevice(deviceId, cached);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    if (!device || apps.length === 0) return;
    saveCachedApps(device.id, apps);
    void warmAppIcons(device, apps);
    // `device` identity can change on every connection event; its address is what icon URLs depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, device?.address, apps]);
}
