// Actor = anything that fights: players, enemies, bosses. Holds physics,
// animation cursor, combat bookkeeping and AI scratch fields. Behaviour lives
// in player.ts / enemyAi.ts / bosses.ts; hit resolution in combat.ts.
import { DT, FLOOR_BOTTOM, FLOOR_TOP, GRAVITY, WORLD_SCALE } from './constants';
import { clamp } from './math';
import { AnimId, ANIMS, Look } from './rig';
import { getSprites, SpriteSet } from './spriteBank';

export type ActorKind = 'player' | 'enemy' | 'boss';

export type ActorState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'attack'
  | 'special'
  | 'hurt'
  | 'fall'
  | 'down'
  | 'getup'
  | 'grabbing'
  | 'grabbed'
  | 'throw'
  | 'dead'
  | 'victory'
  | 'block'
  | 'spawn'
  | 'pattern'
  | 'gone';

export interface HitBox {
  x: number; // distance in front of the actor where the box starts
  w: number;
  z0: number;
  z1: number;
  depth: number;
}

export interface AttackDef {
  id: string;
  anim: AnimId;
  /** pose index used for [startup, active, recovery] */
  frames: [number, number, number];
  startup: number;
  active: number;
  recovery: number;
  box: HitBox;
  damage: number;
  knock: number;
  launch: number;
  hitstop: number; // ms
  shake: number;
  lunge?: number;
  stun?: number;
  hits?: number; // multi-hit: clear hit list every `interval` ticks
  interval?: number;
  heavy?: boolean;
  unblockable?: boolean;
  word?: string;
  /** hitbox exists on both sides of the actor */
  around?: boolean;
}

const A = (
  o: Omit<AttackDef, 'frames' | 'box'> & {
    frames?: [number, number, number];
    box?: Partial<HitBox>;
  }
): AttackDef => ({
  frames: [0, 1, 2],
  ...o,
  box: { x: 4, w: 20, z0: 18, z1: 38, depth: 10, ...(o.box ?? {}) },
});

