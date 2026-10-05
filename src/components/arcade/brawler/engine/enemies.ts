// Enemy archetypes (grunt, fast, heavy, thrower, shield) with palette
// variants, and their AI: approach -> hover in a surround slot -> request an
// attack token -> engage (telegraphed attack) -> retreat. The token director in
// game.ts caps how many enemies swing at once.
import { Actor, AttackDef, ATTACKS } from './actor';
import { DT, FLOOR_BOTTOM, FLOOR_TOP } from './constants';
import type { Game } from './game';
import { clamp, randRange } from './math';
import { HairStyle, Look, TopStyle } from './rig';

export type EnemyType = 'grunt' | 'fast' | 'heavy' | 'thrower' | 'shield';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  attack: AttackDef;
  score: number;
  hover: [number, number];
  reach: number;
  armor: number;
  weight: number;
  shield?: boolean;
  ranged?: boolean;
  grabbable: boolean;
  base: Omit<Look, 'key' | 'top' | 'trim' | 'pants' | 'hair'>;
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  grunt: {
    type: 'grunt',
    name: 'PUNK',
    hp: 38,
    speed: 46,
    attack: ATTACKS.eJab,
    score: 200,
    hover: [48, 72],
    reach: 20,
    armor: 0,
    weight: 1,
    grabbable: true,
    base: {
      skin: '#e9b48c',
      hairStyle: 'mohawk',
      topStyle: 'tank',
      head: 'hero',
      eyeKind: 'narrow',
      shoes: '#26222c',
      eyeStyle: 'cartoon',
      brow: true,
      build: 1,
      scale: 1,
    },
  },
  fast: {
    type: 'fast',
    name: 'SKATER',
    hp: 28,
    speed: 74,
    attack: ATTACKS.eFast,
    score: 250,
    hover: [44, 64],
    reach: 19,
    armor: 0,
    weight: 0.8,
    grabbable: true,
    base: {
      skin: '#c98e62',
      hairStyle: 'cap',
      topStyle: 'hoodie',
      head: 'lean',
      mood: 'cocky',
      shoes: '#f2f2f2',
      eyeStyle: 'cartoon',
      brow: true,
      build: 0.85,
      scale: 0.96,
      shorts: true,
    },
  },
  heavy: {
    type: 'heavy',
    name: 'BRUISER',
    hp: 95,
    speed: 32,
    attack: ATTACKS.eSmash,
    score: 500,
    hover: [60, 84],
    reach: 24,
    armor: 2,
    weight: 1.7,
    grabbable: false,
    base: {
      skin: '#dca07a',
      hairStyle: 'bald',
      topStyle: 'tank',
      shoes: '#2a2020',
      eyeStyle: 'cartoon',
      brow: true,
      beard: '#4a2a1a',
      beardStyle: 'full',
      head: 'brute',
      build: 1.5,
      scale: 1.14,
    },
  },
  thrower: {
    type: 'thrower',
    name: 'TOSSER',
    hp: 30,
    speed: 50,
    attack: ATTACKS.eToss,
    score: 300,
    hover: [110, 150],
    reach: 120,
    armor: 0,
    weight: 0.9,
    ranged: true,
    grabbable: true,
    base: {
      skin: '#f0c8a0',
      hairStyle: 'beanie',
      topStyle: 'shirt',
      shoes: '#302018',
      eyeStyle: 'shades',
      head: 'round',
      mood: 'cocky',
      build: 0.95,
      scale: 1,
    },
  },
  shield: {
    type: 'shield',
    name: 'RIOT',
    hp: 52,
    speed: 38,
    attack: ATTACKS.eBash,
    score: 400,
    hover: [50, 70],
    reach: 22,
    armor: 0,
    weight: 1.2,
    shield: true,
    grabbable: true,
    base: {
      skin: '#e2b08a',
      hairStyle: 'helmet',
      topStyle: 'armor',
      head: 'square',
      shoes: '#1a1a22',
      eyeStyle: 'cartoon',
      brow: true,
      prop: 'shield',
      build: 1.1,
      scale: 1.02,
    },
  },
};

