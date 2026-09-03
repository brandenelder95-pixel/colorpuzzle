/**
 * Tests for the Remove Ads purchase flow (runPurchaseRemoveAdsFlow).
 *
 * Verifies that the function correctly handles:
 *  1. purchasePackage() returning a CustomerInfo with remove_ads entitlement active
 *     → onPurchaseComplete('remove_ads') IS called
 *  2. purchasePackage() returning CustomerInfo with no active entitlement
 *     → onPurchaseComplete is NOT called
 *  3. purchasePackage() throwing (user cancel, network error, etc.)
 *     → no crash and onPurchaseComplete is NOT called
 *
 * runPurchaseRemoveAdsFlow is the extracted logic from PowerUpModal's
 * handleConfirmPurchase (remove_ads branch).  It accepts a `purchase` callback
 * (which wraps Purchases.purchasePackage) and an `onPurchaseComplete` callback,
 * making it fully testable without rendering any React component.
 */

import Purchases from 'react-native-purchases';
import { runPurchaseRemoveAdsFlow } from '../lib/purchaseRemoveAds';
import { RC_ENTITLEMENT_REMOVE_ADS } from '../lib/revenuecat';

// ─── Mock react-native-purchases ────────────────────────────────────────────
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    LOG_LEVEL: { DEBUG: 'debug' },
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

/** Minimal PurchasesPackage stub — only the identifier is needed by the flow. */
const stubPackage = {
  identifier: '$rc_lifetime',
  product: { identifier: '$rc_lifetime', priceString: '$4.99', title: 'Remove Ads' },
} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runPurchaseRemoveAdsFlow (PowerUpModal handleConfirmPurchase remove_ads logic)', () => {
  const mockPurchasePackage = Purchases.purchasePackage as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onPurchaseComplete("remove_ads") when Purchases.purchasePackage returns the remove_ads entitlement', async () => {
    const customerInfo = makeCustomerInfo(RC_ENTITLEMENT_REMOVE_ADS);
    mockPurchasePackage.mockResolvedValueOnce({ customerInfo });

    const onPurchaseComplete = jest.fn();
    // purchase wraps Purchases.purchasePackage — same as useSubscription does
    const purchase = async (pkg: any) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    };

    const result = await runPurchaseRemoveAdsFlow(purchase, stubPackage, onPurchaseComplete);

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(mockPurchasePackage).toHaveBeenCalledWith(stubPackage);
    expect(onPurchaseComplete).toHaveBeenCalledWith('remove_ads');
    expect(result.ok).toBe(true);
  });

  it('does NOT call onPurchaseComplete when Purchases.purchasePackage returns CustomerInfo with no active entitlement', async () => {
    const customerInfo = makeCustomerInfo(null);
    mockPurchasePackage.mockResolvedValueOnce({ customerInfo });

    const onPurchaseComplete = jest.fn();
    const purchase = async (pkg: any) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    };

    const result = await runPurchaseRemoveAdsFlow(purchase, stubPackage, onPurchaseComplete);

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(onPurchaseComplete).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('does NOT crash and does NOT call onPurchaseComplete when Purchases.purchasePackage throws (user cancel / network error)', async () => {
    mockPurchasePackage.mockRejectedValueOnce(new Error('Purchase cancelled'));

    const onPurchaseComplete = jest.fn();
    const purchase = async (pkg: any) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    };

    // Should resolve without throwing
    await expect(
      runPurchaseRemoveAdsFlow(purchase, stubPackage, onPurchaseComplete),
    ).resolves.not.toThrow();

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(onPurchaseComplete).not.toHaveBeenCalled();
  });
});
