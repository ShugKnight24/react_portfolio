import { clamp, createCanvasScene, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { emit, freeCanvas, glowSprite, layer, makePool, setHum, shakeX, shakeY, startHum, stepPool, stopHum } from './heroes-kit';
import type { Hum, Pool } from './heroes-kit';
import {
  applyCam,
  arm,
  cam,
  fixed,
  camToScreen,
  drawGojo,
  HANDS,
  headOpts,
  impactFrame,
  inkPx,
  leg,
  letterbox,
  makeOut,
  mixArm,
  mixCam,
  mulberry,
  speedLines,
  subtitle,
  techTitle,
} from './gojo-kit';
import type { Cam, GojoOut, GojoPose, Light } from './gojo-kit';

/**
 * Hollow Purple: Gojo floats over a night city in round shades. Hold the left half of the
 * scene to gather Lapse: Blue in his right hand (it drags debris in), the right half to gather
 * Reversal: Red in his left (it throws sparks out); Space or Enter charges both in turn. With
 * both full he folds them together in a run of close ups, the shades slide down and the
 * technique is named. Then point where to fire and let go: a purple sphere tears away in a
 * straight line, erasing everything in its path down to the horizon. A beat of silence, then
 * the boom, the shockwave and the rubble raining back down.
 */

type Phase = 'intro' | 'idle' | 'charge' | 'merge' | 'ready' | 'fire';

interface Bldg {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  seed: number;
  /** Scene time it was erased, or -1 */
  gone: number;
}

interface State {
  phase: Phase;
  pt: number;
  t: number;
  blue: number;
  red: number;
  charging: 0 | 1 | 2;
  lastCharging: 0 | 1 | 2;
  press: { pointer: boolean; key: boolean; side: 1 | 2; armed: boolean; touched: boolean };
  idleT: number;
  // aim, screen px and world ground point
  ax: number;
  ay: number;
  aimSet: boolean;
  tx: number;
  tz: number;
  // fire path in world units
  x0: number;
  y0: number;
  z0: number;
  dx: number;
  dz: number;
  len: number;
  u: number;
  fireHandX: number;
  fireHandY: number;
  carved: boolean;
  regen: number;
  shock: number;
  boomed: boolean;
  flash: number;
  shake: number;
  rmStage: number;
  pool: Pool;
  hums: { blue: Hum | null; red: Hum | null; purple: Hum | null };
  // layout
  w: number;
  h: number;
  portrait: boolean;
  hz: number;
  cy: number;
  f: number;
  camH: number;
  wide: Cam;
  wideX: number;
  wideY: number;
  bld: Bldg[];
  city: HTMLCanvasElement | null;
  cityAt: number;
  cityU: number;
  sky: HTMLCanvasElement | null;
  night: HTMLCanvasElement | null;
  sprites: Record<'blue' | 'red' | 'purple' | 'white', HTMLCanvasElement>;
  out: GojoOut;
  /** Hand anchors per pose, rig units, measured once */
  anchors: Record<'charge' | 'merge' | 'intro', GojoOut>;
  orbs: { bx: number; by: number; rx: number; ry: number; px: number; py: number; pr: number };
}

const R = 4.6;
const ZMAX = 230;
const CHARGE_RATE = 1 / 1.5;
const MERGE_LEN = 4.2;
const FIRE_LEN = 6.5;
const FLIGHT = 2.1;

const DEBRIS_IN = 0;
const SPARK = 1;
const CHUNK = 2;
const DUST = 3;
const EMBER = 4;
const BIG = 5;

/* ---------- poses ---------- */

const MOON: Light = { lx: 0.55, ly: -0.8, rim: '#b9a8ff', rimK: 0.45 };

function basePose(): GojoPose {
  return {
    lean: 0,
    turn: 0,
    head: headOpts({ look: 'shades', up: 0, smirk: 1 }),
    headTilt: 0,
    armL: arm(-10, 252, HANDS.relaxed, 0, 1.6, 0, -1, false, true),
    armR: arm(10, 252, HANDS.relaxed, 0, -1.6, 0, 1, false, true),
    legL: leg(16, 372),
    legR: leg(-18, 372),
    flow: 0,
    light: MOON,
    lw: 1.6,
  };
}

/** Arms out to the sides: Blue cupped in his right palm, Red on two raised fingers of his left */
function chargePose(t: number, blue: number, red: number): GojoPose {
  const p = basePose();
  p.lean = Math.sin(t * 0.8) * 0.01;
  p.head.yaw = 0.04;
  p.headTilt = -0.03;
  p.armR = blue > 0.01 ? fixed(arm(-200, -10, HANDS.cup, 0, -1.0, -0.4, -1), -1.4) : arm(-40, 200, HANDS.relaxed, 0, -1.6, 0, 1);
  p.armL = red > 0.01 ? fixed(arm(150, -120, HANDS.two, 0, 0.5, 0.1, -1), 0.15) : arm(40, 200, HANDS.relaxed, 0, 1.6, 0, -1);
  p.legL = leg(26, 370, 1, 0.4);
  p.legR = leg(-26, 366, 1, 0.4);
  return p;
}

/** Hands meeting in front of his chest */
function mergePose(k: number, t: number): GojoPose {
  const a = chargePose(t, 1, 1);
  const b = basePose();
  b.armR = fixed(arm(56, 96, HANDS.cup, 0, -1.0, -0.4, 1), -0.45);
  b.armL = fixed(arm(-50, 70, HANDS.two, 0, 0.5, 0.1, -1), -0.5);
  a.armR = mixArm(a.armR, b.armR, k);
  a.armL = mixArm(a.armL, b.armL, k);
  a.head.yaw = lerp(0.04, -0.05, k);
  a.headTilt = lerp(-0.03, 0.06, k);
  return a;
}

/** Floating over the city, turned toward the target, his left arm pointing the way */
function aimPose(s: State, t: number, point: number): GojoPose {
  const p = basePose();
  p.turn = 0.5;
  p.head.yaw = 0.5;
  p.lean = -0.05 + Math.sin(t * 0.9) * 0.012;
  // aim direction in rig space from the left shoulder
  const [ox, oy] = camToScreen(s.wide, s.wideX, s.wideY, 76 + 0.5 * 10, -638);
  const ang = Math.atan2(s.ay - oy, s.ax - ox);
  const reach = lerp(150, 262, point);
  const a = ang - p.lean;
  p.armL = mixArm(arm(14, 258, HANDS.relaxed, 0, 1.4, 0, -1), arm(Math.cos(a) * reach, Math.sin(a) * reach, HANDS.two, -0.15, 1.1, 0.25, -1), point);
  p.armR = arm(-30, 260, HANDS.relaxed, 0.1, -1.4, 0, 1);
  p.legL = leg(36, 362, 1, 0.9);
  p.legR = leg(-24, 350, 1, 1);
  p.flow = 0.35 + Math.sin(t * 1.4) * 0.15;
  p.head.wx = -10;
  return p;
}

/* ---------- world: night city in perspective ---------- */

const PITCH = 0.2;
const CP = Math.cos(PITCH);
const SP = Math.sin(PITCH);

/** World to screen: camera at height camH, tipped down by PITCH */
function proj(s: State, X: number, Y: number, Z: number): [number, number] {
  const yy = Y - s.camH;
  const yc = yy * CP + Z * SP;
  const zc = Math.max(0.5, -yy * SP + Z * CP);
  return [s.w / 2 + (s.f * X) / zc, s.cy - (s.f * yc) / zc];
}

/** Screen to the ground plane: [X, Z], Z capped at the far edge of the city */
function ground(s: State, sx: number, sy: number): [number, number] {
  const xc = (sx - s.w / 2) / s.f;
  const yc = -(sy - s.cy) / s.f;
  const den = yc * CP - SP;
  if (den > -0.004) return [(xc * ZMAX) / CP, ZMAX];
  const l = -s.camH / den;
  const z = l * (yc * SP + CP);
  if (z > ZMAX) return [(xc * ZMAX * l) / z, ZMAX];
  return [l * xc, z];
}

/** Screen point at world depth Z: [X, Y] */
function atDepth(s: State, sx: number, sy: number, Z: number): [number, number] {
  const xc = (sx - s.w / 2) / s.f;
  const yc = -(sy - s.cy) / s.f;
  const l = Z / (yc * SP + CP);
  return [l * xc, s.camH + l * (yc * CP - SP)];
}

function genCity(s: State) {
  const rnd = mulberry(4242);
  const bld: Bldg[] = [];
  const zNear = ground(s, s.w / 2, s.h)[1] - 4;
  for (let z = ZMAX - 10; z > zNear; z -= 5.2) {
    const half = ((s.w / 2) * (z * CP + s.camH * SP)) / s.f + 6;
    for (let x = -half; x < half; x += 5.2) {
      if (Math.abs(x) < 1.5 && rnd() < 0.5) continue;
      const n = rnd() < 0.35 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const bw = n === 2 ? 1.6 + rnd() * 0.6 : 2.6 + rnd() * 1.4;
        const tall = rnd();
        const hgt = 1.6 + tall * tall * 7 + (rnd() < 0.06 && z > 90 ? 6 + rnd() * 10 : 0);
        bld.push({ x: x + (n === 2 ? (i ? 1.2 : -1.2) : 0) + rnd() * 0.4, z: z + rnd() * 0.6, w: bw, d: 2.4 + rnd() * 1.2, h: hgt, seed: Math.floor(rnd() * 1e6), gone: -1 });
      }
    }
  }
  // far to near; within a row, outside in so inner side faces stay on top
  bld.sort((a, b) => b.z - a.z || Math.abs(b.x) - Math.abs(a.x));
  s.bld = bld;
}

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.sky, w, h, dpr);
  s.sky = a.cv;
  const c = a.c;
  if (!c) return;
  const g = c.createLinearGradient(0, 0, 0, s.hz);
  g.addColorStop(0, '#02030a');
  g.addColorStop(0.6, '#0b0d2a');
  g.addColorStop(1, '#2c1d55');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(9);
  for (let i = 0; i < (w * s.hz) / 1800; i++) {
    c.globalAlpha = 0.2 + rnd() * 0.6;
    c.fillStyle = rnd() < 0.3 ? '#c7d2ff' : '#ffffff';
    const r = rnd() < 0.07 ? 1.4 : 0.7;
    c.fillRect(rnd() * w, rnd() * s.hz * 0.9, r, r);
  }
  c.globalAlpha = 1;
  // moon low over the city, behind the line of fire
  const mx = w * (s.portrait ? 0.72 : 0.78);
  const my = s.hz * (s.portrait ? 0.42 : 0.38);
  const mr = Math.min(w, h) * 0.085;
  const halo = c.createRadialGradient(mx, my, mr, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(170,160,255,0.25)');
  halo.addColorStop(1, 'rgba(120,90,220,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, w, h);
  const disc = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fbf8ff');
  disc.addColorStop(1, '#bcb8ea');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  // haze over the horizon
  const hzG = c.createLinearGradient(0, s.hz - h * 0.12, 0, s.hz + 2);
  hzG.addColorStop(0, 'rgba(110,70,190,0)');
  hzG.addColorStop(1, 'rgba(150,100,220,0.45)');
  c.fillStyle = hzG;
  c.fillRect(0, s.hz - h * 0.12, w, h * 0.12 + 2);
  // ground
  const gg = c.createLinearGradient(0, s.hz, 0, h);
  gg.addColorStop(0, '#231a40');
  gg.addColorStop(0.15, '#0c0b1c');
  gg.addColorStop(1, '#05050b');
  c.fillStyle = gg;
  c.fillRect(0, s.hz, w, h - s.hz);
}

/** Close up backdrop: the city out of focus far below */
function paintNight(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.night, w, h, dpr);
  s.night = a.cv;
  const c = a.c;
  if (!c) return;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#03040d');
  g.addColorStop(0.55, '#110f30');
  g.addColorStop(1, '#2a1846');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(77);
  const m = Math.min(w, h);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = h * (0.45 + rnd() * 0.6);
    const r = m * (0.01 + rnd() * rnd() * 0.06);
    const col = rnd() < 0.5 ? '255,200,140' : rnd() < 0.5 ? '150,190,255' : '220,150,255';
    const bg = c.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, `rgba(${col},${0.25 + rnd() * 0.25})`);
    bg.addColorStop(0.7, `rgba(${col},0.12)`);
    bg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = bg;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Distance of a ground point from the line of fire: [across, along] */
