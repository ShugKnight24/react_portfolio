import { createCanvasScene, clamp, damp, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  capsule,
  drawLayer,
  freeLayer,
  glow,
  hash,
  makeLayer,
  makeStage,
  Painter,
  Pool,
  prepLayer,
  rpoly,
  shapeHum,
  smooth,
  startHum,
  stopHum,
  vignette,
} from './games-kit';
import type { Hum, Stage } from './games-kit';

/**
 * Gears of War: Delta Squad holds a cover line in the ruins of Sera. Marcus, Dom, Cole and
 * Baird crouch behind broken concrete, each in heavy COG plate with blue-lit seams, while
 * Drones climb out of a glowing emergence hole and a Boomer lumbers up behind them.
 * Tap to have the squad pop up and fire on a target, hold to have Marcus rev his Lancer and
 * roadie-run out for a chainsaw kill, and R (or tapping the weapon panel) for an active reload.
 */

/* ---------- world ---------- */

/** Ground rises this far per unit of depth; things further back are smaller */
const ZY = 110;
const zy = (z: number) => -z * ZY;
const zk = (z: number) => 1 / (1 + z * 0.3);

const HOLE_X = 545;
const HOLE_Z = 1.55;
const HOLE_RX = 150;
const HOLE_RY = 30;
const TAP = 0.22;
const MAG = 60;
const RELOAD_T = 1.9;
const AR_GOOD = [0.36, 0.62] as const;
const AR_PERFECT = [0.45, 0.52] as const;
const ASH = 140;
const MAX_TRACERS = 28;
const MAX_ENEMIES = 5;
const GRAV = 900;

type Pal = readonly [string, string, string];
type GearId = 'marcus' | 'dom' | 'cole' | 'baird';
type CoverKind = 'barrier' | 'sandbag' | 'column' | 'planter';

const GUN: Pal = ['#8d939a', '#3a3e44', '#15171a'];
const BOOT: Pal = ['#4a4038', '#221c18', '#0c0908'];
const STRAP: Pal = ['#8a7a62', '#4c4236', '#221d17'];
const LOC_ARMOR: Pal = ['#8a7460', '#3a2e27', '#15100d'];
const LOC_ARMOR_D: Pal = ['#5e4f42', '#2a211c', '#0e0b09'];
const LOC_SKIN: Pal = ['#cfcbc0', '#8a867c', '#3c3a36'];
const LOC_SKIN_D: Pal = ['#9a978d', '#605d56', '#262522'];
const LOC_PANTS: Pal = ['#5a5048', '#2c2622', '#0f0c0a'];
const LOC_PANTS_D: Pal = ['#3e3731', '#1d1916', '#080706'];
const SEAM = 'rgba(6,8,12,0.8)';
const SHEEN = 'rgba(225,235,248,0.5)';

interface Look {
  armor: Pal;
  armorD: Pal;
  suit: Pal;
  suitD: Pal;
  skin: Pal;
  skinD: Pal;
  bulk: number;
  /** Bare, huge arms instead of sleeves (Cole) */
  bare: boolean;
  gun: 'lancer' | 'gnasher';
}

const dim = (p: Pal, q: Pal): Pal => [p[1], q[1], q[2]];

const LOOKS: Record<GearId, Look> = {
  marcus: {
    armor: ['#a3afbc', '#4c5866', '#1c232c'],
    armorD: ['#6f7a87', '#363f4a', '#14191f'],
    suit: ['#4c4f55', '#1f2125', '#0b0c0e'],
    suitD: ['#2c2e33', '#141518', '#060708'],
    skin: ['#e6b38c', '#a8714f', '#5c3a29'],
    skinD: ['#b07a58', '#7a5038', '#3a2418'],
    bulk: 1,
    bare: false,
    gun: 'lancer',
  },
  dom: {
    armor: ['#a8adb3', '#525860', '#20242a'],
    armorD: ['#757a80', '#3a3e44', '#15181c'],
    suit: ['#514f47', '#24231f', '#0d0d0b'],
    suitD: ['#302f2a', '#151512', '#060605'],
    skin: ['#dca472', '#9c6641', '#523221'],
    skinD: ['#a8774f', '#6e472c', '#331f13'],
    bulk: 0.97,
    bare: false,
    gun: 'gnasher',
  },
  cole: {
    armor: ['#9ba6b2', '#47515d', '#1b2027'],
    armorD: ['#6c7580', '#333a43', '#13171c'],
    suit: ['#45484d', '#1d1f22', '#0a0b0c'],
    suitD: ['#2a2c30', '#121315', '#050506'],
    skin: ['#a46c4a', '#633b24', '#27150b'],
    skinD: ['#80522f', '#4a2a18', '#1c0e06'],
    bulk: 1.16,
    bare: true,
    gun: 'lancer',
  },
  baird: {
    armor: ['#acb2b6', '#596067', '#23282d'],
    armorD: ['#7a8086', '#3e444a', '#16191c'],
    suit: ['#625a49', '#2c2920', '#100f0c'],
    suitD: ['#3d382d', '#1a1813', '#070605'],
    skin: ['#f2caa8', '#be8a68', '#6a4332'],
    skinD: ['#c39a7a', '#8a6048', '#452b20'],
    bulk: 0.95,
    bare: false,
    gun: 'lancer',
  },
};

interface Gear {
  id: GearId;
  look: Look;
  /** Home spot in cover */
  hx: number;
  hz: number;
  size: number;
  cover: CoverKind;
  /** Current position; only Marcus leaves cover */
  x: number;
  z: number;
  lift: number;
  face: 1 | -1;
  pop: number;
  popTo: number;
  hold: number;
  aim: number;
  recoil: number;
  flash: number;
  burst: number;
  shotT: number;
  wait: number;
  target: Enemy | null;
  tx: number;
  ty: number;
  mx: number;
  my: number;
  flinch: number;
  seed: number;
}

interface Enemy {
  on: boolean;
  kind: 'drone' | 'boomer';
  state: 'rise' | 'walk' | 'fire' | 'sawed' | 'dead';
  x: number;
  z: number;
  dx: number;
  dz: number;
  t: number;
  rise: number;
  hp: number;
  hit: number;
  roar: number;
  walkPh: number;
  fireT: number;
  burst: number;
  shotT: number;
  /** Boomer: how far the launcher is raised */
  raise: number;
  fall: number;
  fade: number;
  flash: number;
  mx: number;
  my: number;
  seed: number;
}

interface Tracer {
  on: number;
  max: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0 squad, 1 boosted, 2 locust */
  kind: number;
  /** Index of the gear that fired it, -1 for the Locust */
  who: number;
}

interface Grenade {
  on: boolean;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  t: number;
  T: number;
  x: number;
  y: number;
}

interface State {
  st: Stage;
  bg: HTMLCanvasElement;
  fg: HTMLCanvasElement;
  paint: Painter | null;
  sparks: Pool;
  brass: Pool;
  ash: Pool;
  tracers: Tracer[];
  grenades: Grenade[];
  gears: Gear[];
  marcus: Gear;
  enemies: Enemy[];
  // input
  pressing: boolean;
  keyDown: boolean;
  pressT: number;
  aimX: number;
  aimY: number;
  pointerAim: boolean;
  touched: boolean;
  demoT: number;
  demoStep: number;
  usedHold: boolean;
  // marcus
  mode: 'cover' | 'out' | 'saw' | 'back';
  modeT: number;
  runD: number;
  rx0: number;
  rz0: number;
  rx1: number;
  rz1: number;
  sawE: Enemy | null;
  rev: boolean;
  revK: number;
  chain: number;
  runPh: number;
  ammo: number;
  /** Seconds into the reload, or -1 */
  reload: number;
  reloadLen: number;
  /** 0 waiting, 1 good, 2 perfect, 3 jammed */
  arState: number;
  arMark: number;
  arFlash: number;
  boost: number;
  // world
  spawnT: number;
  boomerT: number;
  autoT: number;
  markOn: number;
  markX: number;
  markY: number;
  // feel
  shake: number;
  stop: number;
  glowK: number;
  boom: number;
  boomX: number;
  boomY: number;
  camZ: number;
  camX: number;
  camY: number;
  hum: Hum | null;
  hud: { x: number; y: number; w: number; h: number };
  time: number;
}

/* ---------- stage fit ---------- */

/** Frame a 1360 x 560 action area; portrait screens keep the squad and the nearest Locust */
function fit(st: Stage, w: number, h: number) {
  const portrait = w < h * 1.15;
  st.k = Math.max(0.05, portrait ? Math.min(h / 640, w / 1040) : Math.min(h / 560, w / 1360));
  st.ox = w / 2 + (portrait ? 90 * st.k : 0);
  st.oy = portrait ? h * 0.66 : h / 2 + 200 * st.k;
  st.left = -st.ox / st.k;
  st.right = (w - st.ox) / st.k;
  st.top = -st.oy / st.k;
  st.bottom = (h - st.oy) / st.k;
}

const toSX = (st: Stage, x: number) => (x - st.ox) / st.k;
const toSY = (st: Stage, y: number) => (y - st.oy) / st.k;

/* ---------- mount ---------- */

function makeGear(id: GearId, hx: number, hz: number, size: number, cover: CoverKind, seed: number): Gear {
  return {
    id,
    look: LOOKS[id],
    hx,
    hz,
    size,
    cover,
    x: hx,
    z: hz,
    lift: 0,
    face: 1,
    pop: 0,
    popTo: 0,
    hold: 0,
    aim: -0.1,
    recoil: 0,
    flash: 0,
    burst: 0,
    shotT: 0,
    wait: 0,
    target: null,
    tx: 300,
    ty: -200,
    mx: 0,
    my: 0,
    flinch: 0,
    seed,
  };
}

function makeEnemy(): Enemy {
  return {
    on: false,
    kind: 'drone',
    state: 'rise',
    x: 0,
    z: 0,
    dx: 0,
    dz: 0,
    t: 0,
    rise: 0,
    hp: 0,
    hit: 0,
    roar: 0,
    walkPh: 0,
    fireT: 0,
    burst: 0,
    shotT: 0,
    raise: 0,
    fall: 0,
    fade: 1,
    flash: 0,
    mx: 0,
    my: 0,
    seed: 0,
  };
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.9,
    init: (env) => {
      const gears = [
        makeGear('baird', -600, 0.72, 0.96, 'planter', 3),
        makeGear('cole', -440, 0.47, 1.1, 'column', 2),
        makeGear('dom', -268, 0.23, 0.99, 'sandbag', 1),
        makeGear('marcus', -90, 0, 1.02, 'barrier', 0),
      ];
      const s: State = {
        st: makeStage(),
        bg: makeLayer(),
        fg: makeLayer(),
        paint: new Painter(env.ctx),
        sparks: new Pool(420),
        brass: new Pool(50),
        ash: new Pool(ASH),
        tracers: Array.from({ length: MAX_TRACERS }, () => ({ on: 0, max: 1, x0: 0, y0: 0, x1: 0, y1: 0, kind: 0, who: -1 })),
        grenades: Array.from({ length: 3 }, () => ({ on: false, x0: 0, y0: 0, vx: 0, vy: 0, t: 0, T: 1, x: 0, y: 0 })),
        gears,
        marcus: gears[3],
        enemies: Array.from({ length: MAX_ENEMIES }, makeEnemy),
        pressing: false,
        keyDown: false,
        pressT: 0,
        aimX: 200,
        aimY: -200,
        pointerAim: false,
        touched: false,
        demoT: 0,
        demoStep: 0,
        usedHold: false,
        mode: 'cover',
        modeT: 0,
        runD: 1,
        rx0: 0,
        rz0: 0,
        rx1: 0,
        rz1: 0,
        sawE: null,
        rev: false,
        revK: 0,
        chain: 0,
        runPh: 0,
        ammo: MAG,
        reload: -1,
        reloadLen: RELOAD_T,
        arState: 0,
        arMark: 0,
        arFlash: 0,
        boost: 0,
        spawnT: 3,
        boomerT: 0,
        autoT: 2.5,
        markOn: 0,
        markX: 0,
        markY: 0,
        shake: 0,
        stop: 0,
        glowK: 0,
        boom: 0,
        boomX: 0,
        boomY: 0,
        camZ: 1,
        camX: 0,
        camY: -200,
        hum: null,
        hud: { x: 0, y: 0, w: 0, h: 0 },
        time: 0,
      };
      // the fight is already on: two Drones out in the open, a Boomer climbing up behind them
      spawn(s, 'drone', 300, 0.86, 'fire');
      spawn(s, 'drone', 425, 1.18, 'fire');
      const b = spawn(s, 'boomer', HOLE_X, HOLE_Z, 'rise');
      if (b) {
        b.dx = 575;
        b.dz = 1.95;
        b.rise = 0.4;
        b.t = 0.5;
      }
      s.enemies[0].fireT = 0.4;
      s.enemies[1].fireT = 1.6;
      return s;
    },
    resize: (s, env) => {
      fit(s.st, env.w, env.h);
      const c = prepLayer(s.bg, env.w, env.h, env.dpr, s.st);
      if (c) renderBackdrop(c, s.st);
      const f = prepLayer(s.fg, env.w, env.h, env.dpr, s.st);
      if (f) renderForeground(f, s.st);
      if (s.ash.items.every((p) => p.life <= 0)) for (let i = 0; i < ASH; i++) spawnAsh(s, true);
    },
    update: (s, env, dtRaw, t) => {
      const rm = env.reducedMotion;
      s.time = t;
      let dt = dtRaw;
      if (s.stop > 0) {
        s.stop -= dtRaw;
        dt = dtRaw * 0.1;
      }
      if (!s.touched && (!env.interactive || rm)) runDemo(s, env, dt);
      if (s.pressing || s.keyDown) {
        s.pressT += dt;
        if (s.pressT > TAP && !s.rev) startRev(s, env);
        if (s.rev && s.revK > 0.45 && !s.usedHold && s.mode === 'cover') {
          s.usedHold = true;
          startRun(s, env);
        }
      }
      if (rm && env.interactive && s.touched && (s.pressing || s.keyDown || s.mode !== 'cover' || s.reload >= 0)) env.wake(400);
      updateMarcus(s, env, dt, t);
      updateSquad(s, env, dt, t);
      updateEnemies(s, env, dt, t);
      updateGrenades(s, env, dt);
      for (const tr of s.tracers) if (tr.on > 0) tr.on -= dt;
      s.sparks.step(dt, () => 14);
      s.brass.step(dt, () => 8);
      for (const p of s.ash.items) {
        if (p.life <= 0 || p.y > 40 || p.y < s.st.top - 60) spawnAsh(s, false);
      }
      s.ash.step(dt);
      s.shake = Math.max(0, s.shake - dtRaw * 3);
      s.glowK = Math.max(0, s.glowK - dtRaw * 7);
      s.boom = Math.max(0, s.boom - dtRaw * 1.6);
      s.markOn = Math.max(0, s.markOn - dtRaw * 1.8);
      s.arFlash = Math.max(0, s.arFlash - dtRaw * 1.5);
      // cinematic push-in on the chainsaw kill
      const close = s.mode === 'saw' && !rm;
      s.camZ = damp(s.camZ, close ? 1.28 : 1, close ? 4 : 2.5, dtRaw);
      if (s.sawE) {
        s.camX = damp(s.camX, s.marcus.mx, 6, dtRaw);
        s.camY = damp(s.camY, s.marcus.my, 6, dtRaw);
      }
      if (s.hum) {
        const grind = s.mode === 'saw' ? 1 : 0;
        shapeHum(s.hum, 50 + s.revK * 72 + grind * 18 + Math.sin(t * 40) * 3, 700 + s.revK * 2200 + grind * 900, 0.04 + s.revK * 0.06 + grind * 0.03, 1.98);
      }
    },
    draw: (s, env, t) => drawScene(s, env, t),
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      const hd = s.hud;
      if (x >= hd.x && x <= hd.x + hd.w && y >= hd.y && y <= hd.y + hd.h) {
        reloadPress(s, env);
        return;
      }
      s.pressing = true;
      s.pressT = 0;
      s.usedHold = false;
      s.pointerAim = true;
      s.aimX = toSX(s.st, x);
      s.aimY = toSY(s.st, y);
      env.wake(2600);
    },
    onPointerMove: (s, _env, x, y) => {
      if (!s.pressing) return;
      s.aimX = toSX(s.st, x);
      s.aimY = toSY(s.st, y);
    },
    onPointerUp: (s, env) => {
      if (!s.pressing) return;
      s.pressing = false;
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key === 'r' || e.key === 'R') {
        s.touched = true;
        if (down && !e.repeat) reloadPress(s, env);
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      s.touched = true;
      if (down) {
        if (!e.repeat && !s.keyDown) {
          s.keyDown = true;
          s.pressT = 0;
          s.usedHold = false;
          s.pointerAim = false;
          env.wake(2600);
        }
      } else if (s.keyDown) {
        s.keyDown = false;
        release(s, env);
      }
      return true;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
      freeLayer(s.bg);
      freeLayer(s.fg);
      s.paint = null;
    },
  });

/* ---------- input and commands ---------- */

function release(s: State, env: SceneEnv) {
  if (s.pressing || s.keyDown) return;
  if (s.rev) {
    if (s.mode === 'cover') stopRev(s, env);
  } else if (s.pressT <= TAP + 0.001) {
    command(s, env);
  }
  s.pressT = 0;
}

