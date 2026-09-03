import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const REVENUECAT_TEST_API_KEY    = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

/** Entitlement key that signals ads have been removed. */
export const RC_ENTITLEMENT_REMOVE_ADS = "remove_ads";

/** Package lookup key for the 10-hints consumable. */
export const RC_PACKAGE_HINTS_10 = "hints_10";

/** Package lookup key for the Remove Ads non-consumable. */
export const RC_PACKAGE_REMOVE_ADS = "$rc_lifetime";

/** Coin pack package identifiers (consumables). */
export const RC_PACKAGE_COINS_200  = "coins_200";
export const RC_PACKAGE_COINS_600  = "coins_600";
export const RC_PACKAGE_COINS_2000 = "coins_2000";

/** Package identifier for the monthly season pass subscription. */
export const RC_PACKAGE_SEASON_PASS = 'season_pass_monthly';

/** Entitlement key for an active season pass subscription. */
export const RC_ENTITLEMENT_SEASON_PASS = 'season_pass';

/**
 * One-time $2.99 level pack that unlocks levels 1001 and beyond.
 * Configure a non-consumable in RevenueCat with this identifier.
 */
export const RC_PACKAGE_LEVEL_PACK    = 'level_pack';
export const RC_ENTITLEMENT_LEVEL_PACK = 'level_pack';

/**
 * Package identifier for the one-time starter bundle (discounted Remove Ads + bonus coins).
 * Shown once to new players after their first few levels.
 * Falls back to RC_PACKAGE_REMOVE_ADS if this package is not in the current offering.
 */
export const RC_PACKAGE_STARTER_BUNDLE = 'starter_bundle';

/** Bonus coins credited locally after a successful starter bundle purchase. */
export const STARTER_BUNDLE_COINS = 300;

/** Coin amounts awarded for each pack. */
export const COIN_PACK_AMOUNTS: Record<string, number> = {
  [RC_PACKAGE_COINS_200]:  200,
  [RC_PACKAGE_COINS_600]:  600,
  [RC_PACKAGE_COINS_2000]: 2000,
};

function getApiKey(): string | null {
  // In dev / Expo Go / web — use the test key (may be absent without .env)
  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY ?? null;
  }
  if (Platform.OS === "ios")     return REVENUECAT_IOS_API_KEY     ?? null;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY ?? null;
  return REVENUECAT_TEST_API_KEY ?? null;
}

// Tracks whether Purchases.configure() succeeded so queries are never fired
// against an uninitialized native SDK (which causes a 6000ms bridge timeout).
let _rcConfigured = false;

export function initializeRevenueCat() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RevenueCat] No API key — purchases disabled.");
    return;
  }
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  _rcConfigured = true;
  console.log("[RevenueCat] configured");
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
function useSubscriptionContext() {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    staleTime: 60_000,
    enabled: _rcConfigured,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300_000,
    enabled: _rcConfigured,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const hasRemovedAds =
    customerInfoQuery.data?.entitlements.active?.[RC_ENTITLEMENT_REMOVE_ADS] !== undefined;

  const hasLevelPack =
    customerInfoQuery.data?.entitlements.active?.[RC_ENTITLEMENT_LEVEL_PACK] !== undefined;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    hasRemovedAds,
    hasLevelPack,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    refetchCustomerInfo: customerInfoQuery.refetch,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
