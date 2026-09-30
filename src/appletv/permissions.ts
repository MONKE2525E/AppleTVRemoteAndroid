import { PermissionsAndroid, Platform } from 'react-native';
import NativeAppSettings from '../specs/NativeAppSettings';

/** Runtime grant required for NSD on Android 13+ (targetSdk 36). */
export async function requestDiscoveryPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;
  try {
    const result = await PermissionsAndroid.request(
      'android.permission.NEARBY_WIFI_DEVICES' as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS],
      {
        title: 'Find Apple TVs',
        message: 'Nearby Wi-Fi access is used to discover Apple TVs on your network.',
        buttonPositive: 'OK',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export type PermissionId = 'nearby' | 'notifications' | 'install';
export type PermissionStatus = 'granted' | 'denied' | 'notRequired';

type AndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

const RUNTIME: Record<'nearby' | 'notifications', { permission: AndroidPermission; title: string; message: string }> = {
  nearby: {
    permission: 'android.permission.NEARBY_WIFI_DEVICES' as AndroidPermission,
    title: 'Find Apple TVs',
    message: 'Nearby Wi-Fi access is used to discover Apple TVs on your network.',
  },
  notifications: {
    permission: 'android.permission.POST_NOTIFICATIONS' as AndroidPermission,
    title: 'Playback controls',
    message: 'Notifications show now-playing details and pause controls while connected.',
  },
};

/** NEARBY_WIFI_DEVICES and POST_NOTIFICATIONS only exist as runtime grants on Android 13+. */
function needsRuntimeGrant(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;
}

export async function getPermissionStatus(id: PermissionId): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'notRequired';
  if (id === 'install') return (await NativeAppSettings.canInstallPackages()) ? 'granted' : 'denied';
  if (!needsRuntimeGrant()) return 'notRequired';
  try {
    return (await PermissionsAndroid.check(RUNTIME[id].permission)) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Asks for the permission, or sends the user to the right system screen when
 * Android will no longer show a prompt (install access always; runtime grants
 * after "Don't ask again"). Re-read the status when the app returns.
 */
export async function requestPermission(id: PermissionId): Promise<PermissionStatus> {
  if (id === 'install') {
    NativeAppSettings.openInstallSettings();
    return getPermissionStatus(id);
  }
  if (!needsRuntimeGrant()) return 'notRequired';
  const { permission, title, message } = RUNTIME[id];
  try {
    const result = await PermissionsAndroid.request(permission, { title, message, buttonPositive: 'OK' });
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) NativeAppSettings.openAppSettings();
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function openAppPermissionSettings(): void {
  NativeAppSettings.openAppSettings();
}
