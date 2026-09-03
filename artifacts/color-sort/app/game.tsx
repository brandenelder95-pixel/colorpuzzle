import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Platform, Modal, Pressable, ActivityIndicator, ScrollView, Share, Alert,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSound } from '@/hooks/useSound';
import { useGame } from '@/context/GameContext';
import { TubeView, TUBE_WIDTH, TUBE_HEIGHT, BALL_SIZE } from '@/components/TubeView';
import { showRewardedAd } from '@/utils/rewardedAd';
import AdBanner from '@/components/AdBanner';
import {
  GameState, pourBalls, isWon, getValidDestinations, canPour, isTubeComplete,
} from '@/utils/gameLogic';
import {
  useSubscription,
  RC_ENTITLEMENT_REMOVE_ADS,
  RC_PACKAGE_REMOVE_ADS, RC_PACKAGE_HINTS_10,
  RC_PACKAGE_COINS_200, RC_PACKAGE_COINS_600, RC_PACKAGE_COINS_2000,
  RC_PACKAGE_STARTER_BUNDLE, STARTER_BUNDLE_COINS,
  RC_PACKAGE_LEVEL_PACK,
  COIN_PACK_AMOUNTS,
} from '@/lib/revenuecat';
import { runRestoreFlow } from '@/lib/restorePurchases';

// ---------------------------------------------------------------------------
// Coin costs
// ---------------------------------------------------------------------------
import { LEVELS, generateLevel, generateDailyLevel, TOTAL_LEVELS, PAID_LEVELS_START } from '@/utils/levels';
import { MILESTONES } from '@/utils/achievements';
import { useSettings } from '@/context/SettingsContext';
import { useAchievements } from '@/context/AchievementsContext';
import { AchievementToast } from '@/components/AchievementToast';
import { MilestoneModal } from '@/components/MilestoneModal';
import { showInterstitialAd } from '@/utils/interstitialAd';
import { INTERSTITIAL_INTERVAL } from '@/utils/ads';
import { showPrivacyOptions, privacyOptionsRequired, refreshAndGetPrivacyOptionsRequired, canRequestAds } from '@/utils/consent';
import { runPurchaseRemoveAdsFlow } from '@/lib/purchaseRemoveAds';
const HINT_COST  = 50;
const TUBE_COST  = 80;
const SKIP_COST  = 150;
const UNDO_COST  = 20;
const REMOVE_ADS_BONUS_COINS = 500;

// ---------------------------------------------------------------------------
// Module-level interstitial win counter
// Survives router.replace (which remounts the screen component) so the
// INTERSTITIAL_INTERVAL cadence is maintained across the whole play session.
// ---------------------------------------------------------------------------
let sessionWins = 0;

// ---------------------------------------------------------------------------
// Hint finder — prioritises moves that complete a tube, then consolidation
// ---------------------------------------------------------------------------
function findHint(tubes: GameState): [number, number] | null {
  // 1. Move that completes destination tube
  for (let f = 0; f < tubes.length; f++) {
    if (!tubes[f].length) continue;
    for (let t = 0; t < tubes.length; t++) {
      if (canPour(tubes, f, t)) {
        const next = pourBalls(tubes, f, t);
        if (isTubeComplete(next[t])) return [f, t];
      }
    }
  }
  // 2. Pour onto matching colour (not empty)
  for (let f = 0; f < tubes.length; f++) {
    if (!tubes[f].length) continue;
    for (let t = 0; t < tubes.length; t++) {
      if (tubes[t].length > 0 && canPour(tubes, f, t)) return [f, t];
    }
  }
  // 3. Any valid move
  for (let f = 0; f < tubes.length; f++) {
    if (!tubes[f].length) continue;
    for (let t = 0; t < tubes.length; t++) {
      if (canPour(tubes, f, t)) return [f, t];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------
function Particle({ delay, gold }: { delay: number; gold?: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const colorOptions = gold
    ? ['#F59E0B', '#FBBF24', '#FDE68A', '#F97316', '#EF4444', '#FCD34D']
    : ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#A855F7', '#EC4899'];
  const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
  const x = Math.random() * 320 - 160;
  const size = 8 + Math.random() * 8;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
      transform: [
        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 260] }) },
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
      ],
    }} />
  );
}