function pathDist(s: State, x: number, z: number) {
  const rx = x - s.x0;
  const rz = z - s.z0;
  return [Math.abs(rx * s.dz - rz * s.dx), rx * s.dx + rz * s.dz];
}

function renderCity(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.city, w, h, dpr);
  s.city = a.cv;
  const c = a.c;
  if (!c) return;
  s.cityU = s.u;
  c.clearRect(0, 0, w, h);
  // avenues glowing with traffic
  c.strokeStyle = 'rgba(255,170,90,0.16)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = -120; x <= 120; x += 15.6) {
    const [ax, ay] = proj(s, x, 0, ZMAX);
    const [bx, by] = proj(s, x, 0, 14);
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
  }
  c.stroke();
  const fog = (z: number) => clamp((z - 30) / (ZMAX - 30), 0, 1);
  let lastZ = ZMAX + 5;
  const trenchTo = s.carved ? s.u : -1;
  const drawTrench = (z1: number, z2: number) => {
    if (trenchTo <= 0 || s.dz <= 0.01) return;
    // segment of the trench between depths z1 < z2
    const u1 = Math.max(0, (z1 - s.z0) / s.dz);
    const u2 = Math.min(trenchTo, (z2 - s.z0) / s.dz);
    if (u2 <= u1) return;
    const px = -s.dz;
    const pz = s.dx;
    const corner = (u: number, side: number, y = 0, k = 1.25) => proj(s, s.x0 + s.dx * u + px * R * k * side, y, s.z0 + s.dz * u + pz * R * k * side);
    const quad = (a: [number, number], b: [number, number], c2: [number, number], d: [number, number], fill: string | CanvasGradient) => {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineTo(c2[0], c2[1]);
      c.lineTo(d[0], d[1]);
      c.closePath();
      c.fill();
    };
    // a scooped channel: rim at street level, walls dropping to a floor below it
    const depth = -R * 0.9;
    const p1 = corner(u1, -1);
    const p2 = corner(u2, -1);
    const p3 = corner(u2, 1);
    const p4 = corner(u1, 1);
    const f1 = corner(u1, -1, depth, 0.7);
    const f2 = corner(u2, -1, depth, 0.7);
    const f3 = corner(u2, 1, depth, 0.7);
    const f4 = corner(u1, 1, depth, 0.7);
    quad(p1, p2, p3, p4, '#020005');
    quad(f1, f2, f3, f4, '#0c0418');
    // the wall on the far side of the line of sight catches the glow
    const wallL = c.createLinearGradient(p1[0], p1[1], f1[0], f1[1]);
    wallL.addColorStop(0, '#7a2a8a');
    wallL.addColorStop(1, '#140620');
    quad(p1, p2, f2, f1, wallL);
    const wallR = c.createLinearGradient(p4[0], p4[1], f4[0], f4[1]);
    wallR.addColorStop(0, '#5a1f70');
    wallR.addColorStop(1, '#0e0418');
    quad(p4, p3, f3, f4, wallR);
    // molten lips along both rims
    c.strokeStyle = 'rgba(255,150,230,0.9)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(p1[0], p1[1]);
    c.lineTo(p2[0], p2[1]);
    c.moveTo(p3[0], p3[1]);
    c.lineTo(p4[0], p4[1]);
    c.stroke();
    c.strokeStyle = 'rgba(255,190,120,0.35)';
    c.lineWidth = 4;
    c.stroke();
  };
  for (const b of s.bld) {
    if (b.z < lastZ - 2.6) {
      drawTrench(b.z + 2.6, lastZ);
      lastZ = b.z + 2.6;
    }
    if (b.gone >= 0) continue;
    const fz = fog(b.z);
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    const zf = b.z - b.d / 2;
    const zb = b.z + b.d / 2;
    const [ax, ay] = proj(s, x0, 0, zf);
    const [bx2, by2] = proj(s, x1, b.h, zf);
    const [ex2, ey2] = proj(s, x1, 0, zf);
    const [tx2, ty2] = proj(s, x0, b.h, zf);
    const rnd = mulberry(b.seed);
    const lum = 14 + rnd() * 10;
    const base = `rgb(${Math.round(lerp(lum, 70, fz * 0.7))},${Math.round(lerp(lum + 4, 52, fz * 0.7))},${Math.round(lerp(lum + 26, 120, fz * 0.7))})`;
    // side face toward the centre
    const sideX = b.x > 0 ? x0 : x1;
    const [s1x, s1y] = proj(s, sideX, 0, zf);
    const [s2x, s2y] = proj(s, sideX, b.h, zf);
    const [s3x, s3y] = proj(s, sideX, b.h, zb);
    const [s4x, s4y] = proj(s, sideX, 0, zb);
    c.fillStyle = `rgb(${Math.round(lerp(lum * 0.6, 55, fz * 0.7))},${Math.round(lerp(lum * 0.6 + 2, 40, fz * 0.7))},${Math.round(lerp(lum * 0.6 + 16, 100, fz * 0.7))})`;
    c.beginPath();
    c.moveTo(s1x, s1y);
    c.lineTo(s2x, s2y);
    c.lineTo(s3x, s3y);
    c.lineTo(s4x, s4y);
    c.closePath();
    c.fill();
    // roof, seen from above while below the camera
    if (b.h < s.camH) {
      const [r1x, r1y] = proj(s, x0, b.h, zb);
      const [r2x] = proj(s, x1, b.h, zb);
      c.fillStyle = `rgb(${Math.round(lerp(lum + 18, 95, fz * 0.7))},${Math.round(lerp(lum + 18, 80, fz * 0.7))},${Math.round(lerp(lum + 44, 150, fz * 0.7))})`;
      c.beginPath();
      c.moveTo(tx2, ty2);
      c.lineTo(bx2, by2);
      c.lineTo(r2x, r1y);
      c.lineTo(r1x, r1y);
      c.closePath();
      c.fill();
    }
    c.fillStyle = base;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(ex2, ey2);
    c.lineTo(bx2, by2);
    c.lineTo(tx2, ty2);
    c.closePath();
    c.fill();
    // windows
    const fw = bx2 - ax;
    const fh = ay - by2;
    if (fw > 5 && fh > 6) {
      const cols = Math.min(7, Math.floor(fw / 4));
      const rows = Math.min(16, Math.floor(fh / 4.5));
      const cw = fw / cols;
      const rh = fh / rows;
      const warm = rnd() < 0.6;
      c.fillStyle = warm ? '#ffcf8a' : '#9fd4ff';
      c.globalAlpha = 0.75 * (1 - fz * 0.6);
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) if (rnd() < 0.42) c.fillRect(ax + j * cw + cw * 0.28, by2 + i * rh + rh * 0.3, cw * 0.44, rh * 0.38);
      c.globalAlpha = 1;
    } else if (rnd() < 0.5) {
      c.fillStyle = rnd() < 0.6 ? 'rgba(255,207,138,0.6)' : 'rgba(159,212,255,0.6)';
      c.fillRect(ax + fw * 0.3, by2 + fh * 0.3, Math.max(0.8, fw * 0.3), Math.max(0.8, fh * 0.2));
    }
    if (b.h > 12 && rnd() < 0.7) {
      c.fillStyle = '#ff4a5e';
      const [lx, ly] = proj(s, b.x, b.h + 0.6, zf);
      c.fillRect(lx - 1, ly - 1, 2, 2);
    }
  }
  drawTrench(0, lastZ);
  // depth haze
  const hg = c.createLinearGradient(0, s.hz, 0, s.hz + h * 0.25);
  hg.addColorStop(0, 'rgba(120,80,200,0.35)');
  hg.addColorStop(1, 'rgba(120,80,200,0)');
  c.fillStyle = hg;
  c.fillRect(0, s.hz - h * 0.2, w, h * 0.45);
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.w = w;
  s.h = h;
  s.portrait = h > w * 1.1;
  s.hz = h * (s.portrait ? 0.3 : 0.34);
  s.f = Math.max(w, h) * 0.8;
  s.cy = s.hz + s.f * Math.tan(PITCH);
  s.camH = 24;
  const z = s.portrait ? w / 760 : h / 860;
  s.wide = cam(0, -720, z);
  s.wideX = w * (s.portrait ? 0.3 : 0.2);
  s.wideY = s.portrait ? h * 0.46 : h * 0.3;
  if (!s.aimSet) {
    s.ax = w * 0.72;
    s.ay = s.hz + (h - s.hz) * 0.25;
  }
  genCity(s);
  paintSky(s, env);
  paintNight(s, env);
  renderCity(s, env);
  s.cityAt = s.t;
}

