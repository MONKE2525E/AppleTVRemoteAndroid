// TurboModules backed by native code have nothing to bind to under Jest --
// use the manual mocks in src/specs/__mocks__ instead of the real specs.
jest.mock('./src/specs/NativeAppleTV');
jest.mock('./src/specs/NativeFoldState');
jest.mock('./src/specs/NativeHaptics');
jest.mock('./src/specs/NativeAppUpdates');
jest.mock('./src/specs/NativeAppSettings');
