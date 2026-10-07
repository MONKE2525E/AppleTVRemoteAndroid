import { NativeEventEmitter } from 'react-native';
import { captureCommandError } from '../analytics/analytics';
import NativeAppleTV from '../specs/NativeAppleTV';
import { DEV_FAKE_UI } from './devFakeUi';
import { FAKE_APPS, appleTVStore } from './store';
import type {
  AppInfo,
  AppleTVDeviceInfo,
  CapabilitiesInfo,
  ConnectionState,
  DiagnosticsSnapshot,
  PlaybackInfo,
  RemoteButton,
  TextInputInfo,
} from './types';

// NativeEventEmitter's TS signature wants an object shaped like RN's internal
// (unexported) NativeModule type; our codegen'd TurboModule satisfies it
// structurally (addListener/removeListeners) but isn't declared as one.
const emitter = new NativeEventEmitter(NativeAppleTV as never);

// TEMP DEV-ONLY: native AppleTVService events must not clobber the painted
// fake connected/playback state used for emulator UI work.
if (!DEV_FAKE_UI) {
  emitter.addListener('commandError', (payload: Object) => {
    const error = payload as { operation: string; code: string };
    captureCommandError(error.operation, error);
  });
  emitter.addListener('devicesChanged', (payload: Object) => {
    appleTVStore.setDiscovered((payload as { devices: AppleTVDeviceInfo[] }).devices);
  });
  emitter.addListener('connectionChanged', (payload: Object) => {
    appleTVStore.setConnection(payload as ConnectionState);
  });
  emitter.addListener('playbackChanged', (payload: Object | null) => {
    appleTVStore.setPlayback(payload as PlaybackInfo | null);
  });
  emitter.addListener('artworkChanged', (payload: Object) => {
    appleTVStore.setArtwork((payload as { base64: string | null }).base64);
  });
  emitter.addListener('capabilitiesChanged', (payload: Object) => {
    appleTVStore.setCapabilities(payload as CapabilitiesInfo);
  });
  emitter.addListener('textInputRequested', (payload: Object) => {
    appleTVStore.setTextInput(payload as TextInputInfo);
  });
  emitter.addListener('appsChanged', (payload: Object) => {
    const { deviceId, apps } = payload as { deviceId: string; apps: AppInfo[] };
    appleTVStore.setAppsForDevice(deviceId, apps);
  });
}

/** Swallow native rejections so a missing TV / unbound service never redboxes the remote UI. */
function soft(promise: Promise<unknown>, operation = 'remote'): Promise<void> {
  return promise.then(
    () => undefined,
    error => { captureCommandError(operation, error); },
  );
}

/** Thin typed wrapper over the native command surface -- see src/specs/NativeAppleTV.ts. */
export const appleTV = {
  startDiscovery: () => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.startDiscovery();
  },
  stopDiscovery: () => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.stopDiscovery();
  },

  startPairing: (deviceId: string) => {
    if (DEV_FAKE_UI) return Promise.resolve();
    return NativeAppleTV.startPairing(deviceId).then(() => undefined);
  },
  submitPin: (deviceId: string, pin: string) => {
    if (DEV_FAKE_UI) {
      return pin.length === 4
        ? Promise.resolve()
        : Promise.reject(new Error('Enter the 4-digit code'));
    }
    return NativeAppleTV.submitPin(deviceId, pin).then(() => undefined);
  },
  cancelPairing: (deviceId: string) => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.cancelPairing(deviceId);
  },

  startAirPlayPairing: (deviceId: string) => NativeAppleTV.startAirPlayPairing(deviceId),
  submitAirPlayPin: (deviceId: string, pin: string) => NativeAppleTV.submitAirPlayPin(deviceId, pin),

  connect: (deviceId: string) => {
    if (DEV_FAKE_UI) {
      const device = appleTVStore.getSnapshot().devices.find(d => d.id === deviceId);
      if (device) {
        appleTVStore.setConnection({ state: 'connected', device, airplayPaired: true });
      }
      return Promise.resolve();
    }
    return NativeAppleTV.connect(deviceId).then(() => undefined);
  },
  disconnect: () => {
    if (DEV_FAKE_UI) {
      appleTVStore.setConnection({ state: 'disconnected' });
      return Promise.resolve();
    }
    return soft(NativeAppleTV.disconnect(), 'disconnect');
  },
  forgetDevice: (deviceId: string) => {
    appleTVStore.removePairedDevice(deviceId);
    if (DEV_FAKE_UI) return Promise.resolve();
    return soft(NativeAppleTV.forgetDevice(deviceId), 'forgetDevice');
  },

  sleep: () => soft(NativeAppleTV.sleep(), 'sleep'),
  wake: (deviceId: string) => soft(NativeAppleTV.wake(deviceId), 'wake'),
  setMuted: (muted: boolean) => soft(NativeAppleTV.setMuted(muted), 'setMuted'),
  setVolume: (level: number) => soft(NativeAppleTV.setVolume(level), 'setVolume'),

  pressButton: (name: RemoteButton) => soft(NativeAppleTV.pressButton(name), 'pressButton'),
  holdButton: (name: RemoteButton) => soft(NativeAppleTV.holdButton(name), 'holdButton'),
  playPause: () => {
    if (DEV_FAKE_UI) {
      appleTVStore.toggleFakePlayback();
      return Promise.resolve();
    }
    return soft(NativeAppleTV.playPause(), 'playPause');
  },
  skipBy: (seconds: number) => soft(NativeAppleTV.skipBy(seconds), 'skipBy'),
  seekTo: (seconds: number) => soft(NativeAppleTV.seekTo(seconds), 'seekTo'),

  touchStart: (x: number, y: number) => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.touchStart(x, y);
  },
  touchMove: (x: number, y: number) => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.touchMove(x, y);
  },
  touchEnd: (x: number, y: number) => {
    if (DEV_FAKE_UI) return;
    NativeAppleTV.touchEnd(x, y);
  },

  sendText: (text: string, clearPrevious: boolean) => soft(NativeAppleTV.sendText(text, clearPrevious), 'sendText'),
  /** Resolves false when the TV couldn't list its apps, so the drawer can offer a retry. */
  loadApps: (): Promise<boolean> => {
    if (DEV_FAKE_UI) {
      appleTVStore.setApps(FAKE_APPS);
      return Promise.resolve(true);
    }
    return NativeAppleTV.loadApps().then(
      () => true,
      error => {
        captureCommandError('loadApps', error);
        return false;
      },
    );
  },
  launchApp: (bundleId: string) => {
    if (DEV_FAKE_UI) return Promise.resolve();
    return soft(NativeAppleTV.launchApp(bundleId), 'launchApp');
  },

  getDiagnosticsSnapshot: () =>
    NativeAppleTV.getDiagnosticsSnapshot() as Promise<DiagnosticsSnapshot>,
};
