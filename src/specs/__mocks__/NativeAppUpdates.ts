export default {
  checkForUpdate: jest.fn(async () => ({ available: false, installedVersion: '1.1.0' })),
  installUpdate: jest.fn(async () => {}),
  openReleases: jest.fn(),
};
