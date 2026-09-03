import { generateLevel } from '@/utils/levels';
import { GameState, TUBE_CAPACITY, isWon } from '@/utils/gameLogic';

function encode(tubes: GameState): string {
  return tubes.map((tube) => tube.join('')).sort().join('|');
}

function nextStates(tubes: GameState): GameState[] {
  const next: { state: GameState; score: number }[] = [];

  for (let fromIndex = 0; fromIndex < tubes.length; fromIndex++) {
    const from = tubes[fromIndex];
    if (from.length === 0) continue;

    const color = from[from.length - 1];
    let run = 1;
    while (run < from.length && from[from.length - 1 - run] === color) run++;

    for (let toIndex = 0; toIndex < tubes.length; toIndex++) {
      if (fromIndex === toIndex) continue;
      const to = tubes[toIndex];
      if (to.length === TUBE_CAPACITY) continue;
      if (to.length > 0 && to[to.length - 1] !== color) continue;

      // Relocating a complete tube into an empty tube only permutes tube
      // positions, which encode() already treats as equivalent.
      if (to.length === 0 && run === TUBE_CAPACITY) continue;

      const amount = Math.min(run, TUBE_CAPACITY - to.length);
      const state = tubes.map((tube) => [...tube]);
      state[toIndex].push(...state[fromIndex].splice(-amount));
      next.push({
        state,
        score: (to.length > 0 ? 100 : 0) + (amount === run ? 20 : 0),
      });
    }
  }

  return next.sort((a, b) => b.score - a.score).map(({ state }) => state);
}

function minimumSolutionMoves(start: GameState): number {
  const queue: { state: GameState; moves: number }[] = [{ state: start, moves: 0 }];
  const visited = new Set<string>([encode(start)]);

  for (let head = 0; head < queue.length; head++) {
    const { state, moves } = queue[head];
    if (isWon(state)) return moves;

    for (const next of nextStates(state)) {
      const key = encode(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ state: next, moves: moves + 1 });
    }
  }

  return Number.POSITIVE_INFINITY;
}

describe('hard level generation', () => {
  it('gives every level after 300 two built-in spare tubes and 12 colors', () => {
    for (let levelId = 301; levelId <= 1000; levelId++) {
      const level = generateLevel(levelId);

      expect(isWon(level.tubes)).toBe(false);
      expect(level.tubes.length).toBe(level.numColors + level.emptyTubes);
      expect(level.tubes.length).toBeLessThanOrEqual(16);
      expect(level.emptyTubes).toBe(2);
      expect(level.numColors).toBe(12);
    }
  });

  it.each([301, 350, 351, 395, 396, 440, 441, 500, 501, 750, 751, 1000])(
    'keeps tier-boundary level %i solvable with its built-in tubes',
    (levelId) => {
      const level = generateLevel(levelId);
      expect(minimumSolutionMoves(level.tubes)).toBeLessThan(Number.POSITIVE_INFINITY);
    },
    30_000,
  );

  it.each([301, 302, 330, 441, 501, 751, 1000])(
    'keeps representative hard level %i within the 30–38 move target',
    (levelId) => {
      const moves = minimumSolutionMoves(generateLevel(levelId).tubes);
      expect(moves).toBeGreaterThanOrEqual(30);
      expect(moves).toBeLessThanOrEqual(38);
    },
    30_000,
  );
});