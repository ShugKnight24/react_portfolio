import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  capsule,
  drawLayer,
  enterStage,
  fitStage,
  freeLayer,
  glow,
  hash,
  makeLayer,
  makeStage,
  Painter,
  Pool,
  prepLayer,
  smooth,
  startHum,
  shapeHum,
  stopHum,
  toStageX,
  toStageY,
  vignette,
} from './games-kit';
import type { Hum, Stage } from './games-kit';
import { chiefFigure, drawRing, FSH, frame, GRIP, HANDGUARD, knee, line, newArm, NSH, PELVIS, reach, rpoly, seg, setArm } from './halo-kit';
import type { Arm, ChiefPose } from './halo-kit';

/**
 * Master Chief against a Sangheili Elite on a ridge under a ringworld. The Chief fires his
 * MA5 at the pointer; the Elite's shield shimmers with each hit and pops when it runs dry.
 * Then it roars, lights its energy sword and charges. Dodge the lunge and it is left open
 * for a melee; meet it with a melee mid-charge to knock it back; stick a plasma grenade
 * for the big finish. Each Elite that falls is replaced by a higher rank: blue Minor,
 * red Major, gold Zealot.
 */

/* ---------- constants ---------- */

const CHIEF_HOME = -300;
const ELITE_HOME = 290;
/** Chief and Elite are drawn at these scales over their design units */
const CH = 1;
const EK = 1.04;
const MAX_NADES = 3;
const MAX_BOLTS = 10;
const MAX_RINGS = 4;
const MAX_TRACERS = 12;
const TRAIL = 12;
/** Gesture thresholds (CSS px and seconds) */
const SWIPE = 56;
const SWIPE_T = 0.42;
const HOLD_T = 0.1;
/** How close the Elite must be for a melee to connect, in stage units */
const MELEE_R = 340;
const SLASH_R = 330;

// three painted values per material; seams and speculars add the fourth
const EL_SUIT = ['#6c6878', '#302d38', '#131117'] as const;
const EL_SUIT_D = ['#4e4b58', '#221f28', '#0c0b10'] as const;
const SKIN = ['#958a7b', '#4b4239', '#1c1714'] as const;
const SKIN_D = ['#6e6457', '#352e28', '#140f0d'] as const;

type Tone3 = readonly [string, string, string];
interface Rank {
  A: Tone3;
  D: Tone3;
  /** Light strips set into the armour, as an rgb triple */
  lit: string;
  /** Gilded trim along the plate edges */
  trim: string;
  shield: number;
  speed: number;
}

/** Minor (blue), Major (red), Zealot (gold) */
const RANKS: readonly Rank[] = [
  { A: ['#a8bcff', '#3451c6', '#121b5c'], D: ['#7b8ed6', '#273c92', '#0c1342'], lit: '120,210,255', trim: 'rgba(196,226,255,0.9)', shield: 1, speed: 900 },
  { A: ['#ffa49a', '#b3242d', '#470913'], D: ['#cc716b', '#81161d', '#2c050a'], lit: '255,150,110', trim: 'rgba(255,214,170,0.9)', shield: 1.3, speed: 1020 },
  { A: ['#ffe9a6', '#c79227', '#4f3306'], D: ['#d2b671', '#8e6518', '#2f1d03'], lit: '255,226,140', trim: 'rgba(255,246,206,0.95)', shield: 1.6, speed: 1120 },
];

// terrain silhouette (stage units), smoothed by cosine interpolation
const TERRAIN: readonly (readonly [number, number])[] = [
  [-1600, -150],
  [-760, -176],
  [-520, -214],
  [-360, -232],
  [-230, -226],
  [-110, -186],
  [10, -148],
  [160, -128],
  [330, -124],
  [520, -142],
  [760, -120],
  [1600, -112],
];

function groundY(x: number) {
  for (let i = 0; i < TERRAIN.length - 1; i++) {
    const [x0, y0] = TERRAIN[i];
    const [x1, y1] = TERRAIN[i + 1];
    if (x <= x1) {
      const k = clamp((x - x0) / (x1 - x0), 0, 1);
      const m = (1 - Math.cos(k * Math.PI)) / 2;
      return y0 + (y1 - y0) * m;
    }
  }
  return TERRAIN[TERRAIN.length - 1][1];
}

/* ---------- state ---------- */

interface Nade {
  on: number; // 0 off, 1 flying, 2 stuck
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arc: number;
  t: number;
  dur: number;
  fuse: number;
  elite: boolean;
  ox: number;
  oy: number;
  beep: number;
}

interface Bolt {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  r: number;
  rgb: string;
}

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}

type ChiefMode = 'ready' | 'melee' | 'throw' | 'dodge' | 'hit' | 'down';
type EliteMode = 'enter' | 'stalk' | 'pop' | 'roar' | 'charge' | 'slash' | 'recover' | 'stagger' | 'retreat' | 'dying';

interface State {
  st: Stage;
  bg: HTMLCanvasElement;
  paint: Painter | null;
  sparks: Pool;
  dust: Pool;
  nades: Nade[];
  bolts: Bolt[];
  rings: Ring[];
  tracers: Tracer[];
  // input
  pressing: boolean;
  pressT: number;
  downX: number;
  downY: number;
  gesture: 'none' | 'fire' | 'done';
  keyFire: boolean;
  aimX: number;
  aimY: number;
  /** Aim with the pointer, or straight at the Elite (keyboard and demo) */
  aimPointer: boolean;
  touched: boolean;
  demoT: number;
  demoStep: number;
  // chief
  cx: number;
  cy: number;
  hop: number;
  cmode: ChiefMode;
  cT: number;
  cFrom: number;
  cHit: boolean;
  firing: boolean;
  fireCD: number;
  burst: number;
  recoil: number;
  muzzle: number;
  muzX: number;
  muzY: number;
  aimA: number;
  cShield: number;
  cFlare: number;
  cDelay: number;
  alarm: number;
  lean: number;
  crouch: number;
  walkPh: number;
  front: Arm;
  back: Arm;
  restF: Arm;
  restB: Arm;
  gripX: number;
  gripY: number;
  rifleA: number;
  rAim: number;
  thrown: boolean;
  handX: number;
  handY: number;
  chestX: number;
  chestY: number;
  // elite
  rank: number;
  ex: number;
  ey: number;
  ehop: number;
  evx: number;
  emode: EliteMode;
  eT: number;
  eFrom: number;
  eDone: boolean;
  shield: number;
  health: number;
  sinceHit: number;
  shimmer: number;
  pop: number;
  hurt: number;
  bar: number;
  ign: number;
  eAim: number;
  eFire: number;
  eBurst: number;
  eBoltT: number;
  aggr: number;
  eLean: number;
  eCrouch: number;
  runPh: number;
  run: number;
  eNear: Arm;
  eFar: Arm;
  eHead: number;
  mouth: number;
  fall: number;
  alpha: number;
  bladeX: number;
  bladeY: number;
  bladeA: number;
  trail: Float32Array;
  trailN: number;
  trailHead: number;
  kills: number[];
  // feel
  shake: number;
  flash: number;
  red: number;
  stop: number;
  spill: number;
  spillX: number;
  spillY: number;
  spillRgb: string;
  hum: Hum | null;
  time: number;
}

/* ---------- pose helpers ---------- */

/** Rifle grip in the torso frame: shouldered, and lowered in one hand */
const RIFLE_AIM = [46, -140] as const;
const RIFLE_LOW = [22, -66, 0.95] as const;
const RIFLE_K = 0.96;
/** Muzzle in the rifle's own frame */
const MUZZLE = [120, -2] as const;
/** Throw: arm angles in the torso frame (0 = forward, +PI/2 = down) */
const WIND_F = newArm(-2.55, -1.95);
const REL_F = newArm(-0.32, -0.12);
const FOLLOW_F = newArm(0.95, 1.25);

function dampArm(out: Arm, a1: number, a2: number, rate: number, dt: number) {
  out.a1 = damp(out.a1, a1, rate, dt);
  out.a2 = damp(out.a2, a2, rate, dt);
}

