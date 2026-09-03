export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  coins: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_level',    title: 'First Steps',    desc: 'Complete your first level',              icon: '🎯', coins: 10  },
  { id: 'ten_levels',     title: 'On a Roll',       desc: 'Complete 10 levels',                    icon: '🔥', coins: 25  },
  { id: 'fifty_levels',   title: 'Halfway There',   desc: 'Complete 50 levels',                    icon: '⚡', coins: 50  },
  { id: 'hundred_levels', title: 'Century Club',    desc: 'Complete 100 levels',                   icon: '💯', coins: 100 },
  { id: 'minimalist',     title: 'Minimalist',      desc: 'Solve a level in 10 moves or fewer',    icon: '✨', coins: 20  },
  { id: 'daily_7',        title: 'Daily Devotee',   desc: 'Keep a 7-day daily challenge streak',   icon: '📅', coins: 30  },
  { id: 'hard_mode',      title: 'Hard Boiled',     desc: 'Complete a Hard Mode level (251+)',      icon: '💪', coins: 35  },
  { id: 'pure_skill',     title: 'Pure Skill',      desc: 'Solve a level with no hints or power-ups', icon: '🏆', coins: 25 },
];

export interface AchievementStats {
  levelsCompleted: number;
  dailyStreak: number;
  /** Minimum moves ever used to complete any level (0 = none yet). */
  minMovesEver: number;
  hardLevelsCompleted: number;
  /** Per-level event: true if the current level was solved with no hints or extra tubes. */
  completedWithoutPowerups?: boolean;
}

export function getNewlyUnlocked(
  stats: AchievementStats,
  alreadyUnlocked: string[],
): Achievement[] {
  return ACHIEVEMENTS.filter((a) => {
    if (alreadyUnlocked.includes(a.id)) return false;
    switch (a.id) {
      case 'first_level':    return stats.levelsCompleted >= 1;
      case 'ten_levels':     return stats.levelsCompleted >= 10;
      case 'fifty_levels':   return stats.levelsCompleted >= 50;
      case 'hundred_levels': return stats.levelsCompleted >= 100;
      case 'minimalist':     return stats.minMovesEver > 0 && stats.minMovesEver <= 10;
      case 'daily_7':        return stats.dailyStreak >= 7;
      case 'hard_mode':      return stats.hardLevelsCompleted >= 1;
      case 'pure_skill':     return stats.completedWithoutPowerups === true;
      default:               return false;
    }
  });
}

/** Milestone levels and their coin bonus amounts. */
export const MILESTONES: Record<number, number> = {
  25:  50,
  50:  100,
  100: 200,
  250: 500,
  500: 1000,
};