function measure(p: GojoPose): GojoOut {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const c = cv.getContext('2d');
  const out = makeOut();
  if (c) drawGojo(c, 0, 0, 1, p, out);
  cv.width = cv.height = 0;
  return out;
}

/* ---------- audio ---------- */

function hum(s: State, env: SceneEnv, key: 'blue' | 'red' | 'purple', on: boolean, k: number) {
  const bus = env.audio();
  if (!on || !bus) {
    if (s.hums[key]) {
      stopHum(s.hums[key]);
      s.hums[key] = null;
    }
    return;
  }
  if (!s.hums[key]) {
    s.hums[key] =
      key === 'blue'
        ? startHum(bus, { type: 'sine', freq: 55, cutoff: 420, noiseAmt: 0.5 })
        : key === 'red'
          ? startHum(bus, { type: 'sawtooth', freq: 92, cutoff: 900, noiseAmt: 0.25 })
          : startHum(bus, { type: 'triangle', freq: 70, cutoff: 1400, noiseAmt: 0.35 });
  }
  const hm = s.hums[key];
  if (!hm) return;
  if (key === 'blue') setHum(hm, 55 + k * 50, 0.05 + k * 0.12, 260 + k * 500);
  else if (key === 'red') setHum(hm, 92 + k * 90, 0.04 + k * 0.09, 600 + k * 1600);
  else setHum(hm, 70 + k * 60, 0.08 + k * 0.1, 900 + k * 2200);
}

