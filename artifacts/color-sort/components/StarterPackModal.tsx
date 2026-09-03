/**
 * StarterPackModal
 *
 * A one-time discounted offer shown after the player completes their 5th level.
 * Falls back gracefully if the remove_ads package hasn't loaded from RevenueCat.
 */
import React, { useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSubscription, RC_PACKAGE_REMOVE_ADS } from '@/lib/revenuecat';
import { useGame } from '@/context/GameContext';
import { useSettings } from '@/context/SettingsContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function StarterPackModal({ visible, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  const { offerings, purchase, isPurchasing } = useSubscription();
  const { removeAds, earnCoins, addHints }    = useGame();
  const { markStarterPackSeen }               = useSettings();

  const removeAdsPkg = offerings?.current?.availablePackages.find(
    (p) => p.identifier === RC_PACKAGE_REMOVE_ADS,
  );

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 9 }),
        Animated.timing(fade,  { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.85);
      fade.setValue(0);
    }
  }, [visible]);

  const handleClaim = async () => {
    if (!removeAdsPkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(removeAdsPkg);
      await removeAds();
      earnCoins(300);
      addHints(10);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markStarterPackSeen();
      onClose();
    } catch {
      // User cancelled or store error — just close
    }
  };

  const handleClose = () => {
    markStarterPackSeen();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          {/* Header */}
          <LinearGradient
            colors={['#065F46', '#047857']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>LIMITED OFFER</Text>
              </View>
            </View>
            <Text style={styles.bannerTitle}>Starter Pack 🎁</Text>
            <Text style={styles.bannerSub}>One-time deal — never shown again</Text>
          </LinearGradient>

          {/* Contents */}
          <View style={styles.body}>
            <Text style={styles.includesLabel}>Includes everything:</Text>

            {[
              { icon: 'shield-checkmark-outline', color: '#F87171', text: 'Remove Ads forever' },
              { icon: 'cash-outline',             color: '#EAB308', text: '+300 bonus coins' },
              { icon: 'bulb-outline',             color: '#A78BFA', text: '+10 hints stored forever' },
            ].map((item) => (
              <View key={item.text} style={styles.perk}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
                <Text style={styles.perkText}>{item.text}</Text>
              </View>
            ))}

            {/* CTA */}
            <TouchableOpacity
              style={styles.buyBtn}
              onPress={handleClaim}
              activeOpacity={0.85}
              disabled={isPurchasing || !removeAdsPkg}
            >
              <LinearGradient
                colors={['#065F46', '#10B981']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.buyGradient}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={18} color="#FFF" />
                    <Text style={styles.buyText}>
                      {removeAdsPkg
                        ? `Get Starter Pack · ${removeAdsPkg.product.priceString}`
                        : 'Get Starter Pack'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleClose} style={styles.noThanks}>
              <Text style={styles.noThanksText}>No thanks</Text>
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
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0F1A14',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  banner: { padding: 24, alignItems: 'center', gap: 6 },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#FFF',
    letterSpacing: 1.5,
  },
  bannerTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: '#ECFDF5' },
  bannerSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(236,253,245,0.65)' },
  body: { padding: 24, gap: 10 },
  includesLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#475569',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  buyBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  buyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  buyText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFF' },
  noThanks: { alignItems: 'center', paddingVertical: 8 },
  noThanksText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#475569' },
});
