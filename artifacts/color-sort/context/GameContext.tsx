import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_LEVELS, coinsForLevel } from '@/utils/levels';
import { COIN_PACK_AMOUNTS } from '@/lib/revenuecat';

interface GameProgress {
  unlockedLevels: number;
  completedLevels: number[];
  bestMoves: Record<number, number>;
}

interface DailyProgress {
  lastPlayedDate: string | null;
  streak: number;
  bestMoves: Record<string, number>;
}

/**
 * Single persisted record for all hint state.
 *
 * Keeping balance and reconciledPacks in one JSON value means every mutation
 * is a single AsyncStorage.setItem call. A crash between two separate writes
 * could leave a stale watermark that permanently suppresses restoration or
 * causes a duplicate credit — combining them into one record eliminates that
 * failure mode entirely.
 *
 * Restore policy: reconciledPacks resets to 0 on reinstall (AsyncStorage is
 * wiped), so reconciliation will re-credit all RC-recorded packs. Players who
 * had spent some hints before reinstalling receive them back — this is
 * intentional because there is no server-side spend ledger.
 */
interface HintsLedger {
  balance: number;
  /** Watermark: number of hint packs whose credits have already been applied. */
  reconciledPacks: number;
}

/**
 * Single persisted record for all coin state.
 *
 * Keeping balance and reconciledCoins together means every mutation is a
 * single AsyncStorage.setItem call, eliminating partial-update failure modes.
 *
 * reconciledCoins is a watermark: the total coins already credited from RC
 * purchase history. On reinstall it resets to 0, so all purchased coins are
 * re-credited — intentional because there is no server-side spend ledger.
 *
 * reconciledGameplayCoins is a separate watermark: the running total of coins
 * ever earned from level completions. This value is synced to a server-side
 * ledger so that on reinstall the GameplayCoinsReconciliationBridge can read
 * it back and re-credit the difference (same pattern as reconciledCoins for
 * purchases, but sourced from the server rather than RC transactions).
 */
interface CoinsLedger {
  balance: number;
  /** Watermark: total coin-pack coins that have already been credited. */
  reconciledCoins: number;
  /**
   * Running total of coins ever earned from gameplay (level completions).
   * Synced to a server-side ledger so it survives reinstall.
   * On fresh install this is 0; on reinstall the bridge re-credits any gap
   * between the server total and this local watermark.
   */
  reconciledGameplayCoins: number;
}

interface GameContextType {
  progress: GameProgress;

  coins: number;

  hintsRemaining: number;

  dailyProgress: DailyProgress;
  /** Whether ads should be shown. False once the player purchases "Remove Ads". */

  adsEnabled: boolean;
  /**
   * True once AsyncStorage has finished loading all persisted state.
   * Gate any action that depends on the initial saved values on this flag —
   * defaults are unsafe until hydration completes.
   */

  adsHydrated: boolean;

  /**
   * True while the player is actively on the game screen (mid-level).
   * Used to suppress the app-open ad when the OS relaunches the app into
   * an active game — e.g. after a phone call or OS kill.
   */
  isInGame: boolean;
  setIsInGame: (value: boolean) => void;

  completeLevel: (levelId: number, moves: number) => Promise<void>;

  completeDailyChallenge: (dateString: string, moves: number) => Promise<void>;

  isLevelUnlocked: (levelId: number) => boolean;

  isLevelCompleted: (levelId: number) => boolean;

  isDailyCompleted: (dateString: string) => boolean;

  getBestMoves: (levelId: number) => number | null;

  getDailyBestMoves: (dateString: string) => number | null;

  resetProgress: () => Promise<void>;

  earnCoins: (amount: number) => void;

