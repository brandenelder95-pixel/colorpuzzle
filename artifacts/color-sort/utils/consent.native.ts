/**
 * Ad consent initializer — native (iOS + Android)
 *
 * Flow:
 *  1. iOS only: request App Tracking Transparency (ATT) permission.
 *     Apple requires this before any ad network can track the user.
 *  2. All platforms: run Google's User Messaging Platform (UMP) consent flow.
 *     This shows the GDPR consent form for EU/EEA users automatically.
 *     On error, the stored TC string from a prior session is still valid.
 *  3. Always check `canRequestAds` (the authoritative UMP gate) — it reflects
 *     the current-session result OR a persisted prior-session consent, whichever
 *     is available. Only when `canRequestAds` is true do we initialize MobileAds
 *     and allow ad components to load.
 *
 * Exported helpers are synchronous after initializeAdsConsent() resolves:
 *  - canRequestAds()     — whether the UMP SDK allows any ad requests at all
 *  - isNonPersonalized() — whether to pass requestNonPersonalizedAdsOnly: true
 */
import { Platform } from 'react-native';
import {
  AdsConsent,
  AdsConsentStatus,
  AdsConsentPrivacyOptionsRequirementStatus,
  MobileAds,
} from 'react-native-google-mobile-ads';

// Safe defaults — restrictive until UMP confirms otherwise.
let _canRequestAds  = false;
let _nonPersonalized = true;
let _consentReady   = false;
let _privacyOptionsRequired = false;

/**
 * Promise that resolves once initializeAdsConsent() has finished.
 * Initialized to a resolved promise so waitForConsent() is always safe to call,
 * even if initializeAdsConsent() was never called (e.g. in unit tests).
 */
let _consentPromise: Promise<void> = Promise.resolve();

/**
 * Returns a promise that resolves once the full ATT + UMP consent flow
 * (and MobileAds.initialize) have completed for this process lifetime.
 * Safe to call before or after initializeAdsConsent() — always resolves.
 */
export function waitForConsent(): Promise<void> {
  return _consentPromise;
}

/**
 * Run the full ATT + UMP consent flow, then initialize MobileAds if allowed.
 * Call once at app startup; resolves when the SDK is ready (or safely skipped).
 * Never rejects — errors fall back to safe non-personalized / no-ads defaults.
 *
 * Stores its promise in _consentPromise so waitForConsent() callers that were
 * dispatched before or after this call all await the same single run.
 */
export function initializeAdsConsent(): Promise<void> {
  _consentPromise = _runConsentFlow();
  return _consentPromise;
}

async function _runConsentFlow(): Promise<void> {
  // ── Step 1: ATT prompt on iOS ─────────────────────────────────────────────
  if (Platform.OS === 'ios') {
    try {
      const { requestTrackingPermissionsAsync } = await import(
        'expo-tracking-transparency'
      );
      await requestTrackingPermissionsAsync();
    } catch {
      // ATT failure is non-fatal; continue to UMP.
    }
  }

  // ── Step 2: UMP consent form (GDPR / EU users) ────────────────────────────
  // gatherConsent = requestInfoUpdate + loadAndShowConsentFormIfRequired.
  // On error we fall through: the UMP SDK persists consent across sessions, so
  // getConsentInfo() below may still return canRequestAds: true from a prior run.
  try {
    await AdsConsent.gatherConsent();
  } catch {
    // UMP error — prior-session consent checked in step 3.
  }

  // ── Step 3: Read the authoritative canRequestAds gate ─────────────────────
  // This is UMP's own signal: true when (a) consent was obtained, or (b) consent
  // is not required (non-EEA). It correctly handles both new and returning users
  // (persisted TC string satisfies canRequestAds on subsequent cold starts even
  // if gatherConsent() above skipped showing a form or failed outright).
  try {
    const info = await AdsConsent.getConsentInfo();
    _canRequestAds = info.canRequestAds;
    _privacyOptionsRequired =
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;

    if (_canRequestAds) {
      // ── Personalization ───────────────────────────────────────────────────
      // We delegate personalization entirely to the UMP-stored TC string:
      //
      // NOT_REQUIRED — user is outside the EEA; no TC-string restriction, so
      //   requestNonPersonalizedAdsOnly: false (personalized ads OK).
      //
      // OBTAINED — user went through the UMP form. The SDK stored the IAB TC
      //   string; AdMob reads it automatically on every ad request to apply the
      //   user's actual choices. We pass requestNonPersonalizedAdsOnly: false
      //   so we do NOT override the TC string with a blanket restriction — that
      //   would deny personalized ads even to users who explicitly consented.
      //   If the user declined, AdMob will serve non-personalized via TC string.
      //
      // Any other status after a successful canRequestAds: keep _nonPersonalized
      // true (safe default) — this should not occur in practice.
      if (
        info.status === AdsConsentStatus.NOT_REQUIRED ||
        info.status === AdsConsentStatus.OBTAINED
      ) {
        _nonPersonalized = false;
      }

      // ── Initialize MobileAds — only when UMP allows ad requests ───────────
      try {
        await MobileAds().initialize();
      } catch {
        // SDK init failure is non-fatal; ads attempt to load lazily.
      }
    }
    // If canRequestAds is false (user declined or consent still required),
    // _canRequestAds stays false and MobileAds is never initialized — no ad
    // components should load.
  } catch {
    // getConsentInfo failed — both flags stay at their safe defaults.
    // _canRequestAds: false, _nonPersonalized: true.
  }

  _consentReady = true;
}

/** True if UMP confirms ad requests are allowed for this user/session. */
export function canRequestAds(): boolean {
  return _canRequestAds;
}

/**
 * True when ads should request non-personalized mode.
 * Safe to call synchronously after initializeAdsConsent() has resolved.
 */
export function isNonPersonalized(): boolean {
  return _nonPersonalized;
}

/** True once the consent + SDK init flow has finished. */
export function isConsentReady(): boolean {
  return _consentReady;
}

/**
 * True when the UMP SDK requires showing the privacy options form,
 * i.e. the user is in the EEA and was shown a consent form this session.
 * Use this to conditionally render the "Privacy Settings" button.
 */
export function privacyOptionsRequired(): boolean {
  return _privacyOptionsRequired;
}

/**
 * Queries AdsConsent.getConsentInfo() directly to get a fresh reading of
 * whether the privacy options button should be shown, and updates the cached
 * flag. Falls back to the cached value on error.
 *
 * Use this when rendering the Privacy Settings button in UI to avoid relying
 * on a potentially stale module-level flag (e.g. on cold start before
 * initializeAdsConsent() has finished, or after a warm restart).
 */
export async function refreshAndGetPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    _privacyOptionsRequired =
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    // On error, keep the cached value.
  }
  return _privacyOptionsRequired;
}

/**
 * Opens the UMP privacy options form so the user can update their ad consent.
 * Call only when privacyOptionsRequired() is true.
 * After the form closes, refreshes the stored consent flags so subsequent ad
 * requests reflect the updated choice.
 * Never rejects — errors are silently ignored.
 */
export async function showPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
    // Refresh flags to reflect the user's updated choices.
    const info = await AdsConsent.getConsentInfo();
    _canRequestAds = info.canRequestAds;
    _privacyOptionsRequired =
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
    if (
      info.status === AdsConsentStatus.NOT_REQUIRED ||
      info.status === AdsConsentStatus.OBTAINED
    ) {
      _nonPersonalized = false;
    } else {
      _nonPersonalized = true;
    }
  } catch {
    // Non-fatal — user may have dismissed the form or UMP is unavailable.
  }
}
