// Four bosses. Each alternates a pressure "approach" (walk + punch) with
// weighted signature patterns. Every dangerous pattern is telegraphed (tint
// flicker, "!" pop, floor warning) before its hitbox goes live. Below 50% HP
// bosses enter phase 2 (faster, extra projectiles/lanes).
import { Actor, ATTACKS } from './actor';
import { VIEW_W } from './constants';
import { EnemyType, withWindup } from './enemies';
import type { Game } from './game';
import { clamp, randRange } from './math';
import { Look } from './rig';

export type BossId = 'tony' | 'krusto' | 'gearhead' | 'glitch';
type PatternId =
  'charge' | 'slam' | 'pieFan' | 'summon' | 'spin' | 'steam' | 'beam' | 'teleport' | 'orbs';

export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  look: Look;
  hp: number;
  speed: number;
  punch: 'bPunch' | 'bSmash';
  patterns: Array<{ id: PatternId; w: number }>;
  minion: { type: EnemyType; variant: number };
  taunt: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  tony: {
    id: 'tony',
    name: 'BIG CRUSHER TONY',
    title: 'UNDERWORLD ENFORCER',
    look: {
      key: 'b-tony',
      head: 'square',
      beard: '#1a1a1a',
      beardStyle: 'stubble',
      skin: '#e8a878',
      hair: '#1a1a1a',
      hairStyle: 'slick',
      top: '#4b2a6b',
      trim: '#e0c04a',
      topStyle: 'suit',
      pants: '#3a2050',
      shoes: '#111111',
      gloves: '#c9a227',
      eyeStyle: 'cartoon',
      brow: true,
      build: 1.6,
      scale: 1.42,
    },
    hp: 360,
    speed: 44,
    punch: 'bPunch',
    patterns: [
      { id: 'charge', w: 3 },
      { id: 'slam', w: 2 },
      { id: 'summon', w: 1 },
    ],
    minion: { type: 'grunt', variant: 0 },
    taunt: "YOU'RE IN MY TOWN NOW!",
  },
  krusto: {
    id: 'krusto',
    name: 'KRUSTO THE MAD JESTER',
    title: 'UNICYCLE ANARCHIST',
    look: {
      key: 'b-krusto',
      head: 'round',
      mood: 'cocky',
      skin: '#f7efe6',
      hair: '#3ddc84',
      hairStyle: 'clown',
      top: '#e0309a',
      trim: '#ffd35a',
      topStyle: 'striped',
      pants: '#3a7bd5',
      shoes: '#e63946',
      gloves: '#f2f2f2',
      noseColor: '#e63946',
      eyeStyle: 'cartoon',
      build: 1.3,
      scale: 1.35,
    },
    hp: 380,
    speed: 54,
    punch: 'bPunch',
    patterns: [
      { id: 'pieFan', w: 3 },
      { id: 'slam', w: 2 },
      { id: 'summon', w: 1 },
    ],
    minion: { type: 'grunt', variant: 5 },
    taunt: 'HEY HEY! PIE TIME!',
  },
  gearhead: {
    id: 'gearhead',
    name: 'FOREMAN GEARHEAD',
    title: 'SMOKESTACK TYRANT',
    look: {
      key: 'b-gearhead',
      head: 'brute',
      beardStyle: 'full',
      skin: '#d49a70',
      hair: '#f2c200',
      hairStyle: 'hardhat',
      top: '#e8e0d0',
      trim: '#f2c200',
      topStyle: 'overalls',
      pants: '#2f5d9a',
      shoes: '#3a2a1a',
      gloves: '#6b4a2b',
      beard: '#b0402a',
      prop: 'wrench',
      eyeStyle: 'cartoon',
      brow: true,
      build: 1.5,
      scale: 1.45,
    },
    hp: 460,
    speed: 40,
    punch: 'bSmash',
    patterns: [
      { id: 'spin', w: 3 },
      { id: 'steam', w: 3 },
      { id: 'charge', w: 1 },
    ],
    minion: { type: 'heavy', variant: 6 },
    taunt: 'BACK TO WORK, PEONS!',
  },
  glitch: {
    id: 'glitch',
    name: 'THE GLITCH KING',
    title: 'LORD OF THE HIGH SCORE',
    look: {
      key: 'b-glitch',
      head: 'round',
      mood: 'cocky',
      skin: '#9b7be0',
      hair: '#9b7be0',
      hairStyle: 'crown',
      top: '#1a1030',
      trim: '#ff2d95',
      topStyle: 'armor',
      pants: '#1a1030',
      shoes: '#34e7ff',
      gloves: '#34e7ff',
      eyeStyle: 'visor',
      mask: '#34e7ff',
      cape: '#6a1b9a',
      build: 1.35,
      scale: 1.5,
    },
    hp: 600,
    speed: 50,
    punch: 'bSmash',
    patterns: [
      { id: 'beam', w: 3 },
      { id: 'teleport', w: 2 },
      { id: 'orbs', w: 2 },
      { id: 'summon', w: 1 },
    ],
    minion: { type: 'fast', variant: 7 },
    taunt: 'INSERT COIN... TO DIE.',
  },
};

