/**
 * runPurchaseRemoveAdsFlow — pure Remove Ads purchase logic, extracted for testability.
 *
 * Takes a `purchase` function (from useSubscription) and an `onPurchaseComplete`
 * callback so the function has no React dependencies and can be unit-tested
 * without rendering any component.
 *
 * Mirrors the pattern established by restorePurchases.ts.
 */

import { RC_ENTITLEMENT_REMOVE_ADS } from './revenuecat';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

export interface PurchaseRemoveAdsResult {
  ok: boolean;
  text: string;
}

/**
 * Execute the Remove Ads purchase flow:
 *  1. Call `purchase(pkg)` (wraps Purchases.purchasePackage)
 *  2. Check the returned CustomerInfo for the remove_ads entitlement
 *  3. Invoke `onPurchaseComplete('remove_ads')` only when the entitlement is active
 *  4. Return a result object for the caller to act on
 *
 * On user cancellation or network error, the thrown error is swallowed and
 * `onPurchaseComplete` is NOT called.
 */
export async function runPurchaseRemoveAdsFlow(
  purchase: (pkg: PurchasesPackage) => Promise<CustomerInfo>,
  pkg: PurchasesPackage,
  onPurchaseComplete: (type: 'remove_ads') => void,
): Promise<PurchaseRemoveAdsResult> {
  try {
    const customerInfo = await purchase(pkg);
    const entitlementActive =
      customerInfo?.entitlements?.active?.[RC_ENTITLEMENT_REMOVE_ADS] !== undefined;

    if (entitlementActive) {
      onPurchaseComplete('remove_ads');
      return { ok: true, text: 'Ads removed successfully!' };
    }

    // Purchase call succeeded but the entitlement was not granted — treat as
    // a failed activation so the caller can surface an error if needed.
    return { ok: false, text: 'Purchase completed but Remove Ads entitlement was not activated.' };
  } catch {
    // User cancelled or store error — do nothing, caller handles UI reset.
    return { ok: false, text: '' };
  }
}
