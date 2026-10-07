import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import NativeAppSettings from '../specs/NativeAppSettings';
import { getPermissionStatus, requestPermission } from './permissions';
import { useAppleTV } from './useAppleTV';

/** Ask once, when playback first needs an activity, rather than during discovery. */
export function PlaybackActivityPermission() {
  const { playback } = useAppleTV();
  const playing = playback?.playbackState === 'playing';
  useEffect(() => {
    if (!playing || Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
    let requesting = false;
    const request = async () => {
      if (requesting || AppState.currentState !== 'active') return;
      requesting = true;
      try {
        if (await getPermissionStatus('notifications') === 'granted') return;
        if (await NativeAppSettings.getPreference('playback_notification_requested') === 'true') return;
        NativeAppSettings.setPreference('playback_notification_requested', 'true');
        await requestPermission('notifications');
      } finally {
        requesting = false;
      }
    };
    void request().catch(() => {});
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void request().catch(() => {});
    });
    return () => subscription.remove();
  }, [playing]);
  return null;
}
