// Game = simulation + flow. Title/attract -> select -> stages (waves, scroll
// locks, boss) -> stage-clear tally -> ending, with lives, continues, drop-in
// co-op and an attack-token director. Pure TS, no DOM access except via the
// injected InputManager; rendering lives in render.ts.
import { Actor } from './actor';
import { sfx } from './audio';
import { BOSSES, BossId, createBoss, thinkBoss } from './bosses';
import { Camera } from './camera';
import { landFall, resolveMelee, updateHazards, updateProjectiles, updateReaction } from './combat';
import {
  DEFAULT_DIFFICULTY,
  Difficulty,
  FLOOR_BOTTOM,
  FLOOR_TOP,
  getTuning,
  PLAYER_HP,
  Tuning,
  VIEW_W,
} from './constants';
import { createEnemy, EnemyType, separateEnemies, thinkEnemy } from './enemies';
import { FighterDef, FIGHTERS, SpecialType } from './fighters';
import { InputManager, PlayerInput } from './input';
import { Hazard, HazardKind, Item, ITEM_INFO, ItemKind, Pool, Projectile, ProjKind } from './items';
import { clamp, randRange } from './math';
import { FxPools } from './particles';
import { onPlayerLand, updatePlayer } from './player';
import { SpawnDef, StageDef, STAGES, StageTheme, WaveDef } from './stages';

export type Phase = 'title' | 'select' | 'playing' | 'stageClear' | 'gameOver' | 'ending';
export type SlotState = 'inactive' | 'joining' | 'playing' | 'continue';

export interface PlayerSlot {
  index: number;
  state: SlotState;
  fighter: FighterDef;
  actor: Actor | null;
  lives: number;
  score: number;
  kos: number;
  stageKos: number;
  combo: number;
  comboT: number;
  bestCombo: number;
  continueT: number;
  deadT: number;
  cursor: number;
  /** hits taken in quick succession (stun-lock protection) */
  hurtChain: number;
  lastHurtT: number;
  /** score-based 1UPs already awarded this credit */
  oneUps: number;
  // select screen
  joined: boolean;
  confirmed: boolean;
  bonus: number;
}

export interface UiSnapshot {
  phase: Phase;
  paused: boolean;
  difficulty: Difficulty;
  stageNum: number;
  stageName: string;
  select: { cursors: [number, number]; joined: [boolean, boolean]; confirmed: [boolean, boolean] };
  continueSec: number;
  gameOverFinal: boolean;
  players: Array<{ state: SlotState; name: string; score: number; lives: number; best: number }>;
  announce: string;
  announceId: number;
  attractTip: number;
}

const TIP_COUNT = 4;

const newSlot = (index: number): PlayerSlot => ({
  index,
  state: 'inactive',
  fighter: FIGHTERS[index],
  actor: null,
  lives: getTuning(DEFAULT_DIFFICULTY, 1).lives,
  score: 0,
  kos: 0,
  stageKos: 0,
  combo: 0,
  comboT: 0,
  bestCombo: 0,
  continueT: 0,
  deadT: 0,
  hurtChain: 0,
  lastHurtT: -999,
  oneUps: 0,
  cursor: index,
  joined: index === 0,
  confirmed: false,
  bonus: 0,
});

export class Game {
  readonly fx = new FxPools();
  readonly camera = new Camera();
  readonly slots: PlayerSlot[] = [newSlot(0), newSlot(1)];
  readonly enemies: Actor[] = [];
  readonly playerActors: Actor[] = [];
  readonly fighters: Actor[] = [];
  readonly items = new Pool<Item>(40, () => new Item());
  readonly projectiles = new Pool<Projectile>(48, () => new Projectile());
  readonly hazards = new Pool<Hazard>(16, () => new Hazard());
  readonly parade: Actor[] = [];

  phase: Phase = 'title';
  paused = false;
  tick = 0;
  phaseT = 0;
  reduced = false;

  stageIdx = 0;
  stage: StageDef = STAGES[0];
  stageTheme: StageTheme = 'streets';
  waveIdx = 0;
  waveActive = false;
  spawnQueue: SpawnDef[] = [];
  spawnT = 0;
  spawnSide: 1 | -1 = 1;
  waveMax = 3;
  goT = 0;
  stageIntroT = 0;
  boss: Actor | null = null;
  bossSpawned = false;
  bossIntroT = 0;
  bossDefeatedT = 0;
  flashT = 0;
  flashColor = '#ffffff';
  koBannerT = 0;
  continueT = 0;
  gameOverFinalT = 0;
  attractTip = 0;
  difficulty: Difficulty = DEFAULT_DIFFICULTY;

  private tokens = new Set<number>();
  private lastTokenT = -999;
  private uiDirty = true;
  private announceText = '';
  private announceId = 0;
  private lastContinueSec = -1;

  constructor(
    readonly input: InputManager,
    private onUi: (s: UiSnapshot) => void
  ) {
    this.buildParade();
  }

  // ------------------------------------------------------------------ helpers
  sfx(name: Parameters<typeof sfx>[0]): void {
    sfx(name);
  }

  announce(text: string): void {
    this.announceText = text;
    this.announceId++;
    this.uiDirty = true;
  }

  markUi(): void {
    this.uiDirty = true;
  }

  screenFlash(color: string): void {
    if (this.reduced) return;
    this.flashT = 6;
    this.flashColor = color;
  }

