/**
 * runRestoreFlow — pure restore-purchases logic, extracted for testability.
 *
 * Takes a `restore` function (from useSubscription) and an `onSuccess`
 * callback so the function has no React dependencies and can be unit-tested
 * without rendering any component.
 *
 * Returns a result object that the caller can display to the user.
 */

import { RC_ENTITLEMENT_REMOVE_ADS } from './revenuecat';
import type { CustomerInfo } from 'react-native-purchases';

export interface RestoreResult {
  ok: boolean;
  text: string;
}

/**
 * Execute the full restore-purchases flow:
 *  1. Call `restore()` (wraps Purchases.restorePurchases)
 *  2. Check the returned CustomerInfo for the remove_ads entitlement
 *  3. Invoke `onPurchaseComplete` when the entitlement is active
 *  4. Return a user-facing message for the caller to display
 */
export async function runRestoreFlow(
  restore: () => Promise<CustomerInfo>,
  onPurchaseComplete: (type: 'remove_ads') => void,
): Promise<RestoreResult> {
  try {
    const customerInfo = await restore();
    const entitlementActive =
      customerInfo?.entitlements?.active?.[RC_ENTITLEMENT_REMOVE_ADS] !== undefined;

    if (entitlementActive) {
      onPurchaseComplete('remove_ads');
      return { ok: true, text: 'Purchase restored! Ads have been removed.' };
    }

    return { ok: false, text: 'No previous purchase found for this account.' };
  } catch {
    return { ok: false, text: 'Restore failed. Please try again.' };
  }
}
