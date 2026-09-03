export type TubeState = string[]; // colors from bottom [0] to top [last]
export type GameState = TubeState[];

export const TUBE_CAPACITY = 4;

export const BALL_COLORS: Record<string, string> = {
  R: '#FF3B30', // Red       — vivid warm red
  O: '#FF9500', // Orange    — vivid orange
  Y: '#FFD60A', // Yellow    — vivid yellow
  G: '#34C759', // Green     — vivid green
  B: '#007AFF', // Blue      — vivid royal blue
  P: '#BF5AF2', // Purple    — vivid violet
  K: '#FF375F', // Hot Pink  — rose-pink (clearly redder than P)
  T: '#00C7BE', // Teal      — true teal (hue ~177°)
  // Extended palette — introduced progressively in levels 136+
  L: '#A2845E', // Brown/Tan — completely distinct from green (levels 136–165)
  N: '#5E5CE6', // Indigo    — periwinkle-violet, 31° from B (levels 166–195)
  C: '#5AC8FA', // Sky Blue  — light airy blue, 30° lighter than B (levels 196–225)
  W: '#EBEBF5', // Near-White — bright off-white, distinct from all (levels 226–250)
  M: '#8B1E3F', // Maroon
  A: '#7CFC00', // Lime
  D: '#8B5CF6', // Lavender
  E: '#FF6B35', // Coral
  H: '#14532D', // Forest
  I: '#F4A261', // Peach
  J: '#6B7280', // Slate Gray
  Q: '#00E5FF', // Cyan
  S: '#FF8FAB', // Light Pink
  U: '#9ACD32', // Olive Lime
  V: '#264653', // Deep Navy
  X: '#D4A373', // Sand
};

export const BALL_SHADOW_COLORS: Record<string, string> = {
  R: '#C0372C',
  O: '#CC7700',
  Y: '#CC9B00',
  G: '#248A3D',
  B: '#005EC2',
  P: '#9644C0',
  K: '#C22548',
  T: '#009490',
  L: '#7D5E3D',
  N: '#4A48B5',
  C: '#3EA8CE',
  W: '#9EA3AE',
  M: '#5F142B',
  A: '#55B000',
  D: '#6842C2',
  E: '#C94A22',
  H: '#0B351C',
  I: '#C87942',
  J: '#4B5563',
  Q: '#00A6B8',
  S: '#C9657E',
  U: '#6F9622',
  V: '#182E38',
  X: '#A6784F',
};

export const COLOR_KEYS = Object.keys(BALL_COLORS);
// 24 total colors; post-300 boards use the full palette.

export function canPour(tubes: GameState, fromIdx: number, toIdx: number): boolean {
  if (fromIdx === toIdx) return false;
  const from = tubes[fromIdx];
  const to = tubes[toIdx];
  if (from.length === 0) return false;
  if (to.length >= TUBE_CAPACITY) return false;
  if (to.length === 0) return true;
  return from[from.length - 1] === to[to.length - 1];
}

export function pourBalls(tubes: GameState, fromIdx: number, toIdx: number): GameState {
  const newTubes = tubes.map((t) => [...t]);
  const from = newTubes[fromIdx];
  const to = newTubes[toIdx];
  const topColor = from[from.length - 1];

  while (
    from.length > 0 &&
    from[from.length - 1] === topColor &&
    to.length < TUBE_CAPACITY
  ) {
    to.push(from.pop()!);
  }
  return newTubes;
}

export function isTubeComplete(tube: TubeState): boolean {
  return (
    tube.length === TUBE_CAPACITY && tube.every((c) => c === tube[0])
  );
}

export function isWon(tubes: GameState): boolean {
  return tubes.every((tube) => tube.length === 0 || isTubeComplete(tube));
}

export function getValidDestinations(tubes: GameState, fromIdx: number): number[] {
  const dests: number[] = [];
  for (let i = 0; i < tubes.length; i++) {
    if (canPour(tubes, fromIdx, i)) {
      dests.push(i);
    }
  }
  return dests;
}