interface Variant {
  top: string;
  trim: string;
  pants: string;
  hair: string;
  skin?: string;
  hairStyle?: HairStyle;
  topStyle?: TopStyle;
  hpMul: number;
}

/** Palette variants; index 3 is the "elite" (tougher, worth more). */
export const VARIANTS: Variant[] = [
  { top: '#d94848', trim: '#ffd35a', pants: '#3b4a8a', hair: '#2a1a12', hpMul: 1 },
  { top: '#3a7bd5', trim: '#f2f2f2', pants: '#2a2a3a', hair: '#e8c040', hpMul: 1 },
  { top: '#46b35a', trim: '#1a1a1a', pants: '#5a3a2a', hair: '#b0302a', hpMul: 1 },
  { top: '#9b4dca', trim: '#ffd35a', pants: '#1f2a44', hair: '#f2f2f2', hpMul: 1.35 },
  { top: '#f28c28', trim: '#1a1a1a', pants: '#2a3a2a', hair: '#1a1a1a', hpMul: 1.1 },
  // carnival clowns
  {
    top: '#f2f2f2',
    trim: '#e0309a',
    pants: '#3a7bd5',
    hair: '#ff8a1a',
    skin: '#f7efe6',
    hairStyle: 'clown',
    topStyle: 'striped',
    hpMul: 1,
  },
  // factory workers
  {
    top: '#e8c040',
    trim: '#1a1a1a',
    pants: '#3a5a8a',
    hair: '#f2c94c',
    hairStyle: 'hardhat',
    topStyle: 'overalls',
    hpMul: 1.1,
  },
  // glitch drones (cyber)
  {
    top: '#1a1a2e',
    trim: '#34e7ff',
    pants: '#2a1a4a',
    hair: '#ff2d95',
    skin: '#b8a0ff',
    hpMul: 1.2,
  },
];

export const enemyLook = (type: EnemyType, variant: number): Look => {
  const def = ENEMY_DEFS[type];
  const v = VARIANTS[variant % VARIANTS.length];
  const keepHair = type === 'shield' || type === 'thrower' || type === 'heavy';
  return {
    ...def.base,
    key: `e-${type}-${variant}`,
    top: v.top,
    trim: v.trim,
    pants: v.pants,
    hair: type === 'shield' ? '#2c3a52' : v.hair,
    skin: v.skin ?? def.base.skin,
    hairStyle: !keepHair && v.hairStyle ? v.hairStyle : def.base.hairStyle,
    topStyle: type !== 'shield' && v.topStyle ? v.topStyle : def.base.topStyle,
  };
};

/** `hpMul` comes from the difficulty / player-count tuning. */
export const createEnemy = (type: EnemyType, variant: number, hpMul = 1): Actor => {
  const def = ENEMY_DEFS[type];
  const v = VARIANTS[variant % VARIANTS.length];
  const a = new Actor('enemy', enemyLook(type, variant));
  a.defId = type;
  a.maxHp = a.hp = Math.max(1, Math.round(def.hp * v.hpMul * hpMul));
  a.speed = def.speed * randRange(0.92, 1.08);
  a.weight = def.weight;
  a.score = Math.round(def.score * v.hpMul);
  a.shield = !!def.shield;
  a.grabbable = def.grabbable;
  a.aiHover = randRange(def.hover[0], def.hover[1]);
  a.aiLaneOff = randRange(-10, 10);
  a.attackCd = Math.round(randRange(30, 80));
  a.label = def.name;
  return a;
};

const windupCache = new Map<string, AttackDef>();