  actorById(id: number): Actor | null {
    for (const a of this.fighters) if (a.id === id) return a;
    return null;
  }

  isTargetable(a: Actor): boolean {
    return (
      a.kind === 'player' &&
      a.hp > 0 &&
      a.state !== 'dead' &&
      a.state !== 'gone' &&
      a.slot >= 0 &&
      this.slots[a.slot].state === 'playing'
    );
  }

  nearestPlayer(x: number, y: number): Actor | null {
    let best: Actor | null = null;
    let bd = Infinity;
    for (const p of this.playerActors) {
      if (!this.isTargetable(p)) continue;
      const d = Math.abs(p.x - x) + Math.abs(p.y - y) * 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  activePlayerActors(): Actor[] {
    return this.playerActors.filter((p) => this.isTargetable(p));
  }

  private activePlayerCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.state === 'playing') n++;
    return Math.max(1, n);
  }

  /** Balance for the chosen difficulty and the players currently fighting. */
  get tuning(): Tuning {
    return getTuning(this.difficulty, this.activePlayerCount());
  }

  setDifficulty(d: Difficulty): void {
    if (d === this.difficulty) return;
    this.difficulty = d;
    this.uiDirty = true;
    this.announce(`Difficulty: ${d}`);
  }

  /** Attack-token director: caps and staggers how many enemies swing at once. */
  requestToken(e: Actor): boolean {
    if (this.tokens.has(e.id)) return true;
    const tun = this.tuning;
    if (this.tokens.size >= tun.maxAttackers) return false;
    if (this.tick - this.lastTokenT < tun.attackStagger) return false;
    this.lastTokenT = this.tick;
    this.tokens.add(e.id);
    e.hasToken = true;
    return true;
  }

  releaseToken(e: Actor): void {
    this.tokens.delete(e.id);
    e.hasToken = false;
  }

  grabCandidate(a: Actor): Actor | null {
    for (const e of this.enemies) {
      if (!e.grabbable || e.kind !== 'enemy' || e.airborne) continue;
      if (e.state !== 'idle' && e.state !== 'walk' && e.state !== 'hurt' && e.state !== 'block')
        continue;
      if (Math.abs(e.y - a.y) > 6) continue;
      if (Math.abs(e.x - a.x) > a.halfWidth + e.halfWidth + 3) continue;
      return e;
    }
    return null;
  }

  weaponAt(a: Actor): Item | null {
    for (const it of this.items.items) {
      if (!it.active || !ITEM_INFO[it.kind].weapon) continue;
      if (Math.abs(it.x - a.x) < 16 && Math.abs(it.y - a.y) < 9 && it.z < 6) return it;
    }
    return null;
  }

  spawnItem(kind: ItemKind, x: number, y: number, z = 0, life = 0): Item | null {
    const it = this.items.get();
    if (!it) return null;
    it.active = true;
    it.kind = kind;
    it.x = it.px = x;
    it.y = clamp(y, FLOOR_TOP + 2, FLOOR_BOTTOM - 2);
    it.z = it.pz = z;
    it.vz = z > 0 ? 90 : 0;
    it.hp = kind === 'crate' ? 2 : 0;
    it.drop = null;
    it.life = life;
    it.flash = 0;
    return it;
  }

  hitCrate(it: Item, dir: number): void {
    it.hp--;
    it.flash = 6;
    this.fx.debris(it.x, it.y, 10, 3, '#c8863a');
    this.sfx('hit');
    if (it.hp <= 0) {
      it.active = false;
      this.fx.debris(it.x, it.y, 12, 8, '#c8863a');
      this.fx.burst(it.x, it.y, 12, 8, '#ffd35a');
      this.sfx('heavy');
      if (it.drop) this.spawnItem(it.drop, it.x + dir * 4, it.y, 10);
    }
  }

  dropHeldItem(a: Actor): void {
    if (!a.heldItem) return;
    this.spawnItem(a.heldItem as ItemKind, a.x, a.y, 20, 600);
    a.heldItem = null;
  }

  private projectile(team: 0 | 1, owner: Actor, slot: number, kind: ProjKind): Projectile | null {
    const p = this.projectiles.get();
    if (!p) return null;
    p.active = true;
    p.kind = kind;
    p.team = team;
    p.owner = owner.id;
    p.slot = slot;
    p.x = p.px = owner.x + owner.facing * 14 * owner.size;
    p.y = owner.y;
    p.z = p.pz = 24 * owner.size;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.g = 0;
    p.t = 0;
    p.life = 120;
    p.damage = 8;
    p.knock = 110;
    p.launch = 0;
    p.stun = 0;
    p.hitstop = 60;
    p.w = 10;
    p.h = 10;
    p.depth = 8;
    p.pierce = 1;
    p.interval = 0;
    p.hitCount = 0;
    p.returning = false;
    return p;
  }

  throwHeldItem(a: Actor, slot: number): void {
    const kind = a.heldItem as ProjKind | null;
    a.heldItem = null;
    if (kind !== 'bottle' && kind !== 'pipe') return;
    const p = this.projectile(0, a, slot, kind);
    if (!p) return;
    p.vx = a.facing * 310;
    p.damage = kind === 'pipe' ? 20 : 16;
    p.launch = 170;
    p.knock = 170;
    p.hitstop = 80;
    p.pierce = kind === 'pipe' ? 2 : 1;
    p.w = kind === 'pipe' ? 20 : 10;
    p.h = 12;
    p.depth = 10;
    p.life = 90;
    this.sfx('throw');
  }

