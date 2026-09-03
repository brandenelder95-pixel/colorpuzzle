import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { TOTAL_LEVELS } from '@/utils/levels';

const LEVELS_PER_ROW = 5;

export default function LevelsScreen() {
  const insets = useSafeAreaInsets();
  const { isLevelUnlocked, isLevelCompleted, progress } = useGame();
  const completedCount = progress.completedLevels.length;
  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const handleLevel = (levelId: number) => {
    if (!isLevelUnlocked(levelId)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/game', params: { level: String(levelId) } });
  };

  const rows: number[][] = [];
  for (let i = 0; i < TOTAL_LEVELS; i += LEVELS_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(LEVELS_PER_ROW, TOTAL_LEVELS - i) }, (_, j) => i + j + 1)
    );
  }

  const getDifficulty = (levelId: number): string => {
    if (levelId <= 5) return 'Easy';
    if (levelId <= 15) return 'Medium';
    if (levelId <= 30) return 'Hard';
    return 'Expert';
  };

  const getDifficultyColor = (levelId: number): string => {
    if (levelId <= 5) return '#22C55E';
    if (levelId <= 15) return '#EAB308';
    if (levelId <= 30) return '#F97316';
    return '#EF4444';
  };

  return (
    <LinearGradient colors={['#0A0A1A', '#150A2E', '#0A0A1A']} style={styles.screen}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + webTopPad + 16 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>LEVELS</Text>
          <Text style={styles.headerSub}>
            {completedCount}/{TOTAL_LEVELS} complete
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(completedCount / TOTAL_LEVELS) * 100}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, rowIndex) => {
          const startLevel = rowIndex * LEVELS_PER_ROW + 1;
          const diff = getDifficulty(startLevel);
          const diffColor = getDifficultyColor(startLevel);
          const showDiffLabel =
            startLevel === 1 ||
            getDifficulty(startLevel) !== getDifficulty(startLevel - 1);

          return (
            <View key={rowIndex}>
              {showDiffLabel && (
                <Text style={[styles.diffLabel, { color: diffColor }]}>{diff}</Text>
              )}
              <View style={styles.row}>
                {row.map((levelId) => {
                  const unlocked = isLevelUnlocked(levelId);
                  const completed = isLevelCompleted(levelId);
                  return (
                    <TouchableOpacity
                      key={levelId}
                      style={[
                        styles.levelBtn,
                        completed && styles.levelBtnCompleted,
                        !unlocked && styles.levelBtnLocked,
                      ]}
                      onPress={() => handleLevel(levelId)}
                      activeOpacity={unlocked ? 0.75 : 1}
                    >
                      {completed ? (
                        <Ionicons name="checkmark" size={20} color="#F59E0B" />
                      ) : unlocked ? (
                        <Text style={styles.levelNum}>{levelId}</Text>
                      ) : (
                        <Ionicons name="lock-closed" size={16} color="#475569" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </LinearGradient>
  );
}

const BTN_SIZE = 56;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#F8FAFC',
    letterSpacing: 4,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#64748B',
    marginTop: 2,
  },
  progressWrap: { paddingHorizontal: 20, marginBottom: 8 },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  diffLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  levelBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBtnCompleted: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: '#F59E0B',
  },
  levelBtnLocked: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  levelNum: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#F8FAFC',
  },
});
