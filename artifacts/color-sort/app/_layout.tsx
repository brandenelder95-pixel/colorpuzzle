import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ── Global JS error trap ───────────────────────────────────────────────────
// In release builds React Native swallows uncaught JS exceptions silently.
// This handler surfaces them as an on-screen alert so we can read the message
// without needing ADB / a connected debugger.
let _globalCrashMessage: string | null = null;
if (typeof ErrorUtils !== 'undefined') {
  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    const msg = `[${isFatal ? 'FATAL' : 'ERROR'}] ${error?.message ?? String(error)}\n\n${error?.stack ?? ''}`;
    _globalCrashMessage = msg;
    // Show immediately — Alert works even before the root component mounts.
    Alert.alert('App Crash', msg.slice(0, 600), [{ text: 'OK' }]);
    if (prev) prev(error, isFatal);
  });
}
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GameProvider, useGame } from '@/context/GameContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { AchievementsProvider } from '@/context/AchievementsContext';
import {
  SubscriptionProvider,
  initializeRevenueCat,
  RC_PACKAGE_HINTS_10,
  RC_PACKAGE_COINS_200,
  RC_PACKAGE_COINS_600,
  RC_PACKAGE_COINS_2000,
  COIN_PACK_AMOUNTS,
  useSubscription,
} from '@/lib/revenuecat';
import {
  getOrCreatePlayerId,
  fetchGameplayCoinsFromServer,
  syncGameplayCoinsToServer,
} from '@/lib/gameplayCoinsSync';
import { loadAndShowAppOpenAd } from '@/utils/appOpenAd';
import { initializeAdsConsent } from '@/utils/consent';

SplashScreen.preventAutoHideAsync();

// Start the ATT + UMP consent flow and MobileAds.initialize() immediately.
// Storing the Promise lets the layout component attach .finally() without
// starting a second concurrent run.
const queryClient = new QueryClient();

/**
 * Bridges RevenueCat customer info into GameContext hint reconciliation.
 *
 * Gated on `adsHydrated` so AsyncStorage state is fully loaded before we
 * compare against the watermark — prevents a startup race where customerInfo
 * resolves before the saved hints balance and reconciled-packs count are read.
 *
 * Uses the store product ID from the RC offerings to filter transactions rather
 * than the RC package identifier, since `nonSubscriptionTransactions` stores
 * the actual App Store / Play Store product ID. If offerings haven't loaded
 * yet the effect re-runs when they do.
 *
 * Must be mounted inside both SubscriptionProvider and GameProvider.
 */
function HintReconciliationBridge() {
  const { customerInfo, offerings } = useSubscription();
  const { adsHydrated, reconcileHintsFromPurchases } = useGame();

  useEffect(() => {
    // Wait for AsyncStorage hydration so the watermark and balance reflect
    // saved values, not the initial defaults.
    if (!adsHydrated || !customerInfo) return;

    // Prefer the store product ID from the RC package so the filter matches
    // what RC stores in nonSubscriptionTransactions. Fall back to the package
    // identifier — in many RC setups they are configured to be identical.
    const hintsProductId =
      offerings?.current?.availablePackages.find(
        (p) => p.identifier === RC_PACKAGE_HINTS_10
      )?.product.identifier ?? RC_PACKAGE_HINTS_10;

    const packCount = customerInfo.nonSubscriptionTransactions.filter(
      (tx) => tx.productIdentifier === hintsProductId
    ).length;

    reconcileHintsFromPurchases(packCount);
  }, [adsHydrated, customerInfo, offerings, reconcileHintsFromPurchases]);

  return null;
}

/**
 * Bridges RevenueCat customer info into GameContext coin reconciliation.
 *
 * Mirrors HintReconciliationBridge exactly. Gated on `adsHydrated` so
 * AsyncStorage state is fully loaded before we compare against the watermark.
 *
 * Sums all coin-pack transactions from RC nonSubscriptionTransactions:
 *   totalPurchasedCoins = Σ (count of each pack × its coin amount)
 *
 * Must be mounted inside both SubscriptionProvider and GameProvider.
 */
function CoinReconciliationBridge() {
  const { customerInfo, offerings } = useSubscription();
  const { adsHydrated, reconcileCoinsFromPurchases } = useGame();

  useEffect(() => {
    if (!adsHydrated || !customerInfo) return;

    // Build a map from store product ID → coin amount, preferring the
    // offerings product ID over the RC package identifier (they are often
    // identical, but using the product ID matches what RC stores in
    // nonSubscriptionTransactions).
    const coinPackIds: Array<{ productId: string; amount: number }> = [
      RC_PACKAGE_COINS_200,
      RC_PACKAGE_COINS_600,
      RC_PACKAGE_COINS_2000,
    ].map((pkgId) => {
      const productId =
        offerings?.current?.availablePackages.find(
          (p) => p.identifier === pkgId
        )?.product.identifier ?? pkgId;
      return { productId, amount: COIN_PACK_AMOUNTS[pkgId] ?? 0 };
    });

    const totalPurchasedCoins = coinPackIds.reduce((sum, { productId, amount }) => {
      const count = customerInfo.nonSubscriptionTransactions.filter(
        (tx) => tx.productIdentifier === productId
      ).length;
      return sum + count * amount;
    }, 0);

    reconcileCoinsFromPurchases(totalPurchasedCoins);
  }, [adsHydrated, customerInfo, offerings, reconcileCoinsFromPurchases]);

  return null;
}

