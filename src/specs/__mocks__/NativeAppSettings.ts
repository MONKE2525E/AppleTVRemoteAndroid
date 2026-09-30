export default {
  getAppInfo: jest.fn(async () => ({ version: '1.2.0', build: '3', namespace: 'com.privateremote.appletv' })),
  canInstallPackages: jest.fn(async () => false),
  openInstallSettings: jest.fn(),
  openAppSettings: jest.fn(),
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(),
};
