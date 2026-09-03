// Web / Expo Go stub — on native, rewardedAd.native.ts is used instead.
// Immediately fires onFailed so the modal shows the "no ad available" state.
export function showRewardedAd(
  _onRewarded: () => void,
  onFailed: () => void,
): void {
  onFailed();
}