/**
 * Bridges gameplay-earned coins to and from a server-side ledger so they
 * survive an app reinstall.
 *
 * Two responsibilities:
 *  1. RESTORE — on first mount (after adsHydrated), gets or creates a stable
 *     anonymous player UUID stored in the device Keychain (expo-secure-store),
 *     then fetches the authoritative server total and calls
 *     reconcileCoinsFromGameplay. On a normal launch the server total equals
 *     the local watermark, so reconcileCoinsFromGameplay is a no-op. On a
 *     reinstall, the server total is higher and the gap is re-credited.
 *  2. SYNC — whenever totalGameplayEarnedCoins grows (the player completes a
 *     new level), pushes the updated total to the server. The server enforces
 *     a monotonic increase (GREATEST) so a failed or out-of-order push can
 *     never lower the stored value.
 *
 * All network failures are logged and swallowed — the local AsyncStorage state
 * remains correct even when the server is unreachable.
 *
 * Gated on adsHydrated so the local watermark reflects the saved AsyncStorage
 * values before we compare against the server total.
 */
function GameplayCoinsReconciliationBridge() {
  const { adsHydrated, reconcileCoinsFromGameplay, totalGameplayEarnedCoins } = useGame();
  const playerIdRef = React.useRef<string | null>(null);

  // RESTORE: on startup, fetch the server total and reconcile.
  useEffect(() => {
    if (!adsHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const playerId = await getOrCreatePlayerId();
        if (cancelled) return;
        playerIdRef.current = playerId;
        const serverTotal = await fetchGameplayCoinsFromServer(playerId);
        if (cancelled) return;
        if (serverTotal > 0) {
          reconcileCoinsFromGameplay(serverTotal);
        }
      } catch (err) {
        console.log('[Coins] Gameplay restore from server failed (non-fatal):', err);
      }
    })();
    return () => { cancelled = true; };
  }, [adsHydrated, reconcileCoinsFromGameplay]);

  // SYNC: push the local total to the server whenever it grows.
  // Skip 0 (fresh install — nothing to sync yet).
  useEffect(() => {
    if (totalGameplayEarnedCoins === 0) return;
    (async () => {
      try {
        // Prefer the already-resolved player ID; fall back to resolving again.
        const playerId = playerIdRef.current ?? await getOrCreatePlayerId();
        playerIdRef.current = playerId;
        await syncGameplayCoinsToServer(playerId, totalGameplayEarnedCoins);
      } catch (err) {
        console.log('[Coins] Gameplay sync to server failed (non-fatal):', err);
      }
    })();
  }, [totalGameplayEarnedCoins]);

  return null;
}
/**
 * Fires a single App Open ad on cold start.
 *
 * Two guards before the ad loads:
 *  1. adsHydrated — waits for the persisted Remove Ads flag to be read from
 *     AsyncStorage so players who bought Remove Ads are never shown an ad
 *     during the async startup read.
 *  2. canRequestAds() — checked inside loadAndShowAppOpenAd so the ad only
 *     fires when UMP/ATT consent has been granted (mounted after consentReady).
 */
function AppOpenAdTrigger() {
  const { adsEnabled, adsHydrated, isInGame } = useGame();
  const firedRef = React.useRef(false);

  useEffect(() => {
    if (!adsHydrated || firedRef.current) return;
    firedRef.current = true;
    loadAndShowAppOpenAd(adsEnabled, isInGame);
  }, [adsHydrated, adsEnabled, isInGame]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="levels" options={{ headerShown: false }} />
      <Stack.Screen name="game" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Safety net: if fonts haven't resolved within 5s (e.g. slow CDN / FontFaceObserver
  // timeout on web), proceed with system fonts so the app never stays blank.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontTimedOut;

  // Initialize RevenueCat after the RN bridge is ready (not at module level).
  useEffect(() => {
    initializeRevenueCat();
  }, []);

  // Gate rendering behind consent so no ad component mounts before ATT/UMP
  // and MobileAds.initialize() have completed.
  const [consentReady, setConsentReady] = useState(false);

  useEffect(() => {
    // Start consent flow inside the component — no module-level native calls.
    // .catch guards against any unexpected rejection so it never surfaces as
    // an Uncaught Error — the app proceeds without ads on failure.
    initializeAdsConsent().catch(() => {}).finally(() => setConsentReady(true));
  }, []);

  useEffect(() => {
    if (fontsReady && consentReady) {
      // Both fonts and consent are resolved — safe to reveal the app.
      SplashScreen.hideAsync();
    }
  }, [fontsReady, consentReady]);

  // Keep the splash screen visible (return null) until fonts AND consent
  // are both ready, so no ad-triggering component ever mounts prematurely.
  if (!fontsReady || !consentReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SubscriptionProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <SettingsProvider>
                  <AchievementsProvider>
                    <GameProvider>
                      <HintReconciliationBridge />
                      <CoinReconciliationBridge />
                      <GameplayCoinsReconciliationBridge />
                      <AppOpenAdTrigger />
                      <RootLayoutNav />
                    </GameProvider>
                  </AchievementsProvider>
                </SettingsProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SubscriptionProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
