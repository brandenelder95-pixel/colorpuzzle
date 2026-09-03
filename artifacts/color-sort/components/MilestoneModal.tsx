/**
 * MilestoneModal
 *
 * Shown when the player hits a milestone level (25, 50, 100, 250, 500)
 * for the first time. Celebrates with confetti and credits bonus coins.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  levelId: number;
  bonusCoins: number;
  onClaim: () => void;
}

function Sparkle({ delay }: { delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const x = Math.random() * 280 - 140;
  const size = 6 + Math.random() * 7;
  const colors = ['#F59E0B', '#FBBF24', '#A855F7', '#10B981', '#3B82F6', '#EF4444'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      opacity: a.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
      transform: [
        { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 240] }) },
        { scale:      a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) },
      ],
    }} />
  );
}

export function MilestoneModal({ visible, levelId, bonusCoins, onClaim }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(fade,  { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.7);
      fade.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const label = levelId >= 500 ? '🏆 All 500 Levels!' :
                levelId >= 250 ? '⚡ Halfway Through!' :
                levelId >= 100 ? '💯 Century Reached!' :
                levelId >= 50  ? '🔥 50 Levels Done!' :
                                 '🎯 First Milestone!';

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClaim}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        {/* Confetti */}
        <View style={styles.confetti}>
          {Array.from({ length: 28 }).map((_, i) => (
            <Sparkle key={i} delay={i * 30} />
          ))}
        </View>

        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={['#4C1D95', '#7C3AED']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <Text style={styles.bannerText}>MILESTONE REACHED</Text>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.levelText}>Level {levelId}</Text>

            <View style={styles.rewardBox}>
              <Text style={styles.rewardIcon}>🪙</Text>
              <Text style={styles.rewardAmount}>+{bonusCoins}</Text>
              <Text style={styles.rewardLabel}>bonus coins!</Text>
            </View>

            <TouchableOpacity style={styles.claimBtn} onPress={onClaim} activeOpacity={0.85}>
              <LinearGradient
                colors={['#7C3AED', '#A855F7']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.claimGradient}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.claimText}>Claim Reward</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: { position: 'absolute', top: '38%', alignItems: 'center' },
  card: {
    width: 300,
    backgroundColor: '#13102A',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
  },
  banner: { paddingVertical: 14, alignItems: 'center' },
  bannerText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#E9D5FF',
    letterSpacing: 2,
  },
  body: { padding: 28, alignItems: 'center', gap: 12 },
  label: { fontSize: 22, textAlign: 'center' },
  levelText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#7C3AED',
  },
  rewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
    marginVertical: 4,
  },
  rewardIcon:   { fontSize: 24 },
  rewardAmount: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#EAB308' },
  rewardLabel:  { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#EAB308', opacity: 0.7 },
  claimBtn:     { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  claimGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  claimText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
});