const towards = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'none',
    touchAction: 'none',
    posterTime: 4.7,
    init: (env) => ({
      st: makeStage(),
      bg: makeLayer(),
      paint: new Painter(env.ctx),
      sparks: new Pool(320),
      dust: new Pool(70),
      nades: Array.from({ length: MAX_NADES }, () => ({
        on: 0,
        x: 0,
        y: 0,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        arc: 0,
        t: 0,
        dur: 1,
        fuse: 0,
        elite: false,
        ox: 0,
        oy: 0,
        beep: 0,
      })),
      bolts: Array.from({ length: MAX_BOLTS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
      rings: Array.from({ length: MAX_RINGS }, () => ({ x: 0, y: 0, life: 0, max: 1, r: 0, rgb: '120,190,255' })),
      tracers: Array.from({ length: MAX_TRACERS }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0, life: 0 })),
      pressing: false,
      pressT: 0,
      downX: 0,
      downY: 0,
      gesture: 'none',
      keyFire: false,
      aimX: ELITE_HOME,
      aimY: -320,
      aimPointer: false,
      touched: false,
      demoT: 0,
      demoStep: 0,
      cx: CHIEF_HOME,
      cy: groundY(CHIEF_HOME),
      hop: 0,
      cmode: 'ready',
      cT: 0,
      cFrom: CHIEF_HOME,
      cHit: false,
      firing: false,
      fireCD: 0,
      burst: 0,
      recoil: 0,
      muzzle: 0,
      muzX: 0,
      muzY: 0,
      aimA: 0,
      cShield: 1,
      cFlare: 0,
      cDelay: 0,
      alarm: 0,
      lean: 0.04,
      crouch: 0,
      walkPh: 0,
      front: newArm(1.4, 0.9),
      back: newArm(1.7, 1.5),
      restF: newArm(1.4, 0.9),
      restB: newArm(1.7, 1.5),
      gripX: RIFLE_AIM[0],
      gripY: RIFLE_AIM[1],
      rifleA: 0,
      rAim: 1,
      thrown: false,
      handX: 0,
      handY: 0,
      chestX: CHIEF_HOME,
      chestY: -400,
      rank: 0,
      ex: ELITE_HOME,
      ey: groundY(ELITE_HOME),
      ehop: 0,
      evx: 0,
      emode: 'stalk',
      eT: 0,
      eFrom: ELITE_HOME,
      eDone: false,
      shield: 1,
      health: 1,
      sinceHit: 9,
      shimmer: 0,
      pop: 0,
      hurt: 0,
      bar: 0,
      ign: 0,
      eAim: 0,
      eFire: 2.2,
      eBurst: 0,
      eBoltT: 0,
      aggr: 9,
      eLean: 0.5,
      eCrouch: 22,
      runPh: 0,
      run: 0,
      eNear: newArm(0.95, 0.5),
      eFar: newArm(1.0, 0.7),
      eHead: 0.2,
      mouth: 0.2,
      fall: 0,
      alpha: 1,
      bladeX: 0,
      bladeY: 0,
      bladeA: 0,
      trail: new Float32Array(TRAIL * 4),
      trailN: 0,
      trailHead: 0,
      kills: [],
      shake: 0,
      flash: 0,
      red: 0,
      stop: 0,
      spill: 0,
      spillX: 0,
      spillY: 0,
      spillRgb: '110,170,255',
      hum: null,
      time: 0,
    }),
    resize: (s, env) => {
      fitStage(s.st, env.w, env.h);
      const c = prepLayer(s.bg, env.w, env.h, env.dpr, s.st);
      if (c) renderBackdrop(c, s.st);
    },
    update: (s, env, dtRaw, t) => {
      const rm = env.reducedMotion;
      s.time = t;
      // hit-stop: freeze the simulation for a few frames on big impacts
      let dt = dtRaw;
      if (s.stop > 0) {
        s.stop -= dtRaw;
        dt = dtRaw * 0.08;
      }
      if (!s.touched) runDemo(s, env, dt);

      // a press that has not become a swipe turns into held fire
      if (s.pressing) {
        s.pressT += dtRaw;
        if (s.gesture === 'none' && s.pressT > HOLD_T) s.gesture = 'fire';
      }
      s.firing = (s.pressing && s.gesture === 'fire') || s.keyFire || s.burst > 0;

      // reduced motion: stay awake while anything is in play
      if (rm && s.touched && busy(s)) env.wake(300);
      updateChief(s, env, dt);
      updateElite(s, env, dt);
      updateNades(s, env, dt);
      updateBolts(s, env, dt);

      s.sparks.step(dt, groundY);
      if (Math.random() < dt * 9) {
        const st = s.st;
        s.dust.spawn(rand(st.left, st.right), rand(-640, -140), rand(8, 26), rand(-8, 4), rand(4, 8), rand(0.8, 2.2), Math.random() < 0.25 ? 1 : 0);
      }
      s.dust.step(dt);
      for (const r of s.rings) if (r.life > 0) r.life -= dt;
      for (const tr of s.tracers) if (tr.life > 0) tr.life -= dtRaw;

      s.shake = Math.max(0, s.shake - dtRaw * 2.8);
      s.flash = Math.max(0, s.flash - dtRaw * 3.2);
      s.red = Math.max(0, s.red - dtRaw * 1.2);
      s.spill = Math.max(0, s.spill - dtRaw * 1.8);
      s.cFlare = Math.max(0, s.cFlare - dt * 2.4);
      s.shimmer = Math.max(0, s.shimmer - dt * 2.6);
      s.pop = Math.max(0, s.pop - dt * 1.4);
      s.hurt = Math.max(0, s.hurt - dt * 4);
      s.bar = Math.max(0, s.bar - dt * 0.5);
      s.muzzle = Math.max(0, s.muzzle - dtRaw * 22);
      s.recoil = damp(s.recoil, 0, 18, dt);

      // the sword's hum follows its glow
      if (s.hum) shapeHum(s.hum, 66 + s.ign * 36 + s.run * 20, 480 + s.ign * 800, 0.045 * s.ign);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const st = s.st;
      const p = s.paint;
      if (!p) return;
      p.ctx = ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#120d2c';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 11 * st.k;
      if (amp > 0.05) ctx.translate(Math.sin(t * 87) * amp, Math.cos(t * 71) * amp * 0.7);
      drawLayer(ctx, s.bg, w, h);

      ctx.save();
      enterStage(ctx, st);
      drawSkyLife(ctx, s, t);
      drawElite(p, s, t);
      drawBolts(ctx, s);
      drawChief(p, s, t);
      drawEffects(ctx, s, t);
      if (env.interactive) drawEliteBar(ctx, s);
      ctx.restore();

      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,200,255,${(s.flash * s.flash * 0.45).toFixed(3)})`;
        ctx.fillRect(-30, -30, w + 60, h + 60);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      vignette(ctx, w, h, 0.55, '6,4,20');
      if (s.red > 0.01) vignette(ctx, w, h, 0.7 * s.red, '120,10,20');
      drawHud(ctx, s, env, t);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.pressing = true;
      s.pressT = 0;
      s.downX = x;
      s.downY = y;
      s.gesture = 'none';
      s.aimPointer = true;
      aimAt(s, x, y);
      // up close, a tap on the Elite is a melee; a tap behind the Chief is a dodge
      const sx = s.aimX;
      const sy = s.aimY;
      if (eliteAlive(s) && s.ex - s.cx < MELEE_R + 40 && sx > s.cx + 40 && sy < s.ey - 40) {
        s.gesture = 'done';
        melee(s, env);
      } else if (sx < s.cx - 60 && sy > s.cy - 520 && sy < s.cy + 40) {
        s.gesture = 'done';
        dodge(s, env);
      }
      env.wake();
    },
    onPointerMove: (s, env, x, y) => {
      s.aimPointer = true;
      aimAt(s, x, y);
      // keep the reticle drawn under reduced motion
      env.wake(250);
    },
    onPointerUp: (s, env, x, y) => {
      if (!s.pressing) return;
      s.pressing = false;
      const dx = x - s.downX;
      const dy = y - s.downY;
      const quick = s.pressT < SWIPE_T;
      if (s.gesture !== 'done' && quick && Math.hypot(dx, dy) > SWIPE) {
        // a swipe: up throws a grenade, back dodges, forward is a melee
        if (-dy > Math.abs(dx)) throwNade(s, env);
        else if (dx < 0) dodge(s, env);
        else melee(s, env);
      } else if (s.gesture === 'none') {
        s.burst = 4;
      }
      s.gesture = 'none';
    },
    onPointerLeave: (s) => {
      if (!s.pressing) s.aimPointer = false;
    },
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        s.touched = true;
        if (down && !e.repeat) {
          s.aimPointer = false;
          if (eliteAlive(s) && s.ex - s.cx < MELEE_R) melee(s, env);
          else s.keyFire = true;
        } else if (!down) s.keyFire = false;
        return true;
      }
      if (!down || e.repeat) return k === 'f' || k === 'g' || k === 'shift' || k === 'q';
      if (k === 'f') {
        s.touched = true;
        melee(s, env);
        return true;
      }
      if (k === 'g') {
        s.touched = true;
        throwNade(s, env);
        return true;
      }
      if (k === 'shift' || k === 'q') {
        s.touched = true;
        dodge(s, env);
        return true;
      }
      return false;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
      freeLayer(s.bg);
      s.paint = null;
    },
  });

/* ---------- input ---------- */

function aimAt(s: State, x: number, y: number) {
  s.aimX = toStageX(s.st, x);
  s.aimY = toStageY(s.st, y);
}

function busy(s: State) {
  return (
    s.firing ||
    s.cmode !== 'ready' ||
    (s.emode !== 'stalk' && s.emode !== 'dying') ||
    (s.emode === 'dying' && s.eT < 4) ||
    s.nades.some((n) => n.on > 0) ||
    s.bolts.some((b) => b.on)
  );
}

const eliteAlive = (s: State) => s.emode !== 'dying' && s.emode !== 'enter';
const chiefFree = (s: State) => s.cmode === 'ready';

function melee(s: State, env: SceneEnv) {
  if (!chiefFree(s) && !(s.cmode === 'throw' && s.thrown)) return;
  s.cmode = 'melee';
  s.cT = 0;
  s.cFrom = s.cx;
  s.cHit = false;
  s.burst = 0;
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.16, gain: 0.08, freq: 700, q: 0.5 });
}

function dodge(s: State, env: SceneEnv) {
  if (s.cmode === 'dodge' || s.cmode === 'down' || s.cmode === 'hit') return;
  s.cmode = 'dodge';
  s.cT = 0;
  s.cFrom = s.cx;
  s.burst = 0;
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.28, gain: 0.07, freq: 500, q: 0.4, type: 'lowpass' });
}

function throwNade(s: State, env: SceneEnv) {
  if (!chiefFree(s)) return;
  if (s.nades.some((n) => n.on === 1)) return;
  s.cmode = 'throw';
  s.cT = 0;
  s.thrown = false;
  s.burst = 0;
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.18, gain: 0.08, freq: 900, q: 0.6 });
}

/** Tile previews, the reduced-motion poster and the first visit play a scripted duel */
function runDemo(s: State, env: SceneEnv, dt: number) {
  s.demoT += dt;
  const T = s.demoT % 13;
  if (T < dt * 1.5) s.demoStep = 0;
  s.aimPointer = false;
  const at = (step: number, time: number) => s.demoStep === step && T > time;
  if (at(0, 0.2)) {
    s.demoStep = 1;
    s.keyFire = true;
  }
  if (at(1, 1.0)) {
    s.demoStep = 2;
    s.keyFire = false;
    throwNade(s, env);
  }
  // once it charges, step out of the way and punish the whiff
  if (s.demoStep === 2 && s.emode === 'slash') {
    s.demoStep = 3;
    dodge(s, env);
  }
  if (s.demoStep === 3 && s.emode === 'recover' && s.eT > 0.25) {
    s.demoStep = 4;
    melee(s, env);
  }
  if (s.demoStep === 2 && T > 9) s.demoStep = 4;
}

/* ---------- the Chief ---------- */

/** Torso frame point to stage space for the current pose */
function chiefToWorld(s: State, lx: number, ly: number) {
  const px = s.cx;
  const py = s.cy + (-PELVIS + s.crouch) * CH;
  const cl = Math.cos(s.lean);
  const sl = Math.sin(s.lean);
  return [px + (lx * cl - ly * sl) * CH, py + (lx * sl + ly * cl) * CH] as const;
}

/** Rifle frame point to the torso frame */
function rifleToTorso(s: State, rx: number, ry: number) {
  const c = Math.cos(s.rifleA) * RIFLE_K;
  const sn = Math.sin(s.rifleA) * RIFLE_K;
  return [s.gripX + rx * c - ry * sn, s.gripY + rx * sn + ry * c] as const;
}

function updateChief(s: State, env: SceneEnv, dt: number) {
  const t = s.time;
  const rm = env.reducedMotion;
  s.cT += dt;
  let leanT = 0.05 + (rm ? 0 : Math.sin(t * 1.3) * 0.01);
  let crouchT = 0;
  let hopT = 0;
  let rAimT = 1;
  let thrust = 0;
  let thrustA = 0;
  const homeGap = CHIEF_HOME - s.cx;

  switch (s.cmode) {
    case 'ready': {
      // drift back to the mark after a dodge or a lunge, with a small step
      if (Math.abs(homeGap) > 3) {
        s.cx = towards(s.cx, CHIEF_HOME, 230 * dt);
        s.walkPh += dt * 10;
      }
      break;
    }
    case 'melee': {
      // a lunge and a rifle-butt strike: wind, thrust, recover
      const T = s.cT;
      const gap = s.ex - s.cFrom;
      const lunge = eliteAlive(s) ? clamp(gap - 280, 0, 210) : 50;
      if (T < 0.1) {
        const k = easeOutCubic(T / 0.1);
        thrust = -18 * k;
        thrustA = -0.25 * k;
        leanT = -0.06;
        crouchT = 10 * k;
      } else if (T < 0.24) {
        const k = easeInOutCubic((T - 0.1) / 0.14);
        thrust = lerp(-18, 58, k);
        thrustA = lerp(-0.25, 0.35, k);
        leanT = lerp(-0.06, 0.34, k);
        crouchT = lerp(10, 26, k);
        s.cx = lerp(s.cFrom, s.cFrom + lunge, k);
        hopT = -Math.sin(k * Math.PI) * 18;
        if (!s.cHit && T > 0.19) {
          s.cHit = true;
          meleeHit(s, env);
        }
      } else if (T < 0.5) {
        const k = easeOutCubic((T - 0.24) / 0.26);
        thrust = lerp(58, 0, k);
        thrustA = lerp(0.35, 0, k);
        leanT = lerp(0.34, 0.05, k);
        crouchT = lerp(26, 0, k);
      } else s.cmode = 'ready';
      rAimT = 1;
      break;
    }
    case 'dodge': {
      // an evasive hop back, knees tucked
      const T = s.cT / 0.46;
      const k = easeInOutCubic(Math.min(1, T));
      const to = Math.max(s.cFrom - 200, s.st.left + 150);
      s.cx = lerp(s.cFrom, to, k);
      hopT = -Math.sin(k * Math.PI) * 74;
      leanT = -0.12 + k * 0.1;
      crouchT = 14 + Math.sin(k * Math.PI) * 10;
      if (T >= 1) {
        s.cmode = 'ready';
        dust(s, s.cx, groundY(s.cx), 8);
        s.crouch = 30;
      }
      if (s.cT < dt * 1.5 && !rm) dust(s, s.cx, groundY(s.cx), 5);
      break;
    }
    case 'hit': {
      // the sword lands on his shield: thrown back a step
      const T = s.cT / 0.5;
      const k = easeOutCubic(Math.min(1, T));
      s.cx = lerp(s.cFrom, Math.max(s.cFrom - 150, s.st.left + 150), k);
      hopT = -Math.sin(k * Math.PI) * 30;
      leanT = lerp(-0.32, 0.02, k);
      crouchT = 22 * (1 - k);
      rAimT = 0.4 + k * 0.6;
      if (T >= 1) s.cmode = 'ready';
      break;
    }
    case 'down': {
      // shields gone and the blade connects: knocked to a knee, then up again
      const T = s.cT;
      const k = easeOutCubic(Math.min(1, T / 0.35));
      s.cx = lerp(s.cFrom, Math.max(s.cFrom - 120, s.st.left + 150), k);
      const up = T > 1.7 ? easeInOutCubic(Math.min(1, (T - 1.7) / 0.5)) : 0;
      crouchT = lerp(78, 0, up);
      leanT = lerp(0.42, 0.05, up);
      rAimT = up * 0.8;
      if (T > 2.2) {
        s.cmode = 'ready';
        s.cShield = Math.max(s.cShield, 0.35);
      }
      break;
    }
    case 'throw':
      break;
  }

  s.hop = damp(s.hop, hopT, 22, dt);
  if (s.cmode === 'dodge' || s.cmode === 'hit' || s.cmode === 'melee') s.hop = hopT;
  s.cy = groundY(s.cx) + s.hop;

  // aim: the target is the pointer, or the Elite's chest for keys and the demo
  let tx = s.aimX;
  let ty = s.aimY;
  if (!s.aimPointer) {
    tx = s.ex - 40;
    ty = s.ey - 300;
  }
  const [pvx, pvy] = chiefToWorld(s, RIFLE_AIM[0], RIFLE_AIM[1]);
  const want = clamp(Math.atan2(ty - pvy, Math.max(30, tx - pvx)) - s.lean, -0.62, 0.42);
  s.aimA = damp(s.aimA, want, 16, dt);
  // aiming high leans him back a touch
  if (s.cmode === 'ready') leanT -= Math.max(0, -s.aimA) * 0.12;

  // shouldered rifle, or lowered into the far hand for a throw
  const throwing = s.cmode === 'throw';
  if (throwing) rAimT = 0;
  s.rAim = damp(s.rAim, rAimT, throwing ? 16 : 7, dt);
  const kick = s.recoil;
  s.rifleA = lerp(RIFLE_LOW[2], s.aimA - kick * 0.05 + thrustA, s.rAim);
  const ca = Math.cos(s.rifleA);
  const sa = Math.sin(s.rifleA);
  s.gripX = lerp(RIFLE_LOW[0], RIFLE_AIM[0] + ca * (thrust - kick * 7), s.rAim);
  s.gripY = lerp(RIFLE_LOW[1], RIFLE_AIM[1] + sa * (thrust - kick * 7), s.rAim);
  {
    const [gx, gy] = rifleToTorso(s, GRIP[0], GRIP[1]);
    const [hx, hy] = rifleToTorso(s, HANDGUARD[0], HANDGUARD[1]);
    // near (right) hand on the pistol grip, far (left) hand under the handguard
    reach(s.restF, NSH[0], NSH[1], gx, gy);
    reach(s.restB, FSH[0], FSH[1], hx, hy);
  }

  if (throwing) {
    const T = s.cT;
    dampArm(s.back, s.restB.a1, s.restB.a2, 24, dt);
    if (T < 0.2) {
      setArm(s.front, s.restF, WIND_F, easeOutCubic(T / 0.2));
      leanT = -0.14;
    } else if (T < 0.32) {
      const k = easeInOutCubic((T - 0.2) / 0.12);
      setArm(s.front, WIND_F, REL_F, k);
      leanT = lerp(-0.14, 0.2, k);
      crouchT = 10 * k;
      if (!s.thrown && T > 0.27) {
        s.thrown = true;
        launchNade(s, env);
      }
    } else if (T < 0.66) {
      const k = easeOutCubic((T - 0.32) / 0.34);
      setArm(s.front, REL_F, FOLLOW_F, k);
      leanT = lerp(0.2, 0.05, k);
      crouchT = 10 * (1 - k);
    } else s.cmode = 'ready';
  } else {
    const settled = Math.abs(s.front.a1 - s.restF.a1) + Math.abs(s.back.a1 - s.restB.a1) < 0.05;
    const r = settled || s.cmode === 'melee' ? 60 : 10;
    dampArm(s.front, s.restF.a1, s.restF.a2, r, dt);
    dampArm(s.back, s.restB.a1, s.restB.a2, r, dt);
  }
  s.lean = damp(s.lean, leanT, s.cmode === 'melee' || s.cmode === 'hit' ? 24 : 12, dt);
  s.crouch = damp(s.crouch, crouchT, s.cmode === 'down' ? 20 : 12, dt);

  // world-space joints for the throwing hand and the chest
  {
    const ex = NSH[0] + Math.cos(s.front.a1) * 60;
    const ey = NSH[1] + Math.sin(s.front.a1) * 60;
    const [hx, hy] = chiefToWorld(s, ex + Math.cos(s.front.a2) * 56, ey + Math.sin(s.front.a2) * 56);
    s.handX = hx;
    s.handY = hy;
    const [cx, cy] = chiefToWorld(s, 12, -96);
    s.chestX = cx;
    s.chestY = cy;
  }

  // the rifle: held fire, or a burst from a tap
  s.fireCD -= dt;
  const canFire = (s.cmode === 'ready' || s.cmode === 'hit') && s.rAim > 0.85;
  if (s.firing && canFire && s.fireCD <= 0) {
    s.fireCD = 0.09;
    if (s.burst > 0) s.burst--;
    fireRound(s, env);
  }
  if (!canFire && s.cmode !== 'hit') s.burst = 0;

  // shields: recharge after a quiet spell, with an alarm while they are empty
  if (s.cDelay > 0) s.cDelay -= dt;
  else if (s.cShield < 1) {
    if (s.cShield < 0.02) {
      const bus = env.audio();
      if (bus) tone(bus, 520, { type: 'sine', attack: 0.2, decay: 0.5, gain: 0.03, glideTo: 1200 });
    }
    s.cShield = Math.min(1, s.cShield + dt * 0.45);
    s.cFlare = Math.max(s.cFlare, 0.18);
  }
  if (s.cShield < 0.02) {
    s.alarm -= dt;
    if (s.alarm <= 0) {
      s.alarm = 0.42;
      const bus = env.audio();
      if (bus) tone(bus, 960, { type: 'square', attack: 0.002, decay: 0.08, gain: 0.016 });
    }
  }
}

function fireRound(s: State, env: SceneEnv) {
  const [mtx, mty] = rifleToTorso(s, MUZZLE[0], MUZZLE[1]);
  const [mx, my] = chiefToWorld(s, mtx, mty);
  s.muzX = mx;
  s.muzY = my;
  s.muzzle = 1;
  s.recoil = Math.min(1.6, s.recoil + 1);
  const a = s.rifleA + s.lean + rand(-0.025, 0.025);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // march the round out until it meets the Elite or the ground
  let hx = mx + dx * 1600;
  let hy = my + dy * 1600;
  let hitElite = false;
  const box = eliteBox(s);
  for (let d = 20; d < 1600; d += 14) {
    const x = mx + dx * d;
    const y = my + dy * d;
    if (box && x > box[0] && x < box[2] && y > box[1] && y < box[3]) {
      hx = x + rand(0, 26);
      hy = y;
      hitElite = true;
      break;
    }
    if (y > groundY(x)) {
      hx = x;
      hy = groundY(x);
      break;
    }
  }
  const tr = s.tracers.reduce((q, r) => (r.life < q.life ? r : q));
  tr.x0 = mx + dx * 18;
  tr.y0 = my + dy * 18;
  tr.x1 = hx;
  tr.y1 = hy;
  tr.life = 0.07;
  // a spent casing kicks out of the ejection port
  const [ex, ey] = chiefToWorld(s, ...rifleToTorso(s, 10, -16));
  const c = s.sparks.spawn(ex, ey, rand(-120, -60), rand(-260, -160), 0.9, 2.6, 7, 900, 0.5);
  c.bounce = 0.35;
  c.vr = rand(-20, 20);
  if (hitElite) hurtElite(s, env, 'round', hx, hy);
  else if (hy >= groundY(hx) - 2) {
    for (let i = 0; i < 3; i++) s.sparks.spawn(hx, hy - 2, rand(-80, 80), rand(-180, -60), rand(0.3, 0.5), rand(4, 8), 5, 300, 2);
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.07, gain: 0.11, freq: 1700, q: 0.7 });
    tone(bus, 150, { type: 'triangle', attack: 0.001, decay: 0.06, gain: 0.06, glideTo: 70 });
  }
}

function meleeHit(s: State, env: SceneEnv) {
  const gap = s.ex - s.cx;
  const bus = env.audio();
  if (!eliteAlive(s) || gap > MELEE_R) {
    if (bus) noise(bus, { duration: 0.12, gain: 0.05, freq: 2000, q: 0.5, type: 'highpass' });
    return;
  }
  const hx = s.ex - 60;
  const hy = s.ey - 290;
  const m = s.emode;
  let kind: 'melee' | 'counter' | 'beatdown' = 'melee';
  if (m === 'recover') kind = 'beatdown';
  else if (m === 'charge' || (m === 'slash' && !s.eDone)) kind = 'counter';
  if (bus) {
    tone(bus, 90, { type: 'sine', attack: 0.002, decay: 0.25, gain: 0.2, glideTo: 40 });
    noise(bus, { duration: 0.18, gain: 0.18, freq: 600, q: 0.6 });
  }
  for (let i = 0; i < 24; i++) {
    const a = rand(-1.6, 1.6);
    const v = rand(160, 520);
    s.sparks.spawn(hx, hy, Math.cos(a) * v, Math.sin(a) * v - 80, rand(0.2, 0.5), rand(1.2, 2.6), 0, 500, 1.6);
  }
  if (!env.reducedMotion) {
    s.stop = Math.max(s.stop, kind === 'melee' ? 0.07 : 0.12);
    s.shake = Math.max(s.shake, kind === 'melee' ? 0.6 : 0.9);
  }
  hurtElite(s, env, kind, hx, hy);
}

/* ---------- the Elite ---------- */

/** The Elite's hit box in stage space: [left, top, right, bottom], from its current pose */
function eliteBox(s: State) {
  if (!eliteAlive(s)) return null;
  let l = 0;
  let r = 0;
  let top = 0;
  for (const [x, y] of [NECK1, [NECK1[0] + 90, NECK1[1] - 50], [-70, -190], [90, -140], [0, 0]] as const) {
    const [lx, ly] = eTorso(s, x, y);
    l = Math.max(l, lx);
    r = Math.min(r, lx);
    top = Math.min(top, ly);
  }
  return [s.ex - (l + 20) * EK, s.ey + (top - 20) * EK, s.ex - (r - 30) * EK, s.ey - 10] as const;
}

type Hurt = 'round' | 'melee' | 'counter' | 'beatdown' | 'nade';

function hurtElite(s: State, env: SceneEnv, kind: Hurt, x: number, y: number) {
  if (!eliteAlive(s)) return;
  const R = RANKS[s.rank];
  const rm = env.reducedMotion;
  s.sinceHit = 0;
  s.bar = 1;
  const bus = env.audio();
  if (s.shield > 0) {
    const dmg = { round: 0.05, melee: 0.6, counter: 0.9, beatdown: 1.4, nade: 2 }[kind] / R.shield;
    s.shield = Math.max(0, s.shield - dmg);
    s.shimmer = Math.min(1, s.shimmer + (kind === 'round' ? 0.45 : 1));
    for (let i = 0; i < (kind === 'round' ? 4 : 14); i++) {
      const a = rand(0, TAU);
      const v = rand(60, 260);
      s.sparks.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.15, 0.35), rand(1, 2), 2, 0, 3);
    }
    if (bus && kind === 'round') tone(bus, rand(1700, 2100), { type: 'sine', attack: 0.001, decay: 0.06, gain: 0.014, glideTo: 900 });
    if (s.shield <= 0) popShield(s, env, kind);
    else if (kind !== 'round') stagger(s, kind);
  } else {
    const dmg = { round: 0.065, melee: 0.5, counter: 0.7, beatdown: 2, nade: 2 }[kind];
    s.health = Math.max(0, s.health - dmg);
    s.hurt = 1;
    // violet blood
    for (let i = 0; i < (kind === 'round' ? 3 : 16); i++) {
      const a = rand(-2.2, 0.6);
      const v = rand(80, 320);
      s.sparks.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.6), rand(1.4, 3), 6, 700, 1);
    }
    if (bus && kind === 'round') noise(bus, { duration: 0.05, gain: 0.04, freq: 500, q: 1 });
    if (s.health <= 0) killElite(s, env);
    else if (kind !== 'round') stagger(s, kind);
  }
  if (!rm && kind === 'round') s.shake = Math.max(s.shake, 0.12);
}

function stagger(s: State, kind: Hurt) {
  s.emode = 'stagger';
  s.eT = 0;
  s.evx = kind === 'counter' ? 900 : kind === 'nade' ? 500 : 520;
  s.eDone = false;
}

function popShield(s: State, env: SceneEnv, kind: Hurt) {
  s.pop = 1;
  s.shimmer = 1;
  s.spill = Math.max(s.spill, 0.9);
  s.spillX = s.ex - 40;
  s.spillY = s.ey - 280;
  s.spillRgb = '120,180,255';
  if (!env.reducedMotion) {
    s.stop = Math.max(s.stop, 0.09);
    s.shake = Math.max(s.shake, 0.7);
  }
  const r = s.rings.reduce((a, b) => (b.life < a.life ? b : a));
  r.x = s.ex - 40;
  r.y = s.ey - 260;
  r.life = r.max = 0.5;
  r.r = 230;
  r.rgb = '150,200,255';
  for (let i = 0; i < 60; i++) {
    const a = rand(0, TAU);
    const v = rand(160, 620);
    s.sparks.spawn(s.ex - 40 + rand(-50, 50), s.ey - 260 + rand(-150, 150), Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.8), rand(1, 2.6), 2, 200, 2);
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, 2400, { type: 'sawtooth', attack: 0.002, decay: 0.35, gain: 0.05, glideTo: 180 });
    tone(bus, 1200, { type: 'sine', attack: 0.002, decay: 0.5, gain: 0.06, glideTo: 90 });
    noise(bus, { duration: 0.5, gain: 0.12, freq: 3200, q: 0.4, type: 'highpass' });
  }
  // shields gone: it stumbles, then roars and comes for him with the sword
  if (s.emode === 'charge' || s.emode === 'slash') return;
  s.emode = 'pop';
  s.eT = 0;
  s.evx = kind === 'round' ? 140 : 420;
}

function killElite(s: State, env: SceneEnv) {
  s.emode = 'dying';
  s.eT = 0;
  s.evx = 620;
  s.kills.push(s.rank);
  if (s.kills.length > 9) s.kills.shift();
  s.spill = Math.max(s.spill, 0.7);
  s.spillX = s.ex - 40;
  s.spillY = s.ey - 260;
  s.spillRgb = '150,120,255';
  if (s.hum) {
    stopHum(s.hum, 0.3);
    s.hum = null;
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, 140, { type: 'sawtooth', attack: 0.01, decay: 0.9, gain: 0.07, glideTo: 50 });
    tone(bus, 600, { type: 'sine', attack: 0.004, decay: 0.4, gain: 0.03, glideTo: 200, delay: 0.05 });
  }
}

function igniteSword(s: State, env: SceneEnv) {
  if (s.ign > 0.05) return;
  s.ign = 0.06;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.4, gain: 0.14, freq: 2600, q: 0.4, type: 'highpass' });
    tone(bus, 160, { type: 'sawtooth', attack: 0.02, decay: 0.4, gain: 0.06, glideTo: 440 });
    if (!s.hum) s.hum = startHum(bus, { type: 'sawtooth', freq: 66, ratio: 1.01, noise: 0.15, filter: 600, gain: 0.04 });
  }
}

function roarSound(env: SceneEnv) {
  const bus = env.audio();
  if (!bus) return;
  tone(bus, 120, { type: 'sawtooth', attack: 0.05, decay: 0.7, gain: 0.08, glideTo: 70 });
  tone(bus, 182, { type: 'sawtooth', attack: 0.05, decay: 0.6, gain: 0.05, glideTo: 96 });
  noise(bus, { duration: 0.7, gain: 0.08, freq: 420, q: 1.6 });
}

function spawnElite(s: State) {
  s.rank = (s.rank + 1) % RANKS.length;
  s.emode = 'enter';
  s.eT = 0;
  s.ex = ELITE_HOME + 30;
  s.ehop = 0;
  s.evx = 0;
  s.shield = 1;
  s.health = 1;
  s.ign = 0;
  s.fall = 0;
  s.alpha = 0;
  s.eAim = 0;
  s.eFire = 2;
  s.aggr = rand(7, 10) - s.rank * 1.5;
  s.eLean = 0.5;
  s.eCrouch = 22;
  s.eNear.a1 = 0.95;
  s.eNear.a2 = 0.5;
  s.eFar.a1 = 1.0;
  s.eFar.a2 = 0.7;
  s.trailN = 0;
}

function updateElite(s: State, env: SceneEnv, dt: number) {
  const t = s.time;
  const R = RANKS[s.rank];
  s.eT += dt;
  s.sinceHit += dt;
  const T = s.eT;
  const gap = s.ex - s.cx;
  let leanT = 0.5 + Math.sin(t * 2.1) * 0.02;
  let crouchT = 22 + Math.sin(t * 2.1) * 3;
  let headT = 0.1;
  let mouthT = 0.5 + 0.1 * Math.sin(t * 3.1);
  let runT = 0;
  let aimT = 0;
  // arm targets as world angles (0 toward the Chief, +PI/2 down): near arm holds the sword,
  // far arm the plasma rifle
  let n1 = 1.55;
  let n2 = 1.2;
  let f1 = 1.5;
  let f2 = 1.2;
  let armRate = 10;
  let hopT = 0;
  // the far arm levels the rifle at the Chief's chest
  const toChief = Math.atan2(s.chestY - (s.ey - 330 * EK), Math.max(60, gap));

  // knockback slides it across the ridge
  if (Math.abs(s.evx) > 1) {
    s.ex += s.evx * dt;
    s.evx = damp(s.evx, 0, 6, dt);
  }

  switch (s.emode) {
    case 'enter': {
      // active camouflage drops away
      s.alpha = smooth(clamp(T / 1.3, 0, 1));
      s.ex = damp(s.ex, ELITE_HOME, 3, dt);
      if (T > 1.4) {
        s.emode = 'stalk';
        s.eT = 0;
      }
      break;
    }
    case 'stalk': {
      // pace the far side of the ridge and trade fire
      const home = ELITE_HOME + Math.sin(t * 0.55) * 46;
      const v = home - s.ex;
      s.ex = towards(s.ex, home, 90 * dt);
      if (Math.abs(v) > 6) {
        runT = 0.25;
        s.runPh += dt * 7 * Math.sign(-v);
      }
      aimT = 1;
      f1 = 0.75 + toChief * 0.5;
      f2 = toChief;
      if (s.ign > 0.5) {
        // sword lit: carried low and forward, ready
        n1 = 1.2;
        n2 = 0.45;
      }
      s.eFire -= dt;
      if (s.eFire <= 0 && s.cmode !== 'down') {
        s.eBurst = 3 + s.rank;
        s.eBoltT = 0;
        s.eFire = rand(2.4, 3.8) - s.rank * 0.3;
      }
      if (s.eBurst > 0 && s.eAim > 0.8) {
        s.eBoltT -= dt;
        if (s.eBoltT <= 0) {
          s.eBurst--;
          s.eBoltT = 0.15;
          fireBolt(s, env);
        }
      }
      // shield recharge after a quiet spell
      if (s.sinceHit > 4 && s.shield < 1) {
        s.shield = Math.min(1, s.shield + dt * 0.45);
        s.shimmer = Math.max(s.shimmer, 0.3);
      }
      // it loses patience, or he walks into reach
      s.aggr -= dt * (s.ign > 0.5 ? 1.6 : 1);
      if (s.cmode !== 'down' && (gap < 430 || s.aggr <= 0)) {
        s.aggr = rand(7, 10) - s.rank * 1.5;
        if (s.ign > 0.5) startCharge(s, env);
        else {
          s.emode = 'roar';
          s.eT = 0;
          roarSound(env);
        }
      }
      break;
    }
    case 'pop': {
      leanT = 0.18;
      crouchT = 34;
      headT = -0.4;
      mouthT = 1.1;
      n1 = 0.5;
      n2 = -0.3;
      f1 = -0.3;
      f2 = -0.9;
      armRate = 14;
      if (T > 0.7) {
        s.emode = 'roar';
        s.eT = 0;
        roarSound(env);
      }
      break;
    }
    case 'roar': {
      // head thrown back, mandibles splayed, arms flung wide, the sword snapping alight
      leanT = 0.22;
      crouchT = 36;
      headT = -0.68;
      mouthT = 1.35 + Math.sin(t * 40) * 0.06;
      n1 = 2.5;
      n2 = 2.1;
      f1 = 0.05;
      f2 = -0.35;
      armRate = 9;
      if (T > 0.3) igniteSword(s, env);
      if (T > 0.95) startCharge(s, env);
      break;
    }
    case 'charge': {
      // a low sprint with the blade trailing back
      const target = s.cx + 290;
      s.ex = towards(s.ex, target, R.speed * dt * Math.min(1, T * 3));
      runT = 1;
      s.runPh += dt * 15;
      leanT = 0.9;
      crouchT = 40;
      headT = 0.12;
      mouthT = 0.8;
      n1 = 2.85;
      n2 = 3.05;
      f1 = 1.5 + Math.sin(s.runPh) * 0.55;
      f2 = 1.1 + Math.sin(s.runPh) * 0.45;
      armRate = 14;
      if (s.ex - s.cx < SLASH_R - 30 || T > 1.6) {
        s.emode = 'slash';
        s.eT = 0;
        s.eDone = false;
        s.trailN = 0;
        const bus = env.audio();
        if (bus) noise(bus, { duration: 0.3, gain: 0.12, freq: 1500, q: 0.6 });
      }
      break;
    }
    case 'slash': {
      // overhead wind, a downward cut, then the follow-through
      leanT = lerp(0.55, 1.0, clamp((T - 0.12) / 0.12, 0, 1));
      crouchT = 48;
      headT = 0.2;
      mouthT = 1.1;
      f1 = 1.3;
      f2 = 2.0;
      if (T < 0.15) {
        const k = easeOutCubic(T / 0.15);
        n1 = lerp(2.85, -1.55, k);
        n2 = lerp(3.05, -2.4, k);
        armRate = 30;
        s.ex = towards(s.ex, s.cx + 280, 500 * dt);
      } else {
        const k = easeInOutCubic(clamp((T - 0.15) / 0.11, 0, 1));
        n1 = lerp(-1.55, 1.15, k);
        n2 = lerp(-2.4, 1.45, k);
        s.eNear.a1 = n1 - s.eLean;
        s.eNear.a2 = n2 - s.eLean;
        armRate = 200;
        if (!s.eDone && T > 0.22) {
          s.eDone = true;
          slashLands(s, env);
        }
      }
      if (T > 0.42) {
        if (s.eDone && s.cmode !== 'hit' && s.cmode !== 'down') {
          s.emode = 'recover';
          s.eT = 0;
        } else {
          s.emode = 'retreat';
          s.eT = 0;
          s.eFrom = s.ex;
        }
      }
      break;
    }
    case 'recover': {
      // blade buried in the dirt, bent double: open to a beatdown
      leanT = 0.88;
      crouchT = 62;
      headT = 0.5;
      mouthT = 0.6;
      n1 = 1.5;
      n2 = 1.3;
      f1 = 1.7;
      f2 = 1.9;
      if (T < dt * 1.5) groundSparks(s);
      if (T > 1.3) {
        s.emode = 'retreat';
        s.eT = 0;
        s.eFrom = s.ex;
      }
      break;
    }
    case 'stagger': {
      leanT = 0.02;
      crouchT = 30;
      headT = -0.35;
      mouthT = 1.05;
      n1 = 0.7;
      n2 = -0.1;
      f1 = 0.2;
      f2 = -0.6;
      armRate = 16;
      if (T > 0.65) {
        if (s.shield <= 0 && s.ign < 0.5) {
          s.emode = 'roar';
          s.eT = 0;
          roarSound(env);
        } else {
          s.emode = 'retreat';
          s.eT = 0;
          s.eFrom = s.ex;
        }
      }
      break;
    }
    case 'retreat': {
      // a long bound back to its side of the ridge
      const k = easeInOutCubic(clamp(T / 0.6, 0, 1));
      s.ex = lerp(s.eFrom, ELITE_HOME, k);
      hopT = -Math.sin(k * Math.PI) * 90;
      leanT = 0.4;
      crouchT = 30 + Math.sin(k * Math.PI) * 24;
      if (s.ign > 0.5) {
        n1 = 1.2;
        n2 = 0.45;
      }
      if (k >= 1) {
        s.emode = 'stalk';
        s.eT = 0;
        s.eFire = Math.max(s.eFire, 1.2);
        dust(s, s.ex, groundY(s.ex), 8);
      }
      break;
    }
    case 'dying': {
      // knees buckle and it folds over; then the next one arrives
      const k = easeInOutCubic(clamp(T / 0.9, 0, 1));
      s.fall = k;
      leanT = lerp(0.4, 1.2, k);
      crouchT = lerp(20, 100, k);
      headT = lerp(-0.4, 1.0, k);
      mouthT = lerp(1.2, 0.5, k);
      n1 = 1.8;
      n2 = 2.0;
      f1 = 1.9;
      f2 = 2.1;
      armRate = 6;
      s.ign = Math.max(0, s.ign - dt * 2.5);
      if (T > 0.85 && T < 0.85 + dt * 1.5) dust(s, s.ex - 80, groundY(s.ex - 80), 14);
      s.alpha = 1 - smooth(clamp((T - 3) / 0.7, 0, 1));
      if (T > 4) spawnElite(s);
      break;
    }
  }

  s.eAim = damp(s.eAim, aimT, 6, dt);
  f1 = lerp(1.5, f1, aimT > 0.5 ? s.eAim : 1);
  f2 = lerp(1.2, f2, aimT > 0.5 ? s.eAim : 1);
  s.run = damp(s.run, runT, 8, dt);
  s.eLean = damp(s.eLean, leanT, s.emode === 'slash' ? 20 : 9, dt);
  s.eCrouch = damp(s.eCrouch, crouchT, 10, dt);
  s.eHead = damp(s.eHead, headT, 8, dt);
  s.mouth = damp(s.mouth, mouthT, 14, dt);
  dampArm(s.eNear, n1 - s.eLean, n2 - s.eLean, armRate, dt);
  dampArm(s.eFar, f1 - s.eLean, f2 - s.eLean, 9, dt);
  s.ehop = s.emode === 'retreat' ? hopT : damp(s.ehop, 0, 12, dt);
  s.ex = clamp(s.ex, s.cx + 240, s.st.right + 200);
  s.ey = groundY(s.ex) + s.ehop;
  if (s.ign > 0 && s.ign < 1 && s.emode !== 'dying') s.ign = Math.min(1, s.ign + dt / 0.18);

  // blade position in stage space, for the trail and the ground strike
  updateBlade(s);
}

function startCharge(s: State, env: SceneEnv) {
  s.emode = 'charge';
  s.eT = 0;
  igniteSword(s, env);
  s.ign = Math.max(s.ign, 0.5);
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.5, gain: 0.08, freq: 300, q: 0.5, type: 'lowpass' });
}

function slashLands(s: State, env: SceneEnv) {
  const gap = s.ex - s.cx;
  const dodging = s.cmode === 'dodge' && s.cT < 0.42;
  const bus = env.audio();
  if (gap < SLASH_R + 20 && !dodging && s.cmode !== 'down') {
    // the blade connects
    const rm = env.reducedMotion;
    s.cFlare = 1;
    s.cDelay = 3.2;
    if (!rm) {
      s.stop = Math.max(s.stop, 0.11);
      s.shake = 1;
    }
    s.spill = 1;
    s.spillX = s.chestX;
    s.spillY = s.chestY;
    s.spillRgb = '255,200,90';
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 520);
      s.sparks.spawn(s.chestX, s.chestY, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.6), rand(1, 2.4), 8, 400, 1.8);
    }
    s.cFrom = s.cx;
    s.cT = 0;
    s.burst = 0;
    if (s.cShield > 0.05) {
      s.cShield = Math.max(0, s.cShield - 0.75);
      s.cmode = 'hit';
    } else {
      s.cmode = 'down';
      s.red = 1;
    }
    if (bus) {
      tone(bus, 1900, { type: 'sine', attack: 0.002, decay: 0.3, gain: 0.06, glideTo: 500 });
      noise(bus, { duration: 0.35, gain: 0.16, freq: 900, q: 0.5 });
      if (s.cmode === 'down') tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.8, gain: 0.25, glideTo: 30 });
    }
    s.eDone = true;
  } else if (bus) {
    noise(bus, { duration: 0.25, gain: 0.1, freq: 2400, q: 0.5, type: 'highpass' });
  }
}

/** Where the blade sits in stage space, mirroring drawElite's transforms */
function updateBlade(s: State) {
  const [hx, hy, a] = eliteHand(s, true);
  s.bladeX = hx;
  s.bladeY = hy;
  s.bladeA = a;
  if (s.ign > 0.5 && (s.emode === 'slash' || s.emode === 'charge')) {
    const L = 150 * EK;
    const i = s.trailHead * 4;
    s.trail[i] = hx + Math.cos(a) * 16 * EK;
    s.trail[i + 1] = hy + Math.sin(a) * 16 * EK;
    s.trail[i + 2] = hx + Math.cos(a) * L;
    s.trail[i + 3] = hy + Math.sin(a) * L;
    s.trailHead = (s.trailHead + 1) % TRAIL;
    s.trailN = Math.min(TRAIL, s.trailN + 1);
  } else s.trailN = Math.max(0, s.trailN - 1);
}

function groundSparks(s: State) {
  const tx = s.bladeX + Math.cos(s.bladeA) * 140 * EK;
  const ty = groundY(tx);
  for (let i = 0; i < 30; i++) {
    const a = rand(-Math.PI, 0);
    const v = rand(120, 480);
    s.sparks.spawn(tx, ty - 2, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), rand(1, 2.4), 2, 600, 1.5).bounce = 0.3;
  }
  dust(s, tx, ty, 8);
  s.spill = Math.max(s.spill, 0.6);
  s.spillX = tx;
  s.spillY = ty;
  s.spillRgb = '110,190,255';
}

function fireBolt(s: State, env: SceneEnv) {
  const b = s.bolts.find((q) => !q.on);
  if (!b) return;
  const [mx, my] = eliteMuzzle(s);
  const tx = s.chestX + rand(-14, 14);
  const ty = s.chestY + rand(-60, 30);
  const d = Math.hypot(tx - mx, ty - my) || 1;
  const v = 950;
  b.on = true;
  b.x = mx;
  b.y = my;
  b.vx = ((tx - mx) / d) * v;
  b.vy = ((ty - my) / d) * v;
  b.life = d / v;
  for (let i = 0; i < 5; i++) s.sparks.spawn(mx, my, rand(-80, -20), rand(-60, 60), 0.18, 1.6, 4);
  const bus = env.audio();
  if (bus) tone(bus, 880, { type: 'square', attack: 0.002, decay: 0.12, gain: 0.022, glideTo: 260 });
}

function updateBolts(s: State, env: SceneEnv, dt: number) {
  for (const b of s.bolts) {
    if (!b.on) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      b.on = false;
      // a dodge in progress carries him clear of the shot
      if (s.cmode === 'dodge') continue;
      s.cFlare = Math.max(s.cFlare, 0.9);
      s.cShield = Math.max(0, s.cShield - 0.07);
      s.cDelay = 2.6;
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU);
        const v = rand(60, 240);
        s.sparks.spawn(b.x, b.y, Math.cos(a) * v + 60, Math.sin(a) * v, rand(0.15, 0.4), rand(1, 2), 4, 200, 2);
      }
      const bus = env.audio();
      if (bus) {
        tone(bus, 1900, { type: 'sine', attack: 0.002, decay: 0.16, gain: 0.03, glideTo: 700 });
        noise(bus, { duration: 0.12, gain: 0.04, freq: 4000, q: 0.5, type: 'highpass' });
      }
    }
  }
}

function launchNade(s: State, env: SceneEnv) {
  const n = s.nades.find((q) => q.on === 0) ?? s.nades[0];
  n.on = 1;
  n.x0 = s.handX;
  n.y0 = s.handY;
  n.elite = eliteAlive(s);
  n.ox = rand(-70, -20);
  n.oy = rand(-330, -250);
  n.x1 = n.elite ? s.ex + n.ox : s.cx + 520;
  n.y1 = n.elite ? s.ey + n.oy : groundY(s.cx + 520);
  const d = Math.abs(n.x1 - n.x0);
  n.arc = 90 + d * 0.22;
  n.dur = 0.45 + d / 1600;
  n.t = 0;
  n.x = n.x0;
  n.y = n.y0;
  n.fuse = 0.95;
  n.beep = 0;
  const bus = env.audio();
  if (bus) tone(bus, 520, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.04, glideTo: 980 });
}

function updateNades(s: State, env: SceneEnv, dt: number) {
  for (const n of s.nades) {
    if (n.on === 1) {
      n.t += dt;
      const k = Math.min(1, n.t / n.dur);
      // the Elite may have moved: steer the end point with it
      if (n.elite && eliteAlive(s)) {
        n.x1 = s.ex + n.ox;
        n.y1 = s.ey + n.oy;
      }
      n.x = lerp(n.x0, n.x1, k);
      n.y = lerp(n.y0, n.y1, k) - n.arc * 4 * k * (1 - k);
      if (Math.random() < 0.9) s.sparks.spawn(n.x, n.y, rand(-30, 30), rand(-30, 30), 0.35, rand(1.5, 3), 1, 0, 3);
      if (k >= 1) {
        n.on = 2;
        if (n.elite && eliteAlive(s)) {
          s.shimmer = Math.max(s.shimmer, 0.6);
          s.bar = 1;
        } else {
          n.elite = false;
          dust(s, n.x, n.y, 6);
        }
        const bus = env.audio();
        if (bus) {
          tone(bus, 180, { type: 'triangle', attack: 0.002, decay: 0.08, gain: 0.08, glideTo: 90 });
          noise(bus, { duration: 0.6, gain: 0.03, freq: 5200, q: 1.2 });
        }
      }
    } else if (n.on === 2) {
      if (n.elite) {
        n.x = s.ex + n.ox * (1 - s.fall * 0.4);
        n.y = s.ey + n.oy * (1 - s.fall * 0.6);
      }
      n.fuse -= dt;
      n.beep -= dt;
      if (n.beep <= 0) {
        n.beep = 0.1 + n.fuse * 0.22;
        const bus = env.audio();
        if (bus) tone(bus, 1760, { type: 'square', attack: 0.002, decay: 0.05, gain: 0.016 });
      }
      if (Math.random() < 0.5) s.sparks.spawn(n.x, n.y, rand(-60, 60), rand(-90, -10), 0.3, rand(1, 2), 1, 150, 2);
      if (n.fuse <= 0) {
        n.on = 0;
        burst(s, env, n.x, n.y, n.elite);
      }
    }
  }
}

function burst(s: State, env: SceneEnv, x: number, y: number, onElite: boolean) {
  const rm = env.reducedMotion;
  s.flash = Math.max(s.flash, rm ? 0.35 : 0.85);
  s.spill = 1;
  s.spillX = x;
  s.spillY = y;
  s.spillRgb = '110,170,255';
  if (!rm) {
    s.shake = 1;
    s.stop = 0.08;
  }
  const r = s.rings.reduce((a, b) => (b.life < a.life ? b : a));
  r.x = x;
  r.y = y;
  r.life = r.max = 0.55;
  r.r = 170;
  r.rgb = '130,200,255';
  for (let i = 0; i < 80; i++) {
    const a = rand(0, TAU);
    const v = rand(160, 700);
    const p = s.sparks.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - 120, rand(0.3, 0.9), rand(1.2, 3), i % 3 === 0 ? 0 : 1, 600, 1.8);
    p.bounce = 0.3;
  }
  dust(s, x, groundY(x), 12);
  if (onElite || Math.abs(x - s.ex) < 160) hurtElite(s, env, 'nade', x, y);
  if (Math.hypot(x - s.chestX, y - s.chestY) < 220) s.cFlare = 1;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.9, gain: 0.35, freq: 380, q: 0.6, type: 'lowpass' });
    tone(bus, 90, { type: 'sine', attack: 0.004, decay: 0.7, gain: 0.25, glideTo: 32 });
    tone(bus, 2200, { type: 'sine', attack: 0.002, decay: 0.4, gain: 0.04, glideTo: 600 });
  }
}

function dust(s: State, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    s.sparks.spawn(x + rand(-20, 20), y - 4, rand(-90, 90), rand(-90, -20), rand(0.5, 1.1), rand(8, 18), 5, 60, 2.5);
  }
}

/* ---------- backdrop (cached) ---------- */

function renderBackdrop(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  enterStage(c, st);
  const L = st.left - 40;
  const R = st.right + 40;
  const T = st.top - 40;
  const B = st.bottom + 40;

  // Covenant sky: deep indigo to violet to a pale blue haze at the horizon
  const sky = c.createLinearGradient(0, Math.min(T, -900), 0, -250);
  sky.addColorStop(0, '#0b0924');
  sky.addColorStop(0.35, '#2b1d62');
  sky.addColorStop(0.62, '#5a3f94');
  sky.addColorStop(0.84, '#8a82cc');
  sky.addColorStop(1, '#b7c2ec');
  c.fillStyle = sky;
  c.fillRect(L, T, R - L, B - T);

  // stars in the upper sky
  for (let i = 0; i < 220; i++) {
    const x = L + hash(i) * (R - L);
    const y = T + hash(i + 400) * (-420 - T);
    const a = (1 - (y - T) / (-420 - T)) * (0.3 + hash(i + 800) * 0.7);
    c.fillStyle = `rgba(230,225,255,${a.toFixed(3)})`;
    const r = 0.6 + hash(i + 1200) * 1.3;
    c.fillRect(x, y, r, r);
  }

  // nebula haze
  c.globalCompositeOperation = 'lighter';
  glow(c, -380, -760, 520, '120,70,200', 0.18);
  glow(c, 420, -520, 460, '70,120,220', 0.14);
  c.globalCompositeOperation = 'source-over';

  // a pale moon with a crescent terminator
  c.save();
  c.beginPath();
  c.arc(-500, -690, 42, 0, TAU);
  c.fillStyle = '#d6cff3';
  c.fill();
  c.clip();
  c.beginPath();
  c.arc(-520, -700, 44, 0, TAU);
  c.fillStyle = 'rgba(70,55,130,0.78)';
  c.fill();
  c.restore();
  c.globalCompositeOperation = 'lighter';
  glow(c, -500, -690, 110, '180,170,255', 0.12);
  c.globalCompositeOperation = 'source-over';

  drawRing(c, RING, hash);
  drawCruiser(c, 360, -610, 0.9);
  drawCruiser(c, -150, -520, 0.45);

  // distant mountain ranges with atmospheric haze
  mountains(c, L, R, -300, 95, 11, '#6a62ac', 3);
  mountains(c, L, R, -262, 60, 23, '#433a86', 7);
  const plain = c.createLinearGradient(0, -262, 0, -120);
  plain.addColorStop(0, '#2f2766');
  plain.addColorStop(1, '#161232');
  c.fillStyle = plain;
  c.fillRect(L, -262, R - L, B + 262);
  // low mist on the plain
  const mist = c.createLinearGradient(0, -300, 0, -200);
  mist.addColorStop(0, 'rgba(190,190,255,0)');
  mist.addColorStop(0.55, 'rgba(170,170,240,0.28)');
  mist.addColorStop(1, 'rgba(170,170,240,0)');
  c.fillStyle = mist;
  c.fillRect(L, -300, R - L, 100);

  // foreground ridge
  c.beginPath();
  c.moveTo(L, B);
  for (let x = L; x <= R; x += 8) c.lineTo(x, groundY(x));
  c.lineTo(R, B);
  c.closePath();
  const rock = c.createLinearGradient(0, -240, 0, 40);
  rock.addColorStop(0, '#231d3f');
  rock.addColorStop(0.5, '#141029');
  rock.addColorStop(1, '#09071a');
  c.fillStyle = rock;
  c.fill();
  c.save();
  c.clip();
  // strata and cracks
  c.lineWidth = 1.4;
  for (let j = 0; j < 5; j++) {
    c.strokeStyle = `rgba(5,3,14,${0.5 - j * 0.07})`;
    c.beginPath();
    for (let x = L; x <= R; x += 16) {
      const y = groundY(x) + 18 + j * 22 + Math.sin(x * 0.013 + j * 2) * 6 + hash(Math.floor(x / 16) + j * 97) * 4;
      if (x === L) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  // lit upper faces of the ridge
  c.beginPath();
  for (let x = L; x <= R; x += 8) c.lineTo(x, groundY(x));
  for (let x = R; x >= L; x -= 8) c.lineTo(x, groundY(x) + 14 + Math.sin(x * 0.05) * 4);
  c.closePath();
  c.fillStyle = 'rgba(120,110,200,0.22)';
  c.fill();
  c.restore();
  // rim light from the sky along the crest
  c.strokeStyle = 'rgba(170,165,245,0.75)';
  c.lineWidth = 2.2;
  c.beginPath();
  for (let x = L; x <= R; x += 8) {
    if (x === L) c.moveTo(x, groundY(x));
    else c.lineTo(x, groundY(x));
  }
  c.stroke();
  // boulders and alien grass
  boulder(c, -620, groundY(-620) + 6, 70, 46);
  boulder(c, 560, groundY(560) + 8, 90, 52);
  boulder(c, 90, groundY(90) + 10, 40, 22);
  c.strokeStyle = 'rgba(96,120,150,0.6)';
  c.lineWidth = 1.4;
  for (let i = 0; i < 160; i++) {
    const x = L + hash(i + 3000) * (R - L);
    const y = groundY(x) + 2;
    const hgt = 5 + hash(i + 3100) * 12;
    const lean = (hash(i + 3200) - 0.3) * 8;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + lean * 0.3, y - hgt * 0.6, x + lean, y - hgt);
    c.stroke();
  }
  c.restore();
}

function mountains(c: CanvasRenderingContext2D, L: number, R: number, base: number, amp: number, seed: number, color: string, jag: number) {
  c.beginPath();
  c.moveTo(L, base + 60);
  for (let x = L; x <= R; x += 14) {
    const n =
      Math.sin(x * 0.004 + seed) * 0.5 + Math.sin(x * 0.011 + seed * 2) * 0.3 + hash(Math.floor(x / 14) + seed * 50) * 0.08 * jag;
    c.lineTo(x, base - amp * (0.45 + n * 0.55));
  }
  c.lineTo(R, base + 60);
  c.closePath();
  const g = c.createLinearGradient(0, base - amp, 0, base + 20);
  g.addColorStop(0, color);
  g.addColorStop(1, '#8a86cf');
  c.fillStyle = g;
  c.fill();
}

function boulder(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.bezierCurveTo(x - w / 2, y - h * 0.7, x - w * 0.2, y - h, x + w * 0.1, y - h);
  c.bezierCurveTo(x + w * 0.42, y - h * 0.96, x + w / 2, y - h * 0.5, x + w / 2, y);
  c.closePath();
  c.fillStyle = '#1a1533';
  c.fill();
  c.save();
  c.clip();
  c.beginPath();
  c.ellipse(x + w * 0.18, y - h * 0.8, w * 0.42, h * 0.36, -0.3, 0, TAU);
  c.fillStyle = 'rgba(130,120,210,0.3)';
  c.fill();
  c.restore();
}

function drawCruiser(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-120, 4);
  c.bezierCurveTo(-100, -18, -40, -22, 10, -14);
  c.bezierCurveTo(50, -26, 96, -20, 128, -4);
  c.bezierCurveTo(100, 8, 60, 12, 20, 8);
  c.bezierCurveTo(-20, 22, -80, 20, -120, 4);
  c.closePath();
  c.fillStyle = '#3a2f78';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = 'rgba(170,150,255,0.35)';
  c.beginPath();
  c.ellipse(20, -16, 110, 10, 0, 0, TAU);
  c.fill();
  c.restore();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(200,120,255,0.9)';
  for (let i = 0; i < 7; i++) c.fillRect(-80 + i * 26, 4 + (i % 2) * 2, 3, 2);
  glow(c, -118, 4, 26, '190,120,255', 0.5);
  c.globalCompositeOperation = 'source-over';
  c.restore();
}

const RING = { cx: 260, cy: -110, rx: 980, ry: 730, rot: -0.22 };

/* ---------- per-frame layers ---------- */

function drawSkyLife(ctx: CanvasRenderingContext2D, s: State, t: number) {
  // a glint sliding along the ring's rim, and drifting cloud wisps
  ctx.globalCompositeOperation = 'lighter';
  const g = (t * 0.03) % 1;
  const th = Math.PI + (0.1 + g * 0.8) * Math.PI;
  const ex = Math.cos(th) * RING.rx;
  const ey = Math.sin(th) * RING.ry;
  const cr = Math.cos(RING.rot);
  const sr = Math.sin(RING.rot);
  const x = RING.cx + ex * cr - ey * sr;
  const y = RING.cy + ex * sr + ey * cr;
  const near = Math.max(0, -Math.cos(th));
  glow(ctx, x, y, 24 + near * 20, '220,230,255', 0.25 + near * 0.2);
  for (let i = 0; i < 5; i++) {
    const cx = ((hash(i + 50) * 1800 + t * (6 + i * 3)) % 1800) - 900;
    const cy = -470 + hash(i + 60) * 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(3.2, 1);
    glow(ctx, 0, 0, 60 + hash(i + 70) * 40, '170,160,230', 0.07);
    ctx.restore();
  }
  // floating dust and embers
  for (const p of s.dust.items) {
    if (p.life <= 0) continue;
    const k = Math.min(1, p.life / p.max, (p.max - p.life) * 2);
    ctx.globalAlpha = k * (p.kind ? 0.8 : 0.35);
    ctx.fillStyle = p.kind ? '#9fd0ff' : '#cfc8ff';
    ctx.fillRect(p.x, p.y + Math.sin(t * 2 + p.x) * 3, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawBolts(ctx: CanvasRenderingContext2D, s: State) {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of s.bolts) {
    if (!b.on) continue;
    const a = Math.atan2(b.vy, b.vx);
    glow(ctx, b.x, b.y, 30, '90,170,255', 0.55);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(110,190,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-10, 0, 20, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#eef8ff';
    ctx.beginPath();
    ctx.ellipse(-5, 0, 10, 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawEffects(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  // light spill from bursts and hits
  if (s.spill > 0.01) {
    glow(ctx, s.spillX, s.spillY, 420, s.spillRgb, 0.5 * s.spill);
    glow(ctx, s.spillX, s.spillY, 120, '230,240,255', 0.6 * s.spill * s.spill);
  }
  // energy sword trail
  if (s.trailN > 2) {
    const n = s.trailN;
    for (let j = 1; j < n; j++) {
      const i0 = ((s.trailHead - n + j - 1 + TRAIL * 2) % TRAIL) * 4;
      const i1 = ((s.trailHead - n + j + TRAIL * 2) % TRAIL) * 4;
      const k = j / n;
      ctx.fillStyle = `rgba(90,190,255,${(k * k * 0.45).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(s.trail[i0], s.trail[i0 + 1]);
      ctx.lineTo(s.trail[i0 + 2], s.trail[i0 + 3]);
      ctx.lineTo(s.trail[i1 + 2], s.trail[i1 + 3]);
      ctx.lineTo(s.trail[i1], s.trail[i1 + 1]);
      ctx.closePath();
      ctx.fill();
    }
  }
  // rifle tracers and the muzzle flash
  ctx.lineCap = 'round';
  for (const tr of s.tracers) {
    if (tr.life <= 0) continue;
    const k = tr.life / 0.07;
    const g = ctx.createLinearGradient(tr.x0, tr.y0, tr.x1, tr.y1);
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(0.6, `rgba(255,214,140,${(0.5 * k).toFixed(3)})`);
    g.addColorStop(1, `rgba(255,248,220,${(0.95 * k).toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(tr.x0, tr.y0);
    ctx.lineTo(tr.x1, tr.y1);
    ctx.stroke();
  }
  if (s.muzzle > 0.05) {
    const a = s.rifleA + s.lean;
    const m = s.muzzle;
    glow(ctx, s.muzX, s.muzY, 70 * m, '255,180,80', 0.6 * m);
    ctx.save();
    ctx.translate(s.muzX, s.muzY);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(255,236,170,${(0.95 * m).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -7 * m);
    ctx.lineTo(34 * m + 8, 0);
    ctx.lineTo(0, 7 * m);
    ctx.lineTo(10 * m, 0);
    ctx.closePath();
    ctx.moveTo(4, 0);
    ctx.lineTo(14, -16 * m);
    ctx.lineTo(10, 0);
    ctx.lineTo(14, 16 * m);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // plasma grenades
  for (const n of s.nades) {
    if (!n.on) continue;
    const pulse = n.on === 2 ? 0.75 + 0.25 * Math.sin(t * (20 + (1 - n.fuse) * 30)) : 1;
    glow(ctx, n.x, n.y, 90 * pulse, '90,160,255', 0.6);
    glow(ctx, n.x, n.y, 26, '200,230,255', 1);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(n.x, n.y, 6, 0, TAU);
    ctx.fill();
  }
  // shockwave rings
  for (const r of s.rings) {
    if (r.life <= 0) continue;
    const k = 1 - r.life / r.max;
    const rad = r.r * easeOutCubic(k);
    ctx.strokeStyle = `rgba(${r.rgb},${(1 - k) * 0.8})`;
    ctx.lineWidth = 14 * (1 - k) + 1;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rad, rad * 0.8, 0, 0, TAU);
    ctx.stroke();
  }
  // sparks: 0 white-hot, 1 plasma blue, 2 shield blue, 3 streak, 4 bolt, 6 blood, 8 gold
  const cols = ['#eaf4ff', '#7fc4ff', '#a8d4ff', '#6fd6ff', '#9fd6ff', '', '#b07cff', '', '#ffd27a'];
  for (const p of s.sparks.items) {
    if (p.life <= 0 || p.kind === 5 || p.kind === 7) continue;
    const k = p.life / p.max;
    ctx.globalAlpha = k;
    ctx.strokeStyle = cols[p.kind] || '#ffffff';
    ctx.lineWidth = p.size;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // dust puffs and spent brass
  for (const p of s.sparks.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === 5) {
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = '#5c5390';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
      ctx.fill();
    } else if (p.kind === 7) {
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = '#e2b860';
      ctx.fillRect(-4, -1.6, 8, 3.2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- the Spartan ---------- */

const pose: ChiefPose = {
  crouch: 0,
  lean: 0,
  br: 0,
  front: newArm(0, 0),
  back: newArm(0, 0),
  gripX: 0,
  gripY: 0,
  rifleA: 0,
  rifleK: RIFLE_K,
  slung: false,
  look: 0,
  stride: 0,
  feet: undefined,
};
const FEET = [0, 0, 0, 0];

function drawChief(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  // contact shadow
  ctx.fillStyle = 'rgba(5,3,15,0.5)';
  ctx.beginPath();
  ctx.ellipse(s.cx + 4, groundY(s.cx) + 2, 84 - Math.max(0, -s.hop) * 0.3, 9, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.scale(CH, CH);
  chiefBody(p, s, t);
  ctx.restore();

  // shield flare: the whole suit ripples gold
  if (s.cFlare > 0.02) {
    const a = s.cFlare;
    p.glow = true;
    const fl = 0.7 + 0.3 * Math.sin(t * 60);
    p.glowFill = `rgba(255,190,60,${(0.22 * a * fl).toFixed(3)})`;
    p.glowStroke = `rgba(255,225,130,${(0.36 * a * fl).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(s.cx, s.cy);
    ctx.scale(CH, CH);
    chiefBody(p, s, t);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    p.glow = false;
  }
}

function chiefBody(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  pose.br = Math.sin(t * 1.6) * 1.2;
  pose.crouch = s.crouch;
  pose.lean = s.lean;
  pose.front.a1 = s.front.a1;
  pose.front.a2 = s.front.a2;
  pose.back.a1 = s.back.a1;
  pose.back.a2 = s.back.a2;
  pose.gripX = s.gripX;
  pose.gripY = s.gripY;
  pose.rifleA = s.rifleA;
  pose.look = s.cmode === 'down' ? 0.35 : s.cmode === 'throw' ? -0.1 : s.aimA * 0.55 + 0.04;
  pose.feet = undefined;
  if (s.cmode === 'dodge' || s.hop < -6) {
    // knees tucked in the air
    const k = clamp(-s.hop / 70, 0, 1);
    FEET[0] = 44 - 6 * k;
    FEET[1] = -64 * k;
    FEET[2] = -38 + 4 * k;
    FEET[3] = -5 - 50 * k;
    pose.feet = FEET;
  } else if (s.cmode === 'down' || s.crouch > 50) {
    // down on the back knee
    FEET[0] = 60;
    FEET[1] = 0;
    FEET[2] = -70;
    FEET[3] = -2;
    pose.feet = FEET;
  } else if (s.cmode === 'ready' && Math.abs(CHIEF_HOME - s.cx) > 3) {
    const ph = s.walkPh;
    FEET[0] = 44 + Math.sin(ph) * 16;
    FEET[1] = -Math.max(0, Math.cos(ph)) * 10;
    FEET[2] = -38 - Math.sin(ph) * 16;
    FEET[3] = -5 - Math.max(0, -Math.cos(ph)) * 10;
    pose.feet = FEET;
  }
  chiefFigure(p, pose, t, {
    nearHand: (hx, hy) => {
      if (s.cmode === 'throw' && !s.thrown && !p.glow) {
        // the plasma grenade cupped in the hand on the wind-up
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, hx, hy - 6, 30, '90,160,255', 0.7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#dff0ff';
        ctx.beginPath();
        ctx.arc(hx, hy - 6, 6, 0, TAU);
        ctx.fill();
      }
    },
  });
}

/* ---------- the Elite ---------- */

/** Hip height, limb lengths and joints of the Sangheili, in its own (unmirrored) frame */
const E_HIP = 226;
const E_THIGH = 88;
const E_SHIN = 86;
const E_META = 98;
const E_PHI = 0.6;
const E_NSH = [4, -176] as const;
const E_FSH = [-14, -182] as const;
const E_UA = 84;
const E_FA = 78;
/** Plasma rifle emitter, measured from the hand along the forearm */
const E_MUZ = 56;
const NECK0 = [44, -180] as const;
const NECK1 = [100, -262] as const;

/** Torso frame point to the Elite's own frame (before mirroring) */
function eTorso(s: State, x: number, y: number) {
  const py = -E_HIP + s.eCrouch;
  const c = Math.cos(s.eLean);
  const sn = Math.sin(s.eLean);
  return [x * c - y * sn, py + x * sn + y * c] as const;
}

/** A hand in stage space and the forearm's direction there */
function eliteHand(s: State, near: boolean) {
  const sh = near ? E_NSH : E_FSH;
  const a = near ? s.eNear : s.eFar;
  const ex = sh[0] + Math.cos(a.a1) * E_UA;
  const ey = sh[1] + Math.sin(a.a1) * E_UA;
  const [lx, ly] = eTorso(s, ex + Math.cos(a.a2) * E_FA, ey + Math.sin(a.a2) * E_FA);
  return [s.ex - lx * EK, s.ey + ly * EK, Math.PI - (a.a2 + s.eLean)] as const;
}

function eliteMuzzle(s: State) {
  const [hx, hy, a] = eliteHand(s, false);
  return [hx + Math.cos(a) * E_MUZ * EK, hy + Math.sin(a) * E_MUZ * EK] as const;
}

function drawElite(p: Painter, s: State, t: number) {
  if (s.alpha <= 0.01) return;
  const ctx = p.ctx;
  const camo = s.emode === 'enter';
  ctx.globalAlpha = camo ? s.alpha * s.alpha : s.alpha;
  ctx.fillStyle = 'rgba(5,3,15,0.5)';
  ctx.beginPath();
  ctx.ellipse(s.ex - 10, groundY(s.ex) + 2, 86 + s.fall * 90, 9, 0, 0, TAU);
  ctx.fill();
  const place = () => {
    ctx.translate(s.ex, s.ey);
    ctx.scale(-EK, EK);
  };
  ctx.save();
  place();
  eliteBody(p, s, t);
  ctx.restore();
  ctx.globalAlpha = 1;

  // energy shield: a faint idle ripple, flaring on hits, while recharging and as it pops;
  // during the entrance the same pass is the shimmer of active camouflage
  const idle = s.shield > 0.98 ? Math.pow(0.5 + 0.5 * Math.sin(t * 1.4), 14) * 0.25 : 0;
  let sh = s.shield > 0 || s.pop > 0 ? Math.max(s.shimmer, idle, s.pop) : 0;
  if (camo) sh = (1 - s.alpha) * (0.55 + 0.45 * Math.sin(t * 23));
  if (sh > 0.02 && s.emode !== 'dying') {
    p.glow = true;
    const fl = 0.6 + 0.4 * Math.sin(t * 70);
    const rgb = camo ? '190,210,255' : '120,165,255';
    p.glowFill = `rgba(${rgb},${((camo ? 0.1 : 0.22) * sh * fl).toFixed(3)})`;
    p.glowStroke = `rgba(200,225,255,${((camo ? 0.6 : 0.36) * sh * fl).toFixed(3)})`;
    ctx.lineWidth = camo ? 2.4 : 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    place();
    if (camo) ctx.translate(Math.sin(t * 31) * 3, 0);
    eliteBody(p, s, t);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    p.glow = false;
  }
  // as the shield pops, arcs of energy crawl over the body
  if (s.pop > 0.05) {
    const box = [s.ex - 150 * EK, s.ey - 420 * EK, s.ex + 60 * EK, s.ey - 40] as const;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      let x = lerp(box[0], box[2], Math.random());
      let y = lerp(box[1], box[3], Math.random());
      ctx.strokeStyle = `rgba(190,225,255,${(0.9 * s.pop).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rand(-34, 34);
        y += rand(-34, 34);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function eliteBody(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  const R = RANKS[s.rank];
  // mirrored: light comes from the viewer's upper right, which is local -x
  p.lx = -0.72;
  p.ly = -0.69;
  p.bx = 0.94;
  p.by = -0.34;
  p.backW = 2.6;
  p.back = 'rgba(176,176,255,0.85)';
  p.outline = 'rgba(8,6,24,0.92)';
  p.outlineW = 1.7;
  const still = 1 - s.run;
  const bob = Math.sin(t * 2.1) * 2 * still + Math.abs(Math.sin(s.runPh)) * -10 * s.run;
  const py = -E_HIP + s.eCrouch + bob;

  // feet: planted wide, cycling in a sprint, tucked during a bound
  const ph = s.runPh;
  const air = clamp(-s.ehop / 80, 0, 1);
  const run = s.run;
  const nb = [46 + Math.cos(ph) * 86 * run - 20 * air, -Math.max(0, Math.sin(ph)) * 56 * run - 70 * air] as const;
  const fb = [-34 + Math.cos(ph + Math.PI) * 86 * run + 20 * air, -4 - Math.max(0, Math.sin(ph + Math.PI)) * 56 * run - 60 * air] as const;

  eLeg(p, R, -14, py + 4, fb[0], fb[1], true);

  ctx.save();
  ctx.translate(0, py);
  ctx.rotate(s.eLean);
  // far arm with the plasma rifle, its pauldron behind the chest
  const fh = eArm(p, R, E_FSH[0], E_FSH[1], s.eFar, true);
  frame(p, fh[0], fh[1], s.eFar.a2, 1, () => plasmaRifle(p, t, s.eBurst > 0 ? 1 : 0));
  eHandGrip(p, fh[0], fh[1], s.eFar.a2, true);
  ePauldron(p, R, E_FSH[0], E_FSH[1], s.eFar.a1, true);
  eTorsoParts(p, R, t);
  // the long neck, reaching forward out of the collar
  seg(p, NECK0[0], NECK0[1], NECK1[0], NECK1[1], (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 30, 21), SKIN[0], SKIN[1], SKIN[2], 2.5, 7);
    line(p, 'rgba(12,8,6,0.55)', 1.6, () => {
      for (let i = 1; i < 5; i++) {
        const u = L * i * 0.19;
        ctx.moveTo(u, 18 - i * 1.4);
        ctx.quadraticCurveTo(u + 5, 4, u + 1, -6 + i);
      }
    });
    // armoured spine plates along the top of the neck
    for (let i = 0; i < 3; i++) {
      const u = L * (0.1 + i * 0.28);
      p.part(() => rpoly(ctx, [u - 4, -16, u + 20, -18 + i, u + 16, -6, u - 2, -6], 3), R.D[0], R.D[1], R.D[2], 1.5, 4);
    }
  });
  frame(p, NECK1[0], NECK1[1], s.eHead - s.eLean, 1.28, () => eHead(p, s, R, t));
  ctx.restore();

  eLeg(p, R, 10, py + 2, nb[0], nb[1], false);

  ctx.save();
  ctx.translate(0, py);
  ctx.rotate(s.eLean);
  const nh = eArm(p, R, E_NSH[0], E_NSH[1], s.eNear, false);
  eSword(p, nh[0], nh[1], s.eNear.a2, s.ign, t);
  eHandGrip(p, nh[0], nh[1], s.eNear.a2, false);
  ePauldron(p, R, E_NSH[0], E_NSH[1], s.eNear.a1, false);
  ctx.restore();
  p.back = '';
}

function eTorsoParts(p: Painter, R: Rank, t: number) {
  const ctx = p.ctx;
  const A = R.A;
  const D = R.D;
  // the armoured hump over the shoulder blades
  p.part(() => rpoly(ctx, [-6, -204, -40, -212, -68, -186, -74, -134, -54, -94, -22, -82, -10, -150], 16), D[0], D[1], D[2], 3, 10);
  line(p, R.trim, 1.6, () => {
    ctx.moveTo(-62, -176);
    ctx.quadraticCurveTo(-70, -134, -50, -100);
  });
  // narrow ribbed waist, belt and the hanging plates
  p.part(() => rpoly(ctx, [-24, 8, 24, 8, 30, -84, -28, -84], 6), EL_SUIT[0], EL_SUIT[1], EL_SUIT[2]);
  line(p, 'rgba(0,0,0,0.5)', 1.8, () => {
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-22 + i, -30 - i * 12);
      ctx.lineTo(26 - i, -30 - i * 12);
    }
  });
  p.part(() => rpoly(ctx, [-32, -6, -6, -4, -12, 44, -32, 38], 5), D[0], D[1], D[2], 2, 5);
  p.part(() => rpoly(ctx, [-30, -12, 32, -12, 32, 6, -30, 6], 3), A[0], A[1], A[2], 2, 4);
  p.part(() => rpoly(ctx, [6, 2, 36, 2, 30, 50, 12, 54], 5), A[0], A[1], A[2], 2.5, 6);
  line(p, R.trim, 1.6, () => {
    ctx.moveTo(10, 10);
    ctx.lineTo(30, 10);
    ctx.lineTo(25, 44);
  });

  // the great breastplate, broad at the top and thrust forward into a keel
  p.part(
    () => rpoly(ctx, [-34, -74, -46, -124, -34, -180, -4, -204, 40, -204, 76, -180, 92, -138, 80, -100, 52, -78, 10, -66], 14),
    A[0],
    A[1],
    A[2],
    3.5,
    16
  );
  p.part(() => rpoly(ctx, [30, -192, 66, -182, 90, -140, 84, -106, 60, -86, 42, -92, 34, -142], 10), A[0], A[1], A[2], 3, 10);
  // ribbed plates under the breastplate
  p.part(() => rpoly(ctx, [4, -70, 46, -80, 44, -60, 8, -52], 4), A[0], A[1], A[2], 2, 5);
  p.part(() => rpoly(ctx, [8, -48, 40, -56, 38, -40, 10, -34], 4), D[0], D[1], D[2], 2, 4);
  // gilded inlay following the plate edges
  line(p, R.trim, 2.2, () => {
    ctx.moveTo(-28, -80);
    ctx.bezierCurveTo(0, -68, 40, -72, 62, -92);
    ctx.moveTo(36, -184);
    ctx.bezierCurveTo(62, -176, 82, -150, 80, -114);
  });
  line(p, 'rgba(8,10,40,0.7)', 2, () => {
    ctx.moveTo(-40, -132);
    ctx.quadraticCurveTo(-6, -122, 30, -134);
  });
  line(p, 'rgba(235,240,255,0.7)', 2.6, () => {
    ctx.moveTo(0, -198);
    ctx.quadraticCurveTo(-30, -186, -40, -132);
  });
  if (!p.glow) {
    // light strips set into the armour
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.65 + 0.2 * Math.sin(t * 2.4);
    ctx.strokeStyle = `rgba(${R.lit},${pulse.toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-34, -104);
    ctx.quadraticCurveTo(-40, -146, -22, -176);
    ctx.moveTo(54, -160);
    ctx.lineTo(68, -140);
    ctx.stroke();
    glow(ctx, 62, -150, 22, R.lit, 0.4 * pulse);
    ctx.globalCompositeOperation = 'source-over';
  }
  // a tall collar standing up round the base of the neck
  p.part(() => rpoly(ctx, [14, -186, 30, -222, 62, -222, 80, -192, 50, -178], 7), A[0], A[1], A[2], 2.5, 7);
  line(p, R.trim, 1.6, () => {
    ctx.moveTo(32, -216);
    ctx.lineTo(60, -214);
  });
}

/** The Sangheili head in its own frame, face along +x */
function eHead(p: Painter, s: State, R: Rank, t: number) {
  const ctx = p.ctx;
  const open = s.mouth;
  // far mandibles first, darker
  mandible(p, 30, -2, 0.16 - open * 0.5, 46, true, false);
  mandible(p, 26, 10, -0.02 + open * 0.7, 42, true, true);
  // mouth: dark flesh between the jaws
  if (!p.glow) {
    ctx.fillStyle = '#4e1522';
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(70, 2 - open * 22);
    ctx.lineTo(70, 14 + open * 34);
    ctx.lineTo(24, 16);
    ctx.closePath();
    ctx.fill();
  }
  // skull: a big rounded cranium narrowing to the face
  p.part(
    () => {
      ctx.moveTo(-32, 10);
      ctx.bezierCurveTo(-44, -12, -32, -40, 0, -40);
      ctx.bezierCurveTo(26, -40, 44, -28, 52, -14);
      ctx.bezierCurveTo(58, -6, 56, 6, 46, 12);
      ctx.bezierCurveTo(28, 20, 0, 22, -32, 10);
      ctx.closePath();
    },
    SKIN[0],
    SKIN[1],
    SKIN[2],
    2.5,
    7
  );
  line(p, 'rgba(20,12,8,0.5)', 1.4, () => {
    ctx.moveTo(-16, 8);
    ctx.quadraticCurveTo(4, 0, 22, 6);
    ctx.moveTo(30, -4);
    ctx.quadraticCurveTo(40, 2, 46, 0);
  });
  // the eye, deep set under the brow
  if (!p.glow) {
    ctx.fillStyle = '#1a0c05';
    ctx.beginPath();
    ctx.ellipse(36, -12, 6.5, 4.2, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb040';
    ctx.beginPath();
    ctx.ellipse(37.5, -12.5, 3.8, 2.6, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0c05';
    ctx.fillRect(37, -15, 1.4, 5);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 37, -12, 16, '255,170,70', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  eHelmet(p, R, s.rank, t);
  // near mandibles over the skull, splayed a little even at rest
  mandible(p, 34, 0, 0.18 - open * 0.46, 50, false, false);
  mandible(p, 30, 13, -0.04 + open * 0.74, 46, false, true);
}

/** Rank helmets: a smooth cap for the Minor, a raised crest for the Major, swept horns for the Zealot */
function eHelmet(p: Painter, R: Rank, rank: number, t: number) {
  const ctx = p.ctx;
  const A = R.A;
  const D = R.D;
  if (rank === 2) {
    p.part(
      () => {
        ctx.moveTo(4, -44);
        ctx.quadraticCurveTo(-30, -86, -88, -86);
        ctx.quadraticCurveTo(-48, -64, -22, -36);
        ctx.closePath();
      },
      D[0],
      D[1],
      D[2],
      2,
      5
    );
    p.part(
      () => {
        ctx.moveTo(-12, -32);
        ctx.quadraticCurveTo(-58, -52, -98, -44);
        ctx.quadraticCurveTo(-60, -30, -32, -14);
        ctx.closePath();
      },
      A[0],
      A[1],
      A[2],
      2,
      5
    );
  } else {
    // swept point off the back of the skull
    p.part(
      () => {
        ctx.moveTo(-20, -36);
        ctx.quadraticCurveTo(-50, -40, -70, -22);
        ctx.quadraticCurveTo(-48, -14, -32, -2);
        ctx.closePath();
      },
      D[0],
      D[1],
      D[2],
      2,
      5
    );
  }
  if (rank === 1) {
    p.part(
      () => {
        ctx.moveTo(-4, -46);
        ctx.quadraticCurveTo(-6, -84, -36, -92);
        ctx.quadraticCurveTo(-42, -64, -34, -40);
        ctx.closePath();
      },
      A[0],
      A[1],
      A[2],
      2,
      6
    );
  }
  // the cap: a dome over the crown, its brow ridge stopping short of the eye
  p.part(
    () => {
      ctx.moveTo(-36, 0);
      ctx.bezierCurveTo(-48, -28, -22, -52, 6, -50);
      ctx.bezierCurveTo(30, -48, 46, -36, 54, -22);
      ctx.lineTo(42, -19);
      ctx.bezierCurveTo(28, -26, 10, -24, -2, -16);
      ctx.bezierCurveTo(-14, -8, -24, 0, -36, 0);
      ctx.closePath();
    },
    A[0],
    A[1],
    A[2],
    3,
    9
  );
  line(p, 'rgba(235,240,255,0.75)', 2, () => {
    ctx.moveTo(-24, -38);
    ctx.quadraticCurveTo(10, -52, 40, -34);
  });
  line(p, R.trim, 1.8, () => {
    ctx.moveTo(-32, -4);
    ctx.bezierCurveTo(-18, -10, -6, -16, 4, -18);
    ctx.bezierCurveTo(18, -24, 32, -24, 46, -20);
  });
  if (!p.glow) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.65 + 0.2 * Math.sin(t * 2.4 + 1);
    glow(ctx, 0, -32, 14, R.lit, 0.6 * pulse);
    ctx.fillStyle = `rgba(${R.lit},${pulse.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, -32, 4, 2.2, -0.3, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** One tapered mandible hinged at (x, y) with a row of teeth along its inner edge */
function mandible(p: Painter, x: number, y: number, a: number, L: number, far: boolean, lower: boolean) {
  const ctx = p.ctx;
  const K = far ? SKIN_D : SKIN;
  const side = lower ? -1 : 1;
  frame(p, x, y, a, 1, () => {
    if (!p.glow) {
      ctx.fillStyle = far ? '#b3a88f' : '#ece3cb';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const u = L * (0.24 + i * 0.15);
        ctx.moveTo(u - 3.5, side * 4);
        ctx.lineTo(u + 0.5, side * (12 - i * 1.2));
        ctx.lineTo(u + 3.5, side * 4);
      }
      ctx.fill();
    }
    p.part(
      () => {
        ctx.moveTo(-2, -side * 11);
        ctx.bezierCurveTo(L * 0.35, -side * 15, L * 0.75, -side * 10, L, side * 5);
        ctx.quadraticCurveTo(L * 0.6, side * 6, -2, side * 7);
        ctx.closePath();
      },
      K[0],
      K[1],
      K[2],
      2,
      4
    );
    line(p, 'rgba(20,12,8,0.45)', 1.2, () => {
      ctx.moveTo(L * 0.2, -side * 3);
      ctx.quadraticCurveTo(L * 0.5, -side * 6, L * 0.8, -side * 1);
    });
  });
}

function ePauldron(p: Painter, R: Rank, sx: number, sy: number, a1: number, back: boolean) {
  const ctx = p.ctx;
  const A = back ? R.D : R.A;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((a1 - 1.5) * 0.14);
  ctx.scale(0.86, 0.86);
  // a swept fin off the back edge, then the broad curved shell and a lower plate
  p.part(
    () => {
      ctx.moveTo(-20, -36);
      ctx.quadraticCurveTo(-54, -72, -78, -64);
      ctx.quadraticCurveTo(-56, -46, -40, -18);
      ctx.closePath();
    },
    A[0],
    A[1],
    A[2],
    2.5,
    6
  );
  p.part(
    () => {
      ctx.moveTo(-42, 10);
      ctx.bezierCurveTo(-54, -20, -34, -52, 0, -56);
      ctx.bezierCurveTo(32, -60, 60, -40, 64, -14);
      ctx.bezierCurveTo(66, 6, 52, 18, 32, 22);
      ctx.bezierCurveTo(8, 26, -24, 24, -42, 10);
      ctx.closePath();
    },
    A[0],
    A[1],
    A[2],
    3.5,
    12
  );
  p.part(() => rpoly(ctx, [-30, 18, 50, 12, 44, 36, -22, 40], 7), A[0], A[1], A[2], 2.5, 6);
  if (!back) {
    line(p, 'rgba(8,10,40,0.7)', 1.8, () => {
      ctx.moveTo(-40, -4);
      ctx.quadraticCurveTo(10, 8, 60, -6);
    });
    line(p, 'rgba(235,240,255,0.8)', 2.6, () => {
      ctx.moveTo(-36, -26);
      ctx.quadraticCurveTo(-16, -52, 18, -54);
    });
    line(p, R.trim, 2, () => {
      ctx.moveTo(-24, 28);
      ctx.lineTo(42, 22);
      ctx.moveTo(-34, 6);
      ctx.bezierCurveTo(-10, 16, 30, 14, 56, 2);
    });
  }
  ctx.restore();
}

/** Digitigrade leg: thigh forward to the knee, shin back to a high hock, then a long foot */
function eLeg(p: Painter, R: Rank, hx: number, hy: number, bx: number, by: number, back: boolean) {
  const ctx = p.ctx;
  const A = back ? R.D : R.A;
  const S = back ? EL_SUIT_D : EL_SUIT;
  const K = back ? SKIN_D : SKIN;
  const ax = bx - Math.sin(E_PHI) * E_META;
  const ay = by - Math.cos(E_PHI) * E_META;
  const [kx, ky] = knee(hx, hy, ax, ay, E_THIGH, E_SHIN, 1);
  // thigh, heavily muscled, with a curved plate over the front and outside
  seg(p, hx, hy, kx, ky, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 34, 22), S[0], S[1], S[2]);
    p.part(
      () => {
        ctx.moveTo(-6, -36);
        ctx.quadraticCurveTo(L * 0.55, -40, L * 0.98, -18);
        ctx.lineTo(L * 0.94, 12);
        ctx.quadraticCurveTo(L * 0.45, 22, -8, 18);
        ctx.closePath();
      },
      A[0],
      A[1],
      A[2],
      3,
      9
    );
    if (!back) {
      line(p, R.trim, 1.8, () => {
        ctx.moveTo(L * 0.1, 10);
        ctx.quadraticCurveTo(L * 0.5, 14, L * 0.88, 6);
      });
    }
  });
  // shin sweeping back to the hock, armoured down its front
  seg(p, kx, ky, ax, ay, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 19, 12), S[0], S[1], S[2]);
    p.part(
      () => {
        ctx.moveTo(L * 0.04, -22);
        ctx.quadraticCurveTo(L * 0.5, -26, L * 0.96, -14);
        ctx.lineTo(L * 0.92, 6);
        ctx.quadraticCurveTo(L * 0.5, 9, L * 0.06, 8);
        ctx.closePath();
      },
      A[0],
      A[1],
      A[2],
      2.5,
      6
    );
  });
  // a pointed knee guard
  frame(p, kx, ky, -0.5, 1, () =>
    p.part(() => rpoly(ctx, [-14, -10, 6, -20, 30, -6, 8, 14, -12, 10], 5), A[0], A[1], A[2], 2.5, 6)
  );
  // the hock, with a spur pointing back
  p.part(
    () => {
      ctx.moveTo(ax + 4, ay - 10);
      ctx.lineTo(ax - 26, ay - 16);
      ctx.lineTo(ax + 2, ay + 8);
      ctx.closePath();
    },
    A[0],
    A[1],
    A[2],
    2,
    4
  );
  p.part(() => ctx.arc(ax, ay, 11, 0, TAU), S[0], S[1], S[2], 2, 4);
  // long foot bones down to the toes
  seg(p, ax, ay, bx, by, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 12, 10), K[0], K[1], K[2]);
    p.part(() => rpoly(ctx, [L * 0.04, -15, L * 0.94, -13, L * 0.9, 3, L * 0.06, 3], 4), A[0], A[1], A[2], 2, 4);
  });
  // armoured toes
  p.part(
    () => {
      ctx.moveTo(bx - 18, by + 1);
      ctx.lineTo(bx - 10, by - 12);
      ctx.lineTo(bx + 16, by - 11);
      ctx.bezierCurveTo(bx + 32, by - 7, bx + 44, by - 3, bx + 48, by + 1);
      ctx.closePath();
    },
    A[0],
    A[1],
    A[2],
    2,
    5
  );
}

function eArm(p: Painter, R: Rank, sx: number, sy: number, a: Arm, back: boolean) {
  const ctx = p.ctx;
  const A = back ? R.D : R.A;
  const S = back ? EL_SUIT_D : EL_SUIT;
  const ex = sx + Math.cos(a.a1) * E_UA;
  const ey = sy + Math.sin(a.a1) * E_UA;
  const hx = ex + Math.cos(a.a2) * E_FA;
  const hy = ey + Math.sin(a.a2) * E_FA;
  seg(p, sx, sy, ex, ey, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 18, 13), S[0], S[1], S[2]);
    p.part(() => rpoly(ctx, [L * 0.3, -18, L * 0.86, -14, L * 0.84, 4, L * 0.32, 6], 5), A[0], A[1], A[2], 2, 5);
  });
  p.part(() => ctx.arc(ex, ey, 12, 0, TAU), S[0], S[1], S[2], 2, 4);
  // a gauntlet that flares toward the wrist
  seg(p, ex, ey, hx, hy, (L) => {
    p.part(
      () => {
        ctx.moveTo(-2, -12);
        ctx.quadraticCurveTo(L * 0.5, -17, L * 0.9, -19);
        ctx.lineTo(L * 0.92, 17);
        ctx.quadraticCurveTo(L * 0.5, 15, -2, 12);
        ctx.quadraticCurveTo(-10, 0, -2, -12);
        ctx.closePath();
      },
      A[0],
      A[1],
      A[2],
      3,
      7
    );
    if (!back) {
      line(p, R.trim, 1.8, () => {
        ctx.moveTo(L * 0.86, -16);
        ctx.lineTo(L * 0.88, 14);
      });
    }
  });
  return [hx, hy] as const;
}

/** Long fingers wrapped round whatever the hand holds */
function eHandGrip(p: Painter, x: number, y: number, a: number, back: boolean) {
  const ctx = p.ctx;
  const K = back ? SKIN_D : SKIN;
  frame(p, x, y, a, 1, () => {
    p.part(() => rpoly(ctx, [-6, -12, 12, -13, 16, 0, 12, 13, -6, 12], 5), K[0], K[1], K[2], 2, 4);
    line(p, 'rgba(20,12,8,0.55)', 1.2, () => {
      ctx.moveTo(6, -10);
      ctx.lineTo(8, 10);
      ctx.moveTo(11, -9);
      ctx.lineTo(12, 9);
    });
  });
}

/** The energy sword: a forked hilt across the fist, two curved blades of plasma ahead of it */
function eSword(p: Painter, x: number, y: number, a: number, ign: number, t: number) {
  const ctx = p.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (!p.glow) {
    // the hilt: a handle through the fist and swept emitter guards at each end
    ctx.fillStyle = '#2c2838';
    ctx.strokeStyle = 'rgba(8,6,24,0.92)';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-6, side * 8);
      ctx.lineTo(-8, side * 22);
      ctx.quadraticCurveTo(4, side * 30, 20, side * 22);
      ctx.lineTo(16, side * 14);
      ctx.quadraticCurveTo(6, side * 16, 2, side * 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#8f86b8';
    ctx.fillRect(-4, -20, 4, 40);
  }
  if (ign > 0.02) {
    const L = 152 * Math.min(1, ign * 1.2);
    const hum = 1 + Math.sin(t * 47) * 0.05;
    const blade = (side: number, grow: number) => {
      ctx.moveTo(14, side * (18 + grow * 0.3));
      ctx.bezierCurveTo(L * 0.34, side * (27 + grow), L * 0.76, side * (20 + grow), L + grow * 0.6, side * 3);
      ctx.bezierCurveTo(L * 0.7, side * (9 - grow * 0.2), L * 0.3, side * (12 - grow * 0.3), 16, side * (10 - grow * 0.2));
      ctx.closePath();
    };
    ctx.globalCompositeOperation = 'lighter';
    const layers: [number, string][] = [
      [10, 'rgba(50,130,255,0.16)'],
      [5, 'rgba(70,170,255,0.32)'],
      [2, 'rgba(130,215,255,0.62)'],
      [0, 'rgba(238,250,255,0.96)'],
    ];
    for (const [grow, col] of layers) {
      ctx.fillStyle = col;
      ctx.beginPath();
      blade(1, grow * hum);
      blade(-1, grow * hum);
      ctx.fill();
    }
    if (!p.glow) glow(ctx, L * 0.5, 0, 120 * ign, '80,170,255', 0.3 * ign);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Covenant plasma rifle: a split claw with the grip inside, emitter between the prongs */
function plasmaRifle(p: Painter, t: number, firing: number) {
  const ctx = p.ctx;
  p.part(
    () => {
      ctx.moveTo(-26, -2);
      ctx.bezierCurveTo(-26, -18, -4, -24, 18, -20);
      ctx.bezierCurveTo(40, -17, 58, -12, 64, -5);
      ctx.lineTo(48, -4);
      ctx.bezierCurveTo(40, -8, 32, -6, 30, 0);
      ctx.bezierCurveTo(32, 6, 40, 8, 48, 6);
      ctx.lineTo(62, 9);
      ctx.bezierCurveTo(54, 18, 36, 22, 16, 20);
      ctx.bezierCurveTo(-4, 18, -26, 14, -26, -2);
      ctx.closePath();
    },
    '#cfd4ff',
    '#5b62cf',
    '#22266c',
    2.5,
    6
  );
  if (p.glow) return;
  ctx.fillStyle = '#12132e';
  ctx.beginPath();
  ctx.ellipse(-2, 0, 11, 6, 0, 0, TAU);
  ctx.fill();
  line(p, 'rgba(230,236,255,0.75)', 2, () => {
    ctx.moveTo(-18, -14);
    ctx.quadraticCurveTo(20, -24, 56, -10);
  });
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.55 + 0.25 * Math.sin(t * 9) + firing * 0.3;
  ctx.fillStyle = `rgba(130,200,255,${pulse.toFixed(3)})`;
  ctx.fillRect(16, -14, 16, 3);
  ctx.fillRect(16, 13, 16, 3);
  glow(ctx, 42, 1, 22 + firing * 10, '110,190,255', 0.55 * pulse);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- HUD (shapes only) ---------- */

function drawEliteBar(ctx: CanvasRenderingContext2D, s: State) {
  if (s.bar <= 0.01 || !eliteAlive(s)) return;
  const a = Math.min(1, s.bar * 2);
  const box = eliteBox(s);
  if (!box) return;
  const w = 120;
  const x = s.ex - 40 - w / 2;
  const y = box[1] - 34;
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(8,8,24,0.65)';
  ctx.fillRect(x - 2, y - 2, w + 4, 13);
  ctx.fillStyle = 'rgba(140,200,255,0.95)';
  ctx.fillRect(x, y, w * s.shield, 5);
  ctx.fillStyle = s.health > 0.35 ? 'rgba(190,140,255,0.95)' : 'rgba(255,110,120,0.95)';
  ctx.fillRect(x, y + 6, w * s.health, 3);
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number) {
  // tile previews stay clean
  if (!env.interactive) return;
  const { w } = env;
  // the Spartan's shield meter, top centre
  const bw = Math.min(300, w * 0.42);
  const n = 12;
  const gap = 3;
  const sw = (bw - gap * (n - 1)) / n;
  const x0 = (w - bw) / 2;
  const y0 = 16;
  const empty = s.cShield < 0.02;
  const blink = empty ? 0.5 + 0.5 * Math.sin(t * 15) : 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (sw + gap);
    const fill = clamp(s.cShield * n - i, 0, 1);
    ctx.beginPath();
    ctx.moveTo(x + 4, y0);
    ctx.lineTo(x + sw + 4, y0);
    ctx.lineTo(x + sw, y0 + 9);
    ctx.lineTo(x, y0 + 9);
    ctx.closePath();
    ctx.fillStyle = empty ? `rgba(255,70,70,${(0.25 + 0.5 * blink).toFixed(3)})` : 'rgba(20,40,70,0.55)';
    ctx.fill();
    if (fill > 0) {
      ctx.fillStyle = s.cFlare > 0.5 ? 'rgba(255,230,150,0.95)' : 'rgba(120,205,255,0.92)';
      ctx.fillRect(x + 1, y0 + 1, (sw + 2) * fill, 7);
    }
  }
  // fallen Elites, by rank
  for (let i = 0; i < s.kills.length; i++) {
    const x = w - 22 - i * 16;
    const y = 21;
    ctx.fillStyle = RANKS[s.kills[s.kills.length - 1 - i]].A[0];
    ctx.strokeStyle = 'rgba(6,4,20,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // the assault rifle reticle; red over the Elite
  const ptr = env.pointer;
  if (env.interactive && s.aimPointer && ptr.inside) {
    const box = eliteBox(s);
    const over = box && s.aimX > box[0] && s.aimX < box[2] && s.aimY > box[1] && s.aimY < box[3];
    const col = over ? 'rgba(255,80,80,0.95)' : 'rgba(170,225,255,0.9)';
    const r = 17 + s.recoil * 3;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a0 = i * (Math.PI / 2) + 0.28;
      ctx.beginPath();
      ctx.arc(ptr.x, ptr.y, r, a0, a0 + Math.PI / 2 - 0.56);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.fillRect(ptr.x - 1.5, ptr.y - 1.5, 3, 3);
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2);
      ctx.fillRect(ptr.x + Math.cos(a) * (r + 3) - 1.5, ptr.y + Math.sin(a) * (r + 3) - 1.5, 3, 3);
    }
  }
}