  spawnPlayerProjectile(a: Actor, type: SpecialType, slot: number): void {
    const kind: ProjKind = type === 'orb' ? 'orb' : type === 'shot' ? 'web' : 'batarang';
    const p = this.projectile(0, a, slot, kind);
    if (!p) return;
    if (kind === 'orb') {
      p.vx = a.facing * 150;
      p.w = 20;
      p.h = 22;
      p.depth = 14;
      p.damage = 8;
      p.knock = 60;
      p.pierce = 99;
      p.interval = 9;
      p.life = 150;
      p.hitstop = 45;
    } else if (kind === 'web') {
      p.vx = a.facing * 330;
      p.w = 16;
      p.h = 14;
      p.depth = 11;
      p.damage = 6;
      p.knock = 20;
      p.stun = 110;
      p.pierce = 3;
      p.life = 70;
    } else {
      p.vx = a.facing * 300;
      p.w = 18;
      p.h = 10;
      p.depth = 11;
      p.damage = 11;
      p.knock = 130;
      p.pierce = 99;
      p.life = 120;
    }
  }

  spawnEnemyProjectile(e: Actor, kind: ProjKind): void {
    const p = this.projectile(1, e, -1, kind);
    if (!p) return;
    p.vx = e.facing * 175;
    p.vz = 70;
    p.g = 160;
    p.z = 30;
    p.damage = 8 * this.tuning.enemyDamage;
    p.knock = 120;
    p.depth = 7;
    p.w = 8;
    p.h = 12;
    p.life = 110;
    this.sfx('throw');
  }

  spawnBossProjectile(
    b: Actor,
    kind: ProjKind,
    speed: number,
    vy: number,
    damage: number,
    life: number
  ): void {
    const p = this.projectile(1, b, -1, kind);
    if (!p) return;
    p.vx = b.facing * speed;
    p.vy = vy;
    p.z = 30;
    p.damage = damage * this.tuning.bossDamage;
    p.knock = 140;
    p.w = 12;
    p.h = 12;
    p.depth = 9;
    p.life = life;
  }

  spawnHazard(
    kind: HazardKind,
    x: number,
    y: number,
    w: number,
    warn: number,
    life: number,
    damage: number,
    launch: number,
    color: string
  ): void {
    const h = this.hazards.get();
    if (!h) return;
    h.active = true;
    h.kind = kind;
    h.x = x;
    h.y = y;
    h.w = w;
    h.depth = kind === 'shock' ? 22 : kind === 'laser' ? 9 : 10;
    h.warn = warn;
    h.life = life;
    h.t = 0;
    h.damage = damage * this.tuning.bossDamage;
    h.launch = launch;
    h.color = color;
    h.hitCount = 0;
  }

  spawnEnemy(type: EnemyType, variant: number, side: 1 | -1): Actor {
    const e = createEnemy(type, variant, this.tuning.enemyHp);
    const camX = this.camera.x;
    e.x = e.px = side < 0 ? camX - 26 : camX + VIEW_W + 26;
    e.y = e.py = randRange(FLOOR_TOP + 6, FLOOR_BOTTOM - 4);
    e.tx = side < 0 ? camX + randRange(30, 90) : camX + VIEW_W - randRange(30, 90);
    e.facing = side < 0 ? 1 : -1;
    e.setState('spawn', 'walk');
    this.enemies.push(e);
    return e;
  }

  onPlayerLandedHit(slot: number, dmg: number): void {
    const s = this.slots[slot];
    if (!s) return;
    s.score += dmg * 10;
    s.combo++;
    s.comboT = 80;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
  }

  onEnemyLethal(e: Actor): void {
    if (e.kind === 'boss' && this.bossDefeatedT === 0) {
      this.bossDefeatedT = 1;
      this.koBannerT = 150;
      for (const a of this.fighters) a.freezeMs = Math.max(a.freezeMs, 420);
      this.screenFlash('#ffffff');
      this.camera.shake(0.8);
      this.sfx('boss');
      const s = this.slots[e.lastAttacker];
      if (s) s.score += e.score;
      for (const o of this.enemies) {
        if (o !== e && o.alive && o.hp > 0) {
          o.hp = 0;
          o.setState('fall', 'fall');
          o.vz = 220;
          o.z = 1;
          o.vx = (o.x < e.x ? -1 : 1) * 120;
        }
      }
      this.announce(`${BOSSES[e.defId as BossId]?.name ?? 'Boss'} defeated`);
    }
  }

  onEnemyKO(e: Actor): void {
    if (e.kind === 'boss') return;
    const s = this.slots[e.lastAttacker];
    if (s) {
      s.score += e.score;
      s.kos++;
      s.stageKos++;
    }
    this.sfx('ko');
    const tun = this.tuning;
    if (Math.random() < tun.koDropChance)
      this.spawnItem(Math.random() < tun.koFoodShare ? 'donut' : 'coin', e.x, e.y, 12, 480);
  }

  // ------------------------------------------------------------------ flow
  private buildParade(): void {
    FIGHTERS.forEach((f, i) => {
      const a = new Actor('player', f.look);
      a.x = -40 - i * 70;
      a.y = FLOOR_TOP + 14 + (i % 3) * 18;
      a.speed = 38 + (i % 4) * 4;
      a.setState('walk', 'walk');
      a.frame = i % 6;
      this.parade.push(a);
    });
  }

