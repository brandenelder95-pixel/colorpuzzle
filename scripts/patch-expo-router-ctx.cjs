#!/usr/bin/env node
/**
 * Patches expo-router/_ctx.android.js (and the other platform variants) to use
 * a hardcoded relative path instead of `process.env.EXPO_ROUTER_APP_ROOT`.
 *
 * Metro's collect_dependencies module requires the first argument of
 * require.context() to be a static string literal.  babel-preset-expo is
 * supposed to inline the env-var, but in our pnpm monorepo build the Babel
 * caller options don't reach the transform worker in time.  This patch
 * side-steps the issue entirely by baking in the correct path at install time.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const appDir = path.resolve(repoRoot, 'artifacts/color-sort/app');

// expo-router may be hoisted to the root or live in the workspace node_modules.
const candidates = [
  path.resolve(repoRoot, 'node_modules/expo-router'),
  path.resolve(repoRoot, 'artifacts/color-sort/node_modules/expo-router'),
];

const ctxFiles = ['_ctx.android.js', '_ctx.ios.js', '_ctx.js'];

let patched = 0;

for (const expoRouterDir of candidates) {
  if (!fs.existsSync(expoRouterDir)) continue;

  // Relative path from the _ctx file's directory to the app/ directory.
  const rel = path
    .relative(expoRouterDir, appDir)
    .split(path.sep)
    .join('/'); // always use forward slashes

  console.log(`[patch] expo-router at ${expoRouterDir}`);
  console.log(`[patch] app/ relative path: "${rel}"`);

  for (const file of ctxFiles) {
    const filePath = path.join(expoRouterDir, file);
    if (!fs.existsSync(filePath)) continue;

    let src = fs.readFileSync(filePath, 'utf8');
    const before = src;

    // Replace the env-var reference with the static string.
    src = src
      .replace(/process\.env\.EXPO_ROUTER_APP_ROOT/g, JSON.stringify(rel))
      // Also handle EXPO_ROUTER_IMPORT_MODE – must be a string for require.context arg 4.
      .replace(/process\.env\.EXPO_ROUTER_IMPORT_MODE/g, '"sync"');

    if (src !== before) {
      fs.writeFileSync(filePath, src, 'utf8');
      console.log(`[patch] Patched ${filePath}`);
      patched++;
    } else {
      console.log(`[patch] Already patched or no match: ${filePath}`);
    }
  }
}

if (patched === 0) {
  console.log('[patch] No files were patched (already patched or not found).');
} else {
  console.log(`[patch] Done. ${patched} file(s) patched.`);
}
