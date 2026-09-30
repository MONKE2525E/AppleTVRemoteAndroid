import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Standalone fold/hinge info from androidx.window. Deliberately has no
 * dependency on AppleTVModule/AppleTVService in either direction.
 */
export interface Spec extends TurboModule {
  getCurrentFoldState(): Promise<Object>;

  addListener(eventName: string): void;
  removeListeners(count: CodegenTypes.Double): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FoldState');