/** `atk` with `extra` ticks of telegraph added to its startup (cached). */
export const withWindup = (atk: AttackDef, extra: number): AttackDef => {
  if (extra <= 0) return atk;
  const key = `${atk.id}+${extra}`;
  let out = windupCache.get(key);
  if (!out) {
    out = { ...atk, startup: atk.startup + extra };
    windupCache.set(key, out);
  }
  return out;
};

const moveToward = (e: Actor, tx: number, ty: number, speed: number) => {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy * 1.4);
  if (d < 2) {
    e.vx = 0;
    e.vy = 0;
    return true;
  }
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed * 0.7;
  return false;
};

const pickSide = (g: Game, e: Actor, t: Actor): 1 | -1 => {
  let left = 0;
  let right = 0;
  for (const o of g.enemies) {
    if (o === e || !o.alive || o.target !== t) continue;
    if (o.aiSide < 0) left++;
    else right++;
  }
  const natural: 1 | -1 = e.x < t.x ? -1 : 1;
  if (natural < 0 && left > right + 1) return 1;
  if (natural > 0 && right > left + 1) return -1;
  return natural;
};

/** AI tick for a regular enemy in a neutral/AI-controlled state. */
export const thinkEnemy = (g: Game, e: Actor): void => {
  const def = ENEMY_DEFS[e.defId as EnemyType];
  if (!def) return;
  e.aiT++;
  if (e.attackCd > 0) e.attackCd--;

  if (e.state === 'attack') {
    runEnemyAttack(g, e, def);
    return;
  }
  if (e.state === 'block') {
    e.vx *= 0.8;
    if (e.stateT > 24) e.setState('idle', 'idle');
    return;
  }
  if (e.guardHits > 0 && e.aiT % 90 === 0) e.guardHits = 0;
  if (e.state !== 'idle' && e.state !== 'walk') return;

  if (!e.target || !g.isTargetable(e.target) || e.aiT % 45 === 0) {
    const t = g.nearestPlayer(e.x, e.y);
    if (t !== e.target) {
      e.target = t;
      if (t) e.aiSide = pickSide(g, e, t);
    }
  }
  const t = e.target;
  if (!t) {
    g.releaseToken(e);
    e.vx = e.vy = 0;
    e.play('idle');
    e.state = 'idle';
    return;
  }

  // Shield raise: a nearby player swinging at our front
  if (
    e.shield &&
    (t.state === 'attack' || t.state === 'jump') &&
    Math.abs(t.x - e.x) < 46 &&
    Math.abs(t.y - e.y) < 10 &&
    Math.random() < 0.25
  ) {
    e.facing = t.x > e.x ? 1 : -1;
    e.vx = 0;
    e.vy = 0;
    e.setState('block', 'block');
    return;
  }

  const sp = e.speed;
  let arrived = false;
  switch (e.ai) {
    case 'approach':
    case 'hover': {
      if (e.aiT % 200 === 0) e.aiSide = pickSide(g, e, t);
      const bob = Math.sin((e.aiT + e.id * 37) * 0.03) * 10;
      const tx = t.x + e.aiSide * e.aiHover;
      const ty = clamp(t.y + e.aiLaneOff + bob, FLOOR_TOP, FLOOR_BOTTOM);
      arrived = moveToward(e, tx, ty, e.ai === 'approach' ? sp : sp * 0.6);
      if (arrived || Math.abs(tx - e.x) < 24) e.ai = 'hover';
      if (e.attackCd <= 0 && e.ai === 'hover' && g.requestToken(e)) {
        e.ai = 'engage';
        e.aiT = 1;
      }
      break;
    }
    case 'engage': {
      if (def.ranged) {
        const dist = Math.abs(t.x - e.x);
        const want = dist < 70 ? t.x + e.aiSide * 110 : e.x;
        moveToward(e, want, t.y, sp);
        if (Math.abs(t.y - e.y) < 5 && dist >= 60 && dist < 190) {
          e.facing = t.x > e.x ? 1 : -1;
          e.vx = e.vy = 0;
          e.startAttack(withWindup(def.attack, g.tuning.enemyWindup));
          e.ai = 'attacking';
          return;
        }
      } else {
        const tx = t.x + e.aiSide * def.reach;
        moveToward(e, tx, t.y, sp * (def.type === 'fast' ? 1.6 : 1.2));
        if (
          Math.abs(t.x - e.x) <= def.reach + 6 * e.size &&
          Math.abs(t.y - e.y) <= 5 &&
          !t.airborne
        ) {
          e.facing = t.x > e.x ? 1 : -1;
          e.vx = e.vy = 0;
          e.startAttack(withWindup(def.attack, g.tuning.enemyWindup));
          if (def.armor) e.armor = def.armor;
          e.ai = 'attacking';
          return;
        }
      }
      if (e.aiT > 170) {
        g.releaseToken(e);
        e.ai = 'retreat';
        e.aiT = 0;
      }
      break;
    }
    case 'retreat': {
      const tx = t.x + e.aiSide * (e.aiHover + 26);
      moveToward(e, tx, e.y + Math.sin(e.aiT * 0.1) * 8, sp * 0.8);
      if (e.aiT > 40) {
        e.ai = 'hover';
        e.aiT = 0;
      }
      break;
    }
    default:
      e.ai = 'approach';
  }

  // face the target, not the travel direction (backpedal reads as intent)
  e.facing = t.x > e.x ? 1 : -1;
  const moving = Math.abs(e.vx) + Math.abs(e.vy) > 4;
  e.state = moving ? 'walk' : 'idle';
  e.play(moving ? 'walk' : 'idle');
};

