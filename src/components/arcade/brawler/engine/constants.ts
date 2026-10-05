// Shared simulation + presentation constants for the brawler engine.
// World units are low-res pixels; the whole game renders into a VIEW_W x VIEW_H
// buffer that is later upscaled (nearest neighbour) to the display canvas.

export const VIEW_W = 384;
export const VIEW_H = 216;

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Depth plane (the "belt") where feet can stand. */
export const FLOOR_TOP = 142;
export const FLOOR_BOTTOM = 206;

export const GRAVITY = 1000; // px/s^2
export const JUMP_VZ = 300; // px/s

export const MAX_PLAYERS = 2;
export const PLAYER_HP = 100;

export const HUD_H = 30;

export const OUTLINE = '#170d22';

/** Global sprite/hitbox scale applied on top of each Look's own scale. */
export const WORLD_SCALE = 1.2;

export const msToTicks = (ms: number): number => Math.max(1, Math.round((ms / 1000) * TICK_HZ));

// ---------------------------------------------------------------------------
// Difficulty tuning
// ---------------------------------------------------------------------------
// Every balance knob that depends on how many players are fighting or on the
// chosen difficulty lives here. The game reads `getTuning(difficulty, players)`
// live, so a second player dropping in (or dropping out) re-scales the fight.
// CO-OP on NORMAL reproduces the original two-player balance exactly; SOLO is
// tuned separately so one player is not facing a crowd balanced for two.

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export interface Tuning {
  /** lives per credit */
  lives: number;
  // --- enemies
  /** multiplier on regular enemy HP */
  enemyHp: number;
  /** multiplier on damage players take from regular enemies (melee + thrown) */
  enemyDamage: number;
  /** attack tokens: how many enemies may wind up / swing at the same time */
  maxAttackers: number;
  /** minimum ticks between two enemies being granted an attack token */
  attackStagger: number;
  /** multiplier on an enemy's cooldown between attacks */
  enemyAttackCd: number;
  /** extra telegraph (wind-up) ticks on every regular enemy attack */
  enemyWindup: number;
  /** extra enemies per wave as a fraction of the wave (co-op crowds) */
  waveExtra: number;
  /** added to each wave's max-alive cap */
  waveAliveBonus: number;
  // --- bosses
  /** multiplier on boss HP */
  bossHp: number;
  /** multiplier on damage players take from bosses (melee, projectiles, hazards) */
  bossDamage: number;
  /** extra telegraph ticks on boss punches */
  bossWindup: number;
  /** cooldown (ticks) between boss punches */
  bossPunchCd: number;
  /** multiplier on the walk time before a boss starts a signature pattern */
  bossPatternGap: number;
  /** multiplier on how fast a spinning boss chases its target */
  bossChase: number;
  /** a summon pattern tops minions up to this many living enemies */
  bossMinionCap: number;
  /** how far behind its target a teleporting boss reappears (px) */
  bossTeleportGap: number;
  // --- player protection
  /** consecutive hits (each within `stunlockWindow`) that force a knockdown; 0 = off */
  stunlockHits: number;
  stunlockWindow: number;
  /** launches a falling player can take before becoming untouchable until landing */
  playerJuggleCap: number;
  /** invulnerability ticks after a player gets up from a knockdown */
  getupInvuln: number;
  // --- pickups
  /** chance a KO'd enemy drops food / a coin */
  koDropChance: number;
  /** of those drops, the share that is food (rest are coins) */
  koFoodShare: number;
  /** award a 1UP every this many points; 0 = off */
  extraLifeScore: number;
}