/** Squad fire: everyone pops out of cover and puts rounds on the chosen Locust */
function command(s: State, env: SceneEnv) {
  const target = s.pointerAim ? nearestEnemy(s, s.aimX, s.aimY, 260) : nearestEnemy(s, -200, -100, 9999);
  let tx = s.aimX;
  let ty = s.aimY;
  if (target) [tx, ty] = bodyPoint(target);
  else if (!s.pointerAim) {
    tx = 300;
    ty = -220;
  }
  s.markOn = 1;
  s.markX = tx;
  s.markY = ty;
  const order = [0.24, 0.12, 0.06, 0];
  s.gears.forEach((g, i) => {
    if (g === s.marcus && (s.mode !== 'cover' || s.reload >= 0)) return;
    g.target = target;
    g.tx = tx;
    g.ty = ty;
    g.wait = order[i] + rand(0, 0.05);
    g.burst = g.look.gun === 'gnasher' ? 2 : 7 + Math.floor(rand(0, 3));
    g.shotT = 0;
  });
  const bus = env.audio();
  if (bus) tone(bus, 520, { type: 'square', attack: 0.004, decay: 0.05, gain: 0.02 });
}

function startRev(s: State, env: SceneEnv) {
  s.rev = true;
  const bus = env.audio();
  if (bus && !s.hum) {
    s.hum = startHum(bus, { type: 'sawtooth', freq: 48, ratio: 1.98, noise: 0.5, filter: 700, q: 2, gain: 0.05, attack: 0.05 });
    noise(bus, { duration: 0.25, gain: 0.08, freq: 300, q: 1, type: 'lowpass' });
  }
}

function stopRev(s: State, env: SceneEnv) {
  s.rev = false;
  if (s.hum) {
    shapeHum(s.hum, 40, 400, 0.03, 1.98);
    stopHum(s.hum, 0.18);
    s.hum = null;
  }
  const bus = env.audio();
  if (bus) tone(bus, 90, { type: 'sawtooth', attack: 0.01, decay: 0.4, gain: 0.03, glideTo: 40 });
}

/** Roadie run: vault the barrier and close on the nearest Drone with the saw running */
function startRun(s: State, env: SceneEnv) {
  const m = s.marcus;
  let best: Enemy | null = null;
  let bd = Infinity;
  const ax = s.pointerAim ? s.aimX : m.x;
  const ay = s.pointerAim ? s.aimY : -150;
  for (const e of s.enemies) {
    if (!e.on || e.kind !== 'drone' || (e.state !== 'walk' && e.state !== 'fire')) continue;
    const [bx, by] = bodyPoint(e);
    const d = Math.hypot(bx - ax, by - ay);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return;
  s.sawE = best;
  s.mode = 'out';
  s.modeT = 0;
  s.rx0 = m.x;
  s.rz0 = m.z;
  s.rz1 = best.z - 0.02;
  s.rx1 = best.x - 205 * zk(s.rz1) * m.size;
  s.runD = 0.55 + Math.hypot(s.rx1 - s.rx0, (s.rz1 - s.rz0) * ZY) / 620;
  m.burst = 0;
  m.popTo = 0;
  best.dx = best.x;
  best.dz = best.z;
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.3, gain: 0.08, freq: 500, q: 0.7, type: 'lowpass' });
}

function reloadPress(s: State, env: SceneEnv) {
  const bus = env.audio();
  if (s.reload < 0) {
    if (s.mode !== 'cover') return;
    beginReload(s, env);
    return;
  }
  if (s.arState !== 0) return;
  const f = s.reload / RELOAD_T;
  s.arMark = f;
  if (f >= AR_PERFECT[0] && f <= AR_PERFECT[1]) {
    s.arState = 2;
    s.arFlash = 1;
    s.boost = 7;
    s.reloadLen = s.reload + 0.25;
    if (bus) {
      tone(bus, 880, { type: 'triangle', attack: 0.004, decay: 0.18, gain: 0.06 });
      tone(bus, 1320, { type: 'triangle', attack: 0.004, decay: 0.3, gain: 0.05, delay: 0.07 });
      tone(bus, 1760, { type: 'sine', attack: 0.004, decay: 0.5, gain: 0.04, delay: 0.14 });
    }
  } else if (f >= AR_GOOD[0] && f <= AR_GOOD[1]) {
    s.arState = 1;
    s.reloadLen = s.reload + 0.25;
    if (bus) tone(bus, 1200, { type: 'triangle', attack: 0.004, decay: 0.12, gain: 0.05 });
  } else {
    s.arState = 3;
    s.reloadLen = RELOAD_T + 1;
    if (bus) {
      tone(bus, 110, { type: 'square', attack: 0.005, decay: 0.25, gain: 0.05, glideTo: 80 });
      noise(bus, { duration: 0.12, gain: 0.08, freq: 2400, q: 3 });
    }
  }
}

function beginReload(s: State, env: SceneEnv) {
  s.reload = 0;
  s.reloadLen = RELOAD_T;
  s.arState = 0;
  s.marcus.burst = 0;
  const bus = env.audio();
  if (bus) {
    tone(bus, 1900, { type: 'triangle', attack: 0.002, decay: 0.05, gain: 0.04 });
    noise(bus, { duration: 0.08, gain: 0.05, freq: 3000, q: 2 });
  }
}

function runDemo(s: State, env: SceneEnv, dt: number) {
  s.demoT += dt;
  const T = s.demoT % 12;
  if (T < 0.1 && s.demoStep > 4) s.demoStep = 0;
  s.pointerAim = false;
  const at = (step: number, time: number) => s.demoStep === step && T > time;
  if (at(0, 0.5)) {
    s.demoStep = 1;
    command(s, env);
  }
  if (at(1, 2.1)) {
    s.demoStep = 2;
    command(s, env);
  }
  if (at(2, 4.8)) {
    s.demoStep = 3;
    startRev(s, env);
    startRun(s, env);
  }
  if (at(3, 7.4)) {
    s.demoStep = 4;
    if (s.mode === 'cover') stopRev(s, env);
    if (s.reload < 0) beginReload(s, env);
  }
  if (s.demoStep === 4 && s.reload >= 0 && s.arState === 0 && s.reload / RELOAD_T > 0.48) reloadPress(s, env);
  if (at(4, 9.6)) {
    s.demoStep = 5;
    command(s, env);
  }
}

/* ---------- simulation ---------- */

function spawnAsh(s: State, anywhere: boolean) {
  const st = s.st;
  const ember = Math.random() < 0.14;
  const x = rand(st.left - 40, st.right + 40);
  const y = anywhere ? rand(st.top, 20) : ember ? rand(-60, 20) : st.top - rand(0, 40);
  const p = s.ash.spawn(x, y, rand(-16, 4), ember ? rand(-60, -25) : rand(18, 40), rand(8, 16), ember ? rand(1.2, 2.4) : rand(1.2, 3.2), ember ? 1 : 0);
  p.rot = rand(0, TAU);
  p.vr = rand(-2, 2);
}

function spawn(s: State, kind: Enemy['kind'], x: number, z: number, state: Enemy['state']) {
  const e = s.enemies.find((q) => !q.on);
  if (!e) return null;
  e.on = true;
  e.kind = kind;
  e.state = state;
  e.x = x;
  e.z = z;
  e.dx = x;
  e.dz = z;
  e.t = 0;
  e.rise = state === 'rise' ? 0 : 1;
  e.hp = kind === 'boomer' ? 46 : 14;
  e.hit = 0;
  e.roar = 0;
  e.walkPh = rand(0, TAU);
  e.fireT = rand(0.8, 2);
  e.burst = 0;
  e.shotT = 0;
  e.raise = 0;
  e.fall = 0;
  e.fade = 1;
  e.flash = 0;
  e.seed = Math.floor(rand(0, 1000));
  return e;
}

function alive(e: Enemy | null): e is Enemy {
  return !!e && e.on && e.state !== 'dead' && (e.state !== 'rise' || e.rise > 0.45);
}

function nearestEnemy(s: State, x: number, y: number, maxD: number) {
  let best: Enemy | null = null;
  let bd = maxD;
  for (const e of s.enemies) {
    if (!alive(e)) continue;
    const [bx, by] = bodyPoint(e);
    const d = Math.hypot(bx - x, by - y) * (e.kind === 'boomer' ? 0.8 : 1);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

const eScale = (e: Enemy) => zk(e.z) * (e.kind === 'boomer' ? 1.12 : 0.98);

/** Centre of mass in stage space, used for aiming and hits */
function bodyPoint(e: Enemy): [number, number] {
  const S = eScale(e);
  const sink = (1 - e.rise) * (e.kind === 'boomer' ? 380 : 330) * S;
  return [e.x - 6 * S, zy(e.z) + sink - (e.kind === 'boomer' ? 240 : 215) * S];
}

function hitEnemy(s: State, env: SceneEnv, e: Enemy, dmg: number, x: number, y: number) {
  e.hp -= dmg;
  e.hit = 1;
  for (let i = 0; i < 5; i++) s.sparks.spawn(x, y, rand(-80, 160), rand(-160, 20), rand(0.3, 0.7), rand(1.2, 2.6), 4, 900, 1);
  if (Math.random() < 0.5) s.sparks.spawn(x, y, rand(10, 50), rand(-30, 0), rand(0.4, 0.7), rand(6, 10), 6, 0, 2);
  if (e.hp <= 0 && e.state !== 'dead') kill(s, env, e, false);
}

function kill(s: State, env: SceneEnv, e: Enemy, sawn: boolean) {
  e.state = 'dead';
  e.t = 0;
  e.fall = 0;
  e.roar = 1;
  const [bx, by] = bodyPoint(e);
  const n = sawn ? 46 : 22;
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0);
    const v = rand(80, sawn ? 520 : 340);
    s.sparks.spawn(bx + rand(-20, 20), by + rand(-40, 30), Math.cos(a) * v + 60, Math.sin(a) * v, rand(0.4, 1), rand(1.6, 3.6), 4, 900, 0.8);
  }
  for (let i = 0; i < (sawn ? 10 : 5); i++) s.sparks.spawn(bx + rand(-30, 30), by + rand(-50, 30), rand(-30, 60), rand(-50, 0), rand(0.6, 1.2), rand(10, 22), 6, 0, 1.6);
  if (!env.reducedMotion) {
    s.stop = sawn ? 0.09 : 0.05;
    s.shake = Math.max(s.shake, sawn ? 0.7 : 0.35);
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, e.kind === 'boomer' ? 70 : 120, { type: 'sawtooth', attack: 0.02, decay: 0.5, gain: 0.05, glideTo: 50 });
    noise(bus, { duration: 0.35, gain: 0.1, freq: 420, q: 1.5 });
  }
}

/* ----- squad ----- */

const pose = { px: 0, py: 0, lean: 0, ga: 0, gx: 0, gy: 0, head: 0, f1x: 0, f1y: 0, f2x: 0, f2y: 0, reachK: 0 };

/** Body pose in the gear's local frame (scale 1, feet at 0, facing +x) */
function solvePose(g: Gear, s: State, t: number) {
  const br = Math.sin(t * 1.6 + g.seed * 2.1) * 1.6;
  const isM = g === s.marcus;
  const pop = smooth(clamp(g.pop, 0, 1));
  const baird = g.id === 'baird';
  // in cover: hunched forward behind the wall, gun held up at port arms (Baird leans back, bored)
  const idleLean = baird ? -0.08 : 0.2;
  const idleGa = baird ? 0.62 : -1.05;
  pose.px = lerp(baird ? -10 : -4, 0, pop);
  pose.py = lerp(-112, -150, pop) + br * 0.5;
  pose.lean = lerp(idleLean, 0.06, pop) + g.flinch * 0.3;
  pose.ga = lerp(idleGa, g.aim * g.face - pose.lean, pop);
  pose.gx = lerp(baird ? 22 : 30, 40, pop);
  pose.gy = lerp(baird ? -66 : -60, -88, pop);
  pose.head = lerp(baird ? -0.16 + Math.sin(t * 0.7) * 0.03 : 0.05, (g.aim * g.face - pose.lean) * 0.35, pop) - g.flinch * 0.2;
  pose.f1x = lerp(-64, -48, pop);
  pose.f1y = 0;
  pose.f2x = lerp(54, 46, pop);
  pose.f2y = 0;
  pose.reachK = 0;
  if (isM) {
    if (s.mode === 'out' || s.mode === 'back') {
      // roadie run: bent double, Lancer low across the body
      const ph = s.runPh;
      pose.px = 6;
      pose.py = -136 - Math.abs(Math.sin(ph)) * 10;
      pose.lean = 0.46;
      pose.ga = 0.42;
      pose.gx = 32;
      pose.gy = -66;
      pose.head = -0.32;
      pose.f1x = Math.cos(ph) * 62;
      pose.f1y = -Math.max(0, Math.sin(ph)) * 34;
      pose.f2x = Math.cos(ph + Math.PI) * 62;
      pose.f2y = -Math.max(0, Math.sin(ph + Math.PI)) * 34;
    } else if (s.mode === 'saw') {
      const buzz = Math.sin(t * 83) * 2.5;
      pose.px = 4;
      pose.py = -138;
      pose.lean = 0.26 + Math.sin(t * 31) * 0.02;
      pose.ga = 0.02 + buzz * 0.01;
      pose.gx = 40;
      pose.gy = -80 + buzz;
      pose.head = 0.05;
      pose.f1x = -70;
      pose.f2x = 66;
    } else if (s.rev) {
      pose.ga = lerp(pose.ga, -0.3, s.revK);
      pose.gy += Math.sin(t * 83) * 2 * s.revK;
    }
    if (s.reload >= 0 && s.mode === 'cover') {
      // swap the magazine: off hand drops to the belt and slaps a fresh one in
      const k = clamp(s.reload / Math.min(s.reloadLen, RELOAD_T), 0, 1);
      pose.reachK = Math.sin(k * Math.PI);
      pose.ga = lerp(pose.ga, -0.5, Math.min(1, s.reload * 6));
    }
  }
  pose.gx -= Math.cos(pose.ga) * g.recoil * 9;
  pose.gy -= Math.sin(pose.ga) * g.recoil * 9;
  pose.ga -= g.recoil * 0.06;
}

/** Torso frame point to stage space */
function torsoToStage(g: Gear, x: number, y: number): [number, number] {
  const c = Math.cos(pose.lean);
  const sn = Math.sin(pose.lean);
  const lx = pose.px + x * c - y * sn;
  const ly = pose.py + x * sn + y * c;
  const S = zk(g.z) * g.size;
  return [g.x + lx * S * g.face, zy(g.z) - g.lift + ly * S];
}

function updateSquad(s: State, env: SceneEnv, dt: number, t: number) {
  // squadmates put out suppressing fire on their own now and then
  s.autoT -= dt;
  if (s.autoT <= 0) {
    s.autoT = rand(3, 5.5);
    const g = s.gears[Math.floor(rand(0, 3))];
    const e = s.enemies.filter(alive)[Math.floor(rand(0, 3))] ?? null;
    if (e && g.burst === 0 && g.wait <= 0) {
      g.target = e;
      g.burst = g.look.gun === 'gnasher' ? 1 : 4 + Math.floor(rand(0, 3));
      g.wait = rand(0, 0.3);
    }
  }
  for (const g of s.gears) {
    g.flinch = Math.max(0, g.flinch - dt * 1.4);
    g.recoil = damp(g.recoil, 0, 16, dt);
    g.flash = Math.max(0, g.flash - dt * 12);
    const isM = g === s.marcus;
    if (g.target && !alive(g.target)) {
      g.target = nearestEnemy(s, g.tx, g.ty, 400);
      if (!g.target) g.burst = 0;
    }
    if (g.target) [g.tx, g.ty] = bodyPoint(g.target);
    if (isM && s.mode !== 'cover') {
      g.pop = 0;
    } else {
      if (g.wait > 0) g.wait -= dt;
      else if (g.burst > 0) {
        g.popTo = 1;
        g.hold = 0.45;
        if (g.pop > 0.72 && g.flinch < 0.3) {
          g.shotT -= dt;
          if (g.shotT <= 0) {
            g.burst--;
            g.shotT = g.look.gun === 'gnasher' ? 0.62 : 0.085;
            gearShoot(s, env, g);
          }
        }
      } else if (g.hold > 0) {
        g.hold -= dt;
        if (g.hold <= 0) g.popTo = isM && s.rev ? 0.4 : 0;
      } else if (isM) g.popTo = s.rev ? 0.4 : 0;
      g.pop = damp(g.pop, g.flinch > 0.35 ? 0 : g.popTo, 9, dt);
    }
    // aim from the shoulder toward the target
    const S = zk(g.z) * g.size;
    const sx = g.x + 30 * S * g.face;
    const sy = zy(g.z) - 240 * S;
    const want = clamp(Math.atan2(g.ty - sy, Math.max(80, Math.abs(g.tx - sx))), -0.6, 0.45);
    g.aim = damp(g.aim, want, 9, dt);
    solvePose(g, s, t);
    const L = g.look.gun === 'gnasher' ? 152 : 160;
    const mx = pose.gx + Math.cos(pose.ga) * L + Math.sin(pose.ga) * 5;
    const my = pose.gy + Math.sin(pose.ga) * L - Math.cos(pose.ga) * 5;
    [g.mx, g.my] = torsoToStage(g, mx, my);
    if (isM) {
      const sl = 178;
      const sx2 = pose.gx + Math.cos(pose.ga) * sl - Math.sin(pose.ga) * 19;
      const sy2 = pose.gy + Math.sin(pose.ga) * sl + Math.cos(pose.ga) * 19;
      [sawX, sawY] = torsoToStage(g, sx2, sy2);
    }
  }
}

let sawX = 0;
let sawY = 0;

