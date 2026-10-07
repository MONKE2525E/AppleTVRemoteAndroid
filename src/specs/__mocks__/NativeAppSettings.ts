export default {
  getAppInfo: jest.fn(async () => ({ version: '1.2.0', build: '3', namespace: 'com.privateremote.appletv' })),
  getCountryCodes: jest.fn(async () => [] as string[]),
  canInstallPackages: jest.fn(async () => false),
  openInstallSettings: jest.fn(),
  openAppSettings: jest.fn(),
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(),
};
