const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { createPostHogMetroSerializer } = require('posthog-react-native/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  serializer: {
    customSerializer: createPostHogMetroSerializer(),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
