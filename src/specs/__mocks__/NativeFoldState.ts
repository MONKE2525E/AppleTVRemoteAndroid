export default {
  getCurrentFoldState: jest.fn(async () => ({
    posture: 'flat',
    bounds: null,
    orientation: 'none',
    isSeparating: false,
    occlusionType: 'none',
  })),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
