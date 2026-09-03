/**
 * Component-level tests for the Remove Ads purchase path inside PowerUpModal.
 *
 * Guards against the silent-failure scenario where Purchases.purchasePackage()
 * appears to succeed but the remove_ads entitlement is NOT present in the
 * returned CustomerInfo.  Without this guard a player could be charged and
 * see no change — ads still showing, no error, no guidance.
 *
 * Tests:
 *  1. Entitlement-missing failure: error message with restore guidance is shown,
 *     onPurchaseComplete is NOT called.
 *  2. Successful purchase (entitlement active): onPurchaseComplete IS called,
 *     no error message is shown.
 *
 * Uses react-test-renderer directly (not @testing-library/react-native) to
 * avoid the createRoot incompatibility between @testing-library/react-native@14
 * and react-test-renderer@19 (which removed createRoot from its public API).
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// ─── Mock all game.tsx module-level dependencies ─────────────────────────────

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

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'storeClient' },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => <View {...p}>{children}</View> };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, ...p }: any) => {
    const { Text } = require('react-native');
    return <Text {...p}>{name}</Text>;
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ level: '1', mode: 'classic' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/hooks/useSound', () => ({
  useSound: () => ({ play: jest.fn() }),
}));

jest.mock('@/context/GameContext', () => ({
  useGame: () => ({
    coins: 100,
    creditCoinPack: jest.fn(),
    earnCoins: jest.fn(),
    spendCoins: jest.fn(),
    addCoins: jest.fn(),
  }),
}));

jest.mock('@/components/TubeView', () => {
  const { View } = require('react-native');
  return { TubeView: (p: any) => <View {...p} />, TUBE_WIDTH: 60 };
});

jest.mock('@/components/AdBanner', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (p: any) => <View {...p} /> };
});

jest.mock('@/utils/rewardedAd', () => ({ showRewardedAd: jest.fn() }));
jest.mock('@/utils/gameLogic', () => ({
  pourBalls: jest.fn((t: any) => t),
  isWon: jest.fn(() => false),
  getValidDestinations: jest.fn(() => []),
  canPour: jest.fn(() => false),
  isTubeComplete: jest.fn(() => false),
}));
jest.mock('@/utils/levels', () => ({
  LEVELS: [],
  generateLevel: jest.fn(() => []),
  generateDailyLevel: jest.fn(() => []),
  TOTAL_LEVELS: 50,
}));
jest.mock('@/utils/interstitialAd', () => ({ showInterstitialAd: jest.fn() }));
jest.mock('@/utils/ads', () => ({ INTERSTITIAL_INTERVAL: 5 }));
jest.mock('@/utils/consent', () => ({
  showPrivacyOptions: jest.fn(),
  privacyOptionsRequired: jest.fn(() => false),
  refreshAndGetPrivacyOptionsRequired: jest.fn(() => Promise.resolve(false)),
  canRequestAds: jest.fn(() => true),
}));
jest.mock('@/lib/restorePurchases', () => ({ runRestoreFlow: jest.fn() }));

// ── The two mocks under test ────────────────────────────────────────────────

const mockRunPurchaseRemoveAdsFlow = jest.fn();
jest.mock('@/lib/purchaseRemoveAds', () => ({
  runPurchaseRemoveAdsFlow: (...args: any[]) => mockRunPurchaseRemoveAdsFlow(...args),
}));

const mockUseSubscription = jest.fn();
jest.mock('@/lib/revenuecat', () => ({
  useSubscription: (...args: any[]) => mockUseSubscription(...args),
  RC_ENTITLEMENT_REMOVE_ADS: 'remove_ads',
  RC_PACKAGE_REMOVE_ADS: '$rc_lifetime',
  RC_PACKAGE_HINTS_10: 'hints_10',
  RC_PACKAGE_COINS_200: 'coins_200',
  RC_PACKAGE_COINS_600: 'coins_600',
  RC_PACKAGE_COINS_2000: 'coins_2000',
  COIN_PACK_AMOUNTS: { coins_200: 200, coins_600: 600, coins_2000: 2000 },
}));

// ─── Import component under test (after all mocks are in place) ──────────────

import { PowerUpModal } from '../app/game';

// ─── Env vars required by revenuecat.tsx ─────────────────────────────────────
process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = 'test_key';
process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'ios_key';
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'android_key';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const stubRemoveAdsPkg = {
  identifier: '$rc_lifetime',
  product: { identifier: '$rc_lifetime', priceString: '$4.99', title: 'Remove Ads' },
};

function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    offerings: { current: { availablePackages: [stubRemoveAdsPkg] } },
    purchase: jest.fn().mockResolvedValue({}),
    isPurchasing: false,
    restore: jest.fn(),
    isRestoring: false,
    hasRemovedAds: false,
    customerInfo: null,
    refetchCustomerInfo: jest.fn(),
    purchaseError: null,
    isLoading: false,
    ...overrides,
  };
}

/** Traverse a rendered tree recursively, collecting instances matching predicate. */
function findAllBy(
  node: TestRenderer.ReactTestInstance,
  predicate: (n: TestRenderer.ReactTestInstance) => boolean,
): TestRenderer.ReactTestInstance[] {
  const results: TestRenderer.ReactTestInstance[] = [];
  function walk(n: TestRenderer.ReactTestInstance) {
    if (predicate(n)) results.push(n);
    (n.children ?? []).forEach((child) => {
      if (typeof child !== 'string') walk(child);
    });
  }
  walk(node);
  return results;
}

