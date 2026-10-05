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
 * Warhammer 40,000: an Ultramarines squad holds the nave of a ruined Imperial cathedral
 * against a Tyranid swarm. A bareheaded Captain in a laurel wreath and red cloak leads three
 * battle brothers in ultramarine plate with gold trim and green lenses, one of them carrying
 * the chapter banner. Hormagaunts pour in from the right with a Tyranid Warrior behind them.
 * Tap to direct bolter fire (mass-reactive shells that burst on impact), hold to rev the
 * Captain's chainsword and charge, B for a battle cry volley and O to call an orbital lance.
 */

/* ---------- world ---------- */

const ZY = 100;
const zy = (z: number) => -z * ZY;
const zk = (z: number) => 1 / (1 + z * 0.32);

const TAP = 0.22;
const ASH = 120;
const MAX_FOES = 14;
const MAX_BOLTS = 48;
const STRIKE_CD = 9;
const CRY_CD = 6;

type Pal = readonly [string, string, string];
type MarineId = 'captain' | 'kneel' | 'brother' | 'bearer';

const BLUE: Pal = ['#5f8fdc', '#1f4a9e', '#0a1a42'];
const BLUE_D: Pal = ['#3e66ad', '#17397c', '#061230'];
const GOLD: Pal = ['#ffe597', '#c9952e', '#5a3c0c'];
const JOINT: Pal = ['#4b4e57', '#1c1e24', '#08090c'];
const BOLT_C: Pal = ['#8c8f96', '#33363c', '#0f1012'];
const RED: Pal = ['#d8483c', '#8c1e18', '#360706'];
const SKIN: Pal = ['#e6b48e', '#a8724f', '#55361f'];
const BONE: Pal = ['#f1e6c8', '#bca988', '#5a4c38'];
const BONE_D: Pal = ['#c4b796', '#8a7b60', '#3a3124'];
const FLESH: Pal = ['#b46ad0', '#62287e', '#24092e'];
const FLESH_D: Pal = ['#8a4fa2', '#481c5c', '#17061e'];
const LENS = '120,255,110';
const SEAM = 'rgba(4,8,20,0.7)';

interface Marine {
  id: MarineId;
  hx: number;
  hz: number;
  size: number;
  x: number;
  z: number;
  lift: number;
  face: 1 | -1;
  aim: number;
  recoil: number;
  flash: number;
  burst: number;
  shotT: number;
  wait: number;
  target: Foe | null;
  tx: number;
  ty: number;
  mx: number;
  my: number;
  seed: number;
  autoT: number;
}

interface Foe {
  on: boolean;
  kind: 'gaunt' | 'warrior';
  state: 'run' | 'stand' | 'dead';
  x: number;
  z: number;
  dx: number;
  speed: number;
  t: number;
  hp: number;
  hit: number;
  ph: number;
  leap: number;
  roar: number;
  fireT: number;
  fall: number;
  fade: number;
  seed: number;
  flash: number;
}

interface Bolt {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  left: number;
  target: Foe | null;
  hit: boolean;
  who: number;
  /** 0 bolt shell, 1 deathspitter glob */
  kind: number;
}

interface State {
  st: Stage;
  bg: HTMLCanvasElement;
  fg: HTMLCanvasElement;
  paint: Painter | null;
  sparks: Pool;
  ash: Pool;
  brass: Pool;
  bolts: Bolt[];
  marines: Marine[];
  cap: Marine;
  foes: Foe[];
  // input
  pressing: boolean;
  keyDown: boolean;
  pressT: number;
  aimX: number;
  aimY: number;
  pointerAim: boolean;
  touched: boolean;
  usedHold: boolean;
  demoT: number;
  demoStep: number;
  // captain
  mode: 'line' | 'out' | 'slash' | 'back';
  modeT: number;
  runD: number;
  rx0: number;
  rz0: number;
  rx1: number;
  rz1: number;
  chargeE: Foe | null;
  rev: boolean;
  revK: number;
  chain: number;
  swing: number;
  swingN: number;
  runPh: number;
  // powers
  strike: number;
  strikeX: number;
  strikeZ: number;
  strikeCd: number;
  scorch: number;
  cry: number;
  cryCd: number;
  // world
  spawnT: number;
  warriorT: number;
  markOn: number;
  markX: number;
  markY: number;
  // feel
  shake: number;
  stop: number;
  white: number;
  camZ: number;
  camX: number;
  camY: number;
  hum: Hum | null;
  btn: { x: number; y: number; r: number; gap: number };
  time: number;
}

/* ---------- stage fit ---------- */

function fit(st: Stage, w: number, h: number) {
  const portrait = w < h * 1.15;
  st.k = Math.max(0.05, portrait ? Math.min(h / 760, w / 1040) : Math.min(h / 700, w / 1360));
  st.ox = w / 2 + (portrait ? 110 * st.k : 0);
  st.oy = portrait ? h * 0.66 : h / 2 + 250 * st.k;
  st.left = -st.ox / st.k;
  st.right = (w - st.ox) / st.k;
  st.top = -st.oy / st.k;
  st.bottom = (h - st.oy) / st.k;
}

const toSX = (st: Stage, x: number) => (x - st.ox) / st.k;
const toSY = (st: Stage, y: number) => (y - st.oy) / st.k;

/* ---------- mount ---------- */

function makeMarine(id: MarineId, hx: number, hz: number, size: number, seed: number): Marine {
  return {
    id,
    hx,
    hz,
    size,
    x: hx,
    z: hz,
    lift: 0,
    face: 1,
    aim: -0.05,
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
    seed,
    autoT: 1 + seed * 0.7,
  };
}

function makeFoe(): Foe {
  return {
    on: false,
    kind: 'gaunt',
    state: 'run',
    x: 0,
    z: 0,
    dx: 0,
    speed: 0,
    t: 0,
    hp: 0,
    hit: 0,
    ph: 0,
    leap: 0,
    roar: 0,
    fireT: 0,
    fall: 0,
    fade: 1,
    seed: 0,
    flash: 0,
  };
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.9,
    init: (env) => {
      const marines = [
        makeMarine('bearer', -575, 0.95, 0.8, 3),
        makeMarine('brother', -440, 0.62, 0.82, 2),
        makeMarine('kneel', -300, 0.32, 0.83, 1),
        makeMarine('captain', -135, 0.04, 0.86, 0),
      ];
      const s: State = {
        st: makeStage(),
        bg: makeLayer(),
        fg: makeLayer(),
        paint: new Painter(env.ctx),
        sparks: new Pool(460),
        ash: new Pool(ASH),
        brass: new Pool(40),
        bolts: Array.from({ length: MAX_BOLTS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, left: 0, target: null, hit: false, who: 0, kind: 0 })),
        marines,
        cap: marines[3],
        foes: Array.from({ length: MAX_FOES }, makeFoe),
        pressing: false,
        keyDown: false,
        pressT: 0,
        aimX: 300,
        aimY: -150,
        pointerAim: false,
        touched: false,
        usedHold: false,
        demoT: 0,
        demoStep: 0,
        mode: 'line',
        modeT: 0,
        runD: 1,
        rx0: 0,
        rz0: 0,
        rx1: 0,
        rz1: 0,
        chargeE: null,
        rev: false,
        revK: 0,
        chain: 0,
        swing: 0,
        swingN: 0,
        runPh: 0,
        strike: -1,
        strikeX: 0,
        strikeZ: 0,
        strikeCd: 0,
        scorch: 0,
        cry: 0,
        cryCd: 0,
        spawnT: 0.5,
        warriorT: 0,
        markOn: 0,
        markX: 0,
        markY: 0,
        shake: 0,
        stop: 0,
        white: 0,
        camZ: 1,
        camX: 0,
        camY: -200,
        hum: null,
        btn: { x: 0, y: 0, r: 0, gap: 0 },
        time: 0,
      };
      // the swarm is already in the nave
      const seeds: [number, number, number][] = [
        [250, 0.35, 0.2],
        [380, 0.9, 0.6],
        [470, 0.25, 1.4],
        [560, 1.3, 2.2],
        [640, 0.6, 2.9],
      ];
      for (const [x, z, ph] of seeds) {
        const f = spawnFoe(s, 'gaunt', x, z);
        if (f) f.ph = ph;
      }
      const w = spawnFoe(s, 'warrior', 520, 1.7);
      if (w) {
        w.dx = 470;
        w.state = 'stand';
        w.fireT = 2.2;
      }
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
        if (s.rev && s.revK > 0.45 && !s.usedHold && s.mode === 'line') {
          s.usedHold = true;
          startCharge(s, env);
        }
      }
      if (rm && env.interactive && s.touched && (s.pressing || s.keyDown || s.mode !== 'line' || s.strike >= 0 || s.cry > 0)) env.wake(400);
      updateCaptain(s, env, dt);
      updateMarines(s, env, dt, t);
      updateFoes(s, env, dt);
      updateBolts(s, env, dt);
      updateStrike(s, env, dt);
      s.sparks.step(dt, () => 12);
      s.brass.step(dt, () => 8);
      for (const p of s.ash.items) if (p.life <= 0 || p.y > 30 || p.y < s.st.top - 60) spawnAsh(s, false);
      s.ash.step(dt);
      s.shake = Math.max(0, s.shake - dtRaw * 2.6);
      s.white = Math.max(0, s.white - dtRaw * 2.2);
      s.markOn = Math.max(0, s.markOn - dtRaw * 1.8);
      s.scorch = Math.max(0, s.scorch - dtRaw * 0.12);
      s.strikeCd = Math.max(0, s.strikeCd - dt);
      s.cryCd = Math.max(0, s.cryCd - dt);
      s.cry = Math.max(0, s.cry - dt * 0.7);
      const close = s.mode === 'slash' && !rm;
      s.camZ = damp(s.camZ, close ? 1.22 : 1, close ? 4 : 2.5, dtRaw);
      if (s.mode !== 'line') {
        s.camX = damp(s.camX, s.cap.x + 80, 6, dtRaw);
        s.camY = damp(s.camY, zy(s.cap.z) - 200 * zk(s.cap.z), 6, dtRaw);
      }
      if (s.hum) {
        const grind = s.mode === 'slash' ? 1 : 0;
        shapeHum(s.hum, 60 + s.revK * 80 + grind * 20 + Math.sin(t * 38) * 3, 800 + s.revK * 2400 + grind * 800, 0.04 + s.revK * 0.05 + grind * 0.03, 2.02);
      }
    },
    draw: (s, env, t) => drawScene(s, env, t),
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      const b = s.btn;
      if (b.r > 0) {
        if (Math.hypot(x - b.x, y - b.y) < b.r * 1.15) {
          callStrike(s, env);
          return;
        }
        if (Math.hypot(x - (b.x + b.gap), y - b.y) < b.r * 1.15) {
          battleCry(s, env);
          return;
        }
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
      const k = e.key.toLowerCase();
      if (k === 'o' || k === 'b') {
        s.touched = true;
        if (down && !e.repeat) {
          if (k === 'o') callStrike(s, env);
          else battleCry(s, env);
          env.wake(3000);
        }
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

/* ---------- input and orders ---------- */

function release(s: State, env: SceneEnv) {
  if (s.pressing || s.keyDown) return;
  if (s.rev) {
    if (s.mode === 'line') stopRev(s, env);
  } else if (s.pressT <= TAP + 0.001) command(s, env);
  s.pressT = 0;
}

/** Focus fire: every bolter in the squad on the chosen xenos */
function command(s: State, env: SceneEnv) {
  const target = s.pointerAim ? nearestFoe(s, s.aimX, s.aimY, 260) : nearestFoe(s, -100, -100, 9999);
  let tx = s.aimX;
  let ty = s.aimY;
  if (target) [tx, ty] = foePoint(target);
  else if (!s.pointerAim) {
    tx = 300;
    ty = -150;
  }
  s.markOn = 1;
  s.markX = tx;
  s.markY = ty;
  const order = [0.2, 0.12, 0.05, 0];
  s.marines.forEach((m, i) => {
    if (m === s.cap && s.mode !== 'line') return;
    m.target = target;
    m.tx = tx;
    m.ty = ty;
    m.wait = order[i] + rand(0, 0.05);
    m.burst = m.id === 'captain' || m.id === 'bearer' ? 3 : 6;
    m.shotT = 0;
    m.autoT = 2.5;
  });
  const bus = env.audio();
  if (bus) tone(bus, 440, { type: 'square', attack: 0.004, decay: 0.05, gain: 0.02 });
}

function startRev(s: State, env: SceneEnv) {
  s.rev = true;
  const bus = env.audio();
  if (bus && !s.hum) {
    s.hum = startHum(bus, { type: 'sawtooth', freq: 60, ratio: 2.02, noise: 0.45, filter: 800, q: 2, gain: 0.05, attack: 0.05 });
    noise(bus, { duration: 0.25, gain: 0.08, freq: 320, q: 1, type: 'lowpass' });
  }
}

function stopRev(s: State, env: SceneEnv) {
  s.rev = false;
  if (s.hum) {
    shapeHum(s.hum, 50, 400, 0.03, 2.02);
    stopHum(s.hum, 0.18);
    s.hum = null;
  }
  const bus = env.audio();
  if (bus) tone(bus, 110, { type: 'sawtooth', attack: 0.01, decay: 0.4, gain: 0.03, glideTo: 45 });
}

/** The Captain leaps from the line into the nearest xenos with the chainsword howling */
function startCharge(s: State, env: SceneEnv) {
  const c = s.cap;
  const ax = s.pointerAim ? s.aimX : c.x;
  const ay = s.pointerAim ? s.aimY : -100;
  let best: Foe | null = null;
  let bd = Infinity;
  for (const f of s.foes) {
    if (!alive(f)) continue;
    const [fx, fy] = foePoint(f);
    const d = Math.hypot(fx - ax, fy - ay) + (f.kind === 'warrior' ? 120 : 0);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  if (!best) return;
  s.chargeE = best;
  s.mode = 'out';
  s.modeT = 0;
  s.rx0 = c.x;
  s.rz0 = c.z;
  s.rz1 = Math.max(0, best.z - 0.03);
  s.rx1 = Math.min(best.x, 520) - (best.kind === 'warrior' ? 150 : 120) * zk(s.rz1) * c.size;
  s.runD = 0.45 + Math.hypot(s.rx1 - s.rx0, (s.rz1 - s.rz0) * ZY) / 900;
  c.burst = 0;
  if (best.state === 'run') best.speed *= 0.3;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.1, freq: 400, q: 0.7, type: 'lowpass' });
    tone(bus, 90, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.12, glideTo: 50 });
  }
}

