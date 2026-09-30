import { NativeEventEmitter } from 'react-native';
import NativeAppleTV from '../specs/NativeAppleTV';
import { DEV_FAKE_UI } from './devFakeUi';
import { appleTVStore } from './store';
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
    appleTVStore.setApps((payload as { apps: AppInfo[] }).apps);
  });
}

/** Swallow native rejections so a missing TV / unbound service never redboxes the remote UI. */
function soft(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => undefined,
    () => undefined,
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
    return soft(NativeAppleTV.disconnect());
  },
  forgetDevice: (deviceId: string) => {
    appleTVStore.removePairedDevice(deviceId);
    if (DEV_FAKE_UI) return Promise.resolve();
    return soft(NativeAppleTV.forgetDevice(deviceId));
  },

  sleep: () => soft(NativeAppleTV.sleep()),
  wake: (deviceId: string) => soft(NativeAppleTV.wake(deviceId)),
  setMuted: (muted: boolean) => soft(NativeAppleTV.setMuted(muted)),
  setVolume: (level: number) => soft(NativeAppleTV.setVolume(level)),

  pressButton: (name: RemoteButton) => soft(NativeAppleTV.pressButton(name)),
  holdButton: (name: RemoteButton) => soft(NativeAppleTV.holdButton(name)),
  playPause: () => {
    if (DEV_FAKE_UI) {
      appleTVStore.toggleFakePlayback();
      return Promise.resolve();
    }
    return soft(NativeAppleTV.playPause());
  },
  skipBy: (seconds: number) => soft(NativeAppleTV.skipBy(seconds)),
  seekTo: (seconds: number) => soft(NativeAppleTV.seekTo(seconds)),

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

  sendText: (text: string, clearPrevious: boolean) => soft(NativeAppleTV.sendText(text, clearPrevious)),
  loadApps: () => soft(NativeAppleTV.loadApps()),
  launchApp: (bundleId: string) => soft(NativeAppleTV.launchApp(bundleId)),

  getDiagnosticsSnapshot: () =>
    NativeAppleTV.getDiagnosticsSnapshot() as Promise<DiagnosticsSnapshot>,
};
