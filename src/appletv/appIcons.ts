import NativeAppSettings from '../specs/NativeAppSettings';
import type { AppleTVDeviceInfo } from './types';

export const isRokuDevice = (device: AppleTVDeviceInfo) => device.model?.startsWith('Roku ') === true;

/** Roku serves each channel's artwork over ECP, so the icon is just a URL on the TV itself. */
export function rokuIconUri(device: AppleTVDeviceInfo, appId: string): string {
  return `http://${device.address}:8060/query/icon/${encodeURIComponent(appId)}`;
}

// Companion Link only reports bundle ids and names. The App Store lookup API
// resolves third-party bundle ids to their tvOS (or iOS) artwork; Apple's
// built-in apps use bundled artwork from systemAppIcons instead. Lookups are
// per storefront, and regional apps (CBC Gem, Crave, Canadian Paramount+) only
// exist in their own country's store, so the phone's country is tried first.
const artworkCache = new Map<string, string | null>();
const LOOKUP = 'https://itunes.apple.com/lookup';

/** Storefronts to search: the phone's countries first, then the US store as the widest catalog. */
export async function storefronts(): Promise<string[]> {
  let codes: string[] = [];
  try {
    codes = await NativeAppSettings.getCountryCodes();
  } catch {
    // Fall through to the US store.
  }
  return [...new Set([...codes.map(code => code.toLowerCase()), 'us'])];
}

async function lookup(bundleIds: string[], country: string, entity?: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (bundleIds.length === 0) return found;
  const params = `bundleId=${bundleIds.map(encodeURIComponent).join(',')}&country=${country}${entity ? `&entity=${entity}` : ''}`;
  const response = await fetch(`${LOOKUP}?${params}`);
  if (!response.ok) return found;
  const body = (await response.json()) as { results?: { bundleId?: string; artworkUrl512?: string }[] };
  for (const result of body.results ?? []) {
    if (result.bundleId && result.artworkUrl512) found.set(result.bundleId, result.artworkUrl512);
  }
  return found;
}

/** Resolves App Store artwork for Apple TV bundle ids, cached for the session. Never rejects. */
export async function lookupAppleArtwork(bundleIds: string[]): Promise<Record<string, string>> {
  const pending = bundleIds.filter(id => !id.startsWith('com.apple.') && !artworkCache.has(id));
  if (pending.length > 0) {
    try {
      const found = new Map<string, string>();
      for (const country of await storefronts()) {
        for (const entity of ['tvSoftware', undefined]) {
          const missing = pending.filter(id => !found.has(id));
          for (const [id, uri] of await lookup(missing, country, entity)) found.set(id, uri);
        }
      }
      for (const id of pending) artworkCache.set(id, found.get(id) ?? null);
    } catch {
      // Offline or blocked: leave uncached so the next drawer open retries.
    }
  }
  const resolved: Record<string, string> = {};
  for (const id of bundleIds) {
    const uri = artworkCache.get(id);
    if (uri) resolved[id] = uri;
  }
  return resolved;
}