  goSelect(): void {
    this.phase = 'select';
    this.phaseT = 0;
    this.paused = false;
    for (const s of this.slots) {
      s.confirmed = false;
      s.joined = s.index === 0;
      s.cursor = s.index;
    }
    this.sfx('confirm');
    this.announce('Character select');
  }

  selectMove(p: number, dx: number, dy: number): void {
    const s = this.slots[p];
    if (!s.joined || s.confirmed) return;
    const cols = 5;
    const n = FIGHTERS.length;
    let c = s.cursor;
    if (dx) c = (c + dx + n) % n;
    if (dy) c = (c + dy * cols + n) % n;
    s.cursor = c;
    this.sfx('select');
    this.uiDirty = true;
  }

  selectSet(p: number, index: number): void {
    const s = this.slots[p];
    if (!s.joined) s.joined = true;
    if (s.confirmed) s.confirmed = false;
    s.cursor = clamp(index, 0, FIGHTERS.length - 1);
    this.uiDirty = true;
  }

  selectConfirm(p: number): boolean {
    const s = this.slots[p];
    if (!s.joined) {
      s.joined = true;
      this.sfx('select');
      this.uiDirty = true;
      this.announce(`Player ${p + 1} joined`);
      return false;
    }
    const other = this.slots[1 - p];
    if (other.joined && other.confirmed && other.cursor === s.cursor) {
      this.sfx('block');
      return false;
    }
    s.confirmed = true;
    s.fighter = FIGHTERS[s.cursor];
    this.sfx('confirm');
    this.uiDirty = true;
    this.announce(`Player ${p + 1} picked ${s.fighter.name}`);
    return true;
  }

  selectBack(p: number): void {
    const s = this.slots[p];
    if (s.confirmed) s.confirmed = false;
    else if (p === 1) s.joined = false;
    else {
      this.toTitle();
      return;
    }
    this.uiDirty = true;
  }

  setP2Joined(joined: boolean): void {
    const s = this.slots[1];
    s.joined = joined;
    if (!joined) s.confirmed = false;
    if (joined && s.cursor === this.slots[0].cursor) s.cursor = (s.cursor + 1) % FIGHTERS.length;
    this.uiDirty = true;
  }

  canBegin(): boolean {
    const [a, b] = this.slots;
    return a.confirmed && (!b.joined || b.confirmed);
  }

  /** Start the match with whoever is confirmed in select. */
  beginMatch(): void {
    for (const s of this.slots) {
      s.lives = this.tuning.lives;
      s.score = 0;
      s.oneUps = 0;
      s.kos = 0;
      s.bestCombo = 0;
      s.combo = 0;
      s.actor = null;
      s.state = s.joined && s.confirmed ? 'playing' : 'inactive';
      if (s.index === 0 && s.state !== 'playing') {
        s.fighter = FIGHTERS[s.cursor];
        s.state = 'playing';
      }
    }
    this.loadStage(0);
  }

  /** Random fighters and straight into stage 1 (title "auto draft"). */
  quickStart(): void {
    const pick = Math.floor(Math.random() * FIGHTERS.length);
    this.slots[0].cursor = pick;
    this.slots[0].joined = true;
    this.slots[0].confirmed = true;
    this.slots[0].fighter = FIGHTERS[pick];
    if (this.slots[1].joined) {
      const p2 = (pick + 1 + Math.floor(Math.random() * (FIGHTERS.length - 1))) % FIGHTERS.length;
      this.slots[1].cursor = p2;
      this.slots[1].confirmed = true;
      this.slots[1].fighter = FIGHTERS[p2];
    }
    this.beginMatch();
  }

  toTitle(): void {
    this.phase = 'title';
    this.phaseT = 0;
    this.paused = false;
    this.enemies.length = 0;
    this.fighters.length = 0;
    this.playerActors.length = 0;
    this.items.clear();
    this.projectiles.clear();
    this.hazards.clear();
    this.fx.clear();
    this.tokens.clear();
    this.stage = STAGES[0];
    this.stageTheme = 'streets';
    this.camera.reset(this.stage.length);
    for (const s of this.slots) {
      s.state = 'inactive';
      s.actor = null;
      s.joined = s.index === 0;
      s.confirmed = false;
    }
    this.announce('Title screen');
  }

  private spawnPlayer(s: PlayerSlot, drop: boolean): void {
    const f = s.fighter;
    const a = new Actor('player', f.look);
    a.slot = s.index;
    a.maxHp = PLAYER_HP;
    a.hp = PLAYER_HP;
    a.speed = f.speed;
    a.power = f.power;
    a.weight = f.look.build > 1.2 ? 1.25 : 1;
    const camX = this.camera.x;
    a.x = a.px = camX + 50 + s.index * 34;
    a.y = a.py = FLOOR_TOP + 22 + s.index * 20;
    a.facing = 1;
    a.invuln = 120;
    if (drop) {
      a.z = a.pz = 150;
      a.vz = 0;
      a.setState('jump', 'jumpDown');
      a.jumpAttackUsed = true;
    } else {
      a.setState('idle', 'idle');
    }
    s.actor = a;
    s.state = 'playing';
    s.deadT = 0;
    s.hurtChain = 0;
  }

