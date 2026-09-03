/**
 * Tests for gameplay-coin restoration after reinstall.
 *
 * The GameplayCoinsReconciliationBridge fetches the server-stored total on
 * startup and calls reconcileCoinsFromGameplay to re-credit any gap between
 * the server value and the local watermark (reconciledGameplayCoins).
 *
 * This file tests:
 *  1. reconcileCoinsFromGameplay — watermark logic (pure arithmetic).
 *  2. Server-side monotonic enforcement logic (GREATEST equivalent in JS).
 *  3. completeLevel coin-tracking — that reconciledGameplayCoins is incremented.
 */

// ─── Shared types & pure helpers ──────────────────────────────────────────────

interface CoinsLedger {
  balance: number;
  reconciledCoins: number;
  reconciledGameplayCoins: number;
}

/**
 * Mirrors GameContext.reconcileCoinsFromGameplay:
 * credit only the gap between server total and local watermark.
 */
function reconcileCoinsFromGameplay(
  prev: CoinsLedger,
  serverTotal: number
): CoinsLedger {
  const gap = serverTotal - prev.reconciledGameplayCoins;
  if (gap <= 0) return prev;
  return {
    ...prev,
    balance: prev.balance + gap,
    reconciledGameplayCoins: serverTotal,
  };
}

/**
 * Mirrors the server UPSERT GREATEST logic:
 * stored = GREATEST(stored, incoming), capped at MAX.
 */
function applyServerUpsert(
  stored: number,
  incoming: number,
  max = 25_000
): number {
  return Math.min(Math.max(stored, incoming), max);
}

/**
 * Mirrors GameContext.completeLevel coin-ledger update (first-time completion).
 */
function completeLevelCoins(prev: CoinsLedger, earned: number): CoinsLedger {
  if (earned === 0) return prev;
  return {
    ...prev,
    balance: prev.balance + earned,
    reconciledGameplayCoins: prev.reconciledGameplayCoins + earned,
  };
}

// ─── 1. reconcileCoinsFromGameplay ────────────────────────────────────────────

describe('reconcileCoinsFromGameplay', () => {
  const fresh: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };

  it('credits the full server total on reinstall (local watermark is 0)', () => {
    const next = reconcileCoinsFromGameplay(fresh, 350);
    expect(next.balance).toBe(370);
    expect(next.reconciledGameplayCoins).toBe(350);
    expect(next.reconciledCoins).toBe(0); // unchanged
  });

  it('credits only the gap when the watermark is partially advanced', () => {
    const existing: CoinsLedger = { balance: 100, reconciledCoins: 0, reconciledGameplayCoins: 200 };
    const next = reconcileCoinsFromGameplay(existing, 350);
    expect(next.balance).toBe(250);                // 100 + (350 - 200)
    expect(next.reconciledGameplayCoins).toBe(350);
  });

  it('is a no-op when server total equals the local watermark (normal launch)', () => {
    const current: CoinsLedger = { balance: 500, reconciledCoins: 0, reconciledGameplayCoins: 350 };
    const result = reconcileCoinsFromGameplay(current, 350);
    expect(result).toBe(current); // same object reference — no update
  });

  it('is a no-op when server returns 0 (new player, no server record yet)', () => {
    const result = reconcileCoinsFromGameplay(fresh, 0);
    expect(result).toBe(fresh);
  });

  it('is a no-op when server total is lower than local watermark (should not happen)', () => {
    const current: CoinsLedger = { balance: 500, reconciledCoins: 0, reconciledGameplayCoins: 350 };
    expect(reconcileCoinsFromGameplay(current, 100)).toBe(current);
  });

  it('does not touch reconciledCoins (purchase watermark stays independent)', () => {
    const withPurchases: CoinsLedger = { balance: 300, reconciledCoins: 600, reconciledGameplayCoins: 0 };
    const next = reconcileCoinsFromGameplay(withPurchases, 200);
    expect(next.reconciledCoins).toBe(600);
    expect(next.balance).toBe(500);
  });

  it('is idempotent: calling twice with the same server total is a no-op on the second call', () => {
    const state0: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };
    const state1 = reconcileCoinsFromGameplay(state0, 350);
    const state2 = reconcileCoinsFromGameplay(state1, 350);
    expect(state2).toBe(state1);
    expect(state2.balance).toBe(370);
  });
});