/** Orbital lance: a strike cruiser in low orbit answers the vox */
function callStrike(s: State, env: SceneEnv) {
  if (s.strike >= 0 || s.strikeCd > 0) return;
  // aim at the thickest part of the swarm
  let bx = 380;
  let bz = 0.8;
  let best = -1;
  for (const f of s.foes) {
    if (!alive(f)) continue;
    let n = 0;
    for (const o of s.foes) if (alive(o) && Math.hypot(o.x - f.x, (o.z - f.z) * 200) < 240) n++;
    if (f.x > 120 && n > best) {
      best = n;
      bx = f.x;
      bz = f.z;
    }
  }
  s.strike = 0;
  s.strikeX = clamp(bx, 160, 470);
  s.strikeZ = clamp(bz, 0.3, 1.6);
  s.strikeCd = STRIKE_CD;
  const bus = env.audio();
  if (bus) {
    tone(bus, 880, { type: 'square', attack: 0.004, decay: 0.08, gain: 0.03 });
    tone(bus, 880, { type: 'square', attack: 0.004, decay: 0.08, gain: 0.03, delay: 0.16 });
    tone(bus, 220, { type: 'sawtooth', attack: 0.6, decay: 0.4, gain: 0.04, glideTo: 880 });
  }
}

/** "Courage and honour": weapons raised, then a disciplined volley at separate targets */
function battleCry(s: State, env: SceneEnv) {
  if (s.cryCd > 0) return;
  s.cry = 1;
  s.cryCd = CRY_CD;
  const live = s.foes.filter(alive).sort((a, b) => a.x - b.x);
  s.marines.forEach((m, i) => {
    if (m === s.cap && s.mode !== 'line') return;
    const f = live[i % Math.max(1, live.length)] ?? null;
    m.target = f;
    if (f) [m.tx, m.ty] = foePoint(f);
    m.wait = 0.55 + i * 0.04;
    m.burst = m.id === 'captain' || m.id === 'bearer' ? 4 : 8;
    m.autoT = 3;
  });
  const bus = env.audio();
  if (bus) {
    for (const [f, d] of [
      [110, 0],
      [138.6, 0.02],
      [165, 0.04],
      [220, 0.06],
    ] as const)
      tone(bus, f, { type: 'sawtooth', attack: 0.08, decay: 0.9, gain: 0.035, delay: d });
    noise(bus, { duration: 0.6, gain: 0.06, freq: 300, q: 1.2 });
  }
}

function runDemo(s: State, env: SceneEnv, dt: number) {
  s.demoT += dt;
  const T = s.demoT % 13;
  if (T < 0.1 && s.demoStep > 4) s.demoStep = 0;
  s.pointerAim = false;
  const at = (step: number, time: number) => s.demoStep === step && T > time;
  if (at(0, 0.4)) {
    s.demoStep = 1;
    command(s, env);
  }
  if (at(1, 2.0)) {
    s.demoStep = 2;
    command(s, env);
  }
  if (at(2, 4.4)) {
    s.demoStep = 3;
    startRev(s, env);
    startCharge(s, env);
  }
  if (at(3, 7.4)) {
    s.demoStep = 4;
    if (s.mode === 'line') stopRev(s, env);
    callStrike(s, env);
  }
  if (at(4, 10.4)) {
    s.demoStep = 5;
    battleCry(s, env);
  }
}

/* ---------- simulation ---------- */

function spawnAsh(s: State, anywhere: boolean) {
  const st = s.st;
  const ember = Math.random() < 0.3;
  const x = rand(st.left - 40, st.right + 40);
  const y = anywhere ? rand(st.top, 20) : ember ? rand(-40, 20) : st.top - rand(0, 40);
  const p = s.ash.spawn(x, y, rand(-10, 10), ember ? rand(-50, -20) : rand(14, 30), rand(8, 16), ember ? rand(1.2, 2.4) : rand(1, 2.6), ember ? 1 : 0);
  p.rot = rand(0, TAU);
  p.vr = rand(-2, 2);
}

function spawnFoe(s: State, kind: Foe['kind'], x: number, z: number) {
  const f = s.foes.find((q) => !q.on);
  if (!f) return null;
  f.on = true;
  f.kind = kind;
  f.state = kind === 'gaunt' ? 'run' : 'run';
  f.x = x;
  f.z = z;
  f.dx = kind === 'warrior' ? rand(420, 500) : 0;
  f.speed = kind === 'gaunt' ? rand(150, 210) : 60;
  f.t = 0;
  f.hp = kind === 'gaunt' ? 2.2 : 34;
  f.hit = 0;
  f.ph = rand(0, TAU);
  f.leap = 0;
  f.roar = 0;
  f.fireT = rand(1.5, 3);
  f.fall = 0;
  f.fade = 1;
  f.seed = Math.floor(rand(0, 999));
  f.flash = 0;
  return f;
}

function alive(f: Foe | null): f is Foe {
  return !!f && f.on && f.state !== 'dead';
}

const fScale = (f: Foe) => zk(f.z) * (f.kind === 'warrior' ? 1.05 : 0.95);

function foePoint(f: Foe): [number, number] {
  const S = fScale(f);
  return [f.x, zy(f.z) - (f.kind === 'warrior' ? 210 : 100 + f.leap * 60) * S];
}

function nearestFoe(s: State, x: number, y: number, maxD: number) {
  let best: Foe | null = null;
  let bd = maxD;
  for (const f of s.foes) {
    if (!alive(f)) continue;
    const [fx, fy] = foePoint(f);
    const d = Math.hypot(fx - x, fy - y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function hurt(s: State, env: SceneEnv, f: Foe, dmg: number, x: number, y: number) {
  f.hp -= dmg;
  f.hit = 1;
  for (let i = 0; i < 5; i++) s.sparks.spawn(x, y, rand(-140, 200), rand(-220, 20), rand(0.3, 0.7), rand(1.4, 3), 4, 900, 1);
  if (f.hp <= 0) slay(s, env, f, false);
}

function slay(s: State, env: SceneEnv, f: Foe, cut: boolean) {
  if (f.state === 'dead') return;
  f.state = 'dead';
  f.t = 0;
  f.fall = 0;
  f.roar = 1;
  const [x, y] = foePoint(f);
  const big = f.kind === 'warrior' ? 2 : 1;
  for (let i = 0; i < 18 * big; i++) {
    const a = rand(-Math.PI, 0);
    const v = rand(80, 380);
    s.sparks.spawn(x + rand(-20, 20), y + rand(-30, 20), Math.cos(a) * v + 60, Math.sin(a) * v, rand(0.4, 1), rand(1.6, 3.6), 4, 900, 0.8);
  }
  for (let i = 0; i < 4 * big; i++) s.sparks.spawn(x + rand(-30, 30), y + rand(-30, 20), rand(-30, 60), rand(-50, 0), rand(0.6, 1.1), rand(8, 18) * big, 6, 0, 1.6);
  // carapace shards
  for (let i = 0; i < 5 * big; i++) {
    const p = s.sparks.spawn(x, y, rand(-200, 260), rand(-420, -120), rand(0.8, 1.4), rand(3, 7), 5, 1300, 0.5);
    p.rot = rand(0, TAU);
    p.vr = rand(-12, 12);
    p.bounce = 0.3;
  }
  if (!env.reducedMotion && (cut || big > 1)) s.stop = 0.06;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.22, gain: 0.07, freq: 900 + rand(0, 600), q: 2 });
    tone(bus, f.kind === 'warrior' ? 140 : 420 + rand(0, 200), { type: 'sawtooth', attack: 0.01, decay: 0.25, gain: 0.025, glideTo: f.kind === 'warrior' ? 60 : 160 });
  }
}

/* ----- the squad ----- */

const pose = {
  px: 0,
  py: 0,
  lean: 0,
  ga: 0,
  gx: 0,
  gy: 0,
  head: 0,
  f1x: 0,
  f1y: 0,
  f2x: 0,
  f2y: 0,
  kneel: false,
  // captain's sword arm, in the torso frame: hand position and blade angle
  sx: 0,
  sy: 0,
  sa: 0,
};

function solvePose(m: Marine, s: State, t: number) {
  const br = Math.sin(t * 1.4 + m.seed * 2.3) * 1.5;
  const cry = smooth(clamp(s.cry * 1.6, 0, 1)) * (s.cry > 0.62 ? 1 : 0);
  pose.kneel = m.id === 'kneel';
  pose.px = 0;
  pose.py = (pose.kneel ? -112 : -166) + br * 0.5;
  pose.lean = pose.kneel ? 0.1 : 0.04;
  pose.ga = m.aim * m.face - pose.lean - cry * 0.9;
  pose.gx = 30;
  pose.gy = -92;
  pose.head = (m.aim * m.face - pose.lean) * 0.4 - cry * 0.25;
  if (pose.kneel) {
    pose.f1x = -96;
    pose.f1y = 0;
    pose.f2x = 56;
    pose.f2y = 0;
  } else {
    pose.f1x = -46;
    pose.f1y = 0;
    pose.f2x = 52;
    pose.f2y = 0;
  }
  pose.sx = 54;
  pose.sy = -40;
  pose.sa = 0.7;
  if (m.id === 'captain') {
    pose.f1x = -58;
    pose.f2x = 60;
    // chainsword held low and forward, pistol arm free for aiming
    pose.sa = lerp(0.75, -0.5, s.revK) - cry * 2.2;
    pose.sy = lerp(-40, -70, s.revK) - cry * 60;
    if (s.mode === 'out' || s.mode === 'back') {
      const ph = s.runPh;
      pose.py = -150 - Math.abs(Math.sin(ph)) * 10;
      pose.lean = 0.32;
      pose.f1x = Math.cos(ph) * 60;
      pose.f1y = -Math.max(0, Math.sin(ph)) * 34;
      pose.f2x = Math.cos(ph + Math.PI) * 60;
      pose.f2y = -Math.max(0, Math.sin(ph + Math.PI)) * 34;
      pose.sa = -2.3;
      pose.sx = 30;
      pose.sy = -150;
      pose.head = -0.1;
      if (s.mode === 'out' && s.modeT / s.runD > 0.25 && s.modeT / s.runD < 0.8) {
        // the leap: knees tucked
        pose.f1x = -30;
        pose.f1y = -50;
        pose.f2x = 40;
        pose.f2y = -40;
      }
    } else if (s.mode === 'slash') {
      // overhead cut down into the xenos, wound back up between blows
      const k = s.swing;
      const cut = k < 0.35 ? easeOutCubic(k / 0.35) : 1 - smooth((k - 0.35) / 0.65);
      pose.py = -150;
      pose.lean = 0.12 + cut * 0.2;
      pose.sa = lerp(-2.4, 0.9, cut);
      pose.sx = lerp(10, 80, cut);
      pose.sy = lerp(-160, -50, cut);
      pose.f1x = -70;
      pose.f2x = 74;
      pose.head = 0.1 * cut;
    }
  }
  pose.gx -= Math.cos(pose.ga) * m.recoil * 8;
  pose.gy -= Math.sin(pose.ga) * m.recoil * 8;
  pose.ga -= m.recoil * 0.07;
}

function torsoToStage(m: Marine, x: number, y: number): [number, number] {
  const c = Math.cos(pose.lean);
  const sn = Math.sin(pose.lean);
  const lx = pose.px + x * c - y * sn;
  const ly = pose.py + x * sn + y * c;
  const S = zk(m.z) * m.size;
  return [m.x + lx * S * m.face, zy(m.z) - m.lift + ly * S];
}

let sawX = 0;
let sawY = 0;

function updateMarines(s: State, env: SceneEnv, dt: number, t: number) {
  for (const m of s.marines) {
    m.recoil = damp(m.recoil, 0, 14, dt);
    m.flash = Math.max(0, m.flash - dt * 12);
    const isC = m === s.cap;
    if (m.target && !alive(m.target)) {
      m.target = nearestFoe(s, m.tx, m.ty, 300);
      if (!m.target && m.burst > 0 && !s.pointerAim) m.burst = 0;
    }
    if (m.target) [m.tx, m.ty] = foePoint(m.target);
    // hold the line on their own: the closest xenos gets a burst
    m.autoT -= dt;
    if (m.autoT <= 0 && m.burst === 0 && !(isC && s.mode !== 'line')) {
      m.autoT = rand(2.2, 3.4);
      let best: Foe | null = null;
      let bx = Infinity;
      for (const f of s.foes) if (alive(f) && f.x < bx + rand(-80, 80)) {
        bx = f.x;
        best = f;
      }
      if (best) {
        m.target = best;
        [m.tx, m.ty] = foePoint(best);
        m.burst = isC || m.id === 'bearer' ? 2 : 3;
        m.wait = rand(0, 0.2);
      }
    }
    if (!(isC && s.mode !== 'line')) {
      if (m.wait > 0) m.wait -= dt;
      else if (m.burst > 0) {
        m.shotT -= dt;
        if (m.shotT <= 0) {
          m.burst--;
          m.shotT = isC || m.id === 'bearer' ? 0.2 : 0.12;
          shoot(s, env, m);
        }
      }
    }
    const S = zk(m.z) * m.size;
    const sx = m.x + 30 * S * m.face;
    const sy = zy(m.z) - (m.id === 'kneel' ? 200 : 260) * S;
    const want = clamp(Math.atan2(m.ty - sy, Math.max(80, Math.abs(m.tx - sx))), -0.55, 0.4);
    m.aim = damp(m.aim, want, 9, dt);
    solvePose(m, s, t);
    if (isC || m.id === 'bearer') {
      // pistol: far arm out toward the target
      const [hx, hy] = pistolHand(m);
      const L = 46;
      [m.mx, m.my] = torsoToStage(m, hx + Math.cos(pose.ga) * L, hy + Math.sin(pose.ga) * L - 4);
    } else {
      const L = 128;
      [m.mx, m.my] = torsoToStage(m, pose.gx + Math.cos(pose.ga) * L + Math.sin(pose.ga) * 10, pose.gy + Math.sin(pose.ga) * L - Math.cos(pose.ga) * 10);
    }
    if (isC) {
      const bl = 130;
      [sawX, sawY] = torsoToStage(m, pose.sx + Math.cos(pose.sa) * bl * 0.7, pose.sy + Math.sin(pose.sa) * bl * 0.7);
    }
  }
}

/** Torso-frame hand for a one-handed pistol, arm straight out along the aim */
function pistolHand(m: Marine): [number, number] {
  const sh = m.id === 'bearer' ? [-14, -126] : [-16, -128];
  const reach = 100;
  return [sh[0] + Math.cos(pose.ga) * reach, sh[1] + Math.sin(pose.ga) * reach + 10];
}

