module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['android/**/build/**', 'node_modules/**'],
  overrides: [{ files: ['jest.setup*.js'], env: { jest: true } }],
};