// ---------------------------------------------------------------------------
// Win overlay — supports both regular and daily modes
// ---------------------------------------------------------------------------
function WinOverlay({
  levelId, moves, coinsEarned,
  isDaily, dateString, streak, isLastLevel,
  onNext, onMenu,
}: {
  levelId: number;
  moves: number;
  coinsEarned: number;
  isDaily?: boolean;
  dateString?: string;
  streak?: number;
  isLastLevel?: boolean;
  onNext: () => void;
  onMenu: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(0.6)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const streakText = streak && streak > 1 ? ` (${streak} day streak! 🔥)` : '';
    const message = `I solved today's Color Sort Daily Challenge in ${moves} moves!${streakText} 🎨`;
    try { await Share.share({ message }); } catch {}
  }, [moves, streak]);

  if (isDaily) {
    return (
      <Animated.View style={[styles.winOverlay, { opacity: fadeAnim }]}>
        <View style={styles.confettiContainer}>
          {Array.from({ length: 24 }).map((_, i) => <Particle key={i} delay={i * 35} gold />)}
        </View>
        <Animated.View style={[styles.winCard, styles.dailyWinCard, { transform: [{ scale: slideAnim }] }]}>
          <LinearGradient
            colors={['#92400E', '#D97706']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.dailyWinBanner}
          >
            <Text style={styles.dailyWinBannerText}>🏆 DAILY CHALLENGE</Text>
          </LinearGradient>
          <View style={styles.dailyWinBody}>
            <Text style={styles.winEmoji}>🎉</Text>
            <Text style={styles.winTitle}>Solved!</Text>
            {dateString && <Text style={styles.dailyWinDate}>{dateString}</Text>}
            <View style={styles.starsRow}>
              {[0, 1, 2].map((i) => <Ionicons key={i} name="star" size={30} color="#F59E0B" />)}
            </View>
            <Text style={styles.movesText}>{moves} moves</Text>
            {streak !== undefined && streak > 0 && (
              <View style={styles.dailyStreakRow}>
                <Text style={styles.dailyStreakFire}>🔥</Text>
                <Text style={styles.dailyStreakText}>
                  {streak} day{streak !== 1 ? 's' : ''} in a row!
                </Text>
              </View>
            )}
            <View style={styles.winButtons}>
              <TouchableOpacity style={styles.menuBtn} onPress={onMenu}>
                <Ionicons name="home-outline" size={20} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#92400E', '#D97706']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.shareGradient}
                >
                  <Ionicons name="share-social-outline" size={18} color="#FFF" />
                  <Text style={styles.shareText}>Share</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    );
  }

  // Regular level win overlay
  return (
    <Animated.View style={[styles.winOverlay, { opacity: fadeAnim }]}>
      <View style={styles.confettiContainer}>
        {Array.from({ length: isLastLevel ? 36 : 20 }).map((_, i) => (
          <Particle key={i} delay={i * (isLastLevel ? 25 : 40)} gold={isLastLevel} />
        ))}
      </View>
      <Animated.View style={[styles.winCard, { transform: [{ scale: slideAnim }] }]}>
        <Text style={styles.winEmoji}>{isLastLevel ? '🏆' : '🎉'}</Text>
        <Text style={styles.winTitle}>{isLastLevel ? 'You Beat It!' : 'Level Complete!'}</Text>
        {isLastLevel ? (
          <Text style={styles.allDoneSubtitle}>All {TOTAL_LEVELS} levels conquered!</Text>
        ) : (
          <Text style={styles.winLevel}>Level {levelId}</Text>
        )}
        <View style={styles.starsRow}>
          {[0, 1, 2].map((i) => <Ionicons key={i} name="star" size={30} color="#F59E0B" />)}
        </View>
        <Text style={styles.movesText}>{moves} moves</Text>
        {coinsEarned > 0 && (
          <View style={styles.coinsEarnedRow}>
            <Text style={styles.coinsEarnedIcon}>🪙</Text>
            <Text style={styles.coinsEarnedText}>+{coinsEarned} coins</Text>
          </View>
        )}
        <View style={styles.winButtons}>
          <TouchableOpacity style={styles.menuBtn} onPress={onMenu}>
            <Ionicons name="home-outline" size={20} color="#94A3B8" />
          </TouchableOpacity>
          {isLastLevel ? (
            <TouchableOpacity style={styles.nextBtn} onPress={onMenu} activeOpacity={0.85}>
              <LinearGradient colors={['#92400E','#D97706']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.nextGradient}>
                <Ionicons name="trophy-outline" size={18} color="#FFF" />
                <Text style={styles.nextText}>Back to Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.85}>
              <LinearGradient colors={['#7C3AED','#A855F7']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.nextGradient}>
                <Text style={styles.nextText}>Next Level</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function PurchaseConfirmModal({
  visible, productName, price, onConfirm, onCancel, isPurchasing,
}: {
  visible: boolean;
  productName: string;
  price: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPurchasing: boolean;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.confirmBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Confirm Purchase</Text>
          <Text style={styles.confirmProduct}>{productName}</Text>
          <Text style={styles.confirmPrice}>{price}</Text>
          <View style={styles.confirmButtons}>
            <TouchableOpacity style={styles.confirmCancel} onPress={onCancel} disabled={isPurchasing}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="confirm-buy-btn" style={styles.confirmBuy} onPress={onConfirm} disabled={isPurchasing}>
              {isPurchasing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmBuyText}>Buy</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
// ---------------------------------------------------------------------------
// Out-of-Hints paywall modal
// ---------------------------------------------------------------------------
function OutOfHintsModal({
  visible,
  onClose,
  onPurchaseComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
}) {
  const { offerings, purchase, isPurchasing } = useSubscription();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const hints10Pkg = offerings?.current?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_HINTS_10,
  );

  const handleBuyPress = () => {
    if (!hints10Pkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmVisible(true);
  };

  const handleConfirm = async () => {
    if (!hints10Pkg) return;
    try {
      await purchase(hints10Pkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmVisible(false);
      onPurchaseComplete();
      onClose();
    } catch {
      setConfirmVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.outOfHintsBackdrop}>
        <View style={styles.outOfHintsCard}>
          <Text style={styles.outOfHintsEmoji}>💡</Text>
          <Text style={styles.outOfHintsTitle}>Out of Hints</Text>
          <Text style={styles.outOfHintsDesc}>
            Get 10 hints stored forever — use any time you're stuck
          </Text>
          {hints10Pkg ? (
            <TouchableOpacity
              style={styles.outOfHintsBuyBtn}
              onPress={handleBuyPress}
              activeOpacity={0.85}
              disabled={isPurchasing}
            >
              <LinearGradient
                colors={['#6D28D9', '#A855F7']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.outOfHintsBuyGradient}
              >
                <Ionicons name="bulb-outline" size={18} color="#FFF" />
                <Text style={styles.outOfHintsBuyText}>
                  Get 10 Hints · {hints10Pkg.product.priceString}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <ActivityIndicator color="#A855F7" style={{ marginVertical: 12 }} />
          )}
          <TouchableOpacity style={styles.notNowBtn} onPress={onClose}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {confirmVisible && hints10Pkg && (
        <PurchaseConfirmModal
          visible={confirmVisible}
          productName={hints10Pkg.product.title || '10 Hints Pack'}
          price={hints10Pkg.product.priceString}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmVisible(false)}
          isPurchasing={isPurchasing}
        />
      )}
    </Modal>
  );
}

type AdState = 'idle' | 'loading' | 'failed';
type AdTarget = 'hint' | 'tube' | null;

export function PowerUpModal({
  visible, coins, hintsRemaining, adsEnabled, onClose,
  onHint, onTubeAdded, onSkipLevel, onPurchaseComplete, onConsentChanged,
}: {
  visible: boolean;
  coins: number;
  hintsRemaining: number;
  adsEnabled: boolean;
  onClose: () => void;
  onHint: () => void;
  onTubeAdded: () => void;
  onSkipLevel: () => void;
  onPurchaseComplete: (type: 'remove_ads' | 'hints_10') => void;
  onConsentChanged?: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [adState, setAdState] = useState<AdState>('idle');
  const [adTarget, setAdTarget] = useState<AdTarget>(null);
  const { offerings, purchase, isPurchasing, restore, isRestoring, hasRemovedAds, hasLevelPack } = useSubscription();
  const { creditCoinPack, earnCoins } = useGame();
  const [confirmItem, setConfirmItem] = useState<{
    pkg: any; name: string; price: string;
    type: 'remove_ads' | 'hints_10' | 'coins';
    coinAmount?: number;
  } | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPrivacyBtn, setShowPrivacyBtn] = useState(false);

  const currentOffering = offerings?.current;
  const removeAdsPkg  = currentOffering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_REMOVE_ADS,
  );
  const hints10Pkg = currentOffering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_HINTS_10,
  );
  const coins200Pkg  = currentOffering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_COINS_200,
  );
  const coins600Pkg  = currentOffering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_COINS_600,
  );
  const coins2000Pkg = currentOffering?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_COINS_2000,
  );

  const handleIapPress = (type: 'remove_ads' | 'hints_10') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pkg = type === 'remove_ads' ? removeAdsPkg : hints10Pkg;
    if (!pkg) return;
    setConfirmItem({
      pkg,
      name: pkg.product.title || (type === 'remove_ads' ? 'Remove Ads' : '10 Hints Pack'),
      price: pkg.product.priceString,
      type,
    });
  };

  const handleCoinPackPress = (pkg: any, coinAmount: number) => {
    if (!pkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmItem({
      pkg,
      name: pkg.product.title || `${coinAmount} Coins`,
      price: pkg.product.priceString,
      type: 'coins',
      coinAmount,
    });
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoreMessage(null);
    const result = await runRestoreFlow(restore, onPurchaseComplete);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (!result.ok && result.text.startsWith('Restore failed')) {
      console.warn("[RevenueCat] restore failed");
    }
    setRestoreMessage(result);
  };

  const handleConfirmPurchase = async () => {
    if (!confirmItem) return;
    try {
      if (confirmItem.type === 'remove_ads') {
        // Use the extracted flow so the entitlement is verified before
        // onPurchaseComplete is called — same pattern as runRestoreFlow.
        const result = await runPurchaseRemoveAdsFlow(
          purchase,
          confirmItem.pkg,
          onPurchaseComplete,
        );
        if (result.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          earnCoins(REMOVE_ADS_BONUS_COINS);
          setConfirmItem(null);
          onClose();
        } else if (result.text) {
          // Entitlement not activated despite a successful charge — show an
          // error with actionable guidance so the player is not left wondering.
          setRestoreMessage({
            ok: false,
            text: result.text + ' Try "Restore Purchases" below or contact support.',
          });
          setConfirmItem(null);
        } else {
          // Empty text means user cancelled / store error — just dismiss.
          setConfirmItem(null);
        }
      } else {
        await purchase(confirmItem.pkg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (confirmItem.type === 'coins') {
          creditCoinPack(confirmItem.pkg.identifier);
        } else if ((confirmItem.type as string) === 'level_pack') {
          // Level pack entitlement — RC subscription hook refetches automatically;
          // no explicit callback needed. Just close the shop.
        } else {
          onPurchaseComplete(confirmItem.type as 'hints_10');
        }
        setConfirmItem(null);
        onClose();
      }
    } catch (e: any) {
      setConfirmItem(null);
      // Show a message for store/network errors but stay silent on user cancellation
      const cancelled =
        e?.userCancelled === true ||
        String(e?.code ?? '').includes('CANCELLED') ||
        String(e?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) {
        Alert.alert(
          'Purchase Failed',
          'Could not reach the store. Please check your connection and try again.',
          [{ text: 'OK' }],
        );
      }
    }
  };

  useEffect(() => {
    if (visible) {
      setAdState('idle');
      setAdTarget(null);
      setRestoreMessage(null);
      // Sync read for an instant first render, then async refresh to correct
      // any stale cached value (e.g. cold start before consent flow finished,
      // or warm restart that reset the module-level flag to its default).
      setShowPrivacyBtn(privacyOptionsRequired());
      refreshAndGetPrivacyOptionsRequired().then(setShowPrivacyBtn);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const watchAdFor = useCallback((target: AdTarget) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAdState('loading');
    setAdTarget(target);
    showRewardedAd(
      () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (target === 'hint') onHint();
        else if (target === 'tube') onTubeAdded();
        onClose();
      },
      () => setAdState('failed'),
    );
  }, [onHint, onTubeAdded, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={adState === 'idle' ? onClose : undefined}>
        <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />

          {adState === 'idle' && (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.coinBalanceRow}>
                <Text style={styles.coinBalanceIcon}>🪙</Text>
                <Text style={styles.coinBalanceAmount}>{coins}</Text>
                <Text style={styles.coinBalanceLabel}>coins</Text>
                {hintsRemaining > 0 && (
                  <>
                    <Text style={styles.coinBalanceLabel}>  ·  </Text>
                    <Text style={styles.coinBalanceIcon}>💡</Text>
                    <Text style={[styles.coinBalanceAmount, { color: '#A78BFA' }]}>{hintsRemaining}</Text>
                    <Text style={styles.coinBalanceLabel}>hints</Text>
                  </>
                )}
              </View>

              {/* ── IAP: Level Pack ── */}
              {!hasLevelPack && (() => {
                const levelPackPkg = currentOffering?.availablePackages.find(
                  (p) => p.identifier === RC_PACKAGE_LEVEL_PACK,
                );
                return levelPackPkg ? (
                  <>
                    <TouchableOpacity
                      style={styles.removeAdsRow}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setConfirmItem({
                          pkg: levelPackPkg,
                          name: levelPackPkg.product.title || 'Level Pack',
                          price: levelPackPkg.product.priceString,
                          type: 'level_pack' as any,
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.removeAdsIcon, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
                        <Ionicons name="infinite-outline" size={22} color="#A855F7" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.removeAdsTitle, { color: '#C084FC' }]}>Level Pack — Levels 1001+</Text>
                        <Text style={styles.powerUpDesc}>One-time unlock — endless puzzles forever</Text>
                      </View>
                      <Text style={[styles.removeAdsPrice, { color: '#A855F7' }]}>{levelPackPkg.product.priceString}</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                  </>
                ) : null;
              })()}

              {/* ── IAP: Remove Ads ── */}
              {adsEnabled && removeAdsPkg && (
                <>
                  <TouchableOpacity testID="remove-ads-row" style={styles.removeAdsRow} onPress={() => handleIapPress('remove_ads')} activeOpacity={0.8}>
                    <View style={styles.removeAdsIcon}>
                      <Ionicons name="shield-checkmark-outline" size={22} color="#F87171" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.removeAdsTitle}>Remove Ads + 500 coins</Text>
                      <Text style={styles.powerUpDesc}>One-time purchase — no more ads, ever</Text>
                    </View>
                    <Text style={styles.removeAdsPrice}>{removeAdsPkg.product.priceString}</Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                </>
              )}

              {/* ── IAP: 10 Hints Pack ── */}
              {hints10Pkg && (
                <>
                  <TouchableOpacity testID="hints-10-row" style={styles.hintsPackRow} onPress={() => handleIapPress('hints_10')} activeOpacity={0.8}>
                    <View style={styles.hintsPackIcon}>
                      <Ionicons name="bulb-outline" size={22} color="#A78BFA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hintsPackTitle}>10 Hints Pack</Text>
                      <Text style={styles.powerUpDesc}>Stored forever — use any time</Text>
                    </View>
                    <Text style={styles.hintsPackPrice}>{hints10Pkg.product.priceString}</Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                </>
              )}

              <Text style={styles.sheetTitle}>Power-Ups</Text>

              {/* ── Hint ── */}
              <View style={styles.powerUpRow}>
                <View style={styles.powerUpIcon}>
                  <Ionicons name="bulb-outline" size={24} color="#EAB308" />
                </View>
                <View style={styles.powerUpInfo}>
                  <Text style={styles.powerUpName}>Hint</Text>
                  <Text style={styles.powerUpDesc}>Shows the best next move</Text>
                </View>
                <View style={styles.powerUpActions}>
                  <TouchableOpacity
                    style={[styles.coinBtn, coins < HINT_COST && styles.coinBtnDisabled]}
                    onPress={() => { if (coins >= HINT_COST) { onHint(); onClose(); } }}
                  >
                    <Text style={styles.coinBtnText}>🪙 {HINT_COST}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adBtn} onPress={() => watchAdFor('hint')}>
                    <Text style={styles.adBtnText}>Free Ad</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* ── Extra Tube ── */}
              <View style={styles.powerUpRow}>
                <View style={styles.powerUpIcon}>
                  <Ionicons name="flask-outline" size={24} color="#10B981" />
                </View>
                <View style={styles.powerUpInfo}>
                  <Text style={styles.powerUpName}>Extra Tube</Text>
                  <Text style={styles.powerUpDesc}>Adds an empty tube to the level</Text>
                </View>
                <View style={styles.powerUpActions}>
                  <TouchableOpacity
                    style={[styles.coinBtn, coins < TUBE_COST && styles.coinBtnDisabled]}
                    onPress={() => { if (coins >= TUBE_COST) { onTubeAdded(); onClose(); } }}
                  >
                    <Text style={styles.coinBtnText}>🪙 {TUBE_COST}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adBtn} onPress={() => watchAdFor('tube')}>
                    <Text style={styles.adBtnText}>Free Ad</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* ── Skip Level ── */}
              <View style={styles.powerUpRow}>
                <View style={styles.powerUpIcon}>
                  <Ionicons name="play-skip-forward-outline" size={24} color="#A855F7" />
                </View>
                <View style={styles.powerUpInfo}>
                  <Text style={styles.powerUpName}>Skip Level</Text>
                  <Text style={styles.powerUpDesc}>Move on and come back later</Text>
                </View>
                <View style={styles.powerUpActions}>
                  <TouchableOpacity
                    style={[styles.coinBtn, coins < SKIP_COST && styles.coinBtnDisabled]}
                    onPress={() => { if (coins >= SKIP_COST) { onSkipLevel(); onClose(); } }}
                  >
                    <Text style={styles.coinBtnText}>🪙 {SKIP_COST}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── Coin packs ── */}
              <View style={styles.coinPacksSection}>
                <Text style={styles.coinPacksTitle}>Need more coins?</Text>

                <TouchableOpacity
                  style={styles.coinPackRow}
                  onPress={() => coins200Pkg && handleCoinPackPress(coins200Pkg, COIN_PACK_AMOUNTS[RC_PACKAGE_COINS_200])}
                  activeOpacity={coins200Pkg ? 0.75 : 1}
                >
                  <Text style={styles.coinPackAmount}>🪙 200 coins</Text>
                  <Text style={styles.coinPackPrice}>
                    {coins200Pkg ? coins200Pkg.product.priceString : '$0.99'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.coinPackRow, styles.coinPackBest]}
                  onPress={() => coins600Pkg && handleCoinPackPress(coins600Pkg, COIN_PACK_AMOUNTS[RC_PACKAGE_COINS_600])}
                  activeOpacity={coins600Pkg ? 0.75 : 1}
                >
                  <View style={styles.bestValueBadge}><Text style={styles.bestValueText}>BEST VALUE</Text></View>
                  <Text style={styles.coinPackAmount}>🪙 600 coins</Text>
                  <Text style={styles.coinPackPrice}>
                    {coins600Pkg ? coins600Pkg.product.priceString : '$1.99'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.coinPackRow}
                  onPress={() => coins2000Pkg && handleCoinPackPress(coins2000Pkg, COIN_PACK_AMOUNTS[RC_PACKAGE_COINS_2000])}
                  activeOpacity={coins2000Pkg ? 0.75 : 1}
                >
                  <Text style={styles.coinPackAmount}>🪙 2,000 coins</Text>
                  <Text style={styles.coinPackPrice}>
                    {coins2000Pkg ? coins2000Pkg.product.priceString : '$4.99'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Restore Purchases ── */}
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={handleRestore}
                disabled={isRestoring}
              >
                <Text style={styles.restoreBtnText}>
                  {isRestoring ? 'Restoring…' : 'Restore Purchases'}
                </Text>
              </TouchableOpacity>
              {restoreMessage && (
                <Text
                  testID="purchase-error-msg"
                  style={[
                    styles.restoreMessageText,
                    restoreMessage.ok ? styles.restoreMessageOk : styles.restoreMessageErr,
                  ]}
                >
                  {restoreMessage.text}
                </Text>
              )}

              {/* ── Privacy Settings (EEA users only) ── */}
              {showPrivacyBtn && (
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    await showPrivacyOptions();
                    // Refresh button visibility and consent-gated ad state
                    setShowPrivacyBtn(privacyOptionsRequired());
                    onConsentChanged?.();
                  }}
                >
                  <Text style={styles.restoreBtnText}>Privacy Settings</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.notNowBtn} onPress={onClose}>
                <Text style={styles.notNowText}>Not now</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {adState === 'loading' && (
            <View style={styles.adLoadingContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.adLoadingTitle}>Loading ad…</Text>
              <Text style={styles.adLoadingSubtitle}>Your reward will arrive right after</Text>
            </View>
          )}

          {adState === 'failed' && (
            <View style={styles.adFailedContainer}>
              <Ionicons name="wifi-outline" size={44} color="#475569" />
              <Text style={styles.adFailedTitle}>No ad available</Text>
              <Text style={styles.adFailedSubtitle}>Try again in a moment, or use coins instead</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => watchAdFor(adTarget)}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.notNowBtn} onPress={onClose}>
                <Text style={styles.notNowText}>Not now</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </Pressable>

      {/* IAP purchase confirmation */}
      {confirmItem && (
        <PurchaseConfirmModal
          visible={!!confirmItem}
          productName={confirmItem.name}
          price={confirmItem.price}
          onConfirm={handleConfirmPurchase}
          onCancel={() => setConfirmItem(null)}
          isPurchasing={isPurchasing}
        />
      )}
    </Modal>
  );
}
// ---------------------------------------------------------------------------
// Level-pack paywall modal
// ---------------------------------------------------------------------------
function LevelPackModal({
  visible, onClose, onPurchased,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const { offerings, purchase, isPurchasing } = useSubscription();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const levelPackPkg = offerings?.current?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_LEVEL_PACK,
  );

  const handleBuy = async () => {
    if (!levelPackPkg) return;
    setConfirmVisible(true);
  };

  const handleConfirm = async () => {
    if (!levelPackPkg) return;
    try {
      await purchase(levelPackPkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmVisible(false);
      onPurchased();
      onClose();
    } catch {
      setConfirmVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.outOfHintsBackdrop}>
        <View style={[styles.outOfHintsCard, { paddingBottom: 28 }]}>
          <Text style={styles.outOfHintsEmoji}>🚀</Text>
          <Text style={styles.outOfHintsTitle}>You've finished all 1,000 free levels!</Text>
          <Text style={styles.outOfHintsDesc}>
            Get the Level Pack to unlock 1,001+ puzzles — harder, deeper, endless fun.
          </Text>
          <View style={{ width: '100%', gap: 10 }}>
            {levelPackPkg ? (
              <TouchableOpacity
                style={styles.outOfHintsBuyBtn}
                onPress={handleBuy}
                activeOpacity={0.85}
                disabled={isPurchasing}
              >
                <LinearGradient
                  colors={['#7C3AED', '#A855F7']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.outOfHintsBuyGradient}
                >
                  <Ionicons name="infinite-outline" size={18} color="#FFF" />
                  <Text style={styles.outOfHintsBuyText}>
                    Unlock Level Pack · {levelPackPkg.product.priceString}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <ActivityIndicator color="#A855F7" style={{ marginVertical: 12 }} />
            )}
            <TouchableOpacity style={styles.notNowBtn} onPress={onClose}>
              <Text style={styles.notNowText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {confirmVisible && levelPackPkg && (
        <PurchaseConfirmModal
          visible={confirmVisible}
          productName={levelPackPkg.product.title || 'Level Pack'}
          price={levelPackPkg.product.priceString}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmVisible(false)}
          isPurchasing={isPurchasing}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Stuck intervention modal
// ---------------------------------------------------------------------------
function StuckModal({
  visible, adState, onWatchAd, onKeepTrying,
}: {
  visible: boolean;
  adState: 'idle' | 'loading' | 'failed';
  onWatchAd: () => void;
  onKeepTrying: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onKeepTrying}>
      <View style={styles.outOfHintsBackdrop}>
        <View style={styles.outOfHintsCard}>
          <Text style={styles.outOfHintsEmoji}>😅</Text>
          <Text style={styles.outOfHintsTitle}>Feeling Stuck?</Text>
          <Text style={styles.outOfHintsDesc}>
            Watch a short ad to reveal the best next move — no coins needed
          </Text>
          {adState === 'idle' && (
            <TouchableOpacity style={styles.outOfHintsBuyBtn} onPress={onWatchAd} activeOpacity={0.85}>
              <LinearGradient
                colors={['#065F46', '#10B981']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.outOfHintsBuyGradient}
              >
                <Ionicons name="play-circle-outline" size={18} color="#FFF" />
                <Text style={styles.outOfHintsBuyText}>Watch Ad for a Free Hint</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {adState === 'loading' && <ActivityIndicator color="#10B981" style={{ marginVertical: 12 }} />}
          {adState === 'failed' && (
            <Text style={[styles.outOfHintsDesc, { color: '#F87171' }]}>
              No ad available right now — try again later
            </Text>
          )}
          <TouchableOpacity style={styles.notNowBtn} onPress={onKeepTrying}>
            <Text style={styles.notNowText}>Keep trying</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
// ---------------------------------------------------------------------------
// Undo modal — watch an ad or spend 20 coins to undo the last move
// ---------------------------------------------------------------------------
function UndoModal({
  visible,
  coins,
  adsEnabled,
  adState,
  onWatchAd,
  onSpendCoins,
  onClose,
}: {
  visible: boolean;
  coins: number;
  adsEnabled: boolean;
  adState: 'idle' | 'loading' | 'failed';
  onWatchAd: () => void;
  onSpendCoins: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  const canAfford = coins >= UNDO_COST;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.outOfHintsBackdrop}>
        <View style={styles.outOfHintsCard}>
          <Text style={styles.outOfHintsEmoji}>↩️</Text>
          <Text style={styles.outOfHintsTitle}>Undo Last Move</Text>
          <Text style={styles.outOfHintsDesc}>
            Take back your last move and try a different approach
          </Text>

          {/* Watch Ad option — shown when ads are enabled */}
          {adsEnabled && adState === 'idle' && (
            <TouchableOpacity
              style={styles.outOfHintsBuyBtn}
              onPress={onWatchAd}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#065F46', '#10B981']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.outOfHintsBuyGradient}
              >
                <Ionicons name="play-circle-outline" size={18} color="#FFF" />
                <Text style={styles.outOfHintsBuyText}>Watch Ad · Free</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {adsEnabled && adState === 'loading' && (
            <ActivityIndicator color="#10B981" style={{ marginVertical: 12 }} />
          )}
          {adsEnabled && adState === 'failed' && (
            <Text style={[styles.outOfHintsDesc, { color: '#F87171', marginTop: 4 }]}>
              No ad available right now
            </Text>
          )}

          {/* Spend coins option */}
          <TouchableOpacity
            style={[styles.outOfHintsBuyBtn, { marginTop: 4, opacity: canAfford ? 1 : 0.45 }]}
            onPress={onSpendCoins}
            activeOpacity={canAfford ? 0.85 : 1}
            disabled={!canAfford}
          >
            <LinearGradient
              colors={canAfford ? ['#78350F', '#D97706'] : ['#374151', '#4B5563']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.outOfHintsBuyGradient}
            >
              <Text style={styles.outOfHintsBuyText}>
                {canAfford ? `Spend ${UNDO_COST} 🪙` : `Need ${UNDO_COST} 🪙 (have ${coins})`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notNowBtn} onPress={onClose}>
            <Text style={styles.notNowText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Starter offer modal — shown once after completing level 5 for the first time
// ---------------------------------------------------------------------------
const STARTER_OFFER_SHOWN_KEY = '@color_sort_starter_offer_shown_v1';
/** Level that triggers the one-time starter offer. */
const STARTER_OFFER_TRIGGER_LEVEL = 5;

function StarterOfferModal({
  visible,
  onClose,
  onPurchaseSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
}) {
  const { offerings, purchase, isPurchasing } = useSubscription();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const currentOffering = offerings?.current;

  // Prefer a dedicated discounted package; fall back to the regular Remove Ads SKU.
  const starterPkg =
    currentOffering?.availablePackages.find(
      (p) => p.identifier === RC_PACKAGE_STARTER_BUNDLE,
    ) ??
    currentOffering?.availablePackages.find(
      (p) => p.identifier === RC_PACKAGE_REMOVE_ADS,
    );

  const priceString = starterPkg?.product.priceString ?? '$1.99';

  const handleBuyPress = () => {
    if (!starterPkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmVisible(true);
  };

  const handleConfirm = async () => {
    if (!starterPkg) return;
    try {
      await purchase(starterPkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmVisible(false);
      onPurchaseSuccess();
      onClose();
    } catch (e: any) {
      setConfirmVisible(false);
      const cancelled =
        e?.userCancelled === true ||
        String(e?.code ?? '').includes('CANCELLED') ||
        String(e?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) {
        Alert.alert(
          'Purchase Failed',
          'Could not reach the store. Please check your connection and try again.',
          [{ text: 'OK' }],
        );
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={starterStyles.backdrop}>
        <Animated.View style={starterStyles.card}>
          {/* Gold banner */}
          <LinearGradient
            colors={['#78350F', '#D97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={starterStyles.banner}
          >
            <Text style={starterStyles.bannerLabel}>🎁 WELCOME OFFER</Text>
            <Text style={starterStyles.bannerSub}>One time only</Text>
          </LinearGradient>

          <View style={starterStyles.body}>
            <Text style={starterStyles.emoji}>🚀</Text>
            <Text style={starterStyles.title}>Starter Bundle</Text>
            <Text style={starterStyles.subtitle}>
              Everything you need to level up — at a special new-player price
            </Text>

            {/* Bundle contents */}
            <View style={starterStyles.contentsBox}>
              <View style={starterStyles.contentRow}>
                <Text style={starterStyles.contentIcon}>🪙</Text>
                <Text style={starterStyles.contentText}>{STARTER_BUNDLE_COINS} Bonus Coins</Text>
              </View>
              <View style={starterStyles.divider} />
              <View style={starterStyles.contentRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#F87171" />
                <Text style={starterStyles.contentText}>Remove Ads — forever</Text>
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={starterStyles.buyBtn}
              onPress={handleBuyPress}
              activeOpacity={0.85}
              disabled={isPurchasing || !starterPkg}
            >
              <LinearGradient
                colors={['#78350F', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={starterStyles.buyGradient}
              >
                {isPurchasing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={starterStyles.buyText}>Get the Bundle</Text>
                    <Text style={starterStyles.buyPrice}>{priceString}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={starterStyles.notNowBtn} onPress={onClose}>
              <Text style={starterStyles.notNowText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {confirmVisible && starterPkg && (
        <PurchaseConfirmModal
          visible={confirmVisible}
          productName={`Starter Bundle — ${STARTER_BUNDLE_COINS} Coins + Remove Ads`}
          price={priceString}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmVisible(false)}
          isPurchasing={isPurchasing}
        />
      )}
    </Modal>
  );
}

const starterStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 310,
    backgroundColor: '#12100A',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  banner: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  bannerLabel: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#FDE68A',
    letterSpacing: 2,
  },
  bannerSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(253,230,138,0.7)',
    letterSpacing: 1,
  },
  body: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emoji: { fontSize: 40 },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 19,
  },
  contentsBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
    marginTop: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  contentIcon: { fontSize: 18 },
  contentText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#F8FAFC',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  buyBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  buyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  buyText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFF',
  },
  buyPrice: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.8)',
  },
  notNowBtn: {
    paddingVertical: 8,
  },
  notNowText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#475569',
  },
});

// ---------------------------------------------------------------------------
// Main game screen
// ---------------------------------------------------------------------------
export default function GameScreen() {
  const { level: levelParam, daily: dailyParam } = useLocalSearchParams<{
    level: string;
    daily: string;
  }>();
  const isDaily = dailyParam === 'true';
  const levelId = isDaily ? 0 : Math.max(1, parseInt(levelParam ?? '1', 10));
  const insets = useSafeAreaInsets();
  const {
    progress, completeLevel, completeDailyChallenge, coins, spendCoins,
    dailyProgress, adsEnabled, removeAds, earnCoins,
    hintsRemaining, addHints, creditHintPack, spendHint,
    setIsInGame, hasActiveSale, activateTimedSale,
  } = useGame();
  const { colorblind, skin } = useSettings();
  const { checkAchievements, toastQueue, dismissToast } = useAchievements();
  const { hasRemovedAds, hasLevelPack } = useSubscription();
  const { muted, toggleMute, playPour, playWin, playCoin, playHint } = useSound();

  // Mark the player as in-game so the app-open ad is suppressed if the OS
  // relaunches the app mid-level (e.g. after a phone call).
  useEffect(() => {
    setIsInGame(true);
    return () => { setIsInGame(false); };
  }, [setIsInGame]);

  // Sync RevenueCat "remove_ads" entitlement → GameContext
  useEffect(() => {
    if (hasRemovedAds) { removeAds(); }
  }, [hasRemovedAds]);

  const levelData = useMemo(() => {
    if (isDaily) return generateDailyLevel();
    if (levelId >= 1 && levelId <= LEVELS.length) return LEVELS[levelId - 1];
    return generateLevel(levelId);
  }, [levelId, isDaily]);

  const [tubes, setTubes]           = useState<GameState>(() => levelData.tubes.map((t) => [...t]));
  const [selected, setSelected]     = useState<number | null>(null);
  const [moves, setMoves]           = useState(0);
  const [won, setWon]               = useState(false);
  const [history, setHistory]       = useState<GameState[]>([]);
  const [showShop, setShowShop]         = useState(false);
  const [showOutOfHints, setShowOutOfHints] = useState(false);
  const [showStarterOffer, setShowStarterOffer] = useState(false);
  // Tracks consent state so the banner hides immediately if the player opts out
  const [canShowAds, setCanShowAds] = useState(() => canRequestAds());
  const [extraTubesUsed, setExtraTubesUsed] = useState(0);
  const [coinsEarned, setCoinsEarned]       = useState(0);
  const [restartCount, setRestartCount]         = useState(0);
  const [showStuckModal, setShowStuckModal]     = useState(false);
  const [stuckAdState, setStuckAdState]         = useState<'idle' | 'loading' | 'failed'>('idle');
  const [showUndoModal, setShowUndoModal]       = useState(false);
  const [undoAdState, setUndoAdState]           = useState<'idle' | 'loading' | 'failed'>('idle');
  const [milestoneCoins, setMilestoneCoins]     = useState(0);
  const [showMilestoneModal, setShowMilestoneModal]       = useState(false);
  const [showLevelPackPaywall, setShowLevelPackPaywall]   = useState(false);
  const hintTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerupsUsedRef = useRef(false);

  useEffect(() => {
    setTubes(levelData.tubes.map((t) => [...t]));
    setSelected(null); setMoves(0); setWon(false);
    setHistory([]); setExtraTubesUsed(0); setCoinsEarned(0);
    setRestartCount(0); setShowStuckModal(false);
    powerupsUsedRef.current = false;
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); };
  }, [levelId, isDaily, levelData]);

  const validDests = useMemo(() => {
    if (selected === null) return [];
    return getValidDestinations(tubes, selected);
  }, [tubes, selected]);

  const handleTubePress = useCallback((tubeIdx: number) => {
    if (won) return;
    if (selected === null) {
      if (tubes[tubeIdx].length > 0) { setSelected(tubeIdx); Haptics.selectionAsync(); }
      return;
    }
    if (selected === tubeIdx) { setSelected(null); return; }
    if (validDests.includes(tubeIdx)) {
      const newTubes = pourBalls(tubes, selected, tubeIdx);
      setHistory((prev) => [...prev, tubes]);
      setTubes(newTubes); setSelected(null);
      setMoves((m) => m + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playPour();
      if (isWon(newTubes)) {
        setWon(true);
        const finalMoves = moves + 1;
        if (isDaily && levelData.dateString) {
          completeDailyChallenge(levelData.dateString, finalMoves);
        } else {
          // Display coins earned (base rate + first-time bonus; replays earn 0)
          const isFirstTime = !progress.completedLevels.includes(levelId);
          const base = isFirstTime ? levelData.numColors * 2 + 5 : 0;
          const earned = hasActiveSale && base > 0 ? base * 2 : base;
          setCoinsEarned(earned);
          completeLevel(levelId, finalMoves);

          // One-time starter offer — trigger after completing the trigger level
          // Skip if the player already owns Remove Ads (no useful offer to show)
          if (isFirstTime && levelId === STARTER_OFFER_TRIGGER_LEVEL && !hasRemovedAds) {
            AsyncStorage.getItem(STARTER_OFFER_SHOWN_KEY).then((shown) => {
              if (shown === 'true') return;
              // Mark shown immediately so a race (rapid replay) can't double-show
              AsyncStorage.setItem(STARTER_OFFER_SHOWN_KEY, 'true').catch(() => {});
              // Delay so the win overlay appears first
              setTimeout(() => setShowStarterOffer(true), 1600);
            }).catch(() => {});
          } else if (isFirstTime && levelId === STARTER_OFFER_TRIGGER_LEVEL && hasRemovedAds) {
            // Player already owns Remove Ads — silently mark offer as shown
            AsyncStorage.setItem(STARTER_OFFER_SHOWN_KEY, 'true').catch(() => {});
          }

          // Increment module-level session counter for interstitial cadence
          sessionWins += 1;
          // After 3 session wins, activate the 2× timed sale
          if (sessionWins === 3) activateTimedSale();
          // When a free player clears the last free level, surface the pack offer
          if (isFirstTime && levelId >= TOTAL_LEVELS && !hasLevelPack) {
            setTimeout(() => setShowLevelPackPaywall(true), 1600);
          }
          // Coin chime after win fanfare
          setTimeout(() => playCoin(), 620);

          // Milestone reward
          if (isFirstTime) {
            const mBonus = MILESTONES[levelId];
            if (mBonus) {
              earnCoins(mBonus);
              setMilestoneCoins(mBonus);
              setTimeout(() => setShowMilestoneModal(true), 1400);
            }
          }

          // Achievement check
          const updatedCompleted = isFirstTime
            ? [...progress.completedLevels, levelId]
            : progress.completedLevels;
          const updatedBest = { ...progress.bestMoves, [levelId]: finalMoves };
          const bestVals = Object.values(updatedBest) as number[];
          checkAchievements({
            levelsCompleted: updatedCompleted.length,
            dailyStreak: dailyProgress.streak,
            minMovesEver: bestVals.length > 0 ? Math.min(...bestVals) : 0,
            hardLevelsCompleted: updatedCompleted.filter((l) => l >= 251).length,
            completedWithoutPowerups: isFirstTime && !powerupsUsedRef.current,
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Small delay so the pour sound finishes before the fanfare starts
        setTimeout(() => playWin(), 80);
      }
    } else {
      if (tubes[tubeIdx].length > 0) { setSelected(tubeIdx); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
      else setSelected(null);
    }
  }, [won, selected, tubes, validDests, levelId, moves, completeLevel, completeDailyChallenge, isDaily, levelData]);

  const handleRestart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTubes(levelData.tubes.map((t) => [...t]));
    setSelected(null); setMoves(0); setWon(false);
    setHistory([]); setExtraTubesUsed(0);
    powerupsUsedRef.current = false;
    setRestartCount((n) => {
      const next = n + 1;
      if (next >= 3) setTimeout(() => setShowStuckModal(true), 300);
      return next;
    });
  }, [levelData]);

  const applyUndo = useCallback(() => {
    if (history.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTubes(history[history.length - 1].map((t) => [...t]));
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
    setSelected(null);
    powerupsUsedRef.current = true;
  }, [history]);

  const handleUndoPress = useCallback(() => {
    if (won || isDaily || history.length === 0) return;
    setUndoAdState('idle');
    setShowUndoModal(true);
  }, [won, isDaily, history.length]);

  const applyHint = useCallback(() => {
    const hint = findHint(tubes);
    if (!hint) return;
    const [from] = hint;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setSelected(from);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playHint();
    hintTimerRef.current = setTimeout(() => setSelected(null), 2500);
  }, [tubes]);

  const handleHint = useCallback(() => {
    // Use hint pack first, then fall back to coins
    const usedPack = spendHint();
    if (usedPack) { powerupsUsedRef.current = true; applyHint(); return; }
    const ok = spendCoins(HINT_COST);
    if (ok) { powerupsUsedRef.current = true; applyHint(); }
    else { setShowOutOfHints(true); }
  }, [spendHint, spendCoins, applyHint]);

  const handleAddTube = useCallback(() => {
    setTubes((prev) => [...prev, []]);
    setExtraTubesUsed((n) => n + 1);
    setSelected(null);
    powerupsUsedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const handleAddTubeWithCoins = useCallback(() => {
    const ok = spendCoins(TUBE_COST);
    if (ok) handleAddTube();
  }, [spendCoins, handleAddTube]);

  const handleHintWithCoins = useCallback(() => {
    const ok = spendCoins(HINT_COST);
    if (ok) applyHint();
  }, [spendCoins, applyHint]);

  const handleSkipLevel = useCallback(() => {
    const ok = spendCoins(SKIP_COST);
    if (ok) {
      completeLevel(levelId, 999);
      router.replace({ pathname: '/game', params: { level: String(levelId + 1) } });
    }
  }, [spendCoins, completeLevel, levelId]);

  const handleNext = useCallback(() => {
    // Free players who finished the last free level — show the pack offer
    if (levelId >= TOTAL_LEVELS && !hasLevelPack) {
      setShowLevelPackPaywall(true);
      return;
    }
    // Paid players (or still within free levels) — continue normally
    if (!isDaily && adsEnabled && sessionWins > 0 && sessionWins % INTERSTITIAL_INTERVAL === 0) {
      showInterstitialAd(() => {
        router.replace({ pathname: '/game', params: { level: String(levelId + 1) } });
      });
    } else {
      router.replace({ pathname: '/game', params: { level: String(levelId + 1) } });
    }
  }, [levelId, isDaily, adsEnabled, hasLevelPack]);

  const handleMenu = useCallback(() => router.replace('/'), []);

  // ---------------------------------------------------------------------------
  // Dynamic tube layout
  // Calculates how many rows and what tube scale to use so all tubes (including
  // any extra ones added by the player) always fit within the screen width.
  // ---------------------------------------------------------------------------
  const { width: screenWidth } = useWindowDimensions();
  const HORIZ_PAD    = 16;
  const TUBE_SIDE_GAP = 5;   // margin on each side of every tube
  const MIN_SCALE    = 0.60; // absolute floor; below this the tubes are unplayable
  const availableWidth = screenWidth - HORIZ_PAD * 2;
  const tubeCount = tubes.length;

  // Try 2 rows first; if the tubes won't fit at MIN_SCALE, move to 3 rows.
  let numRows = 2;
  let cols = Math.ceil(tubeCount / numRows);
  let tubeScale = Math.min(1.0, (availableWidth - cols * TUBE_SIDE_GAP * 2) / (cols * TUBE_WIDTH));

  if (tubeScale < MIN_SCALE) {
    numRows = 3;
    cols    = Math.ceil(tubeCount / numRows);
    tubeScale = Math.min(1.0, (availableWidth - cols * TUBE_SIDE_GAP * 2) / (cols * TUBE_WIDTH));
    tubeScale = Math.max(MIN_SCALE, tubeScale);
  }

  const scaledTubeWidth  = Math.round(TUBE_WIDTH  * tubeScale);
  const scaledTubeHeight = Math.round(TUBE_HEIGHT * tubeScale);
  const scaledBallSize   = Math.round(BALL_SIZE   * tubeScale);
  const tubeGap          = Math.round(TUBE_SIDE_GAP * tubeScale);
  const rowGap           = tubeScale < 0.8 ? 10 : 16;

  const webTopPad    = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const canUseHint = hintsRemaining > 0 || coins >= HINT_COST;
  const hasHint = findHint(tubes) !== null;

  return (
    <LinearGradient
      colors={isDaily ? ['#0A0600', '#1C0F00', '#0A0600'] : ['#0A0A1A', '#150A2E', '#0A0A1A']}
      style={styles.screen}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + webTopPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}
          hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {isDaily ? (
            <>
              <Text style={styles.dailyHeaderLabel}>DAILY CHALLENGE</Text>
              <Text style={styles.dailyHeaderDate}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Text style={styles.levelNum}>{levelId}</Text>
            </>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Coin balance */}
          <View style={styles.coinChip}>
            <Text style={styles.coinChipIcon}>🪙</Text>
            <Text style={styles.coinChipAmount}>{coins}</Text>
          </View>
          {/* Moves */}
          <View style={styles.movesChip}>
            <Ionicons name="swap-horizontal-outline" size={14} color="#94A3B8" />
            <Text style={styles.movesCount}>{moves}</Text>
          </View>
          <TouchableOpacity onPress={handleRestart} style={styles.headerBtn}
            hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Ionicons name="refresh-outline" size={22} color="#F8FAFC" />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleMute} style={styles.headerBtn}
            hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Ionicons name={muted ? 'volume-mute-outline' : 'volume-medium-outline'} size={20} color={muted ? '#475569' : '#F8FAFC'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily streak pill */}
      {isDaily && dailyProgress.streak > 0 && (
        <View style={styles.streakPill}>
          <Text style={styles.streakPillText}>🔥 {dailyProgress.streak} day streak</Text>
        </View>
      )}

      {/* Game area — multi-row, dynamically scaled to always fit the screen */}
      <View style={styles.gameArea}>
        {Array.from({ length: numRows }).map((_, rowIdx) => {
          const startIdx = rowIdx * cols;
          const rowTubes = tubes.slice(startIdx, startIdx + cols);
          if (rowTubes.length === 0) return null;
          return (
            <React.Fragment key={rowIdx}>
              {rowIdx > 0 && <View style={{ height: rowGap }} />}
              <View style={styles.tubeRow}>
                {rowTubes.map((tube, colIdx) => {
                  const tubeIdx = startIdx + colIdx;
                  return (
                    <View key={colIdx} style={{ marginHorizontal: tubeGap }}>
                      <TubeView
                        tube={tube}
                        selected={selected === tubeIdx}
                        canReceive={validDests.includes(tubeIdx)}
                        onPress={() => handleTubePress(tubeIdx)}
                        tubeWidth={scaledTubeWidth}
                        tubeHeight={scaledTubeHeight}
                        ballSize={scaledBallSize}
                        colorblind={colorblind}
                        skin={skin}
                      />
                    </View>
                  );
                })}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + webBottomPad + 16 }]}>
        {/* Undo — hidden when won or in daily challenge mode */}
        {!won && !isDaily && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.undoBtn, history.length === 0 && styles.actionBtnDisabled]}
            onPress={handleUndoPress}
            disabled={history.length === 0}
          >
            <Ionicons name="arrow-undo" size={20} color={history.length > 0 ? '#60A5FA' : '#374151'} />
            <Text style={[styles.actionText, { color: history.length > 0 ? '#60A5FA' : '#374151' }]}>Undo</Text>
          </TouchableOpacity>
        )}

        {/* Banner ad — hidden when player removed ads or opted out of tracking */}
        {adsEnabled && canShowAds && (
          <View style={styles.bannerWrap}><AdBanner /></View>
        )}

        {/* Hint */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.hintBtn, (!hasHint) && styles.actionBtnDisabled]}
          onPress={handleHint} disabled={!hasHint}>
          <Ionicons name="bulb-outline" size={20} color={canUseHint ? '#EAB308' : '#64748B'} />
          <Text style={[styles.actionText, { color: canUseHint ? '#EAB308' : '#64748B' }]}>
            {hintsRemaining > 0 ? `${hintsRemaining}💡` : `${HINT_COST}🪙`}
          </Text>
        </TouchableOpacity>

        {/* Shop */}
        <TouchableOpacity style={[styles.actionBtn, styles.shopBtn]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowShop(true); }}>
          <Ionicons name="storefront-outline" size={20} color="#A855F7" />
          <Text style={[styles.actionText, { color: '#A855F7' }]}>Shop</Text>
          {extraTubesUsed > 0 && (
            <View style={styles.shopBadge}><Text style={styles.shopBadgeText}>{extraTubesUsed}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {won && (
        <WinOverlay
          levelId={levelId}
          moves={moves}
          coinsEarned={coinsEarned}
          isDaily={isDaily}
          dateString={levelData.dateString}
          streak={isDaily ? dailyProgress.streak : undefined}
          isLastLevel={!isDaily && levelId >= TOTAL_LEVELS && !hasLevelPack}
          onNext={handleNext}
          onMenu={handleMenu}
        />
      )}

      <PowerUpModal
        visible={showShop}
        coins={coins}
        hintsRemaining={hintsRemaining}
        adsEnabled={adsEnabled}
        onClose={() => setShowShop(false)}
        onHint={handleHintWithCoins}
        onTubeAdded={handleAddTubeWithCoins}
        onSkipLevel={handleSkipLevel}
        onConsentChanged={() => setCanShowAds(canRequestAds())}
        onPurchaseComplete={(type) => {
          if (type === 'remove_ads') removeAds();
          // creditHintPack adds 10 hints AND advances the reconciliation
          // watermark so the purchase is not double-credited when RC customer
          // info refreshes and HintReconciliationBridge fires.
          else if (type === 'hints_10') creditHintPack();
        }}
      />

      <OutOfHintsModal
        visible={showOutOfHints}
        onClose={() => setShowOutOfHints(false)}
        onPurchaseComplete={() => creditHintPack()}
      />

      <LevelPackModal
        visible={showLevelPackPaywall}
        onClose={() => setShowLevelPackPaywall(false)}
        onPurchased={() => {
          // Immediately navigate to level 1001 after purchase
          router.replace({ pathname: '/game', params: { level: String(PAID_LEVELS_START) } });
        }}
      />

      <AchievementToast achievement={toastQueue[0] ?? null} onDismiss={dismissToast} />

      <MilestoneModal
        visible={showMilestoneModal}
        levelId={levelId}
        bonusCoins={milestoneCoins}
        onClaim={() => setShowMilestoneModal(false)}
      />

      <StuckModal
        visible={showStuckModal && !won}
        adState={stuckAdState}
        onWatchAd={() => {
          setStuckAdState('loading');
          setShowStuckModal(false);
          showRewardedAd(
            () => { powerupsUsedRef.current = true; applyHint(); setStuckAdState('idle'); },
            () => { setStuckAdState('failed'); },
          );
        }}
        onKeepTrying={() => setShowStuckModal(false)}
      />

      <UndoModal
        visible={showUndoModal}
        coins={coins}
        adsEnabled={adsEnabled}
        adState={undoAdState}
        onWatchAd={() => {
          setUndoAdState('loading');
          showRewardedAd(
            () => {
              // Rewarded — apply the undo
              setShowUndoModal(false);
              setUndoAdState('idle');
              applyUndo();
            },
            () => {
              // Ad failed or skipped — stay in modal with failed state
              setUndoAdState('failed');
            },
          );
        }}
        onSpendCoins={() => {
          const ok = spendCoins(UNDO_COST);
          if (ok) {
            setShowUndoModal(false);
            setUndoAdState('idle');
            applyUndo();
          }
        }}
        onClose={() => { setShowUndoModal(false); setUndoAdState('idle'); }}
      />

      <StarterOfferModal
        visible={showStarterOffer}
        onClose={() => setShowStarterOffer(false)}
        onPurchaseSuccess={() => {
          removeAds();
          earnCoins(STARTER_BUNDLE_COINS);
        }}
      />
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  levelLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#64748B', letterSpacing: 3 },
  levelNum: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#F8FAFC', lineHeight: 30 },
  dailyHeaderLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#D97706', letterSpacing: 2 },
  dailyHeaderDate: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FDE68A', lineHeight: 24 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(234,179,8,0.12)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)' },
  coinChipIcon: { fontSize: 12 },
  coinChipAmount: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  movesChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  movesCount: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#94A3B8' },
  streakPill: { alignSelf: 'center', backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 4 },
  streakPillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FDE68A' },
  gameArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tubeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  tubeWrap: {},
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', gap: 3, width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)' },
  actionBtnDisabled: { opacity: 0.35 },
  actionText: { fontSize: 10, fontFamily: 'Inter_500Medium', color: '#F8FAFC' },
  hintBtn: { backgroundColor: 'rgba(234,179,8,0.1)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)' },
  undoBtn: { backgroundColor: 'rgba(96,165,250,0.1)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)' },
  shopBtn: { backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)', position: 'relative' },
  shopBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#A855F7', borderRadius: 5, minWidth: 13, height: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  shopBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: '#fff' },
  bannerWrap: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12 },
  // Win overlay
  winOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  confettiContainer: { position: 'absolute', top: '35%', alignItems: 'center', justifyContent: 'center' },
  winCard: { width: 300, backgroundColor: '#1A1A2E', borderRadius: 28, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: 10 },
  winEmoji: { fontSize: 44 },
  winTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: '#F8FAFC' },
  winLevel: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#64748B' },
  allDoneSubtitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#F59E0B', letterSpacing: 0.5 },
  starsRow: { flexDirection: 'row', gap: 6 },
  movesText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#94A3B8' },
  coinsEarnedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)' },
  coinsEarnedIcon: { fontSize: 18 },
  coinsEarnedText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  winButtons: { flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'center', width: '100%' },
  menuBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  nextBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  nextGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  nextText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  shareBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  shareGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  shareText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  // Daily win card
  dailyWinCard: { padding: 0, overflow: 'hidden', borderColor: 'rgba(251,191,36,0.4)', backgroundColor: '#1A1000', gap: 0 },
  dailyWinBanner: { width: '100%', paddingVertical: 12, alignItems: 'center' },
  dailyWinBannerText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FDE68A', letterSpacing: 2 },
  dailyWinBody: { padding: 28, alignItems: 'center', gap: 12, width: '100%' },
  dailyWinDate: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#92400E' },
  dailyStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 },
  dailyStreakFire: { fontSize: 16 },
  dailyStreakText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FDE68A' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1A1A2E', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, maxHeight: '92%', borderTopWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 },
  coinBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)' },
  coinBalanceIcon: { fontSize: 22 },
  coinBalanceAmount: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  coinBalanceLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#EAB308', opacity: 0.7 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#F8FAFC', marginBottom: 16 },
  powerUpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  powerUpIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  powerUpInfo: { flex: 1 },
  powerUpName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  powerUpDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#64748B', marginTop: 2 },
  powerUpActions: { gap: 4, alignItems: 'flex-end' },
  coinBtn: { backgroundColor: 'rgba(234,179,8,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)' },
  coinBtnDisabled: { opacity: 0.4 },
  coinBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#EAB308' },
  adBtn: { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  adBtnText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#10B981' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },
  coinPacksSection: { marginTop: 8, gap: 8 },
  coinPacksTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#475569', marginBottom: 4 },
  coinPackRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  coinPackBest: { borderColor: 'rgba(168,85,247,0.4)', backgroundColor: 'rgba(168,85,247,0.08)', position: 'relative' },
  bestValueBadge: { position: 'absolute', top: -8, left: 16, backgroundColor: '#A855F7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  bestValueText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#FFF', letterSpacing: 0.5 },
  coinPackAmount: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  coinPackPrice: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#A855F7' },
  notNowBtn: { alignItems: 'center', paddingVertical: 12 },
  notNowText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#475569' },
  restoreBtn: { alignItems: 'center', paddingVertical: 10 },
  restoreBtnText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#7C3AED', textDecorationLine: 'underline' },
  restoreMessageText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginHorizontal: 20, marginTop: 4, marginBottom: 4 },
  restoreMessageOk: { color: '#10B981' },
  restoreMessageErr: { color: '#F87171' },
  removeAdsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(248,113,113,0.07)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', marginBottom: 4 },
  removeAdsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(248,113,113,0.12)', alignItems: 'center', justifyContent: 'center' },
  removeAdsTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  removeAdsPrice: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#F87171' },
  // Hints pack IAP row
  hintsPackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(167,139,250,0.07)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', marginBottom: 4 },
  hintsPackIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(167,139,250,0.12)', alignItems: 'center', justifyContent: 'center' },
  hintsPackTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  hintsPackPrice: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#A78BFA' },
  // Purchase confirmation modal
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  confirmCard: { width: 300, backgroundColor: '#1A1A2E', borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: 10 },
  confirmTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#F8FAFC' },
  confirmProduct: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#A78BFA', textAlign: 'center' },
  confirmPrice: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  confirmButtons: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  confirmCancel: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmCancelText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#94A3B8' },
  confirmBuy: { flex: 1, backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmBuyText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  // Out-of-hints paywall modal
  outOfHintsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  outOfHintsCard: { width: 300, backgroundColor: '#1A1A2E', borderRadius: 28, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', gap: 12 },
  outOfHintsEmoji: { fontSize: 48 },
  outOfHintsTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#F8FAFC' },
  outOfHintsDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center', lineHeight: 19 },
  outOfHintsBuyBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  outOfHintsBuyGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  outOfHintsBuyText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
  adLoadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  adLoadingTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  adLoadingSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center' },
  adFailedContainer: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  adFailedTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC', textAlign: 'center' },
  adFailedSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center', lineHeight: 18 },
  retryBtn: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 },
  retryBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#10B981' },
});