function gearShoot(s: State, env: SceneEnv, g: Gear) {
  const rm = env.reducedMotion;
  const isM = g === s.marcus;
  if (isM) {
    s.ammo--;
    if (s.ammo <= 0) {
      s.ammo = 0;
      g.burst = 0;
      beginReload(s, env);
    }
  }
  g.recoil = 1;
  g.flash = 1;
  s.glowK = Math.max(s.glowK, isM ? 1 : 0.6);
  if (!rm) s.shake = Math.max(s.shake, isM ? 0.26 : g.look.gun === 'gnasher' ? 0.3 : 0.12);
  const boosted = isM && s.boost > 0;
  const e = alive(g.target) ? g.target : null;
  const pellets = g.look.gun === 'gnasher' ? 7 : 1;
  for (let i = 0; i < pellets; i++) {
    let x1 = g.tx + rand(-30, 30);
    let y1 = g.ty + rand(-40, 40);
    let struck = false;
    if (e) {
      const S = eScale(e);
      const hitP = pellets > 1 ? 0.55 : 0.8;
      if (Math.random() < hitP) {
        x1 = g.tx + rand(-26, 26) * S;
        y1 = g.ty + rand(-60, 70) * S;
        struck = true;
      } else {
        x1 = g.tx + rand(40, 160);
        y1 = g.ty + rand(-120, 60);
      }
    }
    if (pellets > 1 && !struck) {
      x1 += rand(-40, 40);
      y1 += rand(-50, 50);
    }
    const tr = s.tracers.find((q) => q.on <= 0) ?? s.tracers[0];
    tr.on = tr.max = pellets > 1 ? 0.05 : 0.06;
    tr.x0 = g.mx;
    tr.y0 = g.my;
    tr.x1 = x1;
    tr.y1 = y1;
    tr.kind = boosted ? 1 : 0;
    tr.who = s.gears.indexOf(g);
    if (struck && e) hitEnemy(s, env, e, (pellets > 1 ? 1.1 : 1) * (boosted ? 2 : 1), x1, y1);
    else for (let k = 0; k < 3; k++) s.sparks.spawn(x1, y1, rand(-200, 200), rand(-260, -40), rand(0.15, 0.35), rand(1, 1.8), 1, 800, 1.5);
  }
  // brass out of the ejection port
  const S = zk(g.z) * g.size;
  if (pellets === 1 || Math.random() < 0.8) {
    const b = s.brass.spawn(g.mx - Math.cos(g.aim) * 120 * S, g.my + 6 * S, rand(-160, -60), rand(-320, -200), 1.4, S, pellets > 1 ? 1 : 0, 1400, 0.2);
    b.rot = rand(0, TAU);
    b.vr = rand(-20, 20);
    b.bounce = 0.4;
  }
  const bus = env.audio();
  if (bus) {
    const v = isM ? 1 : 0.55;
    if (pellets > 1) {
      noise(bus, { duration: 0.32, gain: 0.26 * v, freq: 700, q: 0.4, type: 'lowpass' });
      tone(bus, 80, { type: 'sine', attack: 0.003, decay: 0.3, gain: 0.16 * v, glideTo: 38 });
      tone(bus, 1400, { type: 'square', attack: 0.002, decay: 0.03, gain: 0.02, delay: 0.32 });
    } else {
      noise(bus, { duration: 0.08, gain: 0.18 * v, freq: boosted ? 1100 : 1500, q: 0.5 });
      tone(bus, boosted ? 120 : 150, { type: 'square', attack: 0.002, decay: 0.07, gain: 0.06 * v, glideTo: 55 });
    }
  }
}

function updateMarcus(s: State, env: SceneEnv, dt: number, t: number) {
  const m = s.marcus;
  const rm = env.reducedMotion;
  s.boost = Math.max(0, s.boost - dt);
  // active reload
  if (s.reload >= 0) {
    s.reload += dt;
    if (s.reload >= s.reloadLen) {
      s.reload = -1;
      s.ammo = MAG;
      const bus = env.audio();
      if (bus && s.arState !== 2) tone(bus, 1500, { type: 'triangle', attack: 0.002, decay: 0.06, gain: 0.04 });
    }
  }
  if (s.ammo <= 0 && s.reload < 0 && s.mode === 'cover') beginReload(s, env);

  const holding = s.pressing || s.keyDown;
  s.revK = damp(s.revK, s.rev ? 1 : 0, s.rev ? 3.2 : 8, dt);
  s.chain += dt * (6 + s.revK * 60);

  if (s.mode === 'out' || s.mode === 'back') {
    s.modeT += dt;
    const k = clamp(s.modeT / s.runD, 0, 1);
    const out = s.mode === 'out';
    const kx = smooth(k);
    m.x = out ? lerp(s.rx0, s.rx1, kx) : lerp(s.rx1, s.rx0, kx);
    m.z = out ? lerp(s.rz0, s.rz1, k) : lerp(s.rz1, s.rz0, k);
    m.face = out ? 1 : -1;
    // vault over the barrier on the near end of the run
    const vk = out ? clamp((k - 0.04) / 0.36, 0, 1) : clamp((k - 0.62) / 0.36, 0, 1);
    m.lift = Math.sin(vk * Math.PI) * 120 * zk(m.z);
    const prev = s.runPh;
    s.runPh += dt * 15;
    if (Math.floor(prev / Math.PI) !== Math.floor(s.runPh / Math.PI) && !rm) {
      s.shake = Math.max(s.shake, 0.32);
      for (let i = 0; i < 3; i++) s.sparks.spawn(m.x + rand(-20, 20), zy(m.z), rand(-60, 60), rand(-60, -20), rand(0.5, 0.9), rand(8, 14), 3, 20, 2);
      const bus = env.audio();
      if (bus) noise(bus, { duration: 0.06, gain: 0.05, freq: 220, q: 1, type: 'lowpass' });
    }
    if (k >= 1) {
      if (out) {
        if (alive(s.sawE)) {
          s.mode = 'saw';
          s.modeT = 0;
          s.sawE.state = 'sawed';
          s.sawE.t = 0;
          const bus = env.audio();
          if (bus) noise(bus, { duration: 0.4, gain: 0.12, freq: 900, q: 1 });
        } else {
          s.mode = 'back';
          s.modeT = 0;
        }
      } else {
        s.mode = 'cover';
        m.x = m.hx;
        m.z = m.hz;
        m.lift = 0;
        m.face = 1;
        s.sawE = null;
        if (!holding) stopRev(s, env);
      }
    }
  } else if (s.mode === 'saw') {
    s.modeT += dt;
    if (!rm) s.shake = Math.max(s.shake, 0.45);
    const e = s.sawE;
    // grinding: sparks off the bar and a spray of Locust blood
    const n = 160 * dt;
    for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
      const a = rand(-2.6, -0.6);
      const v = rand(150, 560);
      s.sparks.spawn(sawX, sawY, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.5), rand(1, 2.2), 0, 900, 1.2).bounce = 0.35;
      if (Math.random() < 0.6) s.sparks.spawn(sawX, sawY, rand(-260, 220), rand(-380, -60), rand(0.4, 0.9), rand(1.6, 3.4), 4, 900, 0.6);
    }
    if (Math.random() < dt * 14) s.sparks.spawn(sawX, sawY, rand(-30, 60), rand(-60, -10), rand(0.5, 0.9), rand(10, 18), 6, 0, 1.5);
    s.glowK = Math.max(s.glowK, 0.6);
    if (s.modeT > 1.05) {
      if (e && e.on) kill(s, env, e, true);
      s.mode = 'back';
      s.modeT = 0;
    }
  }
  // blade sparks while revving in cover
  if (s.mode === 'cover' && s.revK > 0.25) {
    const n = s.revK * 90 * dt;
    for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
      const a = m.aim - 1.6 + rand(-0.5, 0.5);
      const v = rand(200, 600) * s.revK;
      s.sparks.spawn(sawX, sawY, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.5), rand(1, 2), 0, 900, 1.2).bounce = 0.35;
    }
    s.glowK = Math.max(s.glowK, 0.4 * s.revK);
    if (!rm) s.shake = Math.max(s.shake, 0.12 + s.revK * 0.12);
  }
  void t;
}

/* ----- locust ----- */

function updateEnemies(s: State, env: SceneEnv, dt: number, t: number) {
  const rm = env.reducedMotion;
  // keep the hole busy
  s.spawnT -= dt;
  s.boomerT += dt;
  if (s.spawnT <= 0) {
    s.spawnT = rand(2.6, 4);
    const busy = s.enemies.some((e) => e.on && e.state === 'rise');
    const drones = s.enemies.filter((e) => e.on && e.kind === 'drone' && e.state !== 'dead').length;
    const boomer = s.enemies.some((e) => e.on && e.kind === 'boomer' && e.state !== 'dead');
    if (!busy) {
      if (!boomer && s.boomerT > 14) {
        const e = spawn(s, 'boomer', HOLE_X, HOLE_Z, 'rise');
        if (e) {
          e.dx = rand(560, 595);
          e.dz = rand(1.85, 2.05);
          s.boomerT = 0;
          emerge(s, env);
        }
      } else if (drones < 3) {
        const e = spawn(s, 'drone', HOLE_X, HOLE_Z, 'rise');
        if (e) {
          // pick a spot nobody else is standing on
          let best = 0;
          let bx = 200;
          let bz = 0.8;
          for (let k = 0; k < 6; k++) {
            const x = rand(270, 450);
            const z = rand(0.8, 1.35);
            let d = 9999;
            for (const o of s.enemies) if (o.on && o !== e && o.state !== 'dead') d = Math.min(d, Math.hypot(o.dx - x, (o.dz - z) * 300));
            if (d > best) {
              best = d;
              bx = x;
              bz = z;
            }
          }
          e.dx = bx;
          e.dz = bz;
          emerge(s, env);
        }
      }
    }
  }

  for (const e of s.enemies) {
    if (!e.on) continue;
    e.t += dt;
    e.hit = Math.max(0, e.hit - dt * 6);
    e.roar = Math.max(0, e.roar - dt * 0.8);
    e.flash = Math.max(0, e.flash - dt * 12);
    const boomer = e.kind === 'boomer';
    if (e.state === 'rise') {
      e.rise = Math.min(1, e.rise + dt / (boomer ? 1.6 : 1.2));
      if (Math.random() < dt * 24) burstDust(s, 1);
      if (e.rise >= 1) {
        e.state = 'walk';
        e.t = 0;
        e.roar = 1;
        const bus = env.audio();
        if (bus) {
          noise(bus, { duration: 0.7, gain: boomer ? 0.16 : 0.1, freq: boomer ? 260 : 380, q: 2 });
          tone(bus, boomer ? 70 : 110, { type: 'sawtooth', attack: 0.05, decay: 0.6, gain: 0.05, glideTo: boomer ? 45 : 70 });
        }
      }
    } else if (e.state === 'walk') {
      const dx = e.dx - e.x;
      const dz = e.dz - e.z;
      const d = Math.hypot(dx, dz * ZY);
      const sp = (boomer ? 55 : 80) * dt;
      if (d <= sp) {
        e.x = e.dx;
        e.z = e.dz;
        e.state = 'fire';
        e.fireT = rand(0.5, 1.2);
      } else {
        e.x += (dx / d) * sp;
        e.z += ((dz * ZY) / d) * (sp / ZY);
        e.walkPh += dt * (boomer ? 4.2 : 6);
      }
    } else if (e.state === 'fire') {
      e.walkPh = damp(e.walkPh, Math.round(e.walkPh / Math.PI) * Math.PI, 6, dt);
      if (boomer) {
        e.fireT -= dt;
        e.raise = damp(e.raise, e.fireT < 0.9 ? 1 : 0, 5, dt);
        if (e.fireT <= 0) {
          e.fireT = rand(4.2, 6);
          launch(s, env, e);
        }
      } else {
        if (e.burst > 0) {
          e.shotT -= dt;
          if (e.shotT <= 0) {
            e.burst--;
            e.shotT = 0.13;
            locustShoot(s, env, e);
          }
        } else {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.fireT = rand(1.4, 3);
            e.burst = 3 + Math.floor(rand(0, 3));
          }
        }
      }
    } else if (e.state === 'sawed') {
      e.hit = 1;
      e.roar = 1;
    } else if (e.state === 'dead') {
      e.fall = Math.min(1, e.fall + dt * 2.4);
      if (e.t > 1.8) e.fade = Math.max(0, e.fade - dt * 1.4);
      if (e.fade <= 0) e.on = false;
    }
    // where the muzzle is, for flashes and tracers
    const S = eScale(e);
    if (boomer) {
      const a = -0.08 - e.raise * 0.42;
      const gx = 40;
      const gy = -232;
      e.mx = e.x - (gx + Math.cos(a) * 205) * S;
      e.my = zy(e.z) + (gy + Math.sin(a) * 205) * S;
    } else {
      e.mx = e.x - 186 * S;
      e.my = zy(e.z) - 226 * S;
    }
  }
  void rm;
  void t;
}

function emerge(s: State, env: SceneEnv) {
  burstDust(s, 26);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.8, gain: 0.2, freq: 220, q: 0.8, type: 'lowpass' });
    tone(bus, 60, { type: 'sine', attack: 0.02, decay: 0.6, gain: 0.16, glideTo: 36 });
  }
  if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.5);
}

function burstDust(s: State, n: number) {
  const k = zk(HOLE_Z);
  for (let i = 0; i < n; i++) {
    const x = HOLE_X + rand(-HOLE_RX, HOLE_RX) * 0.9 * k;
    s.sparks.spawn(x, zy(HOLE_Z) + rand(-6, 8), rand(-60, 60), rand(-150, -40), rand(0.8, 1.6), rand(10, 24) * k, 3, 30, 1.6);
  }
}

/** A Hammerburst burst into the squad's cover */
function locustShoot(s: State, env: SceneEnv, e: Enemy) {
  e.flash = 1;
  const g = s.gears[Math.floor(rand(0, 4))];
  const S = zk(g.hz) * g.size;
  const [cx0, cx1, ctop] = coverSpan(g);
  const x1 = g.hx + rand(cx0 + 10, cx1 - 10) * S;
  const y1 = zy(g.hz) + (ctop + rand(-4, 26)) * S;
  const tr = s.tracers.find((q) => q.on <= 0) ?? s.tracers[0];
  tr.on = tr.max = 0.07;
  tr.x0 = e.mx;
  tr.y0 = e.my;
  tr.x1 = x1;
  tr.y1 = y1;
  tr.kind = 2;
  tr.who = -1;
  for (let i = 0; i < 5; i++) s.sparks.spawn(x1, y1, rand(-120, 200), rand(-280, -60), rand(0.15, 0.4), rand(1, 1.8), 1, 900, 1.5);
  s.sparks.spawn(x1, y1, rand(-20, 40), rand(-50, -20), rand(0.6, 1), rand(8, 14) * S, 3, 20, 2);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.07, gain: 0.07, freq: 900, q: 0.7 });
    if (Math.random() < 0.4) tone(bus, 2400 + rand(0, 900), { type: 'triangle', attack: 0.002, decay: 0.06, gain: 0.015, delay: 0.12 });
  }
}

/** Boomshot: a lobbed grenade at one of the squad's walls */
function launch(s: State, env: SceneEnv, e: Enemy) {
  const gr = s.grenades.find((q) => !q.on);
  e.roar = 1;
  e.flash = 1;
  if (!gr) return;
  const g = s.gears[1 + Math.floor(rand(0, 3))];
  const S = zk(g.hz) * g.size;
  const [cx0, cx1, ctop] = coverSpan(g);
  const tx = g.hx + rand(cx0 + 20, cx1) * S;
  const ty = zy(g.hz) + ctop * S;
  const T = 1.15;
  gr.on = true;
  gr.x0 = e.mx;
  gr.y0 = e.my;
  gr.t = 0;
  gr.T = T;
  gr.vx = (tx - gr.x0) / T;
  gr.vy = (ty - gr.y0 - 0.5 * GRAV * T * T) / T;
  gr.x = gr.x0;
  gr.y = gr.y0;
  for (let i = 0; i < 8; i++) s.sparks.spawn(e.mx, e.my, rand(-60, 20), rand(-80, 0), rand(0.6, 1.2), rand(10, 20), 8, -20, 1.5);
  const bus = env.audio();
  if (bus) {
    tone(bus, 95, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.2, glideTo: 50 });
    noise(bus, { duration: 0.25, gain: 0.12, freq: 400, q: 0.6, type: 'lowpass' });
    noise(bus, { duration: 0.6, gain: 0.07, freq: 300, q: 2 });
  }
}

function updateGrenades(s: State, env: SceneEnv, dt: number) {
  for (const gr of s.grenades) {
    if (!gr.on) continue;
    gr.t += dt;
    gr.x = gr.x0 + gr.vx * gr.t;
    gr.y = gr.y0 + gr.vy * gr.t + 0.5 * GRAV * gr.t * gr.t;
    if (Math.random() < dt * 40) s.sparks.spawn(gr.x, gr.y, rand(-10, 10), rand(-20, 0), rand(0.4, 0.8), rand(4, 8), 8, -10, 1);
    if (gr.t >= gr.T) {
      gr.on = false;
      explode(s, env, gr.x, gr.y);
    }
  }
}

function explode(s: State, env: SceneEnv, x: number, y: number) {
  s.boom = 1;
  s.boomX = x;
  s.boomY = y;
  for (let i = 0; i < 10; i++) s.sparks.spawn(x + rand(-30, 30), y + rand(-30, 10), rand(-120, 120), rand(-200, -40), rand(0.3, 0.6), rand(26, 50), 7, -60, 3);
  for (let i = 0; i < 16; i++) s.sparks.spawn(x + rand(-40, 40), y + rand(-30, 10), rand(-140, 140), rand(-160, -30), rand(1.4, 2.6), rand(24, 50), 8, -14, 1.6);
  for (let i = 0; i < 26; i++) {
    const p = s.sparks.spawn(x, y, rand(-420, 420), rand(-620, -120), rand(0.8, 1.6), rand(3, 8), 5, 1300, 0.6);
    p.rot = rand(0, TAU);
    p.vr = rand(-14, 14);
    p.bounce = 0.3;
  }
  for (let i = 0; i < 30; i++) {
    const a = rand(0, TAU);
    const v = rand(200, 700);
    s.sparks.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - 150, rand(0.2, 0.6), rand(1.2, 2.4), 0, 900, 1.2);
  }
  for (const g of s.gears) {
    if (g === s.marcus && s.mode !== 'cover') continue;
    const d = Math.abs(g.hx - x);
    if (d < 320) g.flinch = Math.max(g.flinch, 1 - d / 400);
  }
  if (!env.reducedMotion) {
    s.shake = Math.max(s.shake, 1);
    s.stop = 0.05;
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 1.1, gain: 0.34, freq: 500, q: 0.5, type: 'lowpass' });
    tone(bus, 58, { type: 'sine', attack: 0.004, decay: 0.9, gain: 0.3, glideTo: 26 });
    noise(bus, { duration: 0.3, gain: 0.1, freq: 2600, q: 0.6 });
  }
}