/** `hpMul` comes from the difficulty / player-count tuning. */
export const createBoss = (id: BossId, hpMul: number): Actor => {
  const def = BOSSES[id];
  const b = new Actor('boss', def.look);
  b.defId = id;
  b.maxHp = b.hp = Math.round(def.hp * hpMul);
  b.speed = def.speed;
  b.weight = 2.4;
  b.grabbable = false;
  b.score = 5000;
  b.label = def.name;
  b.ai = 'approach';
  b.attackCd = 40;
  return b;
};

const choosePattern = (def: BossDef, last: string): PatternId => {
  const opts = def.patterns.filter((p) => p.id !== last || def.patterns.length === 1);
  const total = opts.reduce((s, p) => s + p.w, 0);
  let r = Math.random() * total;
  for (const p of opts) {
    r -= p.w;
    if (r <= 0) return p.id;
  }
  return opts[0].id;
};

const faceTarget = (b: Actor, t: Actor | null) => {
  if (t) b.facing = t.x > b.x ? 1 : -1;
};

const endPattern = (b: Actor) => {
  b.ai = 'approach';
  b.patT = 0;
  b.aiT = 0;
  b.atk = null;
  b.armor = 0;
  b.tint = null;
  b.attackCd = 50;
  b.setState('idle', 'idle');
};

/** Boss AI tick (only while in AI-controlled states). */
export const thinkBoss = (g: Game, b: Actor): void => {
  const def = BOSSES[b.defId as BossId];
  if (!def) return;
  if (b.hp < b.maxHp * 0.5 && b.phase === 1) {
    b.phase = 2;
    g.fx.text(b.x, b.y, b.height + 16, 'ENRAGED!', '#ff5a3c', 1, 60);
    g.camera.shake(0.3);
  }
  if (b.attackCd > 0) b.attackCd--;
  const hasteMul = b.phase === 2 ? 1.25 : 1;

  if (b.state === 'attack') {
    const atk = b.atk;
    if (!atk) {
      endPattern(b);
      return;
    }
    b.advanceAttack();
    const ph = b.atkPhase();
    b.frame = atk.frames[ph];
    b.tint = ph === 0 && b.atkT % 6 < 3 ? '#ff5a3c' : null;
    b.vx *= 0.7;
    b.vy = 0;
    if (ph === 1 && b.atkT === atk.startup) b.vx = b.facing * 80;
    if (b.atkT >= atk.startup + atk.active + atk.recovery) endPattern(b);
    return;
  }

  if (b.state === 'pattern') {
    b.patT++;
    runPattern(g, b, def, hasteMul);
    return;
  }

  if (b.state !== 'idle' && b.state !== 'walk') return;

  // anti-lock: too many hits taken in a short window -> shove everyone away
  if (b.hitsTaken >= 7) {
    b.hitsTaken = 0;
    b.startAttack(ATTACKS.bShove);
    b.invuln = 30;
    g.fx.text(b.x, b.y, b.height + 10, 'GRRAH!', '#ffd35a', 1, 30);
    return;
  }

  const t = g.nearestPlayer(b.x, b.y);
  b.target = t;
  b.aiT++;
  if (!t) {
    b.vx = b.vy = 0;
    b.play('idle');
    return;
  }
  const reach = 22 * b.size;
  const side: 1 | -1 = b.x < t.x ? -1 : 1;
  const tx = t.x + side * reach;
  const dx = tx - b.x;
  const dy = t.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d > 3) {
    b.vx = (dx / d) * b.speed * hasteMul;
    b.vy = (dy / d) * b.speed * 0.7 * hasteMul;
    b.state = 'walk';
    b.play('walk');
  } else {
    b.vx = b.vy = 0;
    b.state = 'idle';
    b.play('idle');
  }
  faceTarget(b, t);

  const inRange = Math.abs(t.x - b.x) < reach + 12 && Math.abs(dy) < 7;
  const tun = g.tuning;
  if (inRange && b.attackCd <= 0 && !t.airborne) {
    b.vx = b.vy = 0;
    b.startAttack(withWindup(ATTACKS[def.punch], tun.bossWindup));
    b.attackCd = tun.bossPunchCd;
    return;
  }
  if (b.aiT > ((b.phase === 2 ? 110 : 160) + (b.id % 3) * 10) * tun.bossPatternGap) {
    b.pattern = choosePattern(def, b.pattern);
    b.ai = 'pattern';
    b.patT = 0;
    b.vx = b.vy = 0;
    b.armor = 99;
    b.setState('pattern', 'windup');
  }
};