function shoot(s: State, env: SceneEnv, m: Marine) {
  const b = s.bolts.find((q) => !q.on);
  m.recoil = 1;
  m.flash = 1;
  if (!env.reducedMotion) s.shake = Math.max(s.shake, m === s.cap ? 0.16 : 0.1);
  const S = zk(m.z) * m.size;
  if (b) {
    const f = alive(m.target) ? m.target : null;
    let tx = m.tx + rand(-14, 14);
    let ty = m.ty + rand(-20, 20);
    const hit = !!f && Math.random() < 0.82;
    if (f && !hit) {
      tx += rand(60, 160);
      ty += rand(-90, 40);
    }
    const d = Math.max(1, Math.hypot(tx - m.mx, ty - m.my));
    const v = 2400;
    b.on = true;
    b.x = m.mx;
    b.y = m.my;
    b.vx = ((tx - m.mx) / d) * v;
    b.vy = ((ty - m.my) / d) * v;
    b.left = d / v;
    b.target = f;
    b.hit = hit;
    b.who = s.marines.indexOf(m);
    b.kind = 0;
  }
  const c = s.brass.spawn(m.mx - Math.cos(m.aim) * 80 * S, m.my, rand(-160, -60), rand(-300, -180), 1.3, S, 0, 1400, 0.2);
  c.rot = rand(0, TAU);
  c.vr = rand(-20, 20);
  c.bounce = 0.4;
  const bus = env.audio();
  if (bus) {
    const g = m === s.cap ? 1 : 0.6;
    // the bark of the bolter, then the rocket's hiss
    noise(bus, { duration: 0.12, gain: 0.16 * g, freq: 900, q: 0.6 });
    tone(bus, 110, { type: 'square', attack: 0.002, decay: 0.1, gain: 0.06 * g, glideTo: 50 });
    noise(bus, { duration: 0.18, gain: 0.03 * g, freq: 3200, q: 1 });
  }
}

function updateBolts(s: State, env: SceneEnv, dt: number) {
  for (const b of s.bolts) {
    if (!b.on) continue;
    b.left -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.kind === 0 && Math.random() < dt * 60) s.sparks.spawn(b.x, b.y, rand(-20, 20), rand(-20, 10), rand(0.2, 0.4), rand(3, 6), 8, -10, 2);
    if (b.left <= 0) {
      b.on = false;
      if (b.kind === 1) {
        // deathspitter glob bursts against ceramite and stone
        for (let i = 0; i < 10; i++) s.sparks.spawn(b.x, b.y, rand(-160, 160), rand(-200, 0), rand(0.3, 0.7), rand(1.4, 3), 9, 700, 1.2);
        continue;
      }
      // mass-reactive detonation
      for (let i = 0; i < 3; i++) s.sparks.spawn(b.x + rand(-6, 6), b.y + rand(-6, 6), rand(-40, 40), rand(-60, 0), rand(0.15, 0.3), rand(12, 22), 7, 0, 3);
      for (let i = 0; i < 8; i++) {
        const a = rand(0, TAU);
        const v = rand(150, 420);
        s.sparks.spawn(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v - 60, rand(0.15, 0.35), rand(1, 2), 0, 800, 1.5);
      }
      s.sparks.spawn(b.x, b.y, rand(-20, 20), rand(-40, -10), rand(0.6, 1), rand(10, 18), 3, 0, 1.6);
      if (b.hit && alive(b.target)) hurt(s, env, b.target, 1.25 * (s.cry > 0 ? 1.4 : 1), b.x, b.y);
      const bus = env.audio();
      if (bus && Math.random() < 0.6) noise(bus, { duration: 0.1, gain: 0.07, freq: 600, q: 0.8, type: 'lowpass' });
    }
  }
}

function updateCaptain(s: State, env: SceneEnv, dt: number) {
  const c = s.cap;
  const rm = env.reducedMotion;
  const holding = s.pressing || s.keyDown;
  s.revK = damp(s.revK, s.rev ? 1 : 0, s.rev ? 3.4 : 8, dt);
  s.chain += dt * (5 + s.revK * 60);
  if (s.mode === 'out' || s.mode === 'back') {
    s.modeT += dt;
    const k = clamp(s.modeT / s.runD, 0, 1);
    const out = s.mode === 'out';
    const kx = smooth(k);
    c.x = out ? lerp(s.rx0, s.rx1, kx) : lerp(s.rx1, s.rx0, kx);
    c.z = out ? lerp(s.rz0, s.rz1, k) : lerp(s.rz1, s.rz0, k);
    c.face = out ? 1 : -1;
    c.lift = out ? Math.sin(clamp((k - 0.15) / 0.75, 0, 1) * Math.PI) * 110 * zk(c.z) : 0;
    const prev = s.runPh;
    s.runPh += dt * 13;
    if (Math.floor(prev / Math.PI) !== Math.floor(s.runPh / Math.PI) && c.lift < 4) {
      if (!rm) s.shake = Math.max(s.shake, 0.3);
      for (let i = 0; i < 3; i++) s.sparks.spawn(c.x + rand(-20, 20), zy(c.z), rand(-60, 60), rand(-60, -20), rand(0.5, 0.9), rand(8, 14), 3, 20, 2);
      const bus = env.audio();
      if (bus) noise(bus, { duration: 0.07, gain: 0.06, freq: 200, q: 1, type: 'lowpass' });
    }
    if (k >= 1) {
      if (out) {
        s.mode = 'slash';
        s.modeT = 0;
        s.swing = 0;
        s.swingN = 0;
        if (!rm) s.shake = Math.max(s.shake, 0.7);
        for (let i = 0; i < 10; i++) s.sparks.spawn(c.x + rand(-40, 40), zy(c.z), rand(-120, 120), rand(-120, -30), rand(0.6, 1.1), rand(12, 24), 3, 20, 2);
      } else {
        s.mode = 'line';
        c.x = c.hx;
        c.z = c.hz;
        c.lift = 0;
        c.face = 1;
        s.chargeE = null;
        if (!holding) stopRev(s, env);
      }
    }
  } else if (s.mode === 'slash') {
    s.modeT += dt;
    const prev = s.swing;
    s.swing = (s.swing + dt / 0.36) % 1;
    if (prev < 0.3 && s.swing >= 0.3) {
      // the blow lands
      s.swingN++;
      let hits = 0;
      const S = zk(c.z) * c.size;
      for (const f of s.foes) {
        if (!alive(f) || hits >= 2) continue;
        const dx = f.x - c.x;
        if (dx > -40 * S && dx < 300 * S && Math.abs(f.z - c.z) < 0.45) {
          hits++;
          if (f.kind === 'warrior') {
            f.hp -= 12;
            f.hit = 1;
            if (f.hp <= 0) slay(s, env, f, true);
          } else slay(s, env, f, true);
        }
      }
      for (let i = 0; i < 30; i++) {
        const a = rand(-2.8, -0.3);
        const v = rand(150, 600);
        s.sparks.spawn(sawX, sawY, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.5), rand(1, 2.2), 0, 900, 1.2);
        if (hits && i % 2 === 0) s.sparks.spawn(sawX, sawY, rand(-260, 260), rand(-380, -60), rand(0.4, 0.9), rand(1.6, 3.4), 4, 900, 0.6);
      }
      if (!rm) s.shake = Math.max(s.shake, 0.6);
      const bus = env.audio();
      if (bus) {
        noise(bus, { duration: 0.25, gain: 0.14, freq: 1200, q: 1 });
        tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.2, gain: 0.12, glideTo: 40 });
      }
    }
    if (s.swingN >= 3 && s.swing > 0.6) {
      s.mode = 'back';
      s.modeT = 0;
    }
  }
  if (s.revK > 0.25 && s.mode !== 'slash') {
    const n = s.revK * 40 * dt;
    for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
      const a = rand(0, TAU);
      s.sparks.spawn(sawX, sawY, Math.cos(a) * 120, Math.sin(a) * 120 - 60, rand(0.15, 0.35), rand(1, 1.8), 0, 700, 1.4);
    }
  }
}

/* ----- the swarm ----- */

function updateFoes(s: State, env: SceneEnv, dt: number) {
  const rm = env.reducedMotion;
  s.spawnT -= dt;
  s.warriorT += dt;
  const live = s.foes.filter((f) => f.on && f.state !== 'dead');
  if (s.spawnT <= 0) {
    s.spawnT = rand(0.6, 1.2);
    const gaunts = live.filter((f) => f.kind === 'gaunt').length;
    const warrior = live.some((f) => f.kind === 'warrior');
    if (!warrior && s.warriorT > 16) {
      spawnFoe(s, 'warrior', s.st.right + 120, rand(1.4, 1.8));
      s.warriorT = 0;
    } else if (gaunts < 8) {
      const f = spawnFoe(s, 'gaunt', Math.max(720, s.st.right + 60), rand(0.15, 1.6));
      if (f) f.leap = 0;
    }
  }
  for (const f of s.foes) {
    if (!f.on) continue;
    f.t += dt;
    f.hit = Math.max(0, f.hit - dt * 6);
    f.roar = Math.max(0, f.roar - dt * 0.8);
    f.flash = Math.max(0, f.flash - dt * 10);
    if (f.state === 'run') {
      if (f.kind === 'gaunt') {
        f.ph += dt * (f.speed / 22);
        // bounding run: every few strides a leap
        f.leap = Math.max(0, Math.sin(f.ph * 0.5)) ** 3;
        let sp = f.speed;
        if (s.chargeE === f && s.mode !== 'line') sp = 0;
        f.x -= sp * dt;
        // reaching the line: a point-blank burst from the nearest brother ends it
        const line = lerp(-60, -500, clamp(f.z / 1.1, 0, 1)) + 190;
        if (f.x < line) {
          const m = s.marines.reduce((a, b) => (Math.abs(b.z - f.z) < Math.abs(a.z - f.z) ? b : a));
          if (!(m === s.cap && s.mode !== 'line')) {
            m.target = f;
            [m.tx, m.ty] = foePoint(f);
            m.burst = Math.max(m.burst, 2);
            m.wait = 0;
          }
          if (f.x < line - 70) slay(s, env, f, false);
        }
      } else {
        f.ph += dt * 3;
        f.x -= f.speed * dt;
        if (f.x <= f.dx) {
          f.x = f.dx;
          f.state = 'stand';
          f.roar = 1;
          f.fireT = 1.2;
          const bus = env.audio();
          if (bus) {
            noise(bus, { duration: 0.9, gain: 0.1, freq: 500, q: 3 });
            tone(bus, 180, { type: 'sawtooth', attack: 0.05, decay: 0.8, gain: 0.04, glideTo: 90 });
          }
        }
      }
    } else if (f.state === 'stand') {
      f.ph = damp(f.ph, Math.round(f.ph / Math.PI) * Math.PI, 5, dt);
      f.fireT -= dt;
      if (f.fireT <= 0) {
        f.fireT = rand(1.6, 2.8);
        spit(s, env, f);
      }
    } else if (f.state === 'dead') {
      f.fall = Math.min(1, f.fall + dt * 2.6);
      if (f.t > 1.4) f.fade = Math.max(0, f.fade - dt * 1.5);
      if (f.fade <= 0) f.on = false;
    }
  }
  void rm;
}

/** Tyranid Warrior: a deathspitter round lobbed at the line */
function spit(s: State, env: SceneEnv, f: Foe) {
  const b = s.bolts.find((q) => !q.on);
  f.flash = 1;
  f.roar = Math.max(f.roar, 0.5);
  if (!b) return;
  const S = fScale(f);
  const x0 = f.x - 150 * S;
  const y0 = zy(f.z) - 170 * S;
  const m = s.marines[Math.floor(rand(0, 4))];
  const MS = zk(m.hz) * m.size;
  const tx = m.hx + rand(-60, 120) * MS;
  const ty = zy(m.hz) + rand(-20, 6);
  const d = Math.hypot(tx - x0, ty - y0);
  const v = 1100;
  b.on = true;
  b.x = x0;
  b.y = y0;
  b.vx = ((tx - x0) / d) * v;
  b.vy = ((ty - y0) / d) * v;
  b.left = d / v;
  b.target = null;
  b.hit = false;
  b.who = -1;
  b.kind = 1;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.2, gain: 0.07, freq: 300, q: 4 });
    tone(bus, 240, { type: 'sine', attack: 0.01, decay: 0.2, gain: 0.04, glideTo: 120 });
  }
}

