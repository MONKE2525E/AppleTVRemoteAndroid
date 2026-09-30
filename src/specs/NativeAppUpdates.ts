import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  checkForUpdate(): Promise<Object>;
  installUpdate(versionCode: CodegenTypes.Double): Promise<void>;
  openReleases(): void;
}
export default TurboModuleRegistry.getEnforcing<Spec>('AppUpdates');
