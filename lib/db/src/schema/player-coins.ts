import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores the running total of gameplay-earned coins for each anonymous player.
 *
 * - playerId  : UUID v4 generated on first install, stored in the device Keychain
 *               (expo-secure-store). Survives app reinstall on iOS.
 * - gameplayEarnedCoins : monotonically increasing total; the server enforces GREATEST()
 *               so a tampered client can never reduce the stored value.
 */
export const playerCoinsTable = pgTable("player_coins", {
  playerId: text("player_id").primaryKey(),
  gameplayEarnedCoins: integer("gameplay_earned_coins").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlayerCoins = typeof playerCoinsTable.$inferSelect;
