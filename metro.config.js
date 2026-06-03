const { withNativeWind } = require('nativewind/metro');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro to resolve tslib to the ES6 version to prevent __extends of undefined error on web
const ALIASES = {
  tslib: 'tslib/tslib.es6.js',
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  return context.resolveRequest(
    context,
    ALIASES[moduleName] ?? moduleName,
    platform
  );
};

module.exports = withNativeWind(config, { input: './global.css' });

