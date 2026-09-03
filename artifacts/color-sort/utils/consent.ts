/**
 * Ad consent stub — web / Expo Go
 *
 * No real AdMob SDK on web; consent is not applicable and ad requests are
 * handled by no-op stubs in the corresponding *.ts (non-native) ad utilities.
 */

// eslint-disable-next-line @typescript-eslint/require-await
export async function initializeAdsConsent(): Promise<void> {
  // No-op on web.
}

/** No real ads on web — always false. */
export function canRequestAds(): boolean {
  return false;
}

/** Web stub — consent is not applicable; resolves immediately. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function waitForConsent(): Promise<void> {
  // No-op on web.
}

export function isNonPersonalized(): boolean {
  return true;
}

export function isConsentReady(): boolean {
  return true;
}

/** Web stub — privacy options form is not applicable on web. */
export function privacyOptionsRequired(): boolean {
  return false;
}

/** Web stub — always resolves to false; no UMP on web. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function refreshAndGetPrivacyOptionsRequired(): Promise<boolean> {
  return false;
}

/** Web stub — no-op on web. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function showPrivacyOptions(): Promise<void> {
  // No-op on web.
}
