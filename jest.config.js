module.exports = {
  preset: '@react-native/jest-preset',
  transform: { '^.+\\.mjs$': 'babel-jest', '^.+\\.[jt]sx?$': 'babel-jest' },
  setupFiles: ['react-native-gesture-handler/jestSetup', '<rootDir>/jest.setup.local-mocks.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:react-native|@react-native|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-safe-area-context|react-native-svg|lucide-react-native)/)',
  ],
};