  loadStage(idx: number): void {
    this.stageIdx = idx;
    this.stage = STAGES[idx];
    this.stageTheme = this.stage.theme;
    this.camera.reset(this.stage.length);
    this.camera.reduced = this.reduced;
    this.enemies.length = 0;
    this.items.clear();
    this.projectiles.clear();
    this.hazards.clear();
    this.fx.clear();
    this.fx.reduced = this.reduced;
    this.tokens.clear();
    this.lastTokenT = -999;
    this.waveIdx = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.goT = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.bossIntroT = 0;
    this.bossDefeatedT = 0;
    this.koBannerT = 0;
    this.stageIntroT = 170;
    for (const c of this.stage.crates) {
      const it = this.spawnItem('crate', c.x, c.y);
      if (it) it.drop = c.drop;
    }
    for (const i of this.stage.items) this.spawnItem(i.kind, i.x, i.y);
    for (const s of this.slots) {
      s.stageKos = 0;
      s.bonus = 0;
      if (s.state === 'playing') {
        this.spawnPlayer(s, false);
        if (s.actor) s.actor.invuln = 60;
      }
    }
    this.phase = 'playing';
    this.phaseT = 0;
    this.paused = false;
    this.rebuildLists();
    this.sfx('confirm');
    this.announce(`Stage ${this.stage.num}: ${this.stage.name}`);
  }

  continueGame(): void {
    let any = false;
    for (const s of this.slots) {
      if (s.state === 'continue') {
        s.lives = this.tuning.lives;
        s.score = 0;
        s.oneUps = 0;
        this.spawnPlayer(s, true);
        any = true;
      }
    }
    if (any) {
      this.phase = 'playing';
      this.phaseT = 0;
      this.sfx('confirm');
      this.announce('Continue! Back in the fight');
    }
  }

  /** Mouse/touch path to skip the stage-clear tally. */
  skipTally(): void {
    if (this.phase === 'stageClear' && this.phaseT > 40) this.phaseT = 331;
  }

  togglePause(force?: boolean): void {
    if (this.phase !== 'playing') return;
    this.paused = force ?? !this.paused;
    this.input.clear();
    this.uiDirty = true;
    this.announce(this.paused ? 'Paused' : 'Resumed');
  }

  // ------------------------------------------------------------------ tick
  update(): void {
    this.input.poll();
    this.tick++;
    const inputs = this.input.players;

    if (this.input.pausePressed) this.togglePause();
    if (this.phase === 'playing') {
      for (const s of this.slots)
        if (s.state === 'playing' && inputs[s.index].startP) this.togglePause();
    }
    if (this.paused) {
      this.flushUi();
      return;
    }
    this.phaseT++;

    switch (this.phase) {
      case 'title':
        this.updateTitle();
        break;
      case 'select':
        this.updateSelect();
        break;
      case 'playing':
        this.updatePlaying();
        break;
      case 'stageClear':
        this.updateStageClear();
        break;
      case 'gameOver':
        this.updateGameOver();
        break;
      case 'ending':
        this.fx.update(1 / 60);
        if (this.phaseT % 40 === 0) this.fx.confetti(this.camera.x + VIEW_W / 2, 150, 20);
        for (const p of this.playerActors) {
          p.savePrev();
          p.tickAnim();
        }
        if (this.phaseT > 90 && inputs.some((i) => i.startP || i.attackP)) this.toTitle();
        break;
    }
    this.flushUi();
  }

  private flushUi(): void {
    if (this.phase === 'gameOver') {
      const sec = Math.ceil(this.continueT / 60);
      if (sec !== this.lastContinueSec) {
        this.lastContinueSec = sec;
        this.uiDirty = true;
      }
    }
    if (!this.uiDirty) return;
    this.uiDirty = false;
    const [a, b] = this.slots;
    this.onUi({
      phase: this.phase,
      paused: this.paused,
      difficulty: this.difficulty,
      stageNum: this.stage.num,
      stageName: this.stage.name,
      select: {
        cursors: [a.cursor, b.cursor],
        joined: [a.joined, b.joined],
        confirmed: [a.confirmed, b.confirmed],
      },
      continueSec: Math.max(0, Math.ceil(this.continueT / 60)),
      gameOverFinal: this.gameOverFinalT > 0,
      players: this.slots.map((s) => ({
        state: s.state,
        name: s.fighter.name,
        score: s.score,
        lives: s.lives,
        best: s.bestCombo,
      })),
      announce: this.announceText,
      announceId: this.announceId,
      attractTip: this.attractTip,
    });
  }

  private updateTitle(): void {
    const inputs = this.input.players;
    for (const a of this.parade) {
      a.savePrev();
      a.x += a.speed / 60;
      a.tickAnim();
      if (a.x > VIEW_W + 40) a.x = a.px = -40 - Math.random() * 120;
    }
    this.camera.prevX = this.camera.x;
    this.camera.x += 0.35;
    if (this.camera.x > 4000) this.camera.x = this.camera.prevX = 0;
    if (this.phaseT % 300 === 0) {
      this.attractTip = (this.attractTip + 1) % TIP_COUNT;
      this.uiDirty = true;
    }
    if (this.phaseT > 20) {
      if (inputs[1].startP || inputs[1].attackP) {
        this.goSelect();
        this.setP2Joined(true);
      } else if (inputs[0].startP || inputs[0].attackP) this.goSelect();
    }
  }