const telegraph = (g: Game, b: Actor) => {
  g.fx.text(b.x, b.y, b.height + 12, '!', '#ff3b3b', 2, 34);
  g.sfx('alarm');
};

const runPattern = (g: Game, b: Actor, def: BossDef, haste: number) => {
  const t = b.patT;
  const target = g.nearestPlayer(b.x, b.y);
  const camX = g.camera.x;
  switch (b.pattern as PatternId) {
    case 'charge': {
      if (t === 1) {
        faceTarget(b, target);
        b.ty = target ? target.y : b.y;
        telegraph(g, b);
        b.play('windup', true);
      }
      if (t < 40) {
        b.vy = clamp((b.ty - b.y) * 4, -60, 60);
        b.tint = t % 6 < 3 ? '#ff5a3c' : null;
        if (t % 10 === 0) g.fx.dust(b.x - b.facing * 10, b.y, 3);
        return;
      }
      if (t === 40) {
        b.tint = null;
        b.atk = ATTACKS.bCharge;
        b.atkT = 0;
        b.clearHits();
        b.play('charge', true);
        g.sfx('boss');
      }
      const edge = b.facing > 0 ? camX + VIEW_W - 16 : camX + 16;
      const running = b.atk !== null;
      if (running) {
        b.atkT = 1;
        b.vx = b.facing * 250 * haste;
        b.vy = 0;
        if (t % 4 === 0) g.fx.dust(b.x - b.facing * 12, b.y, 2);
        if ((b.facing > 0 && b.x >= edge) || (b.facing < 0 && b.x <= edge) || t > 150) {
          b.atk = null;
          b.vx = b.facing * 60;
          g.camera.shake(0.25);
          g.fx.dust(b.x, b.y, 8, 1.5);
          b.play('hurt', true);
          b.tx = t;
          b.armor = 0; // skid recovery is the punish window
        }
      } else {
        b.vx *= 0.85;
        if (t - b.tx > 40) endPattern(b);
      }
      return;
    }
    case 'slam': {
      if (t === 1) {
        telegraph(g, b);
        b.play('windup', true);
      }
      if (t === 16) {
        const tx = target ? target.x : b.x;
        const ty = target ? target.y : b.y;
        const air = 0.8;
        b.vz = 0.5 * 1000 * air;
        b.vx = (tx - b.x) / air;
        b.vy = (ty - b.y) / air;
        b.play('jumpUp', true);
        g.spawnHazard('shock', tx, ty, 58, Math.round(air * 60), 5, 15, 230, '#ff5a3c');
        g.sfx('jump');
      }
      if (t > 16 && b.airborne) {
        b.play(b.vz > 0 ? 'jumpUp' : 'jumpDown');
        return;
      }
      if (t > 16 && !b.airborne && b.anim !== 'smash') {
        b.vx = b.vy = 0;
        b.play('smash', true);
        b.frame = 1;
        g.camera.shake(0.5);
        g.fx.dust(b.x, b.y, 12, 2);
        g.fx.ring(b.x, b.y, 70, '#ffd35a');
        g.sfx('heavy');
        b.tx = t;
      }
      if (b.anim === 'smash' && t - b.tx > 34) endPattern(b);
      return;
    }
    case 'pieFan': {
      if (t === 1) {
        faceTarget(b, target);
        telegraph(g, b);
        b.play('toss', true);
      }
      const cycle = b.phase === 2 ? 2 : 1;
      const local = t % 50;
      const round = Math.floor(t / 50);
      if (round >= cycle) {
        endPattern(b);
        return;
      }
      b.frame = local < 22 ? 0 : 1;
      b.tint = local < 22 && local % 6 < 3 ? '#ffd35a' : null;
      if (local === 22) {
        faceTarget(b, target);
        const n = b.phase === 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * (b.phase === 2 ? 34 : 46);
          g.spawnBossProjectile(b, 'pie', 175, spread, 9, 110);
        }
        g.sfx('throw');
      }
      return;
    }
    case 'summon': {
      if (t === 1) {
        b.play('victory', true);
        g.fx.text(
          b.x,
          b.y,
          b.height + 14,
          def.id === 'krusto' ? 'HONK HONK!' : def.id === 'glitch' ? 'SPAWN()' : 'BOYS!',
          '#ffd35a',
          1,
          50
        );
        g.sfx('alarm');
      }
      if (t === 20) {
        const living = g.enemies.filter((e) => e.kind === 'enemy' && e.alive).length;
        const n = Math.max(0, Math.min(2, g.tuning.bossMinionCap - living));
        for (let i = 0; i < n; i++)
          g.spawnEnemy(def.minion.type, def.minion.variant, i % 2 === 0 ? -1 : 1);
      }
      if (t >= 50) endPattern(b);
      return;
    }
    case 'spin': {
      if (t === 1) {
        telegraph(g, b);
        b.play('windup', true);
      }
      if (t < 30) {
        b.tint = t % 6 < 3 ? '#ff5a3c' : null;
        return;
      }
      if (t === 30) {
        b.tint = null;
        b.atk = ATTACKS.bSpin;
        b.atkT = 0;
        b.clearHits();
        b.play('spSpin', true);
        g.sfx('special');
      }
      if (t < 130) {
        b.advanceAttack();
        if (target) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const chase = haste * g.tuning.bossChase;
          b.vx = (dx / d) * 88 * chase;
          b.vy = (dy / d) * 60 * chase;
        }
        if (t % 6 === 0) g.fx.sparks(b.x, b.y, 28, t % 12 === 0 ? 1 : -1, 2, '#dfe6ee');
        return;
      }
      if (t === 130) {
        b.atk = null;
        b.vx = b.vy = 0;
        b.armor = 0;
        b.play('hurt', true);
        g.fx.text(b.x, b.y, b.height + 8, 'DIZZY', '#ffd35a', 1, 50);
      }
      if (t >= 185) endPattern(b);
      return;
    }
    case 'steam': {
      if (t === 1) {
        telegraph(g, b);
        b.play('smash', true);
        b.frame = 0;
      }
      if (t === 18) {
        b.frame = 1;
        g.camera.shake(0.3);
        g.sfx('heavy');
        const spots: number[] = [];
        for (const p of g.activePlayerActors()) spots.push(p.x, p.y);
        const extra = b.phase === 2 ? 3 : 2;
        for (let i = 0; i < extra; i++)
          spots.push(camX + randRange(40, VIEW_W - 40), randRange(150, 200));
        for (let i = 0; i < spots.length; i += 2)
          g.spawnHazard('steam', spots[i], spots[i + 1], 16, 46 + i * 3, 30, 12, 190, '#e8f4ff');
      }
      if (t >= 70) endPattern(b);
      return;
    }
    case 'beam': {
      if (t === 1) {
        b.invuln = 30;
        b.play('spBeam', true);
        g.sfx('alarm');
      }
      if (t === 14) {
        const leftSide = target ? target.x > camX + VIEW_W / 2 : Math.random() < 0.5;
        b.x = leftSide ? camX + 28 : camX + VIEW_W - 28;
        b.px = b.x;
        b.y = target ? target.y : b.y;
        b.py = b.y;
        b.facing = leftSide ? 1 : -1;
        g.fx.sparks(b.x, b.y, 20, 1, 8, '#34e7ff');
        g.fx.sparks(b.x, b.y, 20, -1, 8, '#ff2d95');
        const lanes: number[] = [b.y];
        if (b.phase === 2) {
          const others = g.activePlayerActors().filter((p) => Math.abs(p.y - b.y) > 14);
          lanes.push(others.length ? others[0].y : clamp(b.y + (b.y > 175 ? -28 : 28), 150, 200));
        }
        lanes.forEach((ly, i) =>
          g.spawnHazard(
            'laser',
            camX,
            ly,
            VIEW_W,
            48 + i * 14,
            22,
            18,
            210,
            i === 0 ? '#34e7ff' : '#ff2d95'
          )
        );
      }
      if (t > 14 && t < 62) b.frame = 0;
      if (t >= 62) b.frame = 1;
      if (t >= 96) endPattern(b);
      return;
    }
    case 'teleport': {
      if (t === 1) {
        b.invuln = 24;
        g.fx.sparks(b.x, b.y, 24, 1, 10, '#ff2d95');
        g.sfx('special');
      }
      b.tint = t % 4 < 2 ? '#ff2d95' : '#34e7ff';
      if (t === 18 && target) {
        const gap = g.tuning.bossTeleportGap;
        b.x = clamp(target.x - target.facing * gap, camX + 20, camX + VIEW_W - 20);
        b.y = target.y;
        b.px = b.x;
        b.py = b.y;
        faceTarget(b, target);
        g.fx.sparks(b.x, b.y, 24, -1, 10, '#34e7ff');
      }
      if (t >= 22) {
        b.tint = null;
        b.startAttack(withWindup(ATTACKS.bSmash, g.tuning.bossWindup));
      }
      return;
    }
    case 'orbs': {
      if (t === 1) {
        faceTarget(b, target);
        telegraph(g, b);
        b.play('spShoot', true);
      }
      b.frame = t < 20 ? 0 : 1;
      if (t === 20 || t === 34 || (b.phase === 2 && t === 48)) {
        g.spawnBossProjectile(b, 'homing', 95, randRange(-30, 30), 10, 200);
        g.sfx('special');
      }
      if (t >= 70) endPattern(b);
      return;
    }
  }
};
