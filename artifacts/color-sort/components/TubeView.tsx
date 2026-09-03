import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { BALL_COLORS, BALL_SHADOW_COLORS, TubeState, isTubeComplete } from '@/utils/gameLogic';
import type { TubeSkin } from '@/context/SettingsContext';

// Default dimensions (used when no explicit size props are passed)
export const TUBE_WIDTH  = 58;
export const TUBE_HEIGHT = 216;
export const BALL_SIZE   = 46;

interface BallProps {
  color: string;
  size: number;
  colorblind?: boolean;
}

function Ball({ color, size, colorblind }: BallProps) {
  const scale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 180,
      friction: 8,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: BALL_COLORS[color],
          transform: [{ scale }],
          alignItems: 'center',
          justifyContent: 'center',
        },
        Platform.OS !== 'web'
          ? {
              shadowColor: BALL_SHADOW_COLORS[color],
              shadowOpacity: 0.6,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 6,
            }
          : {},
      ]}
    >
      {/* Gloss highlight */}
      <View
        style={{
          position: 'absolute',
          top: Math.round(size * 0.1),
          left: Math.round(size * 0.15),
          width: '38%',
          height: '32%',
          backgroundColor: 'rgba(255,255,255,0.38)',
          borderRadius: 20,
        }}
      />
      {/* Colorblind label — letter key centered on the ball */}
      {colorblind && (
        <Text
          style={{
            fontSize: Math.round(size * 0.38),
            fontFamily: 'Inter_700Bold',
            color: 'rgba(0,0,0,0.75)',
            lineHeight: Math.round(size * 0.42),
            includeFontPadding: false,
          }}
        >
          {color}
        </Text>
      )}
    </Animated.View>
  );
}

interface TubeViewProps {
  tube: TubeState;
  selected: boolean;
  canReceive: boolean;
  onPress: () => void;
  /** Override width — defaults to TUBE_WIDTH (58). */
  tubeWidth?: number;
  /** Override height — defaults to TUBE_HEIGHT (216). */
  tubeHeight?: number;
  /** Override ball diameter — defaults to BALL_SIZE (46). */
  ballSize?: number;
  /** When true, renders a letter on each ball for colorblind accessibility. */
  colorblind?: boolean;
  /** Visual skin — 'default' | 'neon' | 'crystal'. */
  skin?: TubeSkin;
}

export function TubeView({
  tube, selected, canReceive, onPress,
  tubeWidth  = TUBE_WIDTH,
  tubeHeight = TUBE_HEIGHT,
  ballSize   = BALL_SIZE,
  colorblind = false,
  skin       = 'default',
}: TubeViewProps) {
  const completed = isTubeComplete(tube);

  // Base border color — modified by skin below
  const baseBorderColor = selected
    ? '#8B5CF6'
    : canReceive
    ? '#10B981'
    : completed
    ? '#F59E0B'
    : skin === 'neon'
    ? 'rgba(34,211,238,0.25)'
    : skin === 'crystal'
    ? 'rgba(224,242,254,0.2)'
    : 'rgba(255,255,255,0.14)';

  const borderWidth = selected || canReceive || completed ? 2.5 : 1;

  // Glow / shadow color
  const shadowColor = selected ? '#8B5CF6' : canReceive ? '#10B981' :
    skin === 'neon' ? '#22D3EE' : 'transparent';
  const shadowOpacity = (selected || canReceive || skin === 'neon') ? 0.7 : 0;

  // Tube background
  const tubeBg = skin === 'crystal'
    ? 'rgba(224,242,254,0.1)'
    : skin === 'neon'
    ? 'rgba(0,0,0,0.35)'
    : 'rgba(255,255,255,0.05)';

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (selected || canReceive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [selected, canReceive]);

  const slotSize = ballSize;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Animated.View
        style={[
          {
            width:  tubeWidth,
            height: tubeHeight,
            borderRadius: 30,
            borderTopLeftRadius:  Math.round(tubeWidth * 0.2),
            borderTopRightRadius: Math.round(tubeWidth * 0.2),
            backgroundColor: tubeBg,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: Math.round(tubeHeight * 0.046),
            paddingTop:    Math.round(tubeHeight * 0.046),
            gap: Math.max(2, Math.round(tubeHeight * 0.018)),
            overflow: 'visible',
            borderColor: baseBorderColor,
            borderWidth,
            transform: [{ scale: pulseAnim }],
          },
          Platform.OS !== 'web'
            ? {
                shadowColor,
                shadowOpacity,
                shadowRadius: skin === 'neon' ? 16 : 12,
                shadowOffset: { width: 0, height: 0 },
                elevation: 10,
              }
            : {},
        ]}
      >
        {/* Render 4 slots top (tube[3]) → bottom (tube[0]) */}
        {[3, 2, 1, 0].map((idx) => {
          const ball = tube[idx];
          return (
            <View
              key={idx}
              style={{ width: slotSize, height: slotSize, alignItems: 'center', justifyContent: 'center' }}
            >
              {ball ? (
                <Ball color={ball} size={slotSize} colorblind={colorblind} />
              ) : (
                <View
                  style={{
                    width: slotSize,
                    height: slotSize,
                    borderRadius: slotSize / 2,
                    backgroundColor: skin === 'crystal'
                      ? 'rgba(224,242,254,0.04)'
                      : 'rgba(255,255,255,0.03)',
                    borderWidth: 1,
                    borderColor: skin === 'crystal'
                      ? 'rgba(224,242,254,0.1)'
                      : 'rgba(255,255,255,0.07)',
                  }}
                />
              )}
            </View>
          );
        })}

        {/* Bottom rounded cap */}
        <View
          style={{
            position: 'absolute',
            bottom: -1,
            left: -1,
            right: -1,
            height: Math.max(10, Math.round(tubeHeight * 0.065)),
            backgroundColor: skin === 'crystal'
              ? 'rgba(224,242,254,0.1)'
              : skin === 'neon'
              ? 'rgba(34,211,238,0.05)'
              : 'rgba(255,255,255,0.07)',
            borderBottomLeftRadius:  30,
            borderBottomRightRadius: 30,
            borderWidth: 1,
            borderColor: baseBorderColor,
            borderTopWidth: 0,
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}