/* ---------- cover ---------- */

/** Local span of a gear's cover: [x0, x1, top], in the gear's own scaled units */
function coverSpan(g: Gear): [number, number, number] {
  switch (g.cover) {
    case 'barrier':
      return [-78, 196, -172];
    case 'sandbag':
      return [-80, 170, -166];
    case 'column':
      return [-60, 168, -170];
    default:
      return [-84, 150, -168];
  }
}

function drawCover(ctx: CanvasRenderingContext2D, g: Gear, t: number) {
  const S = zk(g.hz) * g.size;
  const [x0, x1, top] = coverSpan(g);
  ctx.save();
  ctx.translate(g.hx, zy(g.hz));
  ctx.scale(S, S);
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse((x0 + x1) / 2, 4, (x1 - x0) * 0.62, 14, 0, 0, TAU);
  ctx.fill();
  if (g.cover === 'barrier') {
    // a slab of broken concrete wall, chewed top edge and rebar sticking out
    const pts = [x0, 8, x0 - 6, top + 26, x0 + 14, top + 4, x0 + 50, top + 12, x0 + 74, top, x0 + 118, top + 6, x0 + 140, top - 4, x1 - 22, top + 18, x1, top + 40, x1 + 8, 8];
    slab(ctx, pts, '#5e5650', '#3a3430', '#1e1a18');
    ctx.strokeStyle = '#4a2a1c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - 92, top + 10);
    ctx.lineTo(x1 - 100, top - 30);
    ctx.lineTo(x1 - 112, top - 36);
    ctx.moveTo(x1 - 62, top + 6);
    ctx.lineTo(x1 - 54, top - 22);
    ctx.moveTo(x1 - 26, top + 20);
    ctx.lineTo(x1 - 8, top - 6);
    ctx.stroke();
    // a stencilled hazard stripe, mostly chipped away
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 10, top + 70, x1 - x0 - 10, 22);
    ctx.clip();
    ctx.fillStyle = 'rgba(170,130,50,0.35)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * 30, top + 92);
      ctx.lineTo(x0 + i * 30 + 14, top + 70);
      ctx.lineTo(x0 + i * 30 + 28, top + 70);
      ctx.lineTo(x0 + i * 30 + 14, top + 92);
      ctx.fill();
    }
    ctx.restore();
  } else if (g.cover === 'sandbag') {
    // sandbags stacked on a concrete kerb
    slab(ctx, [x0 - 4, 8, x0 - 4, top + 96, x1 + 6, top + 92, x1 + 6, 8], '#4e4842', '#34302c', '#1a1816');
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const n = 4 - (r === rows - 1 ? 1 : 0);
      const bw = (x1 - x0) / 3.6;
      for (let i = 0; i < n; i++) {
        const bx = x0 + 6 + i * bw * 1.02 + (r % 2) * bw * 0.5 + hash(i + r * 7) * 6;
        const by = top + 96 - r * 30 - 18;
        if (bx + bw > x1 + 14) continue;
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by, bw / 2 + 2, 17, (hash(i * 3 + r) - 0.5) * 0.12, 0, TAU);
        const gr = ctx.createLinearGradient(0, by - 17, 0, by + 17);
        gr.addColorStop(0, '#9c8a68');
        gr.addColorStop(0.45, '#6a5a42');
        gr.addColorStop(1, '#2c241a');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,14,8,0.8)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.25, by - 12);
        ctx.lineTo(bx + bw * 0.28, by + 12);
        ctx.strokeStyle = 'rgba(30,22,14,0.5)';
        ctx.stroke();
      }
    }
  } else if (g.cover === 'column') {
    // a fallen fluted column drum, end on
    const cx = (x0 + x1) / 2;
    const r = (x1 - x0) / 2;
    const cy = top + r * 0.62;
    ctx.beginPath();
    ctx.moveTo(x0, 8);
    ctx.lineTo(x0, cy);
    ctx.ellipse(cx, cy, r, r * 0.62, 0, Math.PI, TAU);
    ctx.lineTo(x1, 8);
    ctx.closePath();
    const gr = ctx.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, '#2a2522');
    gr.addColorStop(0.55, '#6c625a');
    gr.addColorStop(0.8, '#8a7e72');
    gr.addColorStop(1, '#3e3732');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,9,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // the flutes of the broken end
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(20,16,14,0.45)';
    ctx.lineWidth = 3;
    for (let i = 1; i < 9; i++) {
      const x = x0 + (i / 9) * (x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x, cy - Math.sqrt(Math.max(0, 1 - ((x - cx) / r) ** 2)) * r * 0.62);
      ctx.lineTo(x, 8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10,8,7,0.4)';
    ctx.fillRect(x0, cy + 34, x1 - x0, 6);
    ctx.restore();
  } else {
    // a burst concrete planter with a dead stump
    slab(ctx, [x0, 8, x0 + 4, top + 10, x1 - 6, top + 4, x1, 8], '#665c54', '#423a34', '#201c19');
    ctx.fillStyle = '#251c16';
    ctx.fillRect(x0 + 10, top - 2, x1 - x0 - 24, 12);
    ctx.strokeStyle = '#2a1e16';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x1 - 40, top + 2);
    ctx.lineTo(x1 - 34, top - 60);
    ctx.lineTo(x1 - 52, top - 96);
    ctx.moveTo(x1 - 35, top - 52);
    ctx.lineTo(x1 - 12, top - 78);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1 - 46, top - 84);
    ctx.lineTo(x1 - 64, top - 96);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  ctx.restore();
  void t;
}

/** A chunk of concrete: dark body, lit top face and a chipped, sooty base */
function slab(ctx: CanvasRenderingContext2D, pts: number[], lit: string, base: string, dark: string) {
  const top = Math.min(...pts.filter((_, i) => i % 2 === 1));
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, top, 0, 8);
  gr.addColorStop(0, lit);
  gr.addColorStop(0.18, base);
  gr.addColorStop(1, dark);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.strokeStyle = 'rgba(12,10,9,0.9)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  // pits, cracks and soot
  for (let i = 0; i < 14; i++) {
    const x = pts[0] + hash(i * 3.1 + pts[2]) * (pts[pts.length - 2] - pts[0]);
    const y = top + 14 + hash(i * 7.7) * (8 - top - 20);
    ctx.fillStyle = `rgba(14,12,10,${0.2 + hash(i) * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + hash(i + 4) * 6, 2 + hash(i + 9) * 3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(10,8,7,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pts[0] + 30, top + 10);
  ctx.lineTo(pts[0] + 42, top + 50);
  ctx.lineTo(pts[0] + 36, top + 80);
  ctx.moveTo(pts[0] + 120, top + 20);
  ctx.lineTo(pts[0] + 110, top + 60);
  ctx.stroke();
  const soot = ctx.createLinearGradient(0, -40, 0, 8);
  soot.addColorStop(0, 'rgba(0,0,0,0)');
  soot.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = soot;
  ctx.fillRect(pts[0] - 20, -40, 400, 50);
  ctx.restore();
}

/* ---------- backdrop (cached) ---------- */

function renderBackdrop(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  c.translate(st.ox, st.oy);
  c.scale(st.k, st.k);
  const L = st.left - 40;
  const R = st.right + 40;
  const T = st.top - 40;
  const B = st.bottom + 40;
  const HZ = zy(3.3);

  // ash-choked sky: cold slate overhead, dirty amber where the city burns
  const sky = c.createLinearGradient(0, Math.min(T, -900), 0, HZ);
  sky.addColorStop(0, '#121417');
  sky.addColorStop(0.45, '#2b2b2c');
  sky.addColorStop(0.8, '#574a3f');
  sky.addColorStop(1, '#8a6a4c');
  c.fillStyle = sky;
  c.fillRect(L, T, R - L, B - T);
  c.globalCompositeOperation = 'lighter';
  glow(c, 360, HZ - 60, 520, '255,130,60', 0.2);
  glow(c, -420, HZ - 300, 360, '170,190,220', 0.08);
  c.globalCompositeOperation = 'source-over';
  // smoke columns leaning in the wind
  for (let i = 0; i < 5; i++) {
    const x = -640 + i * 330 + hash(i + 3) * 120;
    for (let j = 0; j < 16; j++) {
      const y = HZ - 40 - j * 46;
      const r = 40 + j * 13;
      const ox = j * j * 1.6;
      const g = c.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      g.addColorStop(0, `rgba(22,20,20,${0.34 - j * 0.017})`);
      g.addColorStop(1, 'rgba(22,20,20,0)');
      c.fillStyle = g;
      c.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  // a distant searchlight from a COG outpost
  c.globalCompositeOperation = 'lighter';
  const beam = c.createLinearGradient(-300, HZ, -120, T);
  beam.addColorStop(0, 'rgba(200,220,255,0.10)');
  beam.addColorStop(1, 'rgba(200,220,255,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(-310, HZ - 120);
  c.lineTo(-40, T);
  c.lineTo(80, T);
  c.lineTo(-300, HZ - 120);
  c.fill();
  c.globalCompositeOperation = 'source-over';

  // the ruined neoclassical skyline of Sera, three hazy layers deep
  ruins(c, L, R, HZ - 40, 70, 180, '#4a4643', '#8e765c', 1, 0.7, false);
  dome(c, -60, HZ - 120, 150);
  haze(c, L, R, HZ - 260, HZ - 40, 'rgba(120,98,80,0.4)');
  ruins(c, L, R, HZ, 60, 160, '#2d2b2a', '#74604a', 7, 0.9, true);
  haze(c, L, R, HZ - 150, HZ + 10, 'rgba(96,78,64,0.35)');

  // the street running away from us
  const road = c.createLinearGradient(0, HZ, 0, B);
  road.addColorStop(0, '#4a3e35');
  road.addColorStop(0.25, '#2e2621');
  road.addColorStop(1, '#100d0b');
  c.fillStyle = road;
  c.fillRect(L, HZ - 4, R - L, B - HZ + 4);
  // slabs in perspective toward a vanishing point
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1.5;
  const vx = 120;
  const vy = HZ - 220;
  for (let i = -16; i <= 16; i++) {
    const bx = i * 150;
    const k = (HZ - vy) / (B - vy);
    c.beginPath();
    c.moveTo(lerp(vx, bx, k), HZ);
    c.lineTo(bx, B);
    c.stroke();
  }
  for (let j = 0; j < 7; j++) {
    const z = 3.3 - j * j * 0.09;
    const y = zy(z);
    c.beginPath();
    c.moveTo(L, y);
    c.lineTo(R, y);
    c.stroke();
  }
  // a mid-ground wall slab with the Crimson Omen sprayed on it
  midWall(c, 80, zy(2.7));
  // rubble strewn about
  for (let i = 0; i < 90; i++) {
    const z = hash(i + 80) * 3.2;
    const x = L + hash(i + 40) * (R - L);
    const y = zy(z) + 4;
    const r = (4 + hash(i + 120) * 14) * zk(z);
    if (Math.abs(x - HOLE_X) < HOLE_RX && Math.abs(z - HOLE_Z) < 0.35) continue;
    chunk(c, x, y, r, i);
  }
  // a burnt-out car hulk far back on the right
  hulk(c, -300, zy(2.9), zk(2.9));
  // framing broken walls at both edges
  wall(c, L, 40, 170, 620, 1);
  wall(c, R, 40, 130, 520, -1);
  c.restore();
}

/** The shattered dome of a great hall on the skyline, ribs open to the sky */
function dome(c: CanvasRenderingContext2D, x: number, base: number, r: number) {
  c.fillStyle = '#433f3c';
  c.fillRect(x - r * 1.15, base, r * 2.3, 200);
  // drum with columns
  c.fillRect(x - r * 0.95, base - r * 0.42, r * 1.9, r * 0.42);
  c.fillStyle = 'rgba(150,120,90,0.22)';
  for (let i = 0; i < 12; i++) c.fillRect(x - r * 0.9 + i * r * 0.155, base - r * 0.38, r * 0.05, r * 0.36);
  c.fillStyle = '#433f3c';
  c.beginPath();
  c.moveTo(x - r * 0.9, base - r * 0.42);
  c.arc(x, base - r * 0.42, r * 0.9, Math.PI, Math.PI * 1.36);
  c.lineTo(x - r * 0.1, base - r * 0.7);
  c.lineTo(x + r * 0.2, base - r * 1.1);
  c.lineTo(x + r * 0.3, base - r * 0.8);
  c.arc(x, base - r * 0.42, r * 0.9, Math.PI * 1.7, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = '#433f3c';
  c.lineWidth = 5;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI * (1.38 + k * 0.08);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.9, base - r * 0.42 + Math.sin(a) * r * 0.9);
    c.quadraticCurveTo(x + Math.cos(a) * r * 0.5, base - r * 1.3, x, base - r * 1.32);
    c.stroke();
  }
  c.fillRect(x - 6, base - r * 1.5, 12, r * 0.2);
}

function haze(c: CanvasRenderingContext2D, L: number, R: number, y0: number, y1: number, col: string) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.fillRect(L, y0, R - L, y1 - y0);
}

function ruins(
  c: CanvasRenderingContext2D,
  L: number,
  R: number,
  base: number,
  minH: number,
  maxH: number,
  body: string,
  lit: string,
  seed: number,
  scale: number,
  fires: boolean
) {
  let x = L - 30;
  let i = 0;
  while (x < R) {
    const r = (k: number) => hash(seed * 1000 + i * 17 + k);
    const bw = (90 + r(1) * 170) * scale;
    const bh = minH + r(2) * (maxH - minH);
    const top = base - bh;
    c.beginPath();
    c.moveTo(x, base + 40);
    c.lineTo(x, top + r(3) * 40);
    const steps = 3 + Math.floor(r(4) * 4);
    for (let k = 1; k <= steps; k++) {
      const fx = x + (bw * k) / steps;
      const drop = r(10 + k) * bh * 0.35 * (r(5) > 0.3 ? 1 : 0.1);
      c.lineTo(fx - bw / steps / 2, top + drop * 0.6 + r(20 + k) * 14);
      c.lineTo(fx, top + drop);
    }
    c.lineTo(x + bw, base + 40);
    c.closePath();
    c.fillStyle = body;
    c.fill();
    const kind = r(6);
    if (kind < 0.25) {
      c.beginPath();
      c.arc(x + bw / 2, top + 6, bw * 0.34, Math.PI, Math.PI * (1.4 + r(7) * 0.5));
      c.lineTo(x + bw / 2, top + 6);
      c.closePath();
      c.fill();
      c.strokeStyle = body;
      c.lineWidth = 3 * scale;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(x + bw / 2, top + 6, bw * 0.34, Math.PI * (1.5 + k * 0.12), Math.PI * (1.52 + k * 0.12));
        c.lineTo(x + bw / 2, top + 6);
        c.stroke();
      }
    } else if (kind < 0.45) {
      c.beginPath();
      c.moveTo(x + bw * 0.1, top + 20);
      c.lineTo(x + bw * 0.5, top - bw * 0.16);
      c.lineTo(x + bw * 0.72, top + 4);
      c.closePath();
      c.fill();
    }
    const cols = Math.max(2, Math.floor(bw / (26 * scale)));
    const rows = Math.max(2, Math.floor(bh / (58 * scale)));
    const ww = (bw / cols) * 0.44;
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        const wx = x + (cc + 0.5) * (bw / cols) - ww / 2;
        const wy = base - 30 - (rr + 1) * (bh / (rows + 0.5));
        if (wy < top + 20 + r(40 + cc) * 50) continue;
        const f = hash(seed * 77 + i * 31 + rr * 7 + cc);
        if (f < 0.2) continue;
        c.fillStyle = fires && f > 0.92 ? '#d8692a' : f > 0.6 ? lit : 'rgba(8,7,6,0.6)';
        c.beginPath();
        c.moveTo(wx, wy + ww * 1.8);
        c.lineTo(wx, wy + ww * 0.5);
        c.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0);
        c.lineTo(wx + ww, wy + ww * 1.8);
        c.closePath();
        c.fill();
        if (fires && f > 0.92) {
          c.globalCompositeOperation = 'lighter';
          glow(c, wx + ww / 2, wy + ww, ww * 3, '255,110,40', 0.35);
          c.globalCompositeOperation = 'source-over';
        }
      }
    }
    if (r(8) > 0.4) {
      c.fillStyle = 'rgba(255,220,180,0.07)';
      const n = Math.floor(bw / (18 * scale));
      for (let k = 0; k < n; k++) c.fillRect(x + 6 + k * (bw / n), base - 70 * scale, 5 * scale, 70 * scale);
      c.fillStyle = body;
      c.fillRect(x, base - 80 * scale, bw, 10 * scale);
    }
    x += bw + (r(9) < 0.35 ? r(30) * 70 : 0);
    i++;
  }
}

function chunk(c: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  c.beginPath();
  const n = 5 + (seed % 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const rr = r * (0.6 + hash(seed * 13 + k) * 0.5);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.min(0, Math.sin(a)) * rr * 0.9 + Math.max(0, Math.sin(a)) * rr * 0.2;
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = '#28211d';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(200,160,120,0.22)';
  c.fillRect(x - r, y - r * 1.2, r * 2, r * 0.7);
  c.restore();
}

function midWall(c: CanvasRenderingContext2D, x: number, base: number) {
  const k = zk(2.7);
  c.save();
  c.translate(x, base);
  c.scale(k, k);
  c.beginPath();
  c.moveTo(-170, 6);
  c.lineTo(-176, -250);
  c.lineTo(-120, -262);
  c.lineTo(-80, -230);
  c.lineTo(-30, -300);
  c.lineTo(40, -286);
  c.lineTo(90, -240);
  c.lineTo(150, -250);
  c.lineTo(178, -150);
  c.lineTo(170, 6);
  c.closePath();
  const g = c.createLinearGradient(0, -300, 0, 6);
  g.addColorStop(0, '#5a4c40');
  g.addColorStop(1, '#2a221d');
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  // stone courses
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = 2;
  for (let y = -280; y < 0; y += 34) {
    c.beginPath();
    c.moveTo(-200, y);
    c.lineTo(200, y);
    c.stroke();
  }
  omen(c, -4, -140, 92);
  c.restore();
  c.restore();
}

/** The Crimson Omen: a skull inside a cog, sprayed in red paint */
function omen(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(150,30,24,0.78)';
  // cog ring with teeth
  c.beginPath();
  const teeth = 10;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / (teeth * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.84;
    c.arc(0, 0, rr, a0, a1);
  }
  c.closePath();
  c.arc(0, 0, r * 0.66, 0, TAU, true);
  c.fill('evenodd');
  // skull
  c.beginPath();
  c.moveTo(-r * 0.44, -r * 0.02);
  c.bezierCurveTo(-r * 0.5, -r * 0.62, r * 0.5, -r * 0.62, r * 0.44, -r * 0.02);
  c.bezierCurveTo(r * 0.42, r * 0.18, r * 0.28, r * 0.22, r * 0.26, r * 0.32);
  c.lineTo(r * 0.24, r * 0.5);
  c.lineTo(-r * 0.24, r * 0.5);
  c.lineTo(-r * 0.26, r * 0.32);
  c.bezierCurveTo(-r * 0.28, r * 0.22, -r * 0.42, r * 0.18, -r * 0.44, -r * 0.02);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.ellipse(-r * 0.19, -r * 0.04, r * 0.13, r * 0.11, 0.3, 0, TAU);
  c.ellipse(r * 0.19, -r * 0.04, r * 0.13, r * 0.11, -0.3, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(0, r * 0.1);
  c.lineTo(-r * 0.06, r * 0.22);
  c.lineTo(r * 0.06, r * 0.22);
  c.closePath();
  c.fill();
  for (let i = -2; i <= 2; i++) c.fillRect(i * r * 0.09 - r * 0.012, r * 0.34, r * 0.024, r * 0.16);
  c.globalCompositeOperation = 'source-over';
  // paint drips
  c.fillStyle = 'rgba(150,30,24,0.6)';
  for (let i = 0; i < 6; i++) {
    const dx = (hash(i + 500) - 0.5) * r * 1.4;
    c.fillRect(dx, r * 0.4 + hash(i + 510) * r * 0.3, 2.2, r * (0.2 + hash(i + 520) * 0.5));
  }
  c.restore();
}

function hulk(c: CanvasRenderingContext2D, x: number, base: number, k: number) {
  c.save();
  c.translate(x, base);
  c.scale(k, k);
  c.fillStyle = '#1c1715';
  c.beginPath();
  c.moveTo(-150, 0);
  c.lineTo(-146, -50);
  c.lineTo(-90, -60);
  c.lineTo(-56, -104);
  c.lineTo(40, -108);
  c.lineTo(84, -64);
  c.lineTo(150, -54);
  c.lineTo(156, 0);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(200,120,60,0.18)';
  c.fillRect(-50, -98, 80, 30);
  c.fillStyle = '#0c0a09';
  for (const wx of [-96, 100]) {
    c.beginPath();
    c.arc(wx, 0, 28, Math.PI, TAU);
    c.fill();
  }
  c.restore();
}

function wall(c: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, dir: 1 | -1) {
  c.save();
  c.translate(x, base);
  c.scale(dir, 1);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -h);
  c.lineTo(w * 0.4, -h + 30);
  c.lineTo(w * 0.55, -h * 0.7);
  c.lineTo(w * 0.8, -h * 0.62);
  c.lineTo(w, -h * 0.35);
  c.lineTo(w * 0.9, -h * 0.2);
  c.lineTo(w, 0);
  c.closePath();
  c.fillStyle = '#121010';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(110,85,64,0.45)';
  c.beginPath();
  c.moveTo(w * 0.2, -h * 0.45);
  c.lineTo(w * 0.2, -h * 0.6);
  c.arc(w * 0.32, -h * 0.6, w * 0.12, Math.PI, 0);
  c.lineTo(w * 0.44, -h * 0.45);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(230,150,90,0.3)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(w, -h * 0.35);
  c.lineTo(w * 0.8, -h * 0.62);
  c.lineTo(w * 0.55, -h * 0.7);
  c.stroke();
  c.restore();
  c.restore();
}

/** Close foreground rubble and twisted rebar along the bottom edge */
function renderForeground(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  c.translate(st.ox, st.oy);
  c.scale(st.k, st.k);
  const L = st.left - 40;
  const R = st.right + 40;
  const B = st.bottom + 40;
  const y0 = 44;
  if (B > y0) {
    for (let i = 0; i < 26; i++) {
      const x = L + hash(i + 700) * (R - L);
      const y = y0 + 20 + hash(i + 720) * 60;
      const r = 18 + hash(i + 740) * 30;
      if (x > -200 && x < 500 && hash(i + 760) < 0.6) continue;
      chunk(c, x, y, r, i + 700);
    }
    c.strokeStyle = '#1a120d';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(L + 60, y0 + 80);
    c.quadraticCurveTo(L + 100, y0 + 10, L + 160, y0 - 6);
    c.moveTo(R - 80, y0 + 90);
    c.quadraticCurveTo(R - 120, y0 + 30, R - 190, y0 + 18);
    c.stroke();
  }
  c.restore();
}

/* ---------- per-frame drawing ---------- */

interface DrawItem {
  z: number;
  kind: number;
  g: Gear | null;
  e: Enemy | null;
}
const items: DrawItem[] = Array.from({ length: 16 }, () => ({ z: 0, kind: 0, g: null, e: null }));

function drawScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const st = s.st;
  const p = s.paint;
  if (!p) return;
  p.ctx = ctx;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#141110';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const amp = env.reducedMotion ? 0 : s.shake * s.shake * 10 * st.k;
  if (amp > 0.05) ctx.translate(Math.sin(t * 93) * amp, Math.cos(t * 77) * amp * 0.7);
  // camera push-in around the kill
  const fsx = st.ox + s.camX * st.k;
  const fsy = st.oy + s.camY * st.k;
  const Z = s.camZ;
  const zb = Math.pow(Z, 0.35);
  ctx.save();
  ctx.translate(fsx, fsy);
  ctx.scale(zb, zb);
  ctx.translate(-fsx, -fsy);
  drawLayer(ctx, s.bg, w, h);
  ctx.restore();
  ctx.save();
  const pan = (Z - 1) * 1.6;
  ctx.translate((w / 2 - fsx) * pan * 0.5, (h * 0.5 - fsy) * pan * 0.5);
  ctx.translate(fsx, fsy);
  ctx.scale(Z, Z);
  ctx.translate(-fsx, -fsy);
  ctx.save();
  ctx.translate(st.ox, st.oy);
  ctx.scale(st.k, st.k);

  drawAsh(ctx, s, t, true);
  // depth-sorted actors: far first
  let n = 0;
  const push = (z: number, kind: number, g: Gear | null, e: Enemy | null) => {
    const it = items[n++];
    it.z = z;
    it.kind = kind;
    it.g = g;
    it.e = e;
  };
  push(HOLE_Z + 0.001, 0, null, null);
  for (const g of s.gears) {
    push(g.z, 1, g, null);
    push(g.hz - 0.002, 2, g, null);
  }
  for (const e of s.enemies) if (e.on && e.state !== 'rise') push(e.z, 3, null, e);
  const list = items.slice(0, n).sort((a, b) => b.z - a.z);
  let hazed = 0;
  for (const it of list) {
    // atmospheric haze between depth bands
    if ((hazed === 0 && it.z < 0.9) || (hazed === 1 && it.z < 0.32)) {
      hazed++;
      ctx.fillStyle = hazed === 1 ? 'rgba(84,70,60,0.16)' : 'rgba(84,70,60,0.1)';
      ctx.fillRect(st.left - 60, st.top - 60, st.right - st.left + 120, st.bottom - st.top + 120);
    }
    if (it.kind === 0) drawHole(p, s, t);
    else if (it.kind === 1 && it.g) drawGear(p, it.g, s, t);
    else if (it.kind === 2 && it.g) drawCover(ctx, it.g, t);
    else if (it.kind === 3 && it.e) drawEnemy(p, it.e, s, t);
  }
  drawGrenades(ctx, s, t);
  drawEffects(ctx, s, t);
  drawAsh(ctx, s, t, false);
  drawMark(ctx, s, t);
  ctx.restore();
  ctx.restore();
  ctx.save();
  ctx.translate((w / 2 - fsx) * (Z - 1) * 0.8, (h * 0.5 - fsy) * (Z - 1) * 0.8);
  drawLayer(ctx, s.fg, w, h);
  ctx.restore();
  ctx.restore();
  // explosion flash and grade
  if (s.boom > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,150,70,${0.22 * s.boom * s.boom})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  vignette(ctx, w, h, 0.72, '8,6,4');
  if (s.mode === 'saw' || s.camZ > 1.02) {
    // letterbox bars for the kill cam
    const k = clamp((s.camZ - 1) / 0.28, 0, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h * 0.07 * k);
    ctx.fillRect(0, h - h * 0.07 * k, w, h * 0.07 * k);
  }
  drawHud(ctx, s, env, t);
}

function drawAsh(ctx: CanvasRenderingContext2D, s: State, t: number, far: boolean) {
  for (let i = 0; i < s.ash.items.length; i++) {
    const p = s.ash.items[i];
    if (p.life <= 0 || (i % 3 === 0) !== far) continue;
    const sway = Math.sin(t * 1.3 + i) * 6;
    if (p.kind === 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${130 + (i % 5) * 20},60,${0.5 + 0.4 * Math.sin(t * 8 + i)})`;
      ctx.fillRect(p.x + sway, p.y, p.size, p.size);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = far ? 'rgba(160,152,145,0.32)' : 'rgba(200,192,184,0.62)';
      const sz = far ? p.size * 0.7 : p.size * 1.2;
      ctx.save();
      ctx.translate(p.x + sway, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-sz, -sz * 0.4, sz * 2, sz * 0.8);
      ctx.restore();
    }
  }
}

