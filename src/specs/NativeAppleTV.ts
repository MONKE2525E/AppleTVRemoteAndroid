import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Command/event facade only. Implementations must never own protocol/session
 * lifetime themselves — see android/app/.../appletv/AppleTVModule.kt, which
 * forwards everything to the persistent AppleTVService.
 *
 * Structured payloads (devices, capabilities, now-playing, diagnostics) are
 * intentionally untyped `Object` here and given precise shapes on the JS side
 * in src/appletv/types.ts, rather than modeled in codegen — keeps this spec
 * stable while the domain payloads evolve.
 */
export interface Spec extends TurboModule {
  // --- discovery ---
  startDiscovery(): void;
  stopDiscovery(): void;

  // --- pairing (Companion Link) ---
  startPairing(deviceId: string): Promise<void>;
  submitPin(deviceId: string, pin: string): Promise<boolean>;
  cancelPairing(deviceId: string): void;

  // --- pairing (AirPlay; required for MRP now-playing metadata) ---
  startAirPlayPairing(deviceId: string): Promise<void>;
  submitAirPlayPin(deviceId: string, pin: string): Promise<boolean>;

  // --- connection ---
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  forgetDevice(deviceId: string): Promise<void>;

  // --- power / volume ---
  sleep(): Promise<void>;
  wake(deviceId: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setVolume(level: CodegenTypes.Double): Promise<void>;

  // --- navigation / transport ---
  pressButton(name: string): Promise<void>;
  holdButton(name: string): Promise<void>;
  playPause(): Promise<void>;
  skipBy(seconds: CodegenTypes.Double): Promise<void>;
  seekTo(seconds: CodegenTypes.Double): Promise<void>;

  // --- touch surface (fire-and-forget, high frequency) ---
  touchStart(x: CodegenTypes.Double, y: CodegenTypes.Double): void;
  touchMove(x: CodegenTypes.Double, y: CodegenTypes.Double): void;
  touchEnd(x: CodegenTypes.Double, y: CodegenTypes.Double): void;

  // --- text input / apps ---
  sendText(text: string, clearPrevious: boolean): Promise<void>;
  loadApps(): Promise<void>;
  launchApp(bundleId: string): Promise<void>;

  // --- diagnostics (dev-only screen, see src/diagnostics) ---
  getDiagnosticsSnapshot(): Promise<Object>;

  // --- NativeEventEmitter plumbing ---
  addListener(eventName: string): void;
  removeListeners(count: CodegenTypes.Double): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppleTV');