function findByTestId(
  root: TestRenderer.ReactTestInstance,
  testID: string,
): TestRenderer.ReactTestInstance | null {
  const found = findAllBy(root, (n) => n.props?.testID === testID);
  return found[0] ?? null;
}

function findTextContent(root: TestRenderer.ReactTestInstance): string {
  const texts: string[] = [];
  function walk(n: TestRenderer.ReactTestInstance) {
    (n.children ?? []).forEach((child) => {
      if (typeof child === 'string') {
        texts.push(child);
      } else {
        walk(child);
      }
    });
  }
  walk(root);
  return texts.join(' ');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PowerUpModal — Remove Ads purchase path (component-level)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubscription.mockReturnValue(makeSubscription());
  });

  it('shows an actionable error message and does NOT call onPurchaseComplete when the purchase succeeds but the entitlement is not activated', async () => {
    mockRunPurchaseRemoveAdsFlow.mockResolvedValueOnce({
      ok: false,
      text: 'Purchase completed but Remove Ads entitlement was not activated.',
    });

    const onPurchaseComplete = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PowerUpModal
          visible
          coins={100}
          hintsRemaining={0}
          adsEnabled
          onClose={jest.fn()}
          onHint={jest.fn()}
          onTubeAdded={jest.fn()}
          onSkipLevel={jest.fn()}
          onPurchaseComplete={onPurchaseComplete}
        />,
      );
    });

    // Step 1: press the Remove Ads row — sets confirmItem state
    const removeAdsRow = findByTestId(renderer.root, 'remove-ads-row');
    expect(removeAdsRow).not.toBeNull();
    await act(async () => { removeAdsRow!.props.onPress(); });

    // Step 2: press Buy in the PurchaseConfirmModal — calls handleConfirmPurchase
    const confirmBuyBtn = findByTestId(renderer.root, 'confirm-buy-btn');
    expect(confirmBuyBtn).not.toBeNull();
    await act(async () => { confirmBuyBtn!.props.onPress(); });

    // Step 3: the async flow has resolved — check the error text is rendered
    const errorNode = findByTestId(renderer.root, 'purchase-error-msg');
    expect(errorNode).not.toBeNull();
    const errorContent = findTextContent(errorNode!);
    expect(errorContent).toMatch(/entitlement was not activated/i);
    expect(errorContent).toMatch(/Restore Purchases/i);

    // onPurchaseComplete must NOT have been called
    expect(onPurchaseComplete).not.toHaveBeenCalled();
  });

  it('calls onPurchaseComplete("remove_ads") and does NOT show an error when the entitlement is active', async () => {
    // The real runPurchaseRemoveAdsFlow calls onPurchaseComplete before returning;
    // the mock must mirror that so the component receives the callback.
    mockRunPurchaseRemoveAdsFlow.mockImplementationOnce(
      async (_purchase: any, _pkg: any, onComplete: (t: 'remove_ads') => void) => {
        onComplete('remove_ads');
        return { ok: true, text: 'Ads removed successfully!' };
      },
    );

    const onPurchaseComplete = jest.fn();
    const onClose = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PowerUpModal
          visible
          coins={100}
          hintsRemaining={0}
          adsEnabled
          onClose={onClose}
          onHint={jest.fn()}
          onTubeAdded={jest.fn()}
          onSkipLevel={jest.fn()}
          onPurchaseComplete={onPurchaseComplete}
        />,
      );
    });

    const removeAdsRow = findByTestId(renderer.root, 'remove-ads-row');
    await act(async () => { removeAdsRow!.props.onPress(); });

    const confirmBuyBtn = findByTestId(renderer.root, 'confirm-buy-btn');
    await act(async () => { confirmBuyBtn!.props.onPress(); });

    // onPurchaseComplete should have been called with 'remove_ads'
    expect(onPurchaseComplete).toHaveBeenCalledWith('remove_ads');

    // No error node should be in the tree
    const errorNode = findByTestId(renderer.root, 'purchase-error-msg');
    expect(errorNode).toBeNull();
  });
});