function stopAll(s: State) {
  stopHum(s.hums.blue);
  stopHum(s.hums.red);
  stopHum(s.hums.purple);
  s.hums.blue = s.hums.red = s.hums.purple = null;
}

function boom(bus: AudioBus) {
  tone(bus, 48, { type: 'sine', attack: 0.01, decay: 2.6, gain: 0.7, glideTo: 24 });
  tone(bus, 96, { type: 'triangle', attack: 0.005, decay: 0.9, gain: 0.3, glideTo: 40 });
  noise(bus, { duration: 2.8, gain: 0.55, freq: 180, q: 0.6, type: 'lowpass' });
  noise(bus, { duration: 1.2, gain: 0.25, freq: 900, q: 0.7 });
}

/* ---------- effects ---------- */

function drawBlue(c: CanvasRenderingContext2D, s: State, x: number, y: number, r: number, k: number, t: number) {
  if (k <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, k * 1.2);
  c.drawImage(s.sprites.blue, x - r * 4, y - r * 4, r * 8, r * 8);
  // spiral arms winding inward
  c.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a0 = t * 4 + (i * TAU) / 5;
    c.strokeStyle = i % 2 ? 'rgba(140,220,255,0.75)' : 'rgba(60,120,255,0.8)';
    c.lineWidth = r * 0.12;
    c.beginPath();
    for (let j = 0; j <= 16; j++) {
      const q = j / 16;
      const rr = r * (2.6 - q * 1.9);
      const a = a0 + q * 2.6;
      if (j === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9);
      else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9);
    }
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#a6e6ff');
  g.addColorStop(0.75, '#2f7cff');
  g.addColorStop(1, 'rgba(20,50,200,0.9)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r * (0.96 + Math.sin(t * 20) * 0.03), 0, TAU);
  c.fill();
  c.restore();
}

function drawRed(c: CanvasRenderingContext2D, s: State, x: number, y: number, r: number, k: number, t: number) {
  if (k <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, k * 1.2);
  c.drawImage(s.sprites.red, x - r * 4, y - r * 4, r * 8, r * 8);
  const rnd = mulberry(Math.floor(t * 18));
  c.strokeStyle = 'rgba(255,140,120,0.9)';
  c.lineWidth = r * 0.08;
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU;
    const r0 = r * 1.1;
    const r1 = r * (1.8 + rnd() * 1.6);
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    c.lineTo(x + Math.cos(a + 0.12) * (r0 + r1) / 2, y + Math.sin(a + 0.12) * (r0 + r1) / 2);
    c.lineTo(x + Math.cos(a - 0.05) * r1, y + Math.sin(a - 0.05) * r1);
  }
  c.stroke();
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#ffb3a6');
  g.addColorStop(0.75, '#ff2a3a');
  g.addColorStop(1, 'rgba(190,0,30,0.9)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r * (0.96 + Math.sin(t * 23) * 0.03), 0, TAU);
  c.fill();
  c.restore();
}