  private updateSelect(): void {
    const inputs = this.input.players;
    for (let p = 0; p < 2; p++) {
      const inp = inputs[p];
      const s = this.slots[p];
      if (!s.joined) {
        if (inp.attackP || inp.startP) this.selectConfirm(p);
        continue;
      }
      if (inp.leftP) this.selectMove(p, -1, 0);
      if (inp.rightP) this.selectMove(p, 1, 0);
      if (inp.upP) this.selectMove(p, 0, -1);
      if (inp.downP) this.selectMove(p, 0, 1);
      if ((inp.attackP || inp.startP) && this.phaseT > 10) {
        if (s.confirmed && p === 0 && this.canBegin()) {
          this.beginMatch();
          return;
        }
        this.selectConfirm(p);
      }
      if (inp.jumpP) {
        this.selectBack(p);
        if (this.phase !== 'select') return;
      }
    }
    for (const s of this.slots) {
      if (!s.joined) continue;
      const a = this.previewActor(s.index, FIGHTERS[s.cursor]);
      a.savePrev();
      a.tickAnim();
    }
    if (this.canBegin()) {
      if (this.phaseT > 12 && this.selectReadyT++ > 50) this.beginMatch();
    } else this.selectReadyT = 0;
  }

  private selectReadyT = 0;
  private previews: Array<Actor | null> = [null, null];

  /** Big idle preview actor for the select screen. */
  previewActor(p: number, f: FighterDef): Actor {
    let a = this.previews[p];
    if (!a || a.look.key !== f.look.key) {
      a = new Actor('player', f.look);
      a.setState('idle', 'idle');
      a.facing = p === 0 ? 1 : -1;
      this.previews[p] = a;
    }
    const s = this.slots[p];
    if (s.confirmed && a.anim !== 'victory') a.play('victory', true);
    if (!s.confirmed && a.anim !== 'idle') a.play('idle', true);
    return a;
  }

  private rebuildLists(): void {
    this.playerActors.length = 0;
    this.fighters.length = 0;
    for (const s of this.slots) {
      if (s.actor && s.state === 'playing') {
        this.playerActors.push(s.actor);
        this.fighters.push(s.actor);
      }
    }
    for (const e of this.enemies) this.fighters.push(e);
  }

  private updateSlots(): void {
    const inputs = this.input.players;
    const lifeStep = this.tuning.extraLifeScore;
    for (const s of this.slots) {
      const inp = inputs[s.index];
      if (s.comboT > 0) s.comboT--;
      else s.combo = 0;
      if (lifeStep > 0 && s.state === 'playing' && Math.floor(s.score / lifeStep) > s.oneUps) {
        s.oneUps = Math.floor(s.score / lifeStep);
        s.lives++;
        const a = s.actor;
        if (a) this.fx.text(a.x, a.y, a.height + 14, '1UP!', '#7dff6a', 2, 60);
        this.sfx('pickup');
        this.announce(`Player ${s.index + 1}: extra life! ${s.lives} lives`);
      }
      switch (s.state) {
        case 'inactive':
          if ((inp.startP || inp.attackP) && this.bossDefeatedT === 0) {
            s.state = 'joining';
            const other = this.slots[1 - s.index];
            s.cursor =
              (other.state === 'playing' && other.fighter === FIGHTERS[s.cursor]
                ? s.cursor + 1
                : s.cursor) % FIGHTERS.length;
            this.sfx('select');
            this.announce(
              `Player ${s.index + 1} choose a fighter: left and right, attack to confirm`
            );
          }
          break;
        case 'joining': {
          const other = this.slots[1 - s.index];
          const taken = other.state === 'playing' ? FIGHTERS.indexOf(other.fighter) : -1;
          const step = inp.leftP ? -1 : inp.rightP ? 1 : 0;
          if (step) {
            s.cursor = (s.cursor + step + FIGHTERS.length) % FIGHTERS.length;
            if (s.cursor === taken)
              s.cursor = (s.cursor + step + FIGHTERS.length) % FIGHTERS.length;
            this.sfx('select');
          }
          if ((inp.attackP || inp.startP) && s.cursor !== taken) {
            s.fighter = FIGHTERS[s.cursor];
            s.lives = this.tuning.lives;
            s.score = 0;
            s.oneUps = 0;
            this.spawnPlayer(s, true);
            this.sfx('confirm');
            this.announce(`Player ${s.index + 1} joined as ${s.fighter.name}`);
          } else if (inp.jumpP) {
            s.state = 'inactive';
          }
          break;
        }
        case 'playing': {
          const a = s.actor;
          if (!a) break;
          if (a.state === 'dead') {
            s.deadT++;
            if (s.deadT > 70) {
              s.lives--;
              if (s.lives > 0) {
                this.spawnPlayer(s, true);
                this.announce(`Player ${s.index + 1}: ${s.lives} lives left`);
              } else {
                s.state = 'continue';
                s.continueT = 600;
                s.actor = null;
                this.announce(`Player ${s.index + 1} is out. Press attack to continue`);
              }
              this.uiDirty = true;
            }
          }
          break;
        }
        case 'continue':
          s.continueT--;
          if (inp.startP || inp.attackP) {
            s.lives = this.tuning.lives;
            s.score = 0;
            s.oneUps = 0;
            this.spawnPlayer(s, true);
            this.sfx('confirm');
          } else if (s.continueT <= 0) {
            s.state = 'inactive';
            this.uiDirty = true;
          }
          break;
      }
    }
  }