function updateStrike(s: State, env: SceneEnv, dt: number) {
  if (s.strike < 0) return;
  const prev = s.strike;
  s.strike += dt;
  const LOCK = 1.0;
  if (prev < LOCK && s.strike >= LOCK) {
    // impact: everything inside the lance is gone
    const R = 300;
    for (const f of s.foes) {
      if (!alive(f)) continue;
      const d = Math.hypot(f.x - s.strikeX, (f.z - s.strikeZ) * 220);
      if (d < R) slay(s, env, f, false);
    }
    const x = s.strikeX;
    const y = zy(s.strikeZ);
    for (let i = 0; i < 40; i++) {
      const p = s.sparks.spawn(x + rand(-60, 60), y, rand(-600, 600), rand(-900, -200), rand(0.8, 1.8), rand(3, 9), 5, 1300, 0.4);
      p.rot = rand(0, TAU);
      p.vr = rand(-14, 14);
      p.bounce = 0.3;
    }
    for (let i = 0; i < 26; i++) s.sparks.spawn(x + rand(-200, 200), y + rand(-20, 10), rand(-200, 200), rand(-160, -20), rand(1.6, 3.2), rand(30, 70), 3, -10, 1.2);
    for (let i = 0; i < 14; i++) s.sparks.spawn(x + rand(-120, 120), y - rand(0, 200), rand(-80, 80), rand(-120, 0), rand(0.4, 0.8), rand(30, 60), 7, -60, 2);
    s.white = 1;
    s.scorch = 1;
    if (!env.reducedMotion) {
      s.shake = 1.3;
      s.stop = 0.08;
    }
    const bus = env.audio();
    if (bus) {
      noise(bus, { duration: 1.8, gain: 0.4, freq: 420, q: 0.5, type: 'lowpass' });
      tone(bus, 46, { type: 'sine', attack: 0.004, decay: 1.6, gain: 0.34, glideTo: 22 });
      noise(bus, { duration: 0.5, gain: 0.14, freq: 3000, q: 0.5 });
    }
  }
  if (s.strike > LOCK + 1.6) s.strike = -1;
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
  const HZ = zy(2.9);

  // the far wall of the nave in deep shadow
  const wallG = c.createLinearGradient(0, T, 0, HZ);
  wallG.addColorStop(0, '#0d0b0c');
  wallG.addColorStop(0.5, '#1d1819');
  wallG.addColorStop(1, '#2c2321');
  c.fillStyle = wallG;
  c.fillRect(L, T, R - L, B - T);

  // a breach in the vault, the sky beyond burning
  c.save();
  c.beginPath();
  c.moveTo(-40, T);
  c.lineTo(20, HZ - 330);
  c.lineTo(90, HZ - 370);
  c.lineTo(160, HZ - 340);
  c.lineTo(250, HZ - 400);
  c.lineTo(360, T);
  c.closePath();
  const sky = c.createLinearGradient(0, T, 0, HZ - 330);
  sky.addColorStop(0, '#2a0e0a');
  sky.addColorStop(1, '#9a3a18');
  c.fillStyle = sky;
  c.fill();
  c.restore();

  // great lancet windows of stained glass along the far wall
  for (let i = -4; i <= 4; i++) {
    const x = i * 190 + 40;
    if (i === 1 || i === -2) continue;
    lancet(c, x, HZ - 30, 58, 220, i + 9);
  }
  // the rose window high over the nave
  rose(c, 230, HZ - 250, 80);
  // god rays from the windows
  c.globalCompositeOperation = 'lighter';
  for (let i = -4; i <= 4; i++) {
    const x = i * 190 + 40;
    const g = c.createLinearGradient(x, HZ - 400, x + 200, HZ + 100);
    g.addColorStop(0, `rgba(150,180,255,${0.05 + hash(i + 3) * 0.04})`);
    g.addColorStop(1, 'rgba(150,180,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 50, HZ - 300);
    c.lineTo(x + 40, HZ - 300);
    c.lineTo(x + 330, HZ + 160);
    c.lineTo(x + 120, HZ + 160);
    c.closePath();
    c.fill();
  }
  glow(c, 230, HZ - 250, 260, '255,150,90', 0.14);
  c.globalCompositeOperation = 'source-over';

  // a vast Imperial eagle in gilt relief over the altar
  aquila(c, -170, HZ - 230, 0.9);

  // the arcade: pillars and pointed arches receding along the nave
  arcade(c, L, R, zy(2.4), zk(2.4));
  haze(c, L, R, HZ - 300, HZ + 40, 'rgba(70,52,44,0.45)');
  arcade(c, L, R, zy(1.7), zk(1.7), 100);

  // flagstones in perspective
  const floor = c.createLinearGradient(0, HZ, 0, B);
  floor.addColorStop(0, '#3a302b');
  floor.addColorStop(0.3, '#251e1b');
  floor.addColorStop(1, '#0d0a09');
  c.fillStyle = floor;
  c.fillRect(L, HZ, R - L, B - HZ);
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 1.5;
  const vx = 60;
  const vy = HZ - 260;
  for (let i = -18; i <= 18; i++) {
    const bx = i * 130;
    const k = (HZ - vy) / (B - vy);
    c.beginPath();
    c.moveTo(lerp(vx, bx, k), HZ);
    c.lineTo(bx, B);
    c.stroke();
  }
  for (let j = 0; j < 9; j++) {
    const y = zy(2.9 - j * j * 0.05);
    c.beginPath();
    c.moveTo(L, y);
    c.lineTo(R, y);
    c.stroke();
  }
  // a worn processional runner down the aisle
  c.fillStyle = 'rgba(110,20,18,0.35)';
  c.beginPath();
  c.moveTo(L, zy(1.0));
  c.lineTo(R, zy(1.0) - 14);
  c.lineTo(R, zy(0.6) - 14);
  c.lineTo(L, zy(0.6));
  c.closePath();
  c.fill();
  // rubble, skulls and broken pews
  for (let i = 0; i < 70; i++) {
    const z = hash(i + 80) * 2.8;
    const x = L + hash(i + 40) * (R - L);
    const y = zy(z) + 4;
    const r = (4 + hash(i + 120) * 13) * zk(z);
    if (hash(i + 300) < 0.22) skull(c, x, y - r, r * 0.8);
    else chunk(c, x, y, r, i);
  }
  pew(c, 260, zy(2.5), zk(2.5));
  pew(c, 560, zy(2.3), zk(2.3));
  pew(c, -60, zy(2.7), zk(2.7));
  // candelabra
  for (const [x, z] of CANDLES) candelabra(c, x, zy(z), zk(z));
  c.restore();
}

const CANDLES: [number, number][] = [
  [-660, 1.4],
  [100, 2.2],
  [640, 1.2],
];

function haze(c: CanvasRenderingContext2D, L: number, R: number, y0: number, y1: number, col: string) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.fillRect(L, y0, R - L, y1 - y0);
}

