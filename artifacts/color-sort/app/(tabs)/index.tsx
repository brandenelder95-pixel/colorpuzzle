import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useGame, DAILY_COIN_REWARD } from '@/context/GameContext';
import { useSettings } from '@/context/SettingsContext';
import { TubeView } from '@/components/TubeView';
import { SettingsModal } from '@/components/SettingsModal';
import { StarterPackModal } from '@/components/StarterPackModal';
import { TOTAL_LEVELS } from '@/utils/levels';

const DEMO_TUBES = [
  ['R', 'R', 'R', 'R'],
  ['G', 'G', 'G', 'G'],
  ['B', 'B', 'B', 'B'],
];

/** Format ms remaining into "Xh Ym left" */
function formatCountdown(expiry: number): string {
  const diff = expiry - Date.now();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    progress, coins, dailyProgress, isLevelCompleted, isDailyCompleted,
    canClaimDailyCoins, claimDailyCoins, hasActiveSale, timedSaleExpiry,
  } = useGame();
  const { colorblind, skin, starterPackSeen } = useSettings();

  const [showSettings, setShowSettings]       = useState(false);
  const [showStarterPack, setShowStarterPack] = useState(false);
  const [saleCountdown, setSaleCountdown]     = useState('');

  const today         = new Date().toDateString();
  const completedCount = progress.completedLevels.length;
  const dailyDone      = isDailyCompleted(today);
  const streak         = dailyProgress.streak;

  // Format today's date for display: "Wed, Jul 30"
  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, []);

  const nextLevel = useMemo(() => {
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      if (!isLevelCompleted(i)) return i;
    }
    return TOTAL_LEVELS;
  }, [isLevelCompleted]);

  // Starter pack: show once after completing 5 levels
  useEffect(() => {
    if (completedCount >= 5 && !starterPackSeen && !showStarterPack) {
      const timer = setTimeout(() => setShowStarterPack(true), 800);
      return () => clearTimeout(timer);
    }
  }, [completedCount, starterPackSeen]);

  // Timed sale countdown ticker
  useEffect(() => {
    if (!hasActiveSale || !timedSaleExpiry) {
      setSaleCountdown('');
      return;
    }
    const update = () => setSaleCountdown(formatCountdown(timedSaleExpiry));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [hasActiveSale, timedSaleExpiry]);

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/game', params: { level: String(nextLevel) } });
  };

  const handleLevels = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/levels');
  };

  const handleDaily = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/game', params: { daily: 'true' } });
  };

  const handleClaimReward = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    claimDailyCoins();
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <LinearGradient
      colors={['#0A0A1A', '#150A2E', '#0A0A1A']}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          {
            paddingTop: insets.top + webTopPad + 20,
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top row: coin balance + settings gear */}
        <View style={styles.topRow}>
          <View style={styles.coinRow}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.coinCount}>{coins}</Text>
            <Text style={styles.coinLabel}>coins</Text>
          </View>
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSettings(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={22} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 2× coin sale banner */}
        {hasActiveSale && saleCountdown ? (
          <View style={styles.saleBanner}>
            <Text style={styles.saleEmoji}>🎉</Text>
            <Text style={styles.saleText}>2× COINS ACTIVE</Text>
            <Text style={styles.saleCountdown}>{saleCountdown}</Text>
          </View>
        ) : null}

        {/* Demo tubes */}
        <View style={styles.heroTubes}>
          {DEMO_TUBES.map((tube, i) => (
            <TubeView
              key={i}
              tube={tube}
              selected={false}
              canReceive={false}
              onPress={() => {}}
              colorblind={colorblind}
              skin={skin}
            />
          ))}
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleLine1}>COLOR</Text>
          <Text style={styles.titleLine2}>SORT</Text>
          <Text style={styles.tagline}>Puzzle Game</Text>
        </View>

        {/* Daily Challenge card */}
        <TouchableOpacity
          style={styles.dailyCard}
          onPress={handleDaily}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={dailyDone ? ['#1A1400', '#2A1F00'] : ['#1C0F00', '#2D1800']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dailyGradient}
          >
            {/* Left: icon + labels */}
            <View style={styles.dailyLeft}>
              <View style={styles.dailyIconWrap}>
                <Text style={styles.dailyIcon}>{dailyDone ? '✅' : '🏆'}</Text>
              </View>
              <View>
                <Text style={styles.dailyTitle}>Daily Challenge</Text>
                <Text style={styles.dailyDate}>{todayLabel}</Text>
              </View>
            </View>

            {/* Right: streak + chevron */}
            <View style={styles.dailyRight}>
              {streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakCount}>{streak}</Text>
                </View>
              )}
              <Ionicons
                name={dailyDone ? 'checkmark-circle' : 'chevron-forward'}
                size={22}
                color={dailyDone ? '#F59E0B' : '#D97706'}
              />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Daily coin reward */}
        <TouchableOpacity
          style={[styles.rewardCard, !canClaimDailyCoins && styles.rewardCardClaimed]}
          onPress={canClaimDailyCoins ? handleClaimReward : undefined}
          activeOpacity={canClaimDailyCoins ? 0.8 : 1}
        >
          <Text style={styles.rewardIcon}>{canClaimDailyCoins ? '🎁' : '✅'}</Text>
          <Text style={[styles.rewardText, !canClaimDailyCoins && styles.rewardTextClaimed]}>
            {canClaimDailyCoins
              ? `Claim daily reward · 🪙 ${DAILY_COIN_REWARD}`
              : 'Daily coins claimed'}
          </Text>
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(completedCount / TOTAL_LEVELS) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {completedCount} / {TOTAL_LEVELS} levels complete
          </Text>
        </View>

        {/* Play button */}
        <TouchableOpacity
          style={styles.playBtn}
          onPress={handlePlay}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#7C3AED', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playGradient}
          >
            <Ionicons name="play" size={28} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={styles.playText}>
              {completedCount > 0 ? 'CONTINUE' : 'PLAY'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Level select link */}
        <TouchableOpacity onPress={handleLevels} style={styles.levelSelectBtn}>
          <Ionicons name="grid-outline" size={18} color="#94A3B8" />
          <Text style={styles.levelSelectText}>All Levels</Text>
        </TouchableOpacity>
      </ScrollView>

      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <StarterPackModal visible={showStarterPack} onClose={() => setShowStarterPack(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  // Top row with coin balance + gear
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(234,179,8,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.2)',
  },
  coinIcon: { fontSize: 18 },
  coinCount: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  coinLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#EAB308', opacity: 0.7 },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  // Timed sale banner
  saleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    width: '100%',
  },
  saleEmoji: { fontSize: 18 },
  saleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#C084FC',
    letterSpacing: 0.5,
  },
  saleCountdown: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#7C3AED',
  },
  // Hero tubes
  heroTubes: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  titleBlock: {
    alignItems: 'center',
  },
  titleLine1: {
    fontSize: 52,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 10,
  },
  titleLine2: {
    fontSize: 52,
    fontFamily: 'Inter_700Bold',
    color: '#A855F7',
    letterSpacing: 10,
    marginTop: -10,
  },
  tagline: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#64748B',
    letterSpacing: 4,
    marginTop: 6,
  },
  // Daily challenge card
  dailyCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  dailyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  dailyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dailyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyIcon: { fontSize: 22 },
  dailyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  dailyDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
    marginTop: 2,
  },
  dailyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakFire: { fontSize: 13 },
  streakCount: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#FDE68A' },
  // Progress
  progressBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#64748B',
  },
  playBtn: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  playGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  playText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  levelSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  levelSelectText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#94A3B8',
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.35)',
  },
  rewardCardClaimed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rewardIcon: { fontSize: 20 },
  rewardText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#EAB308',
  },
  rewardTextClaimed: {
    color: '#475569',
    fontFamily: 'Inter_400Regular',
  },
});