  spendCoins: (amount: number) => boolean;
  /**
   * Credit one coin pack after a direct in-app purchase.
   *
   * Atomically adds the pack's coin amount AND advances reconciledCoins in a
   * single ledger write so that when the RC customer-info query refreshes after
   * the purchase, CoinReconciliationBridge sees reconciledCoins already at the
   * new total and skips re-crediting.
   */
  creditCoinPack: (packId: string) => void;
  /**
   * Reconcile coins against RevenueCat purchase history.
   *
   * Pass the total coins represented by all coin-pack transactions ever recorded
   * by RC. Uses the watermark to credit only the gap not yet applied:
   *
   *   gap = totalPurchasedCoins - reconciledCoins
   *   if gap > 0: balance += gap, watermark = totalPurchasedCoins
   *
   * Both fields are written as a single JSON record — if the process is
   * interrupted mid-write, the next reconciliation will simply re-run with the
   * old watermark and produce the same result.
   *
   * Must only be called after `adsHydrated` is true so the watermark and
   * balance reflect the saved AsyncStorage values, not the initial defaults.
   */
  reconcileCoinsFromPurchases: (totalPurchasedCoins: number) => void;
  /**
   * Reconcile gameplay-earned coins against the server-stored total.
   *
   * Pass the total gameplay coins fetched from the server-side ledger. Uses
   * the local reconciledGameplayCoins watermark to credit only the gap:
   *
   *   gap = serverTotal - reconciledGameplayCoins
   *   if gap > 0: balance += gap, watermark = serverTotal
   *
   * This restores earnings after a reinstall. Safe to call every launch:
   * it is a no-op when serverTotal ≤ local watermark.
   */
  reconcileCoinsFromGameplay: (serverTotal: number) => void;
  /**
   * Running total of coins ever earned from level completions.
   * Synced to the server-side ledger so it survives reinstall.
   * Read this value to push it to the server whenever it changes.
   */
  totalGameplayEarnedCoins: number;
  /** Call after a successful "Remove Ads" purchase to permanently hide all ads. */

  removeAds: () => Promise<void>;
  /** Add hints (for free/bonus hints — NOT for purchased packs; see creditHintPack). */

  addHints: (count: number) => void;
  /**
   * Credit one 10-hint pack after a direct in-app purchase.
   *
   * Atomically adds HINTS_PER_PACK hints AND advances the reconciliation
   * watermark in a single AsyncStorage write so that when the RC customer-info
   * query refreshes after the purchase, HintReconciliationBridge sees
   * reconciledPacks already at the new total and skips re-crediting.
   */
  creditHintPack: () => void;
  /** Spend one hint. Returns true if a hint was available and was deducted. */

  spendHint: () => boolean;
  /**
   * Reconcile hints against RevenueCat purchase history.
   *
   * Pass the total number of `hints_10` packs ever purchased (from RC
   * non-subscription transactions). Uses the watermark to credit only packs
   * that have not yet been applied to the balance:
   *
   *   newPacks = purchasedPackCount - reconciledPacks
   *   if newPacks > 0: balance += newPacks * HINTS_PER_PACK, watermark = purchasedPackCount
   *
   * Both fields are written as a single JSON record — if the process is
   * interrupted mid-write, the next reconciliation will simply re-run with the
   * old watermark and produce the same result.
   *
   * Must only be called after `adsHydrated` is true so the watermark and
   * balance reflect the saved AsyncStorage values, not the initial defaults.
   */
  reconcileHintsFromPurchases: (purchasedPackCount: number) => void;

  /** True if the player hasn't claimed their daily coin reward today. */
  canClaimDailyCoins: boolean;
  /** Award the daily coin reward. No-op if already claimed today. */
  claimDailyCoins: () => void;
  /** True while a 2× coin sale is active (24 h from activation). */

  hasActiveSale: boolean;
  /** Expiry timestamp (ms) of the active sale, or null if no sale. */

  timedSaleExpiry: number | null;
  /** Activate a 24-hour 2× coin sale. No-op if one is already active. */

  activateTimedSale: () => void;
}

const PROGRESS_KEY    = '@color_sort_progress_v2';
const DAILY_KEY       = '@color_sort_daily_v1';
const ADS_REMOVED_KEY = '@color_sort_ads_removed_v1';
const TIMED_SALE_KEY  = '@color_sort_timed_sale_v1';

// Legacy keys — read once for migration then leave in place
const PROGRESS_KEY_V1 = '@color_sort_progress_v1';
const COINS_KEY_V1    = '@color_sort_coins_v1';

