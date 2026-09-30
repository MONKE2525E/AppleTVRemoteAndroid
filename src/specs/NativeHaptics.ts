import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Tiny native call for control press-state haptics -- deliberately not an added dependency. */
export interface Spec extends TurboModule {
  impact(style: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Haptics');
