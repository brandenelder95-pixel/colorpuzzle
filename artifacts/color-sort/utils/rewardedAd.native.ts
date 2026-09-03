import { RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';
import { REWARDED_AD_UNIT_ID } from './ads';
import { canRequestAds, isNonPersonalized } from './consent';

/**
 * Load and show a rewarded ad.
 * - onRewarded fires when the user earns the reward.
 * - onFailed fires if the ad fails to load, if the user closes it before
 *   earning the reward, or if UMP has not granted ad-request permission.
 */
export function showRewardedAd(
  onRewarded: () => void,
  onFailed: () => void,
): void {
  if (!canRequestAds()) { onFailed(); return; }

  const rewarded = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
    requestNonPersonalizedAdsOnly: isNonPersonalized(),
  });

  let didEarnReward = false;

  rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
    didEarnReward = true;
    onRewarded();
  });

  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => rewarded.show());

  // User closed the ad without watching it to completion
  rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    if (!didEarnReward) onFailed();
  });

  // Ad failed to load
  rewarded.addAdEventListener(AdEventType.ERROR, onFailed);

  rewarded.load();
}
