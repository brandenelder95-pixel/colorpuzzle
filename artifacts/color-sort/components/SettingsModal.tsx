/**
 * SettingsModal — bottom sheet accessible from the home screen gear icon.
 *
 * Controls:
 *  • Colorblind mode — overlays letter labels on every ball
 *  • Volume          — 5 preset steps (0 → 100%)
 *  • Tube skin       — Default / Neon / Crystal
 */
import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Pressable, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettings, TubeSkin } from '@/context/SettingsContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const VOLUME_STEPS = [
  { label: '🔇', value: 0 },
  { label: '🔈', value: 0.25 },
  { label: '🔉', value: 0.5 },
  { label: '🔊', value: 0.75 },
  { label: '🔊+', value: 1.0 },
];

const SKIN_OPTIONS: { value: TubeSkin; label: string; desc: string; accent: string }[] = [
  { value: 'default', label: 'Glass',   desc: 'Classic frosted look', accent: 'rgba(255,255,255,0.14)' },
  { value: 'neon',    label: 'Neon',    desc: 'Glowing electric style', accent: '#22D3EE' },
  { value: 'crystal', label: 'Crystal', desc: 'Icy translucent finish', accent: '#E0F2FE' },
];

export function SettingsModal({ visible, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const { colorblind, setColorblind, volume, setVolume, skin, setSkin } = useSettings();

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 80, friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const activeStep = VOLUME_STEPS.findIndex((s) => s.value >= volume - 0.01 && s.value <= volume + 0.01);
  const closestStep = activeStep === -1
    ? VOLUME_STEPS.reduce((best, s, i) =>
        Math.abs(s.value - volume) < Math.abs(VOLUME_STEPS[best].value - volume) ? i : best, 0)
    : activeStep;

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
          // Prevent taps inside the sheet from closing it
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Settings</Text>

          {/* ── Colorblind Mode ── */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>👁</Text>
              <View>
                <Text style={styles.rowLabel}>Colorblind Mode</Text>
                <Text style={styles.rowDesc}>Shows a letter on every ball</Text>
              </View>
            </View>
            <Switch
              value={colorblind}
              onValueChange={(v) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setColorblind(v);
              }}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7C3AED' }}
              thumbColor={colorblind ? '#A855F7' : '#94A3B8'}
            />
          </View>

          <View style={styles.divider} />

          {/* ── Volume ── */}
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.rowIcon}>🔊</Text>
              <Text style={styles.rowLabel}>Sound Volume</Text>
            </View>
            <View style={styles.volumeRow}>
              {VOLUME_STEPS.map((step, i) => (
                <TouchableOpacity
                  key={step.value}
                  style={[
                    styles.volumeBtn,
                    i === closestStep && styles.volumeBtnActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setVolume(step.value);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[
                    styles.volumeLabel,
                    i === closestStep && styles.volumeLabelActive,
                  ]}>
                    {step.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* ── Tube Skin ── */}
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.rowIcon}>🎨</Text>
              <Text style={styles.rowLabel}>Tube Style</Text>
            </View>
            <View style={styles.skinRow}>
              {SKIN_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.skinCard,
                    skin === opt.value && styles.skinCardActive,
                    { borderColor: skin === opt.value ? opt.accent : 'rgba(255,255,255,0.08)' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSkin(opt.value);
                  }}
                  activeOpacity={0.75}
                >
                  {/* Mini tube preview */}
                  <View style={[styles.tubePrev, {
                    borderColor: opt.accent,
                    backgroundColor: opt.value === 'crystal'
                      ? 'rgba(224,242,254,0.12)'
                      : opt.value === 'neon'
                      ? 'rgba(34,211,238,0.08)'
                      : 'rgba(255,255,255,0.05)',
                  }]} />
                  <Text style={styles.skinLabel}>{opt.label}</Text>
                  <Text style={styles.skinDesc}>{opt.desc}</Text>
                  {skin === opt.value && (
                    <Ionicons name="checkmark-circle" size={16} color="#A855F7" style={styles.skinCheck} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: 16,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#F8FAFC' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 22 },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  rowDesc:  { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#64748B', marginTop: 1 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  // Volume
  volumeRow: { flexDirection: 'row', gap: 6 },
  volumeBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  volumeBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: '#7C3AED',
  },
  volumeLabel: { fontSize: 16, color: '#64748B' },
  volumeLabelActive: { color: '#F8FAFC' },
  // Skins
  skinRow: { flexDirection: 'row', gap: 8 },
  skinCard: {
    flex: 1, padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5, alignItems: 'center', gap: 4,
    position: 'relative',
  },
  skinCardActive: { backgroundColor: 'rgba(168,85,247,0.1)' },
  tubePrev: {
    width: 22, height: 44, borderRadius: 10,
    borderWidth: 1.5, marginBottom: 2,
  },
  skinLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#F8FAFC' },
  skinDesc:  { fontSize: 9,  fontFamily: 'Inter_400Regular', color: '#64748B', textAlign: 'center' },
  skinCheck: { position: 'absolute', top: 4, right: 4 },
  // Done
  doneBtn: {
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    marginTop: 4,
  },
  doneBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#A855F7' },
});