  private updatePlaying(): void {
    this.updateSlots();
    this.rebuildLists();

    const inputs = this.input.players;
    for (const a of this.fighters) this.stepActor(a, inputs);

    resolveMelee(this);
    updateProjectiles(this);
    updateHazards(this);
    separateEnemies(this.enemies);
    this.updateItems();
    this.updateWaves();
    this.clampToView();

    // clean up finished KOs
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.state === 'dead' && e.deadT > 46) {
        this.releaseToken(e);
        this.enemies.splice(i, 1);
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let any = false;
    for (const p of this.playerActors) {
      if (!this.isTargetable(p)) continue;
      any = true;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    this.camera.update(minX, maxX, any);
    this.fx.update(1 / 60);
    if (this.flashT > 0) this.flashT--;
    if (this.koBannerT > 0) this.koBannerT--;
    if (this.boss && this.boss.hitsWindow > 0 && --this.boss.hitsWindow === 0)
      this.boss.hitsTaken = 0;

    // everyone out -> game over / continue screen
    const anyPlaying = this.slots.some((s) => s.state === 'playing');
    if (!anyPlaying) {
      const anyContinue = this.slots.some((s) => s.state === 'continue');
      this.phase = 'gameOver';
      this.phaseT = 0;
      this.continueT = anyContinue ? 600 : 0;
      this.gameOverFinalT = anyContinue ? 0 : 1;
      this.announce('Game over. Continue?');
    }
  }

  private stepActor(a: Actor, inputs: PlayerInput[]): void {
    a.savePrev();
    if (a.hpBarT > 0) a.hpBarT--;
    if (a.flash > 0) a.flash--;
    if (a.freezeMs > 0) {
      a.freezeMs -= 1000 / 60;
      return;
    }
    if (a.invuln > 0) a.invuln--;
    a.stateT++;
    if (a.state === 'grabbed') {
      a.tickAnim();
      if (!a.grabbedBy) a.setState('idle', 'idle');
      return;
    }
    if (!updateReaction(this, a)) {
      if (a.kind === 'player') {
        const s = this.slots[a.slot];
        updatePlayer(this, s, a, inputs[a.slot]);
      } else if (a.state === 'spawn') {
        this.updateSpawn(a);
      } else if (a.kind === 'enemy') {
        thinkEnemy(this, a);
      } else {
        thinkBoss(this, a);
      }
    }
    const vzBefore = a.vz;
    const landed = a.integrate();
    if (landed) {
      if (a.state === 'fall') landFall(this, a, vzBefore);
      else if (a.kind === 'player') onPlayerLand(this, a);
      else {
        a.vz = 0;
        a.z = 0;
      }
    }
    a.tickAnim();
  }

  private updateSpawn(e: Actor): void {
    const dx = e.tx - e.x;
    e.vx = Math.sign(dx) * e.speed * 1.3;
    e.vy = 0;
    e.facing = dx > 0 ? 1 : -1;
    e.play('walk');
    if (Math.abs(dx) < 4) {
      e.vx = 0;
      e.setState('idle', 'idle');
      e.ai = 'approach';
      if (e.kind === 'boss') {
        e.aiT = 0;
        e.attackCd = 60;
      }
    }
  }

  private clampToView(): void {
    const camX = this.camera.x;
    for (const p of this.playerActors) p.x = clamp(p.x, camX + 10, camX + VIEW_W - 10);
    for (const e of this.enemies) {
      if (e.state === 'spawn') continue;
      const lo = camX + 6;
      const hi = camX + VIEW_W - 6;
      if (e.x < lo || e.x > hi) {
        e.x = clamp(e.x, lo, hi);
        if (e.state === 'fall') e.vx = -e.vx * 0.3;
      }
    }
  }

  private updateItems(): void {
    for (const it of this.items.items) {
      if (!it.active) continue;
      it.px = it.x;
      it.pz = it.z;
      if (it.z > 0 || it.vz > 0) {
        it.vz -= 600 / 60;
        it.z += it.vz / 60;
        if (it.z <= 0) {
          it.z = 0;
          it.vz = it.vz < -60 ? -it.vz * 0.3 : 0;
        }
      }
      if (it.flash > 0) it.flash--;
      if (it.life > 0 && --it.life === 0) {
        it.active = false;
        continue;
      }
      const info = ITEM_INFO[it.kind];
      if (!info.heal && !info.score) continue;
      for (const p of this.playerActors) {
        if (!this.isTargetable(p) || p.state === 'fall' || p.state === 'down') continue;
        if (Math.abs(p.x - it.x) > 13 || Math.abs(p.y - it.y) > 9 || it.z > 12) continue;
        const s = this.slots[p.slot];
        if (info.heal) {
          p.hp = Math.min(p.maxHp, p.hp + info.heal);
          this.fx.text(
            p.x,
            p.y,
            p.height + 8,
            info.heal >= 100 ? 'FULL HP!' : `+${info.heal} HP`,
            '#7dff6a',
            1,
            40
          );
          this.sfx('food');
        } else if (info.score) {
          s.score += info.score;
          this.fx.text(p.x, p.y, p.height + 8, info.label, '#ffd35a', 1, 40);
          this.sfx('pickup');
        }
        this.fx.sparks(it.x, it.y, 6, 1, 4, '#ffffff');
        it.active = false;
        break;
      }
    }
  }

  private startWave(w: WaveDef): void {
    this.waveActive = true;
    this.spawnQueue = w.enemies.slice();
    const tun = this.tuning;
    const extra = Math.ceil(w.enemies.length * tun.waveExtra);
    for (let i = 0; i < extra; i++) this.spawnQueue.push(w.enemies[i % w.enemies.length]);
    this.waveMax = w.maxAlive + tun.waveAliveBonus;
    this.spawnT = 10;
    this.goT = 0;
  }

  private startBoss(): void {
    const id = this.stage.boss;
    const b = createBoss(id, this.tuning.bossHp);
    const camX = this.camera.x;
    b.x = b.px = camX + VIEW_W + 40;
    b.y = b.py = 176;
    b.tx = camX + VIEW_W - 80;
    b.facing = -1;
    b.setState('spawn', 'walk');
    this.enemies.push(b);
    this.boss = b;
    this.bossSpawned = true;
    this.bossIntroT = 170;
    this.sfx('boss');
    const def = BOSSES[id];
    this.fx.text(b.tx, b.y, 90, def.taunt, '#ffd35a', 1, 150);
    this.announce(`Boss: ${def.name}, ${def.title}`);
  }

  private updateWaves(): void {
    if (this.stageIntroT > 0) this.stageIntroT--;
    if (this.goT > 0) this.goT--;
    if (this.bossIntroT > 0) this.bossIntroT--;
    const cam = this.camera;
    if (!this.waveActive && !this.bossSpawned) {
      const next = this.stage.waves[this.waveIdx];
      cam.limit = next ? next.at : cam.stageMax;
      if (next && cam.x >= next.at - 0.5) this.startWave(next);
      else if (!next && cam.x >= cam.stageMax - 0.5) this.startBoss();
    }
    if (this.waveActive) {
      cam.limit = cam.x;
      let alive = 0;
      for (const e of this.enemies) if (e.alive && e.hp > 0) alive++;
      if (this.spawnT > 0) this.spawnT--;
      if (this.spawnQueue.length && alive < this.waveMax && this.spawnT <= 0) {
        const sp = this.spawnQueue.shift() as SpawnDef;
        this.spawnEnemy(sp.type, sp.variant, this.spawnSide);
        this.spawnSide = this.spawnSide > 0 ? -1 : 1;
        this.spawnT = 45;
      }
      if (!this.spawnQueue.length && alive === 0) {
        this.waveActive = false;
        this.waveIdx++;
        this.goT = 200;
        this.sfx('confirm');
        this.announce('Area clear. Go right');
        const next = this.stage.waves[this.waveIdx];
        cam.limit = next ? next.at : cam.stageMax;
      }
    }
    if (this.bossDefeatedT > 0) {
      this.bossDefeatedT++;
      if (this.bossDefeatedT === 140) {
        for (const p of this.playerActors)
          if (this.isTargetable(p)) p.setState('victory', 'victory');
        this.sfx('clear');
        this.fx.confetti(cam.x + VIEW_W / 2, 150, 40);
      }
      if (this.bossDefeatedT > 260) this.enterStageClear();
    }
  }

  private enterStageClear(): void {
    this.phase = 'stageClear';
    this.phaseT = 0;
    for (const s of this.slots) {
      const hp = s.actor && s.state === 'playing' ? Math.max(0, Math.round(s.actor.hp)) : 0;
      s.bonus = hp * 30 + s.stageKos * 100;
    }
    this.announce(`Stage ${this.stage.num} clear!`);
  }

  private updateStageClear(): void {
    this.fx.update(1 / 60);
    for (const p of this.playerActors) {
      p.savePrev();
      p.tickAnim();
    }
    const skip = this.phaseT > 80 && this.input.players.some((i) => i.attackP || i.startP);
    if (this.phaseT > 330 || skip) {
      for (const s of this.slots) {
        s.score += s.bonus;
        s.bonus = 0;
      }
      if (this.stageIdx + 1 < STAGES.length) {
        this.loadStage(this.stageIdx + 1);
      } else {
        this.phase = 'ending';
        this.phaseT = 0;
        this.enemies.length = 0;
        const x0 = this.camera.x;
        this.playerActors.forEach((p, i) => {
          p.x = p.px = x0 + VIEW_W / 2 - 30 + i * 60;
          p.y = p.py = 180;
          p.z = p.pz = 0;
          p.facing = i === 0 ? 1 : -1;
          p.setState('victory', 'victory');
        });
        this.sfx('clear');
        this.announce('You saved the arcade! The end');
      }
    }
  }

  private updateGameOver(): void {
    const inputs = this.input.players;
    if (this.gameOverFinalT > 0) {
      this.gameOverFinalT++;
      if (
        this.gameOverFinalT > 200 ||
        (this.gameOverFinalT > 60 && inputs.some((i) => i.startP || i.attackP))
      )
        this.toTitle();
      return;
    }
    this.continueT--;
    for (const s of this.slots) {
      if (
        s.state === 'continue' &&
        (inputs[s.index].startP || inputs[s.index].attackP) &&
        this.phaseT > 20
      ) {
        this.continueGame();
        return;
      }
    }
    if (this.continueT <= 0) {
      this.gameOverFinalT = 1;
      for (const s of this.slots) if (s.state === 'continue') s.state = 'inactive';
      this.uiDirty = true;
      this.announce('Game over');
    }
  }
}

export { FIGHTERS };
export type { BossId };
