export default {
  canInstallPackages: jest.fn(async () => false),
  openInstallSettings: jest.fn(),
  openAppSettings: jest.fn(),
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(),
};
