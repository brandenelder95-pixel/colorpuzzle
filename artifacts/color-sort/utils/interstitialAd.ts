// Web / Expo Go stub — on native, interstitialAd.native.ts is used instead.
// Immediately fires onClosed so the game continues without interruption.
export function showInterstitialAd(onClosed: () => void): void {
  onClosed();
}
