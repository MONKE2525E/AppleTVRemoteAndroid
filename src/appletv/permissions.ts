import { PermissionsAndroid, Platform } from 'react-native';

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
