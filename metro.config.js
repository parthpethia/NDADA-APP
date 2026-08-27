const { withNativeWind } = require('nativewind/metro');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit max workers to avoid Windows child process spawning issues (jest-worker spawn UNKNOWN)
config.maxWorkers = 2;

// Exclude build & cache directories from file watching
config.resolver.blockList = [
  /.*[\/\\]\.gradle-user-home[\/\\].*/,
  /.*[\/\\]\.android-home[\/\\].*/,
  /.*[\/\\]\.export-test-android[\/\\].*/,
  /.*[\/\\]android[\/\\]app[\/\\]build[\/\\].*/,
  /.*[\/\\]android[\/\\]build[\/\\].*/,
];

const { resolve: metroResolver } = require('metro-resolver');

// Force Metro to resolve tslib to ES6 version ONLY on web to prevent __extends errors while maintaining native Android compatibility
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'tslib') {
    return {
      filePath: require.resolve('tslib/tslib.es6.js'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest && defaultResolveRequest !== config.resolver.resolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return metroResolver(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
