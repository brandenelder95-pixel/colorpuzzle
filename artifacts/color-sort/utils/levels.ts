import { TubeState, GameState, COLOR_KEYS, TUBE_CAPACITY, canPour, pourBalls, isWon } from './gameLogic';

export interface Level {
  id: number;
  numColors: number;
  emptyTubes: number;
  tubes: GameState;
  isDaily?: boolean;
  dateString?: string;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Difficulty table
//
// WORLD 1 — Easy start (levels 1–250): 2 empty tubes, gradual colour ramp
//   Tier  1   1– 10 :  3 colours  ( 5 tubes)  Tutorial
//   Tier  2  11– 25 :  4 colours  ( 6 tubes)  Beginner
//   Tier  3  26– 45 :  5 colours  ( 7 tubes)  Easy
//   Tier  4  46– 70 :  6 colours  ( 8 tubes)  Medium
//   Tier  5  71–100 :  7 colours  ( 9 tubes)  Medium-Hard
//   Tier  6 101–135 :  8 colours  (10 tubes)  Hard
//   Tier  7 136–165 :  9 colours  (11 tubes)  Very Hard
//   Tier  8 166–195 : 10 colours  (12 tubes)  Expert
//   Tier  9 196–225 : 11 colours  (13 tubes)  Master
//   Tier 10 226–250 : 12 colours  (14 tubes)  Legend
//
// WORLD 2 — Hard mode (levels 251–300): 1 empty tube
//   Tier 11 251–275:  5 colours  ( 6 tubes)  Hard-Easy
//   Tier 12 276–300:  6 colours  ( 7 tubes)  Hard-Medium
//
// WORLD 3 — Expert (levels 301–500): 2 empty tubes
//   Tier 13 301–350:  9 colours (11 tubes)  Hard-Hard
//   Tier 14 351–395: 10 colours (12 tubes)  Brutal
//   Tier 15 396–440: 11 colours (13 tubes)  Nightmare
//   Tier 16 441–500: 12 colours (14 tubes)  Grandmaster
//
// WORLD 4 — Expert (levels 501–750): 2 empty tubes, 12 colours
//   Tier 17 501–750: 12 colours (14 tubes)  Legend-Hard
//
// WORLD 5 — Extreme (levels 751–1000): 2 empty tubes, 12 colours
//   Tier 18 751–1000: 12 colours (14 tubes)  Extreme Grandmaster
// ---------------------------------------------------------------------------
export function getDifficultyForLevel(levelId: number): { numColors: number; emptyTubes: number } {
  // World 1 — 2 empty tubes
  if (levelId <=  10) return { numColors:  3, emptyTubes: 2 };
  if (levelId <=  25) return { numColors:  4, emptyTubes: 2 };
  if (levelId <=  45) return { numColors:  5, emptyTubes: 2 };
  if (levelId <=  70) return { numColors:  6, emptyTubes: 2 };
  if (levelId <= 100) return { numColors:  7, emptyTubes: 2 };
  if (levelId <= 135) return { numColors:  8, emptyTubes: 2 };
  if (levelId <= 165) return { numColors:  9, emptyTubes: 2 };
  if (levelId <= 195) return { numColors: 10, emptyTubes: 2 };
  if (levelId <= 225) return { numColors: 11, emptyTubes: 2 };
  if (levelId <= 250) return { numColors: 12, emptyTubes: 2 };

  // World 2 — 1 empty tube
  if (levelId <= 275) return { numColors:  5, emptyTubes: 1 };
  if (levelId <= 300) return { numColors:  6, emptyTubes: 1 };

  // Worlds 3–5 — full palette, with two built-in recovery tubes
  return { numColors: 12, emptyTubes: 2 };
}

// ---------------------------------------------------------------------------
// BFS solvability check — only used for small puzzles (≤6 tubes) where the
// state space is bounded. Levels 301+ use guaranteed reverse construction.
// ---------------------------------------------------------------------------
function isSolvable(tubes: GameState): boolean {
  if (tubes.length > 6) return true;

  const encode = (t: GameState) =>
    [...t].map((tube) => tube.join('')).sort().join('|');

  const visited = new Set<string>();
  const queue: GameState[] = [tubes.map((t) => [...t])];
  visited.add(encode(tubes));

  while (queue.length > 0) {
    if (visited.size > 60_000) return true;

    const current = queue.shift()!;
    if (isWon(current)) return true;

    for (let from = 0; from < current.length; from++) {
      if (current[from].length === 0) continue;
      for (let to = 0; to < current.length; to++) {
        if (canPour(current, from, to)) {
          const next = pourBalls(current, from, to);
          const key = encode(next);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push(next);
          }
        }
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Standard generator (small puzzles, 3–8 colours) — Fisher-Yates + BFS verify
// ---------------------------------------------------------------------------
function buildTubesStandard(numColors: number, emptyTubes: number, rand: () => number): GameState {
  const colors = COLOR_KEYS.slice(0, numColors);

  const allBalls: string[] = [];
  for (const c of colors) {
    for (let i = 0; i < TUBE_CAPACITY; i++) allBalls.push(c);
  }

  for (let i = allBalls.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allBalls[i], allBalls[j]] = [allBalls[j], allBalls[i]];
  }

  const tubes: GameState = [];
  for (let i = 0; i < numColors; i++) {
    tubes.push(allBalls.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push([]);

  for (let i = tubes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tubes[i], tubes[j]] = [tubes[j], tubes[i]];
  }

  return tubes;
}

function buildCompactHardTubes(numColors: number, emptyTubes: number, rand: () => number): GameState {
  const colors = COLOR_KEYS.slice(0, numColors);
  const solvedColor = colors[0];
  const allBalls: string[] = [];

  for (const color of colors.slice(1)) {
    for (let i = 0; i < TUBE_CAPACITY; i++) allBalls.push(color);
  }

  for (let i = allBalls.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allBalls[i], allBalls[j]] = [allBalls[j], allBalls[i]];
  }

  const tubes: GameState = [[solvedColor, solvedColor, solvedColor, solvedColor]];
  for (let i = 0; i < numColors - 1; i++) {
    tubes.push(allBalls.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push([]);

  for (let i = tubes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tubes[i], tubes[j]] = [tubes[j], tubes[i]];
  }

  return tubes;
}

// ---------------------------------------------------------------------------
// Guaranteed-solvable generator for harder one-empty-tube levels.
//
// This walks backward from a solved board using the exact inverse of a legal
// pour. Replaying the reverse steps in the opposite order is always a valid
// solution, so these levels never require an extra tube.
// ---------------------------------------------------------------------------
function buildTubesGuaranteed(
  numColors: number,
  emptyTubes: number,
  steps: number,
  rand: () => number,
): GameState {
  const colors = COLOR_KEYS.slice(0, numColors);
  const state: GameState = colors.map((c) => [c, c, c, c]);
  for (let i = 0; i < emptyTubes; i++) state.push([]);

  let lastReceiver = -1;
  let lastDonor = -1;

  for (let step = 0; step < steps; step++) {
    const candidates: {
      receiver: number;
      donor: number;
      maxAmount: number;
      score: number;
    }[] = [];

    for (let receiver = 0; receiver < state.length; receiver++) {
      const receiverTube = state[receiver];
      const free = TUBE_CAPACITY - receiverTube.length;
      if (free === 0) continue;

      for (let donor = 0; donor < state.length; donor++) {
        if (receiver === donor) continue;
        if (receiver === lastDonor && donor === lastReceiver) continue;

        const donorTube = state[donor];
        if (donorTube.length === 0) continue;

        const color = donorTube[donorTube.length - 1];
        if (receiverTube[receiverTube.length - 1] === color) continue;

        let run = 1;
        while (
          run < donorTube.length &&
          donorTube[donorTube.length - 1 - run] === color
        ) {
          run++;
        }

        // If another color sits below this run, leave at least one ball from
        // the run behind so the corresponding forward pour remains legal.
        const maxAmount = donorTube.length === run
          ? Math.min(run, free)
          : Math.min(run - 1, free);
        if (maxAmount < 1) continue;

        candidates.push({
          receiver,
          donor,
          maxAmount,
          // Prefer stacking a new color onto an occupied tube. This produces
          // deeper mixed boards than repeatedly splitting into an empty tube.
          // Prefer emptying a one-ball donor into an occupied tube as well;
          // that restores an open slot without adding another visible tube.
          score:
            (receiverTube.length > 0 ? 10 : 0) +
            (receiverTube.length > 0 && donorTube.length === 1 ? 40 : 0),
        });
      }
    }

    if (candidates.length === 0) break;

    const highestScore = Math.max(...candidates.map((candidate) => candidate.score));
    const preferred = candidates.filter((candidate) => candidate.score === highestScore);
    const chosen = preferred[Math.floor(rand() * preferred.length)];
    // Split one ball at a time. Larger inverse pours keep same-color runs
    // together and produce boards that collapse in too few player moves.
    const amount = 1;

    const donorTube = state[chosen.donor];
    const receiverTube = state[chosen.receiver];
    const color = donorTube[donorTube.length - 1];
    donorTube.splice(donorTube.length - amount, amount);
    receiverTube.push(...Array(amount).fill(color));

    lastReceiver = chosen.receiver;
    lastDonor = chosen.donor;
  }

  for (let i = state.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [state[i], state[j]] = [state[j], state[i]];
  }

  return state;
}

function fragmentationScore(tubes: GameState): number {
  let score = 0;
  for (const tube of tubes) {
    if (tube.length === 0) continue;
    let transitions = 0;
    for (let i = 1; i < tube.length; i++) {
      if (tube[i] !== tube[i - 1]) transitions++;
    }
    // Mixed tubes and frequent color changes make the next useful pour less
    // obvious without changing the board footprint.
    if (transitions > 0) score += 20 + transitions * 8;
    score += transitions * transitions;
  }
  return score;
}

// Two base-36 characters per level encode the preselected scramble attempt.
// Keeping the variation deterministic avoids runtime searching while every
// board retains the guaranteed inverse-pour solution.
const HARD_LEVEL_SEED_ATTEMPTS = [
  '09040008030e0c000m0601030r0k02060803091a0q050u05020a03000d010c0o0i060c0v030e0q0t0g060c0501010400000c',
  '09010706021201010507040b090101020f0405050908000c02020e070102040005040101010200030305080f080700020000',
  '0c000c0000060405030205080203060c0a0400090607000803050802010g010201020e03080201020h040206030700010405',
  '07040405080g0101070303040100040406000501000000010a0106040905060502010105000a0300040702020604030b0007',
  '0l00080300030810070h01040904010h0f08040b03070609060a020h0002020500010k0501020k03010f060a010101030p0d',
  '0f010103050c0c02080802070b040d01010707060001060901080q0200020b0e01080f0m0s000d0a030i030400020o010303',
  '0y020406020h0d0608030001090b000a0a0103090a0705080302010603030d000h0500020608080d0601040107090f0f0301',
  '0b0c060306010b0000010107021f040007010a060h0p09090b08070402040s020i0d0g0005000a07000i000b010207080000',
  '080d040a050f0e080o030q00080c020f0000090709010400030i0602060600000g03010j020301010a000608030300091p0m',
  '0v0v0a0d002e0b0a0x030e090b0p0601050z080j070k1q0u0s0g0d0a000c0f0605031i0a041m100607010e0q080p09132g05',
  '0u0i0e08090j1c06070e1e0s0210010u07030c0016080606020e02050a0b011l0u200c090o040r0y01090n0d0h020k020001',
  '05020p0i0r040o0q090h09030g1x050a0j0e0s080p0g0g04041s02010e0t0a0t0h0c0e08010c0v2907040r0o0e011504010o',
  '060l072t0u12020z1h0f0j0l0d0903020b030j0i1a14050l1s0t0y040u070t020a141z020l020c0f0b0c0p0n0202040v040r',
  '011w070a090p0903070500080g0o0j0306010x0400030a0m0h0c04040g05020k06060s0c01000800030s000k020b11030802',
].join('');

function getHardLevelSeedAttempt(levelId: number): number {
  const offset = (levelId - 301) * 2;
  return Number.parseInt(HARD_LEVEL_SEED_ATTEMPTS.slice(offset, offset + 2), 36);
}

// ---------------------------------------------------------------------------
// Level generator
// ---------------------------------------------------------------------------
export function generateLevel(levelId: number): Level {
  const { numColors, emptyTubes } = getDifficultyForLevel(levelId);
  const seed = levelId * 31337 + 97;

  // Keep the existing layouts through level 300. Starting at 301, keep the
  // compact 14-tube footprint and target roughly 30–38 optimal moves.
  if (levelId > 300) {
    const attempt = getHardLevelSeedAttempt(levelId);
    let bestTubes: GameState | null = null;
    let bestScore = -1;

    // Sample deterministic compact shuffles and keep the more interleaved one.
    // One color starts complete to keep the difficulty challenging but fair.
    for (let variant = 0; variant < 2; variant++) {
      const rand = seededRandom(seed + (attempt + variant * 37) * 104729);
      const candidate = buildCompactHardTubes(numColors, emptyTubes, rand);
      const score = fragmentationScore(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestTubes = candidate;
      }
    }

    const tubes = bestTubes!;
    return { id: levelId, numColors, emptyTubes, tubes };
  }

  let attempt = 0;
  while (true) {
    const r = seededRandom(seed + attempt * 7919);
    const tubes = buildTubesStandard(numColors, emptyTubes, r);

    if (isSolvable(tubes)) {
      return { id: levelId, numColors, emptyTubes, tubes };
    }

    attempt++;
    if (attempt > 20) {
      return { id: levelId, numColors, emptyTubes, tubes };
    }
  }
}

// ---------------------------------------------------------------------------
// Free levels cap and paid-pack start
// ---------------------------------------------------------------------------
export const TOTAL_LEVELS      = 1000;
export const PAID_LEVELS_START = 1001;

/**
 * LEVELS[levelId - 1] — eagerly pre-generated for the first 500 levels so
 * navigating the level select screen and starting a level is instant.
 * Levels 501–1000 are generated lazily via generateLevel() in game.tsx.
 */
export const LEVELS: Level[] = Array.from({ length: 500 }, (_, i) =>
  generateLevel(i + 1)
);

/** Simple string → number hash (djb2) */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Base coins awarded for completing a level.
 * Hard levels (1 empty tube) pay 50% more.
 * First-time bonus (+5) is applied in GameContext.
 */
export function coinsForLevel(levelId: number): number {
  const { numColors, emptyTubes } = getDifficultyForLevel(levelId);
  const base = numColors * 2; // 6 (3 colours) → 24 (12 colours)
  return emptyTubes === 1 ? Math.round(base * 1.5) : base;
}

// ---------------------------------------------------------------------------
// Daily challenge generator
// ---------------------------------------------------------------------------
export function generateDailyLevel(dateString?: string): Level {
  const today = dateString ?? new Date().toDateString();
  const baseSeed = hashString(today);

  const numColors = 5;
  const colors = COLOR_KEYS.slice(0, numColors);

  for (let attempt = 0; attempt < 8; attempt++) {
    const seed = baseSeed + attempt * 0x9e3779b9;
    const rand = seededRandom(seed);

    const solved: GameState = colors.map((c) => [c, c, c, c]);
    solved.push([], []);

    let state: GameState = solved;
    let lastFrom = -1;
    let lastTo   = -1;

    for (let i = 0; i < 200; i++) {
      const valid: [number, number][] = [];
      for (let f = 0; f < state.length; f++) {
        for (let t = 0; t < state.length; t++) {
          if (!canPour(state, f, t)) continue;
          if (f === lastTo && t === lastFrom) continue;
          const next = pourBalls(state, f, t);
          if (isWon(next)) continue;
          valid.push([f, t]);
        }
      }
      if (valid.length === 0) break;
      const [from, to] = valid[Math.floor(rand() * valid.length)];
      state = pourBalls(state, from, to);
      lastFrom = from;
      lastTo   = to;
    }

    if (isWon(state)) continue;

    const shuffled = [...state];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return { id: 0, numColors, emptyTubes: 2, tubes: shuffled, isDaily: true, dateString: today };
  }

  return { ...generateLevel(42), isDaily: true, dateString: today };
}
