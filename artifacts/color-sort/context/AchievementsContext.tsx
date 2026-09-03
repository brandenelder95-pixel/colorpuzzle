import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Achievement, AchievementStats, getNewlyUnlocked } from '@/utils/achievements';

const KEY = '@color_sort_achievements_v1';

interface AchievementsContextType {
  unlockedIds: string[];
  /** First item in the queue is the currently visible toast. */
  toastQueue: Achievement[];
  /** Dismiss the current toast (shifts the queue). */
  dismissToast: () => void;
  /**
   * Check stats against all achievements.
   * Any newly unlocked achievements are added to toastQueue and returned.
   */
  checkAchievements: (stats: AchievementStats) => Achievement[];
}

const Ctx = createContext<AchievementsContextType | null>(null);

export function AchievementsProvider({ children }: { children: React.ReactNode }) {
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [toastQueue, setToastQueue]   = useState<Achievement[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) { try { setUnlockedIds(JSON.parse(raw)); } catch {} }
    });
  }, []);

  const checkAchievements = useCallback((stats: AchievementStats): Achievement[] => {
    const newOnes = getNewlyUnlocked(stats, unlockedIds);
    if (newOnes.length === 0) return [];
    const newIds = [...unlockedIds, ...newOnes.map((a) => a.id)];
    setUnlockedIds(newIds);
    AsyncStorage.setItem(KEY, JSON.stringify(newIds)).catch(() => {});
    setToastQueue((q) => [...q, ...newOnes]);
    return newOnes;
  }, [unlockedIds]);

  const dismissToast = useCallback(() => {
    setToastQueue((q) => q.slice(1));
  }, []);

  return (
    <Ctx.Provider value={{ unlockedIds, toastQueue, dismissToast, checkAchievements }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAchievements() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAchievements must be inside AchievementsProvider');
  return ctx;
}
