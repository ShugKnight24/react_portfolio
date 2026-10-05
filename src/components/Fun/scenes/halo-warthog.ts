import { createCanvasScene, clamp, damp, easeInOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
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
  shapeHum,
  startHum,
  stopHum,
  toStageX,
  toStageY,
  vignette,
} from './games-kit';
import type { Hum, Stage } from './games-kit';
import { chiefFigure, drawRing, FSH, frame, line, newArm, NSH, PELVIS, reach, rpoly } from './halo-kit';
import type { ChiefPose, RingShape } from './halo-kit';

/**
 * Master Chief and a Warthog on a Halo ring: green hills, Forerunner spires and the ring
 * itself arching up into an afternoon sky. Drive it (hold to floor it, ease off to coast,
 * brake to skid) over bumps and kickers with live suspension, or hop back onto the M41
 * turret while a Marine takes the wheel, and hose Grunts, Ghosts and Banshees with the
 * spinning triple barrel. Tap the Warthog (or press E or Enter) to switch seats.
 */

/* ---------- constants ---------- */

/** Half wheelbase, wheel radius and the suspension's full travel, in world units */
const WB = 152;
const WR = 46;
const REST = 54;
const AXLE_Y = 14;
const SPRING = 86;
const DAMP = 12;
const GRAV = 2300;
const INERTIA = 15500;
const CRUISE = 430;
const TOP = 1250;
/** The Chief and the Marine are drawn at this scale over their design units */
const CHK = 0.4;
/** Seat and turret anchors on the hull (local, x forward, y down) */
const SEAT = [34, -20] as const;
const WHEEL = [84, -62] as const;
const PIVOT = [-150, -104] as const;
const GUNNER = [-224, -14] as const;
const SWITCH_T = 0.75;
const MAX_FOES = 14;
const MAX_TRACERS = 16;
const MAX_BOLTS = 16;
const FAR = 2600;
const MARKS = 120;

type Seat = 'drive' | 'gun';
type FoeKind = 'grunt' | 'ghost' | 'banshee';

interface Foe {
  on: boolean;
  kind: FoeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  t: number;
  fire: number;
  /** 0 alive, otherwise seconds since it was knocked out */
  dead: number;
  rot: number;
  vr: number;
  flash: number;
  panic: number;
  rank: number;
}

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}