export const ATTACKS = {
  jab: A({
    id: 'jab',
    anim: 'jab',
    startup: 3,
    active: 3,
    recovery: 8,
    box: { x: 5, w: 19 },
    damage: 6,
    knock: 40,
    launch: 0,
    hitstop: 55,
    shake: 0.06,
  }),
  cross: A({
    id: 'cross',
    anim: 'cross',
    startup: 4,
    active: 3,
    recovery: 10,
    box: { x: 5, w: 22 },
    damage: 7,
    knock: 55,
    launch: 0,
    hitstop: 60,
    shake: 0.1,
  }),
  finisher: A({
    id: 'finisher',
    anim: 'finisher',
    startup: 6,
    active: 4,
    recovery: 17,
    box: { x: 5, w: 25, z0: 12, z1: 34 },
    damage: 12,
    knock: 175,
    launch: 200,
    hitstop: 95,
    shake: 0.28,
    heavy: true,
    word: 'POW!',
  }),
  jumpKick: A({
    id: 'jumpKick',
    anim: 'jumpKick',
    frames: [0, 0, 0],
    startup: 2,
    active: 40,
    recovery: 0,
    box: { x: 2, w: 22, z0: 2, z1: 26 },
    damage: 10,
    knock: 150,
    launch: 170,
    hitstop: 75,
    shake: 0.2,
    heavy: true,
  }),
  runAttack: A({
    id: 'runAttack',
    anim: 'runAttack',
    frames: [0, 0, 1],
    startup: 1,
    active: 12,
    recovery: 14,
    box: { x: 2, w: 24 },
    damage: 12,
    knock: 210,
    launch: 210,
    hitstop: 85,
    shake: 0.26,
    lunge: 170,
    heavy: true,
    word: 'WHAM!',
  }),
  knee: A({
    id: 'knee',
    anim: 'knee',
    frames: [0, 1, 1],
    startup: 4,
    active: 2,
    recovery: 9,
    box: { x: 2, w: 20, z0: 8, z1: 30, depth: 8 },
    damage: 5,
    knock: 0,
    launch: 0,
    hitstop: 55,
    shake: 0.08,
    unblockable: true,
  }),
  kneeFinal: A({
    id: 'kneeFinal',
    anim: 'knee',
    frames: [0, 1, 1],
    startup: 5,
    active: 2,
    recovery: 14,
    box: { x: 2, w: 22, z0: 8, z1: 32, depth: 8 },
    damage: 10,
    knock: 170,
    launch: 180,
    hitstop: 90,
    shake: 0.25,
    heavy: true,
    unblockable: true,
    word: 'BAM!',
  }),

  // specials
  spSpin: A({
    id: 'spSpin',
    anim: 'spSpin',
    frames: [0, 0, 1],
    startup: 4,
    active: 36,
    recovery: 10,
    box: { x: -28, w: 56, z0: 4, z1: 42, depth: 16 },
    damage: 5,
    knock: 90,
    launch: 0,
    hitstop: 40,
    shake: 0.12,
    hits: 6,
    interval: 6,
    around: true,
    unblockable: true,
  }),
  spDash: A({
    id: 'spDash',
    anim: 'spDash',
    frames: [0, 1, 2],
    startup: 12,
    active: 14,
    recovery: 16,
    box: { x: 0, w: 26, z0: 6, z1: 40, depth: 14 },
    damage: 26,
    knock: 280,
    launch: 240,
    hitstop: 140,
    shake: 0.55,
    lunge: 330,
    heavy: true,
    unblockable: true,
    word: 'KAPOW!',
  }),
  spSaw: A({
    id: 'spSaw',
    anim: 'spSaw',
    frames: [0, 0, 1],
    startup: 6,
    active: 42,
    recovery: 12,
    box: { x: 6, w: 30, z0: 10, z1: 36, depth: 12 },
    damage: 4,
    knock: 40,
    launch: 0,
    hitstop: 35,
    shake: 0.1,
    hits: 8,
    interval: 5,
    lunge: 35,
    unblockable: true,
  }),
  spShoot: A({
    id: 'spShoot',
    anim: 'spShoot',
    frames: [0, 1, 1],
    startup: 12,
    active: 2,
    recovery: 18,
    box: { x: 0, w: 0, z0: 0, z1: 0, depth: 0 },
    damage: 0,
    knock: 0,
    launch: 0,
    hitstop: 0,
    shake: 0,
  }),
  spBeam: A({
    id: 'spBeam',
    anim: 'spBeam',
    frames: [0, 1, 1],
    startup: 16,
    active: 30,
    recovery: 14,
    box: { x: 10, w: 340, z0: 16, z1: 34, depth: 12 },
    damage: 6,
    knock: 120,
    launch: 0,
    hitstop: 40,
    shake: 0.14,
    hits: 5,
    interval: 6,
    unblockable: true,
  }),
  spSlam: A({
    id: 'spSlam',
    anim: 'spSlam',
    frames: [0, 1, 1],
    startup: 18,
    active: 4,
    recovery: 20,
    box: { x: -72, w: 144, z0: -4, z1: 20, depth: 26 },
    damage: 18,
    knock: 200,
    launch: 250,
    hitstop: 120,
    shake: 0.6,
    around: true,
    unblockable: true,
    heavy: true,
    word: 'BOOM!',
  }),

  // enemies
  eJab: A({
    id: 'eJab',
    anim: 'jab',
    startup: 13,
    active: 4,
    recovery: 18,
    box: { x: 4, w: 18 },
    damage: 7,
    knock: 70,
    launch: 0,
    hitstop: 65,
    shake: 0.12,
  }),
  eFast: A({
    id: 'eFast',
    anim: 'cross',
    startup: 8,
    active: 3,
    recovery: 11,
    box: { x: 4, w: 19 },
    damage: 5,
    knock: 60,
    launch: 0,
    hitstop: 55,
    shake: 0.08,
  }),
  eSmash: A({
    id: 'eSmash',
    anim: 'smash',
    startup: 24,
    active: 5,
    recovery: 26,
    box: { x: 2, w: 30, z0: 0, z1: 40, depth: 13 },
    damage: 15,
    knock: 190,
    launch: 200,
    hitstop: 110,
    shake: 0.35,
    heavy: true,
  }),
  eBash: A({
    id: 'eBash',
    anim: 'jab',
    startup: 15,
    active: 4,
    recovery: 20,
    box: { x: 4, w: 20 },
    damage: 8,
    knock: 130,
    launch: 0,
    hitstop: 70,
    shake: 0.14,
  }),
  eToss: A({
    id: 'eToss',
    anim: 'toss',
    frames: [0, 1, 1],
    startup: 16,
    active: 1,
    recovery: 24,
    box: { x: 0, w: 0, z0: 0, z1: 0, depth: 0 },
    damage: 0,
    knock: 0,
    launch: 0,
    hitstop: 0,
    shake: 0,
  }),

  // bosses
  bPunch: A({
    id: 'bPunch',
    anim: 'cross',
    startup: 12,
    active: 4,
    recovery: 16,
    box: { x: 4, w: 24 },
    damage: 12,
    knock: 150,
    launch: 0,
    hitstop: 90,
    shake: 0.2,
  }),
  bSmash: A({
    id: 'bSmash',
    anim: 'smash',
    startup: 20,
    active: 5,
    recovery: 22,
    box: { x: 2, w: 32, z0: 0, z1: 44, depth: 14 },
    damage: 16,
    knock: 210,
    launch: 220,
    hitstop: 120,
    shake: 0.4,
    heavy: true,
  }),
  bCharge: A({
    id: 'bCharge',
    anim: 'charge',
    frames: [0, 0, 0],
    startup: 0,
    active: 999,
    recovery: 0,
    box: { x: -6, w: 28, z0: 0, z1: 44, depth: 14 },
    damage: 16,
    knock: 250,
    launch: 250,
    hitstop: 120,
    shake: 0.45,
    heavy: true,
  }),
  bSpin: A({
    id: 'bSpin',
    anim: 'spSpin',
    frames: [0, 0, 0],
    startup: 0,
    active: 999,
    recovery: 0,
    box: { x: -30, w: 60, z0: 4, z1: 44, depth: 16 },
    damage: 8,
    knock: 170,
    launch: 0,
    hitstop: 60,
    shake: 0.18,
    hits: 99,
    interval: 14,
    around: true,
  }),
  bShove: A({
    id: 'bShove',
    anim: 'spSlam',
    frames: [0, 1, 1],
    startup: 8,
    active: 4,
    recovery: 14,
    box: { x: -40, w: 80, z0: 0, z1: 44, depth: 20 },
    damage: 6,
    knock: 230,
    launch: 160,
    hitstop: 70,
    shake: 0.3,
    around: true,
    unblockable: true,
  }),
} satisfies Record<string, AttackDef>;

