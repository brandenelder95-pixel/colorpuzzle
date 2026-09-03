/**
 * Tests for the restore-purchases flow (runRestoreFlow).
 *
 * Verifies that the function correctly handles:
 *  1. restorePurchases() returning a CustomerInfo with remove_ads entitlement active
 *  2. restorePurchases() returning CustomerInfo with no active entitlements
 *  3. restorePurchases() throwing (network error, etc.)
 *
 * runRestoreFlow is the extracted logic from PowerUpModal's handleRestore.
 * It accepts a `restore` callback (which wraps Purchases.restorePurchases)
 * and an `onPurchaseComplete` callback, making it fully testable without
 * rendering any React component.
 */

import Purchases from 'react-native-purchases';
import { runRestoreFlow } from '../lib/restorePurchases';
import { RC_ENTITLEMENT_REMOVE_ADS } from '../lib/revenuecat';

// ─── Mock react-native-purchases ────────────────────────────────────────────
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    restorePurchases: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    LOG_LEVEL: { DEBUG: 'debug' },
    purchasePackage: jest.fn(),
  },
}));

// ─── Mock expo-constants (required by revenuecat.tsx) ────────────────────────
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'storeClient' },
}));

// ─── Env vars required by revenuecat.tsx ─────────────────────────────────────
process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = 'test_key';
process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'ios_key';
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'android_key';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal CustomerInfo-shaped object with the given entitlement active or not. */
function makeCustomerInfo(entitlementKey: string | null) {
  return {
    entitlements: {
      active: entitlementKey ? { [entitlementKey]: { identifier: entitlementKey } } : {},
      all: {},
    },
    activeSubscriptions: [],
    allPurchasedProductIdentifiers: [],
    nonSubscriptionTransactions: [],
    latestExpirationDate: null,
    firstSeen: '',
    originalAppUserId: 'test_user',
    requestDate: '',
    allExpirationDates: {},
    allPurchaseDates: {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
  } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runRestoreFlow (PowerUpModal handleRestore logic)', () => {
  const mockRestorePurchases = Purchases.restorePurchases as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onPurchaseComplete("remove_ads") when Purchases.restorePurchases returns the remove_ads entitlement', async () => {
    mockRestorePurchases.mockResolvedValueOnce(makeCustomerInfo(RC_ENTITLEMENT_REMOVE_ADS));

    const onPurchaseComplete = jest.fn();
    // restore wraps Purchases.restorePurchases — same as useSubscription does
    const restore = () => Purchases.restorePurchases() as any;

    const result = await runRestoreFlow(restore, onPurchaseComplete);

    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(onPurchaseComplete).toHaveBeenCalledWith('remove_ads');
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/Purchase restored/i);
  });

  it('shows "No previous purchase found" and does not call onPurchaseComplete when Purchases.restorePurchases returns no active entitlements', async () => {
    mockRestorePurchases.mockResolvedValueOnce(makeCustomerInfo(null));

    const onPurchaseComplete = jest.fn();
    const restore = () => Purchases.restorePurchases() as any;

    const result = await runRestoreFlow(restore, onPurchaseComplete);

    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(onPurchaseComplete).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/No previous purchase found/i);
  });

  it('shows "Restore failed" and does not call onPurchaseComplete when Purchases.restorePurchases throws', async () => {
    mockRestorePurchases.mockRejectedValueOnce(new Error('network error'));

    const onPurchaseComplete = jest.fn();
    const restore = () => Purchases.restorePurchases() as any;

    const result = await runRestoreFlow(restore, onPurchaseComplete);

    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(onPurchaseComplete).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/Restore failed/i);
  });
});
