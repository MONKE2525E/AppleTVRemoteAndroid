import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Special-access status, app-settings shortcuts, and tiny persisted preferences. */
export interface Spec extends TurboModule {
  getAppInfo(): Promise<Object>;
  canInstallPackages(): Promise<boolean>;
  openInstallSettings(): void;
  openAppSettings(): void;
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppSettings');