let nextId = 1;

export class Actor {
  id = nextId++;
  kind: ActorKind;
  team: 0 | 1;
  look: Look;
  sprites: SpriteSet;
  /** size multiplier for boxes (look.scale) */
  size: number;

  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  px = 0;
  py = 0;
  pz = 0;
  facing: 1 | -1 = 1;

  state: ActorState = 'idle';
  stateT = 0;
  anim: AnimId = 'idle';
  frame = 0;
  animT = 0;

  hp = 100;
  maxHp = 100;
  speed = 70;
  power = 1;
  weight = 1;

  freezeMs = 0;
  invuln = 0;
  flash = 0;
  stun = 0;
  juggle = 0;
  bounced = false;
  sqX = 1;
  sqY = 1;
  hpBarT = 0;
  tint: string | null = null;

  atk: AttackDef | null = null;
  atkT = 0;
  hitList: number[] = new Array(16).fill(0);
  hitCount = 0;
  bufferedAttack = 0;
  /** horizontal input held when the buffered attack was pressed */
  bufferedDir = 0;
  bufferedJump = 0;
  comboStep = 0;
  jumpAttackUsed = false;
  armor = 0; // hits absorbed without flinching while > 0 (bosses / heavies mid-attack)

  grabbing: Actor | null = null;
  grabbedBy: Actor | null = null;
  grabT = 0;
  kneeCount = 0;
  pushT = 0;
  comboLanded = false;
  /** consecutive blocked hits (shield enemies break after 3) */
  guardHits = 0;
  special: string | null = null;
  /** player slot that threw this actor (thrown bodies hurt other enemies) */
  thrownBy = -1;
  thrownHit: number[] = new Array(8).fill(0);
  thrownCount = 0;

  // player
  slot = -1;
  heldItem: string | null = null;
  lastAttacker = -1;

