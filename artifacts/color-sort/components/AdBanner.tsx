// Web / Expo Go stub — real ad shown on native via AdBanner.native.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AdBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Ad Space</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  text: { fontSize: 11, color: '#374151' },
});
