/**
 * Private Apple TV Remote
 *
 * @format
 */

import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppUpdates } from './src/updates/AppUpdates';
import { RemoteScreen } from './src/remote/RemoteScreen';

function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <RemoteScreen />
        <AppUpdates />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
