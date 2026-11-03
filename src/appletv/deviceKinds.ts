import { Airplay, Cast, Speaker, Tv, type LucideIcon } from 'lucide-react-native';
import type { AppleTVDeviceInfo, DeviceKind } from './types';

/** Older native builds send no `kind`; infer it from the model string so nothing regresses. */
export function deviceKind(device: AppleTVDeviceInfo): DeviceKind {
  if (device.kind) return device.kind;
  if (device.model?.startsWith('Roku ')) return 'roku';
  if (device.model?.startsWith('AudioAccessory')) return 'homepod';
  return 'apple_tv';
}

/** Whether the app can pair with and drive this device today. */
export function isControllable(device: AppleTVDeviceInfo): boolean {
  if (device.controllable !== undefined) return device.controllable;
  const kind = deviceKind(device);
  return kind === 'apple_tv' || kind === 'roku';
}

/** HomePods and AirPlay receivers connect over AirPlay 2 rather than Companion Link. */
export function isAirPlayTarget(device: AppleTVDeviceInfo): boolean {
  const kind = deviceKind(device);
  return kind === 'homepod' || kind === 'airplay';
}

const KIND_LABELS: Record<DeviceKind, string> = {
  apple_tv: 'Apple TV',
  roku: 'Roku',
  homepod: 'HomePod',
  airplay: 'AirPlay speaker',
  android_tv: 'Android TV or Chromecast',
};

export const kindLabel = (device: AppleTVDeviceInfo) => KIND_LABELS[deviceKind(device)];

const KIND_ICONS: Record<DeviceKind, LucideIcon> = {
  apple_tv: Tv,
  roku: Tv,
  homepod: Speaker,
  airplay: Airplay,
  android_tv: Cast,
};

export const kindIcon = (device: AppleTVDeviceInfo): LucideIcon => KIND_ICONS[deviceKind(device)];

/** Maps native transfer failures (see README "AirPlay targets") to a sentence a person can act on. */
export function transferErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'TRANSFER_UNSUPPORTED') return "Moving playback to another device isn't available yet.";
  if (code === 'UNKNOWN_TARGET') return "That device isn't available anymore. Try again in a moment.";
  if (code === 'TARGET_UNSUPPORTED') return "This app can't control that device yet.";
  if (code === 'TARGET_UID_UNAVAILABLE') return "That device didn't say how to route audio to it.";
  if (code === 'MRP_NOT_CONNECTED') return 'Turn on playback details for this device first (Settings).';
  if (code === 'ROUTING_TIMEOUT') return "The device didn't confirm the move. Check that it's on and nearby.";
  if (code === 'ROUTING_FAILED') return 'The device refused to take over playback.';
  return (error as Error | null)?.message || 'Could not move playback. Try again.';
}