/** Original co-op balance (two players). Do not tune this to fix solo play. */
const COOP: Tuning = {
  lives: 3,
  enemyHp: 1,
  enemyDamage: 1,
  maxAttackers: 3,
  attackStagger: 0,
  enemyAttackCd: 1,
  enemyWindup: 0,
  waveExtra: 0.4,
  waveAliveBonus: 1,
  bossHp: 1.6,
  bossDamage: 1,
  bossWindup: 0,
  bossPunchCd: 70,
  bossPatternGap: 1,
  bossChase: 1,
  bossMinionCap: 4,
  bossTeleportGap: 34,
  stunlockHits: 0,
  stunlockWindow: 0,
  playerJuggleCap: 3,
  getupInvuln: 80,
  koDropChance: 0.12,
  koFoodShare: 0.6,
  extraLifeScore: 0,
};

/**
 * One player. Fewer enemies may swing at once and their swings are staggered
 * and telegraphed longer (no one can watch your back), damage is trimmed,
 * stun-locks and air juggles are capped, bosses are shorter fights, and KOs
 * drop food a bit more often.
 */
const SOLO: Tuning = {
  lives: 3,
  enemyHp: 0.9,
  enemyDamage: 0.75,
  maxAttackers: 2,
  attackStagger: 30,
  enemyAttackCd: 1.15,
  enemyWindup: 3,
  waveExtra: 0,
  waveAliveBonus: 0,
  bossHp: 0.75,
  bossDamage: 0.65,
  bossWindup: 4,
  bossPunchCd: 85,
  bossPatternGap: 1.2,
  bossChase: 0.8,
  bossMinionCap: 3,
  bossTeleportGap: 56,
  stunlockHits: 3,
  stunlockWindow: 60,
  playerJuggleCap: 1,
  getupInvuln: 90,
  koDropChance: 0.18,
  koFoodShare: 0.75,
  extraLifeScore: 50000,
};

interface DifficultyScale {
  lives: number;
  hp: number;
  damage: number;
  attackers: number;
  attackCd: number;
  windup: number;
  stunlockHits: number;
  drops: number;
}

/** Applied on top of SOLO / COOP. NORMAL is the identity. */
const DIFFICULTY_SCALE: Record<Difficulty, DifficultyScale> = {
  easy: {
    lives: 1,
    hp: 0.85,
    damage: 0.75,
    attackers: -1,
    attackCd: 1.2,
    windup: 4,
    stunlockHits: -1,
    drops: 1.5,
  },
  normal: {
    lives: 0,
    hp: 1,
    damage: 1,
    attackers: 0,
    attackCd: 1,
    windup: 0,
    stunlockHits: 0,
    drops: 1,
  },
  hard: {
    lives: 0,
    hp: 1.15,
    damage: 1.2,
    attackers: 1,
    attackCd: 0.85,
    windup: -3,
    stunlockHits: 1,
    drops: 0.6,
  },
};

const tuningCache = new Map<string, Tuning>();

/** Balance for a difficulty and the number of players currently in the fight. */
export const getTuning = (difficulty: Difficulty, players: number): Tuning => {
  const key = `${difficulty}:${players > 1 ? 2 : 1}`;
  const hit = tuningCache.get(key);
  if (hit) return hit;
  const base = players > 1 ? COOP : SOLO;
  const s = DIFFICULTY_SCALE[difficulty] ?? DIFFICULTY_SCALE.normal;
  const t: Tuning = {
    ...base,
    lives: Math.max(1, base.lives + s.lives),
    enemyHp: base.enemyHp * s.hp,
    enemyDamage: base.enemyDamage * s.damage,
    maxAttackers: Math.max(1, base.maxAttackers + s.attackers),
    enemyAttackCd: base.enemyAttackCd * s.attackCd,
    enemyWindup: Math.max(0, base.enemyWindup + s.windup),
    bossHp: base.bossHp * s.hp,
    bossDamage: base.bossDamage * s.damage,
    bossWindup: Math.max(0, base.bossWindup + s.windup),
    stunlockHits: base.stunlockHits > 0 ? Math.max(2, base.stunlockHits + s.stunlockHits) : 0,
    koDropChance: Math.min(1, base.koDropChance * s.drops),
  };
  tuningCache.set(key, t);
  return t;
};
