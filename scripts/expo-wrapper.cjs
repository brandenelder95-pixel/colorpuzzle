#!/usr/bin/env node
/**
 * EAS Build wrapper for the Expo CLI.
 *
 * Problem: EAS always looks for the generated android/ directory at the repo
 * root, but our Expo app lives in artifacts/color-sort/. Running
 * `expo prebuild` from inside that directory creates android/ there, so EAS
 * can't find it for credential injection or Gradle.
 *
 * Solution:
 *  1. cd into artifacts/color-sort so expo resolves app.config.js correctly.
 *  2. Run the expo CLI with all forwarded args.
 *  3. After prebuild, create a repo-root android/ symlink → artifacts/color-sort/android/
 *     so EAS credential injection and Gradle both find it where they expect.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const appDir  = path.resolve(repoRoot, 'artifacts/color-sort');
const expoBin = path.resolve(appDir, 'node_modules/expo/bin/cli');
const args    = process.argv.slice(2);

// expo-router needs EXPO_ROUTER_APP_ROOT to be an absolute path so Metro can
// inline it as a static string for require.context() at bundle time.
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.resolve(appDir, 'app');
}

// Run expo from the app directory so all internal require('expo') calls work.
process.chdir(appDir);

const result = spawnSync('node', [expoBin, ...args], { stdio: 'inherit' });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// After prebuild, symlink android/ at the repo root so EAS finds it.
if (args[0] === 'prebuild') {
  const androidSrc  = path.join(appDir, 'android');
  const androidLink = path.join(repoRoot, 'android');

  if (fs.existsSync(androidSrc) && !fs.existsSync(androidLink)) {
    fs.symlinkSync(androidSrc, androidLink);
    console.log('[expo-wrapper] Created repo-root android/ → artifacts/color-sort/android/');
  }
}
