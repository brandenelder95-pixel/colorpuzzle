/**
 * Ad unit IDs for Color Sort Puzzle
 *
 * HOW TO CONFIGURE REAL AD UNIT IDs:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. In the AdMob dashboard, create an app and ad units for Banner, Interstitial,
 *    and Rewarded video for both Android and iOS.
 * 2. In your Replit Secrets (or a .env.production file), set:
 *
 *      EXPO_PUBLIC_ADMOB_BANNER_ANDROID    = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_BANNER_IOS        = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS  = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_REWARDED_ANDROID  = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_REWARDED_IOS      = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_APPOPEN_ANDROID   = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *      EXPO_PUBLIC_ADMOB_APPOPEN_IOS       = ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *
 * 3. Update app.json's react-native-google-mobile-ads plugin with your real
 *    androidAppId and iosAppId values.
 *
 * When the EXPO_PUBLIC_ variables are absent the SDK falls back to Google's
 * official test IDs, which always serve test ads and never generate real revenue.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';

// ── Google's official test ad unit IDs (always available, never earn revenue) ─
const TEST_BANNER        = 'ca-app-pub-3940256099942544/6300978111';
const TEST_INTERSTITIAL  = 'ca-app-pub-3940256099942544/1033173712';
const TEST_REWARDED      = 'ca-app-pub-3940256099942544/5224354917';
const TEST_APP_OPEN      = 'ca-app-pub-3940256099942544/9257395921';

// ── Resolve ad unit ID: prefer env var, fall back to test ID ──────────────────
function resolveId(envAndroid: string | undefined, envIos: string | undefined, testId: string): string {
  const envValue = Platform.OS === 'ios' ? envIos : envAndroid;
  return envValue && envValue.startsWith('ca-app-pub-') ? envValue : testId;
}

export const BANNER_AD_UNIT_ID = resolveId(
  process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
  process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
  TEST_BANNER,
);

export const INTERSTITIAL_AD_UNIT_ID = resolveId(
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
  TEST_INTERSTITIAL,
);

export const REWARDED_AD_UNIT_ID = resolveId(
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID,
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS,
  TEST_REWARDED,
);

export const APPOPEN_AD_UNIT_ID = resolveId(
  process.env.EXPO_PUBLIC_ADMOB_APPOPEN_ANDROID,
  process.env.EXPO_PUBLIC_ADMOB_APPOPEN_IOS,
  TEST_APP_OPEN,
);

/** How many regular level wins between interstitial ads. */
export const INTERSTITIAL_INTERVAL = 3;