  // AI scratch
  defId = '';
  ai = 'approach';
  aiT = 0;
  aiSide: 1 | -1 = 1;
  aiHover = 60;
  aiLaneOff = 0;
  hasToken = false;
  attackCd = 0;
  target: Actor | null = null;
  score = 100;
  shield = false;
  grabbable = true;
  pattern = '';
  patT = 0;
  phase = 1;
  hitsTaken = 0;
  hitsWindow = 0;
  label = '';
  deadT = 0;
  tx = 0;
  ty = 0;

  constructor(kind: ActorKind, look: Look) {
    this.kind = kind;
    this.team = kind === 'player' ? 0 : 1;
    this.look = look;
    this.sprites = getSprites(look);
    this.size = look.scale * WORLD_SCALE;
  }

  setState(s: ActorState, anim?: AnimId): void {
    this.state = s;
    this.stateT = 0;
    if (anim) this.play(anim, true);
  }

  play(anim: AnimId, restart = false): void {
    if (this.anim === anim && !restart) return;
    this.anim = anim;
    this.frame = 0;
    this.animT = 0;
  }

  startAttack(def: AttackDef): void {
    this.atk = def;
    this.atkT = 0;
    this.hitCount = 0;
    this.setState('attack', def.anim);
    this.frame = def.frames[0];
  }

  /** Tick the current attack; refreshes the hit list on multi-hit beats. */
  advanceAttack(): void {
    const a = this.atk;
    if (!a) return;
    this.atkT++;
    if (
      a.hits &&
      a.interval &&
      this.atkT > a.startup &&
      this.atkPhase() === 1 &&
      (this.atkT - a.startup) % a.interval === 0
    ) {
      this.hitCount = 0;
    }
  }

  clearHits(): void {
    this.hitCount = 0;
  }

  hasHit(id: number): boolean {
    for (let i = 0; i < this.hitCount; i++) if (this.hitList[i] === id) return true;
    return false;
  }

  markHit(id: number): void {
    if (this.hitCount < this.hitList.length) this.hitList[this.hitCount++] = id;
  }

  /** Attack phase for the current attack tick. */
  atkPhase(): 0 | 1 | 2 {
    const a = this.atk;
    if (!a) return 2;
    if (this.atkT < a.startup) return 0;
    if (this.atkT < a.startup + a.active) return 1;
    return 2;
  }

  /** Advance self-looping animations. */
  tickAnim(): void {
    const def = ANIMS[this.anim];
    if (this.state === 'attack' || this.state === 'special') return;
    if (def.poses.length <= 1) {
      this.frame = 0;
      return;
    }
    this.animT++;
    if (this.animT >= def.rate) {
      this.animT = 0;
      this.frame++;
      if (this.frame >= def.poses.length) this.frame = def.loop ? 0 : def.poses.length - 1;
    }
  }

  savePrev(): void {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
  }

  /** Integrate velocity; returns true on the tick the actor lands. */
  integrate(): boolean {
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    this.y = clamp(this.y, FLOOR_TOP, FLOOR_BOTTOM);
    let landed = false;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= GRAVITY * DT;
      this.z += this.vz * DT;
      if (this.z <= 0) {
        this.z = 0;
        landed = true;
      }
    }
    // squash/stretch relax
    this.sqX += (1 - this.sqX) * 0.25;
    this.sqY += (1 - this.sqY) * 0.25;
    return landed;
  }

  get airborne(): boolean {
    return this.z > 0.01 || this.vz > 0;
  }

  get height(): number {
    return this.sprites.height;
  }

  get halfWidth(): number {
    return 8 * Math.sqrt(this.look.build) * this.size;
  }

  /** Can be hit right now (hurtbox exists). */
  get hittable(): boolean {
    if (this.invuln > 0) return false;
    const s = this.state;
    return (
      s !== 'down' &&
      s !== 'dead' &&
      s !== 'gone' &&
      s !== 'getup' &&
      s !== 'spawn' &&
      s !== 'grabbed' &&
      !(s === 'fall' && this.juggle >= 3)
    );
  }

  get alive(): boolean {
    return this.state !== 'dead' && this.state !== 'gone';
  }

  /** Neutral = free to act (walk/idle) */
  get neutral(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'run';
  }
}