function drawHole(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  const k = zk(HOLE_Z);
  const gy = zy(HOLE_Z);
  const rx = HOLE_RX * k;
  const ry = HOLE_RY * k;
  // cracked ground around the emergence hole
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + 0.3;
    ctx.beginPath();
    ctx.moveTo(HOLE_X + Math.cos(a) * rx * 0.9, gy + Math.sin(a) * ry * 0.9);
    ctx.lineTo(HOLE_X + Math.cos(a) * rx * 1.8, gy + Math.sin(a) * ry * 2 + (i % 2) * 6);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(HOLE_X, gy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = '#0a0504';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, HOLE_X, gy + 8, rx * 1.1, '230,80,20', 0.5 + 0.12 * Math.sin(t * 3));
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  // heat rising out of it
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, HOLE_X, gy - 30, rx * 1.4, '255,100,30', 0.12 + 0.04 * Math.sin(t * 2.3));
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#3e3029';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(HOLE_X, gy, rx, ry, 0, Math.PI, TAU);
  ctx.stroke();
  // Locust climbing out, hidden below the front lip
  for (const e of s.enemies) {
    if (!e.on || e.state !== 'rise') continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(HOLE_X - 400, gy - 700, 800, 700 + ry * 0.4);
    ctx.clip();
    drawEnemy(p, e, s, t);
    ctx.restore();
  }
  // the front lip: a heaped mound of broken road
  ctx.beginPath();
  ctx.moveTo(HOLE_X - rx - 40 * k, gy + 6);
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    const x = HOLE_X - Math.cos(a) * (rx + 8 * k);
    const y = gy + Math.sin(a) * ry - 8 * k - hash(i + 900) * 10 * k * Math.sin(a);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(HOLE_X + rx + 40 * k, gy + 6);
  ctx.quadraticCurveTo(HOLE_X, gy + ry * 2.2, HOLE_X - rx - 40 * k, gy + 6);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, gy - 10, 0, gy + ry * 2);
  g.addColorStop(0, '#5a4636');
  g.addColorStop(0.35, '#3a2d25');
  g.addColorStop(1, 'rgba(38,30,26,0)');
  ctx.fillStyle = g;
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = 0.2 + (i / 8) * (Math.PI - 0.4);
    const x = HOLE_X - Math.cos(a) * (rx + 4);
    const y = gy + Math.sin(a) * ry - 6 * k;
    const r = (7 + hash(i + 950) * 9) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hash(i + 960) - 0.5) * 0.9);
    ctx.fillStyle = '#2d231d';
    ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.2);
    ctx.fillStyle = 'rgba(255,140,70,0.4)';
    ctx.fillRect(-r, -r * 0.7, r * 2, 2);
    ctx.restore();
  }
}

/* ---------- Delta Squad ---------- */

function ik(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, bend: number) {
  const dx = hx - sx;
  const dy = hy - sy;
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(c) * bend;
  return [sx + Math.cos(a + off) * l1, sy + Math.sin(a + off) * l1] as const;
}

function line(p: Painter, color: string, width: number, trace: () => void) {
  const ctx = p.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  trace();
  ctx.stroke();
}

