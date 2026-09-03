import { AppOpenAd, AdEventType } from 'react-native-google-mobile-ads';
import { APPOPEN_AD_UNIT_ID } from './ads';
import { canRequestAds, isNonPersonalized, waitForConsent } from './consent';

/**
 * Module-level flag — true once the ad has been requested this cold start.
 * App-open ads should only fire once per cold start, not on every foreground.
 */
let hasShownThisSession = false;

/**
 * Load and show an AdMob App Open ad for this cold start.
 *
 * Rules:
 *  - Awaits the ATT + UMP consent flow before requesting the ad, so the ad
 *    unit ID is never sent to AdMob before the user has made their consent
 *    choice. This satisfies both Apple ATT policy and Google UMP requirements.
 *  - If consent is denied or ATT is not authorized, requestNonPersonalizedAdsOnly
 *    is set to true so only non-targeted ads are served.
 *  - Runs at most once per cold start (module-level guard).
 *  - Silently skips when adsEnabled is false (Remove Ads purchased).
 *  - Silently skips when UMP has not granted ad-request permission.
 *  - Silently skips if the ad fails to load — never blocks the player.
 *  - Silently skips when the player is mid-game (isInGame = true), e.g. when
 *    the OS terminates and relaunches the app during an active level.
 */
export async function loadAndShowAppOpenAd(
  adsEnabled: boolean,
  isInGame: boolean = false,
): Promise<void> {
  // Fast-exit before awaiting consent if we already know the ad isn't needed.
  if (!adsEnabled || hasShownThisSession || isInGame) return;

  // Wait for the full ATT + UMP consent + MobileAds.initialize() sequence to
  // finish before making any ad network request.
  await waitForConsent();

  // Re-check the session guard after the async wait in case a concurrent caller
  // already set it while we were awaiting consent.
  if (!canRequestAds() || hasShownThisSession) return;

  hasShownThisSession = true;

  const appOpenAd = AppOpenAd.createForAdRequest(APPOPEN_AD_UNIT_ID, {
    // isNonPersonalized() reflects the ATT + UMP outcome:
    //   true  → ATT denied or UMP consent withheld → non-personalized ads only
    //   false → consent obtained (OBTAINED status) or not required (non-EEA)
    requestNonPersonalizedAdsOnly: isNonPersonalized(),
  });

  appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
    appOpenAd.show();
  });

  // On error: already marked hasShownThisSession = true, so we don't retry.
  // This is intentional — a failed attempt shouldn't spam the next foreground.
  appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
    // silent — player carries on normally
  });

  appOpenAd.load();
}
