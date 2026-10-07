import { DEV_FAKE_UI } from './devFakeUi';
import type {
  AppInfo,
  AppleTVDeviceInfo,
  CapabilitiesInfo,
  ConnectionState,
  PlaybackInfo,
  TextInputInfo,
} from './types';

export interface AppleTVState {
  devices: AppleTVDeviceInfo[];
  discovered: AppleTVDeviceInfo[];
  connection: ConnectionState;
  playback: PlaybackInfo | null;
  artworkBase64: string | null;
  capabilities: CapabilitiesInfo | null;
  textInput: TextInputInfo;
  apps: AppInfo[];
}

// TEMP DEV-ONLY: fake connected state for a visual sanity-check on an
// emulator that can't reach a real Apple TV. Revert before shipping --
// search for "TEMP DEV-ONLY" / "DEV_FAKE_UI" to find every spot this touches.
const FAKE_DEVICE: AppleTVDeviceInfo = {
  id: 'fake-1',
  name: 'Living Room',
  address: '192.168.0.50',
  port: 7000,
  model: 'AppleTV6,2',
  identifier: null,
};

/** TEMP DEV-ONLY: app drawer contents for the fake device. */
export const FAKE_APPS: AppInfo[] = [
  { name: 'TV', bundleId: 'com.apple.TVWatchList' },
  { name: 'Netflix', bundleId: 'com.netflix.Netflix' },
  { name: 'YouTube', bundleId: 'com.google.ios.youtube' },
  { name: 'Disney+', bundleId: 'com.disney.disneyplus' },
  { name: 'Music', bundleId: 'com.apple.TVMusic' },
  { name: 'Prime Video', bundleId: 'com.amazon.aiv.AIVApp' },
  { name: 'Plex', bundleId: 'com.plexapp.plex' },
  { name: 'Photos', bundleId: 'com.apple.TVPhotos' },
  { name: 'Max', bundleId: 'com.wbd.stream' },
  { name: 'Spotify', bundleId: 'com.spotify.client' },
  { name: 'App Store', bundleId: 'com.apple.TVAppStore' },
  { name: 'Settings', bundleId: 'com.apple.TVSettings' },
];

/** Extra TVs the fake add-flow can discover. */
export const FAKE_DISCOVERY_CATALOG: AppleTVDeviceInfo[] = [
  { id: 'fake-2', name: 'Bedroom', address: '192.168.0.51', port: 7000, model: 'AppleTV6,2', identifier: null },
  { id: 'fake-3', name: 'Kitchen', address: '192.168.0.52', port: 7000, model: 'AppleTV14,1', identifier: null },
];

const emptyState: AppleTVState = {
  devices: [],
  discovered: [],
  connection: { state: 'disconnected' },
  playback: null,
  artworkBase64: null,
  capabilities: null,
  textInput: { current: null, focused: false },
  apps: [],
};

const fakeState: AppleTVState = {
  devices: [FAKE_DEVICE],
  discovered: [],
  connection: { state: 'connected', device: FAKE_DEVICE, airplayPaired: true },
  playback: {
    title: 'Severance',
    artist: null,
    album: null,
    appName: 'Apple TV',
    playbackState: 'playing',
    duration: 3120,
    elapsedTime: 812,
  },
  artworkBase64: null,
  capabilities: {
    play: true,
    pause: true,
    nextTrack: true,
    previousTrack: true,
    volume: true,
    skipForward: true,
    skipBackward: true,
  },
  textInput: { current: null, focused: false },
  apps: [],
};

const initialState: AppleTVState = DEV_FAKE_UI ? fakeState : emptyState;

type Listener = () => void;

/**
 * Deliberately not Redux: this is a single flat external store fed by native
 * events, exposed to components via useSyncExternalStore (see useAppleTV.ts)
 * so raw bridge payloads never get copied into React state/context directly.
 */
class AppleTVStore {
  private state: AppleTVState = initialState;
  private listeners = new Set<Listener>();

  getSnapshot = (): AppleTVState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<AppleTVState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  setDevices(devices: AppleTVDeviceInfo[]) { this.set({ devices }); }
  setDiscovered(discovered: AppleTVDeviceInfo[]) { this.set({ discovered }); }
  setConnection(connection: ConnectionState) {
    if (connection.state === 'connected') {
      const devices = this.state.devices.some(d => d.id === connection.device.id)
        ? this.state.devices
        : [...this.state.devices, connection.device];
      const previous = this.state.connection.state === 'connected' ? this.state.connection.device.id : null;
      // App lists are per-TV; never show the last device's apps for a new one.
      const apps = previous === connection.device.id ? this.state.apps : [];
      this.set({ connection, devices, apps });
      return;
    }
    this.set({ connection });
  }
  setPlayback(playback: PlaybackInfo | null) { this.set({ playback }); }
  setArtwork(artworkBase64: string | null) { this.set({ artworkBase64 }); }
  setCapabilities(capabilities: CapabilitiesInfo) { this.set({ capabilities }); }
  setTextInput(textInput: TextInputInfo) { this.set({ textInput }); }
  setApps(apps: AppInfo[]) { this.set({ apps }); }

  /** TEMP DEV-ONLY: flip fake now-playing so the contextual icon row can be verified. */
  toggleFakePlayback() {
    if (!DEV_FAKE_UI) return;
    const current = this.state.playback;
    const playing = current?.playbackState === 'playing';
    this.set({
      playback: playing
        ? null
        : {
            title: 'Severance',
            artist: null,
            album: null,
            appName: 'Apple TV',
            playbackState: 'playing',
            duration: 3120,
            elapsedTime: 812,
          },
    });
  }

  addPairedDevice(device: AppleTVDeviceInfo) {
    const devices = this.state.devices.some(d => d.id === device.id)
      ? this.state.devices
      : [...this.state.devices, device];
    this.set({
      devices,
      connection: { state: 'connected', device, airplayPaired: true },
    });
  }

  removePairedDevice(deviceId: string) {
    const devices = this.state.devices.filter(d => d.id !== deviceId);
    const current = this.state.connection.state === 'connected' ? this.state.connection.device : null;
    if (current?.id === deviceId) {
      const next = devices[0];
      this.set({
        devices,
        connection: next
          ? { state: 'connected', device: next, airplayPaired: true }
          : { state: 'disconnected' },
        playback: next ? this.state.playback : null,
        apps: [],
      });
      return;
    }
    this.set({ devices });
  }
}

export const appleTVStore = new AppleTVStore();