// ─── 2. Server-side monotonic enforcement (GREATEST) ─────────────────────────

describe('server GREATEST enforcement (applyServerUpsert)', () => {
  it('stores the incoming value on first write (stored = 0)', () => {
    expect(applyServerUpsert(0, 500)).toBe(500);
  });

  it('keeps the existing stored value when a lower value arrives', () => {
    expect(applyServerUpsert(500, 100)).toBe(500);
  });

  it('updates the stored value when a higher value arrives', () => {
    expect(applyServerUpsert(500, 800)).toBe(800);
  });

  it('caps the value at MAX_GAMEPLAY_COINS (25,000)', () => {
    expect(applyServerUpsert(0, 99_999, 25_000)).toBe(25_000);
    expect(applyServerUpsert(20_000, 26_000, 25_000)).toBe(25_000);
  });

  it('a tampered client sending 0 cannot erase a stored total', () => {
    expect(applyServerUpsert(3_000, 0)).toBe(3_000);
  });

  it('a tampered client sending a negative value is treated as 0 (non-negative validated earlier)', () => {
    // The route rejects negative values before reaching GREATEST, but
    // the pure function correctly handles them anyway.
    expect(applyServerUpsert(3_000, -100)).toBe(3_000);
  });
});

// ─── 3. Reinstall scenario: end-to-end simulation ────────────────────────────

describe('reinstall scenario simulation', () => {
  it('restores earnings correctly after a simulated reinstall', () => {
    // === Before reinstall ===
    const startLedger: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };

    // Player completes 3 levels
    let ledger = completeLevelCoins(startLedger, 11);  // level 1: 6+5
    ledger = completeLevelCoins(ledger, 13);            // level 3: 8+5
    ledger = completeLevelCoins(ledger, 17);            // level 10: 12+5

    // Local watermark + server record = 41
    expect(ledger.reconciledGameplayCoins).toBe(41);
    expect(ledger.balance).toBe(61);

    // Server sees the synced value
    let serverStored = applyServerUpsert(0, ledger.reconciledGameplayCoins);
    expect(serverStored).toBe(41);

    // Player spends some coins (doesn't affect watermark)
    const afterSpend: CoinsLedger = { ...ledger, balance: ledger.balance - 30 };
    expect(afterSpend.balance).toBe(31);
    expect(afterSpend.reconciledGameplayCoins).toBe(41); // watermark unchanged

    // === Reinstall ===
    const reinstalled: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };

    // Bridge fetches from server and reconciles
    const restored = reconcileCoinsFromGameplay(reinstalled, serverStored);
    expect(restored.balance).toBe(61);  // 20 (starting) + 41 (server)
    expect(restored.reconciledGameplayCoins).toBe(41);
  });

  it('does not double-credit on a normal second launch (no reinstall)', () => {
    const ledger: CoinsLedger = { balance: 61, reconciledCoins: 0, reconciledGameplayCoins: 41 };
    const serverTotal = 41;

    const result = reconcileCoinsFromGameplay(ledger, serverTotal);
    // Watermark matches server — no extra credit
    expect(result).toBe(ledger);
    expect(result.balance).toBe(61);
  });
});

// ─── 4. completeLevel coin tracking ──────────────────────────────────────────

describe('completeLevel coin tracking', () => {
  it('increments both balance and reconciledGameplayCoins on first completion', () => {
    const initial: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };
    const next = completeLevelCoins(initial, 11);
    expect(next.balance).toBe(31);
    expect(next.reconciledGameplayCoins).toBe(11);
  });

  it('is a no-op for earned=0 (replay, no first-time bonus)', () => {
    const initial: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 11 };
    expect(completeLevelCoins(initial, 0)).toBe(initial);
  });

  it('accumulates correctly over multiple level completions', () => {
    let ledger: CoinsLedger = { balance: 20, reconciledCoins: 0, reconciledGameplayCoins: 0 };
    ledger = completeLevelCoins(ledger, 11);
    ledger = completeLevelCoins(ledger, 13);
    ledger = completeLevelCoins(ledger, 17);
    expect(ledger.reconciledGameplayCoins).toBe(41);
    expect(ledger.balance).toBe(61);
    expect(ledger.reconciledCoins).toBe(0); // untouched
  });
});