interface Bolt {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Wheel {
  ext: number;
  comp: number;
  spin: number;
  ground: boolean;
  wx: number;
  wy: number;
}

interface State {
  st: Stage;
  sky: HTMLCanvasElement;
  paint: Painter | null;
  fx: Pool;
  smoke: Pool;
  foes: Foe[];
  tracers: Tracer[];
  bolts: Bolt[];
  // the car
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  va: number;
  wheels: Wheel[];
  air: number;
  throttle: number;
  brake: number;
  skid: number;
  // seats
  seat: Seat;
  switchT: number;
  // turret
  aimX: number;
  aimY: number;
  aimPointer: boolean;
  gunA: number;
  spin: number;
  barrel: number;
  fireCD: number;
  heat: number;
  muzzle: number;
  // input
  pressing: boolean;
  keyGas: boolean;
  keyBrake: boolean;
  keyFire: boolean;
  touched: boolean;
  demoT: number;
  // camera
  camX: number;
  camY: number;
  shake: number;
  flash: number;
  nextSpawn: number;
  kills: number;
  engine: Hum | null;
  gunHum: Hum | null;
  screech: Hum | null;
  /** Skid marks: world x, y and age, in a ring */
  marks: Float32Array;
  markHead: number;
  markX: number;
  time: number;
}

/* ---------- terrain ---------- */

/** Ground height in world space (y down): rolling hills, rocks and a kicker every so often */
function groundY(x: number) {
  let h = 46 * Math.sin(x * 0.0013) + 30 * Math.sin(x * 0.0037 + 1.3) + 8 * Math.sin(x * 0.011 + 0.4);
  // kickers: a ramp that rises then drops away, launching the car
  const P = 2900;
  const u = ((x % P) + P) % P;
  if (u > 1900 && u < 2200) h += Math.pow((u - 1900) / 300, 1.7) * 92;
  else if (u >= 2200 && u < 2260) h += 92 * (1 - (u - 2200) / 60) * (1 - (u - 2200) / 60);
  // bumps
  const b = ((x % 640) + 640) % 640;
  if (b > 300 && b < 360) h += Math.sin(((b - 300) / 60) * Math.PI) * 14;
  return -h;
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.7,
    init: (env) => ({
      st: makeStage(),
      sky: makeLayer(),
      paint: new Painter(env.ctx),
      fx: new Pool(320),
      smoke: new Pool(160),
      foes: Array.from({ length: MAX_FOES }, () => ({
        on: false,
        kind: 'grunt' as FoeKind,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        hp: 1,
        t: 0,
        fire: 0,
        dead: 0,
        rot: 0,
        vr: 0,
        flash: 0,
        panic: 0,
        rank: 0,
      })),
      tracers: Array.from({ length: MAX_TRACERS }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0, life: 0 })),
      bolts: Array.from({ length: MAX_BOLTS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
      x: 0,
      y: groundY(0) - 80,
      vx: CRUISE,
      vy: 0,
      ang: 0,
      va: 0,
      wheels: [0, 1].map(() => ({ ext: REST * 0.6, comp: 0, spin: 0, ground: true, wx: 0, wy: 0 })),
      air: 0,
      throttle: 0,
      brake: 0,
      skid: 0,
      seat: 'drive',
      switchT: -1,
      aimX: 600,
      aimY: -300,
      aimPointer: false,
      gunA: -0.2,
      spin: 0,
      barrel: 0,
      fireCD: 0,
      heat: 0,
      muzzle: 0,
      pressing: false,
      keyGas: false,
      keyBrake: false,
      keyFire: false,
      touched: false,
      demoT: 0,
      camX: -400,
      camY: -260,
      shake: 0,
      flash: 0,
      nextSpawn: 700,
      kills: 0,
      engine: null,
      gunHum: null,
      screech: null,
      marks: new Float32Array(MARKS * 3).fill(99),
      markHead: 0,
      markX: -1e9,
      time: 0,
    }),
    resize: (s, env) => {
      fitStage(s.st, env.w, env.h);
      const c = prepLayer(s.sky, env.w, env.h, env.dpr, s.st);
      if (c) renderSky(c, s.st);
      // frame the car straight away for this stage shape
      snapCamera(s);
    },
    update: (s, env, dt, t) => {
      s.time = t;
      const rm = env.reducedMotion;
      if (!s.touched) runDemo(s, env, dt);
      if (rm && s.touched && (s.pressing || s.keyGas || s.keyFire || s.switchT >= 0 || s.air > 0.05)) env.wake(300);

      // controls: hold to floor it while driving, hold to fire on the turret
      const holding = s.pressing || s.keyFire;
      if (s.seat === 'drive' && s.switchT < 0) {
        s.throttle = damp(s.throttle, holding || s.keyGas ? 1 : 0, 6, dt);
        s.brake = s.keyBrake ? 1 : 0;
      } else {
        // the Marine keeps a steady pace
        s.throttle = damp(s.throttle, s.vx < 640 ? 0.8 : 0.2, 3, dt);
        s.brake = 0;
      }

      const n = 4;
      for (let i = 0; i < n; i++) stepCar(s, env, dt / n);
      updateCamera(s, dt);
      updateSwitch(s, env, dt);
      updateTurret(s, env, dt, holding);
      updateFoes(s, env, dt);
      updateBolts(s, env, dt);
      spawnFoes(s);

      s.fx.step(dt, groundY);
      s.smoke.step(dt);
      for (let i = 2; i < s.marks.length; i += 3) s.marks[i] += dt;
      for (const tr of s.tracers) if (tr.life > 0) tr.life -= dt;
      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.flash = Math.max(0, s.flash - dt * 3);
      s.muzzle = Math.max(0, s.muzzle - dt * 20);
      sound(s, env);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const p = s.paint;
      if (!p) return;
      p.ctx = ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7fa6d6';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 9 * s.st.k;
      if (amp > 0.05) ctx.translate(Math.sin(t * 83) * amp, Math.cos(t * 67) * amp * 0.7);
      drawLayer(ctx, s.sky, w, h);
      ctx.save();
      enterStage(ctx, s.st);
      // the distant ranges sit just above the road line, on any stage shape
      ctx.save();
      ctx.translate(0, clamp(groundLine(s.st) + 170, 0, 420));
      drawParallax(ctx, s, t);
      ctx.restore();
      ctx.translate(-s.camX, -s.camY);
      drawGround(ctx, s);
      drawFoes(p, s, t, false);
      drawSmoke(ctx, s);
      drawCar(p, s, t);
      drawFoes(p, s, t, true);
      drawEffects(ctx, s);
      ctx.restore();
      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,220,170,${(s.flash * s.flash * 0.4).toFixed(3)})`;
        ctx.fillRect(-30, -30, w + 60, h + 60);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      vignette(ctx, w, h, 0.38, '10,20,40');
      drawHud(ctx, s, env, t);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.aimPointer = true;
      aimAt(s, x, y);
      // a tap on the Warthog swaps seats; anywhere else is gas or the trigger
      if (onCar(s, s.aimX + s.camX, s.aimY + s.camY)) switchSeat(s, env);
      else s.pressing = true;
      env.wake();
    },
    onPointerMove: (s, _env, x, y) => {
      s.aimPointer = true;
      aimAt(s, x, y);
    },
    onPointerUp: (s) => {
      s.pressing = false;
    },
    onPointerLeave: (s) => {
      if (!s.pressing) s.aimPointer = false;
    },
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k === 'e' || k === 'enter') {
        if (down && !e.repeat) {
          s.touched = true;
          switchSeat(s, env);
        }
        return true;
      }
      if (k === ' ') {
        s.touched = true;
        s.keyFire = down;
        if (down) s.aimPointer = s.aimPointer && env.pointer.inside;
        return true;
      }
      if (k === 'w' || k === 'd') {
        s.touched = true;
        s.keyGas = down;
        return true;
      }
      if (k === 's' || k === 'a') {
        s.touched = true;
        s.keyBrake = down;
        return true;
      }
      return false;
    },
    dispose: (s) => {
      if (s.engine) stopHum(s.engine);
      if (s.gunHum) stopHum(s.gunHum);
      if (s.screech) stopHum(s.screech);
      s.engine = null;
      s.gunHum = null;
      s.screech = null;
      freeLayer(s.sky);
      s.paint = null;
    },
  });

/* ---------- input ---------- */

/** The aim is kept in stage space, so it stays put on screen while the world scrolls */
function aimAt(s: State, x: number, y: number) {
  s.aimX = toStageX(s.st, x);
  s.aimY = toStageY(s.st, y);
}

/** Car-local point to world */
function carToWorld(s: State, lx: number, ly: number) {
  const c = Math.cos(s.ang);
  const sn = Math.sin(s.ang);
  return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c] as const;
}

function worldToCar(s: State, wx: number, wy: number) {
  const c = Math.cos(s.ang);
  const sn = Math.sin(s.ang);
  const dx = wx - s.x;
  const dy = wy - s.y;
  return [dx * c + dy * sn, -dx * sn + dy * c] as const;
}

function onCar(s: State, wx: number, wy: number) {
  const [lx, ly] = worldToCar(s, wx, wy);
  return lx > -290 && lx < 290 && ly > -170 && ly < 90;
}

function switchSeat(s: State, env: SceneEnv) {
  if (s.switchT >= 0) return;
  s.switchT = 0;
  s.pressing = false;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.25, gain: 0.07, freq: 600, q: 0.6 });
    tone(bus, 220, { type: 'triangle', attack: 0.005, decay: 0.12, gain: 0.04, delay: 0.5, glideTo: 120 });
  }
}

/** Tile previews and the first visit: drive, hop on the gun, clear the way, hop back */
function runDemo(s: State, env: SceneEnv, dt: number) {
  const prev = s.demoT;
  s.demoT += dt;
  const T = s.demoT % 16;
  const P = prev % 16;
  s.aimPointer = false;
  if (P < 0.8 && T >= 0.8 && s.seat === 'drive') switchSeat(s, env);
  if (P < 11 && T >= 11 && s.seat === 'gun') switchSeat(s, env);
  s.keyFire = s.seat === 'gun' && s.switchT < 0 && T > 1.5 && T < 10.5 && !!nearestFoe(s);
  s.keyGas = s.seat === 'drive' && (T > 12 || T < 0.8);
}

/* ---------- the car ---------- */

function stepCar(s: State, env: SceneEnv, dt: number) {
  const c = Math.cos(s.ang);
  const sn = Math.sin(s.ang);
  // body down axis
  const dnx = -sn;
  const dny = c;
  let ax = 0;
  let ay = GRAV;
  let torque = 0;
  let grounded = 0;
  for (let i = 0; i < 2; i++) {
    const wh = s.wheels[i];
    const lx = i === 0 ? -WB : WB;
    const axw = s.x + lx * c - AXLE_Y * sn;
    const ayw = s.y + lx * sn + AXLE_Y * c;
    // how far the wheel can hang before it meets the ground
    const hx = axw + dnx * REST;
    const g = groundY(hx);
    const reach = (g - WR - ayw) / Math.max(0.3, dny);
    const prevComp = wh.comp;
    if (reach < REST) {
      const ext = Math.max(0, reach);
      wh.ext = ext;
      wh.comp = REST - ext;
      wh.ground = true;
      grounded++;
      const rate = (wh.comp - prevComp) / dt;
      let f = SPRING * wh.comp + DAMP * rate;
      if (f < 0) f = 0;
      // bottoming out: a hard stop
      if (reach < 0) {
        f += -reach * 900;
        if (s.vy > 0) s.vy *= 0.6;
      }
      const fx = -dnx * f;
      const fy = -dny * f;
      ax += fx * 0.5;
      ay += fy * 0.5;
      const rx = axw - s.x;
      const ry = ayw - s.y;
      torque += rx * fy - ry * fx;
    } else {
      wh.ext = damp(wh.ext, REST, 18, dt);
      wh.comp = 0;
      wh.ground = false;
    }
    wh.wx = axw + dnx * wh.ext;
    wh.wy = ayw + dny * wh.ext;
    wh.spin += (s.vx / WR) * dt * (wh.ground || s.throttle > 0.5 ? 1 : 0.6);
  }
  const wasAir = s.air;
  if (grounded) {
    // drive along the hull, brake, rolling drag
    const drive = s.throttle * (s.vx < TOP ? 1500 : 0) + (s.vx < CRUISE && s.brake < 0.5 ? 380 : 0);
    ax += c * drive;
    ay += sn * drive;
    if (s.brake > 0.5) {
      const dec = Math.min(Math.abs(s.vx) / dt, 1900);
      ax -= Math.sign(s.vx) * dec;
      s.skid = Math.min(1, s.skid + dt * 5);
      if (s.vx > 260 && Math.random() < 0.7) tireSmoke(s);
      // rubber laid down behind the locked wheels
      const wh = s.wheels[0];
      if (s.vx > 120 && wh.ground && Math.abs(wh.wx - s.markX) > 12) {
        s.markX = wh.wx;
        const i = s.markHead * 3;
        s.marks[i] = wh.wx;
        s.marks[i + 1] = groundY(wh.wx);
        s.marks[i + 2] = 0;
        s.markHead = (s.markHead + 1) % MARKS;
      }
    } else s.skid = Math.max(0, s.skid - dt * 3);
    s.vx *= Math.exp(-0.18 * dt);
    s.va *= Math.exp(-2.4 * dt);
    if (wasAir > 0.25) land(s, env, wasAir);
    s.air = 0;
  } else {
    s.air += dt;
    // a touch of air control: gas pulls the nose up, the brake pushes it down
    torque += (s.brake > 0.5 ? 1 : -s.throttle * 0.6) * 24000;
    // it settles toward the slope it will land on
    const slope = Math.atan2(groundY(s.x + 120) - groundY(s.x - 120), 240);
    torque += (slope - s.ang) * 42000 - s.va * 6000;
    s.va *= Math.exp(-0.4 * dt);
  }
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.va += (torque / INERTIA) * dt;
  s.va = clamp(s.va, -6, 6);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.ang += s.va * dt;
  s.ang = clamp(s.ang, -0.8, 0.8);
  // dust kicked up by the rear wheel
  if (grounded && s.vx > 300 && Math.random() < dt * 30 * (s.vx / TOP)) {
    const wh = s.wheels[0];
    s.smoke.spawn(wh.wx - 30, wh.wy + WR - 6, rand(-140, -40) - s.vx * 0.1, rand(-120, -30), rand(0.6, 1.2), rand(10, 22), 0, -20, 1.6);
  }
}

function tireSmoke(s: State) {
  const wh = s.wheels[0];
  s.smoke.spawn(wh.wx - 20, wh.wy + WR - 8, rand(-60, 20), rand(-90, -30), rand(0.8, 1.5), rand(16, 30), 1, -30, 1.2);
}

function land(s: State, env: SceneEnv, airTime: number) {
  const k = clamp(airTime / 0.8, 0.3, 1);
  if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.5 + k * 0.5);
  for (const wh of s.wheels) {
    for (let i = 0; i < 10 * k; i++) {
      s.smoke.spawn(wh.wx + rand(-30, 30), wh.wy + WR - 4, rand(-160, 160), rand(-160, -40), rand(0.7, 1.4), rand(14, 30), 0, 40, 2);
    }
  }
  const bus = env.audio();
  if (bus) {
    tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.35, gain: 0.18 * k, glideTo: 38 });
    noise(bus, { duration: 0.3, gain: 0.12 * k, freq: 300, q: 0.6, type: 'lowpass' });
  }
}

/** Where the road sits on screen: a margin up from the bottom of the stage, whatever its shape */
function groundLine(st: Stage) {
  const H = st.bottom - st.top;
  return st.bottom - clamp(H * 0.2, 90, 240);
}

function cameraTarget(s: State) {
  const st = s.st;
  const span = st.right - st.left;
  const lead = st.left + span * (0.34 - clamp(s.vx / TOP, 0, 1) * 0.06);
  const tx = s.x - lead;
  // follow the road under the car, and the car itself when it is airborne
  const road = groundY(s.x);
  const lift = Math.min(0, s.y + 70 - road);
  let ty = road + lift * 0.6 - groundLine(st);
  const [lo, hi] = cameraBounds(s);
  ty = clamp(ty, lo, hi);
  return [tx, ty] as const;
}

/** Camera heights that keep the whole Warthog, crew and turret on screen */
function cameraBounds(s: State) {
  const st = s.st;
  // the car spans roughly 190 units above its body centre and 70 below
  const lo = s.y + 70 + 40 - st.bottom;
  const hi = s.y - 190 - 60 - st.top;
  return lo <= hi ? ([lo, hi] as const) : ([(lo + hi) / 2, (lo + hi) / 2] as const);
}

function snapCamera(s: State) {
  const [tx, ty] = cameraTarget(s);
  s.camX = tx;
  s.camY = ty;
}

function updateCamera(s: State, dt: number) {
  const [tx, ty] = cameraTarget(s);
  s.camX = damp(s.camX, tx, 7, dt);
  s.camY = damp(s.camY, ty, 5, dt);
  if (Math.abs(s.camX - tx) > 600) s.camX = tx;
  const [lo, hi] = cameraBounds(s);
  s.camY = clamp(s.camY, lo, hi);
}

/* ---------- seats ---------- */

function updateSwitch(s: State, env: SceneEnv, dt: number) {
  if (s.switchT < 0) return;
  s.switchT += dt;
  if (s.switchT >= SWITCH_T * 0.55 && s.switchT - dt < SWITCH_T * 0.55) s.seat = s.seat === 'drive' ? 'gun' : 'drive';
  if (s.switchT >= SWITCH_T) {
    s.switchT = -1;
    const bus = env.audio();
    if (bus) noise(bus, { duration: 0.12, gain: 0.06, freq: 900, q: 0.7 });
  }
}

/* ---------- the turret ---------- */

const GUN_MIN = -1.45;
const GUN_MAX = 0.32;
/** Muzzle and grip in the gun's own frame */
const MUZ = [154, -2] as const;

function gunAngles(s: State) {
  // world aim angle and the same in the car's frame
  const [px, py] = carToWorld(s, PIVOT[0], PIVOT[1]);
  let tx = s.aimX + s.camX;
  let ty = s.aimY + s.camY;
  if (!s.aimPointer) {
    const f = nearestFoe(s);
    if (f) {
      tx = f.x;
      ty = f.y - foeCenter(f);
    } else {
      tx = px + 600;
      ty = py - 80;
    }
  }
  const want = clamp(Math.atan2(ty - py, Math.max(40, tx - px)) - s.ang, GUN_MIN, GUN_MAX);
  return [px, py, want] as const;
}

function updateTurret(s: State, env: SceneEnv, dt: number, holding: boolean) {
  const manned = s.seat === 'gun' && s.switchT < 0;
  const [, , want] = gunAngles(s);
  s.gunA = damp(s.gunA, manned ? want : -0.12, manned ? 14 : 3, dt);
  const firing = manned && holding;
  // the barrels spin up before the first round and wind down after
  s.spin = damp(s.spin, firing ? 1 : 0, firing ? 6 : 2.2, dt);
  s.barrel += s.spin * dt * 38;
  s.heat = Math.max(0, s.heat - dt * 0.6);
  s.fireCD -= dt;
  if (firing && s.spin > 0.6 && s.fireCD <= 0) {
    s.fireCD = 0.065;
    fireRound(s, env);
  }
}

function fireRound(s: State, env: SceneEnv) {
  const a = s.gunA + s.ang + rand(-0.03, 0.03);
  const [px, py] = carToWorld(s, PIVOT[0], PIVOT[1]);
  const mx = px + Math.cos(a) * MUZ[0] - Math.sin(a) * MUZ[1];
  const my = py + Math.sin(a) * MUZ[0] + Math.cos(a) * MUZ[1];
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  s.muzzle = 1;
  s.heat = Math.min(1, s.heat + 0.02);
  // hitscan: the nearest foe along the line, else the ground or open sky
  let best = 2200;
  let hit: Foe | null = null;
  for (const f of s.foes) {
    if (!f.on || f.dead) continue;
    const cx = f.x;
    const cy = f.y - foeCenter(f);
    const r = foeRadius(f);
    const ox = cx - mx;
    const oy = cy - my;
    const along = ox * dx + oy * dy;
    if (along < 0 || along > best) continue;
    const perp = Math.abs(ox * dy - oy * dx);
    if (perp < r) {
      best = along - Math.sqrt(r * r - perp * perp) * 0.6;
      hit = f;
    }
  }
  if (!hit) {
    for (let d = 40; d < best; d += 20) {
      const x = mx + dx * d;
      const y = my + dy * d;
      if (y > groundY(x)) {
        best = d;
        for (let i = 0; i < 3; i++) s.smoke.spawn(x, groundY(x) - 2, rand(-60, 60), rand(-140, -40), rand(0.3, 0.6), rand(6, 12), 0, 100, 2);
        break;
      }
    }
  }
  const tr = s.tracers.reduce((q, r) => (r.life < q.life ? r : q));
  tr.x0 = mx;
  tr.y0 = my;
  tr.x1 = mx + dx * best;
  tr.y1 = my + dy * best;
  tr.life = 0.06;
  // brass spills off the receiver
  const [ex, ey] = carToWorld(s, PIVOT[0] - 10, PIVOT[1] + 6);
  const cs = s.fx.spawn(ex, ey, rand(-160, -60) + s.vx * 0.6, rand(-260, -140), 0.8, 3, 7, 1200, 0.3);
  cs.bounce = 0.3;
  cs.vr = rand(-25, 25);
  if (hit) damageFoe(s, env, hit, 1, tr.x1, tr.y1);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.06, gain: 0.12, freq: 1200, q: 0.6 });
    tone(bus, 110, { type: 'square', attack: 0.001, decay: 0.05, gain: 0.04, glideTo: 60 });
  }
}

/* ---------- the Covenant ---------- */

const foeCenter = (f: Foe) => (f.kind === 'grunt' ? 46 : f.kind === 'ghost' ? 52 : 0);
const foeRadius = (f: Foe) => (f.kind === 'grunt' ? 42 : f.kind === 'ghost' ? 76 : 88);

function nearestFoe(s: State) {
  let best: Foe | null = null;
  let bd = 1e9;
  const [px] = carToWorld(s, PIVOT[0], PIVOT[1]);
  for (const f of s.foes) {
    if (!f.on || f.dead) continue;
    const d = f.x - px;
    if (d < 120 || d > 1500) continue;
    const score = d + (f.kind === 'banshee' ? -300 : f.kind === 'ghost' ? -150 : 0);
    if (score < bd) {
      bd = score;
      best = f;
    }
  }
  return best;
}

function spawnFoes(s: State) {
  const ahead = s.camX + (s.st.right - s.st.left) + 200;
  if (s.x + 1400 < s.nextSpawn) return;
  const f = () => s.foes.find((q) => !q.on);
  const roll = hash(Math.floor(s.nextSpawn / 100) * 1.37);
  const x0 = Math.max(s.nextSpawn, ahead);
  if (roll < 0.45) {
    // a knot of Grunts
    const n = 2 + Math.floor(roll * 6) % 3;
    for (let i = 0; i < n; i++) {
      const g = f();
      if (!g) break;
      setFoe(g, 'grunt', x0 + i * 70 + rand(-20, 20), 0);
      g.rank = Math.random() < 0.3 ? 1 : 0;
    }
  } else if (roll < 0.75) {
    const g = f();
    if (g) setFoe(g, 'ghost', x0 + 200, 0);
  } else {
    const g = f();
    if (g) setFoe(g, 'banshee', x0 + 300, -rand(330, 470));
  }
  s.nextSpawn = x0 + rand(650, 1100);
}

function setFoe(f: Foe, kind: FoeKind, x: number, dy: number) {
  f.on = true;
  f.kind = kind;
  f.x = x;
  f.y = groundY(x) + dy;
  f.vx = kind === 'ghost' ? -260 : kind === 'banshee' ? -380 : 0;
  f.vy = 0;
  f.hp = kind === 'grunt' ? 3 : kind === 'ghost' ? 18 : 24;
  f.t = rand(0, 4);
  f.fire = rand(0.8, 2);
  f.dead = 0;
  f.rot = 0;
  f.vr = 0;
  f.flash = 0;
  f.panic = 0;
}

function damageFoe(s: State, env: SceneEnv, f: Foe, dmg: number, x: number, y: number) {
  f.hp -= dmg;
  f.flash = 1;
  for (let i = 0; i < 3; i++) {
    const a = rand(0, TAU);
    const v = rand(80, 260);
    s.fx.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.15, 0.3), rand(1, 2), f.kind === 'grunt' ? 2 : 0, 300, 2);
  }
  if (f.hp <= 0) knockOut(s, env, f, 0);
}

/** Down it goes: Grunts tumble, vehicles burst into flame and wreckage */
function knockOut(s: State, env: SceneEnv, f: Foe, push: number) {
  f.dead = 0.001;
  s.kills++;
  const bus = env.audio();
  if (f.kind === 'grunt') {
    f.vx = push > 0 ? push * 0.8 + rand(0, 200) : rand(80, 240);
    f.vy = push > 0 ? -rand(700, 900) : -rand(320, 480);
    f.vr = rand(8, 14) * (Math.random() < 0.5 ? -1 : 1);
    if (bus) tone(bus, rand(900, 1200), { type: 'triangle', attack: 0.01, decay: 0.4, gain: 0.05, glideTo: rand(1500, 1900) });
  } else {
    explode(s, env, f.x, f.y - foeCenter(f), f.kind === 'banshee' ? 1.2 : 1);
    if (f.kind === 'banshee') {
      f.vy = 80;
      f.vr = rand(1.5, 3);
    } else {
      f.vy = -260;
      f.vr = rand(-2, 2);
    }
  }
}

function explode(s: State, env: SceneEnv, x: number, y: number, size: number) {
  const rm = env.reducedMotion;
  s.flash = Math.max(s.flash, rm ? 0.2 : 0.6 * size);
  if (!rm) s.shake = Math.max(s.shake, 0.6 * size);
  for (let i = 0; i < 46 * size; i++) {
    const a = rand(0, TAU);
    const v = rand(120, 620) * size;
    const p = s.fx.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - 140, rand(0.3, 0.9), rand(1.5, 3.5), i % 4 === 0 ? 4 : 3, 700, 1.4);
    p.bounce = 0.3;
  }
  for (let i = 0; i < 18 * size; i++) {
    s.smoke.spawn(x + rand(-30, 30), y + rand(-30, 30), rand(-120, 120), rand(-200, -40), rand(1, 2.2), rand(20, 46) * size, 2, -40, 1.2);
  }
  for (let i = 0; i < 8; i++) {
    const p = s.fx.spawn(x, y, rand(-400, 400), rand(-700, -300), rand(1.2, 2), rand(5, 11), 6, 1500, 0.3);
    p.vr = rand(-12, 12);
    p.bounce = 0.35;
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.9, gain: 0.3 * size, freq: 320, q: 0.6, type: 'lowpass' });
    tone(bus, 80, { type: 'sine', attack: 0.004, decay: 0.7, gain: 0.22 * size, glideTo: 30 });
  }
}

function updateFoes(s: State, env: SceneEnv, dt: number) {
  const front = carToWorld(s, 268, 20);
  for (const f of s.foes) {
    if (!f.on) continue;
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt * 6);
    if (f.x < s.camX - FAR * 0.5 || f.x > s.camX + FAR * 2) {
      f.on = false;
      continue;
    }
    if (f.dead) {
      f.dead += dt;
      f.vy += (f.kind === 'banshee' ? 900 : 1700) * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      const g = groundY(f.x);
      if (f.y > g) {
        f.y = g;
        if (f.kind === 'banshee' && f.vy > 0 && f.dead < 6) {
          explode(s, env, f.x, f.y - 20, 1);
          f.dead = 6;
        }
        f.vy *= -0.25;
        f.vx *= 0.5;
        f.vr *= 0.5;
      }
      if (f.kind === 'banshee' && f.dead < 6 && Math.random() < 0.6) {
        s.smoke.spawn(f.x, f.y, rand(-40, 40), rand(-60, -10), rand(0.8, 1.4), rand(12, 22), 2, -20, 1);
      }
      if (f.dead > (f.kind === 'grunt' ? 1.6 : 7.5)) f.on = false;
      continue;
    }
    if (f.kind === 'grunt') {
      // they panic and run once the Warthog bears down on them
      const gap = f.x - s.x;
      if (gap < 700 && gap > 0) f.panic = Math.min(1, f.panic + dt * 2);
      f.vx = damp(f.vx, f.panic > 0.5 ? 230 : 0, 4, dt);
      f.x += f.vx * dt;
      f.y = groundY(f.x);
      // splattered by the bumper
      if (Math.abs(f.x - front[0]) < 50 && Math.abs(f.y - 40 - front[1]) < 90 && s.vx > 160) {
        knockOut(s, env, f, s.vx);
        s.vx *= 0.97;
        if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.35);
        for (let i = 0; i < 12; i++) s.fx.spawn(f.x, f.y - 40, rand(-100, 300), rand(-300, -60), rand(0.3, 0.6), rand(1.5, 3), 2, 600, 1);
        continue;
      }
    } else if (f.kind === 'ghost') {
      f.x += f.vx * dt;
      const hover = 34 + Math.sin(f.t * 3) * 5;
      f.y = damp(f.y, groundY(f.x) - hover, 10, dt);
      // rammed
      if (Math.abs(f.x - front[0]) < 80 && s.vx > 200 && Math.abs(f.y - front[1]) < 120) {
        knockOut(s, env, f, s.vx);
        s.vy -= 300;
        s.va -= 1.2;
        continue;
      }
    } else {
      f.x += f.vx * dt;
      const base = groundY(f.x) - 420;
      f.y = damp(f.y, base + Math.sin(f.t * 1.3) * 60, 1.5, dt);
    }
    // return fire
    f.fire -= dt;
    const gap = f.x - s.x;
    if (f.fire <= 0 && gap > 180 && gap < 1500) {
      f.fire = f.kind === 'grunt' ? rand(1.6, 3) : f.kind === 'ghost' ? rand(0.5, 1) : rand(0.7, 1.2);
      if (f.kind !== 'grunt' || f.panic < 0.5) foeShot(s, env, f);
    }
  }
}

function foeShot(s: State, env: SceneEnv, f: Foe) {
  const b = s.bolts.find((q) => !q.on);
  if (!b) return;
  const sx = f.x - (f.kind === 'grunt' ? 30 : 80);
  const sy = f.y - foeCenter(f) + (f.kind === 'banshee' ? 30 : 0);
  const [tx, ty] = carToWorld(s, rand(-160, 160), rand(-80, 0));
  const lead = (tx - sx) / 900;
  const ax = tx + s.vx * lead;
  const d = Math.hypot(ax - sx, ty - sy) || 1;
  const v = f.kind === 'grunt' ? 700 : 950;
  b.on = true;
  b.x = sx;
  b.y = sy;
  b.vx = ((ax - sx) / d) * v;
  b.vy = ((ty - sy) / d) * v;
  b.life = d / v + 0.4;
  const bus = env.audio();
  if (bus) tone(bus, f.kind === 'grunt' ? 1300 : 700, { type: 'square', attack: 0.002, decay: 0.1, gain: 0.015, glideTo: 300 });
}

function updateBolts(s: State, env: SceneEnv, dt: number) {
  for (const b of s.bolts) {
    if (!b.on) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (onCar(s, b.x, b.y) || b.y > groundY(b.x) || b.life <= 0) {
      b.on = false;
      for (let i = 0; i < 8; i++) {
        const a = rand(0, TAU);
        const v = rand(60, 220);
        s.fx.spawn(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.15, 0.35), rand(1, 2), 5, 200, 2);
      }
      if (onCar(s, b.x, b.y)) {
        const bus = env.audio();
        if (bus) noise(bus, { duration: 0.1, gain: 0.05, freq: 2600, q: 0.6 });
      }
    }
  }
}

/* ---------- sound ---------- */

function sound(s: State, env: SceneEnv) {
  const bus = env.audio();
  if (!bus) return;
  if (!s.engine) s.engine = startHum(bus, { type: 'sawtooth', freq: 42, ratio: 1.5, noise: 0.2, filter: 380, q: 1.2, gain: 0.03, attack: 0.4 });
  const rev = clamp(Math.abs(s.vx) / TOP, 0, 1) + s.throttle * 0.25 + (s.air > 0.05 ? 0.2 : 0);
  shapeHum(s.engine, 40 + rev * 46, 300 + rev * 700, 0.022 + s.throttle * 0.02, 1.5);
  const sliding = s.skid > 0.3 && s.vx > 200 && s.air < 0.05;
  if (sliding) {
    if (!s.screech) s.screech = startHum(bus, { type: 'sawtooth', freq: 820, ratio: 1.03, noise: 0.9, filter: 2400, q: 5, gain: 0.018, attack: 0.05 });
    shapeHum(s.screech, 760 + s.vx * 0.2, 2200, 0.018 * s.skid, 1.03);
  } else if (s.screech) {
    stopHum(s.screech, 0.15);
    s.screech = null;
  }
  if (s.spin > 0.05) {
    if (!s.gunHum) s.gunHum = startHum(bus, { type: 'triangle', freq: 120, ratio: 2, noise: 0.1, filter: 1600, gain: 0.02, attack: 0.1 });
    shapeHum(s.gunHum, 90 + s.spin * 160, 900 + s.spin * 1200, 0.02 * s.spin, 2);
  } else if (s.gunHum) {
    stopHum(s.gunHum, 0.2);
    s.gunHum = null;
  }
}

/* ---------- sky and parallax ---------- */

const RING: RingShape = { cx: 120, cy: -60, rx: 1100, ry: 820, rot: -0.12 };

function renderSky(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  enterStage(c, st);
  const L = st.left - 40;
  const R = st.right + 40;
  const T = st.top - 40;
  const B = st.bottom + 40;
  // a clear afternoon: deep blue overhead, pale and warm at the horizon
  const sky = c.createLinearGradient(0, Math.min(T, -900), 0, -60);
  sky.addColorStop(0, '#24508f');
  sky.addColorStop(0.45, '#4f86c4');
  sky.addColorStop(0.8, '#9cc4e4');
  sky.addColorStop(1, '#e8eedc');
  c.fillStyle = sky;
  c.fillRect(L, T, R - L, B - T);
  // the sun low on the right
  c.globalCompositeOperation = 'lighter';
  glow(c, 640, -520, 520, '255,236,190', 0.32);
  glow(c, 640, -520, 90, '255,250,230', 0.8);
  c.globalCompositeOperation = 'source-over';
  drawRing(c, RING, hash, '86,132,196');
  // high cloud bands
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = L + hash(i + 40) * (R - L);
    const y = -700 + hash(i + 50) * 360;
    c.save();
    c.translate(x, y);
    c.scale(4, 1);
    glow(c, 0, 0, 50 + hash(i + 60) * 50, '255,255,255', 0.16);
    c.restore();
  }
  c.globalCompositeOperation = 'source-over';
  c.restore();
}

/** Distant ranges and Forerunner spires slide by slower than the ground */
function drawParallax(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const st = s.st;
  const L = st.left - 20;
  const R = st.right + 20;
  const base = -s.camY * 0.12;
  const ridge = (f: number, y0: number, amp: number, seed: number, col: string, step: number) => {
    const off = s.camX * f;
    ctx.beginPath();
    ctx.moveTo(L, st.bottom + 20);
    for (let x = L; x <= R + step; x += step) {
      const wx = x + off;
      const n =
        Math.sin(wx * 0.0021 + seed) * 0.5 +
        Math.sin(wx * 0.0057 + seed * 2.3) * 0.3 +
        Math.sin(wx * 0.017 + seed) * 0.1 +
        hash(Math.floor(wx / step) + seed * 97) * 0.08;
      ctx.lineTo(x, y0 + base * f * 4 - amp * (0.5 + n));
    }
    ctx.lineTo(R + step, st.bottom + 20);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  // far blue ranges, a pale haze band, then wooded hills
  ridge(0.06, -250, 150, 3, '#8fb0d4', 18);
  // Forerunner spires on the far range
  const off = s.camX * 0.08;
  for (let i = -2; i < 6; i++) {
    const k = Math.floor((off + L) / 900) + i;
    const x = k * 900 - off + hash(k) * 300;
    if (x < L - 100 || x > R + 100) continue;
    const hgt = 160 + hash(k + 9) * 140;
    const y = -230 + base * 0.32;
    ctx.fillStyle = '#7d9cc4';
    ctx.beginPath();
    ctx.moveTo(x - 22, y);
    ctx.lineTo(x - 8, y - hgt);
    ctx.lineTo(x + 8, y - hgt);
    ctx.lineTo(x + 22, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 46, y - hgt * 0.42, 92, 8);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - hgt - 6, 30, '150,220,255', 0.45 + 0.15 * Math.sin(t * 2 + k));
    ctx.globalCompositeOperation = 'source-over';
  }
  const haze = ctx.createLinearGradient(0, -260, 0, -120);
  haze.addColorStop(0, 'rgba(225,235,240,0)');
  haze.addColorStop(1, 'rgba(225,235,240,0.55)');
  ctx.fillStyle = haze;
  ctx.fillRect(L, -260, R - L, 140);
  ridge(0.16, -150, 120, 11, '#5f8a6e', 14);
  // pines on the near hills
  const off2 = s.camX * 0.28;
  ctx.fillStyle = '#2f5a45';
  for (let i = 0; i < 46; i++) {
    const k = Math.floor((off2 + L) / 70) + i;
    const x = k * 70 - off2 + hash(k * 3.1) * 40;
    if (hash(k * 1.7) < 0.35) continue;
    const y = -60 + base * 1.1 - 50 * Math.sin((x + off2) * 0.003 + 2) - 30 * Math.sin((x + off2) * 0.0071);
    const hgt = 60 + hash(k * 2.3) * 70;
    ctx.beginPath();
    ctx.moveTo(x, y - hgt);
    ctx.lineTo(x + hgt * 0.22, y);
    ctx.lineTo(x - hgt * 0.22, y);
    ctx.closePath();
    ctx.fill();
  }
  ridge(0.3, -40, 70, 23, '#3f6b4c', 12);
}

/* ---------- ground ---------- */

function drawGround(ctx: CanvasRenderingContext2D, s: State) {
  const st = s.st;
  const L = s.camX + st.left - 40;
  const R = s.camX + st.right + 40;
  const B = s.camY + st.bottom + 40;
  const step = 10;
  ctx.beginPath();
  ctx.moveTo(L, B);
  for (let x = L; x <= R + step; x += step) ctx.lineTo(x, groundY(x));
  ctx.lineTo(R + step, B);
  ctx.closePath();
  const soil = ctx.createLinearGradient(0, s.camY - 200, 0, s.camY + st.bottom);
  soil.addColorStop(0, '#5d7a34');
  soil.addColorStop(0.3, '#4a5f2a');
  soil.addColorStop(1, '#2c3418');
  ctx.fillStyle = soil;
  ctx.fill();
  // a bright grass lip and a darker band under it
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#94b84e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let x = L; x <= R + step; x += step) {
    if (x === L) ctx.moveTo(x, groundY(x) + 2);
    else ctx.lineTo(x, groundY(x) + 2);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30,40,14,0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let x = L; x <= R + step; x += step) {
    if (x === L) ctx.moveTo(x, groundY(x) + 14);
    else ctx.lineTo(x, groundY(x) + 14);
  }
  ctx.stroke();
  // skid marks fading into the grass
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  for (let j = 1; j < MARKS; j++) {
    const i0 = ((s.markHead - j + MARKS) % MARKS) * 3;
    const i1 = ((s.markHead - j - 1 + MARKS) % MARKS) * 3;
    const age = s.marks[i0 + 2];
    if (age > 4 || s.marks[i1 + 2] > 4) continue;
    if (Math.abs(s.marks[i0] - s.marks[i1]) > 30) continue;
    ctx.strokeStyle = `rgba(28,24,14,${(0.5 * (1 - age / 4)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(s.marks[i1], s.marks[i1 + 1] + 2);
    ctx.lineTo(s.marks[i0], s.marks[i0 + 1] + 2);
    ctx.stroke();
  }
  // tufts, stones and the occasional Forerunner marker
  const k0 = Math.floor(L / 46);
  for (let k = k0; k * 46 < R; k++) {
    const h = hash(k * 0.73);
    const x = k * 46 + h * 30;
    const y = groundY(x);
    if (h < 0.5) {
      ctx.strokeStyle = h < 0.25 ? '#a9c860' : '#6f9440';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = -1; j <= 1; j++) {
        ctx.moveTo(x + j * 4, y + 2);
        ctx.quadraticCurveTo(x + j * 6, y - 8, x + j * 9 + 3, y - 12 - h * 10);
      }
      ctx.stroke();
    } else if (h > 0.9) {
      ctx.fillStyle = '#6d6e66';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 16 + h * 10, 10, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,240,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + 4, y - 2, 8, 3, 0, 0, TAU);
      ctx.fill();
    }
    // a scatter of soil pebbles below the lip
    if (h > 0.3 && h < 0.42) {
      ctx.fillStyle = 'rgba(30,26,12,0.5)';
      ctx.fillRect(x, y + 24 + h * 60, 4, 3);
    }
  }
  // kicker ramps get a metal Forerunner face
  const P = 2900;
  const r0 = Math.floor(L / P) - 1;
  for (let r = r0; r * P < R + P; r++) {
    const a = r * P + 1900;
    const b = r * P + 2200;
    if (b < L || a > R) continue;
    ctx.beginPath();
    ctx.moveTo(a + 60, groundY(a + 60) + 6);
    for (let x = a + 60; x <= b; x += 10) ctx.lineTo(x, groundY(x) + 2);
    ctx.lineTo(b, groundY(b) + 2);
    ctx.lineTo(b + 30, groundY(b + 30) + 40);
    ctx.lineTo(b - 30, groundY(b - 30) + 40);
    ctx.closePath();
    ctx.fillStyle = '#8c95a3';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,46,58,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(120,210,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(b - 120, groundY(b - 120) + 12);
    ctx.lineTo(b - 6, groundY(b - 6) + 12);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, s: State) {
  for (const p of s.smoke.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    const grow = 1.8 - k * 0.8;
    ctx.globalAlpha = k * (p.kind === 2 ? 0.5 : p.kind === 1 ? 0.45 : 0.32);
    ctx.fillStyle = p.kind === 2 ? '#3a3632' : p.kind === 1 ? '#dcdcd6' : '#b9a57c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * grow, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- the Warthog ---------- */

const OLIVE = ['#a7b46e', '#5c6a30', '#232a10'] as const;
const OLIVE_D = ['#828d54', '#434e22', '#181d0b'] as const;
const STEEL = ['#a8adb2', '#555a60', '#1d2024'] as const;
const DARK = ['#5a5d63', '#2a2c31', '#0e0f12'] as const;
const TYRE = ['#4a4a4c', '#232325', '#0b0b0c'] as const;

const chief: ChiefPose = {
  crouch: 0,
  lean: 0,
  br: 0,
  front: newArm(0, 0),
  back: newArm(0, 0),
  gripX: 0,
  gripY: 0,
  rifleA: 0,
  rifleK: 0.94,
  slung: true,
  look: 0,
  stride: 0,
};

function carLights(p: Painter) {
  p.lx = 0.72;
  p.ly = -0.69;
  p.bx = -0.94;
  p.by = -0.34;
  p.back = 'rgba(255,240,210,0.55)';
  p.backW = 2.2;
  p.outline = 'rgba(14,16,8,0.92)';
  p.outlineW = 1.8;
}

function drawCar(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  // contact shadow on the ground under the hull
  const gy = groundY(s.x);
  const lift = clamp((gy - s.y - 60) / 300, 0, 1);
  ctx.fillStyle = `rgba(20,26,10,${(0.35 * (1 - lift * 0.7)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(s.x, gy + 4, 250 * (1 - lift * 0.3), 12, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.ang);
  carLights(p);
  // far side: wheels in shadow, roll bar, the passenger
  for (let i = 0; i < 2; i++) wheel(p, s, i, true);
  for (let i = 0; i < 2; i++) suspension(p, s, i);
  rollBar(p, true);
  const sw = s.switchT >= 0 ? clamp(s.switchT / SWITCH_T, 0, 1) : -1;
  marine(p, s, t, sw);
  // the turret and its gunner
  turret(p, s);
  if (s.seat === 'gun' && sw < 0) gunner(p, s, t);
  hull(p);
  if (s.seat === 'drive' && sw < 0) driver(p, s, t);
  rollBar(p, false);
  windshield(p);
  if (sw >= 0) jumper(p, s, t, sw);
  for (let i = 0; i < 2; i++) wheel(p, s, i, false);
  ctx.restore();
  p.back = '';
}

function wheel(p: Painter, s: State, i: number, far: boolean) {
  const ctx = p.ctx;
  const wh = s.wheels[i];
  const lx = i === 0 ? -WB : WB;
  const ly = AXLE_Y + wh.ext;
  if (far) {
    // only the far tyres' tread shows beneath the hull
    ctx.fillStyle = '#121214';
    ctx.beginPath();
    ctx.arc(lx + 10, ly - 4, WR - 2, 0, TAU);
    ctx.fill();
    return;
  }
  // the hub's A-arm, seen through the wheel arch
  p.part(() => rpoly(ctx, [lx - (i ? 64 : -64), AXLE_Y - 14, lx, ly - 7, lx, ly + 7, lx - (i ? 64 : -64), AXLE_Y + 2], 4), DARK[0], DARK[1], DARK[2], 2, 4);
  // the tyre with chunky tread
  ctx.save();
  ctx.translate(lx, ly);
  p.part(() => ctx.arc(0, 0, WR, 0, TAU), TYRE[0], TYRE[1], TYRE[2], 3, 9);
  ctx.rotate(wh.spin);
  ctx.fillStyle = '#121213';
  for (let j = 0; j < 16; j++) {
    ctx.rotate(TAU / 16);
    ctx.fillRect(WR - 7, -5, 9, 10);
  }
  ctx.restore();
  ctx.save();
  ctx.translate(lx, ly);
  // rim, a hub and lug bolts that turn with it
  p.part(() => ctx.arc(0, 0, WR * 0.58, 0, TAU), STEEL[0], STEEL[1], STEEL[2], 2.5, 6);
  p.part(() => ctx.arc(0, 0, WR * 0.36, 0, TAU), DARK[0], DARK[1], DARK[2], 2, 4);
  ctx.rotate(wh.spin);
  ctx.fillStyle = '#c8ccd2';
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * WR * 0.46, Math.sin(a) * WR * 0.46, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // motion blur across the tread at speed
  if (Math.abs(s.vx) > 500 && !p.glow) {
    ctx.strokeStyle = `rgba(30,30,32,${clamp((Math.abs(s.vx) - 500) / 900, 0, 0.6).toFixed(3)})`;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(lx, ly, WR - 4, 0, TAU);
    ctx.stroke();
  }
}

/** A coil-over from the hull down to the hub, drawn inside the wheel arch */
function suspension(p: Painter, s: State, i: number) {
  const ctx = p.ctx;
  const wh = s.wheels[i];
  const lx = i === 0 ? -WB : WB;
  const ly = AXLE_Y + wh.ext;
  const sx = lx + (i ? -22 : 22);
  const top = -30;
  p.part(() => rpoly(ctx, [sx - 5, top, sx + 5, top, sx + 4, ly - 4, sx - 4, ly - 4], 2), STEEL[0], STEEL[1], STEEL[2], 1.5, 3);
  if (p.glow) return;
  ctx.strokeStyle = '#c9a43a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const n = 7;
  for (let j = 0; j <= n; j++) {
    const y = lerp(top + 6, ly - 12, j / n);
    const x = sx + (j % 2 ? 7 : -7);
    if (j === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function hull(p: Painter) {
  const ctx = p.ctx;
  // chassis rail and belly pan
  p.part(() => rpoly(ctx, [-252, 6, 250, 6, 238, 34, -236, 34], 6), DARK[0], DARK[1], DARK[2], 2, 5);
  // the rear bed: tall side walls with the tail lights
  p.part(() => rpoly(ctx, [-262, -52, -70, -52, -60, 12, -258, 14], 8), OLIVE[0], OLIVE[1], OLIVE[2], 3, 10);
  // the cab sill between the bed and the hood
  p.part(() => rpoly(ctx, [-76, -32, 96, -36, 102, 12, -70, 14], 6), OLIVE_D[0], OLIVE_D[1], OLIVE_D[2], 2.5, 7);
  // the long sloping hood, running down to the grille
  p.part(
    () => rpoly(ctx, [86, -56, 160, -50, 238, -30, 268, -12, 270, 14, 98, 16], 8),
    OLIVE[0],
    OLIVE[1],
    OLIVE[2],
    3,
    10
  );
  // big angular fender pods over each wheel: the front ones run forward past the
  // wheel and carry the headlights, the rear ones sweep back over the tail
  for (const fx of [-WB, WB]) {
    const front = fx > 0;
    const pts = front
      ? [fx - 86, 6, fx - 80, -42, fx - 52, -74, fx + 56, -76, fx + 104, -50, fx + 122, -18, fx + 114, 6]
      : [fx - 112, 6, fx - 116, -38, fx - 92, -70, fx + 46, -72, fx + 84, -44, fx + 92, 6];
    p.part(
      () => {
        const n = pts.length / 2;
        ctx.moveTo(pts[0], pts[1]);
        for (let j = 1; j < n; j++) ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
        ctx.lineTo(fx + 68, 6);
        ctx.arc(fx, 28, 68, -0.32, Math.PI + 0.32, true);
        ctx.closePath();
      },
      OLIVE[0],
      OLIVE[1],
      OLIVE[2],
      3,
      12
    );
    line(p, 'rgba(14,16,8,0.6)', 1.8, () => {
      ctx.moveTo(fx - (front ? 78 : 110), -40);
      ctx.lineTo(fx + (front ? 112 : 84), front ? -36 : -40);
    });
    line(p, 'rgba(255,250,220,0.55)', 2.4, () => {
      ctx.moveTo(fx - (front ? 48 : 88), front ? -70 : -66);
      ctx.lineTo(fx + (front ? 54 : 44), front ? -72 : -68);
    });
  }
  // the grille and bull bar
  p.part(() => rpoly(ctx, [256, -14, 280, -10, 284, 30, 258, 30], 3), DARK[0], DARK[1], DARK[2], 2, 4);
  if (!p.glow) {
    ctx.fillStyle = '#0c0d0f';
    for (let i = 0; i < 4; i++) ctx.fillRect(262 + i * 5, -6, 2.5, 30);
  }
  p.part(() => rpoly(ctx, [274, -2, 296, 0, 296, 36, 270, 38], 3), STEEL[0], STEEL[1], STEEL[2], 2, 4);
  // headlights
  if (!p.glow) {
    ctx.fillStyle = '#1c1e14';
    ctx.fillRect(244, -34, 22, 14);
    ctx.fillStyle = '#f6f2d4';
    ctx.fillRect(250, -31, 7, 8);
    ctx.fillRect(259, -31, 6, 8);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 258, -27, 38, '255,240,190', 0.5);
    ctx.globalCompositeOperation = 'source-over';
    // tail light
    ctx.fillStyle = '#d23a2c';
    ctx.fillRect(-262, -34, 6, 14);
  }
  // panel seams, rivets and painted UNSC stripes
  line(p, 'rgba(14,16,8,0.7)', 1.6, () => {
    ctx.moveTo(-180, -48);
    ctx.lineTo(-176, 10);
    ctx.moveTo(-110, -48);
    ctx.lineTo(-108, 10);
    ctx.moveTo(150, -52);
    ctx.lineTo(236, -24);
  });
  line(p, 'rgba(255,250,220,0.5)', 2.4, () => {
    ctx.moveTo(-252, -46);
    ctx.lineTo(-78, -46);
    ctx.moveTo(100, -50);
    ctx.lineTo(230, -30);
  });
  if (!p.glow) {
    ctx.fillStyle = 'rgba(20,22,10,0.6)';
    for (let i = 0; i < 6; i++) ctx.fillRect(-246 + i * 30, -8, 3, 3);
    ctx.fillStyle = 'rgba(230,226,190,0.55)';
    ctx.fillRect(-240, -26, 48, 5);
    ctx.fillRect(-240, -18, 30, 3);
  }
}

function rollBar(p: Painter, far: boolean) {
  const ctx = p.ctx;
  const M = far ? DARK : STEEL;
  // an arched roll bar behind the seats
  const off = far ? 10 : 0;
  p.part(
    () => {
      ctx.moveTo(-56 + off, -30);
      ctx.lineTo(-50 + off, -124);
      ctx.quadraticCurveTo(-46 + off, -138, -30 + off, -138);
      ctx.lineTo(-8 + off, -138);
      ctx.lineTo(-8 + off, -128);
      ctx.lineTo(-30 + off, -128);
      ctx.quadraticCurveTo(-38 + off, -128, -40 + off, -118);
      ctx.lineTo(-44 + off, -30);
      ctx.closePath();
    },
    M[0],
    M[1],
    M[2],
    1.5,
    3
  );
  if (!far) {
    // the seat back
    p.part(() => rpoly(ctx, [-36, -94, -10, -98, -6, -30, -32, -30], 6), DARK[0], DARK[1], DARK[2], 2, 4);
  }
}

function windshield(p: Painter) {
  const ctx = p.ctx;
  // a low folding frame and the steering wheel on its column
  p.part(() => rpoly(ctx, [96, -54, 104, -54, 84, -112, 76, -112], 2), STEEL[0], STEEL[1], STEEL[2], 1.5, 3);
  p.part(() => rpoly(ctx, [74, -116, 84, -116, 92, -110, 70, -110], 2), STEEL[0], STEEL[1], STEEL[2], 1.5, 3);
  if (!p.glow) {
    ctx.fillStyle = 'rgba(170,210,235,0.18)';
    ctx.beginPath();
    ctx.moveTo(98, -56);
    ctx.lineTo(80, -110);
    ctx.lineTo(86, -110);
    ctx.lineTo(104, -56);
    ctx.closePath();
    ctx.fill();
  }
  p.part(() => rpoly(ctx, [96, -40, 102, -44, WHEEL[0] + 4, WHEEL[1] + 2, WHEEL[0] - 2, WHEEL[1] + 4], 2), DARK[0], DARK[1], DARK[2], 1.5, 3);
  frame(p, WHEEL[0], WHEEL[1], -1.2, 1, () =>
    p.part(() => ctx.ellipse(0, 0, 4, 16, 0, 0, TAU), DARK[0], DARK[1], DARK[2], 1.5, 3)
  );
}

/** The M41 on its pintle: yoke, receiver, ammo can and three barrels that spin */
function turret(p: Painter, s: State) {
  const ctx = p.ctx;
  // the mount post rising out of the bed
  p.part(() => rpoly(ctx, [PIVOT[0] - 12, PIVOT[1] + 6, PIVOT[0] + 12, PIVOT[1] + 6, PIVOT[0] + 18, -40, PIVOT[0] - 18, -40], 3), DARK[0], DARK[1], DARK[2], 2, 4);
  frame(p, PIVOT[0], PIVOT[1], s.gunA, 1, () => {
    // ammo can slung under the receiver
    p.part(() => rpoly(ctx, [-28, 12, 16, 12, 16, 44, -28, 44], 3), OLIVE_D[0], OLIVE_D[1], OLIVE_D[2], 2, 4);
    // spade grips at the back
    p.part(() => rpoly(ctx, [-56, -16, -44, -16, -40, 18, -52, 18], 3), DARK[0], DARK[1], DARK[2], 1.5, 3);
    // receiver
    p.part(() => rpoly(ctx, [-44, -18, 40, -20, 46, 14, -42, 16], 4), STEEL[0], STEEL[1], STEEL[2], 2.5, 7);
    p.part(() => rpoly(ctx, [-30, -28, 20, -28, 24, -18, -32, -18], 3), DARK[0], DARK[1], DARK[2], 1.5, 3);
    // the barrel cluster: three tubes round an axis, the near one drawn bright
    const ph = s.barrel;
    const tubes = [0, 1, 2].map((j) => ph + (j * TAU) / 3).sort((a, b) => Math.cos(a) - Math.cos(b));
    for (const a of tubes) {
      const y = Math.sin(a) * 6.5 - 2;
      const near = Math.cos(a);
      const T3 = near > 0.3 ? STEEL : DARK;
      p.part(() => rpoly(ctx, [40, y - 3.6, MUZ[0], y - 3, MUZ[0], y + 3, 40, y + 3.6], 2), T3[0], T3[1], T3[2], 1, 2);
    }
    // collars that hold the barrels together
    p.part(() => rpoly(ctx, [86, -14, 96, -14, 96, 10, 86, 10], 2), DARK[0], DARK[1], DARK[2], 1.5, 3);
    p.part(() => rpoly(ctx, [MUZ[0] - 12, -13, MUZ[0], -12, MUZ[0], 8, MUZ[0] - 12, 9], 2), DARK[0], DARK[1], DARK[2], 1.5, 3);
    if (!p.glow) {
      // hot barrels glow at the muzzle end
      if (s.heat > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,40,${(s.heat * 0.6).toFixed(3)})`;
        ctx.fillRect(100, -10, MUZ[0] - 112, 16);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(255,255,240,0.45)';
      ctx.fillRect(-40, -16, 78, 2);
    }
  });
  // the yoke over the pivot
  p.part(() => ctx.arc(PIVOT[0], PIVOT[1], 11, 0, TAU), DARK[0], DARK[1], DARK[2], 2, 4);
}

/* ---------- crew ---------- */

/** Chief at the wheel: seated, legs hidden in the footwell, hands on the wheel */
function driver(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  const bump = clamp(s.wheels[1].comp - REST * 0.4, -10, 20) * 0.4;
  setChiefCommon(t);
  chief.noLegs = true;
  chief.lean = -0.04 + s.throttle * 0.06 - s.va * 0.02;
  chief.crouch = 0;
  chief.look = -0.05 + (s.air > 0.2 ? -0.12 : 0);
  // pelvis on the seat
  const ox = SEAT[0];
  const oy = SEAT[1] + bump + (PELVIS - chief.crouch) * CHK;
  // reach both hands to the wheel rim, in the torso frame
  const cl = Math.cos(chief.lean);
  const sl = Math.sin(chief.lean);
  const toT = (wx: number, wy: number) => {
    const dx = (wx - ox) / CHK;
    const dy = (wy - oy) / CHK + PELVIS - chief.crouch;
    return [dx * cl + dy * sl, -dx * sl + dy * cl] as const;
  };
  const steer = Math.sin(t * 1.7) * 3 + s.va * 4;
  const [n1x, n1y] = toT(WHEEL[0] - 2, WHEEL[1] - 12 + steer);
  const [f1x, f1y] = toT(WHEEL[0] + 2, WHEEL[1] + 10 - steer);
  reach(chief.front, NSH[0], NSH[1], n1x, n1y);
  reach(chief.back, FSH[0], FSH[1], f1x, f1y);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(CHK, CHK);
  chiefFigure(p, chief, t);
  ctx.restore();
  carLights(p);
}

/** Chief on the turret: standing in the bed, gripping the spade handles */
function gunner(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  setChiefCommon(t);
  chief.noLegs = false;
  chief.feet = undefined;
  const ga = s.gunA;
  chief.lean = 0.12 + Math.max(0, -ga) * 0.18 + s.spin * 0.04;
  chief.crouch = 4 + s.spin * 6 + clamp(s.wheels[0].comp - REST * 0.4, -10, 20) * 0.6;
  chief.look = ga * 0.6;
  const ox = GUNNER[0];
  const oy = GUNNER[1];
  const cl = Math.cos(chief.lean);
  const sl = Math.sin(chief.lean);
  const toT = (wx: number, wy: number) => {
    const dx = (wx - ox) / CHK;
    const dy = (wy - oy) / CHK + PELVIS - chief.crouch;
    return [dx * cl + dy * sl, -dx * sl + dy * cl] as const;
  };
  // the spade grips in car space
  const ca = Math.cos(ga);
  const sa = Math.sin(ga);
  const grip = (gx: number, gy: number) => [PIVOT[0] + gx * ca - gy * sa, PIVOT[1] + gx * sa + gy * ca] as const;
  const shake = s.spin > 0.6 ? Math.sin(t * 90) * 1.2 : 0;
  const [ax, ay] = grip(-50, 8 + shake);
  const [bx, by] = grip(-48, -10 + shake);
  const [n1x, n1y] = toT(ax, ay);
  const [f1x, f1y] = toT(bx, by);
  reach(chief.front, NSH[0], NSH[1], n1x, n1y);
  reach(chief.back, FSH[0], FSH[1], f1x, f1y);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(CHK, CHK);
  chiefFigure(p, chief, t);
  ctx.restore();
  carLights(p);
  // the bed wall hides his legs
  p.part(() => rpoly(ctx, [-262, -52, -70, -52, -60, 12, -258, 14], 8), OLIVE[0], OLIVE[1], OLIVE[2], 3, 10);
}

/** Mid-switch: a vault from one seat to the other over the roll bar */
function jumper(p: Painter, s: State, t: number, k: number) {
  const ctx = p.ctx;
  const toGun = (s.seat === 'gun') !== k > 0.55;
  const u = easeInOutCubic(k);
  const from = toGun ? [SEAT[0], SEAT[1] + 10] : [GUNNER[0], GUNNER[1]];
  const to = toGun ? [GUNNER[0], GUNNER[1]] : [SEAT[0], SEAT[1] + 10];
  const x = lerp(from[0], to[0], u);
  const y = lerp(from[1], to[1], u) - Math.sin(u * Math.PI) * 120;
  setChiefCommon(t);
  chief.noLegs = false;
  chief.feet = [34, -40 * Math.sin(u * Math.PI), -30, -50 * Math.sin(u * Math.PI)];
  chief.lean = 0.25 * Math.sin(u * Math.PI) * (toGun ? -1 : 1);
  chief.crouch = 30;
  chief.look = 0;
  chief.front.a1 = -0.8;
  chief.front.a2 = -1.2;
  chief.back.a1 = 0.6;
  chief.back.a2 = 0.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(CHK, CHK);
  chiefFigure(p, chief, t);
  ctx.restore();
  carLights(p);
  chief.feet = undefined;
}

function setChiefCommon(t: number) {
  chief.br = Math.sin(t * 1.6) * 1.2;
  chief.slung = true;
  chief.stride = 0;
}

const MAR = ['#9aa36a', '#566034', '#1f2410'] as const;
const MAR_D = ['#6f7650', '#3b4224', '#141808'] as const;

/** A UNSC Marine: helmet, fatigues and body armour, rides shotgun or drives */
function marine(p: Painter, s: State, t: number, sw: number) {
  const ctx = p.ctx;
  // with the Chief on the gun he drives; otherwise he rides in the far seat
  let drive = s.seat === 'gun' ? 1 : 0;
  if (sw >= 0) {
    const toGun = s.seat === 'gun' ? sw > 0.55 : sw <= 0.55;
    drive = toGun ? clamp((sw - 0.2) / 0.6, 0, 1) : 1 - clamp((sw - 0.2) / 0.6, 0, 1);
  }
  const far = drive < 0.5;
  const C = far ? MAR_D : MAR;
  const x = lerp(SEAT[0] - 10, SEAT[0] - 4, drive);
  const y = SEAT[1] + 4 + Math.sin(t * 9) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.92, 0.92);
  // torso and armour vest
  p.part(() => rpoly(ctx, [-16, 0, 16, 0, 20, -50, -14, -54], 6), C[0], C[1], C[2], 2, 5);
  p.part(() => rpoly(ctx, [-12, -16, 18, -18, 20, -50, -10, -52], 5), DARK[0], DARK[1], DARK[2], 1.5, 4);
  // the head under a rounded helmet
  p.part(() => ctx.ellipse(6, -64, 11, 12, 0, 0, TAU), '#d7a27c', '#a26a46', '#4c2e1c', 1.5, 3);
  p.part(
    () => {
      ctx.moveTo(-10, -62);
      ctx.bezierCurveTo(-12, -84, 22, -86, 22, -66);
      ctx.lineTo(24, -62);
      ctx.lineTo(-12, -60);
      ctx.closePath();
    },
    C[0],
    C[1],
    C[2],
    2,
    5
  );
  if (!p.glow && !far) {
    ctx.fillStyle = '#222';
    ctx.fillRect(13, -64, 6, 3);
  }
  // arms out to the wheel when driving, folded when riding
  const hx = lerp(14, WHEEL[0] - x, drive);
  const hy = lerp(-30, WHEEL[1] - y + 4, drive);
  ctx.strokeStyle = far ? '#3b4224' : '#566034';
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(4, -46);
  ctx.quadraticCurveTo(lerp(18, 26, drive), lerp(-24, -30, drive), hx, hy);
  ctx.stroke();
  ctx.restore();
}

/* ---------- foes ---------- */

const COV = ['#d8c4ff', '#7350d0', '#2a1a6a'] as const;
const COV_D = ['#a996d8', '#4f3798', '#1c1048'] as const;
const GRUNT = [
  ['#ffc27a', '#d4721c', '#5a2a06'],
  ['#ff9a8a', '#b8282a', '#4a0a0a'],
] as const;

function drawFoes(p: Painter, s: State, t: number, air: boolean) {
  for (const f of s.foes) {
    if (!f.on) continue;
    if ((f.kind === 'banshee') !== air) continue;
    if (f.kind === 'grunt' && f.dead > 1.2) continue;
    const ctx = p.ctx;
    p.lx = 0.72;
    p.ly = -0.69;
    p.bx = -0.94;
    p.by = -0.34;
    p.back = '';
    p.outline = 'rgba(14,8,30,0.92)';
    p.outlineW = 1.6;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.rot) ctx.rotate(f.rot);
    // all of them face left, toward the Warthog
    ctx.scale(-1, 1);
    p.lx = -0.72;
    p.bx = 0.94;
    if (f.kind === 'grunt') grunt(p, f);
    else if (f.kind === 'ghost') ghost(p, f, t);
    else banshee(p, f, t);
    ctx.restore();
    if (f.flash > 0.05 && !f.dead) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, f.x, f.y - foeCenter(f), foeRadius(f), '255,230,170', 0.3 * f.flash);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

/** Unggoy: squat, gas-masked, with a methane tank and a habit of panicking */
function grunt(p: Painter, f: Foe) {
  const ctx = p.ctx;
  const G = GRUNT[f.rank] ?? GRUNT[0];
  const run = f.panic > 0.5 && !f.dead;
  const ph = f.t * (run ? 16 : 3);
  const bob = run ? Math.abs(Math.sin(ph)) * -6 : Math.sin(ph) * 1.5;
  // stubby legs
  for (const side of [-1, 1]) {
    const k = run ? Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 12 : 0;
    p.part(() => capsule(ctx, side * 6, -30 + bob, side * 6 + k, -4, 9, 7), '#8d8577', '#4c463d', '#1d1a16', 1.5, 3);
    p.part(() => rpoly(ctx, [side * 6 + k - 8, -8, side * 6 + k + 14, -8, side * 6 + k + 16, 0, side * 6 + k - 10, 0], 3), '#6b6c74', '#34353b', '#111114', 1.5, 3);
  }
  // the methane tank, a tall wedge on its back with three nozzles
  p.part(() => rpoly(ctx, [-20, -26 + bob, -50, -96 + bob, -34, -102 + bob, -4, -40 + bob], 5), '#b9d6e6', '#5d8aa4', '#1f3644', 2, 6);
  if (!p.glow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(140,240,255,0.6)';
    ctx.fillRect(-36, -82 + bob, 6, 18);
    ctx.globalCompositeOperation = 'source-over';
  }
  // round body in its armour vest
  p.part(() => ctx.ellipse(0, -42 + bob, 26, 24, -0.2, 0, TAU), G[0], G[1], G[2], 3, 8);
  p.part(() => ctx.ellipse(10, -46 + bob, 14, 16, -0.1, 0, TAU), G[0], G[1], G[2], 2, 5);
  // head and breather mask
  p.part(() => ctx.ellipse(16, -66 + bob, 13, 12, 0, 0, TAU), '#9a9284', '#544c42', '#1e1a16', 2, 4);
  p.part(() => rpoly(ctx, [18, -66 + bob, 34, -62 + bob, 32, -50 + bob, 18, -52 + bob], 4), '#8b8f9a', '#3f424a', '#141519', 1.5, 3);
  if (!p.glow) {
    ctx.fillStyle = '#ffde6a';
    ctx.beginPath();
    ctx.arc(20, -71 + bob, 2.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,36,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, -52 + bob);
    ctx.quadraticCurveTo(0, -40 + bob, -14, -60 + bob);
    ctx.stroke();
  }
  // arms: a plasma pistol held out, or both flung up in a panic
  const a1 = run ? -2.2 + Math.sin(ph * 1.3) * 0.5 : 0.3;
  const a2 = run ? -1.6 + Math.sin(ph * 1.1 + 1) * 0.6 : 0.6;
  for (const [a, x0] of [
    [a2, -6],
    [a1, 12],
  ] as const) {
    const hx = x0 + Math.cos(a) * 30;
    const hy = -50 + bob + Math.sin(a) * 30;
    p.part(() => capsule(ctx, x0, -50 + bob, hx, hy, 6, 5), '#9a9284', '#544c42', '#1e1a16', 1.5, 3);
    if (!run && x0 > 0 && !p.glow) {
      ctx.fillStyle = '#7fd06a';
      ctx.beginPath();
      ctx.ellipse(hx + 6, hy, 9, 5, a, 0, TAU);
      ctx.fill();
    }
  }
}

/** The Ghost: a hovering raider with a raised engine pod and forward-swept gun pods */
function ghost(p: Painter, f: Foe, t: number) {
  const ctx = p.ctx;
  const tilt = f.dead ? 0 : Math.sin(f.t * 2.2) * 0.04;
  ctx.rotate(tilt);
  // the hover glow beneath
  if (!p.glow && !f.dead) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, -10, 30, 90, '120,170,255', 0.35 + 0.1 * Math.sin(t * 20));
    ctx.globalCompositeOperation = 'source-over';
  }
  ghostPod(p, -10, -6, true);
  // a Grunt in the saddle, behind the near pod
  p.part(() => rpoly(ctx, [-50, -56, -28, -50, -24, -26, -52, -28], 6), GRUNT[0][0], GRUNT[0][1], GRUNT[0][2], 2, 4);
  p.part(() => ctx.ellipse(-26, -64, 11, 10, 0, 0, TAU), '#9a9284', '#544c42', '#1e1a16', 2, 4);
  p.part(() => rpoly(ctx, [-24, -64, -10, -60, -12, -52, -24, -54], 3), '#8b8f9a', '#3f424a', '#141519', 1.5, 3);
  // the fuselage, low and curved
  p.part(
    () => {
      ctx.moveTo(-70, -20);
      ctx.bezierCurveTo(-50, -40, 10, -40, 70, -24);
      ctx.bezierCurveTo(84, -18, 82, -6, 62, -2);
      ctx.bezierCurveTo(10, 8, -50, 8, -70, -20);
      ctx.closePath();
    },
    COV[0],
    COV[1],
    COV[2],
    3,
    10
  );
  // the raised engine housing at the back
  p.part(
    () => {
      ctx.moveTo(-112, -8);
      ctx.bezierCurveTo(-118, -46, -86, -70, -58, -62);
      ctx.bezierCurveTo(-40, -56, -36, -40, -40, -24);
      ctx.bezierCurveTo(-60, -6, -92, 0, -112, -8);
      ctx.closePath();
    },
    COV[0],
    COV[1],
    COV[2],
    3,
    11
  );
  line(p, 'rgba(240,235,255,0.75)', 2.4, () => {
    ctx.moveTo(-100, -40);
    ctx.quadraticCurveTo(-80, -64, -56, -60);
    ctx.moveTo(-40, -34);
    ctx.quadraticCurveTo(10, -38, 56, -26);
  });
  ghostPod(p, 8, 2, false);
  if (!p.glow && !f.dead) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(150,210,255,0.85)';
    ctx.fillRect(-20, 4, 70, 2.5);
    glow(ctx, -112, -26, 26, '140,190,255', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (f.dead) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -20, 90, '255,140,50', clamp(1 - f.dead / 4, 0, 0.7));
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** One of the Ghost's side pods: a long blade sweeping forward to a twin plasma cannon */
function ghostPod(p: Painter, dx: number, dy: number, far: boolean) {
  const ctx = p.ctx;
  const C = far ? COV_D : COV;
  p.part(
    () => {
      ctx.moveTo(-60 + dx, -16 + dy);
      ctx.bezierCurveTo(-10 + dx, -42 + dy, 80 + dx, -34 + dy, 128 + dx, -8 + dy);
      ctx.lineTo(132 + dx, 4 + dy);
      ctx.bezierCurveTo(80 + dx, 14 + dy, 0 + dx, 16 + dy, -56 + dx, 6 + dy);
      ctx.closePath();
    },
    C[0],
    C[1],
    C[2],
    2.5,
    8
  );
  if (p.glow) return;
  ctx.fillStyle = far ? '#140c2c' : '#1a1036';
  ctx.fillRect(126 + dx, -8 + dy, 18, 4);
  ctx.fillRect(126 + dx, 0 + dy, 18, 4);
  if (!far) {
    ctx.strokeStyle = 'rgba(240,235,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30 + dx, -24 + dy);
    ctx.quadraticCurveTo(50 + dx, -34 + dy, 118 + dx, -10 + dy);
    ctx.stroke();
  }
}