const runEnemyAttack = (g: Game, e: Actor, def: EnemyDef) => {
  const atk = e.atk;
  if (!atk) {
    e.setState('idle', 'idle');
    return;
  }
  e.advanceAttack();
  const ph = e.atkPhase();
  // telegraph: dedicated windup pose + flicker during startup
  if (ph === 0) {
    e.play(atk.id === 'eSmash' ? 'smash' : atk.id === 'eToss' ? 'toss' : 'windup');
    e.frame = 0;
    e.tint = e.atkT % 6 < 3 ? '#ff5a3c' : null;
  } else {
    e.play(atk.anim);
    e.frame = atk.frames[ph];
    e.tint = null;
  }
  e.vx *= 0.7;
  e.vy = 0;
  if (ph === 1 && e.atkT === atk.startup) {
    if (def.ranged) {
      g.spawnEnemyProjectile(e, g.stageTheme === 'carnival' ? 'pie' : 'bottle');
    } else {
      e.vx = e.facing * 60;
    }
  }
  if (e.atkT >= atk.startup + atk.active + atk.recovery) {
    e.atk = null;
    e.armor = 0;
    e.tint = null;
    g.releaseToken(e);
    // fast enemies sometimes chain a second jab
    if (def.type === 'fast' && Math.random() < 0.45 && e.hitCount > 0) {
      e.startAttack(atk);
      return;
    }
    e.ai = 'retreat';
    e.aiT = 0;
    e.attackCd = Math.round(
      randRange(45, 100) * (def.type === 'heavy' ? 1.4 : 1) * g.tuning.enemyAttackCd
    );
    e.setState('idle', 'idle');
  }
};

/** Push overlapping enemies apart so crowds don't stack into one sprite. */
export const separateEnemies = (list: Actor[]): void => {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.state === 'grabbed') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.state === 'grabbed') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dy) > 7) continue;
      const min = (a.halfWidth + b.halfWidth) * 0.9;
      if (Math.abs(dx) < min) {
        const push = (min - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1) * 0.25;
        a.x -= push;
        b.x += push;
        a.y -= Math.sign(dy || 1) * 20 * DT;
        b.y += Math.sign(dy || 1) * 20 * DT;
      }
    }
  }
};