/**
 * Single-key ledger for hint state. Storing balance + reconciledPacks together
 * means every mutation is one write, eliminating partial-update failure modes.
 * Legacy HINTS_KEY is read on first launch for migration.
 */
const HINTS_LEDGER_KEY = '@color_sort_hints_ledger_v1';
/** Legacy key — read once to seed the ledger balance, never written. */
const HINTS_KEY_LEGACY = '@color_sort_hints_v1';

/**
 * Single-key ledger for coin state. Storing balance + reconciledCoins together
 * means every mutation is one write, eliminating partial-update failure modes.
 * Legacy COINS_KEY_V2 is read on first launch for migration.
 */
const COINS_LEDGER_KEY = '@color_sort_coins_ledger_v1';
/** Legacy key (coins_v2) — read once to seed the ledger balance, never written. */
const COINS_KEY_LEGACY = '@color_sort_coins_v2';

const STARTING_COINS = 20; // tight starting balance — makes coin packs feel worthwhile
const STARTING_HINTS = 3;
const HINTS_PER_PACK = 10;

export const DAILY_COIN_REWARD = 25;
const DAILY_CLAIM_KEY = '@color_sort_daily_claim_v1';

const DEFAULT_HINTS_LEDGER: HintsLedger = { balance: STARTING_HINTS, reconciledPacks: 0 };
const DEFAULT_COINS_LEDGER: CoinsLedger = { balance: STARTING_COINS, reconciledCoins: 0, reconciledGameplayCoins: 0 };

const defaultProgress: GameProgress = {
  unlockedLevels: 3,
  completedLevels: [],
  bestMoves: {},
};