/** The blue light strips set into COG plate */
function blueStrip(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number, a = 1) {
  const pulse = 0.82 + 0.18 * Math.sin(t * 2.2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(50,170,255,${0.24 * a * pulse})`;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(160,230,255,${0.95 * a * pulse})`;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function drawGear(p: Painter, g: Gear, s: State, t: number) {
  const ctx = p.ctx;
  const L = g.look;
  solvePose(g, s, t);
  const S = zk(g.z) * g.size;
  // contact shadow stays on the ground through the vault
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(g.x, zy(g.z) + 2, 96 * S, 11 * S, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(g.x, zy(g.z) - g.lift);
  ctx.scale(S * g.face, S);
  p.lx = 0.62 * g.face;
  p.ly = -0.78;
  p.back = 'rgba(120,180,240,0.55)';
  p.bx = -0.9 * g.face;
  p.by = -0.4;
  p.backW = 2.4;
  p.outline = 'rgba(6,6,8,0.92)';
  p.outlineW = 1.6;

  const bulk = L.bulk;
  const hb: [number, number] = [-16, pose.py + 6];
  const hf: [number, number] = [16, pose.py + 8];
  gLeg(p, L, hb, [pose.f1x, pose.f1y], true);

  ctx.save();
  ctx.translate(pose.px, pose.py);
  ctx.rotate(pose.lean);
  const BS = [-28 * bulk, -128] as const;
  const FS = [14 * bulk, -114] as const;
  const ga = pose.ga;
  const ca = Math.cos(ga);
  const sa = Math.sin(ga);
  const gnasher = L.gun === 'gnasher';
  // where the off hand holds the gun (or goes for a fresh magazine)
  let fx = pose.gx + ca * (gnasher ? 88 : 78) - sa * (gnasher ? 12 : 8);
  let fy = pose.gy + sa * (gnasher ? 88 : 78) + ca * (gnasher ? 12 : 8);
  if (pose.reachK > 0) {
    fx = lerp(fx, 10, pose.reachK);
    fy = lerp(fy, -20, pose.reachK);
  }
  gArm(p, L, BS[0], BS[1], pose.gx, pose.gy + 4, true);
  pauldron(p, L, BS[0] - 2, BS[1] - 4, true, t);
  torso(p, L, t);
  ctx.save();
  ctx.translate(pose.gx, pose.gy);
  ctx.rotate(ga);
  if (gnasher) gnasherGun(p);
  else lancer(p, s, g, t);
  ctx.restore();
  gArm(p, L, FS[0], FS[1], fx, fy, false);
  pauldron(p, L, FS[0], FS[1] - 6, false, t);
  ctx.save();
  ctx.translate(24 * bulk, -160);
  ctx.rotate(pose.head);
  if (g.id === 'marcus') marcusHead(p, t);
  else if (g.id === 'dom') domHead(p, t);
  else if (g.id === 'cole') coleHead(p, g, t);
  else bairdHead(p, t);
  ctx.restore();
  ctx.restore();

  gLeg(p, L, hf, [pose.f2x, pose.f2y], false);
  ctx.restore();
  p.outline = '';
  p.back = '';
  // this gear's flash and rounds, in its own depth slot so nearer squadmates cover them
  ctx.globalCompositeOperation = 'lighter';
  muzzle(ctx, g);
  tracers(ctx, s, s.gears.indexOf(g));
  ctx.globalCompositeOperation = 'source-over';
}

function torso(p: Painter, L: Look, t: number) {
  const ctx = p.ctx;
  const A = L.armor;
  ctx.save();
  ctx.scale(L.bulk, 1);
  // undersuit at the waist, belt and pouches
  p.part(() => rpoly(ctx, [-38, 10, 40, 10, 46, -58, -44, -58], 8), L.suit[0], L.suit[1], L.suit[2]);
  p.part(() => rpoly(ctx, [-46, -14, 48, -14, 48, 4, -46, 4], 4), STRAP[0], STRAP[1], STRAP[2], 2, 4);
  for (const [x, w] of [
    [-40, 20],
    [-14, 20],
    [12, 18],
    [34, 14],
  ] as const) {
    p.part(() => rpoly(ctx, [x, -11, x + w, -11, x + w, 14, x, 14], 3), STRAP[0], STRAP[1], STRAP[2], 1.6, 4);
  }
  // the chest: a massive armoured slab, much wider than the hips
  p.part(() => rpoly(ctx, [-46, -38, -60, -96, -54, -128, -28, -146, 32, -148, 62, -136, 74, -106, 70, -68, 56, -36, 8, -28], 12), A[0], A[1], A[2], 3.5, 14);
  p.part(() => rpoly(ctx, [10, -140, 58, -132, 72, -104, 68, -74, 46, -64, 16, -72], 8), A[0], A[1], A[2], 2.6, 9);
  p.part(() => rpoly(ctx, [-42, -62, 56, -64, 54, -38, 8, -28, -40, -38], 6), A[0], A[1], A[2], 2.2, 7);
  line(p, SEAM, 2, () => {
    ctx.moveTo(-58, -84);
    ctx.quadraticCurveTo(-20, -76, 10, -82);
    ctx.moveTo(-12, -142);
    ctx.quadraticCurveTo(-16, -104, -22, -66);
    ctx.moveTo(-36, -52);
    ctx.lineTo(50, -52);
  });
  line(p, SHEEN, 2.2, () => {
    ctx.moveTo(18, -134);
    ctx.quadraticCurveTo(54, -130, 68, -108);
  });
  // grime, scuffs and the blue light strips
  ctx.fillStyle = 'rgba(40,30,25,0.32)';
  ctx.beginPath();
  ctx.ellipse(-24, -50, 26, 8, 0.2, 0, TAU);
  ctx.ellipse(34, -98, 10, 5, -0.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.55)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(42, -112);
  ctx.lineTo(52, -102);
  ctx.moveTo(-34, -108);
  ctx.lineTo(-24, -112);
  ctx.stroke();
  blueStrip(ctx, 24, -128, 26, -82, t);
  blueStrip(ctx, 46, -124, 50, -84, t);
  blueStrip(ctx, -36, -46, 48, -48, t, 0.55);
  // the tall collar ring that wraps the back of the neck
  p.part(() => rpoly(ctx, [-36, -126, -34, -160, -6, -172, 24, -168, 40, -142, 8, -136], 8), A[0], A[1], A[2], 2.6, 7);
  blueStrip(ctx, -26, -150, 8, -162, t, 0.5);
  ctx.restore();
}

function gLeg(p: Painter, L: Look, hip: readonly [number, number], foot: readonly [number, number], back: boolean) {
  const ctx = p.ctx;
  const A = back ? L.armorD : L.armor;
  const S = back ? L.suitD : L.suit;
  const [kx, ky] = ik(hip[0], hip[1], foot[0], foot[1] - 16, 76, 72, -1);
  const ax = foot[0] - 5;
  const ay = foot[1] - 18;
  const ta = Math.atan2(ky - hip[1], kx - hip[0]);
  const sa = Math.atan2(ay - ky, ax - kx);
  const tl = Math.hypot(kx - hip[0], ky - hip[1]);
  const sl = Math.hypot(ax - kx, ay - ky);
  p.part(() => capsule(ctx, hip[0], hip[1], kx, ky, 30, 22), S[0], S[1], S[2]);
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(ta);
  p.part(() => rpoly(ctx, [tl * 0.04, -30, tl * 0.8, -25, tl * 0.9, 0, tl * 0.76, 20, tl * 0.1, 25, -12, 0], 10), A[0], A[1], A[2], 2.6, 8);
  if (!back) blueStrip(ctx, tl * 0.2, -18, tl * 0.66, -16, 0, 0.6);
  ctx.restore();
  p.part(() => capsule(ctx, kx, ky, ax, ay, 23, 18), S[0], S[1], S[2]);
  ctx.save();
  ctx.translate(kx, ky);
  ctx.rotate(sa);
  p.part(() => rpoly(ctx, [sl * 0.08, -25, sl * 0.6, -28, sl * 1.0, -22, sl * 1.04, 13, sl * 0.5, 21, sl * 0.1, 18], 8), A[0], A[1], A[2], 2.6, 8);
  line(p, back ? 'rgba(8,10,14,0.5)' : SEAM, 1.6, () => {
    ctx.moveTo(sl * 0.3, -12);
    ctx.lineTo(sl * 0.95, -10);
  });
  ctx.restore();
  ctx.save();
  ctx.translate(kx + 8, ky - 2);
  ctx.rotate(0.3);
  p.part(() => rpoly(ctx, [-18, -18, 15, -20, 23, 0, 15, 18, -15, 16], 8), A[0], A[1], A[2], 2.6, 6);
  ctx.restore();
  p.part(() => rpoly(ctx, [ax - 25, ay - 13, ax + 18, ay - 16, ax + 43, foot[1] - 8, ax + 48, foot[1] + 2, ax - 26, foot[1] + 2], 7), BOOT[0], BOOT[1], BOOT[2], 2, 5);
  ctx.fillStyle = '#0a0807';
  ctx.fillRect(ax - 26, foot[1] - 3, 74, 5);
}

function gArm(p: Painter, L: Look, sx: number, sy: number, hx: number, hy: number, back: boolean) {
  const ctx = p.ctx;
  const S = back ? L.suitD : L.suit;
  const A = back ? L.armorD : L.armor;
  const K = back ? L.skinD : L.skin;
  const big = L.bare ? 1.18 : 1;
  const [ex, ey] = ik(sx, sy, hx, hy, 62, 58, 1);
  const fa = Math.atan2(hy - ey, hx - ex);
  const fl = Math.hypot(hx - ex, hy - ey);
  if (L.bare) {
    // Cole: bare arms like tree trunks, a bracer at the wrist
    p.part(() => capsule(ctx, sx, sy, ex, ey, 27 * big, 20 * big), K[0], K[1], K[2]);
    p.part(() => capsule(ctx, ex, ey, hx, hy, 20 * big, 15), K[0], K[1], K[2]);
    if (!back) {
      line(p, 'rgba(255,220,190,0.25)', 2, () => {
        ctx.moveTo(sx + 6, sy - 18);
        ctx.quadraticCurveTo((sx + ex) / 2 + 8, (sy + ey) / 2 - 20, ex + 4, ey - 16);
      });
    }
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(fa);
    p.part(() => rpoly(ctx, [fl * 0.46, -18, fl * 0.84, -17, fl * 0.86, 17, fl * 0.46, 18], 6), A[0], A[1], A[2], 2.4, 6);
    ctx.restore();
  } else {
    p.part(() => capsule(ctx, sx, sy, ex, ey, 25, 20), S[0], S[1], S[2]);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(fa);
    p.part(() => rpoly(ctx, [-10, -20, fl * 0.5, -21, fl * 0.82, -18, fl * 0.84, 16, fl * 0.4, 20, -12, 15], 8), A[0], A[1], A[2], 2.6, 7);
    line(p, back ? 'rgba(8,10,14,0.5)' : SEAM, 1.6, () => {
      ctx.moveTo(fl * 0.62, -20);
      ctx.lineTo(fl * 0.64, 18);
    });
    if (!back) blueStrip(ctx, fl * 0.12, -12, fl * 0.5, -13, 0, 0.55);
    ctx.restore();
    p.part(() => ctx.arc(ex, ey, 14, 0, TAU), A[0], A[1], A[2], 2.2, 5);
  }
  p.part(() => rpoly(ctx, [hx - 13, hy - 12, hx + 12, hy - 14, hx + 17, hy + 2, hx + 10, hy + 13, hx - 12, hy + 12], 6), BOOT[0], BOOT[1], BOOT[2], 1.8, 4);
}

/** COG pauldron: a broad crowned shell over two stacked lames, blue strip on the rim */
function pauldron(p: Painter, L: Look, sx: number, sy: number, back: boolean, t: number) {
  const ctx = p.ctx;
  const A = back ? L.armorD : L.armor;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(0.7 * (L.bulk > 1 ? 1.1 : 1), 0.7);
  if (back) ctx.scale(0.95, 0.95);
  p.part(() => rpoly(ctx, [-44, 26, 52, 22, 54, 50, -38, 54], 8), A[0], A[1], A[2], 2.4, 7);
  p.part(() => rpoly(ctx, [-52, 4, 62, 0, 66, 30, -48, 34], 8), A[0], A[1], A[2], 2.6, 8);
  p.part(() => rpoly(ctx, [-64, 10, -62, -30, -40, -58, 10, -68, 56, -56, 78, -26, 76, 8, 40, 14, -20, 16], 18), A[0], A[1], A[2], 4.5, 16);
  if (!back) {
    // raised ridge along the crown
    p.part(() => rpoly(ctx, [-30, -50, 8, -64, 50, -52, 46, -42, 8, -52, -26, -40], 6), A[0], A[1], A[2], 2, 4);
    line(p, SEAM, 2, () => {
      ctx.moveTo(-50, 22);
      ctx.lineTo(62, 18);
      ctx.moveTo(-42, 44);
      ctx.lineTo(52, 40);
    });
    line(p, SHEEN, 2.6, () => {
      ctx.moveTo(-52, -20);
      ctx.quadraticCurveTo(-34, -50, 0, -58);
    });
    blueStrip(ctx, -50, 8, 62, 4, t, 0.9);
    // scuffs and a chipped edge
    ctx.fillStyle = 'rgba(20,18,16,0.35)';
    ctx.beginPath();
    ctx.ellipse(30, -20, 12, 6, -0.3, 0, TAU);
    ctx.ellipse(-30, -4, 8, 4, 0.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ----- heads, each about 60 units tall, facing right in three quarters ----- */

/** Shared heavy-jawed face; `jaw` widens it */
function faceTrace(ctx: CanvasRenderingContext2D, jaw = 0) {
  ctx.moveTo(-22, -18);
  ctx.bezierCurveTo(-24, -34, -6, -42, 10, -40);
  ctx.bezierCurveTo(24, -38, 30, -30, 31, -20);
  ctx.lineTo(33, -14);
  ctx.lineTo(30, -10);
  ctx.lineTo(37, 0);
  ctx.lineTo(31, 3);
  ctx.lineTo(33, 9);
  ctx.lineTo(31, 13);
  ctx.bezierCurveTo(32 + jaw, 21, 28 + jaw, 26 + jaw * 0.4, 18, 28 + jaw * 0.4);
  ctx.lineTo(0, 28 + jaw * 0.4);
  ctx.bezierCurveTo(-14 - jaw, 24, -22 - jaw, 12, -23, 0);
  ctx.closePath();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, squint: number, iris: string) {
  ctx.fillStyle = '#2a1d17';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 8);
  ctx.lineTo(x + 14, y - 6 + squint);
  ctx.lineTo(x + 12, y - 1 + squint);
  ctx.lineTo(x - 6, y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ece4da';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y);
  ctx.lineTo(x + 8, y + 3 - squint * 0.4);
  ctx.lineTo(x + 1, y + 3 - squint * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = iris;
  ctx.fillRect(x + 5, y, 2.6, 2.8 - squint * 0.3);
}

function stubble(ctx: CanvasRenderingContext2D, a: number, seed: number) {
  ctx.fillStyle = `rgba(36,26,22,${0.42 * a})`;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.quadraticCurveTo(0, 8, 14, 6);
  ctx.lineTo(24, 4);
  ctx.lineTo(36, 4);
  ctx.lineTo(40, 34);
  ctx.lineTo(-20, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(20,14,12,${0.5 * a})`;
  for (let i = 0; i < 40; i++) ctx.fillRect(-12 + hash(i + seed) * 46, 4 + hash(i + 50 + seed) * 22, 1.3, 1.3);
}

function marcusHead(p: Painter, t: number) {
  const ctx = p.ctx;
  const K = LOOKS.marcus.skin;
  ctx.save();
  ctx.scale(0.86, 0.86);
  p.part(() => capsule(ctx, -6, 30, 2, 8, 20, 19), K[0], K[1], K[2]);
  p.part(() => faceTrace(ctx, 1), K[0], K[1], K[2], 2.5, 9);
  ctx.save();
  ctx.beginPath();
  faceTrace(ctx, 1);
  ctx.clip();
  stubble(ctx, 1.1, 0);
  ctx.fillStyle = 'rgba(90,50,34,0.35)';
  ctx.beginPath();
  ctx.ellipse(10, -2, 10, 5, 0.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = K[1];
  ctx.beginPath();
  ctx.ellipse(-10, -4, 5, 9, 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
  eye(ctx, 18, -12, 2, '#4a7fb0');
  ctx.strokeStyle = 'rgba(60,30,20,0.85)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(30, 2);
  ctx.lineTo(27, 3);
  ctx.moveTo(18, 14);
  ctx.lineTo(30, 13);
  ctx.stroke();
  // the scar down his right cheek, from under the eye to the jaw
  ctx.strokeStyle = 'rgba(120,40,32,0.95)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(15, -8);
  ctx.lineTo(11, 2);
  ctx.lineTo(13, 14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245,200,170,0.75)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(16, -8);
  ctx.lineTo(12, 2);
  ctx.lineTo(14, 14);
  ctx.stroke();
  // the black do-rag, pulled low and knotted at the back with the tails in the wind
  const wind = Math.sin(t * 5) * 4 + Math.sin(t * 8.3) * 2;
  p.part(
    () => {
      ctx.moveTo(-28, -6);
      ctx.bezierCurveTo(-30, -38, -8, -50, 12, -48);
      ctx.bezierCurveTo(28, -46, 35, -34, 33, -19);
      ctx.bezierCurveTo(22, -24, 6, -24, -8, -20);
      ctx.lineTo(-18, -2);
      ctx.closePath();
    },
    '#50555c',
    '#1c1f23',
    '#08090b',
    2.5,
    7
  );
  p.part(
    () => {
      ctx.moveTo(-24, -14);
      ctx.bezierCurveTo(-38, -12 + wind * 0.3, -48, -6 + wind, -60, -4 + wind * 1.4);
      ctx.lineTo(-56, 4 + wind * 1.2);
      ctx.bezierCurveTo(-44, 2 + wind, -34, -2, -24, -4);
      ctx.closePath();
      ctx.moveTo(-24, -8);
      ctx.bezierCurveTo(-34, 0 + wind * 0.4, -40, 10 + wind * 0.8, -48, 18 + wind);
      ctx.lineTo(-41, 21 + wind);
      ctx.bezierCurveTo(-34, 12, -30, 2, -22, -2);
      ctx.closePath();
    },
    '#464a51',
    '#191b1f',
    '#08090b',
    2,
    5
  );
  p.part(() => ctx.ellipse(-24, -10, 7, 6, 0, 0, TAU), '#464a51', '#191b1f', '#08090b', 1.5, 3);
  line(p, 'rgba(160,170,180,0.3)', 1.6, () => {
    ctx.moveTo(-18, -36);
    ctx.quadraticCurveTo(4, -48, 24, -40);
  });
  ctx.restore();
}

function domHead(p: Painter, t: number) {
  const ctx = p.ctx;
  const K = LOOKS.dom.skin;
  ctx.save();
  ctx.scale(0.85, 0.85);
  p.part(() => capsule(ctx, -6, 30, 2, 8, 19, 18), K[0], K[1], K[2]);
  // a small tattoo on the side of his neck
  ctx.strokeStyle = 'rgba(30,40,60,0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-14, 18);
  ctx.quadraticCurveTo(-8, 12, -4, 20);
  ctx.quadraticCurveTo(0, 26, -8, 30);
  ctx.moveTo(-12, 26);
  ctx.lineTo(-6, 24);
  ctx.stroke();
  p.part(() => faceTrace(ctx, 0), K[0], K[1], K[2], 2.5, 9);
  ctx.save();
  ctx.beginPath();
  faceTrace(ctx, 0);
  ctx.clip();
  stubble(ctx, 0.45, 9);
  // shaved sides: dark stubble over the side of the skull
  ctx.fillStyle = 'rgba(30,22,18,0.55)';
  ctx.beginPath();
  ctx.moveTo(-26, -6);
  ctx.bezierCurveTo(-26, -30, -10, -36, 6, -34);
  ctx.lineTo(10, -26);
  ctx.bezierCurveTo(0, -24, -10, -18, -14, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = K[1];
  ctx.beginPath();
  ctx.ellipse(-10, -4, 5, 9, 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
  eye(ctx, 18, -12, 1, '#4a3022');
  // goatee: moustache wrapping the mouth down into a chin beard
  ctx.fillStyle = '#17110d';
  ctx.beginPath();
  ctx.moveTo(22, 7);
  ctx.quadraticCurveTo(30, 4, 35, 7);
  ctx.lineTo(34, 11);
  ctx.quadraticCurveTo(28, 9, 22, 11);
  ctx.closePath();
  ctx.moveTo(22, 11);
  ctx.lineTo(25, 22);
  ctx.quadraticCurveTo(28, 30, 21, 31);
  ctx.lineTo(13, 30);
  ctx.quadraticCurveTo(10, 24, 14, 16);
  ctx.lineTo(18, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,30,22,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(30, 2);
  ctx.lineTo(27, 3);
  ctx.moveTo(22, 14);
  ctx.lineTo(31, 13);
  ctx.stroke();
  // short black hair, spiked up on top
  p.part(
    () => {
      ctx.moveTo(-14, -28);
      ctx.bezierCurveTo(-10, -42, 4, -50, 18, -46);
      ctx.lineTo(16, -52);
      ctx.lineTo(23, -46);
      ctx.lineTo(24, -52);
      ctx.lineTo(28, -43);
      ctx.bezierCurveTo(32, -38, 33, -30, 31, -24);
      ctx.bezierCurveTo(22, -32, 6, -34, -6, -30);
      ctx.closePath();
    },
    '#3c3430',
    '#16110f',
    '#060404',
    2,
    5
  );
  void t;
  ctx.restore();
}

function coleHead(p: Painter, g: Gear, t: number) {
  const ctx = p.ctx;
  const K = LOOKS.cole.skin;
  ctx.save();
  ctx.scale(0.94, 0.94);
  // a neck as thick as the head
  p.part(() => capsule(ctx, -6, 32, 2, 10, 24, 22), K[0], K[1], K[2]);
  const head = () => {
    ctx.moveTo(-24, -14);
    ctx.bezierCurveTo(-28, -42, -6, -54, 10, -52);
    ctx.bezierCurveTo(28, -50, 34, -36, 33, -20);
    ctx.lineTo(35, -14);
    ctx.lineTo(32, -10);
    ctx.lineTo(40, 0);
    ctx.lineTo(33, 4);
    ctx.lineTo(35, 10);
    ctx.lineTo(33, 14);
    ctx.bezierCurveTo(35, 24, 30, 30, 18, 31);
    ctx.lineTo(0, 30);
    ctx.bezierCurveTo(-16, 26, -26, 12, -26, -2);
    ctx.closePath();
  };
  p.part(head, K[0], K[1], K[2], 2.5, 9);
  ctx.save();
  ctx.beginPath();
  head();
  ctx.clip();
  ctx.fillStyle = K[1];
  ctx.beginPath();
  ctx.ellipse(-11, -4, 6, 10, 0.2, 0, TAU);
  ctx.fill();
  // a polished shine on the bald dome
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,220,190,0.22)';
  ctx.beginPath();
  ctx.ellipse(10, -42, 14, 5, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,220,0.35)';
  ctx.beginPath();
  ctx.ellipse(14, -44, 6, 2, -0.2, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  eye(ctx, 18, -12, 0, '#2a1810');
  // broad nose
  ctx.fillStyle = 'rgba(40,20,12,0.6)';
  ctx.beginPath();
  ctx.ellipse(34, 3, 5, 3, 0, 0, TAU);
  ctx.fill();
  // the big Thrashball grin, wider when he is shooting
  const grin = 0.4 + g.pop * 0.6;
  ctx.fillStyle = '#2a0e08';
  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.quadraticCurveTo(26, 14 + grin * 3, 36, 10);
  ctx.quadraticCurveTo(30, 18 + grin * 8, 18, 18 + grin * 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4ede0';
  ctx.beginPath();
  ctx.moveTo(16, 12.5);
  ctx.quadraticCurveTo(26, 14.5 + grin * 2, 35, 10.5);
  ctx.lineTo(33, 13 + grin * 2);
  ctx.quadraticCurveTo(25, 16 + grin * 2, 17, 14.5);
  ctx.closePath();
  ctx.fill();
  void t;
  ctx.restore();
}

function bairdHead(p: Painter, t: number) {
  const ctx = p.ctx;
  const K = LOOKS.baird.skin;
  ctx.save();
  ctx.scale(0.84, 0.84);
  p.part(() => capsule(ctx, -6, 30, 2, 8, 18, 17), K[0], K[1], K[2]);
  p.part(() => faceTrace(ctx, -1), K[0], K[1], K[2], 2.5, 9);
  ctx.save();
  ctx.beginPath();
  faceTrace(ctx, -1);
  ctx.clip();
  stubble(ctx, 0.25, 21);
  ctx.fillStyle = K[1];
  ctx.beginPath();
  ctx.ellipse(-10, -4, 5, 9, 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
  // one brow cocked, eyes half lidded
  eye(ctx, 18, -11, 2.5, '#5a86a8');
  ctx.strokeStyle = '#8a6a30';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(12, -20);
  ctx.quadraticCurveTo(22, -26, 32, -20);
  ctx.stroke();
  // the smirk: one corner of the mouth pulled up
  ctx.strokeStyle = 'rgba(90,40,30,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(18, 15);
  ctx.quadraticCurveTo(26, 15, 32, 10);
  ctx.moveTo(30, 2);
  ctx.lineTo(27, 3);
  ctx.stroke();
  // blond hair, short and spiked up
  p.part(
    () => {
      ctx.moveTo(-24, -10);
      ctx.bezierCurveTo(-30, -30, -20, -44, -8, -48);
      ctx.lineTo(-12, -58);
      ctx.lineTo(-2, -50);
      ctx.lineTo(2, -62);
      ctx.lineTo(8, -50);
      ctx.lineTo(16, -60);
      ctx.lineTo(18, -48);
      ctx.lineTo(28, -54);
      ctx.lineTo(27, -42);
      ctx.bezierCurveTo(33, -36, 33, -28, 31, -24);
      ctx.bezierCurveTo(20, -30, 4, -32, -10, -26);
      ctx.lineTo(-16, -8);
      ctx.closePath();
    },
    '#f4dc84',
    '#c09a3e',
    '#5e4416',
    2.4,
    7
  );
  // goggles pushed up on his forehead: strap around the hair, two tinted lenses
  ctx.strokeStyle = '#1a1714';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-26, -24);
  ctx.quadraticCurveTo(0, -42, 28, -36);
  ctx.stroke();
  p.part(() => rpoly(ctx, [0, -44, 16, -46, 18, -32, 2, -30], 5), '#6a6a6c', '#2c2c2e', '#0e0e10', 2, 4);
  p.part(() => rpoly(ctx, [17, -46, 32, -44, 33, -32, 19, -32], 5), '#6a6a6c', '#2c2c2e', '#0e0e10', 2, 4);
  ctx.fillStyle = '#c87a26';
  ctx.beginPath();
  ctx.ellipse(9, -38, 5, 4.4, 0, 0, TAU);
  ctx.ellipse(25.5, -38.5, 4.6, 4.2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.8)';
  ctx.fillRect(6, -41, 3, 1.6);
  ctx.fillRect(23, -41, 3, 1.6);
  void t;
  ctx.restore();
}

/* ----- weapons ----- */

function lancer(p: Painter, s: State, g: Gear, t: number) {
  const ctx = p.ctx;
  ctx.save();
  ctx.scale(0.8, 0.8);
  const isM = g === s.marcus;
  const boost = isM ? Math.min(1, s.boost) : 0;
  p.part(() => rpoly(ctx, [-82, -10, -24, -20, -14, 10, -72, 24, -84, 18], 5), GUN[0], GUN[1], GUN[2], 2, 6);
  p.part(() => rpoly(ctx, [-28, -26, 40, -30, 120, -26, 198, -15, 200, -1, 120, 4, 88, 12, -24, 12], 6), GUN[0], GUN[1], GUN[2], 2.5, 8);
  p.part(() => rpoly(ctx, [-8, -40, 64, -40, 68, -28, -10, -28], 3), GUN[0], GUN[1], GUN[2], 2, 4);
  p.part(() => rpoly(ctx, [30, 8, 56, 8, 62, 48, 38, 50], 4), GUN[0], GUN[1], GUN[2], 2, 5);
  p.part(() => rpoly(ctx, [-10, 6, 10, 6, 6, 34, -12, 32], 4), GUN[0], GUN[1], GUN[2], 2, 5);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 18, -14, 10, boost > 0 ? '255,120,60' : '255,60,40', 0.8);
  if (boost > 0) {
    // active reload: the whole receiver glows hot
    ctx.strokeStyle = `rgba(255,120,50,${0.7 * boost * (0.75 + 0.25 * Math.sin(t * 12))})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, -21);
    ctx.lineTo(118, -23);
    ctx.lineTo(192, -12);
    ctx.stroke();
    glow(ctx, 90, -10, 70, '255,110,40', 0.25 * boost);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(8,9,12,0.7)';
  for (let i = 0; i < 5; i++) ctx.fillRect(126 + i * 12, -14, 7, 3);
  ctx.strokeStyle = 'rgba(220,230,240,0.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, -21);
  ctx.lineTo(118, -23);
  ctx.lineTo(192, -12);
  ctx.stroke();
  // chainsaw bayonet under the barrel
  const x0 = 90;
  const x1 = 222;
  const y0 = 12;
  const y1 = 36;
  const rev = isM ? s.revK : 0;
  ctx.fillStyle = '#d4d8dc';
  const off = ((isM ? s.chain : 0) * 7) % 11;
  ctx.beginPath();
  for (let x = x0 + off; x < x1 - 10; x += 11) {
    ctx.moveTo(x, y1 - 2);
    ctx.lineTo(x + 6, y1 + 7);
    ctx.lineTo(x + 8, y1 - 1);
    ctx.moveTo(x, y0 + 2);
    ctx.lineTo(x + 6, y0 - 7);
    ctx.lineTo(x + 8, y0 + 3);
  }
  ctx.fill();
  p.part(
    () => {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - 14, y0 + 2);
      ctx.quadraticCurveTo(x1 + 8, (y0 + y1) / 2, x1 - 14, y1);
      ctx.lineTo(x0, y1);
      ctx.closePath();
    },
    '#d6dbe0',
    '#7b8189',
    '#3a3e44',
    2,
    6
  );
  line(p, 'rgba(30,32,36,0.8)', 1.6, () => {
    ctx.moveTo(x0 + 6, (y0 + y1) / 2);
    ctx.lineTo(x1 - 16, (y0 + y1) / 2);
  });
  p.part(() => rpoly(ctx, [x0 - 30, y0 - 8, x0 + 8, y0 - 8, x0 + 10, y1 + 8, x0 - 26, y1 + 6], 5), GUN[0], GUN[1], GUN[2], 2, 5);
  if (rev > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,230,200,${(0.25 * rev).toFixed(3)})`;
    ctx.fillRect(x0, y1 - 3 + Math.sin(t * 90) * 1.5, x1 - x0 - 8, 8);
    ctx.fillRect(x0, y0 - 6 + Math.cos(t * 90) * 1.5, x1 - x0 - 8, 8);
    glow(ctx, x1 - 8, (y0 + y1) / 2, 80 * rev, '255,170,80', 0.7 * rev);
    glow(ctx, x1 - 4, (y0 + y1) / 2, 22 * rev, '255,250,220', 0.9 * rev);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Gnasher: Dom's blocky pump shotgun with its squared-off muzzle */
function gnasherGun(p: Painter) {
  const ctx = p.ctx;
  p.part(() => rpoly(ctx, [-70, -8, -18, -14, -12, 8, -62, 20, -72, 14], 5), GUN[0], GUN[1], GUN[2], 2, 6);
  p.part(() => rpoly(ctx, [-22, -22, 62, -24, 72, -14, 72, 8, -20, 10], 6), GUN[0], GUN[1], GUN[2], 2.5, 8);
  p.part(() => rpoly(ctx, [62, -20, 140, -18, 146, -12, 146, 2, 62, 4], 4), GUN[0], GUN[1], GUN[2], 2.2, 6);
  p.part(() => rpoly(ctx, [134, -26, 154, -26, 154, 8, 134, 8], 3), GUN[0], GUN[1], GUN[2], 2, 5);
  p.part(() => rpoly(ctx, [66, 4, 120, 4, 122, 20, 64, 20], 4), '#5a5048', '#2c2622', '#100d0b', 2, 5);
  p.part(() => rpoly(ctx, [-8, 6, 10, 6, 6, 30, -12, 28], 4), GUN[0], GUN[1], GUN[2], 2, 5);
  ctx.fillStyle = 'rgba(8,9,12,0.7)';
  for (let i = 0; i < 4; i++) ctx.fillRect(72 + i * 11, 8, 6, 9);
  ctx.fillRect(138, -16, 12, 4);
  ctx.strokeStyle = 'rgba(220,230,240,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, -17);
  ctx.lineTo(60, -19);
  ctx.lineTo(140, -15);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 30, -14, 8, '80,180,255', 0.7);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- the Locust ---------- */

function drawEnemy(p: Painter, e: Enemy, s: State, t: number) {
  const ctx = p.ctx;
  const S = eScale(e);
  const boomer = e.kind === 'boomer';
  const H = boomer ? 380 : 330;
  ctx.save();
  ctx.globalAlpha = e.fade;
  if (e.state !== 'rise') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(e.x, zy(e.z) + 2, (boomer ? 110 : 80) * S, 10 * S, 0, 0, TAU);
    ctx.fill();
  }
  const shakeX = e.hit * Math.sin(t * 90) * 4 * S;
  ctx.translate(e.x + shakeX, zy(e.z) + (1 - e.rise) * H * S);
  // knocked back off its feet when killed
  if (e.state === 'dead') {
    const f = easeOutCubic(e.fall);
    ctx.translate(30 * f * S, 0);
    ctx.rotate(f * 1.35);
    ctx.translate(0, -f * 26 * S);
  } else if (e.state === 'sawed') ctx.rotate(0.12 + Math.sin(t * 50) * 0.03);
  ctx.scale(-S, S);
  p.lx = -0.62;
  p.ly = -0.78;
  p.back = 'rgba(255,140,70,0.5)';
  p.bx = -0.85;
  p.by = 0.3;
  p.backW = 2.2;
  p.outline = 'rgba(10,6,4,0.92)';
  p.outlineW = 1.7;
  if (boomer) drawBoomer(p, e, t);
  else drawDrone(p, e, t);
  ctx.restore();
  p.outline = '';
  p.back = '';
  ctx.globalAlpha = 1;
  void s;
}

function enemyLeg(p: Painter, hx: number, hy: number, fx: number, fy: number, back: boolean, thick: number) {
  const ctx = p.ctx;
  const A = back ? LOC_ARMOR_D : LOC_ARMOR;
  const K = back ? LOC_PANTS_D : LOC_PANTS;
  const l1 = 66 * thick;
  const l2 = 62 * thick;
  const [kx, ky] = ik(hx, hy, fx, fy - 14, l1, l2, -1);
  p.part(() => capsule(ctx, hx, hy, kx, ky, 24 * thick, 18 * thick), K[0], K[1], K[2]);
  p.part(() => capsule(ctx, kx, ky, fx, fy - 14, 19 * thick, 15 * thick), A[0], A[1], A[2]);
  ctx.save();
  ctx.translate(kx, ky);
  p.part(() => rpoly(ctx, [-14, -16, 16, -18, 22, 4, 10, 18, -14, 14], 7), A[0], A[1], A[2], 2.4, 6);
  ctx.restore();
  p.part(() => rpoly(ctx, [fx - 22, fy - 22, fx + 18, fy - 22, fx + 38, fy - 6, fx + 40, fy + 2, fx - 24, fy + 2], 6), '#4a3e34', '#221a15', '#0c0907', 2, 5);
}

function drawDrone(p: Painter, e: Enemy, t: number) {
  const ctx = p.ctx;
  const walk = e.state === 'walk' ? 1 : 0;
  const ph = e.walkPh;
  const PY = -114 - Math.abs(Math.sin(ph)) * 6 * walk;
  enemyLeg(p, -16, PY + 4, -34 + Math.cos(ph) * 36 * walk, -Math.max(0, Math.sin(ph)) * 22 * walk, true, 1);
  ctx.save();
  ctx.translate(0, PY + 4);
  ctx.rotate(0.1);
  droneUpper(p, e, t);
  ctx.restore();
  enemyLeg(p, 18, PY + 6, 36 + Math.cos(ph + Math.PI) * 36 * walk, -Math.max(0, Math.sin(ph + Math.PI)) * 22 * walk, false, 1);
}

function droneUpper(p: Painter, e: Enemy, t: number) {
  const ctx = p.ctx;
  const b = Math.sin(t * 2.4 + e.seed) * 2;
  const roar = Math.max(e.roar, e.hit * 0.6);
  p.part(() => capsule(ctx, -26, -132 + b, -6, -76 + b, 16, 13), LOC_SKIN_D[0], LOC_SKIN_D[1], LOC_SKIN_D[2]);
  p.part(() => capsule(ctx, -6, -76 + b, 44, -88 + b, 14, 12), LOC_ARMOR_D[0], LOC_ARMOR_D[1], LOC_ARMOR_D[2]);
  p.part(() => rpoly(ctx, [-44, 0, -52, -120, -20, -168, 46, -170, 74, -120, 46, 0], 16, 0), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2], 2.5, 10);
  p.part(() => rpoly(ctx, [-48, -40, -58, -118, -40, -160, 6, -172, 56, -162, 80, -128, 70, -78, 44, -46, -6, -34], 12, b), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2], 3, 12);
  p.part(() => rpoly(ctx, [6, -158, 54, -150, 74, -122, 66, -90, 40, -76, 14, -86], 8, b), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2], 2.5, 8);
  p.part(() => rpoly(ctx, [-44, -34, 44, -40, 40, 6, 10, 14, -40, 8], 6, 0), LOC_ARMOR_D[0], LOC_ARMOR_D[1], LOC_ARMOR_D[2], 2, 6);
  line(p, 'rgba(0,0,0,0.55)', 2, () => {
    ctx.moveTo(-50, -100 + b);
    ctx.quadraticCurveTo(-10, -88 + b, 14, -100 + b);
    ctx.moveTo(-44, -66 + b);
    ctx.quadraticCurveTo(0, -54 + b, 50, -66 + b);
    ctx.moveTo(-36, -14);
    ctx.lineTo(36, -18);
  });
  line(p, 'rgba(232,200,160,0.4)', 2.2, () => {
    ctx.moveTo(-36, -152 + b);
    ctx.quadraticCurveTo(-8, -170 + b, 30, -166 + b);
  });
  ctx.fillStyle = LOC_ARMOR[2];
  for (let i = 0; i < 4; i++) {
    const x = -34 + i * 16;
    const y = -164 - i * 2 + b;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 4);
    ctx.lineTo(x - 2, y - 10 - (i % 2) * 4);
    ctx.lineTo(x + 6, y + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.translate(52, -186 + b);
  ctx.rotate(-0.06 + roar * 0.12);
  locustHead(p, roar, 1);
  ctx.restore();
  p.part(() => rpoly(ctx, [-36, -112, -44, -150, -14, -176, 28, -170, 44, -140, 30, -108, -4, -100], 12, b), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2], 3, 9);
  line(p, 'rgba(0,0,0,0.5)', 2, () => {
    ctx.moveTo(-38, -132 + b);
    ctx.quadraticCurveTo(0, -122 + b, 40, -132 + b);
  });
  p.part(() => capsule(ctx, 4, -130 + b, 36, -72 + b, 18, 15), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2]);
  p.part(() => capsule(ctx, 36, -72 + b, 82, -94 + b, 16, 13), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2]);
  ctx.save();
  ctx.translate(72, -98 + b);
  ctx.rotate(-0.1 - (e.state === 'sawed' ? 0.6 : 0));
  hammerburst(p, e.flash);
  ctx.restore();
  p.part(() => ctx.ellipse(76, -94 + b, 13, 11, 0, 0, TAU), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2], 2, 4);
}

/** Broad, bald and pale Locust head; `big` scales the jaw for the Boomer */
function locustHead(p: Painter, roar: number, big: number) {
  const ctx = p.ctx;
  p.part(() => capsule(ctx, -30, 22, -6, 10, 22, 18), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2]);
  const J = big;
  const skull = () => {
    ctx.moveTo(-30, 10);
    ctx.bezierCurveTo(-38, -16, -22, -40, 2, -40);
    ctx.bezierCurveTo(22, -40, 36, -28, 38, -12);
    ctx.lineTo(44, -6);
    ctx.lineTo(40, 2);
    ctx.lineTo(42 + (J - 1) * 10, 10);
    ctx.bezierCurveTo(42 + (J - 1) * 14, 20 * J + roar * 10, 32, 30 * J + roar * 10, 16, 30 * J + roar * 8);
    ctx.bezierCurveTo(0, 30 * J, -20, 26, -30, 10);
    ctx.closePath();
  };
  p.part(skull, LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2], 3, 9);
  ctx.save();
  ctx.beginPath();
  skull();
  ctx.clip();
  ctx.fillStyle = 'rgba(90,80,64,0.35)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(-24 + hash(i + 30) * 50, -34 + hash(i + 60) * 30, 3 + hash(i + 90) * 4, 2 + hash(i + 120) * 2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(70,60,50,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, -30);
  ctx.quadraticCurveTo(0, -42, 20, -34);
  ctx.moveTo(-26, -14);
  ctx.quadraticCurveTo(-8, -24, 12, -20);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#2a221b';
  ctx.beginPath();
  ctx.ellipse(24, -10, 9 / J, 6 / J, 0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#efe2c4';
  ctx.beginPath();
  ctx.arc(27, -9, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,22,0.95)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.quadraticCurveTo(26, -22, 38, -14);
  ctx.stroke();
  ctx.fillStyle = '#3a2e25';
  ctx.fillRect(38, -2, 4, 2);
  ctx.fillStyle = '#2a0e0a';
  ctx.beginPath();
  ctx.moveTo(18, 12);
  ctx.lineTo(42 + (J - 1) * 10, 10);
  ctx.lineTo(38, 18 * J + roar * 10);
  ctx.lineTo(18, 20 * J + roar * 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe6cf';
  for (let i = 0; i < 4; i++) {
    const x = 21 + i * 5;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x + 2, 16 + roar * 2);
    ctx.lineTo(x + 4, 12);
    ctx.fill();
  }
}

function hammerburst(p: Painter, flash: number) {
  const ctx = p.ctx;
  p.part(() => rpoly(ctx, [-56, -8, -14, -14, -10, 10, -50, 16], 4), GUN[0], GUN[1], GUN[2], 2, 5);
  p.part(() => rpoly(ctx, [-18, -18, 70, -20, 104, -12, 106, 0, 70, 6, -16, 10], 4), '#7d6a58', '#3b3029', '#15100d', 2.5, 7);
  p.part(() => rpoly(ctx, [10, 6, 30, 6, 36, 40, 18, 44], 4), GUN[0], GUN[1], GUN[2], 2, 4);
  ctx.fillStyle = '#15100d';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(40 + i * 14, -19);
    ctx.lineTo(46 + i * 14, -28);
    ctx.lineTo(50 + i * 14, -19);
    ctx.fill();
  }
  ctx.fillRect(100, -6, 8, 4);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, -6, 9, '255,120,40', 0.7);
  if (flash > 0.05) {
    ctx.fillStyle = `rgba(255,170,80,${0.8 * flash})`;
    ctx.beginPath();
    ctx.moveTo(106, -10);
    ctx.lineTo(160 + Math.random() * 30, -4);
    ctx.lineTo(106, 2);
    ctx.lineTo(118, 16);
    ctx.lineTo(112, -4);
    ctx.lineTo(118, -22);
    ctx.closePath();
    ctx.fill();
    glow(ctx, 110, -4, 46, '255,190,110', flash);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Boomer: a hulking, bare-chested Locust with a Boomshot launcher at the hip */
function drawBoomer(p: Painter, e: Enemy, t: number) {
  const ctx = p.ctx;
  const walk = e.state === 'walk' ? 1 : 0;
  const ph = e.walkPh;
  const PY = -150 - Math.abs(Math.sin(ph)) * 6 * walk;
  const b = Math.sin(t * 1.8 + e.seed) * 2.5;
  const roar = Math.max(e.roar, e.hit * 0.5);
  enemyLeg(p, -24, PY + 6, -52 + Math.cos(ph) * 34 * walk, -Math.max(0, Math.sin(ph)) * 20 * walk, true, 1.25);
  ctx.save();
  ctx.translate(0, PY);
  // far arm to the rear grip of the launcher
  const a = -0.08 - e.raise * 0.42;
  const gx = 40;
  const gy = -232 - PY;
  p.part(() => capsule(ctx, -40, -170 + b, gx - 10, gy + 4, 26, 20), LOC_SKIN_D[0], LOC_SKIN_D[1], LOC_SKIN_D[2]);
  // hunched barrel of a torso, shoulders above the head
  p.part(() => rpoly(ctx, [-62, 10, -88, -90, -76, -170, -24, -214, 54, -210, 104, -168, 110, -96, 82, -10, 0, 16], 26, b), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2], 3.5, 16);
  // pectoral and belly folds
  line(p, 'rgba(70,60,50,0.55)', 2.4, () => {
    ctx.moveTo(20, -150 + b);
    ctx.quadraticCurveTo(70, -140 + b, 96, -110 + b);
    ctx.moveTo(10, -90 + b);
    ctx.quadraticCurveTo(60, -80 + b, 98, -60 + b);
    ctx.moveTo(-30, -40);
    ctx.quadraticCurveTo(30, -30, 86, -34);
  });
  // armour: a back plate over the far shoulder and crossed straps over the chest
  p.part(() => rpoly(ctx, [-90, -110, -96, -176, -52, -222, 16, -224, -8, -168, -50, -120], 14, b), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2], 3, 10);
  p.part(() => rpoly(ctx, [-50, -196, -30, -206, 104, -60, 88, -46], 4, b), LOC_ARMOR_D[0], LOC_ARMOR_D[1], LOC_ARMOR_D[2], 2, 4);
  p.part(() => rpoly(ctx, [-70, 0, 92, -8, 96, 30, 60, 52, -40, 54, -76, 30], 8), LOC_ARMOR[0], LOC_ARMOR[1], LOC_ARMOR[2], 2.6, 8);
  ctx.fillStyle = LOC_ARMOR[2];
  for (let i = 0; i < 5; i++) {
    const x = -70 + i * 22;
    const y = -196 - i * 5 + b;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 6);
    ctx.lineTo(x - 2, y - 14 - (i % 2) * 6);
    ctx.lineTo(x + 8, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  // a small head sunk low between the shoulders, all jaw
  ctx.save();
  ctx.translate(92, -172 + b);
  ctx.rotate(-0.12 + roar * 0.2 - e.raise * 0.1);
  ctx.scale(0.86, 0.86);
  locustHead(p, roar * 1.4, 1.35);
  ctx.restore();
  // near arm, a slab of muscle, cradling the Boomshot
  p.part(() => capsule(ctx, 40, -176 + b, 84, -120 + b, 32, 26), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2]);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(a);
  boomshot(p, e.flash);
  ctx.restore();
  const hx = gx + Math.cos(a) * 92 - Math.sin(a) * 14;
  const hy = gy + Math.sin(a) * 92 + Math.cos(a) * 14;
  p.part(() => capsule(ctx, 84, -120 + b, hx, hy, 24, 18), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2]);
  p.part(() => ctx.ellipse(hx, hy, 17, 15, 0, 0, TAU), LOC_SKIN[0], LOC_SKIN[1], LOC_SKIN[2], 2, 4);
  ctx.restore();
  enemyLeg(p, 26, PY + 8, 50 + Math.cos(ph + Math.PI) * 34 * walk, -Math.max(0, Math.sin(ph + Math.PI)) * 20 * walk, false, 1.25);
}

function boomshot(p: Painter, flash: number) {
  const ctx = p.ctx;
  // a fat iron tube with a flared muzzle ring and glowing vents
  p.part(() => rpoly(ctx, [-50, -20, 180, -26, 186, 26, -50, 22], 10), '#7d6a58', '#3b3029', '#15100d', 3, 10);
  p.part(() => rpoly(ctx, [-60, -16, -40, -24, -36, 22, -60, 18], 5), GUN[0], GUN[1], GUN[2], 2, 4);
  p.part(() => ctx.ellipse(196, 0, 14, 38, 0, 0, TAU), '#8d7864', '#41352c', '#17110d', 2.5, 7);
  p.part(() => rpoly(ctx, [60, 22, 92, 22, 98, 54, 70, 56], 5), GUN[0], GUN[1], GUN[2], 2, 4);
  ctx.fillStyle = '#100b08';
  ctx.beginPath();
  ctx.ellipse(200, 0, 7, 22, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) glow(ctx, 30 + i * 40, -18, 12, '255,120,40', 0.6);
  if (flash > 0.05) glow(ctx, 210, 0, 90, '255,170,90', flash);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- effects ---------- */

function drawGrenades(ctx: CanvasRenderingContext2D, s: State, t: number) {
  for (const gr of s.grenades) {
    if (!gr.on) continue;
    ctx.save();
    ctx.translate(gr.x, gr.y);
    ctx.rotate(t * 12);
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 9, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, gr.x, gr.y, 30, '255,130,50', 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, s: State, t: number) {
  // smoke, dust, blood mist and debris first (normal blending)
  for (const p of s.sparks.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 3 || p.kind === 8) {
      ctx.globalAlpha = k * (p.kind === 8 ? 0.55 : 0.4);
      ctx.fillStyle = p.kind === 8 ? '#2a2420' : '#6e5a4a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.8 - k * 0.8), 0, TAU);
      ctx.fill();
    } else if (p.kind === 6) {
      ctx.globalAlpha = k * 0.4;
      ctx.fillStyle = '#5e0e0a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2 - k), 0, TAU);
      ctx.fill();
    } else if (p.kind === 4) {
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = '#8c1812';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (p.kind === 5) {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = '#2e2622';
      ctx.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // light thrown about by the guns
  for (const g of s.gears) if (g.flash > 0.05) glow(ctx, g.mx, g.my, 200 * zk(g.z), '255,170,80', 0.3 * g.flash);
  if (s.mode === 'saw' || s.revK > 0.2) glow(ctx, sawX, sawY, 160, '255,160,80', 0.3 * Math.max(s.revK, s.mode === 'saw' ? 1 : 0));
  for (const e of s.enemies) if (e.on && e.flash > 0.05) glow(ctx, e.mx, e.my, 160 * zk(e.z), '255,150,70', 0.3 * e.flash);
  if (s.boom > 0.01) glow(ctx, s.boomX, s.boomY, 420, '255,140,60', 0.5 * s.boom);
  tracers(ctx, s, -1);
  // sparks and fireballs
  for (const p of s.sparks.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 0 || p.kind === 1) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.kind === 0 ? '#fff0c0' : '#ffa050';
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    } else if (p.kind === 7) {
      ctx.globalAlpha = 1;
      glow(ctx, p.x, p.y, p.size * (2.4 - k), k > 0.5 ? '255,200,120' : '255,110,40', 0.9 * k);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // brass casings and shotgun shells
  for (const b of s.brass.items) {
    if (b.life <= 0) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.size, b.size);
    ctx.globalAlpha = Math.min(1, b.life * 2);
    ctx.fillStyle = b.kind === 1 ? '#b0281c' : '#d8a84a';
    ctx.fillRect(-5, -2, 10, 4);
    ctx.fillStyle = b.kind === 1 ? '#e0b860' : '#fff0b0';
    ctx.fillRect(b.kind === 1 ? 2 : -5, -2, b.kind === 1 ? 3 : 10, b.kind === 1 ? 4 : 1.3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  void t;
}

function muzzle(ctx: CanvasRenderingContext2D, g: Gear) {
  if (g.flash <= 0.05) return;
  const f = g.flash;
  const S = zk(g.z) * g.size;
  const big = g.look.gun === 'gnasher' ? 1.5 : 1;
  ctx.save();
  ctx.translate(g.mx, g.my);
  ctx.rotate(g.aim);
  ctx.scale(S * big, S * big);
  const Lf = 80 + Math.random() * 40;
  const W = 13 + Math.random() * 6;
  ctx.fillStyle = `rgba(255,150,60,${0.6 * f})`;
  ctx.beginPath();
  ctx.moveTo(-4, -W);
  ctx.lineTo(Lf, 0);
  ctx.lineTo(-4, W);
  ctx.lineTo(22, W * 2.4);
  ctx.lineTo(8, 0);
  ctx.lineTo(22, -W * 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255,240,200,${0.95 * f})`;
  ctx.beginPath();
  ctx.moveTo(0, -W * 0.45);
  ctx.lineTo(Lf * 0.6, 0);
  ctx.lineTo(0, W * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(ctx, g.mx, g.my, 30 * S * big, '255,240,200', 0.8 * f);
}

function tracers(ctx: CanvasRenderingContext2D, s: State, who: number) {
  ctx.lineCap = 'round';
  for (const tr of s.tracers) {
    if (tr.on <= 0 || tr.who !== who) continue;
    const k = tr.on / tr.max;
    const col = tr.kind === 1 ? '255,90,50' : tr.kind === 2 ? '255,130,60' : '255,190,100';
    ctx.strokeStyle = `rgba(${col},${0.35 * k})`;
    ctx.lineWidth = tr.kind === 1 ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(lerp(tr.x0, tr.x1, 0.12), lerp(tr.y0, tr.y1, 0.12));
    ctx.lineTo(tr.x1, tr.y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,245,220,${0.9 * k})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

/** A red target marker where the squad was told to fire */
function drawMark(ctx: CanvasRenderingContext2D, s: State, t: number) {
  if (s.markOn <= 0.01) return;
  const k = s.markOn;
  const r = 22 + (1 - k) * 12;
  ctx.save();
  ctx.translate(s.markX, s.markY);
  ctx.rotate(t * 1.5);
  ctx.strokeStyle = `rgba(220,50,40,${0.85 * k})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
    ctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
    ctx.stroke();
  }
  ctx.restore();
}

/** Weapon panel, top left: Lancer outline, ammo and the active reload bar */
function drawHud(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number) {
  if (!env.interactive) {
    s.hud.w = 0;
    return;
  }
  const hs = clamp(Math.min(env.w / 1100, env.h / 620), 0.6, 1.1);
  const W = 196 * hs;
  const H = 70 * hs;
  const x = 16 * hs;
  const y = 14 * hs;
  s.hud.x = x - 8;
  s.hud.y = y - 8;
  s.hud.w = W + 16;
  s.hud.h = H + 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hs, hs);
  const boost = Math.min(1, s.boost);
  // plate
  ctx.fillStyle = 'rgba(8,10,12,0.5)';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(196, 0);
  ctx.lineTo(182, 70);
  ctx.lineTo(0, 70);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = boost > 0 ? `rgba(255,120,60,${0.5 + 0.4 * boost})` : 'rgba(200,210,220,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Lancer silhouette
  ctx.save();
  ctx.translate(30, 26);
  ctx.scale(0.62, 0.62);
  ctx.fillStyle = boost > 0 ? `rgba(255,${170 - boost * 60},${110 - boost * 50},0.95)` : 'rgba(225,230,236,0.9)';
  ctx.beginPath();
  rpoly(ctx, [-40, -6, 10, -14, 10, 8, -30, 16], 3);
  rpoly(ctx, [6, -16, 170, -12, 200, -4, 200, 6, 6, 8], 3);
  rpoly(ctx, [120, 8, 236, 10, 244, 18, 236, 26, 120, 26], 4);
  rpoly(ctx, [60, 6, 80, 6, 84, 30, 64, 30], 2);
  ctx.fill();
  ctx.restore();
  // ammo: twenty ticks of three rounds
  const ticks = 20;
  const full = Math.ceil(s.ammo / (MAG / ticks));
  if (s.reload < 0) {
    for (let i = 0; i < ticks; i++) {
      ctx.fillStyle = i < full ? 'rgba(235,238,242,0.9)' : 'rgba(235,238,242,0.15)';
      ctx.fillRect(22 + i * 7.6, 50, 5, 10);
    }
  } else {
    // active reload bar: hit the white zone, nail the bright notch
    const bx = 22;
    const bw = 150;
    const by = 50;
    ctx.fillStyle = 'rgba(235,238,242,0.18)';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = s.arState === 3 ? 'rgba(200,40,30,0.5)' : 'rgba(235,238,242,0.55)';
    ctx.fillRect(bx + bw * AR_GOOD[0], by, bw * (AR_GOOD[1] - AR_GOOD[0]), 10);
    ctx.fillStyle = s.arState === 3 ? 'rgba(220,60,40,0.8)' : 'rgba(255,255,255,0.98)';
    ctx.fillRect(bx + bw * AR_PERFECT[0], by - 2, bw * (AR_PERFECT[1] - AR_PERFECT[0]), 14);
    const f = s.arState === 0 ? clamp(s.reload / RELOAD_T, 0, 1) : s.arMark;
    ctx.fillStyle = s.arState === 3 ? '#ff4030' : s.arState === 2 ? '#ffb060' : '#ffffff';
    ctx.fillRect(bx + bw * f - 1.5, by - 6, 3, 22);
  }
  ctx.restore();
  if (s.arFlash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x + W * 0.5, y + H * 0.5, W * 0.8, '255,140,60', 0.5 * s.arFlash);
    ctx.globalCompositeOperation = 'source-over';
  }
  void t;
}