function drawPurple(c: CanvasRenderingContext2D, s: State, x: number, y: number, r: number, k: number, t: number) {
  if (k <= 0.01 || r < 0.3) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, k);
  c.drawImage(s.sprites.purple, x - r * 3.6, y - r * 3.6, r * 7.2, r * 7.2);
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff6ff');
  g.addColorStop(0.3, '#e7b6ff');
  g.addColorStop(0.7, '#9b38ff');
  g.addColorStop(0.92, '#4a0ea8');
  g.addColorStop(1, 'rgba(255,170,255,0.9)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  // blue and red still braided through it
  c.globalCompositeOperation = 'lighter';
  c.lineWidth = Math.max(0.6, r * 0.07);
  for (let i = 0; i < 2; i++) {
    c.strokeStyle = i ? 'rgba(255,90,110,0.7)' : 'rgba(90,160,255,0.7)';
    c.beginPath();
    for (let j = 0; j <= 24; j++) {
      const q = j / 24;
      const a = t * 6 * (i ? -1 : 1) + q * TAU;
      const rr = r * (0.55 + 0.3 * Math.sin(q * TAU * 2 + t * 3 + i * 2));
      if (j === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.stroke();
  }
  c.restore();
}

function drawParticles(c: CanvasRenderingContext2D, s: State) {
  for (const p of s.pool.items) {
    if (p.life <= 0) continue;
    const k = p.life / p.max;
    if (p.kind === DEBRIS_IN || p.kind === CHUNK || p.kind === BIG) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = Math.min(1, k * 3);
      c.fillStyle = p.kind === DEBRIS_IN ? '#3a3f5e' : p.kind === BIG ? '#0a0912' : '#241c38';
      const sz = p.size;
      c.beginPath();
      c.moveTo(-sz, -sz * 0.4);
      c.lineTo(-sz * 0.3, -sz);
      c.lineTo(sz * 0.7, -sz * 0.8);
      c.lineTo(sz, sz * 0.1);
      c.lineTo(sz * 0.5, sz * 0.9);
      c.lineTo(-sz * 0.6, sz * 0.7);
      c.closePath();
      c.fill();
      if (p.kind !== BIG) {
        c.strokeStyle = p.kind === DEBRIS_IN ? 'rgba(140,200,255,0.6)' : 'rgba(255,140,230,0.35)';
        c.lineWidth = Math.max(0.5, sz * 0.12);
        c.stroke();
      } else {
        c.strokeStyle = 'rgba(190,140,255,0.35)';
        c.lineWidth = Math.max(0.8, sz * 0.08);
        c.stroke();
      }
      c.restore();
    } else if (p.kind === SPARK || p.kind === EMBER) {
      c.globalAlpha = k;
      c.strokeStyle = p.kind === SPARK ? '#ff9a8a' : '#ffb0f0';
      c.lineWidth = p.size;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      c.stroke();
    } else if (p.kind === DUST) {
      c.globalAlpha = k * 0.35;
      c.fillStyle = '#6a5a8a';
      c.beginPath();
      c.arc(p.x, p.y, p.size * (2 - k), 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

/* ---------- the scene ---------- */

function startFire(s: State, env: SceneEnv) {
  s.phase = 'fire';
  s.pt = 0;
  s.u = 0;
  s.boomed = false;
  s.shock = -1;
  s.carved = true;
  // the start of the path sits under his pointing hand, a little in front of the city
  const [hx, hy] = camToScreen(s.wide, s.wideX, s.wideY, s.orbs.px, s.orbs.py);
  s.fireHandX = hx;
  s.fireHandY = hy;
  const z0 = ground(s, s.w / 2, s.h)[1] + 2;
  s.z0 = z0;
  const [x0, y0] = atDepth(s, hx, hy, z0);
  s.x0 = x0;
  s.y0 = clamp(y0, R, 60);
  aimWorld(s);
  let dx = s.tx - s.x0;
  let dz = s.tz - s.z0;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  if (dz < 0.25) {
    dz = 0.25;
    dx = Math.sign(dx || 1) * Math.sqrt(1 - dz * dz);
  }
  s.dx = dx;
  s.dz = dz;
  s.len = Math.min((ZMAX - s.z0) / dz, 400);
  s.flash = 1;
  s.shake = 0;
  stopAll(s);
  const bus = env.audio();
  if (bus) {
    // a sharp intake, then nothing until the boom
    noise(bus, { duration: 0.18, gain: 0.35, freq: 4200, q: 0.5, type: 'highpass' });
    tone(bus, 1400, { type: 'sine', attack: 0.002, decay: 0.25, gain: 0.08, glideTo: 300 });
  }
}

function aimWorld(s: State) {
  const [x, z] = ground(s, s.ax, Math.max(s.ay, s.hz + 4));
  s.tz = z;
  s.tx = x;
}

function resetCity(s: State) {
  for (const b of s.bld) b.gone = -1;
  s.carved = false;
  s.u = 0;
}

function setStage(s: State, env: SceneEnv, stage: number) {
  // reduced motion: tap steps through three still frames
  s.rmStage = stage % 3;
  stopAll(s);
  if (s.rmStage === 0) {
    resetCity(s);
    s.phase = 'idle';
    s.blue = s.red = 0;
  } else if (s.rmStage === 1) {
    s.phase = 'merge';
    s.pt = MERGE_LEN - 0.9;
    s.blue = s.red = 1;
  } else {
    startFire(s, env);
    s.u = s.len;
    s.pt = 3.2;
    s.boomed = true;
    s.flash = 0;
    for (const b of s.bld) {
      const [across, along] = pathDist(s, b.x, b.z);
      if (along > -2 && across < R * 1.25 + b.w * 0.4) b.gone = 0;
    }
    const bus = env.audio();
    if (bus) boom(bus);
  }
  renderCity(s, env);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 1,
    init: (env) => {
      const s: State = {
        phase: env.interactive && !env.reducedMotion ? 'intro' : 'idle',
        pt: 0,
        t: 0,
        blue: 0,
        red: 0,
        charging: 0,
        lastCharging: 0,
        press: { pointer: false, key: false, side: 1, armed: false, touched: false },
        idleT: 0,
        ax: 0,
        ay: 0,
        aimSet: false,
        tx: 0,
        tz: 60,
        x0: 0,
        y0: 0,
        z0: 20,
        dx: 0,
        dz: 1,
        len: 0,
        u: 0,
        fireHandX: 0,
        fireHandY: 0,
        carved: false,
        regen: 0,
        shock: -1,
        boomed: false,
        flash: 0,
        shake: 0,
        rmStage: 0,
        pool: makePool(520),
        hums: { blue: null, red: null, purple: null },
        w: 0,
        h: 0,
        portrait: false,
        hz: 0,
        cy: 0,
        f: 1,
        camH: 24,
        wide: cam(0, 0, 1),
        wideX: 0,
        wideY: 0,
        bld: [],
        city: null,
        cityAt: 0,
        cityU: 0,
        sky: null,
        night: null,
        sprites: {
          blue: glowSprite(128, [
            [0, 'rgba(160,230,255,0.9)'],
            [0.25, 'rgba(60,140,255,0.45)'],
            [1, 'rgba(20,40,200,0)'],
          ]),
          red: glowSprite(128, [
            [0, 'rgba(255,190,170,0.9)'],
            [0.25, 'rgba(255,40,60,0.45)'],
            [1, 'rgba(200,0,40,0)'],
          ]),
          purple: glowSprite(128, [
            [0, 'rgba(255,220,255,0.95)'],
            [0.3, 'rgba(170,70,255,0.5)'],
            [1, 'rgba(90,0,200,0)'],
          ]),
          white: glowSprite(64, [
            [0, 'rgba(255,255,255,1)'],
            [1, 'rgba(255,255,255,0)'],
          ]),
        },
        out: makeOut(),
        anchors: { charge: makeOut(), merge: makeOut(), intro: makeOut() },
        orbs: { bx: 0, by: 0, rx: 0, ry: 0, px: 0, py: 0, pr: 0 },
      };
      s.anchors.charge = measure(chargePose(0, 1, 1));
      s.anchors.merge = measure(mergePose(1, 0));
      s.anchors.intro = measure(basePose());
      // still frames show the key visual: both techniques gathered
      if (!env.interactive || env.reducedMotion) {
        s.blue = 1;
        s.red = 1;
        s.phase = 'charge';
        s.charging = 0;
        s.pt = 9;
      }
      return s;
    },
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      s.t = t;
      // reduced motion holds each still; taps step between them
      if (env.reducedMotion) return;
      s.pt += dt;
      stepPool(s.pool, dt);
      s.flash = Math.max(0, s.flash - dt * 2.2);
      s.shake = Math.max(0, s.shake - dt * 1.6);
      const p = s.press;
      const held = p.pointer || p.key;

      if (s.phase === 'intro' && (s.pt > 2.6 || p.touched)) {
        s.phase = 'idle';
        s.pt = 0;
      }
      if (s.phase === 'idle' || s.phase === 'charge') {
        let ch: 0 | 1 | 2 = 0;
        if (p.pointer) ch = p.side;
        else if (p.key) ch = s.blue < 1 ? 1 : 2;
        if (ch === 1 && s.blue >= 1) ch = s.red < 1 ? 2 : 0;
        if (ch === 2 && s.red >= 1) ch = s.blue < 1 ? 1 : 0;
        if (ch) {
          if (s.carved) {
            resetCity(s);
            renderCity(s, env);
          }
          if (ch !== s.lastCharging || s.phase !== 'charge') s.pt = 0;
          s.phase = 'charge';
          s.idleT = 0;
          if (ch === 1) s.blue = Math.min(1, s.blue + dt * CHARGE_RATE);
          else s.red = Math.min(1, s.red + dt * CHARGE_RATE);
          s.lastCharging = ch;
        } else if (s.phase === 'charge' && s.pt > 0.35 && env.interactive) {
          s.phase = 'idle';
          s.pt = 0;
        }
        s.charging = ch;
        if (env.interactive) {
          hum(s, env, 'blue', s.blue > 0.02, s.blue * (ch === 1 ? 1 : 0.5));
          hum(s, env, 'red', s.red > 0.02, s.red * (ch === 2 ? 1 : 0.5));
        }
        if (s.blue >= 1 && s.red >= 1 && env.interactive) {
          s.phase = 'merge';
          s.pt = 0;
          p.armed = held;
          const bus = env.audio();
          if (bus) {
            tone(bus, 220, { type: 'triangle', attack: 0.3, decay: 1.6, gain: 0.1, glideTo: 440 });
            tone(bus, 330, { type: 'sine', attack: 0.4, decay: 1.8, gain: 0.08, glideTo: 660 });
          }
        }
        // idle decay so a half charge does not hang around forever
        if (!ch && s.phase === 'idle') {
          s.idleT += dt;
          if (s.idleT > 6) {
            s.blue = Math.max(0, s.blue - dt * 0.3);
            s.red = Math.max(0, s.red - dt * 0.3);
          }
        }
      }
      if (s.phase === 'merge') {
        const k = s.pt / MERGE_LEN;
        hum(s, env, 'blue', k < 0.62, 1);
        hum(s, env, 'red', k < 0.62, 1);
        hum(s, env, 'purple', k > 0.55, clamp((k - 0.55) * 3, 0, 1));
        const bus = env.audio();
        if (bus && s.pt - dt < 2.6 && s.pt >= 2.6) {
          noise(bus, { duration: 0.5, gain: 0.4, freq: 2400, q: 0.4, type: 'highpass' });
          tone(bus, 880, { type: 'sine', attack: 0.003, decay: 1.2, gain: 0.1, glideTo: 220 });
        }
        if (s.pt >= MERGE_LEN) {
          s.phase = 'ready';
          s.pt = 0;
        }
      }
      if (s.phase === 'ready') {
        hum(s, env, 'purple', true, 0.8 + Math.sin(t * 6) * 0.1);
        if (s.pt > 3.2) startFire(s, env);
      }
      if (s.phase === 'fire') {
        const T = s.pt;
        const prevU = s.u;
        s.u = s.len * Math.pow(clamp(T / FLIGHT, 0, 1), 1.35);
        // erase what the sphere touches
        let erased = false;
        for (const b of s.bld) {
          if (b.gone >= 0) continue;
          const [across, along] = pathDist(s, b.x, b.z);
          if (along > s.u || along < -2) continue;
          if (across < R * 1.25 + b.w * 0.4) {
            b.gone = t;
            erased = true;
            if (along > prevU - 2) {
              const [bx, by] = proj(s, b.x, b.h * 0.6, b.z);
              const sc = s.f / b.z;
              for (let i = 0; i < 3; i++)
                emit(s.pool, bx + rand(-1, 1) * b.w * sc * 0.5, by, rand(-1, 1) * sc * 6, -rand(4, 12) * sc, rand(1, 2.2), Math.max(1, sc * rand(0.3, 0.7)), CHUNK, 0.4, sc * 9);
            }
          }
        }
        if (erased || s.u - s.cityU > 4) renderCity(s, env);
        // embers along the fresh trench
        if (T < 3.5 && Math.random() < 0.8) {
          const u = Math.random() * s.u;
          const [ex, ey] = proj(s, s.x0 + s.dx * u + rand(-R, R), 0, s.z0 + s.dz * u);
          const sc = s.f / (s.z0 + s.dz * u);
          emit(s.pool, ex, ey, rand(-1, 1) * sc, -rand(1, 5) * sc, rand(0.6, 1.6), Math.max(0.6, sc * 0.08), EMBER, 0.8, sc * 2);
        }
        // the boom arrives late
        if (!s.boomed && T > 0.55) {
          s.boomed = true;
          s.shock = 0;
          s.shake = 1;
          const bus = env.audio();
          if (bus) boom(bus);
          for (let i = 0; i < 14; i++) emit(s.pool, rand(0, s.w), -rand(20, 200), rand(-40, 40), rand(40, 140), rand(2.5, 4), rand(10, 26) * (s.h / 600), BIG, 0, 260);
          for (let i = 0; i < 40; i++) {
            const u = Math.random() * s.u * 0.6;
            const [ex, ey] = proj(s, s.x0 + s.dx * u + rand(-R, R) * 1.5, 0, s.z0 + s.dz * u);
            const sc = s.f / (s.z0 + s.dz * u);
            emit(s.pool, ex, ey, rand(-3, 3) * sc, -rand(0.5, 2) * sc, rand(1.5, 3), sc * rand(1, 2.5), DUST, 0.6, -sc * 0.2);
          }
        }
        if (s.shock >= 0) s.shock += dt;
        if (T > 1.2 && T < 1.3) {
          const bus = env.audio();
          if (bus) for (let i = 0; i < 6; i++) tone(bus, rand(500, 1600), { type: 'square', attack: 0.001, decay: 0.05, gain: 0.03, delay: i * rand(0.08, 0.25) });
        }
        if (T > FIRE_LEN) {
          s.phase = 'idle';
          s.pt = 0;
          s.blue = s.red = 0;
          s.idleT = 0;
        }
      }
      // particles that belong to the close ups
      if (s.phase === 'charge' && s.charging === 1) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU;
          const r = Math.hypot(s.w, s.h) * 0.6;
          emit(s.pool, s.orbs.bx + Math.cos(a) * r, s.orbs.by + Math.sin(a) * r, 0, 0, 1.4, rand(2, 7), DEBRIS_IN);
        }
      }
      if (s.phase === 'charge' && s.charging === 2) {
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * TAU;
          const v = rand(300, 900);
          emit(s.pool, s.orbs.rx, s.orbs.ry, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.8), rand(1, 2.5), SPARK, 1.5);
        }
      }
      // blue drags its debris in
      for (const q of s.pool.items) {
        if (q.life <= 0 || q.kind !== DEBRIS_IN) continue;
        const dx = s.orbs.bx - q.x;
        const dy = s.orbs.by - q.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = 2400 / Math.max(0.3, d / 100);
        q.vx = q.vx * 0.94 + (dx / d) * pull * dt + (-dy / d) * pull * dt * 0.6;
        q.vy = q.vy * 0.94 + (dy / d) * pull * dt + (dx / d) * pull * dt * 0.6;
        if (d < 12) q.life = 0;
      }
    },
    draw: (s, env, t) => {
      const c = env.ctx;
      const { w, h } = env;
      const m = Math.min(w, h);
      const phase = s.phase;
      const pt = s.pt;
      let bars = 0;
      let sub = '';
      let subA = 0;
      let impact = 0;

      // pick the shot
      type Shot = { kind: 'front' | 'wide'; cam: Cam; pose: GojoPose; speed: number; fx: number; fy: number; tint: string };
      const ch = s.anchors.charge;
      const mg = s.anchors.merge;
      const blueAt = (o: GojoOut): [number, number] => [o.rpx + o.rnx * 40, o.rpy + o.rny * 40 - 10];
      const redAt = (o: GojoOut): [number, number] => {
        const dx = o.ltx - o.lpx;
        const dy = o.lty - o.lpy;
        const d = Math.hypot(dx, dy) || 1;
        return [o.ltx + (dx / d) * 22, o.lty + (dy / d) * 22];
      };
      const msZ = s.portrait ? Math.min(h / 640, w / 560) : Math.min(h / 600, w / 840);
      let shot: Shot;
      if (phase === 'intro') {
        const k = easeInOutCubic(clamp(pt / 2.6, 0, 1));
        // hands in his pockets, chin down, peering over the shades
        const p = basePose();
        p.head.yaw = -0.12;
        p.headTilt = 0.08;
        p.lean = 0.03;
        p.head.slide = 0.55 * clamp((pt - 0.8) / 1.2, 0, 1);
        p.head.glow = p.head.slide;
        p.head.gazeY = -0.6;
        shot = { kind: 'front', cam: mixCam(cam(0, -560, msZ * 0.85, 0.05), cam(0, -740, msZ * 2.4, -0.03), k), pose: p, speed: 0, fx: w / 2, fy: h / 2, tint: '' };
      } else if (phase === 'charge') {
        const p = chargePose(t, s.blue, s.red);
        if (s.charging === 0) {
          shot = { kind: 'front', cam: cam(0, s.portrait ? -640 : -670, msZ), pose: p, speed: 0, fx: w / 2, fy: h / 2, tint: '' };
        } else {
          const [ox, oy] = s.charging === 1 ? blueAt(ch) : redAt(ch);
          const push = easeOutCubic(clamp(pt / 1.5, 0, 1));
          const k = cam(lerp(ox, ch.cx, 0.42), lerp(oy, ch.cy - 50, 0.42), (m / 420) * (1 + push * 0.2), s.charging === 1 ? -0.14 : 0.13);
          shot = { kind: 'front', cam: k, pose: p, speed: 0.5 + (s.charging === 1 ? s.blue : s.red) * 0.5, fx: w / 2, fy: h / 2, tint: s.charging === 1 ? '#2a6bff' : '#ff2840' };
        }
      } else if (phase === 'merge') {
        bars = 1;
        if (pt < 1.3) {
          // face: the shades slide down and the eyes wake up
          const p = chargePose(t, 1, 1);
          const k = clamp(pt / 1.1, 0, 1);
          p.head.slide = easeInOutCubic(k);
          p.head.glow = k;
          p.head.gazeY = -0.3;
          shot = { kind: 'front', cam: mixCam(cam(ch.cx, ch.cy - 46, Math.min(h / 120, w / 150), 0.05), cam(ch.cx, ch.cy - 46, Math.min(h / 105, w / 130), 0.03), pt / 1.3), pose: p, speed: 0.3, fx: w / 2, fy: h / 2, tint: '' };
          sub = 'Lapse, Blue. Everything falls in.';
          subA = clamp(pt * 3, 0, 1) * clamp((1.3 - pt) * 4, 0, 1);
        } else if (pt < 2.6) {
          const k = easeInOutCubic(clamp((pt - 1.3) / 1.2, 0, 1));
          const p = mergePose(k, t);
          p.head.slide = 1;
          p.head.glow = 1;
          shot = { kind: 'front', cam: mixCam(cam(0, -640, msZ * 0.85, -0.08), cam((mg.lpx + mg.rpx) / 2, (mg.lpy + mg.rpy) / 2 - 20, msZ * 1.6, -0.12), k), pose: p, speed: 0.6, fx: w / 2, fy: h / 2, tint: '#8a3cff' };
          sub = 'Reversal, Red. Everything is thrown out.';
          subA = clamp((pt - 1.3) * 3, 0, 1) * clamp((2.6 - pt) * 4, 0, 1);
        } else {
          // the two collide: impact frames, then the name
          const p = mergePose(1, t);
          p.head.slide = 1;
          p.head.glow = 1;
          const k = clamp((pt - 2.6) / 1.6, 0, 1);
          shot = { kind: 'front', cam: cam((mg.lpx + mg.rpx) / 2, (mg.lpy + mg.rpy) / 2 + 8, msZ * lerp(2.6, 2.1, easeOutCubic(k)), 0.06), pose: p, speed: 1, fx: w / 2, fy: h / 2, tint: '#b04cff' };
          impact = pt < 2.75 ? 1 : pt < 2.82 ? 0 : pt < 2.92 ? 1 : 0;
          sub = 'Fold them together.';
          subA = clamp((pt - 2.6) * 4, 0, 1) * clamp((3.3 - pt) * 4, 0, 1);
        }
      } else {
        // wide: idle, ready, fire
        const point = phase === 'ready' ? 1 : phase === 'fire' ? 1 : 0;
        const pose = aimPose(s, t, point);
        if (phase === 'fire') pose.head.glow = clamp(1 - pt / 3, 0, 1);
        if (phase === 'ready' || phase === 'fire') {
          pose.head.slide = phase === 'fire' ? clamp(1 - (pt - 2) / 1.5, 0, 1) : 1;
          pose.head.glow = Math.max(pose.head.glow, phase === 'ready' ? 1 : 0);
          pose.light = { lx: 0.9, ly: -0.2, rim: '#d08cff', rimK: 0.8 };
        }
        shot = { kind: 'wide', cam: s.wide, pose, speed: 0, fx: w / 2, fy: h / 2, tint: '' };
        if (phase === 'ready') bars = 1;
        if (phase === 'fire') bars = clamp(1 - (pt - 3) / 1, 0, 1);
      }

      // light on Gojo follows the orbs in the close ups
      if (shot.kind === 'front') {
        if (phase === 'merge') shot.pose.light = { lx: 0, ly: 1, rim: '#d59bff', rimK: 0.9 };
        else if (s.charging === 1) shot.pose.light = { lx: -0.95, ly: -0.3, rim: '#6fb6ff', rimK: 0.9 };
        else if (s.charging === 2) shot.pose.light = { lx: 0.95, ly: -0.3, rim: '#ff6a6a', rimK: 0.9 };
        else shot.pose.light = { lx: -0.6, ly: -0.8, rim: s.blue > s.red ? '#7fb8ff' : '#ff8a8a', rimK: (s.blue + s.red) * 0.35 };
      }

      const shx = shakeX(s.shake * m * 0.02, t);
      const shy = shakeY(s.shake * m * 0.02, t);
      c.save();
      c.translate(shx, shy);
      if (shot.kind === 'wide') {
        if (s.sky) c.drawImage(s.sky, 0, 0, w, h);
        if (s.city) c.drawImage(s.city, 0, 0, w, h);
        // aim marker on the ground
        if ((phase === 'idle' || phase === 'ready') && env.interactive && (s.aimSet || phase === 'ready')) {
          const y = Math.max(s.ay, s.hz + 4);
          const pulse = 0.5 + Math.sin(t * 5) * 0.2;
          c.strokeStyle = phase === 'ready' ? `rgba(220,150,255,${0.5 + pulse * 0.4})` : `rgba(200,200,255,${0.25 + pulse * 0.2})`;
          c.lineWidth = 1.5;
          const rr = m * 0.03;
          c.beginPath();
          c.ellipse(s.ax, y, rr * 1.6, rr * 0.55, 0, 0, TAU);
          c.stroke();
          c.beginPath();
          c.moveTo(s.ax - rr * 2.4, y);
          c.lineTo(s.ax - rr * 1.9, y);
          c.moveTo(s.ax + rr * 1.9, y);
          c.lineTo(s.ax + rr * 2.4, y);
          c.stroke();
        }
        // trench glow while it is fresh
        if (s.carved && s.dz > 0) {
          const k = phase === 'fire' ? clamp(1 - (pt - 1) / 4, 0.15, 1) : 0.15;
          c.save();
          c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 18; i++) {
            const u = (i / 18) * s.u;
            const z = s.z0 + s.dz * u;
            const [gx, gy] = proj(s, s.x0 + s.dx * u, 0.2, z);
            const r = (R * 2.4 * s.f) / z;
            c.globalAlpha = k * 0.4;
            c.drawImage(s.sprites.purple, gx - r, gy - r * 0.5, r * 2, r);
          }
          c.restore();
        }
        // shockwave: a flattened ring running out along the ground
        if (s.shock >= 0 && s.shock < 2) {
          const k = s.shock / 2;
          const mid = s.u * 0.35;
          const [sx2, sy2] = proj(s, s.x0 + s.dx * mid, 0, s.z0 + s.dz * mid);
          const rr = easeOutCubic(k) * Math.max(w, h) * 1.2;
          c.strokeStyle = `rgba(255,230,255,${0.7 * (1 - k)})`;
          c.lineWidth = m * 0.02 * (1 - k) + 1;
          c.beginPath();
          c.ellipse(sx2, sy2, rr, rr * 0.22, 0, 0, TAU);
          c.stroke();
          c.fillStyle = `rgba(200,150,255,${0.12 * (1 - k)})`;
          c.fill();
        }
      } else {
        if (s.night) c.drawImage(s.night, -w * 0.05 + (shot.cam.x / 600) * w * 0.05, 0, w * 1.1, h);
        if (shot.tint) {
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.16;
          c.fillStyle = shot.tint;
          c.fillRect(0, 0, w, h);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
        }
        speedLines(c, w, h, shot.fx, shot.fy, m * 0.42, 70, 'rgba(230,235,255,0.9)', shot.speed * 0.35, t);
      }

      // Gojo, with the orbs at his hands
      const sx = shot.kind === 'wide' ? s.wideX : w / 2;
      const sy = shot.kind === 'wide' ? s.wideY : h / 2;
      c.save();
      applyCam(c, shot.cam, sx, sy);
      const out = s.out;
      shot.pose.lw = inkPx(shot.cam.z) / shot.cam.z;
      shot.pose.head.t = t;
      drawGojo(c, 0, 0, 1, shot.pose, out);
      const [bxr, byr] = blueAt(out);
      const [rxr, ryr] = redAt(out);
      const showOrbs = phase !== 'fire';
      let mergeK = 0;
      if (phase === 'merge') mergeK = clamp((pt - 2.4) / 0.4, 0, 1);
      if (phase === 'ready') mergeK = 1;
      const orbR = 30 * (0.35 + 0.65 * Math.max(s.blue, 0));
      const redR = 26 * (0.35 + 0.65 * Math.max(s.red, 0));
      // purple sits where the two meet, or at his pointing fingers out in the city
      const px = phase === 'ready' ? rxr : (bxr + rxr) / 2;
      const py = phase === 'ready' ? ryr : (byr + ryr) / 2;
      s.orbs.px = px;
      s.orbs.py = py;
      if (showOrbs) {
        if (mergeK < 1) {
          const bx = lerp(bxr, px, mergeK);
          const by = lerp(byr, py, mergeK);
          const rx = lerp(rxr, px, mergeK);
          const ry = lerp(ryr, py, mergeK);
          drawBlue(c, s, bx, by, orbR, s.blue * (1 - mergeK * 0.5), t);
          drawRed(c, s, rx, ry, redR, s.red * (1 - mergeK * 0.5), t);
          const [b1, b2] = camToScreen(shot.cam, sx, sy, bx, by);
          const [r1, r2] = camToScreen(shot.cam, sx, sy, rx, ry);
          s.orbs.bx = b1;
          s.orbs.by = b2;
          s.orbs.rx = r1;
          s.orbs.ry = r2;
        }
        if (mergeK > 0) drawPurple(c, s, px, py, 44 * (0.4 + 0.6 * mergeK) * (phase === 'ready' ? 1.1 + Math.sin(t * 8) * 0.04 : 1), mergeK, t);
      }
      c.restore();

      // the sphere in flight
      if (phase === 'fire' && s.u < s.len - 0.5) {
        const u = s.u;
        const z = s.z0 + s.dz * u;
        const yk = clamp(u / 25, 0, 1);
        const [gx, gy] = proj(s, s.x0 + s.dx * u, lerp(s.y0, R, easeOutCubic(yk)), z);
        const lk = clamp(u / 6, 0, 1);
        const qx = lerp(s.fireHandX, gx, lk);
        const qy = lerp(s.fireHandY, gy, lk);
        const r = Math.max(2, lerp(44 * s.wide.z * 1.1, (R * 1.9 * s.f) / z, lk));
        drawPurple(c, s, qx, qy, r, 1, t);
        // a wake of light behind it
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        c.globalAlpha = clamp(1.4 - pt / 1.4, 0, 1);
        c.strokeStyle = 'rgba(150,60,255,0.55)';
        c.lineWidth = r * 1.8;
        c.beginPath();
        c.moveTo(qx, qy);
        c.lineTo(s.fireHandX, s.fireHandY);
        c.stroke();
        c.strokeStyle = 'rgba(255,220,255,0.6)';
        c.lineWidth = r * 0.5;
        c.stroke();
        c.restore();
      }

      drawParticles(c, s);
      c.restore();

      // purple wash while it burns through the city
      if (phase === 'fire') {
        const k = clamp(1 - pt / 2.5, 0, 1);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = k * 0.12;
        c.fillStyle = '#6a20ff';
        c.fillRect(0, 0, w, h);
        c.restore();
        // the silent beat right after release: everything goes negative
        if (pt < 0.36) impact = pt < 0.12 || (pt > 0.2 && pt < 0.3) ? 1 : 0;
      }
      if (impact > 0) impactFrame(c, w, h, impact, phase === 'merge' ? '#ffd0ff' : null);
      if (s.flash > 0 && impact === 0) {
        c.globalAlpha = s.flash * 0.8;
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);
        c.globalAlpha = 1;
      }

      // vignette
      const vg = c.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,8,0.55)');
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);

      letterbox(c, w, h, bars);
      // the name, over a frame that is all sphere
      if (phase === 'merge' && pt > 3.0) {
        const k = clamp((pt - 3.0) * 3, 0, 1) * clamp((MERGE_LEN - pt) * 5, 0, 1);
        techTitle(c, w / 2, h * 0.7, clamp(m * 0.14, 24, 100), '虚式「茈」', 'Hollow Purple', k, '#c060ff', (1 - k) * 0.6);
      }
      if (phase === 'ready' && pt < 1.2) subtitle(c, w, h, 'Imaginary Technique.', clamp(pt * 4, 0, 1) * clamp((1.2 - pt) * 4, 0, 1), '#e6c8ff');
      subtitle(c, w, h, sub, subA, '#ffffff');
      if (phase === 'idle' && env.interactive && !s.press.touched) {
        c.save();
        c.globalAlpha = 0.5 + Math.sin(t * 3) * 0.2;
        c.font = `600 ${Math.round(clamp(m * 0.03, 10, 15))}px ui-sans-serif, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillStyle = '#e0d8ff';
        c.fillText('Hold left for Blue, right for Red', w / 2, h * 0.07);
        c.restore();
      }
      if (phase === 'ready' && env.interactive) {
        const k = clamp((pt - 1.3) * 2, 0, 1) * (0.6 + Math.sin(t * 4) * 0.2);
        if (k > 0.02) {
          c.save();
          c.globalAlpha = k;
          c.font = `600 ${Math.round(clamp(m * 0.03, 10, 15))}px ui-sans-serif, system-ui, sans-serif`;
          c.textAlign = 'center';
          c.fillStyle = '#e8d8ff';
          c.textBaseline = 'middle';
          c.fillText(s.press.armed ? 'Aim, then let go' : 'Aim, then tap to fire', w / 2, h - h * 0.05);
          c.restore();
        }
      }
    },
    onPointerDown: (s, env, x, y) => {
      s.press.touched = true;
      s.ax = x;
      s.ay = y;
      s.aimSet = true;
      if (env.reducedMotion) {
        setStage(s, env, s.rmStage + 1);
        return;
      }
      if (s.phase === 'ready') {
        s.press.armed = true;
        s.press.pointer = true;
        return;
      }
      s.press.pointer = true;
      s.press.side = x < env.w / 2 ? 1 : 2;
    },
    onPointerMove: (s, _env, x, y) => {
      s.ax = x;
      s.ay = y;
      s.aimSet = true;
    },
    onPointerUp: (s, env) => {
      s.press.pointer = false;
      if (s.phase === 'ready' && s.press.armed && !s.press.key) {
        s.press.armed = false;
        startFire(s, env);
      }
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat) return true;
      s.press.touched = true;
      if (env.reducedMotion) {
        if (down) setStage(s, env, s.rmStage + 1);
        return true;
      }
      s.press.key = down;
      if (s.phase === 'ready') {
        if (down) s.press.armed = true;
        else if (s.press.armed && !s.press.pointer) {
          s.press.armed = false;
          startFire(s, env);
        }
      }
      return true;
    },
    dispose: (s) => {
      stopAll(s);
      freeCanvas(s.city, s.sky, s.night);
    },
  });