const defaultDailyProgress: DailyProgress = {
  lastPlayedDate: null,
  streak: 0,
  bestMoves: {},
};

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress]           = useState<GameProgress>(defaultProgress);
  const [coinsLedger, setCoinsLedger]     = useState<CoinsLedger>(DEFAULT_COINS_LEDGER);
  const [hintsLedger, setHintsLedger]     = useState<HintsLedger>(DEFAULT_HINTS_LEDGER);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>(defaultDailyProgress);
  const [adsEnabled, setAdsEnabled]       = useState<boolean>(true);
  const [adsHydrated, setAdsHydrated]     = useState<boolean>(false);
  const [isInGame, setIsInGame]           = useState<boolean>(false);
  const [lastCoinClaimDate, setLastCoinClaimDate] = useState<string | null>(null);
  const [timedSaleExpiry, setTimedSaleExpiry]     = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PROGRESS_KEY),
      AsyncStorage.getItem(COINS_LEDGER_KEY),
      AsyncStorage.getItem(DAILY_KEY),
      AsyncStorage.getItem(ADS_REMOVED_KEY),
      AsyncStorage.getItem(HINTS_LEDGER_KEY),
      // Legacy: read once to migrate old hints balance into the new ledger
      AsyncStorage.getItem(HINTS_KEY_LEGACY),
      // Read v1 keys for one-time progress migration
      AsyncStorage.getItem(PROGRESS_KEY_V1),
      AsyncStorage.getItem(COINS_KEY_V1),
      // Legacy coins_v2 key — migrate into the coins ledger if ledger absent
      AsyncStorage.getItem(COINS_KEY_LEGACY),
      // Daily coin reward claim date
      AsyncStorage.getItem(DAILY_CLAIM_KEY),
      AsyncStorage.getItem(TIMED_SALE_KEY),
    ]).then(([
      savedProgress, savedCoinsLedger, savedDaily, adsRemoved,
      savedHintsLedger, legacyHints, v1Progress, v1Coins, legacyCoins,
      savedClaimDate, savedTimedSale,
    ]) => {
      // Migrate progress v1 → v2 if v2 is absent
      const progressSrc = savedProgress ?? v1Progress;

      if (progressSrc) {
        try {
          const parsed = JSON.parse(progressSrc) as GameProgress;
          setProgress(parsed);
          if (!savedProgress) AsyncStorage.setItem(PROGRESS_KEY, progressSrc).catch(() => {});
        } catch {}
      }

      // Coins ledger migration: coins_ledger_v1 → coins_v2 → coins_v1 (in priority order)
      if (savedCoinsLedger !== null) {
        // Normal path: ledger already exists. Spread over DEFAULT_COINS_LEDGER so
        // existing players missing the reconciledGameplayCoins field get 0 rather
        // than undefined (field was added after initial release).
        try { setCoinsLedger({ ...DEFAULT_COINS_LEDGER, ...JSON.parse(savedCoinsLedger) } as CoinsLedger); } catch {}
      } else {
        // Migration path: promote old raw balance (coins_v2 or coins_v1) into the ledger
        const rawCoinsSrc = legacyCoins ?? v1Coins;
        if (rawCoinsSrc !== null) {
          try {
            const balance = JSON.parse(rawCoinsSrc) as number;
            const migrated: CoinsLedger = { balance, reconciledCoins: 0, reconciledGameplayCoins: 0 };
            setCoinsLedger(migrated);
            AsyncStorage.setItem(COINS_LEDGER_KEY, JSON.stringify(migrated)).catch(() => {});
          } catch {}
        }
        // If no legacy key exists: fresh install; DEFAULT_COINS_LEDGER is correct.
      }

      if (savedDaily) {
        try { setDailyProgress(JSON.parse(savedDaily)); } catch {}
      }
      if (adsRemoved === 'true') {
        setAdsEnabled(false);
      }
      if (savedClaimDate) {
        setLastCoinClaimDate(savedClaimDate);
      }

      if (savedHintsLedger !== null) {
        // Normal path: ledger already exists
        try { setHintsLedger(JSON.parse(savedHintsLedger) as HintsLedger); } catch {}
      } else if (legacyHints !== null) {
        // Migration path: player has old HINTS_KEY but no ledger yet
        try {
          const balance = JSON.parse(legacyHints) as number;
          const migrated: HintsLedger = { balance, reconciledPacks: 0 };
          setHintsLedger(migrated);
          // Persist the new ledger so we don't re-migrate on next launch
          AsyncStorage.setItem(HINTS_LEDGER_KEY, JSON.stringify(migrated)).catch(() => {});
        } catch {}
      }
      // If neither hints key exists: fresh install; DEFAULT_HINTS_LEDGER is correct.

      // Load timed sale: discard if already expired
      if (savedTimedSale !== null) {
        try {
          const expiry = JSON.parse(savedTimedSale) as number;
          if (expiry > Date.now()) setTimedSaleExpiry(expiry);
        } catch {}
      }
    }).finally(() => {
      setAdsHydrated(true);
    });
  }, []);

  // ── Persistence helpers ────────────────────────────────────────────────────

  const saveProgress = useCallback(async (p: GameProgress) => {
    try { await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
  }, []);

  /**
   * Persist the coins ledger as a single write so balance and watermark are
   * always consistent on disk — no partial-update window.
   */
  const saveCoinsLedger = useCallback(async (l: CoinsLedger) => {
    try { await AsyncStorage.setItem(COINS_LEDGER_KEY, JSON.stringify(l)); } catch {}
  }, []);

  /**
   * Persist the hints ledger as a single write so balance and watermark are
   * always consistent on disk — no partial-update window.
   */
  const saveHintsLedger = useCallback(async (l: HintsLedger) => {
    try { await AsyncStorage.setItem(HINTS_LEDGER_KEY, JSON.stringify(l)); } catch {}
  }, []);

  const saveDailyProgress = useCallback(async (p: DailyProgress) => {
    try { await AsyncStorage.setItem(DAILY_KEY, JSON.stringify(p)); } catch {}
  }, []);

  // ── Timed sale ─────────────────────────────────────────────────────────────

  const activateTimedSale = useCallback(() => {
    setTimedSaleExpiry((prev) => {
      if (prev !== null && prev > Date.now()) return prev; // already active
      const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
      AsyncStorage.setItem(TIMED_SALE_KEY, JSON.stringify(expiry)).catch(() => {});
      return expiry;
    });
  }, []);

  // ── Game actions ───────────────────────────────────────────────────────────

  const completeLevel = useCallback(async (levelId: number, moves: number) => {
    setProgress((prev) => {
      const alreadyCompleted = prev.completedLevels.includes(levelId);
      const completedLevels = alreadyCompleted
        ? prev.completedLevels
        : [...prev.completedLevels, levelId];

      const bestMoves = { ...prev.bestMoves };
      if (!bestMoves[levelId] || moves < bestMoves[levelId]) {
        bestMoves[levelId] = moves;
      }

      const unlockedLevels = Math.min(
        TOTAL_LEVELS,
        Math.max(prev.unlockedLevels, levelId + 2)
      );

      const newProgress: GameProgress = { completedLevels, bestMoves, unlockedLevels };
      saveProgress(newProgress);
      return newProgress;
    });

    // Award coins — flat +5 first-time bonus; 2× multiplier when a timed sale is active.
    // Also increment reconciledGameplayCoins so the GameplayCoinsReconciliationBridge
    // can push the running total to the server and restore it after reinstall.
    setCoinsLedger((prev) => {
      const isFirstTime = !progress.completedLevels.includes(levelId);
      const base = isFirstTime ? coinsForLevel(levelId) + 5 : 0;
      const saleActive = timedSaleExpiry !== null && timedSaleExpiry > Date.now();
      const earned = saleActive && base > 0 ? base * 2 : base;
      if (earned === 0) return prev;
      const next: CoinsLedger = {
        ...prev,
        balance: prev.balance + earned,
        reconciledGameplayCoins: prev.reconciledGameplayCoins + earned,
      };
      saveCoinsLedger(next);
      return next;
    });
  }, [progress.completedLevels, saveProgress, saveCoinsLedger, timedSaleExpiry]);

  const completeDailyChallenge = useCallback(async (dateString: string, moves: number) => {
    setDailyProgress((prev) => {
      let streak = prev.streak;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();

      if (prev.lastPlayedDate === dateString) {
        // Already played today — update best moves only
      } else if (prev.lastPlayedDate === yesterdayStr) {
        streak = prev.streak + 1;
      } else {
        streak = 1;
      }

      const bestMoves = { ...prev.bestMoves };
      if (!bestMoves[dateString] || moves < bestMoves[dateString]) {
        bestMoves[dateString] = moves;
      }

      const newDailyProgress: DailyProgress = { lastPlayedDate: dateString, streak, bestMoves };
      saveDailyProgress(newDailyProgress);
      return newDailyProgress;
    });
  }, [saveDailyProgress]);

  const earnCoins = useCallback((amount: number) => {
    setCoinsLedger((prev) => {
      const next: CoinsLedger = { ...prev, balance: prev.balance + amount };
      saveCoinsLedger(next);
      return next;
    });
  }, [saveCoinsLedger]);

  const spendCoins = useCallback((amount: number): boolean => {
    let success = false;
    setCoinsLedger((prev) => {
      if (prev.balance < amount) return prev;
      success = true;
      const next: CoinsLedger = { ...prev, balance: prev.balance - amount };
      saveCoinsLedger(next);
      return next;
    });
    return success;
  }, [saveCoinsLedger]);

  const removeAds = useCallback(async () => {
    setAdsEnabled(false);
    try {
      await AsyncStorage.setItem(ADS_REMOVED_KEY, 'true');
    } catch {}
  }, []);

  const addHints = useCallback((count: number) => {
    setHintsLedger((prev) => {
      const next: HintsLedger = { ...prev, balance: prev.balance + count };
      saveHintsLedger(next);
      return next;
    });
  }, [saveHintsLedger]);

  /**
   * Credit one purchased hint pack: atomically adds HINTS_PER_PACK to the
   * balance AND increments the watermark in a single ledger write. This ensures
   * that when customerInfo refreshes after the purchase and
   * HintReconciliationBridge runs, reconciledPacks already equals the new RC
   * pack count, so reconciliation is a no-op.
   */
  const creditHintPack = useCallback(() => {
    setHintsLedger((prev) => {
      const next: HintsLedger = {
        balance: prev.balance + HINTS_PER_PACK,
        reconciledPacks: prev.reconciledPacks + 1,
      };
      saveHintsLedger(next);
      return next;
    });
  }, [saveHintsLedger]);

  const spendHint = useCallback((): boolean => {
    let success = false;
    setHintsLedger((prev) => {
      if (prev.balance <= 0) return prev;
      success = true;
      const next: HintsLedger = { ...prev, balance: prev.balance - 1 };
      saveHintsLedger(next);
      return next;
    });
    return success;
  }, [saveHintsLedger]);

  /**
   * Reconcile hints against RC purchase history using a watermark approach.
   *
   * newPacks = purchasedPackCount - reconciledPacks
   * If newPacks > 0: credit newPacks * HINTS_PER_PACK and advance the watermark.
   *
   * Both fields are updated in a single setHintsLedger → saveHintsLedger call,
   * so an interrupted write leaves the old ledger on disk and the next
   * reconciliation call produces the same idempotent result.
   */
  const reconcileHintsFromPurchases = useCallback((purchasedPackCount: number) => {
    setHintsLedger((prev) => {
      const newPacks = purchasedPackCount - prev.reconciledPacks;
      if (newPacks <= 0) return prev; // nothing to do

      const hintsToCredit = newPacks * HINTS_PER_PACK;
      const next: HintsLedger = {
        balance: prev.balance + hintsToCredit,
        reconciledPacks: purchasedPackCount,
      };
      saveHintsLedger(next);
      console.log(
        `[Hints] Reconciled: rc_packs=${purchasedPackCount} watermark=${prev.reconciledPacks} ` +
        `new_packs=${newPacks} crediting=${hintsToCredit} ` +
        `balance=${prev.balance}→${next.balance}`
      );
      return next;
    });
  }, [saveHintsLedger]);

  /**
   * Credit one purchased coin pack: atomically adds the pack's coin amount AND
   * advances reconciledCoins in a single ledger write. This ensures that when
   * customerInfo refreshes after the purchase and CoinReconciliationBridge runs,
   * reconciledCoins already equals the new RC total, so reconciliation is a no-op.
   */
  const creditCoinPack = useCallback((packId: string) => {
    const amount = COIN_PACK_AMOUNTS[packId] ?? 0;
    if (amount === 0) return;
    setCoinsLedger((prev) => {
      const next: CoinsLedger = {
        ...prev,
        balance: prev.balance + amount,
        reconciledCoins: prev.reconciledCoins + amount,
      };
      saveCoinsLedger(next);
      return next;
    });
  }, [saveCoinsLedger]);

  const claimDailyCoins = useCallback(() => {
    const today = new Date().toDateString();
    setLastCoinClaimDate(today);
    AsyncStorage.setItem(DAILY_CLAIM_KEY, today).catch(() => {});
    setCoinsLedger((prev) => {
      const next: CoinsLedger = { ...prev, balance: prev.balance + DAILY_COIN_REWARD };
      saveCoinsLedger(next);
      return next;
    });
  }, [saveCoinsLedger]);

  /**
   * Reconcile coins against RC purchase history using a watermark approach.
   *
   * gap = totalPurchasedCoins - reconciledCoins
   * If gap > 0: credit gap coins and advance the watermark.
   *
   * Both fields are updated in a single setCoinsLedger → saveCoinsLedger call,
   * so an interrupted write leaves the old ledger on disk and the next
   * reconciliation call produces the same idempotent result.
   */
  const reconcileCoinsFromPurchases = useCallback((totalPurchasedCoins: number) => {
    setCoinsLedger((prev) => {
      const gap = totalPurchasedCoins - prev.reconciledCoins;
      if (gap <= 0) return prev; // nothing to do

      const next: CoinsLedger = {
        ...prev,
        balance: prev.balance + gap,
        reconciledCoins: totalPurchasedCoins,
      };
      saveCoinsLedger(next);
      console.log(
        `[Coins] Reconciled: rc_total=${totalPurchasedCoins} watermark=${prev.reconciledCoins} ` +
        `gap=${gap} balance=${prev.balance}→${next.balance}`
      );
      return next;
    });
  }, [saveCoinsLedger]);

  /**
   * Reconcile gameplay-earned coins against the server-stored total.
   *
   * gap = serverTotal - reconciledGameplayCoins
   * If gap > 0: credit gap coins and advance the watermark.
   *
   * Both fields are updated in a single setCoinsLedger → saveCoinsLedger call
   * so an interrupted write leaves the old ledger on disk and the next call
   * produces the same idempotent result.
   */
  const reconcileCoinsFromGameplay = useCallback((serverTotal: number) => {
    setCoinsLedger((prev) => {
      const gap = serverTotal - prev.reconciledGameplayCoins;
      if (gap <= 0) return prev; // nothing to do

      const next: CoinsLedger = {
        ...prev,
        balance: prev.balance + gap,
        reconciledGameplayCoins: serverTotal,
      };
      saveCoinsLedger(next);
      console.log(
        `[Coins] Gameplay reconciled: server_total=${serverTotal} ` +
        `watermark=${prev.reconciledGameplayCoins} gap=${gap} ` +
        `balance=${prev.balance}→${next.balance}`
      );
      return next;
    });
  }, [saveCoinsLedger]);

  const isLevelUnlocked = useCallback(
    (levelId: number) => levelId <= progress.unlockedLevels,
    [progress.unlockedLevels]
  );

  const isLevelCompleted = useCallback(
    (levelId: number) => progress.completedLevels.includes(levelId),
    [progress.completedLevels]
  );

  const isDailyCompleted = useCallback(
    (dateString: string) => dailyProgress.lastPlayedDate === dateString,
    [dailyProgress.lastPlayedDate]
  );

  const getBestMoves = useCallback(
    (levelId: number) => progress.bestMoves[levelId] ?? null,
    [progress.bestMoves]
  );

  const getDailyBestMoves = useCallback(
    (dateString: string) => dailyProgress.bestMoves[dateString] ?? null,
    [dailyProgress.bestMoves]
  );

  const resetProgress = useCallback(async () => {
    setProgress(defaultProgress);
    setCoinsLedger(DEFAULT_COINS_LEDGER);
    setHintsLedger(DEFAULT_HINTS_LEDGER);
    setDailyProgress(defaultDailyProgress);
    setAdsEnabled(true);
    setLastCoinClaimDate(null);
    setTimedSaleExpiry(null);
    await Promise.all([
      AsyncStorage.removeItem(PROGRESS_KEY),
      AsyncStorage.removeItem(COINS_LEDGER_KEY),
      AsyncStorage.removeItem(DAILY_KEY),
      AsyncStorage.removeItem(ADS_REMOVED_KEY),
      AsyncStorage.removeItem(HINTS_LEDGER_KEY),
      AsyncStorage.removeItem(DAILY_CLAIM_KEY),
      AsyncStorage.removeItem(TIMED_SALE_KEY),
    ]);
  }, []);

  const hasActiveSale = timedSaleExpiry !== null && timedSaleExpiry > Date.now();

  return (
    <GameContext.Provider value={{
      progress,
      coins: coinsLedger.balance,
      hintsRemaining: hintsLedger.balance,
      dailyProgress,
      adsEnabled,
      adsHydrated,
      isInGame,
      setIsInGame,
      completeLevel,
      completeDailyChallenge,
      isLevelUnlocked,
      isLevelCompleted,
      isDailyCompleted,
      getBestMoves,
      getDailyBestMoves,
      resetProgress,
      earnCoins,
      spendCoins,
      creditCoinPack,
      reconcileCoinsFromPurchases,
      reconcileCoinsFromGameplay,
      totalGameplayEarnedCoins: coinsLedger.reconciledGameplayCoins,
      removeAds,
      addHints,
      creditHintPack,
      spendHint,
      reconcileHintsFromPurchases,
      canClaimDailyCoins: lastCoinClaimDate !== new Date().toDateString(),
      claimDailyCoins,
      hasActiveSale,
      timedSaleExpiry,
      activateTimedSale,
    }}>
      {children}
    </GameContext.Provider>
  );
}


export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
