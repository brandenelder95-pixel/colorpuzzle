import {
  InterstitialAd,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { INTERSTITIAL_AD_UNIT_ID } from './ads';
import { canRequestAds, isNonPersonalized } from './consent';

/**
 * Load and show an interstitial ad, then call onClosed when dismissed.
 * If the ad fails to load, or UMP has not granted ad permission, onClosed
 * is called immediately so the game never blocks on an ad.
 */
export function showInterstitialAd(onClosed: () => void): void {
  if (!canRequestAds()) { onClosed(); return; }

  const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
    requestNonPersonalizedAdsOnly: isNonPersonalized(),
  });

  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitial.show();
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    onClosed();
  });

  // If the ad can't be fetched, don't block the player
  interstitial.addAdEventListener(AdEventType.ERROR, () => {
    onClosed();
  });

  interstitial.load();
}
