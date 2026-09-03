const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro can resolve cross-workspace deps
config.watchFolders = [workspaceRoot];

// Resolve modules: project-local first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Respect symlinks as-is (don't follow them to their real .pnpm path).
// Without this, Metro follows pnpm symlinks into the virtual store and
// relative imports like '../../App' resolve against the wrong base directory.
config.resolver.unstable_enableSymlinks = true;

// Force a single React/ReactDOM/RNWeb instance across the entire bundle.
//
// pnpm's virtual store can cause Metro to assign two different module IDs to
// the same logical package when some requires are resolved through the
// hoisted node_modules path and others through the .pnpm symlink path.
// Two module IDs = two React instances = "Invalid hook call" / null dispatcher.
//
// resolveRequest intercepts EVERY require() inside the bundle and redirects
// react/react-dom/react-native-web to a single canonical absolute path so
// Metro always produces one module ID for each.
const reactPath    = path.resolve(workspaceRoot, 'node_modules/react');
const reactDomPath = path.resolve(workspaceRoot, 'node_modules/react-dom');
const rnWebPath    = path.resolve(workspaceRoot, 'node_modules/react-native-web');

// Only alias bare package names — sub-path exports like react/jsx-runtime
// must be left to Metro's own resolver (it knows how to add extensions and
// resolve package.json "exports" fields; returning a directory path breaks it).
const REACT_ALIASES = {
  react:              path.resolve(reactPath,    'index.js'),
  'react-dom':        path.resolve(reactDomPath, 'index.js'),
  'react-native-web': path.resolve(rnWebPath,    'index.js'),
};

// Stub react-native-reanimated on web — we never import it in app code but
// it's a transitive peer dep that crashes on web due to missing Babel-injected
// globals (__reanimatedLoggerConfig). Redirect to a no-op stub instead.
const reanimatedStub = path.resolve(projectRoot, 'stubs/reanimated.web.js');

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (REACT_ALIASES[moduleName]) {
    return { filePath: REACT_ALIASES[moduleName], type: 'sourceFile' };
  }
  if (platform === 'web' && moduleName === 'react-native-reanimated') {
    return { filePath: reanimatedStub, type: 'sourceFile' };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Keep extraNodeModules as a belt-and-suspenders fallback.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react:              reactPath,
  'react-dom':        reactDomPath,
  'react-native-web': rnWebPath,
};

module.exports = config;
