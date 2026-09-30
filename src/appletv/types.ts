/** Mirrors android/app/.../appletv/Bridging.kt -- keep both sides in sync by hand. */

export interface AppleTVDeviceInfo {
  id: string;
  name: string;
  address: string;
  port: number;
  model: string | null;
  identifier: string | null;
}

export type ConnectionState =
  | { state: 'disconnected' }
  | { state: 'connecting'; device: AppleTVDeviceInfo }
  | { state: 'connected'; device: AppleTVDeviceInfo; airplayPaired: boolean }
  | {
      state: 'failed';
      device: AppleTVDeviceInfo | null;
      reason: string;
      stalePairing: boolean;
      canWake: boolean;
    };

export type PlaybackState = 'unknown' | 'playing' | 'paused' | 'stopped' | 'interrupted' | 'seeking';

export interface PlaybackInfo {
  title: string | null;
  artist: string | null;
  album: string | null;
  appName: string | null;
  playbackState: PlaybackState;
  duration: number | null;
  elapsedTime: number | null;
}

export interface CapabilitiesInfo {
  play: boolean;
  pause: boolean;
  nextTrack: boolean;
  previousTrack: boolean;
  volume: boolean;
  skipForward: boolean;
  skipBackward: boolean;
}

export interface TextInputInfo {
  current: string | null;
  focused: boolean;
}

export interface AppInfo {
  name: string;
  bundleId: string;
}

export interface DiagnosticsSnapshot {
  connected: boolean;
  currentDeviceName: string | null;
  discoveredDeviceCount: number;
  reconnectCount: number;
  mrpConnected: boolean;
  touchEventsReceived: number;
  touchEventsSent: number;
  touchEventsCoalesced: number;
  /** From Media3PlaybackAdapter.kt -- the session is a projection of AppleTVController's state, not a second state machine. */
  media3Active: boolean;
  media3PlayWhenReady: boolean;
}

export type RemoteButton =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'MENU'
  | 'BACK'
  | 'SELECT'
  | 'HOME'
  | 'TV'
  | 'PLAY_PAUSE'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'SIRI'
  | 'SCREENSAVER'
  | 'SLEEP'
  | 'WAKE'
  | 'GUIDE'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'PAGE_UP'
  | 'PAGE_DOWN';
