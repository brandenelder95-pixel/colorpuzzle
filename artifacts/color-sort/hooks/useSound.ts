/**
 * useSound — lightweight sound playback hook for Color Sort.
 *
 * Loads bundled WAV assets via require() so expo-av can resolve them
 * on both iOS and Android without relying on data URIs.
 * Mute preference is persisted to AsyncStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MUTE_KEY = '@color_sort_muted_v1';

// Bundled assets — must be static require() calls so Metro can resolve them.
const ASSET_POUR = require('../assets/sounds/pour.wav');
const ASSET_WIN  = require('../assets/sounds/win.wav');
const ASSET_COIN = require('../assets/sounds/coin.wav');
const ASSET_HINT = require('../assets/sounds/hint.wav');

// Base volumes for each sound (used as a multiplier on the master volume).
const BASE_VOL_POUR = 0.85;
const BASE_VOL_WIN  = 1.0;
const BASE_VOL_COIN = 0.9;
const BASE_VOL_HINT = 0.75;

// Module-level sound objects — survive re-renders and screen navigations.
let _pour: Audio.Sound | null = null;
let _win:  Audio.Sound | null = null;
let _coin: Audio.Sound | null = null;
let _hint: Audio.Sound | null = null;
let _loaded  = false;
let _loading = false;

// Master volume (0.0 – 1.0). Adjusted by SettingsContext.
let _masterVolume = 1.0;

/**
 * Update the master volume and immediately apply it to all loaded sounds.
 * Called by SettingsContext whenever the player changes the volume setting.
 */
export function setMasterVolume(v: number) {
  _masterVolume = Math.max(0, Math.min(1, v));
  if (_pour) _pour.setVolumeAsync(BASE_VOL_POUR * _masterVolume).catch(() => {});
  if (_win)  _win.setVolumeAsync(BASE_VOL_WIN   * _masterVolume).catch(() => {});
  if (_coin) _coin.setVolumeAsync(BASE_VOL_COIN  * _masterVolume).catch(() => {});
  if (_hint) _hint.setVolumeAsync(BASE_VOL_HINT  * _masterVolume).catch(() => {});
}

async function loadAll() {
  if (_loaded || _loading) return;
  _loading = true;
  try {
    await Audio.setAudioModeAsync({
      // Keep playing through the iOS silent/ringer switch — we expose our
      // own mute toggle so the user is always in control.
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const [r1, r2, r3, r4] = await Promise.all([
      Audio.Sound.createAsync(ASSET_POUR, { shouldPlay: false, volume: BASE_VOL_POUR * _masterVolume }),
      Audio.Sound.createAsync(ASSET_WIN,  { shouldPlay: false, volume: BASE_VOL_WIN  * _masterVolume }),
      Audio.Sound.createAsync(ASSET_COIN, { shouldPlay: false, volume: BASE_VOL_COIN * _masterVolume }),
      Audio.Sound.createAsync(ASSET_HINT, { shouldPlay: false, volume: BASE_VOL_HINT * _masterVolume }),
    ]);
    _pour = r1.sound;
    _win  = r2.sound;
    _coin = r3.sound;
    _hint = r4.sound;
    _loaded = true;
  } catch (err) {
    console.warn('[Sound] Failed to load sounds:', err);
  }
  _loading = false;
}

/** Rewind to position 0 then play at base × master volume. */
async function playSound(sound: Audio.Sound | null, muted: boolean, baseVol: number) {
  if (muted || !sound) return;
  try {
    await sound.setVolumeAsync(baseVol * _masterVolume);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    // Silently ignore; most common cause is the audio session being
    // interrupted (phone call, backgrounding). Task #20 will add recovery.
    console.warn('[Sound] playback error:', err);
  }
}

export interface SoundControls {
  muted:      boolean;
  toggleMute: () => void;
  playPour:   () => void;
  playWin:    () => void;
  playCoin:   () => void;
  playHint:   () => void;
}

export function useSound(): SoundControls {
  const [muted, setMuted] = useState(false);
  // Ref mirrors state so stable callbacks always see the latest value.
  const mutedRef = useRef(false);

  useEffect(() => {
    // Restore persisted mute preference.
    AsyncStorage.getItem(MUTE_KEY).then((v) => {
      if (v === 'true') { setMuted(true); mutedRef.current = true; }
    });
    // Pre-load all sounds once.
    loadAll();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      AsyncStorage.setItem(MUTE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const playPour = useCallback(() => { playSound(_pour, mutedRef.current, BASE_VOL_POUR); }, []);
  const playWin  = useCallback(() => { playSound(_win,  mutedRef.current, BASE_VOL_WIN);  }, []);
  const playCoin = useCallback(() => { playSound(_coin, mutedRef.current, BASE_VOL_COIN); }, []);
  const playHint = useCallback(() => { playSound(_hint, mutedRef.current, BASE_VOL_HINT); }, []);

  return { muted, toggleMute, playPour, playWin, playCoin, playHint };
}
