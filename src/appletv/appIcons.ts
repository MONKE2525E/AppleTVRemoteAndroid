import NativeAppSettings from '../specs/NativeAppSettings';
import type { AppleTVDeviceInfo } from './types';
import { readJson, writeJson } from './persist';

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
  if (!response.ok) throw new Error(`App Store lookup failed with HTTP ${response.status}`);
  const body = (await response.json()) as { results?: { bundleId?: string; artworkUrl512?: string }[] };
  for (const result of body.results ?? []) {
    if (result.bundleId && result.artworkUrl512) found.set(result.bundleId, result.artworkUrl512);
  }
  return found;
}

// Lookups also persist across launches. Found art rarely changes, so it lives
// a month; "not in any store" answers expire sooner in case an app is added.
const STORE_KEY = 'iconArtwork.v1';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 12 * 60 * 60 * 1000;
type StoredEntry = { u: string | null; t: number };
const persisted = new Map<string, StoredEntry>();
let hydrated: Promise<void> | undefined;
/** Bumped by clearArtworkCache so a lookup or hydration already in flight cannot repopulate the cleared cache. */
let epoch = 0;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

const isExpired = (entry: StoredEntry, now: number) =>
  typeof entry.t !== 'number' || now - entry.t > (entry.u ? HIT_TTL_MS : MISS_TTL_MS);

function hydrate(): Promise<void> {
  const startedAt = epoch;
  hydrated ??= readJson<Record<string, StoredEntry>>(STORE_KEY).then(stored => {
    if (epoch !== startedAt) return;
    const now = Date.now();
    for (const [id, entry] of Object.entries(stored ?? {})) {
      if (isExpired(entry, now)) continue;
      persisted.set(id, entry);
      if (!artworkCache.has(id)) artworkCache.set(id, entry.u);
    }
  });
  return hydrated;
}

function remember(id: string, uri: string | null) {
  artworkCache.set(id, uri);
  persisted.set(id, { u: uri, t: Date.now() });
  persistTimer ??= setTimeout(() => {
    persistTimer = undefined;
    writeJson(STORE_KEY, Object.fromEntries(persisted));
  }, 500);
}

/** Resolves App Store artwork for Apple TV bundle ids, cached in memory and on disk. Never rejects. */
export async function lookupAppleArtwork(bundleIds: string[]): Promise<Record<string, string>> {
  const startedAt = epoch;
  await hydrate();
  // Entries loaded earlier in this process age out too, not only the ones read from disk.
  const now = Date.now();
  for (const id of bundleIds) {
    const entry = persisted.get(id);
    if (entry && isExpired(entry, now)) {
      persisted.delete(id);
      artworkCache.delete(id);
    }
  }
  const pending = bundleIds.filter(id => !id.startsWith('com.apple.') && !artworkCache.has(id));
  if (pending.length > 0) {
    const found = new Map<string, string>();
    let lookupFailed = false;
    for (const country of await storefronts()) {
      for (const entity of ['tvSoftware', undefined]) {
        const missing = pending.filter(id => !found.has(id));
        try {
          for (const [id, uri] of await lookup(missing, country, entity)) found.set(id, uri);
        } catch {
          lookupFailed = true;
        }
      }
    }
    if (epoch === startedAt) {
      found.forEach((uri, id) => remember(id, uri));
      if (!lookupFailed) pending.forEach(id => { if (!found.has(id)) remember(id, null); });
    }
    const resolved: Record<string, string> = {};
    for (const id of bundleIds) {
      const uri = found.get(id) ?? artworkCache.get(id);
      if (uri) resolved[id] = uri;
    }
    return resolved;
  }
  const resolved: Record<string, string> = {};
  for (const id of bundleIds) {
    const uri = artworkCache.get(id);
    if (uri) resolved[id] = uri;
  }
  return resolved;
}

/** Forgets every stored artwork lookup, in memory and on disk, so the next drawer open resolves them again. */
export function clearArtworkCache(): void {
  epoch += 1;
  artworkCache.clear();
  persisted.clear();
  hydrated = Promise.resolve();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  writeJson(STORE_KEY, {});
}