/** The Banshee: a pointed pod slung between two long drooping wings, engines glowing */
function banshee(p: Painter, f: Foe, t: number) {
  const ctx = p.ctx;
  const bank = f.dead ? 0 : Math.sin(f.t * 1.3) * 0.08;
  ctx.rotate(bank);
  bansheeWing(p, -6, -14, true);
  // tail fin rising off the back
  p.part(() => rpoly(ctx, [-56, -24, -104, -76, -88, -80, -34, -34], 4), COV_D[0], COV_D[1], COV_D[2], 2, 5);
  // the pod: rounded at the back, drawn to a point at the nose
  p.part(
    () => {
      ctx.moveTo(-84, -4);
      ctx.bezierCurveTo(-84, -42, -10, -50, 50, -26);
      ctx.bezierCurveTo(80, -14, 100, -4, 108, 2);
      ctx.bezierCurveTo(70, 18, 0, 30, -60, 22);
      ctx.bezierCurveTo(-78, 18, -84, 10, -84, -4);
      ctx.closePath();
    },
    COV[0],
    COV[1],
    COV[2],
    3,
    12
  );
  // canopy band
  p.part(() => rpoly(ctx, [6, -34, 52, -24, 70, -12, 20, -18], 4), '#9fa6ff', '#2f2a7a', '#120e3a', 1.5, 4);
  line(p, 'rgba(240,235,255,0.75)', 2.4, () => {
    ctx.moveTo(-64, -30);
    ctx.quadraticCurveTo(-10, -48, 44, -28);
  });
  bansheeWing(p, 8, 4, false);
  if (!p.glow && !f.dead) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, -88, 2, 46, '170,140,255', 0.6 + 0.2 * Math.sin(t * 30));
    ctx.fillStyle = 'rgba(200,240,255,0.85)';
    ctx.fillRect(-40, 14, 50, 2.5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function bansheeWing(p: Painter, dx: number, dy: number, far: boolean) {
  const ctx = p.ctx;
  const C = far ? COV_D : COV;
  // the wing drops away from the pod, then reaches forward to its gun pod
  p.part(
    () => {
      ctx.moveTo(-40 + dx, 6 + dy);
      ctx.bezierCurveTo(-30 + dx, 40 + dy, 10 + dx, 70 + dy, 70 + dx, 84 + dy);
      ctx.lineTo(80 + dx, 98 + dy);
      ctx.bezierCurveTo(10 + dx, 92 + dy, -40 + dx, 60 + dy, -60 + dx, 16 + dy);
      ctx.closePath();
    },
    C[0],
    C[1],
    C[2],
    2.5,
    8
  );
  p.part(
    () => {
      ctx.moveTo(56 + dx, 82 + dy);
      ctx.bezierCurveTo(90 + dx, 76 + dy, 130 + dx, 82 + dy, 140 + dx, 90 + dy);
      ctx.bezierCurveTo(130 + dx, 98 + dy, 90 + dx, 102 + dy, 56 + dx, 98 + dy);
      ctx.closePath();
    },
    C[0],
    C[1],
    C[2],
    2,
    5
  );
  if (!p.glow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = far ? 'rgba(120,230,140,0.4)' : 'rgba(140,255,160,0.8)';
    ctx.fillRect(132 + dx, 87 + dy, 8, 5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ---------- effects ---------- */

function drawEffects(ctx: CanvasRenderingContext2D, s: State) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  // turret tracers
  for (const tr of s.tracers) {
    if (tr.life <= 0) continue;
    const k = tr.life / 0.06;
    const g = ctx.createLinearGradient(tr.x0, tr.y0, tr.x1, tr.y1);
    g.addColorStop(0, 'rgba(255,200,110,0)');
    g.addColorStop(0.5, `rgba(255,210,130,${(0.55 * k).toFixed(3)})`);
    g.addColorStop(1, `rgba(255,250,220,${(0.95 * k).toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tr.x0, tr.y0);
    ctx.lineTo(tr.x1, tr.y1);
    ctx.stroke();
  }
  // muzzle flash
  if (s.muzzle > 0.05) {
    const a = s.gunA + s.ang;
    const [px, py] = carToWorld(s, PIVOT[0], PIVOT[1]);
    const mx = px + Math.cos(a) * (MUZ[0] + 6);
    const my = py + Math.sin(a) * (MUZ[0] + 6);
    const m = s.muzzle;
    glow(ctx, mx, my, 90 * m, '255,180,80', 0.6 * m);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(255,236,170,${(0.95 * m).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -10 * m);
    ctx.lineTo(48 * m + 10, 0);
    ctx.lineTo(0, 10 * m);
    ctx.closePath();
    ctx.moveTo(6, 0);
    ctx.lineTo(18, -22 * m);
    ctx.lineTo(14, 0);
    ctx.lineTo(18, 22 * m);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Covenant plasma
  for (const b of s.bolts) {
    if (!b.on) continue;
    const a = Math.atan2(b.vy, b.vx);
    glow(ctx, b.x, b.y, 26, '110,200,255', 0.55);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(140,215,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 16, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2fbff';
    ctx.beginPath();
    ctx.ellipse(-4, 0, 8, 2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // sparks: 0 white, 2 violet blood, 3 fire, 4 hot white, 5 plasma
  const cols = ['#fff6e0', '', '#c09aff', '#ffb34a', '#fff2c8', '#9fdcff'];
  for (const p of s.fx.items) {
    if (p.life <= 0 || p.kind >= 6 || p.kind === 1) continue;
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
  // brass and wreckage
  for (const p of s.fx.items) {
    if (p.life <= 0 || p.kind < 6) continue;
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 7) {
      ctx.fillStyle = '#e2b860';
      ctx.fillRect(-4, -1.6, 8, 3.2);
    } else {
      ctx.fillStyle = '#5a4a8c';
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------- HUD (shapes only) ---------- */

function drawHud(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number) {
  // tile previews stay clean
  if (!env.interactive) return;
  const { w } = env;
  // seat marker: a small Warthog badge with the Chief's seat lit
  const x0 = 18;
  const y0 = 18;
  ctx.fillStyle = 'rgba(10,20,30,0.45)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, 74, 30, 8);
  ctx.fill();
  const seats = [
    [x0 + 48, y0 + 15, s.seat === 'drive'],
    [x0 + 22, y0 + 15, s.seat === 'gun'],
  ] as const;
  for (const [x, y, on] of seats) {
    ctx.fillStyle = on ? 'rgba(160,230,120,0.95)' : 'rgba(200,220,230,0.3)';
    ctx.beginPath();
    ctx.arc(x, y, on ? 7 : 5, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,220,230,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 + 30, y0 + 15);
  ctx.lineTo(x0 + 40, y0 + 15);
  ctx.stroke();
  // kills
  const n = Math.min(12, s.kills);
  for (let i = 0; i < n; i++) {
    const x = w - 22 - i * 14;
    const y = 30;
    ctx.fillStyle = 'rgba(200,170,255,0.9)';
    ctx.strokeStyle = 'rgba(10,6,30,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // the turret reticle
  const ptr = env.pointer;
  if (env.interactive && s.seat === 'gun' && s.aimPointer && ptr.inside) {
    const r = 20 + s.spin * 4;
    ctx.strokeStyle = 'rgba(255,240,200,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ptr.x, ptr.y, r, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + t * s.spin * 6;
      ctx.beginPath();
      ctx.moveTo(ptr.x + Math.cos(a) * (r - 7), ptr.y + Math.sin(a) * (r - 7));
      ctx.lineTo(ptr.x + Math.cos(a) * (r + 7), ptr.y + Math.sin(a) * (r + 7));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.fillRect(ptr.x - 1.5, ptr.y - 1.5, 3, 3);
  }
}

