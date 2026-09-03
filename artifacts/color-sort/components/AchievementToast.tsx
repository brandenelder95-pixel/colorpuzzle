/**
 * AchievementToast
 *
 * Slides in from the top when an achievement is unlocked, stays for 3 s,
 * then slides back out and calls onDismiss so the queue can advance.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Achievement } from '@/utils/achievements';

interface Props {
  achievement: Achievement | null;
  onDismiss: () => void;
}

export function AchievementToast({ achievement, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!achievement) return;

    // Slide in
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity,  { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss after 3 s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: -120, duration: 280, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,    duration: 280, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 3000);

    return () => {
      clearTimeout(timer);
      slideY.setValue(-120);
      opacity.setValue(0);
    };
  }, [achievement]);

  if (!achievement) return null;

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0) + 8;

  return (
    <Animated.View
      style={[styles.container, { top: topPad, opacity, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{achievement.icon}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label}>Achievement Unlocked!</Text>
        <Text style={styles.title}>{achievement.title}</Text>
        <Text style={styles.desc}>{achievement.desc}</Text>
      </View>
      <View style={styles.reward}>
        <Text style={styles.rewardText}>+{achievement.coins}🪙</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B3A',
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
    zIndex: 999,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 22 },
  textWrap: { flex: 1 },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#A855F7',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#F8FAFC' },
  desc:  { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#64748B', marginTop: 1 },
  reward: {
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.25)',
  },
  rewardText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#EAB308' },
});
