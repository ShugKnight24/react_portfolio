// Stage scripts: length, scroll-locked waves, crates/items and the boss.
import { BossId } from './bosses';
import { EnemyType } from './enemies';
import { ItemKind } from './items';

export type StageTheme = 'streets' | 'carnival' | 'factory' | 'lair';

export interface SpawnDef {
  type: EnemyType;
  variant: number;
}

export interface WaveDef {
  /** camera x at which the screen locks and the wave starts */
  at: number;
  enemies: SpawnDef[];
  maxAlive: number;
}

export interface StageDef {
  theme: StageTheme;
  num: number;
  name: string;
  subtitle: string;
  length: number;
  waves: WaveDef[];
  crates: Array<{ x: number; y: number; drop: ItemKind }>;
  items: Array<{ x: number; y: number; kind: ItemKind }>;
  boss: BossId;
}

const TYPE: Record<string, EnemyType> = {
  g: 'grunt',
  f: 'fast',
  h: 'heavy',
  t: 'thrower',
  s: 'shield',
};

/** "g0 f1 h3" -> spawn list (letter = archetype, digit = palette variant) */
const w = (at: number, spec: string, maxAlive = 3): WaveDef => ({
  at,
  maxAlive,
  enemies: spec
    .split(' ')
    .map((tok) => ({ type: TYPE[tok[0]], variant: Number(tok.slice(1)) || 0 })),
});

export const STAGES: StageDef[] = [
  {
    theme: 'streets',
    num: 1,
    name: 'DETROIT STREETS',
    subtitle: 'MIDNIGHT ON WOODWARD AVE',
    length: 2300,
    waves: [
      w(140, 'g0 g0 g1', 3),
      w(560, 'g0 f1 g2 f1', 3),
      w(1000, 'h0 g0 t2 g1', 3),
      w(1450, 's0 f1 g2 t0 g0', 4),
    ],
    crates: [
      { x: 430, y: 160, drop: 'donut' },
      { x: 880, y: 196, drop: 'bottle' },
      { x: 1320, y: 170, drop: 'pizza' },
      { x: 1760, y: 188, drop: 'coin' },
    ],
    items: [{ x: 1180, y: 200, kind: 'pipe' }],
    boss: 'tony',
  },
  {
    theme: 'carnival',
    num: 2,
    name: 'BOARDWALK CARNIVAL',
    subtitle: 'PIE TOSS AT SUNDOWN',
    length: 2500,
    waves: [
      w(180, 'g5 g5 f1 t5', 3),
      w(620, 'g5 s4 f1 g5', 3),
      w(1080, 'h3 t5 g5 f2 g5', 4),
      w(1560, 's4 s4 f1 t5 g5 g5', 4),
    ],
    crates: [
      { x: 470, y: 170, drop: 'donut' },
      { x: 930, y: 190, drop: 'bottle' },
      { x: 1400, y: 160, drop: 'pizza' },
      { x: 1900, y: 190, drop: 'trophy' },
    ],
    items: [{ x: 1250, y: 170, kind: 'coin' }],
    boss: 'krusto',
  },
  {
    theme: 'factory',
    num: 3,
    name: 'FACTORY ROOFTOPS',
    subtitle: 'SMOKESTACK SKYLINE',
    length: 2600,
    waves: [
      w(180, 'g6 g6 f2 g6', 3),
      w(640, 'h6 t6 g6 f2', 3),
      w(1100, 's0 s0 g6 t6 f2', 4),
      w(1600, 'h6 h3 f2 g6 t6 g6', 4),
    ],
    crates: [
      { x: 460, y: 180, drop: 'pizza' },
      { x: 960, y: 160, drop: 'pipe' },
      { x: 1420, y: 196, drop: 'donut' },
      { x: 1950, y: 170, drop: 'turkey' },
    ],
    items: [{ x: 780, y: 200, kind: 'bottle' }],
    boss: 'gearhead',
  },
  {
    theme: 'lair',
    num: 4,
    name: 'GLITCH ARCADE LAIR',
    subtitle: 'FINAL LEVEL: GAME ON',
    length: 2700,
    waves: [
      w(200, 'f7 f7 g7 g7', 3),
      w(700, 's7 t7 g7 f7 h7', 4),
      w(1200, 'h7 s7 f7 f7 t7 g7', 4),
      w(1750, 'g7 g7 h7 s7 t7 f7 f7', 4),
    ],
    crates: [
      { x: 500, y: 170, drop: 'pizza' },
      { x: 1000, y: 190, drop: 'bottle' },
      { x: 1500, y: 160, drop: 'turkey' },
      { x: 2100, y: 185, drop: 'pizza' },
    ],
    items: [{ x: 1300, y: 200, kind: 'trophy' }],
    boss: 'glitch',
  },
];