/** A tall pointed window, leaded panes of coloured glass, some blown out */
function lancet(c: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, seed: number) {
  const top = base - h;
  const trace = () => {
    c.beginPath();
    c.moveTo(x - w / 2, base);
    c.lineTo(x - w / 2, top + w * 0.6);
    c.quadraticCurveTo(x - w / 2, top, x, top - w * 0.3);
    c.quadraticCurveTo(x + w / 2, top, x + w / 2, top + w * 0.6);
    c.lineTo(x + w / 2, base);
    c.closePath();
  };
  // stone surround
  c.fillStyle = '#2e2726';
  c.fillRect(x - w / 2 - 12, top - w * 0.3 - 10, w + 24, h + w * 0.3 + 14);
  trace();
  c.save();
  c.clip();
  const cols = ['#1d3a8a', '#7a1a20', '#b88a2a', '#245a5a', '#3a2a7a'];
  for (let yy = top - w; yy < base; yy += 16) {
    for (let xx = x - w / 2; xx < x + w / 2; xx += 14) {
      const hsh = hash(seed * 131 + xx * 0.7 + yy * 1.3);
      c.fillStyle = cols[Math.floor(hsh * cols.length)];
      c.globalAlpha = 0.55 + hash(hsh * 9) * 0.4;
      c.fillRect(xx, yy, 14, 16);
    }
  }
  c.globalAlpha = 1;
  // a figure in the glass: a robed saint with a halo
  c.fillStyle = 'rgba(230,200,140,0.5)';
  c.beginPath();
  c.arc(x, top + 40, 10, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(20,40,110,0.75)';
  c.beginPath();
  c.moveTo(x - 12, top + 54);
  c.lineTo(x + 12, top + 54);
  c.lineTo(x + 20, top + 160);
  c.lineTo(x - 20, top + 160);
  c.closePath();
  c.fill();
  // lead came
  c.strokeStyle = 'rgba(10,8,8,0.85)';
  c.lineWidth = 2;
  for (let yy = top; yy < base; yy += 16) {
    c.beginPath();
    c.moveTo(x - w / 2, yy);
    c.lineTo(x + w / 2, yy);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(x, top - w * 0.3);
  c.lineTo(x, base);
  c.stroke();
  // blown-out panes show the dark beyond
  if (hash(seed) > 0.4) {
    c.fillStyle = '#120a08';
    c.beginPath();
    const by = top + h * (0.4 + hash(seed + 1) * 0.3);
    c.moveTo(x - w / 2, by);
    for (let i = 0; i <= 6; i++) c.lineTo(x - w / 2 + (i / 6) * w, by + (hash(seed * 7 + i) - 0.5) * 50);
    c.lineTo(x + w / 2, base);
    c.lineTo(x - w / 2, base);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.strokeStyle = '#4a403c';
  c.lineWidth = 5;
  trace();
  c.stroke();
}

function rose(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = '#2e2726';
  c.beginPath();
  c.arc(x, y, r + 16, 0, TAU);
  c.fill();
  const cols = ['#2a4aa8', '#9a2026', '#d0a030', '#2a7070'];
  for (let ring = 0; ring < 3; ring++) {
    const r0 = (r * ring) / 3;
    const r1 = (r * (ring + 1)) / 3;
    const n = 8 * (ring + 1);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      c.beginPath();
      c.arc(x, y, r1, a0, a1);
      c.arc(x, y, r0, a1, a0, true);
      c.closePath();
      c.fillStyle = cols[(i + ring) % cols.length];
      c.globalAlpha = 0.75;
      c.fill();
    }
  }
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(12,10,10,0.9)';
  c.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    c.stroke();
  }
  for (let ring = 1; ring <= 3; ring++) {
    c.beginPath();
    c.arc(x, y, (r * ring) / 3, 0, TAU);
    c.stroke();
  }
  // a skull at the hub
  skull(c, x, y + 6, 16);
  c.globalCompositeOperation = 'lighter';
  glow(c, x, y, r * 1.1, '255,190,140', 0.25);
  c.globalCompositeOperation = 'source-over';
}

/** The double-headed eagle of the Imperium in tarnished gilt */
function aquila(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  const g = c.createLinearGradient(0, -80, 0, 80);
  g.addColorStop(0, '#c49a42');
  g.addColorStop(1, '#5a4116');
  c.fillStyle = g;
  for (const dir of [-1, 1]) {
    c.save();
    c.scale(dir, 1);
    // a swept wing of stacked feathers
    c.beginPath();
    c.moveTo(12, -20);
    c.quadraticCurveTo(80, -70, 160, -60);
    for (let i = 0; i < 6; i++) {
      const fx = 160 - i * 24;
      c.lineTo(fx - 8, -40 + i * 14);
      c.lineTo(fx - 20, -48 + i * 14);
    }
    c.lineTo(14, 18);
    c.closePath();
    c.fill();
    // a head in profile looking outward
    c.beginPath();
    c.moveTo(6, -30);
    c.quadraticCurveTo(14, -62, 34, -60);
    c.lineTo(48, -54);
    c.lineTo(36, -48);
    c.quadraticCurveTo(26, -44, 18, -24);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.beginPath();
  c.ellipse(0, -2, 18, 36, 0, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(20,12,4,0.6)';
  c.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(-150 + i * 26, -50 + i * 12);
    c.lineTo(-20, -6 + i * 4);
    c.moveTo(150 - i * 26, -50 + i * 12);
    c.lineTo(20, -6 + i * 4);
    c.stroke();
  }
  skull(c, 0, 50, 22);
  c.restore();
}

/** A carved skull: dome, sockets, nasal cavity and a row of teeth */
function skull(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#c9bb9a';
  c.beginPath();
  c.arc(0, -r * 0.2, r, Math.PI * 0.9, Math.PI * 2.1);
  c.lineTo(r * 0.62, r * 0.55);
  c.lineTo(-r * 0.62, r * 0.55);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(40,30,22,0.5)';
  c.fillRect(-r, -r * 1.2, r * 2, r * 0.5);
  c.fillStyle = '#16100c';
  c.beginPath();
  c.ellipse(-r * 0.38, -r * 0.08, r * 0.26, r * 0.22, 0.2, 0, TAU);
  c.ellipse(r * 0.38, -r * 0.08, r * 0.26, r * 0.22, -0.2, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(0, r * 0.14);
  c.lineTo(-r * 0.1, r * 0.32);
  c.lineTo(r * 0.1, r * 0.32);
  c.closePath();
  c.fill();
  for (let i = -2; i <= 2; i++) c.fillRect(i * r * 0.2 - r * 0.04, r * 0.4, r * 0.06, r * 0.15);
  c.restore();
}

function arcade(c: CanvasRenderingContext2D, L: number, R: number, base: number, k: number, off = 0) {
  const span = 300 * k * 2.2;
  const ph = 380 * k * 1.6;
  const pw = 44 * k * 1.6;
  const col = k > 0.66 ? '#241d1c' : '#332a28';
  const lit = k > 0.66 ? 'rgba(200,150,110,0.14)' : 'rgba(200,150,110,0.1)';
  for (let x = L - span + (off % span); x < R + span; x += span) {
    // pillar with a lit edge, base and capital carved with a skull
    c.fillStyle = col;
    c.fillRect(x - pw / 2, base - ph, pw, ph + 8);
    c.fillStyle = lit;
    c.fillRect(x + pw / 2 - pw * 0.2, base - ph, pw * 0.2, ph);
    c.fillStyle = col;
    c.fillRect(x - pw * 0.8, base - pw * 0.6, pw * 1.6, pw * 0.6);
    c.fillRect(x - pw * 0.8, base - ph - pw * 0.4, pw * 1.6, pw * 0.5);
    skull(c, x, base - ph - pw * 0.7, pw * 0.34);
    // pointed arch to the next pillar
    c.strokeStyle = col;
    c.lineWidth = pw * 0.7;
    c.beginPath();
    c.moveTo(x, base - ph);
    c.quadraticCurveTo(x + span * 0.08, base - ph - span * 0.55, x + span / 2, base - ph - span * 0.62);
    c.quadraticCurveTo(x + span * 0.92, base - ph - span * 0.55, x + span, base - ph);
    c.stroke();
    // wall above the arches
    c.fillStyle = col;
    c.fillRect(x - 4, base - ph - span * 0.62 - 600 * k, span + 8, 600 * k - 30 * k);
    // a tattered hanging banner on some of the pillars
    if (hash(x * 0.013 + off) > 0.55) {
      const bw = pw * 1.4;
      c.fillStyle = 'rgba(120,20,18,0.85)';
      c.beginPath();
      c.moveTo(x - bw / 2, base - ph * 0.9);
      c.lineTo(x + bw / 2, base - ph * 0.9);
      c.lineTo(x + bw / 2, base - ph * 0.45);
      c.lineTo(x, base - ph * 0.38);
      c.lineTo(x - bw / 2, base - ph * 0.45);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(200,150,60,0.7)';
      c.fillRect(x - bw / 2, base - ph * 0.9, bw, 4 * k);
      skull(c, x, base - ph * 0.66, bw * 0.22);
    }
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
  c.fillStyle = '#2a2220';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(200,170,140,0.2)';
  c.fillRect(x - r, y - r * 1.2, r * 2, r * 0.7);
  c.restore();
}

function pew(c: CanvasRenderingContext2D, x: number, base: number, k: number) {
  c.save();
  c.translate(x, base);
  c.scale(k, k);
  c.rotate(-0.12);
  c.fillStyle = '#2a1a12';
  c.fillRect(-120, -70, 240, 16);
  c.fillRect(-120, -40, 230, 12);
  c.fillRect(-112, -70, 12, 70);
  c.fillRect(90, -60, 12, 60);
  c.fillStyle = 'rgba(200,140,90,0.18)';
  c.fillRect(-120, -70, 240, 3);
  c.restore();
}

function candelabra(c: CanvasRenderingContext2D, x: number, base: number, k: number) {
  c.save();
  c.translate(x, base);
  c.scale(k, k);
  c.fillStyle = '#3a2c1a';
  c.fillRect(-4, -200, 8, 200);
  c.fillRect(-26, -6, 52, 8);
  c.fillRect(-46, -200, 92, 6);
  for (const cx of [-40, -14, 14, 40]) {
    c.fillStyle = '#e8dcc0';
    c.fillRect(cx - 4, -236, 8, 36);
    c.fillStyle = 'rgba(232,220,192,0.7)';
    c.fillRect(cx - 4, -204, 9, 10);
  }
  c.restore();
}

/** Close rubble, a fallen statue's head and a broken pillar base along the bottom */
function renderForeground(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  c.translate(st.ox, st.oy);
  c.scale(st.k, st.k);
  const L = st.left - 40;
  const R = st.right + 40;
  const B = st.bottom + 40;
  const y0 = 50;
  if (B > y0) {
    for (let i = 0; i < 24; i++) {
      const x = L + hash(i + 700) * (R - L);
      const y = y0 + 20 + hash(i + 720) * 60;
      const r = 18 + hash(i + 740) * 30;
      if (x > -300 && x < 500 && hash(i + 760) < 0.65) continue;
      chunk(c, x, y, r, i + 700);
    }
    skull(c, L + 150, y0 + 40, 22);
    skull(c, R - 200, y0 + 60, 18);
  }
  // a shattered pillar framing the right edge
  c.fillStyle = '#100c0b';
  c.beginPath();
  c.moveTo(R, 80);
  c.lineTo(R - 70, 80);
  c.lineTo(R - 66, -420);
  c.lineTo(R - 40, -450);
  c.lineTo(R - 20, -400);
  c.lineTo(R, -430);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(220,150,100,0.12)';
  c.fillRect(R - 70, -420, 6, 500);
  c.restore();
}

/* ---------- per-frame drawing ---------- */

interface DrawItem {
  z: number;
  m: Marine | null;
  f: Foe | null;
}
const items: DrawItem[] = Array.from({ length: 24 }, () => ({ z: 0, m: null, f: null }));

function drawScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const st = s.st;
  const p = s.paint;
  if (!p) return;
  p.ctx = ctx;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0e0b0b';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const amp = env.reducedMotion ? 0 : s.shake * s.shake * 11 * st.k;
  if (amp > 0.05) ctx.translate(Math.sin(t * 91) * amp, Math.cos(t * 73) * amp * 0.7);
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
  const pan = (Z - 1) * 0.8;
  ctx.translate((w / 2 - fsx) * pan, (h * 0.5 - fsy) * pan);
  ctx.translate(fsx, fsy);
  ctx.scale(Z, Z);
  ctx.translate(-fsx, -fsy);
  ctx.save();
  ctx.translate(st.ox, st.oy);
  ctx.scale(st.k, st.k);

  // candle flames flicker over the cached candelabra
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, z] of CANDLES) {
    const k = zk(z);
    for (const cx of [-40, -14, 14, 40]) {
      const fl = 0.8 + 0.2 * Math.sin(t * 13 + cx + x);
      glow(ctx, x + cx * k, zy(z) - 244 * k, 14 * k, '255,200,110', 0.9 * fl);
    }
    glow(ctx, x, zy(z) - 240 * k, 160 * k, '255,150,70', 0.14);
  }
  ctx.globalCompositeOperation = 'source-over';
  drawScorch(ctx, s);
  drawAsh(ctx, s, t, true);

  let n = 0;
  for (const m of s.marines) {
    const it = items[n++];
    it.z = m.z;
    it.m = m;
    it.f = null;
  }
  for (const f of s.foes) {
    if (!f.on) continue;
    const it = items[n++];
    it.z = f.z;
    it.m = null;
    it.f = f;
  }
  const list = items.slice(0, n).sort((a, b) => b.z - a.z);
  let hazed = 0;
  for (const it of list) {
    if ((hazed === 0 && it.z < 1.2) || (hazed === 1 && it.z < 0.45)) {
      hazed++;
      ctx.fillStyle = hazed === 1 ? 'rgba(60,44,40,0.16)' : 'rgba(60,44,40,0.1)';
      ctx.fillRect(st.left - 60, st.top - 60, st.right - st.left + 120, st.bottom - st.top + 120);
    }
    if (it.m) drawMarine(p, it.m, s, t);
    else if (it.f) drawFoe(p, it.f, t);
  }
  drawStrike(ctx, s, t);
  drawEffects(ctx, s);
  drawAsh(ctx, s, t, false);
  drawMark(ctx, s, t);
  ctx.restore();
  ctx.restore();
  ctx.save();
  ctx.translate((w / 2 - fsx) * (Z - 1) * 0.8, (h * 0.5 - fsy) * (Z - 1) * 0.8);
  drawLayer(ctx, s.fg, w, h);
  ctx.restore();
  ctx.restore();
  if (s.cry > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(st.ox - 360 * st.k, st.oy - 200 * st.k, 0, st.ox - 360 * st.k, st.oy - 200 * st.k, 600 * st.k);
    g.addColorStop(0, `rgba(255,200,90,${0.22 * s.cry})`);
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (s.white > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(220,235,255,${0.75 * s.white * s.white})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  vignette(ctx, w, h, 0.78, '6,4,6');
  if (s.camZ > 1.02) {
    const k = clamp((s.camZ - 1) / 0.22, 0, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h * 0.07 * k);
    ctx.fillRect(0, h - h * 0.07 * k, w, h * 0.07 * k);
  }
  drawButtons(ctx, s, env, t);
}

function drawAsh(ctx: CanvasRenderingContext2D, s: State, t: number, far: boolean) {
  for (let i = 0; i < s.ash.items.length; i++) {
    const p = s.ash.items[i];
    if (p.life <= 0 || (i % 3 === 0) !== far) continue;
    const sway = Math.sin(t * 1.3 + i) * 6;
    if (p.kind === 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},50,${0.5 + 0.4 * Math.sin(t * 8 + i)})`;
      ctx.fillRect(p.x + sway, p.y, p.size, p.size);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = far ? 'rgba(150,140,135,0.28)' : 'rgba(190,180,172,0.5)';
      const sz = far ? p.size * 0.7 : p.size * 1.1;
      ctx.save();
      ctx.translate(p.x + sway, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-sz, -sz * 0.4, sz * 2, sz * 0.8);
      ctx.restore();
    }
  }
}

function drawScorch(ctx: CanvasRenderingContext2D, s: State) {
  if (s.scorch <= 0.01) return;
  const k = zk(s.strikeZ);
  const y = zy(s.strikeZ);
  ctx.globalAlpha = Math.min(1, s.scorch * 1.5);
  const g = ctx.createRadialGradient(s.strikeX, y, 0, s.strikeX, y, 260 * k);
  g.addColorStop(0, 'rgba(8,6,6,0.9)');
  g.addColorStop(0.6, 'rgba(20,12,10,0.6)');
  g.addColorStop(1, 'rgba(20,12,10,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(s.strikeX, y);
  ctx.scale(1, 0.24);
  ctx.translate(-s.strikeX, -y);
  ctx.fillRect(s.strikeX - 300 * k, y - 300 * k, 600 * k, 600 * k);
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s.strikeX, y - 10, 160 * k, '255,120,40', 0.4 * s.scorch);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/* ---------- Adeptus Astartes ---------- */

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

function drawMarine(p: Painter, m: Marine, s: State, t: number) {
  const ctx = p.ctx;
  solvePose(m, s, t);
  const S = zk(m.z) * m.size;
  const isC = m.id === 'captain';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(m.x, zy(m.z) + 2, 100 * S, 12 * S, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(m.x, zy(m.z) - m.lift);
  ctx.scale(S * m.face, S);
  p.lx = 0.55 * m.face;
  p.ly = -0.83;
  p.back = 'rgba(140,190,255,0.5)';
  p.bx = -0.9 * m.face;
  p.by = -0.35;
  p.backW = 2.4;
  p.outline = 'rgba(4,4,10,0.92)';
  p.outlineW = 1.6;

  if (isC) cape(p, s, t);
  if (m.id === 'bearer') banner(p, t);
  mLeg(p, -18, pose.py + 4, pose.f1x, pose.f1y, true, pose.kneel);

  ctx.save();
  ctx.translate(pose.px, pose.py);
  ctx.rotate(pose.lean);
  backpack(p, t);
  // far arm: the trigger hand on the bolter, or a pistol held out
  const ga = pose.ga;
  if (isC || m.id === 'bearer') {
    const [hx, hy] = pistolHand(m);
    mArm(p, -16, -128, hx, hy, true, isC);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ga);
    boltPistol(p);
    ctx.restore();
  } else mArm(p, -18, -128, pose.gx, pose.gy + 4, true, false);
  pauldron(p, -30, -124, true, isC, m.id);
  torso(p, isC, t);
  // gorget collar
  p.part(() => rpoly(ctx, [-26, -132, -22, -160, 10, -170, 36, -154, 32, -132], 8), BLUE[0], BLUE[1], BLUE[2], 2.4, 6);
  if (isC) {
    // the chainsword in the near hand
    mArm(p, 18, -126, pose.sx, pose.sy, false, true);
    ctx.save();
    ctx.translate(pose.sx, pose.sy);
    ctx.rotate(pose.sa);
    chainsword(p, s, t);
    ctx.restore();
    gauntlet(p, pose.sx, pose.sy, true);
  } else if (m.id === 'bearer') {
    // near hand grips the banner pole
    mArm(p, 18, -126, 46, -96, false, false);
    gauntlet(p, 46, -96, false);
  } else {
    ctx.save();
    ctx.translate(pose.gx, pose.gy);
    ctx.rotate(ga);
    bolter(p);
    ctx.restore();
    const fx = pose.gx + Math.cos(ga) * 66 - Math.sin(ga) * 10;
    const fy = pose.gy + Math.sin(ga) * 66 + Math.cos(ga) * 10;
    mArm(p, 18, -126, fx, fy, false, false);
    gauntlet(p, fx, fy, false);
  }
  pauldron(p, 0, -108, false, isC, m.id);
  ctx.save();
  ctx.translate(22, -178);
  ctx.rotate(pose.head);
  if (isC) captainHead(p, t);
  else helmet(p, t, m.seed);
  ctx.restore();
  ctx.restore();
  mLeg(p, 18, pose.py + 6, pose.f2x, pose.f2y, false, false);
  ctx.restore();
  p.outline = '';
  p.back = '';
  ctx.globalCompositeOperation = 'lighter';
  muzzleFlash(ctx, m);
  ctx.globalCompositeOperation = 'source-over';
}

function torso(p: Painter, captain: boolean, t: number) {
  const ctx = p.ctx;
  const trim = captain ? GOLD : null;
  ctx.save();
  ctx.scale(1.14, 1);
  // armoured abdomen: black flexible cabling under ridged plates
  p.part(() => rpoly(ctx, [-40, 12, 44, 12, 50, -60, -46, -60], 10), JOINT[0], JOINT[1], JOINT[2]);
  line(p, 'rgba(120,130,150,0.25)', 2, () => {
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-38, -10 - i * 12);
      ctx.lineTo(44, -12 - i * 12);
    }
  });
  // belt with a gold buckle
  p.part(() => rpoly(ctx, [-46, -12, 50, -12, 50, 6, -46, 6], 4), JOINT[0], JOINT[1], JOINT[2], 2, 4);
  p.part(() => rpoly(ctx, [14, -16, 34, -16, 34, 10, 14, 10], 4), GOLD[0], GOLD[1], GOLD[2], 2, 4);
  // thigh tassets
  p.part(() => rpoly(ctx, [-30, 4, 30, 2, 36, 40, 0, 50, -30, 40], 8), BLUE[0], BLUE[1], BLUE[2], 2.4, 7);
  // the deep barrel chest
  p.part(() => rpoly(ctx, [-50, -46, -62, -104, -54, -138, -28, -154, 30, -156, 60, -142, 72, -108, 66, -70, 50, -44, 0, -36], 14), BLUE[0], BLUE[1], BLUE[2], 3.4, 14);
  if (trim) line(p, GOLD[1], 3, () => {
    ctx.moveTo(-50, -46);
    ctx.lineTo(0, -36);
    ctx.lineTo(50, -44);
  });
  // gilded aquila spread across the breastplate
  ctx.save();
  ctx.translate(40, -118);
  ctx.rotate(0.12);
  const wing = (dir: number) => {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * 18, -12, dir * 34, -10);
    ctx.lineTo(dir * 30, -4);
    ctx.lineTo(dir * 34, 0);
    ctx.lineTo(dir * 28, 4);
    ctx.lineTo(dir * 30, 9);
    ctx.quadraticCurveTo(dir * 14, 10, 0, 8);
    ctx.closePath();
  };
  p.part(() => {
    wing(1);
    wing(-0.7);
  }, GOLD[0], GOLD[1], GOLD[2], 1.6, 3);
  p.part(() => ctx.ellipse(0, 2, 6, 10, 0, 0, TAU), GOLD[0], GOLD[1], GOLD[2], 1.4, 3);
  ctx.restore();
  line(p, 'rgba(255,255,255,0.35)', 2.2, () => {
    ctx.moveTo(-24, -148);
    ctx.quadraticCurveTo(30, -152, 60, -134);
  });
  line(p, SEAM, 1.8, () => {
    ctx.moveTo(-58, -92);
    ctx.quadraticCurveTo(-20, -84, 14, -90);
  });
  // a purity seal hanging off the chest plate
  purity(ctx, -6, -70, t, 0.9);
  ctx.restore();
}

/** Red wax seal and fluttering parchment strips */
function purity(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const sway = Math.sin(t * 2 + x) * 3;
  ctx.fillStyle = '#e6d8b0';
  ctx.strokeStyle = 'rgba(30,20,10,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-8 + i * 7, 4);
    ctx.lineTo(-4 + i * 7, 4);
    ctx.lineTo(-3 + i * 7 + sway, 34 + i * 4);
    ctx.lineTo(-8 + i * 7 + sway, 32 + i * 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,40,20,0.45)';
    for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.moveTo(-7 + i * 7 + sway * (j / 5), 10 + j * 6);
      ctx.lineTo(-4 + i * 7 + sway * (j / 5), 10 + j * 6);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30,20,10,0.6)';
  }
  ctx.fillStyle = '#9a1c16';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c8342a';
  ctx.beginPath();
  ctx.arc(-1.5, -1.5, 5.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function backpack(p: Painter, t: number) {
  const ctx = p.ctx;
  // twin exhaust stacks rising behind the shoulders
  for (const dx of [0, 16]) {
    p.part(() => rpoly(ctx, [-70 + dx, -150, -56 + dx, -196, -42 + dx, -192, -52 + dx, -146], 5), BLUE_D[0], BLUE_D[1], BLUE_D[2], 2, 5);
    p.part(() => rpoly(ctx, [-60 + dx, -190, -54 + dx, -206, -40 + dx, -202, -44 + dx, -188], 3), JOINT[0], JOINT[1], JOINT[2], 1.6, 3);
  }
  p.part(() => rpoly(ctx, [-84, -60, -90, -156, -40, -168, -30, -70], 12), BLUE_D[0], BLUE_D[1], BLUE_D[2], 2.6, 9);
  ctx.fillStyle = 'rgba(4,8,20,0.6)';
  for (let i = 0; i < 4; i++) ctx.fillRect(-82, -120 + i * 10, 26, 4);
  void t;
}

function mLeg(p: Painter, hx: number, hy: number, fx: number, fy: number, back: boolean, kneel: boolean) {
  const ctx = p.ctx;
  const A = back ? BLUE_D : BLUE;
  // kneeling: the far knee goes down on the flagstones
  const [kx, ky] = kneel && back ? ([hx - 10, -14] as const) : ik(hx, hy, fx, fy - 16, 84, 80, -1);
  const ax = fx - 4;
  const ay = fy - 20;
  p.part(() => capsule(ctx, hx, hy, kx, ky, 32, 26), JOINT[0], JOINT[1], JOINT[2]);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(Math.atan2(ky - hy, kx - hx));
  const tl = Math.hypot(kx - hx, ky - hy);
  p.part(() => rpoly(ctx, [-6, -32, tl * 0.86, -27, tl * 0.92, 0, tl * 0.8, 26, 0, 32, -16, 0], 12), A[0], A[1], A[2], 3, 9);
  ctx.restore();
  p.part(() => capsule(ctx, kx, ky, ax, ay, 26, 22), JOINT[0], JOINT[1], JOINT[2]);
  ctx.save();
  ctx.translate(kx, ky);
  ctx.rotate(Math.atan2(ay - ky, ax - kx));
  const sl = Math.hypot(ax - kx, ay - ky);
  p.part(() => rpoly(ctx, [0, -30, sl * 0.9, -26, sl * 1.04, -18, sl * 1.04, 18, sl * 0.6, 26, 0, 26], 10), A[0], A[1], A[2], 3, 9);
  ctx.restore();
  // big rounded knee pad
  p.part(() => rpoly(ctx, [kx - 20, ky - 26, kx + 22, ky - 26, kx + 30, ky + 2, kx + 18, ky + 26, kx - 20, ky + 22], 10), A[0], A[1], A[2], 3, 7);
  if (!back) {
    line(p, 'rgba(255,255,255,0.3)', 2, () => {
      ctx.moveTo(kx - 12, ky - 22);
      ctx.lineTo(kx + 18, ky - 22);
    });
  }
  // heavy boot
  p.part(() => rpoly(ctx, [ax - 28, ay - 16, ax + 22, ay - 18, ax + 48, fy - 10, ax + 52, fy + 2, ax - 30, fy + 2], 8), A[0], A[1], A[2], 2.6, 6);
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(ax - 30, fy - 4, 82, 6);
}

function mArm(p: Painter, sx: number, sy: number, hx: number, hy: number, back: boolean, captain: boolean) {
  const ctx = p.ctx;
  const A = back ? BLUE_D : BLUE;
  const [ex, ey] = ik(sx, sy, hx, hy, 64, 62, 1);
  p.part(() => capsule(ctx, sx, sy, ex, ey, 27, 23), A[0], A[1], A[2]);
  p.part(() => ctx.arc(ex, ey, 16, 0, TAU), JOINT[0], JOINT[1], JOINT[2], 2, 4);
  const fa = Math.atan2(hy - ey, hx - ex);
  const fl = Math.hypot(hx - ex, hy - ey);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(fa);
  p.part(() => rpoly(ctx, [-6, -24, fl * 0.86, -23, fl * 0.9, 21, -8, 23], 9), A[0], A[1], A[2], 2.8, 8);
  if (captain) line(p, GOLD[1], 2.6, () => {
    ctx.moveTo(fl * 0.86, -19);
    ctx.lineTo(fl * 0.88, 17);
  });
  ctx.restore();
  if (back) gauntlet(p, hx, hy, false);
}

function gauntlet(p: Painter, x: number, y: number, captain: boolean) {
  const A = captain ? GOLD : BLUE;
  p.part(() => rpoly(p.ctx, [x - 14, y - 13, x + 13, y - 15, x + 19, y + 2, x + 11, y + 14, x - 13, y + 13], 7), A[0], A[1], A[2], 2, 4);
}

/** The great rounded pauldron with its thick rim: chapter symbol on the near one */
function pauldron(p: Painter, sx: number, sy: number, back: boolean, captain: boolean, id: MarineId) {
  const ctx = p.ctx;
  const A = back ? BLUE_D : BLUE;
  const rim = back ? (['#b08a3a', '#7a5a1c', '#3a2808'] as Pal) : GOLD;
  ctx.save();
  ctx.translate(sx, sy);
  const ps = back ? 0.84 : 0.94;
  ctx.scale(ps, ps);
  const shell = () => {
    ctx.moveTo(-56, 26);
    ctx.bezierCurveTo(-64, -30, -36, -64, 8, -66);
    ctx.bezierCurveTo(54, -64, 76, -28, 70, 26);
    ctx.closePath();
  };
  p.part(shell, A[0], A[1], A[2], 4.5, 16);
  // the rim: gold for the Second Company, and for the Captain
  p.part(() => {
    ctx.moveTo(-60, 22);
    ctx.lineTo(74, 22);
    ctx.lineTo(72, 38);
    ctx.lineTo(-58, 38);
    ctx.closePath();
  }, rim[0], rim[1], rim[2], 2, 5);
  if (!back) {
    line(p, 'rgba(255,255,255,0.4)', 3, () => {
      ctx.moveTo(-42, -24);
      ctx.quadraticCurveTo(-20, -54, 20, -58);
    });
    // chips and scratches in the paint
    ctx.strokeStyle = 'rgba(200,215,240,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-40, 4);
    ctx.lineTo(-30, -2);
    ctx.moveTo(44, -30);
    ctx.lineTo(54, -20);
    ctx.lineTo(50, -12);
    ctx.moveTo(30, 10);
    ctx.lineTo(40, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,14,30,0.35)';
    ctx.beginPath();
    ctx.ellipse(-28, -30, 7, 4, 0.5, 0, TAU);
    ctx.fill();
    // the inverted omega of Ultramar
    if (id !== 'captain' || captain) omega(ctx, 8, -14, captain ? 22 : 24, captain ? '#f4d27a' : '#f2efe6');
    if (captain) purity(ctx, 44, 30, 0, 0.8);
  }
  ctx.restore();
}

/** Ultramarines chapter symbol: an omega turned upside down */
function omega(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // outer arc of the bowl (open at the top), with feet flaring outward at the top
  ctx.moveTo(-r * 1.0, -r * 0.62);
  ctx.lineTo(-r * 0.42, -r * 0.62);
  ctx.lineTo(-r * 0.42, -r * 0.42);
  ctx.bezierCurveTo(-r * 0.78, -r * 0.22, -r * 0.82, r * 0.42, -r * 0.4, r * 0.64);
  ctx.bezierCurveTo(-r * 0.18, r * 0.76, r * 0.18, r * 0.76, r * 0.4, r * 0.64);
  ctx.bezierCurveTo(r * 0.82, r * 0.42, r * 0.78, -r * 0.22, r * 0.42, -r * 0.42);
  ctx.lineTo(r * 0.42, -r * 0.62);
  ctx.lineTo(r * 1.0, -r * 0.62);
  ctx.lineTo(r * 1.0, -r * 0.4);
  ctx.lineTo(r * 0.7, -r * 0.4);
  ctx.bezierCurveTo(r * 1.02, -r * 0.06, r * 0.98, r * 0.62, r * 0.48, r * 0.86);
  ctx.bezierCurveTo(r * 0.2, r * 1.0, -r * 0.2, r * 1.0, -r * 0.48, r * 0.86);
  ctx.bezierCurveTo(-r * 0.98, r * 0.62, -r * 1.02, -r * 0.06, -r * 0.7, -r * 0.4);
  ctx.lineTo(-r * 1.0, -r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Mark VII helmet: rounded dome, angular breathing grille and glowing green lenses */
function helmet(p: Painter, t: number, seed: number) {
  const ctx = p.ctx;
  const dome = () => {
    ctx.moveTo(-28, 10);
    ctx.bezierCurveTo(-34, -24, -16, -44, 6, -44);
    ctx.bezierCurveTo(26, -44, 36, -30, 36, -12);
    ctx.lineTo(40, 4);
    ctx.lineTo(34, 24);
    ctx.lineTo(16, 30);
    ctx.lineTo(-18, 28);
    ctx.closePath();
  };
  p.part(dome, BLUE[0], BLUE[1], BLUE[2], 3, 10);
  // the faceplate: brow ridge, cheek and the downward-pointing grille
  p.part(() => rpoly(ctx, [12, -20, 38, -16, 46, 6, 40, 22, 24, 30, 12, 16], 4), BLUE[0], BLUE[1], BLUE[2], 2.4, 6);
  p.part(() => rpoly(ctx, [26, 6, 46, 6, 42, 26, 30, 30], 3), JOINT[0], JOINT[1], JOINT[2], 1.6, 3);
  ctx.strokeStyle = 'rgba(160,170,190,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(29 + i * 4, 10);
    ctx.lineTo(29 + i * 3.4, 27);
    ctx.stroke();
  }
  // vox grille disc at the side of the jaw
  p.part(() => ctx.arc(-4, 10, 10, 0, TAU), JOINT[0], JOINT[1], JOINT[2], 1.6, 3);
  ctx.fillStyle = 'rgba(200,210,230,0.35)';
  for (let i = 0; i < 3; i++) ctx.fillRect(-10, 5 + i * 4, 12, 1.4);
  // green lenses glowing
  const pulse = 0.85 + 0.15 * Math.sin(t * 3 + seed);
  ctx.fillStyle = '#0d2a0c';
  ctx.beginPath();
  ctx.ellipse(28, -8, 8, 6.5, 0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(${LENS},${0.95 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(29, -8, 6, 5, 0.1, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 30, -8, 22, LENS, 0.55 * pulse);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(30, -11, 3, 2);
  line(p, 'rgba(255,255,255,0.4)', 2, () => {
    ctx.moveTo(-20, -26);
    ctx.quadraticCurveTo(0, -42, 22, -38);
  });
}

/** The Captain, bareheaded: cropped dark hair, a gold laurel and service studs */
function captainHead(p: Painter, t: number) {
  const ctx = p.ctx;
  const K = SKIN;
  const face = () => {
    ctx.moveTo(-24, -16);
    ctx.bezierCurveTo(-26, -36, -6, -46, 10, -44);
    ctx.bezierCurveTo(26, -42, 32, -32, 33, -22);
    ctx.lineTo(35, -15);
    ctx.lineTo(32, -10);
    ctx.lineTo(40, 1);
    ctx.lineTo(33, 4);
    ctx.lineTo(35, 10);
    ctx.lineTo(33, 14);
    ctx.bezierCurveTo(35, 24, 30, 30, 18, 31);
    ctx.lineTo(0, 30);
    ctx.bezierCurveTo(-16, 26, -24, 12, -25, 0);
    ctx.closePath();
  };
  p.part(() => capsule(ctx, -6, 30, 2, 10, 20, 19), K[0], K[1], K[2]);
  p.part(face, K[0], K[1], K[2], 2.5, 9);
  ctx.save();
  ctx.beginPath();
  face();
  ctx.clip();
  ctx.fillStyle = 'rgba(50,34,26,0.25)';
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(10, 10, 40, 4);
  ctx.lineTo(40, 36);
  ctx.lineTo(-20, 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = K[1];
  ctx.beginPath();
  ctx.ellipse(-10, -4, 5, 9, 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
  // heavy brow, a steel-grey stare
  ctx.fillStyle = '#2a1d17';
  ctx.beginPath();
  ctx.moveTo(10, -22);
  ctx.lineTo(34, -19);
  ctx.lineTo(32, -14);
  ctx.lineTo(12, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe8de';
  ctx.beginPath();
  ctx.moveTo(19, -13);
  ctx.lineTo(30, -12);
  ctx.lineTo(28, -9);
  ctx.lineTo(20, -9.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5d7488';
  ctx.fillRect(24, -12.5, 3, 3);
  ctx.strokeStyle = 'rgba(70,34,22,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(32, 3);
  ctx.lineTo(28, 4);
  ctx.moveTo(20, 16);
  ctx.lineTo(32, 15);
  ctx.stroke();
  // a duelling scar along the jaw
  ctx.strokeStyle = 'rgba(150,70,60,0.8)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(4, 22);
  ctx.lineTo(18, 26);
  ctx.stroke();
  // cropped dark hair
  p.part(
    () => {
      ctx.moveTo(-26, -6);
      ctx.bezierCurveTo(-30, -36, -10, -50, 10, -48);
      ctx.bezierCurveTo(26, -46, 33, -36, 33, -26);
      ctx.bezierCurveTo(20, -32, 4, -32, -10, -28);
      ctx.lineTo(-16, -6);
      ctx.closePath();
    },
    '#4a3a30',
    '#1e1612',
    '#0a0706',
    2,
    5
  );
  // service studs on the brow
  ctx.fillStyle = '#d8d2c8';
  for (const [x, y] of [
    [18, -27],
    [24, -28],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, TAU);
    ctx.fill();
  }
  // the laurel: gold leaves along both sides of a band
  ctx.save();
  ctx.strokeStyle = GOLD[2];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-28, -18);
  ctx.quadraticCurveTo(0, -46, 30, -34);
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const x = lerp(-28, 30, k);
    const y = -18 - Math.sin(k * Math.PI) * 18 - k * 14 + 2;
    const a = -0.4 + k * 0.9;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + side * 0.7 + Math.PI);
      p.part(() => ctx.ellipse(6, 0, 7, 3, 0, 0, TAU), GOLD[0], GOLD[1], GOLD[2], 1.2, 2);
      ctx.restore();
    }
  }
  ctx.restore();
  void t;
}

/** Red cloak hanging from the Captain's shoulders, rolling in the draught */
function cape(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  const run = s.mode === 'out' || s.mode === 'back' ? 1 : 0;
  const w1 = Math.sin(t * 1.7) * 8 + run * 40;
  const w2 = Math.sin(t * 2.3 + 1) * 10 + run * 60;
  const top = pose.py - 140;
  p.part(
    () => {
      ctx.moveTo(-30, top);
      ctx.bezierCurveTo(-70 - w1 * 0.4, top + 80, -90 - w1, top + 170, -100 - w2, -10 - run * 40);
      ctx.lineTo(-70 - w2 * 0.8, -4 - run * 30);
      ctx.lineTo(-40 - w2 * 0.5, -16 - run * 20);
      ctx.lineTo(-10 - w2 * 0.3, -6 - run * 10);
      ctx.bezierCurveTo(-10, top + 140, 0, top + 60, 10, top);
      ctx.closePath();
    },
    RED[0],
    RED[1],
    RED[2],
    3,
    12
  );
  line(p, 'rgba(30,4,2,0.55)', 2, () => {
    ctx.moveTo(-26, top + 30);
    ctx.quadraticCurveTo(-60 - w1, top + 140, -80 - w2, -14);
    ctx.moveTo(-8, top + 40);
    ctx.quadraticCurveTo(-30 - w1 * 0.5, top + 140, -40 - w2 * 0.5, -18);
  });
  line(p, GOLD[1], 3, () => {
    ctx.moveTo(-100 - w2, -10 - run * 40);
    ctx.lineTo(-70 - w2 * 0.8, -4 - run * 30);
    ctx.lineTo(-40 - w2 * 0.5, -16 - run * 20);
    ctx.lineTo(-10 - w2 * 0.3, -6 - run * 10);
  });
}

/** Chapter banner on a tall pole: blue field, gold border, the omega and a skull finial */
function banner(p: Painter, t: number) {
  const ctx = p.ctx;
  const px = 52;
  const top = -560;
  ctx.fillStyle = '#2a2016';
  ctx.fillRect(px - 4, top, 8, 560);
  ctx.fillStyle = GOLD[1];
  ctx.fillRect(px - 5, top + 40, 10, 6);
  // crossbar
  p.part(() => rpoly(ctx, [px - 142, top + 52, px + 10, top + 52, px + 10, top + 62, px - 142, top + 62], 3), GOLD[0], GOLD[1], GOLD[2], 1.6, 3);
  // finial: a gilded skull with wings
  ctx.save();
  ctx.translate(px, top - 8);
  ctx.scale(0.5, 0.5);
  aquila(ctx, 0, -10, 0.24);
  ctx.restore();
  skull(ctx, px, top - 6, 11);
  const sway = Math.sin(t * 1.4) * 6;
  const cloth = () => {
    ctx.moveTo(px - 136, top + 60);
    ctx.lineTo(px + 4, top + 60);
    ctx.bezierCurveTo(px + 6 + sway * 0.4, top + 170, px + sway, top + 260, px + 2 + sway, top + 330);
    ctx.lineTo(px - 66 + sway, top + 296);
    ctx.lineTo(px - 136 + sway, top + 330);
    ctx.bezierCurveTo(px - 136 + sway, top + 260, px - 140 + sway * 0.4, top + 170, px - 136, top + 60);
    ctx.closePath();
  };
  p.part(cloth, '#3a6ccc', '#173f94', '#071735', 3, 14);
  ctx.save();
  ctx.beginPath();
  cloth();
  ctx.clip();
  ctx.strokeStyle = GOLD[1];
  ctx.lineWidth = 6;
  ctx.beginPath();
  cloth();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,150,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // laurels framing the chapter symbol
  ctx.strokeStyle = GOLD[0];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px - 66 + sway * 0.6, top + 180, 46, Math.PI * 0.75, Math.PI * 1.45);
  ctx.moveTo(px - 66 + sway * 0.6 + 46 * Math.cos(Math.PI * 1.55), top + 180 + 46 * Math.sin(Math.PI * 1.55));
  ctx.arc(px - 66 + sway * 0.6, top + 180, 46, Math.PI * 1.55, Math.PI * 2.25);
  ctx.stroke();
  omega(ctx, px - 66 + sway * 0.6, top + 178, 30, '#f2efe6');
  ctx.restore();
  // tassels
  ctx.fillStyle = '#b02a20';
  for (const x of [px - 136, px - 66, px + 2]) {
    ctx.fillRect(x + sway - 3, top + 320 + (x === px - 66 ? -34 : 0), 6, 26);
  }
}

function chainsword(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  const rev = s.revK;
  // grip and gilded crossguard
  p.part(() => rpoly(ctx, [-30, -6, 4, -7, 4, 7, -30, 6], 3), JOINT[0], JOINT[1], JOINT[2], 1.6, 3);
  p.part(() => rpoly(ctx, [2, -16, 18, -18, 22, 18, 2, 16], 4), GOLD[0], GOLD[1], GOLD[2], 2, 4);
  // motor housing and the blade
  p.part(() => rpoly(ctx, [18, -14, 50, -15, 52, 14, 18, 13], 4), BLUE[0], BLUE[1], BLUE[2], 2, 5);
  const x0 = 48;
  const x1 = 150;
  ctx.fillStyle = '#e2e4e8';
  const off = (s.chain * 8) % 9;
  ctx.beginPath();
  for (let x = x0 + off; x < x1 - 6; x += 9) {
    ctx.moveTo(x, -9);
    ctx.lineTo(x + 5, -17);
    ctx.lineTo(x + 7, -9);
  }
  ctx.fill();
  p.part(
    () => {
      ctx.moveTo(x0, -10);
      ctx.lineTo(x1 - 10, -10);
      ctx.quadraticCurveTo(x1 + 6, -4, x1 - 6, 8);
      ctx.lineTo(x0, 8);
      ctx.closePath();
    },
    '#dfe3e8',
    '#7b8189',
    '#33373d',
    2,
    5
  );
  line(p, 'rgba(30,32,36,0.8)', 1.4, () => {
    ctx.moveTo(x0 + 4, -1);
    ctx.lineTo(x1 - 12, -1);
  });
  ctx.fillStyle = GOLD[1];
  ctx.fillRect(x0 + 6, 2, 30, 3);
  if (rev > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,235,210,${(0.3 * rev).toFixed(3)})`;
    ctx.fillRect(x0, -16 + Math.sin(t * 90) * 1.4, x1 - x0 - 6, 7);
    glow(ctx, x1 - 20, -4, 50 * rev, '255,190,120', 0.5 * rev);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (s.mode === 'slash' && s.swing < 0.45) {
    // a smear trailing the blade through the cut
    const back = Math.min(2.6, pose.sa + 2.4);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,236,210,${0.22 - i * 0.06})`;
      ctx.lineWidth = 26 - i * 6;
      ctx.beginPath();
      ctx.arc(0, 0, 110 + i * 14, -back, 0);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Godwyn pattern boltgun: boxy receiver, sickle magazine, short barrel with a muzzle brake */
function bolter(p: Painter) {
  const ctx = p.ctx;
  p.part(() => rpoly(ctx, [-60, -10, -12, -16, -8, 10, -50, 18, -62, 12], 5), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 5);
  p.part(() => rpoly(ctx, [-16, -24, 82, -24, 88, -14, 88, 14, -14, 14], 5), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2.6, 8);
  p.part(() => rpoly(ctx, [84, -16, 116, -15, 118, 2, 84, 4], 3), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 4);
  p.part(() => rpoly(ctx, [114, -20, 130, -20, 130, 8, 114, 8], 3), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 4);
  // sickle magazine curving forward
  p.part(() => {
    ctx.moveTo(30, 12);
    ctx.lineTo(54, 12);
    ctx.quadraticCurveTo(66, 40, 58, 60);
    ctx.lineTo(40, 58);
    ctx.quadraticCurveTo(46, 38, 30, 12);
    ctx.closePath();
  }, BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 4);
  p.part(() => rpoly(ctx, [-6, 10, 12, 10, 8, 34, -10, 32], 4), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 4);
  // gold eagle on the receiver, sight block on top
  p.part(() => rpoly(ctx, [20, -10, 44, -10, 40, 2, 24, 2], 3), GOLD[0], GOLD[1], GOLD[2], 1.4, 2);
  p.part(() => rpoly(ctx, [0, -34, 30, -34, 30, -24, 0, -24], 3), BOLT_C[0], BOLT_C[1], BOLT_C[2], 1.6, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(118, -14, 10, 4);
  ctx.fillRect(118, -2, 10, 4);
  ctx.strokeStyle = 'rgba(220,230,240,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, -20);
  ctx.lineTo(84, -20);
  ctx.stroke();
}

function boltPistol(p: Painter) {
  const ctx = p.ctx;
  p.part(() => rpoly(ctx, [-6, -14, 46, -14, 50, -4, 50, 8, -4, 8], 4), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 5);
  p.part(() => rpoly(ctx, [-2, 6, 14, 6, 10, 30, -6, 28], 4), BOLT_C[0], BOLT_C[1], BOLT_C[2], 2, 4);
  p.part(() => rpoly(ctx, [10, -10, 26, -10, 24, -2, 12, -2], 2), GOLD[0], GOLD[1], GOLD[2], 1.2, 2);
}

/* ---------- the Great Devourer ---------- */

function drawFoe(p: Painter, f: Foe, t: number) {
  const ctx = p.ctx;
  const S = fScale(f);
  const warrior = f.kind === 'warrior';
  ctx.save();
  ctx.globalAlpha = f.fade;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(f.x, zy(f.z) + 2, (warrior ? 100 : 90) * S, 10 * S, 0, 0, TAU);
  ctx.fill();
  const lift = f.state === 'run' && !warrior ? f.leap * 70 * S : 0;
  ctx.translate(f.x + f.hit * Math.sin(t * 90) * 3 * S, zy(f.z) - lift);
  if (f.state === 'dead') {
    const k = easeOutCubic(f.fall);
    ctx.translate(30 * k * S, 0);
    ctx.rotate(k * (warrior ? 1.3 : 0.5));
    ctx.translate(0, k * (warrior ? -20 : 30) * S);
    ctx.scale(1, 1 - k * (warrior ? 0 : 0.35));
  } else if (!warrior && f.state === 'run') ctx.rotate(-f.leap * 0.25);
  ctx.scale(-S, S);
  p.lx = -0.55;
  p.ly = -0.83;
  p.back = 'rgba(170,200,255,0.45)';
  p.bx = 0.9;
  p.by = -0.35;
  p.backW = 2.2;
  p.outline = 'rgba(10,4,12,0.92)';
  p.outlineW = 1.6;
  if (warrior) drawWarrior(p, f, t);
  else drawGaunt(p, f, t);
  ctx.restore();
  p.outline = '';
  p.back = '';
}

/** Digitigrade Tyranid leg: thigh forward, shin back, long clawed foot */
function nLeg(p: Painter, hx: number, hy: number, fx: number, fy: number, back: boolean, k: number) {
  const ctx = p.ctx;
  const F = back ? FLESH_D : FLESH;
  const B = back ? BONE_D : BONE;
  const [kx, ky] = ik(hx, hy, fx - 20 * k, fy - 40 * k, 52 * k, 48 * k, 1);
  p.part(() => capsule(ctx, hx, hy, kx, ky, 20 * k, 13 * k), F[0], F[1], F[2]);
  p.part(() => capsule(ctx, kx, ky, fx - 20 * k, fy - 40 * k, 12 * k, 9 * k), F[0], F[1], F[2]);
  p.part(() => capsule(ctx, fx - 20 * k, fy - 40 * k, fx, fy - 4, 8 * k, 6 * k), B[0], B[1], B[2], 1.6, 3);
  // thigh carapace plate
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(Math.atan2(ky - hy, kx - hx));
  p.part(() => rpoly(ctx, [-6, -18 * k, 40 * k, -14 * k, 50 * k, -2, 30 * k, 4 * k, -4, 0], 6), B[0], B[1], B[2], 2, 4);
  ctx.restore();
  // claws
  ctx.fillStyle = B[2];
  ctx.beginPath();
  ctx.moveTo(fx - 4, fy - 6);
  ctx.lineTo(fx + 22 * k, fy);
  ctx.lineTo(fx - 2, fy + 1);
  ctx.closePath();
  ctx.fill();
}

/** Hormagaunt: a hunched, leaping killer with two scything talons raised */
function drawGaunt(p: Painter, f: Foe, t: number) {
  const ctx = p.ctx;
  const run = f.state === 'run' ? 1 : 0;
  const ph = f.ph;
  const bob = Math.sin(ph * 2) * 4 * run;
  const tuck = f.leap;
  // tail lashing out behind
  const tw = Math.sin(t * 6 + f.seed) * 10;
  p.part(() => {
    ctx.moveTo(-30, -96 + bob);
    ctx.bezierCurveTo(-80, -100 + tw * 0.3, -130, -80 + tw, -170, -60 + tw * 1.4);
    ctx.lineTo(-160, -54 + tw * 1.3);
    ctx.bezierCurveTo(-120, -66 + tw, -80, -74, -30, -76 + bob);
    ctx.closePath();
  }, FLESH[0], FLESH[1], FLESH[2], 2, 6);
  // far legs and the far talon
  nLeg(p, -16, -86 + bob, lerp(-46 + Math.cos(ph) * 40 * run, -40, tuck), lerp(-Math.max(0, Math.sin(ph)) * 26 * run, -30, tuck), true, 1);
  talon(p, 40, -120 + bob, true, t, f);
  // body: chest up, back carapace in overlapping bone plates
  p.part(() => rpoly(ctx, [-40, -70, -40, -106, 0, -126, 50, -136, 72, -118, 60, -88, 20, -72], 14, bob), FLESH[0], FLESH[1], FLESH[2], 2.6, 10);
  for (let i = 0; i < 3; i++) {
    const x = -34 + i * 26;
    p.part(() => rpoly(ctx, [x, -100 - i * 8, x + 30, -114 - i * 8, x + 40, -104 - i * 8, x + 8, -92 - i * 7], 6, bob), BONE[0], BONE[1], BONE[2], 2, 4);
  }
  line(p, 'rgba(30,6,30,0.5)', 1.6, () => {
    ctx.moveTo(10, -80 + bob);
    ctx.quadraticCurveTo(30, -84 + bob, 56, -94 + bob);
  });
  // the head: low and long, a bone crest swept back over a fanged jaw
  ctx.save();
  ctx.translate(68, -122 + bob);
  ctx.rotate(0.15 - f.roar * 0.2);
  p.part(() => rpoly(ctx, [-14, -10, 28, -14, 46, -4, 44, 8, 20, 14, -12, 10], 7), FLESH[0], FLESH[1], FLESH[2], 2, 5);
  p.part(() => rpoly(ctx, [-30, -30, -6, -22, 30, -18, 44, -6, 10, -8, -16, -10], 6), BONE[0], BONE[1], BONE[2], 2, 4);
  const jaw = 6 + f.roar * 10 + (run ? Math.max(0, Math.sin(t * 9 + f.seed)) * 4 : 0);
  ctx.fillStyle = '#2a0618';
  ctx.beginPath();
  ctx.moveTo(18, 6);
  ctx.lineTo(46, 4);
  ctx.lineTo(38, 6 + jaw);
  ctx.lineTo(16, 10 + jaw * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2ead6';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(22 + i * 6, 5);
    ctx.lineTo(24 + i * 6, 10);
    ctx.lineTo(26 + i * 6, 5);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 30, -6, 8, '255,220,60', 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffe050';
  ctx.beginPath();
  ctx.ellipse(30, -6, 3, 2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  nLeg(p, 10, -84 + bob, lerp(40 + Math.cos(ph + Math.PI) * 40 * run, 30, tuck), lerp(-Math.max(0, Math.sin(ph + Math.PI)) * 26 * run, -36, tuck), false, 1);
  talon(p, 50, -116 + bob, false, t, f);
}

/** A scything talon: a jointed arm ending in a long, hooked bone blade */
function talon(p: Painter, sx: number, sy: number, back: boolean, t: number, f: Foe) {
  const ctx = p.ctx;
  const F = back ? FLESH_D : FLESH;
  const B = back ? BONE_D : BONE;
  const strike = f.state === 'run' ? Math.max(0, Math.sin(f.ph * 0.5 + (back ? 0.6 : 0))) : 0;
  const ex = sx + 20;
  const ey = sy - 40 + strike * 20;
  p.part(() => capsule(ctx, sx, sy, ex, ey, 11, 8), F[0], F[1], F[2]);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(-0.4 + strike * 1.1 + Math.sin(t * 3 + f.seed) * 0.05);
  p.part(() => {
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(40, -24, 86, -6);
    ctx.quadraticCurveTo(96, 0, 92, 12);
    ctx.quadraticCurveTo(70, -2, 4, 8);
    ctx.closePath();
  }, B[0], B[1], B[2], 2, 4);
  ctx.restore();
}

/** Tyranid Warrior: upright and tall, a bonesword raised and a deathspitter in the lower hands */
function drawWarrior(p: Painter, f: Foe, t: number) {
  const ctx = p.ctx;
  const run = f.state === 'run' ? 1 : 0;
  const ph = f.ph;
  const bob = Math.sin(ph * 2) * 4 * run;
  const tw = Math.sin(t * 3 + f.seed) * 8;
  const roar = f.roar;
  p.part(() => {
    ctx.moveTo(-30, -150);
    ctx.bezierCurveTo(-90, -120 + tw * 0.3, -140, -60 + tw, -200, -30 + tw * 1.4);
    ctx.lineTo(-190, -22 + tw * 1.3);
    ctx.bezierCurveTo(-130, -40 + tw, -80, -90, -20, -120);
    ctx.closePath();
  }, FLESH[0], FLESH[1], FLESH[2], 2, 6);
  nLeg(p, -16, -150 + bob, -40 + Math.cos(ph) * 40 * run, -Math.max(0, Math.sin(ph)) * 24 * run, true, 1.5);
  // far upper arm with a bonesword held high
  ctx.save();
  ctx.translate(-10, -290 + bob);
  ctx.rotate(-1.2 + Math.sin(t * 1.5) * 0.08 - roar * 0.3);
  p.part(() => capsule(ctx, 0, 0, 60, 0, 13, 10), FLESH_D[0], FLESH_D[1], FLESH_D[2]);
  p.part(() => {
    ctx.moveTo(56, -8);
    ctx.quadraticCurveTo(110, -26, 170, -12);
    ctx.quadraticCurveTo(110, 4, 56, 10);
    ctx.closePath();
  }, BONE_D[0], BONE_D[1], BONE_D[2], 2, 4);
  ctx.restore();
  // torso: segmented belly and a heavy carapace chest
  p.part(() => rpoly(ctx, [-34, -140, -40, -230, -10, -300, 40, -310, 64, -270, 54, -200, 30, -140], 16, bob), FLESH[0], FLESH[1], FLESH[2], 3, 12);
  line(p, 'rgba(30,6,30,0.45)', 2, () => {
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-30, -160 - i * 18 + bob);
      ctx.quadraticCurveTo(10, -152 - i * 18 + bob, 40, -162 - i * 18 + bob);
    }
  });
  p.part(() => rpoly(ctx, [-30, -236, -26, -296, 20, -318, 66, -296, 72, -250, 40, -232], 12, bob), BONE[0], BONE[1], BONE[2], 3, 9);
  p.part(() => rpoly(ctx, [-46, -270, -40, -320, -6, -330, -14, -280], 8, bob), BONE[0], BONE[1], BONE[2], 2, 5);
  // lower arms with the deathspitter
  ctx.save();
  ctx.translate(40, -210 + bob);
  p.part(() => capsule(ctx, -30, -10, 20, 26, 12, 10), FLESH[0], FLESH[1], FLESH[2]);
  ctx.translate(20, 30);
  ctx.rotate(-0.15);
  p.part(() => {
    ctx.moveTo(-30, -14);
    ctx.bezierCurveTo(10, -30, 60, -22, 92, -8);
    ctx.lineTo(96, 8);
    ctx.bezierCurveTo(60, 20, 10, 24, -30, 12);
    ctx.closePath();
  }, FLESH[0], FLESH[1], FLESH[2], 2.4, 7);
  p.part(() => rpoly(ctx, [-20, -18, 40, -24, 60, -14, 20, -8], 6), BONE[0], BONE[1], BONE[2], 2, 4);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 96, 0, 18 + f.flash * 40, '150,255,90', 0.6 + f.flash * 0.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // head: a long sweeping crest, glowing eyes, a maw of needles
  ctx.save();
  ctx.translate(58, -322 + bob);
  ctx.rotate(0.1 - roar * 0.25);
  p.part(() => rpoly(ctx, [-20, -12, 30, -16, 52, -4, 48, 12, 20, 20, -16, 12], 8), FLESH[0], FLESH[1], FLESH[2], 2, 5);
  p.part(() => rpoly(ctx, [-70, -50, -30, -30, 20, -26, 50, -10, 10, -10, -30, -14], 8), BONE[0], BONE[1], BONE[2], 2.4, 6);
  ctx.fillStyle = '#2a0618';
  ctx.beginPath();
  ctx.moveTo(24, 10);
  ctx.lineTo(52, 6);
  ctx.lineTo(44, 14 + roar * 14);
  ctx.lineTo(20, 18 + roar * 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2ead6';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(26 + i * 6, 9);
    ctx.lineTo(28 + i * 6, 14);
    ctx.lineTo(30 + i * 6, 9);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 34, -4, 12, '255,220,60', 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // near upper arm, scything talon raised
  ctx.save();
  ctx.translate(26, -284 + bob);
  ctx.rotate(-0.9 + Math.sin(t * 1.8) * 0.1 - roar * 0.3);
  p.part(() => capsule(ctx, 0, 0, 64, 0, 15, 11), FLESH[0], FLESH[1], FLESH[2]);
  p.part(() => {
    ctx.moveTo(58, -10);
    ctx.quadraticCurveTo(120, -34, 186, -10);
    ctx.quadraticCurveTo(196, 0, 188, 10);
    ctx.quadraticCurveTo(120, 0, 58, 12);
    ctx.closePath();
  }, BONE[0], BONE[1], BONE[2], 2.4, 5);
  ctx.restore();
  nLeg(p, 14, -148 + bob, 40 + Math.cos(ph + Math.PI) * 40 * run, -Math.max(0, Math.sin(ph + Math.PI)) * 24 * run, false, 1.5);
}

/* ---------- effects ---------- */

function muzzleFlash(ctx: CanvasRenderingContext2D, m: Marine) {
  if (m.flash <= 0.05) return;
  const f = m.flash;
  const S = zk(m.z) * m.size;
  ctx.save();
  ctx.translate(m.mx, m.my);
  ctx.rotate(m.aim);
  ctx.scale(S, S);
  const Lf = 60 + Math.random() * 30;
  const W = 14 + Math.random() * 6;
  ctx.fillStyle = `rgba(255,160,70,${0.6 * f})`;
  ctx.beginPath();
  ctx.moveTo(-4, -W);
  ctx.lineTo(Lf, 0);
  ctx.lineTo(-4, W);
  ctx.lineTo(18, W * 2);
  ctx.lineTo(6, 0);
  ctx.lineTo(18, -W * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(ctx, m.mx, m.my, 34 * S, '255,235,190', 0.8 * f);
  glow(ctx, m.mx, m.my, 160 * S, '255,170,80', 0.22 * f);
}

function drawStrike(ctx: CanvasRenderingContext2D, s: State, t: number) {
  if (s.strike < 0) return;
  const x = s.strikeX;
  const y = zy(s.strikeZ);
  const k = zk(s.strikeZ);
  const T = s.strike;
  const top = s.st.top - 80;
  ctx.globalCompositeOperation = 'lighter';
  if (T < 1) {
    // targeting: a thin flickering beam and a closing ring on the ground
    const a = 0.3 + 0.3 * Math.sin(t * 40);
    ctx.strokeStyle = `rgba(255,60,40,${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, y);
    ctx.stroke();
    const r = lerp(260, 40, T) * k;
    ctx.strokeStyle = `rgba(255,70,50,${0.7})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.24, 0, 0, TAU);
    ctx.stroke();
    glow(ctx, x, y, 40 * k, '255,80,60', 0.6 + 0.3 * Math.sin(t * 30));
  } else {
    // the lance: a white-hot column narrowing as it fades, a ring of fire on the ground
    const u = T - 1;
    const fade = Math.max(0, 1 - u / 1.6);
    const wcol = Math.max(10, (u < 0.15 ? 200 : 150 - u * 80) * k);
    const g = ctx.createLinearGradient(x - wcol, 0, x + wcol, 0);
    g.addColorStop(0, 'rgba(120,170,255,0)');
    g.addColorStop(0.3, `rgba(150,200,255,${0.6 * fade})`);
    g.addColorStop(0.5, `rgba(255,255,255,${fade})`);
    g.addColorStop(0.7, `rgba(150,200,255,${0.6 * fade})`);
    g.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - wcol, top, wcol * 2, y - top);
    glow(ctx, x, y, 420 * k, '200,220,255', 0.7 * fade);
    glow(ctx, x, y - 60, 220 * k, '255,255,255', 0.8 * fade);
    const rr = (60 + u * 520) * k;
    ctx.strokeStyle = `rgba(255,170,90,${0.8 * fade})`;
    ctx.lineWidth = 10 * k;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.24, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawEffects(ctx: CanvasRenderingContext2D, s: State) {
  for (const p of s.sparks.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 3) {
      ctx.globalAlpha = k * 0.4;
      ctx.fillStyle = '#5a4c44';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.8 - k * 0.8), 0, TAU);
      ctx.fill();
    } else if (p.kind === 6) {
      ctx.globalAlpha = k * 0.4;
      ctx.fillStyle = '#4a1050';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2 - k), 0, TAU);
      ctx.fill();
    } else if (p.kind === 4) {
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = '#7a1a6a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (p.kind === 5) {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = '#cbbf9e';
      ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // bolts in flight: a bright shell with a rocket trail
  for (const b of s.bolts) {
    if (!b.on) continue;
    if (b.kind === 0) {
      const len = 0.03;
      ctx.strokeStyle = 'rgba(255,170,80,0.5)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,245,220,0.95)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * len * 0.4, b.y - b.vy * len * 0.4);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      glow(ctx, b.x, b.y, 16, '255,200,120', 0.8);
    } else {
      glow(ctx, b.x, b.y, 22, '150,255,90', 0.9);
      ctx.fillStyle = 'rgba(210,255,170,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, TAU);
      ctx.fill();
    }
  }
  for (const p of s.sparks.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 0 || p.kind === 1 || p.kind === 9) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.kind === 0 ? '#fff0c0' : p.kind === 9 ? '#a8ff70' : '#ffa050';
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    } else if (p.kind === 7) {
      ctx.globalAlpha = 1;
      glow(ctx, p.x, p.y, p.size * (2.4 - k), k > 0.5 ? '255,220,150' : '255,120,40', 0.9 * k);
    } else if (p.kind === 8) {
      ctx.globalAlpha = 1;
      glow(ctx, p.x, p.y, p.size, '255,150,70', 0.35 * k);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (const b of s.brass.items) {
    if (b.life <= 0) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.size, b.size);
    ctx.globalAlpha = Math.min(1, b.life * 2);
    ctx.fillStyle = '#d8a84a';
    ctx.fillRect(-6, -3, 12, 6);
    ctx.fillStyle = '#fff0b0';
    ctx.fillRect(-6, -3, 12, 1.6);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawMark(ctx: CanvasRenderingContext2D, s: State, t: number) {
  if (s.markOn <= 0.01) return;
  const k = s.markOn;
  const r = 22 + (1 - k) * 12;
  ctx.save();
  ctx.translate(s.markX, s.markY);
  ctx.rotate(t * 1.5);
  ctx.strokeStyle = `rgba(255,200,80,${0.85 * k})`;
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

/** Two vox-rune buttons, top left: orbital lance and battle cry, each with a cooldown ring */
function drawButtons(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number) {
  if (!env.interactive) {
    s.btn.r = 0;
    return;
  }
  const hs = clamp(Math.min(env.w / 1100, env.h / 620), 0.6, 1.1);
  const r = 24 * hs;
  const x = 22 * hs + r;
  const y = 18 * hs + r;
  const gap = r * 2.6;
  s.btn.x = x;
  s.btn.y = y;
  s.btn.r = r;
  s.btn.gap = gap;
  const one = (cx: number, cd: number, max: number, glyph: () => void) => {
    const ready = cd <= 0;
    ctx.fillStyle = 'rgba(8,10,20,0.6)';
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ready ? `rgba(240,200,110,${0.7 + 0.2 * Math.sin(t * 3)})` : 'rgba(200,200,210,0.25)';
    ctx.lineWidth = 2 * hs;
    ctx.stroke();
    if (!ready) {
      ctx.strokeStyle = 'rgba(240,200,110,0.8)';
      ctx.lineWidth = 3 * hs;
      ctx.beginPath();
      ctx.arc(cx, y, r - 4 * hs, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd / max));
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(hs, hs);
    ctx.globalAlpha = ready ? 1 : 0.45;
    glyph();
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  one(x, s.strikeCd, STRIKE_CD, () => {
    // a lance striking a target ring
    ctx.strokeStyle = '#f0e6d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 8, 13, 4, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#f0e6d0';
    ctx.beginPath();
    ctx.moveTo(-3, -16);
    ctx.lineTo(3, -16);
    ctx.lineTo(1.5, 8);
    ctx.lineTo(-1.5, 8);
    ctx.closePath();
    ctx.fill();
  });
  one(x + gap, s.cryCd, CRY_CD, () => omega(ctx, 0, -2, 12, '#f0e6d0'));
}
