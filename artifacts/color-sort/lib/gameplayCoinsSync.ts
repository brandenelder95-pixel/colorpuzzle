/**
 * Gameplay-coin sync utilities.
 *
 * Provides a stable anonymous player identity that survives app reinstall on iOS
 * (via Keychain through expo-secure-store) and server-side coin ledger sync so
 * gameplay-earned coins can be restored after reinstall.
 *
 * Security properties:
 *  - The server only accepts INCREASES to the stored total (GREATEST enforcement).
 *  - The server caps the total at MAX_GAMEPLAY_COINS so a tampered client cannot
 *    inflate the balance beyond what honest gameplay could earn.
 *  - All network failures are swallowed — the local AsyncStorage state remains the
 *    source of truth; the server is a durable backup, not the primary store.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key for the player UUID fallback (web / SecureStore failure). */
const PLAYER_ID_ASYNC_KEY = '@color_sort_player_id_v1';

/** UUID v4 regex for validation. */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** In-memory cache so we don't hit SecureStore on every call. */
let _cachedPlayerId: string | null = null;

/** Simple UUID v4 generator (does not need crypto-grade entropy for an anonymous game ID). */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Return (or create) a stable anonymous player ID.
 *
 * Storage priority:
 *  1. In-memory cache (fastest path after first call).
 *  2. expo-secure-store / iOS Keychain — survives app reinstall.
 *     Uses AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY so the value is tied to the
 *     device, not backed up to iCloud or transferred to a new device.
 *  3. AsyncStorage — fallback for web and SecureStore failures.
 *
 * On fresh install none of these have a value, so a new UUID is generated and
 * written to both stores for redundancy.
 */
export async function getOrCreatePlayerId(): Promise<string> {
  if (_cachedPlayerId) return _cachedPlayerId;

  // 1. Try Keychain / EncryptedSharedPreferences
  if (Platform.OS !== 'web') {
    try {
      const stored = await SecureStore.getItemAsync(PLAYER_ID_ASYNC_KEY, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      if (stored && UUID_V4_RE.test(stored)) {
        _cachedPlayerId = stored;
        return stored;
      }
    } catch {
      // SecureStore unavailable — fall through
    }
  }

  // 2. Try AsyncStorage fallback (web, emulator, SecureStore error)
  try {
    const stored = await AsyncStorage.getItem(PLAYER_ID_ASYNC_KEY);
    if (stored && UUID_V4_RE.test(stored)) {
      _cachedPlayerId = stored;
      // Best-effort backfill to SecureStore so a later reinstall picks it up
      if (Platform.OS !== 'web') {
        SecureStore.setItemAsync(PLAYER_ID_ASYNC_KEY, stored, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }).catch(() => {});
      }
      return stored;
    }
  } catch {
    // AsyncStorage failure — fall through to generate
  }

  // 3. Generate a new UUID and persist it everywhere
  const id = generateUUID();
  _cachedPlayerId = id;

  if (Platform.OS !== 'web') {
    SecureStore.setItemAsync(PLAYER_ID_ASYNC_KEY, id, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => {});
  }
  AsyncStorage.setItem(PLAYER_ID_ASYNC_KEY, id).catch(() => {});

  return id;
}

/** Derive the API base URL from the Expo public env var set in dev mode. */
function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return '';
}

/**
 * Push the player's total lifetime gameplay-earned coins to the server.
 *
 * The server enforces GREATEST() so this is safe to call with the current
 * local total — it can only increase the stored value, never decrease it.
 *
 * Returns the authoritative server total (always ≥ the value we sent).
 * Throws on network/server error — callers should swallow and retry later.
 */
export async function syncGameplayCoinsToServer(
  playerId: string,
  gameplayEarnedCoins: number,
): Promise<number> {
  const url = `${getApiBase()}/api/player-coins/${encodeURIComponent(playerId)}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameplayEarnedCoins }),
  });
  if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
  const data = (await resp.json()) as { gameplayEarnedCoins: number };
  return data.gameplayEarnedCoins;
}

/**
 * Fetch the player's stored gameplay-coin total from the server.
 *
 * Returns 0 if no record exists yet.
 * Throws on network/server error — callers should swallow.
 */
export async function fetchGameplayCoinsFromServer(
  playerId: string,
): Promise<number> {
  const url = `${getApiBase()}/api/player-coins/${encodeURIComponent(playerId)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
  const data = (await resp.json()) as { gameplayEarnedCoins: number };
  return data.gameplayEarnedCoins;
}
