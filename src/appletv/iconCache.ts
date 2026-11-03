import { Image } from 'react-native';
import { readJson, writeJson } from './persist';
import { clearArtworkCache, isRokuDevice, lookupAppleArtwork, rokuIconUri } from './appIcons';
import { systemAppIcon } from './systemAppIcons';
import type { AppInfo, AppleTVDeviceInfo } from './types';

/**
 * Persistent caches that make the app drawer open instantly with icons already
 * drawn, on every launch and not just the first:
 *
 *  - the last app list per TV (stale-while-revalidate: shown at once, refreshed
 *    from the TV in the background),
 *  - App Store artwork URLs per bundle id (see appIcons.ts, which persists its
 *    lookups through readJson/writeJson below),
 *  - the image bytes themselves, warmed into the native image disk cache with
 *    Image.prefetch as soon as a TV connects rather than when the drawer opens.
 */

const APP_LIST_PREFIX = 'appList.v1:';
/** Don't let one chatty TV fill preference storage. */
const MAX_APPS_PER_DEVICE = 300;
const PREFETCH_CONCURRENCY = 4;

const prefetched = new Set<string>();

function isAppInfo(value: unknown): value is AppInfo {
  const app = value as AppInfo | null;
  return typeof app?.name === 'string' && typeof app.bundleId === 'string';
}

export async function loadCachedApps(deviceId: string): Promise<AppInfo[]> {
  const stored = await readJson<unknown>(APP_LIST_PREFIX + deviceId);
  return Array.isArray(stored) ? stored.filter(isAppInfo) : [];
}

export function saveCachedApps(deviceId: string, apps: AppInfo[]): void {
  if (apps.length === 0) return;
  writeJson(APP_LIST_PREFIX + deviceId, apps.slice(0, MAX_APPS_PER_DEVICE));
}

/** Warms the native disk cache for a list of remote image URLs, a few at a time, never rejecting. */
export async function prefetchImages(uris: string[]): Promise<void> {
  const queue = uris.filter(uri => uri && !prefetched.has(uri));
  queue.forEach(uri => prefetched.add(uri));
  const worker = async () => {
    for (let uri = queue.shift(); uri !== undefined; uri = queue.shift()) {
      try {
        await Image.prefetch(uri);
      } catch {
        prefetched.delete(uri); // Allow a retry on the next warm-up.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, worker));
}

/** Resolves every icon this TV's apps will need and pulls the pixels into cache. */
export async function warmAppIcons(device: AppleTVDeviceInfo, apps: AppInfo[]): Promise<void> {
  if (apps.length === 0) return;
  if (isRokuDevice(device)) {
    await prefetchImages(apps.map(app => rokuIconUri(device, app.bundleId)));
    return;
  }
  // Bundled system icons are resolved by the bundler; only remote art needs fetching.
  const remote = apps.filter(app => !systemAppIcon(app.bundleId)).map(app => app.bundleId);
  const artwork = await lookupAppleArtwork(remote);
  await prefetchImages(Object.values(artwork));
}

/** Drops the saved app lists and artwork lookups. Image bytes stay in the system image cache until it evicts them. */
export function clearAppCaches(deviceIds: string[]): void {
  deviceIds.forEach(id => writeJson(APP_LIST_PREFIX + id, []));
  prefetched.clear();
  clearArtworkCache();
}
