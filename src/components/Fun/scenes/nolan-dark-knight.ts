import type { Hum } from './heroes-kit';
import {
  freeCanvas,
  glow,
  glowSprite,
  layer,
  mulberry,
  setHum,
  startHum,
  stopHum,
} from './heroes-kit';
import {
  dampPose,
  drawGrain,
  grad,
  grainTile,
  keepAwake,
  limb,
  mixPose,
  poly,
  scallops,
  smooth,
  traceBat,
  traceCowlBack,
  traceCowlProfile,
} from './nolan-kit';
import type { AudioBus, SceneEnv } from './runtime';
import { clamp, createCanvasScene, damp, lerp, noise, rand, TAU, tone } from './runtime';
import type { MountScene } from './types';

/**
 * The Dark Knight: Batman on the edge of a Gotham tower at night, cape streaming in the wind
 * over a city of sodium streets and glass, the signal burning on the clouds. Stepping off the
 * ledge drops him into a glide down the canyon of the main avenue: the pointer (or W A S D)
 * steers him between the towers, diving to street level trades height for speed and pulling
 * up bleeds it off. A quick tap, Space or Enter switches to sonar vision, where the city turns
 * to a white mesh that pulses out from him with every ping. The signal is thrown from the roof
 * of a gothic tower twelve blocks down; as he reaches it he swoops up onto the gargoyle on its
 * corner, the cape settles round him under the beam, and the night starts over on the ledge. The city is a 3D grid of boxes generated per
 * block as he flies; front faces wear a baked window texture, the side walls are sliced into
 * strips of it, and everything fades into the amber haze. He is posed live in profile on the
 * ledge and from behind in the glide, with the cape blended between key shapes.
 */

type C = CanvasRenderingContext2D;
type Mode = 'perch' | 'leap' | 'glide' | 'swoop' | 'land';

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  tex: number;
  sx: number;
  shade: number;
  beacon: boolean;
  spire: number;
  /** the signal tower */
  mark?: boolean;
}

interface Car {
  x: number;
  z: number;
  v: number;
}

interface Mote {
  x: number;
  y: number;
  z: number;
}

interface State {
  mode: Mode;
  mt: number;
  // the glide, in world units: x across the avenue, y up from the street, z down it
  bx: number;
  by: number;
  bz: number;
  vx: number;
  vy: number;
  speed: number;
  bank: number;
  tuck: number;
  spread: number;
  aimX: number;
  aimY: number;
  keys: number;
  /** seconds left in which the last pointer move still steers */
  ptrFresh: number;
  // camera
  cx: number;
  cy: number;
  cz: number;
  hy: number;
  f: number;
  roll: number;
  // the city
  blocks: Map<number, Box[]>;
  boxes: Box[];
  cars: Car[];
  motes: Mote[];
  // the swoop up onto the gargoyle and the landing
  sw: number[];
  swDur: number;
  crouch: number;
  /** the signal: 0 dark, flickering up to 1 */
  sig: number;
  sigT: number;
  /** how far he has looked up toward it */
  look: number;
  // sonar
  sonar: number;
  sonarOn: boolean;
  ping: number;
  pingT: number;
  // perch pose and wipes
  P: number[];
  lean: number;
  fall: number;
  wipe: number;
  wipeTo: Mode | null;
  gust: number;
  touched: boolean;
  idle: number;
  autoT: number;
  autoSonar: number;
  downAt: number;
  downX: number;
  downY: number;
  hum: Hum | null;
  // layout and sprites
  u: number;
  sky: HTMLCanvasElement | null;
  tex: HTMLCanvasElement[];
  amber: HTMLCanvasElement;
  white: HTMLCanvasElement;
  red: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  haze: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const W0 = 900;
const H0 = 560;
const BLOCK = 190;
const AVE = 84;
const NEAR = 3;
const FAR = 2600;
const PERCH_Y = 330;
const MOTES = 70;
const CARS = 26;
const TEX_W = 256;
const TEX_H = 1024;
/** texture pixels per world unit */
const TPU = 2;

const FOG = [26, 30, 40];
/** the signal tower: a gothic block on the left kerb twelve blocks down, a gargoyle on its corner */
const GOAL_I = 12;
const TOWER = {
  x0: -AVE - 74,
  x1: -AVE - 2,
  z0: GOAL_I * BLOCK + 40,
  z1: GOAL_I * BLOCK + 130,
  y1: 252,
};
const GARG_X = TOWER.x1 + 8;
const GARG_Y = 226;
const GARG_Z = TOWER.z0 + 3;
const LAMP = [(TOWER.x0 + TOWER.x1) / 2, TOWER.y1 + 7, (TOWER.z0 + TOWER.z1) / 2];
const LAND_X = GARG_X;
const LAND_Y = GARG_Y + 9;
const LAND_Z = GARG_Z;
/** the shot once he is down: behind him and a little above, the beam climbing past him */
const SHOT_X = LAND_X + 12;
const SHOT_Y = LAND_Y + 13;
const SHOT_Z = LAND_Z - 62;
/** how far short of the tower the glide gives way to the swoop */
const SWOOP_AT = 380;
const SUIT = '#15171b';
const CAPE = '#0b0c0f';
const MOON = 'rgba(170,196,230,0.9)';
const CITY = 'rgba(232,140,70,0.7)';

/* ---------- the city ---------- */

function makeTextures() {
  const list: HTMLCanvasElement[] = [];
  const kinds = [
    // base, lit window colours, window w, h, spacing x, y, lit fraction, banded glass
    ['#1a1f28', ['#ffd9a0', '#ffc070', '#fff0d0'], 3, 4, 8, 10, 0.32, 0],
    ['#141a24', ['#cfe2ff', '#a9c8f0', '#ffffff'], 6, 3, 8, 8, 0.4, 1],
    ['#1d1a1a', ['#ffb760', '#ffd28a'], 3, 5, 7, 11, 0.22, 0],
    ['#121821', ['#9fc4ff', '#e6f0ff', '#ffd9a0'], 5, 2, 7, 6, 0.3, 1],
  ] as const;
  kinds.forEach((k, i) => {
    const cv = document.createElement('canvas');
    cv.width = TEX_W;
    cv.height = TEX_H;
    const c = cv.getContext('2d');
    if (!c) return list.push(cv);
    const [base, lit, ww, wh, sx, sy, frac, band] = k;
    c.fillStyle = base;
    c.fillRect(0, 0, TEX_W, TEX_H);
    const rnd = mulberry(100 + i);
    // vertical piers
    c.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 0; x < TEX_W; x += sx * 4) c.fillRect(x, 0, 2, TEX_H);
    for (let y = 2; y < TEX_H; y += sy) {
      // whole floors switch on and off together, as offices do at night
      const floorLit = rnd() < 0.35 ? frac * 2 : frac * 0.6;
      if (band && rnd() < 0.25) {
        c.fillStyle = lit[0];
        c.globalAlpha = 0.18 + rnd() * 0.2;
        c.fillRect(0, y, TEX_W, wh);
        c.globalAlpha = 1;
      }
      for (let x = 2; x < TEX_W; x += sx) {
        if (rnd() > floorLit) {
          c.fillStyle = 'rgba(70,90,120,0.18)';
          c.fillRect(x, y, ww, wh);
          continue;
        }
        c.fillStyle = lit[Math.floor(rnd() * lit.length)];
        c.globalAlpha = 0.5 + rnd() * 0.5;
        c.fillRect(x, y, ww, wh);
      }
      c.globalAlpha = 1;
    }
    list.push(cv);
  });
  return list;
}

function genBlock(i: number): Box[] {
  const out: Box[] = [];
  const zs = i * BLOCK + 22;
  const ze = i * BLOCK + BLOCK - 18;
  for (const side of [-1, 1]) {
    const rnd = mulberry(i * 97 + (side > 0 ? 13 : 7));
    const goal = side < 0 && i === GOAL_I;
    // keep the kerb low in front of the signal tower so the gargoyle can be seen coming
    const cap = side < 0 && i === GOAL_I - 1 ? 130 : goal ? 210 : Infinity;
    // a park or plaza now and then opens the canyon up
    if (i > 2 && rnd() < 0.08 && !goal) continue;
    let x = AVE;
    if (goal) {
      const b: Box = {
        x0: TOWER.x0,
        x1: TOWER.x1,
        y0: 0,
        y1: TOWER.y1,
        z0: TOWER.z0,
        z1: TOWER.z1,
        tex: 1,
        sx: 40,
        shade: 0.9,
        beacon: false,
        spire: 0,
        mark: true,
      };
      out.push(b);
      x = AVE + 90;
    }
    for (let row = goal ? 1 : 0; row < 4; row++) {
      const bw = 44 + rnd() * 54;
      let z = zs;
      while (z < ze - 20) {
        const len = Math.min(ze - z, 40 + rnd() * 110);
        const tall =
          row === 0
            ? rnd() < 0.14
              ? 320 + rnd() * 120
              : 70 + Math.pow(rnd(), 1.6) * 230
            : 40 + Math.pow(rnd(), 1.8) * (210 - row * 40);
        const tallC = Math.min(cap, tall);
        const x0 = side > 0 ? x : -x - bw;
        const x1 = side > 0 ? x + bw : -x;
        const b: Box = {
          x0,
          x1,
          y0: 0,
          y1: tallC,
          z0: z,
          z1: z + len,
          tex: Math.floor(rnd() * 4),
          sx: rnd() * (TEX_W - 200),
          shade: 0.8 + rnd() * 0.4,
          beacon: tallC > 220,
          spire: tallC > 340 && rnd() < 0.6 ? 30 + rnd() * 40 : 0,
        };
        out.push(b);
        // stepped crowns on the taller blocks
        if (tallC > 160 && tallC < cap && rnd() < 0.6) {
          const ix = (x1 - x0) * (0.12 + rnd() * 0.12);
          const iz = len * (0.12 + rnd() * 0.12);
          out.push({
            ...b,
            x0: x0 + ix,
            x1: x1 - ix,
            z0: b.z0 + iz,
            z1: b.z1 - iz,
            y0: tallC,
            y1: tallC + 20 + rnd() * 50,
            sx: rnd() * (TEX_W - 200),
            spire: b.spire,
          });
          b.spire = 0;
          b.beacon = false;
        }
        z += len + 6 + rnd() * 6;
      }
      x += bw + 16;
    }
  }
  return out;
}

function syncCity(s: State) {
  const first = Math.floor((s.cz - 40) / BLOCK);
  const last = Math.floor((s.cz + FAR) / BLOCK);
  for (const k of s.blocks.keys()) if (k < first || k > last) s.blocks.delete(k);
  for (let i = first; i <= last; i++) if (!s.blocks.has(i)) s.blocks.set(i, genBlock(i));
  s.boxes.length = 0;
  for (const list of s.blocks.values())
    for (const b of list) if (b.z1 > s.cz + NEAR) s.boxes.push(b);
  // painter's order: far blocks first, outer rows before the canyon walls, bases before crowns
  s.boxes.sort((a, b) => {
    const da = Math.floor(a.z0 / BLOCK);
    const db = Math.floor(b.z0 / BLOCK);
    if (da !== db) return db - da;
    const ax = Math.min(Math.abs(a.x0 - s.cx), Math.abs(a.x1 - s.cx));
    const bx = Math.min(Math.abs(b.x0 - s.cx), Math.abs(b.x1 - s.cx));
    if (Math.abs(ax - bx) > 1) return bx - ax;
    return a.y0 - b.y0;
  });
}

/* ---------- projection ---------- */

const PX = [0, 0];

function proj(s: State, env: SceneEnv, x: number, y: number, z: number, out: number[]) {
  const dz = Math.max(NEAR, z - s.cz);
  const k = s.f / dz;
  out[0] = env.w / 2 + (x - s.cx) * k;
  out[1] = s.hy - (y - s.cy) * k;
  return k;
}

const fogA = (dz: number) => clamp((dz - 160) / (FAR - 300), 0, 1) ** 0.75;
const fogStyle = (a: number) => `rgba(${FOG[0]},${FOG[1]},${FOG[2]},${a.toFixed(3)})`;

const Q = [0, 0, 0, 0, 0, 0, 0, 0];

function quad(c: C, q: number[]) {
  c.beginPath();
  c.moveTo(q[0], q[1]);
  c.lineTo(q[2], q[3]);
  c.lineTo(q[4], q[5]);
  c.lineTo(q[6], q[7]);
  c.closePath();
}

function drawBox(c: C, s: State, env: SceneEnv, b: Box) {
  const zA = Math.max(b.z0, s.cz + NEAR);
  const dzA = zA - s.cz;
  if (dzA > FAR) return;
  const fa = fogA(dzA);
  const tex = s.tex[b.tex];
  const front = b.z0 > s.cz + NEAR;
  // side wall facing the camera, sliced into strips of the facade texture
  const sideX = s.cx < b.x0 ? b.x0 : s.cx > b.x1 ? b.x1 : NaN;
  if (!Number.isNaN(sideX)) {
    proj(s, env, sideX, b.y1, zA, PX);
    Q[0] = PX[0];
    Q[1] = PX[1];
    proj(s, env, sideX, b.y1, b.z1, PX);
    Q[2] = PX[0];
    Q[3] = PX[1];
    proj(s, env, sideX, b.y0, b.z1, PX);
    Q[4] = PX[0];
    Q[5] = PX[1];
    proj(s, env, sideX, b.y0, zA, PX);
    Q[6] = PX[0];
    Q[7] = PX[1];
    const wpx = Math.abs(Q[2] - Q[0]);
    if (wpx > 0.6) {
      c.fillStyle = '#10141b';
      quad(c, Q);
      c.fill();
      if (dzA < 900 && wpx > 6) {
        c.save();
        quad(c, Q);
        c.clip();
        const n = clamp(Math.ceil(wpx / 40), 1, 14);
        const hgt = b.y1 - b.y0;
        c.globalAlpha = 0.6 * b.shade;
        for (let i = 0; i < n; i++) {
          const za = lerp(zA, b.z1, i / n);
          const zb = lerp(zA, b.z1, (i + 1) / n);
          proj(s, env, sideX, b.y1, za, PX);
          const xa = PX[0];
          const ta = PX[1];
          proj(s, env, sideX, b.y0, za, PX);
          const ba = PX[1];
          proj(s, env, sideX, b.y1, zb, PX);
          const xb = PX[0];
          const tb = PX[1];
          proj(s, env, sideX, b.y0, zb, PX);
          const bb = PX[1];
          const su = b.sx + (za - b.z0) * TPU;
          const sw = Math.max(1, (zb - za) * TPU);
          const sh = Math.min(TEX_H, hgt * TPU);
          c.drawImage(
            tex,
            su % (TEX_W - sw),
            TEX_H - sh,
            sw,
            sh,
            Math.min(xa, xb),
            Math.min(ta, tb),
            Math.abs(xb - xa) + 0.6,
            Math.max(ba, bb) - Math.min(ta, tb)
          );
        }
        c.globalAlpha = 1;
        c.restore();
      }
      // the wall turns away from the avenue light, so darken it toward the back
      c.fillStyle = fogStyle(Math.min(1, fa + 0.05));
      quad(c, Q);
      c.fill();
    }
  }
  // the face looking down the avenue
  if (front) {
    proj(s, env, b.x0, b.y1, b.z0, PX);
    const X0 = PX[0];
    const Y0 = PX[1];
    proj(s, env, b.x1, b.y0, b.z0, PX);
    const X1 = PX[0];
    const Y1 = PX[1];
    if (X1 > -2 && X0 < env.w + 2 && X1 - X0 > 0.4) {
      const hgt = b.y1 - b.y0;
      const sh = Math.min(TEX_H, hgt * TPU);
      c.drawImage(
        tex,
        b.sx,
        TEX_H - sh,
        Math.max(1, (b.x1 - b.x0) * TPU),
        sh,
        X0,
        Y0,
        X1 - X0,
        Y1 - Y0
      );
      c.fillStyle = fogStyle(fa * 0.95);
      c.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    }
  }
  // roof
  if (s.cy > b.y1) {
    proj(s, env, b.x0, b.y1, zA, PX);
    Q[0] = PX[0];
    Q[1] = PX[1];
    proj(s, env, b.x1, b.y1, zA, PX);
    Q[2] = PX[0];
    Q[3] = PX[1];
    proj(s, env, b.x1, b.y1, b.z1, PX);
    Q[4] = PX[0];
    Q[5] = PX[1];
    proj(s, env, b.x0, b.y1, b.z1, PX);
    Q[6] = PX[0];
    Q[7] = PX[1];
    if (Math.abs(Q[1] - Q[7]) > 0.3) {
      c.fillStyle = '#20262f';
      quad(c, Q);
      c.fill();
      c.fillStyle = fogStyle(fa);
      c.fill();
      // parapet catching the street glow
      c.strokeStyle = `rgba(255,170,100,${(0.25 * (1 - fa)).toFixed(3)})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Q[0], Q[1]);
      c.lineTo(Q[2], Q[3]);
      c.stroke();
    }
  }
  if (b.spire > 0) {
    const mx = (b.x0 + b.x1) / 2;
    const mz = (Math.max(zA, b.z0) + b.z1) / 2;
    proj(s, env, mx, b.y1, mz, PX);
    const ax = PX[0];
    const ay = PX[1];
    const k = proj(s, env, mx, b.y1 + b.spire, mz, PX);
    c.strokeStyle = '#2a313c';
    c.lineWidth = Math.max(0.6, 1.4 * k);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(PX[0], PX[1]);
    c.stroke();
  }
}

function drawStreets(c: C, s: State, env: SceneEnv, t: number) {
  const { w, h } = env;
  // ground haze to the horizon
  c.fillStyle = grad(c, 0, s.hy, 0, h, ['#3a302e', '#15161b', '#0a0c11']);
  c.fillRect(-w, s.hy, w * 3, h * 2);
  // the avenue
  proj(s, env, -AVE + 6, 0, s.cz + NEAR, PX);
  Q[0] = PX[0];
  Q[1] = PX[1];
  proj(s, env, AVE - 6, 0, s.cz + NEAR, PX);
  Q[2] = PX[0];
  Q[3] = PX[1];
  proj(s, env, AVE - 6, 0, s.cz + FAR, PX);
  Q[4] = PX[0];
  Q[5] = PX[1];
  proj(s, env, -AVE + 6, 0, s.cz + FAR, PX);
  Q[6] = PX[0];
  Q[7] = PX[1];
  c.fillStyle = grad(c, 0, s.hy, 0, h, ['#4a3a30', '#1c1a1c', '#121318']);
  quad(c, Q);
  c.fill();
  // cross streets
  const first = Math.floor(s.cz / BLOCK);
  c.fillStyle = 'rgba(52,44,40,0.55)';
  for (let i = first; i < first + FAR / BLOCK; i++) {
    const za = Math.max(s.cz + NEAR, i * BLOCK - 18);
    const zb = i * BLOCK + 22;
    if (zb <= za) continue;
    proj(s, env, -480, 0, za, PX);
    Q[0] = PX[0];
    Q[1] = PX[1];
    proj(s, env, 480, 0, za, PX);
    Q[2] = PX[0];
    Q[3] = PX[1];
    proj(s, env, 480, 0, zb, PX);
    Q[4] = PX[0];
    Q[5] = PX[1];
    proj(s, env, -480, 0, zb, PX);
    Q[6] = PX[0];
    Q[7] = PX[1];
    quad(c, Q);
    c.fill();
  }
  // lane markings
  c.strokeStyle = 'rgba(255,214,150,0.35)';
  c.lineCap = 'butt';
  for (const lx of [-40, 0, 40]) {
    c.beginPath();
    const z0 = Math.floor(s.cz / 28) * 28;
    for (let z = z0; z < s.cz + 900; z += 28) {
      if (z < s.cz + NEAR) continue;
      const k = proj(s, env, lx, 0, z, PX);
      c.lineWidth = Math.max(0.5, 1.2 * k);
      c.moveTo(PX[0], PX[1]);
      proj(s, env, lx, 0, z + 12, PX);
      c.lineTo(PX[0], PX[1]);
    }
    c.stroke();
  }
  // sodium lamps down both kerbs and the traffic
  c.globalCompositeOperation = 'lighter';
  const z0 = Math.floor(s.cz / 46) * 46;
  for (let z = z0; z < s.cz + FAR * 0.8; z += 46) {
    if (z < s.cz + NEAR + 2) continue;
    const dz = z - s.cz;
    const a = (1 - fogA(dz)) ** 2;
    for (const lx of [-AVE + 4, AVE - 4]) {
      const k = proj(s, env, lx, 9, z, PX);
      glow(c, s.amber, PX[0], PX[1], Math.max(1.2, 12 * k), a * 0.75);
      proj(s, env, lx * 0.8, 0, z, PX);
      glow(c, s.amber, PX[0], PX[1], Math.max(1.5, 26 * k), a * 0.07);
    }
  }
  for (const car of s.cars) {
    if (car.z < s.cz + NEAR + 1 || car.z > s.cz + FAR * 0.7) continue;
    const toward = car.v < 0;
    const a = (1 - fogA(car.z - s.cz)) * 0.95;
    const img = toward ? s.white : s.red;
    for (const o of [-2.2, 2.2]) {
      const k = proj(s, env, car.x + o, 1.4, car.z, PX);
      glow(c, img, PX[0], PX[1], Math.max(1.2, (toward ? 5 : 3.4) * k), a);
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  void t;
}

function drawCity(c: C, s: State, env: SceneEnv, t: number) {
  drawStreets(c, s, env, t);
  for (const b of s.boxes) {
    drawBox(c, s, env, b);
    if (b.mark) drawLandmark(c, s, env, t);
  }
  // aircraft lights on the towers
  c.globalCompositeOperation = 'lighter';
  const blink = Math.sin(t * 3) > 0.2 ? 1 : 0.25;
  for (const b of s.boxes) {
    if (!b.beacon && !b.spire) continue;
    const top = b.y1 + b.spire;
    const z = Math.max(b.z0, s.cz + NEAR);
    const k = proj(s, env, (b.x0 + b.x1) / 2, top, (z + b.z1) / 2, PX);
    glow(c, s.red, PX[0], PX[1], Math.max(2, 9 * k), blink * (1 - fogA(z - s.cz) * 0.7));
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/** A gargoyle in profile facing +x, feet on the origin, about 80 units nose to tail */
function traceGargoyle(c: C) {
  poly(
    c,
    [
      -24, 0, -29, -16, -21, -34, -14, -38, -24, -76, -13, -62, -8, -70, -2, -55, 4, -62, 8, -44,
      18, -45, 24, -52, 23, -66, 30, -54, 37, -49, 49, -45, 54, -40, 45, -38, 51, -31, 39, -32, 30,
      -30, 24, -22, 28, -6, 35, 0, 30, -2, 26, 0, 22, -2, 12, -7, -6, -5, -9, 0,
    ]
  );
}

/** The signal tower's gothic crown, its lamp and the gargoyle he lands on */
function drawLandmark(c: C, s: State, env: SceneEnv, t: number) {
  const dz = GARG_Z - s.cz;
  if (dz < NEAR + 2) return;
  const fa = fogA(dz);
  // pinnacles on the four corners of the roof
  c.fillStyle = '#1a1e25';
  for (const [x, z] of [
    [TOWER.x0, TOWER.z0],
    [TOWER.x1, TOWER.z0],
    [TOWER.x0, TOWER.z1],
    [TOWER.x1, TOWER.z1],
  ]) {
    if (z < s.cz + NEAR) continue;
    const k = proj(s, env, x, TOWER.y1, z, PX);
    const bx = PX[0];
    const by = PX[1];
    poly(c, [bx - 3.5 * k, by, bx, by - 30 * k, bx + 3.5 * k, by]);
    c.fill();
  }
  c.fillStyle = fogStyle(fa * 0.9);
  // the lamp housing
  const kl = proj(s, env, LAMP[0], LAMP[1], LAMP[2], PX);
  c.fillStyle = '#14171c';
  c.fillRect(PX[0] - 7 * kl, PX[1] - 4 * kl, 14 * kl, 9 * kl);
  c.globalCompositeOperation = 'lighter';
  glow(c, s.amber, PX[0], PX[1] - 2 * kl, Math.max(4, 26 * kl), 0.9 * s.sig);
  glow(c, s.white, PX[0], PX[1] - 2 * kl, Math.max(2, 8 * kl), s.sig);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  // the gargoyle, rimmed by the lamp above it
  const k = proj(s, env, GARG_X, GARG_Y, GARG_Z, PX);
  const sc = k * 0.22;
  if (sc * 80 < 1.5) return;
  c.save();
  c.translate(PX[0], PX[1]);
  c.scale(sc, sc);
  c.fillStyle = `rgba(255,214,160,${(0.85 * (1 - fa) * s.sig).toFixed(3)})`;
  c.save();
  c.translate(-1.5, -1.8);
  traceGargoyle(c);
  c.fill();
  c.restore();
  c.fillStyle = '#16191f';
  traceGargoyle(c);
  c.fill();
  // the stone ledge it squats on
  c.fillStyle = '#1d2129';
  c.fillRect(-46, 0, 84, 10);
  c.fillStyle = 'rgba(255,200,140,0.35)';
  c.fillRect(-46, 0, 84, 1.2);
  c.globalAlpha = fa * 0.9;
  c.fillStyle = fogStyle(1);
  traceGargoyle(c);
  c.fill();
  c.globalAlpha = 1;
  c.restore();
  void t;
}

/** The city as the sonar sees it: edges and floor lines, brightest where the ping passes */
function drawSonar(c: C, s: State, env: SceneEnv, a: number) {
  const { w, h } = env;
  c.fillStyle = `rgba(2,4,8,${(a * 0.94).toFixed(3)})`;
  c.fillRect(-w, -h, w * 3, h * 3);
  c.globalCompositeOperation = 'lighter';
  c.lineWidth = 1;
  // ground grid
  c.strokeStyle = `rgba(160,200,255,${(0.16 * a).toFixed(3)})`;
  c.beginPath();
  for (let x = -480; x <= 480; x += 40) {
    proj(s, env, x, 0, s.cz + NEAR, PX);
    c.moveTo(PX[0], PX[1]);
    proj(s, env, x, 0, s.cz + FAR * 0.6, PX);
    c.lineTo(PX[0], PX[1]);
  }
  const z0 = Math.ceil(s.cz / 40) * 40;
  for (let z = z0; z < s.cz + FAR * 0.6; z += 40) {
    proj(s, env, -480, 0, z, PX);
    c.moveTo(PX[0], PX[1]);
    proj(s, env, 480, 0, z, PX);
    c.lineTo(PX[0], PX[1]);
  }
  c.stroke();
  for (const b of s.boxes) {
    const zA = Math.max(b.z0, s.cz + NEAR);
    const dz = zA - s.cz;
    if (dz > FAR * 0.8) continue;
    const mx = (b.x0 + b.x1) / 2;
    const d = Math.hypot(mx - s.bx, (b.y0 + b.y1) / 2 - s.by, (zA + b.z1) / 2 - s.bz);
    const hit = Math.max(0, 1 - Math.abs(d - s.ping) / 70);
    const base = 0.32 * (1 - dz / (FAR * 0.8));
    const al = Math.min(1, (base + hit * 0.8) * a);
    if (al < 0.02) continue;
    c.strokeStyle = `rgba(${Math.round(190 + hit * 65)},${Math.round(220 + hit * 35)},255,${al.toFixed(3)})`;
    c.beginPath();
    // the eight corners joined up, nearest edges clipped at the camera
    const xs = [b.x0, b.x1];
    const ys = [b.y0, b.y1];
    const zs = [zA, b.z1];
    for (const y of ys)
      for (const z of zs) {
        proj(s, env, xs[0], y, z, PX);
        c.moveTo(PX[0], PX[1]);
        proj(s, env, xs[1], y, z, PX);
        c.lineTo(PX[0], PX[1]);
      }
    for (const x of xs)
      for (const z of zs) {
        proj(s, env, x, ys[0], z, PX);
        c.moveTo(PX[0], PX[1]);
        proj(s, env, x, ys[1], z, PX);
        c.lineTo(PX[0], PX[1]);
      }
    for (const x of xs)
      for (const y of ys) {
        proj(s, env, x, y, zs[0], PX);
        c.moveTo(PX[0], PX[1]);
        proj(s, env, x, y, zs[1], PX);
        c.lineTo(PX[0], PX[1]);
      }
    // floor lines on the walls that face us
    if (dz < 900) {
      const sideX = s.cx < b.x0 ? b.x0 : s.cx > b.x1 ? b.x1 : NaN;
      for (let y = b.y0 + 12; y < b.y1; y += 12) {
        if (b.z0 > s.cz + NEAR) {
          proj(s, env, b.x0, y, b.z0, PX);
          c.moveTo(PX[0], PX[1]);
          proj(s, env, b.x1, y, b.z0, PX);
          c.lineTo(PX[0], PX[1]);
        }
        if (!Number.isNaN(sideX)) {
          proj(s, env, sideX, y, zA, PX);
          c.moveTo(PX[0], PX[1]);
          proj(s, env, sideX, y, b.z1, PX);
          c.lineTo(PX[0], PX[1]);
        }
      }
    }
    c.stroke();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/* ---------- sky ---------- */

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.sky, w, h, dpr);
  s.sky = cv;
  if (!c) return;
  const u = s.u;
  const hy = s.hy;
  c.fillStyle = grad(c, 0, 0, 0, hy, ['#05070c', '#0e1420', '#1e2533', '#4a3a34', '#7a5640']);
  c.fillRect(0, 0, w, h);
  // low cloud deck lit from beneath by the city
  const rnd = mulberry(3);
  for (let i = 0; i < 40; i++) {
    const y = hy * (0.1 + Math.pow(rnd(), 0.7) * 0.85);
    const x = rnd() * w;
    const rx = (100 + rnd() * 260) * u;
    const ry = (6 + rnd() * 16) * u * (0.6 + y / hy);
    const warm = y / hy;
    c.globalAlpha = 0.12 + rnd() * 0.2;
    c.fillStyle = `rgb(${Math.round(40 + warm * 120)},${Math.round(44 + warm * 70)},${Math.round(56 + warm * 30)})`;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // the far city wall at the horizon
  let x = 0;
  while (x < w) {
    const bw = (6 + rnd() * 18) * u;
    const bh = (4 + Math.pow(rnd(), 2) * 40) * u;
    c.fillStyle = '#1d1f26';
    c.fillRect(x, hy - bh, bw + 0.5, bh + 2);
    for (let wy = hy - bh + 2 * u; wy < hy; wy += 3 * u)
      for (let wx = x + 1 * u; wx < x + bw - 1 * u; wx += 2.5 * u)
        if (rnd() < 0.18) {
          c.fillStyle = rnd() < 0.7 ? 'rgba(255,200,130,0.6)' : 'rgba(200,220,255,0.6)';
          c.fillRect(wx, wy, 1 * u, 1.2 * u);
        }
    x += bw;
  }
  c.fillStyle = grad(c, 0, hy - 40 * u, 0, hy + 4 * u, [
    'rgba(160,110,80,0)',
    'rgba(150,104,76,0.55)',
  ]);
  c.fillRect(0, hy - 40 * u, w, 44 * u);
}

function drawSignal(c: C, s: State, env: SceneEnv, t: number) {
  const { w } = env;
  const u = s.u;
  const sx = w * 0.72 - s.cx * 0.04;
  const sy = s.hy * 0.3;
  // the beam rises from the lamp on the signal tower's roof
  let bx = w * 0.82 - s.cx * 0.02;
  let by = s.hy;
  if (LAMP[2] - s.cz > NEAR + 2) {
    proj(s, env, LAMP[0], LAMP[1], LAMP[2], PX);
    bx = PX[0];
    by = PX[1];
  }
  const on = s.sig * (s.sig < 1 ? 0.6 + 0.4 * Math.sin(t * 47) * Math.sin(t * 13) : 1);
  if (on <= 0.01) return;
  // the beam from a rooftop on the far side of the city
  c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(bx, by, sx, sy);
  g.addColorStop(0, `rgba(255,236,190,${(0.26 * on).toFixed(3)})`);
  g.addColorStop(1, `rgba(255,236,190,${(0.05 * on).toFixed(3)})`);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(bx - 2 * u, by);
  c.lineTo(sx - 46 * u, sy + 6 * u);
  c.lineTo(sx + 46 * u, sy - 6 * u);
  c.lineTo(bx + 2 * u, by);
  c.fill();
  c.save();
  c.translate(sx, sy);
  c.rotate(-0.12);
  c.scale(1, 0.62);
  glow(c, s.amber, 0, 0, 120 * u, (0.35 + Math.sin(t * 1.3) * 0.03) * on);
  c.globalAlpha = on;
  c.fillStyle = 'rgba(255,240,206,0.5)';
  c.beginPath();
  c.ellipse(0, 0, 54 * u, 54 * u, 0, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(20,18,22,0.85)';
  c.beginPath();
  traceBat(c, 0, 4 * u, 44 * u, 0.25);
  c.fill();
  c.globalAlpha = 1;
  c.restore();
  c.globalCompositeOperation = 'source-over';
  // drifting cloud over the emblem
  c.globalAlpha = 0.5;
  const drift = (t * 6 * u) % (300 * u);
  c.drawImage(s.haze, sx - 160 * u + drift, sy - 30 * u, 220 * u, 50 * u);
  c.globalAlpha = 1;
}

/* ---------- Batman on the ledge, in profile ---------- */

/** How far he has turned his head up toward the signal, set before each perch draw */
let HEAD_TILT = 0;

// pose layout as in the other Nolan scenes: hip, neck, head, knees, feet, elbows, hands
const STAND = [
  0, -104, 4, -160, 8, -178, 10, -54, 16, 0, -12, -54, -22, 0, -4, -128, -2, -98, -8, -130, -6,
  -100,
];
const READY = [
  6, -90, 18, -144, 26, -160, 22, -48, 18, 0, -4, -46, -20, 0, -8, -124, -26, -108, -12, -126, -32,
  -110,
];

function traceProfileCape(c: C, P: readonly number[], t: number, gust: number, open: number) {
  // hangs from the shoulders and streams back into the wind, the hem bitten into scallops
  const nx = P[2] - 6;
  const ny = P[3] + 4;
  const wv = Math.sin(t * 2.6) * 6 + Math.sin(t * 4.1 + 1) * 3;
  const g = gust * (1 + open);
  const tipX = nx - 70 - g * 70 + wv;
  const tipY = ny + 40 - g * 30 + Math.sin(t * 3.3) * 6;
  const hemX = P[0] - 28 - g * 40 + wv * 0.5;
  const hemY = -10 - g * 14 + Math.sin(t * 2.9 + 2) * 5;
  c.moveTo(nx + 10, ny - 4);
  c.quadraticCurveTo(nx - 30 - g * 20, ny - 6 - g * 10, tipX, tipY);
  scallops(c, tipX, tipY, hemX, hemY, 5, -(7 + g * 4));
  c.quadraticCurveTo(P[0] - 14, (hemY + P[1]) / 2, P[0] - 10, P[1] - 10);
  c.lineTo(nx + 6, ny + 10);
  c.closePath();
}

function fillProfile(
  c: C,
  P: readonly number[],
  t: number,
  gust: number,
  open: number,
  col: string,
  cape: string,
  sheen = false
) {
  c.fillStyle = cape;
  c.beginPath();
  traceProfileCape(c, P, t, gust, open);
  c.fill();
  if (sheen) {
    // a faint sheen on the cape where the moon catches it
    c.fillStyle = grad(c, P[2], P[3], P[2] - 120, P[3] + 60, [
      'rgba(130,150,180,0.22)',
      'rgba(130,150,180,0)',
    ]);
    c.fill();
  }
  c.fillStyle = col;
  // far arm and leg
  limb(c, P[2] - 4, P[3] + 8, P[18], P[19], 10, 8.5);
  limb(c, P[18], P[19], P[20], P[21], 8.5, 7);
  c.beginPath();
  c.arc(P[20], P[21], 6.5, 0, TAU);
  c.fill();
  limb(c, P[0] - 4, P[1], P[10], P[11], 12, 9.5);
  limb(c, P[10], P[11], P[12], P[13] - 8, 10, 8.5);
  poly(c, [P[12] - 9, P[13], P[12] - 9, P[13] - 16, P[12] + 9, P[13] - 14, P[12] + 16, P[13]]);
  c.fill();
  // armoured torso: chest plate pushed forward, narrow waist
  c.beginPath();
  c.moveTo(P[2] - 18, P[3] + 2);
  c.quadraticCurveTo(P[2] + 4, P[3] - 6, P[2] + 20, P[3] + 8);
  c.quadraticCurveTo(lerp(P[2], P[0], 0.4) + 24, lerp(P[3], P[1], 0.4), P[0] + 14, P[1] - 2);
  c.lineTo(P[0] + 13, P[1] + 8);
  c.lineTo(P[0] - 15, P[1] + 8);
  c.quadraticCurveTo(lerp(P[2], P[0], 0.5) - 20, lerp(P[3], P[1], 0.5), P[2] - 18, P[3] + 2);
  c.fill();
  // near leg with the knee plate
  limb(c, P[0] + 4, P[1], P[6], P[7], 12.5, 10.5);
  limb(c, P[6], P[7], P[8], P[9] - 8, 11, 9);
  poly(c, [P[8] - 10, P[9], P[8] - 10, P[9] - 17, P[8] + 9, P[9] - 15, P[8] + 18, P[9]]);
  c.fill();
  // gorget and cowl
  limb(c, P[2], P[3] + 2, P[4] - 2, P[5] + 10, 11, 10);
  c.save();
  c.translate(P[4], P[5]);
  c.rotate(HEAD_TILT);
  c.scale(1.18, 1.18);
  c.beginPath();
  traceCowlProfile(c);
  c.fill();
  c.restore();
  // near arm and the finned gauntlet
  limb(c, P[2] + 2, P[3] + 8, P[14], P[15], 11, 9);
  limb(c, P[14], P[15], P[16], P[17], 9, 8);
  c.beginPath();
  c.arc(P[16], P[17], 7.5, 0, TAU);
  c.fill();
  const fa = Math.atan2(P[17] - P[15], P[16] - P[14]);
  const ox = -Math.sin(fa);
  const oy = Math.cos(fa);
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const q = 0.3 + i * 0.2;
    const x = lerp(P[14], P[16], q) - ox * 8;
    const y = lerp(P[15], P[17], q) - oy * 8;
    c.moveTo(x, y);
    c.lineTo(x - ox * 9 - Math.cos(fa) * 6, y - oy * 9 - Math.sin(fa) * 6);
    c.lineTo(x + Math.cos(fa) * 6, y + Math.sin(fa) * 6);
  }
  c.fill();
}

function detailProfile(c: C, P: readonly number[]) {
  // ab plates and the chest plate seam
  c.strokeStyle = 'rgba(120,134,156,0.22)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const k = 0.42 + i * 0.13;
    const x = lerp(P[2], P[0], k) + 12 - i;
    const y = lerp(P[3], P[1], k);
    c.moveTo(x - 10, y + 1);
    c.quadraticCurveTo(x, y - 2, x + 10 - i, y + 1);
  }
  c.moveTo(P[2] - 10, P[3] + 10);
  c.quadraticCurveTo(P[2] + 12, P[3] + 18, P[2] + 20, P[3] + 10);
  c.stroke();
  // utility belt: gunmetal capsules on a dark strap
  const by = P[1] + 2;
  c.fillStyle = '#26282d';
  c.fillRect(P[0] - 15, by - 4, 30, 8);
  c.fillStyle = '#4c5058';
  for (let i = 0; i < 4; i++) {
    const x = P[0] - 13 + i * 7.5;
    c.beginPath();
    c.roundRect(x, by - 5, 5.5, 10, 1.6);
    c.fill();
  }
  c.fillStyle = 'rgba(210,220,236,0.4)';
  c.fillRect(P[0] - 15, by - 4, 30, 1);
  // shoulder plate and knee plate, picked out by a thin highlight along their top edges
  c.strokeStyle = 'rgba(150,170,200,0.4)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(P[2] + 2, P[3] + 12, 12, 9, 0.4, Math.PI * 1.05, Math.PI * 1.9);
  c.stroke();
  c.beginPath();
  c.ellipse(P[6] + 4, P[7] - 2, 7, 9, 0.2, Math.PI * 1.2, Math.PI * 1.95);
  c.stroke();
  // the near arm picked out against the body, gauntlet fins catching the moon
  c.strokeStyle = 'rgba(150,172,204,0.35)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(P[2] - 6, P[3] + 14);
  c.quadraticCurveTo(P[14] - 10, P[15], P[16] - 7, P[17]);
  c.stroke();
  const fa = Math.atan2(P[17] - P[15], P[16] - P[14]);
  const ox = -Math.sin(fa);
  const oy = Math.cos(fa);
  c.fillStyle = '#2b3038';
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const q = 0.3 + i * 0.2;
    const x = lerp(P[14], P[16], q) - ox * 8;
    const y = lerp(P[15], P[17], q) - oy * 8;
    c.moveTo(x, y);
    c.lineTo(x - ox * 9 - Math.cos(fa) * 6, y - oy * 9 - Math.sin(fa) * 6);
    c.lineTo(x + Math.cos(fa) * 6, y + Math.sin(fa) * 6);
  }
  c.fill();
  // the bat on the chest plate, edge on
  c.fillStyle = '#23272e';
  c.beginPath();
  c.ellipse(P[2] + 15, P[3] + 16, 4, 9, 0.25, 0, TAU);
  c.fill();
  // the bare mouth and jaw under the cowl
  c.save();
  c.translate(P[4], P[5]);
  c.rotate(HEAD_TILT);
  c.scale(1.18, 1.18);
  c.fillStyle = '#8a766c';
  c.beginPath();
  c.moveTo(13.2, 0.8);
  c.lineTo(15.4, 4.6);
  c.lineTo(14.6, 9.5);
  c.lineTo(9.5, 13.5);
  c.lineTo(6, 13.4);
  c.lineTo(7, 6);
  c.lineTo(10.5, 2.4);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(20,16,16,0.8)';
  c.fillRect(12.4, 6.4, 3, 0.9);
  // the eye slit glint
  c.fillStyle = 'rgba(200,220,255,0.5)';
  c.fillRect(8.5, -4.2, 3.4, 0.9);
  c.restore();
}

function drawPerchBatman(c: C, s: State, env: SceneEnv, t: number) {
  const { w, h } = env;
  const F = Math.min(w / 520, h / 330);
  const footX = Math.min(w * 0.3, w / 2 - 60 * F);
  const footY = h * 0.86;
  const P = s.P;
  c.save();
  c.translate(footX + s.fall * 260 * F, footY + s.fall * s.fall * 900 * F);
  c.rotate(s.lean * 0.5 + s.fall * 0.9);
  c.scale(F, F);
  const open = s.lean;
  HEAD_TILT = -0.3 * s.look * (1 - s.lean);
  // moonlight from above left, the city burning orange from below right
  c.save();
  c.translate(-1.2, -1.4);
  fillProfile(c, P, t, s.gust, open, MOON, MOON);
  c.restore();
  c.save();
  c.translate(1.1, 0.9);
  fillProfile(c, P, t, s.gust, open, CITY, CITY);
  c.restore();
  fillProfile(c, P, t, s.gust, open, SUIT, CAPE, true);
  detailProfile(c, P);
  c.restore();
}

function drawLedge(c: C, s: State, env: SceneEnv) {
  const { w, h } = env;
  const u = s.u;
  const F = Math.min(w / 520, h / 330);
  const edge = Math.min(w * 0.3, w / 2 - 60 * F) + 70 * F;
  const y = h * 0.86;
  c.fillStyle = grad(c, 0, y, 0, h, ['#1f232b', '#0b0d11']);
  c.beginPath();
  c.moveTo(-10, y);
  c.lineTo(edge, y);
  c.lineTo(edge + 10 * u, y + 8 * u);
  c.lineTo(edge + 6 * u, h + 10);
  c.lineTo(-10, h + 10);
  c.closePath();
  c.fill();
  // the parapet's top, seen from just above
  c.fillStyle = grad(c, 0, y - 16 * u, 0, y, ['#2c323d', '#1c2129']);
  c.beginPath();
  c.moveTo(-10, y - 16 * u);
  c.lineTo(edge - 14 * u, y - 16 * u);
  c.lineTo(edge, y);
  c.lineTo(-10, y);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(176,200,232,0.5)';
  c.fillRect(-10, y, edge + 10, 1.4 * u);
  c.fillStyle = 'rgba(255,160,90,0.45)';
  c.fillRect(edge + 2 * u, y + 3 * u, 1.6 * u, h - y);
  // the tower dropping away beneath the ledge
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let yy = y + 14 * u; yy < h; yy += 9 * u) c.fillRect(-10, yy, edge + 6 * u, 1 * u);
}

/* ---------- Batman in the glide, from behind ---------- */

// cape outline from behind: shoulder L, hand L, hem L1, hem L2, hem centre, hem R2, hem R1, hand R, shoulder R
const BK_STAND = [-17, 2, -21, 30, -26, 64, -14, 74, 0, 76, 14, 74, 26, 64, 21, 30, 17, 2];
const BK_GLIDE = [-16, 0, -96, -6, -74, 30, -38, 56, 0, 70, 38, 56, 74, 30, 96, -6, 16, 0];
const BK_TUCK = [-15, 2, -50, 20, -42, 46, -22, 66, 0, 80, 22, 66, 42, 46, 50, 20, 15, 2];
// landing crouch: hands down by his boots, the cape pooled on the road around him
const BK_CROUCH = [-19, 8, -28, 52, -44, 60, -24, 66, 0, 68, 24, 66, 44, 60, 28, 52, 19, 8];
const BK = new Array<number>(BK_GLIDE.length).fill(0);

function poseBack(spread: number, tuck: number, t: number, flutter: number, crouch = 0) {
  mixPose(BK, BK_STAND, BK_GLIDE, spread);
  for (let i = 0; i < BK.length; i++) BK[i] = lerp(BK[i], BK_TUCK[i], tuck);
  if (crouch > 0) for (let i = 0; i < BK.length; i++) BK[i] = lerp(BK[i], BK_CROUCH[i], crouch);
  // the cape ripples along its trailing edge
  for (let i = 4; i <= 12; i += 2) {
    BK[i + 1] += Math.sin(t * 9 + i) * flutter;
    BK[i] += Math.cos(t * 7 + i * 1.3) * flutter * 0.4;
  }
}

function fillBack(c: C, col: string, cape: string, spread: number, t: number) {
  // boots below the hem
  c.fillStyle = col;
  const fy = BK[9];
  const sep = lerp(9, 3, spread);
  for (const sx of [-sep, sep]) {
    c.beginPath();
    c.ellipse(sx, fy - 2, 5, 11, sx * 0.01, 0, TAU);
    c.fill();
  }
  // the cape: arms as the leading edge, scallops between the ribs
  c.fillStyle = cape;
  c.beginPath();
  c.moveTo(BK[0], BK[1]);
  c.quadraticCurveTo(lerp(BK[0], BK[2], 0.5), BK[3] - 8 * spread, BK[2], BK[3]);
  const bite = 4 + 7 * spread;
  scallops(c, BK[2], BK[3], BK[4], BK[5], 2, -bite);
  scallops(c, BK[4], BK[5], BK[6], BK[7], 2, -bite);
  scallops(c, BK[6], BK[7], BK[8], BK[9], 2, -bite * 0.8);
  scallops(c, BK[8], BK[9], BK[10], BK[11], 2, -bite * 0.8);
  scallops(c, BK[10], BK[11], BK[12], BK[13], 2, -bite);
  scallops(c, BK[12], BK[13], BK[14], BK[15], 2, -bite);
  c.quadraticCurveTo(lerp(BK[14], BK[16], 0.5), BK[15] - 8 * spread, BK[16], BK[17]);
  c.closePath();
  c.fill();
  // arms along the leading edge, the gauntlet fins raking back
  c.fillStyle = col;
  for (const d of [-1, 1]) {
    const hx = d < 0 ? BK[2] : BK[14];
    const hy = d < 0 ? BK[3] : BK[15];
    const sx = d * 17;
    const ex = lerp(sx, hx, 0.5);
    const ey = lerp(2, hy, 0.5) - 6 * spread;
    limb(c, sx, 3, ex, ey, 7.5, 6);
    limb(c, ex, ey, hx, hy, 6, 5);
    c.beginPath();
    c.arc(hx, hy, 4.6, 0, TAU);
    c.fill();
    const fa = Math.atan2(hy - ey, hx - ex);
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const q = 0.3 + i * 0.22;
      const x = lerp(ex, hx, q);
      const y = lerp(ey, hy, q) - 4;
      c.moveTo(x - Math.cos(fa) * 3, y);
      c.lineTo(x - Math.cos(fa) * 6, y - 7);
      c.lineTo(x + Math.cos(fa) * 3, y);
    }
    c.fill();
  }
  // shoulders, back plate and the cowl
  c.beginPath();
  c.ellipse(0, 4, 21, 10, 0, 0, TAU);
  c.fill();
  c.save();
  c.translate(0, -11);
  c.scale(1.1, 1.1);
  c.beginPath();
  traceCowlBack(c);
  c.fill();
  c.restore();
  void t;
}

function drawGlideBatman(c: C, s: State, env: SceneEnv, t: number) {
  const k = proj(s, env, s.bx, s.by, s.bz, PX);
  const sc = k * 0.12;
  if (sc <= 0) return;
  poseBack(s.spread, s.tuck, t, s.mode === 'land' ? 0.4 : 1 + s.speed * 0.004, s.crouch);
  c.save();
  c.translate(PX[0], PX[1]);
  c.rotate(s.bank);
  c.scale(sc, sc);
  c.save();
  c.translate(0, -1.6);
  fillBack(c, MOON, MOON, s.spread, t);
  c.restore();
  c.save();
  c.translate(0, 1.8);
  fillBack(c, CITY, CITY, s.spread, t);
  c.restore();
  fillBack(c, SUIT, CAPE, s.spread, t);
  // a cold sheen across the top of the cape
  c.fillStyle = grad(c, 0, -10, 0, 60, ['rgba(120,140,170,0.28)', 'rgba(120,140,170,0)']);
  c.beginPath();
  c.moveTo(BK[0], BK[1]);
  c.quadraticCurveTo(lerp(BK[0], BK[2], 0.5), BK[3] - 8 * s.spread, BK[2], BK[3]);
  for (let i = 4; i < 16; i += 2) c.lineTo(BK[i], BK[i + 1]);
  c.quadraticCurveTo(lerp(BK[14], BK[16], 0.5), BK[15] - 8 * s.spread, BK[16], BK[17]);
  c.closePath();
  c.fill();
  // ribs in the stiffened cape
  if (s.spread > 0.2) {
    c.strokeStyle = `rgba(80,92,112,${(0.5 * s.spread).toFixed(3)})`;
    c.lineWidth = 1.2;
    c.beginPath();
    for (const i of [4, 6, 10, 12]) {
      c.moveTo(0, 6);
      c.lineTo(BK[i], BK[i + 1] - 4);
    }
    c.stroke();
  }
  c.restore();
}

/* ---------- audio ---------- */

function ping(bus: AudioBus) {
  tone(bus, 2400, { type: 'sine', attack: 0.003, decay: 0.18, gain: 0.05, glideTo: 1800 });
  tone(bus, 2400, {
    type: 'sine',
    attack: 0.003,
    decay: 0.3,
    gain: 0.02,
    glideTo: 1800,
    delay: 0.22,
  });
  tone(bus, 2400, {
    type: 'sine',
    attack: 0.003,
    decay: 0.4,
    gain: 0.01,
    glideTo: 1800,
    delay: 0.46,
  });
}

/* ---------- control ---------- */

function setMode(s: State, m: Mode) {
  s.mode = m;
  s.mt = 0;
}

function startWipe(s: State, to: Mode) {
  if (s.wipe > 0) return;
  s.wipe = 0.0001;
  s.wipeTo = to;
}

function beginGlide(s: State) {
  setMode(s, 'glide');
  s.bx = 0;
  s.by = PERCH_Y - 30;
  s.bz = 40;
  s.vx = 0;
  s.vy = -60;
  s.speed = 190;
  s.tuck = 1;
  s.spread = 0.4;
  s.aimX = 0.5;
  s.aimY = 0.45;
  s.cx = 0;
  s.cy = s.by + 10;
  s.cz = s.bz - 36;
  s.ping = 9999;
}

function toPerch(s: State) {
  setMode(s, 'perch');
  s.crouch = 0;
  s.sig = 0;
  s.sigT = 0.9;
  s.look = 0;
  s.lean = 0;
  s.fall = 0;
  s.sonarOn = false;
  s.autoT = rand(4, 5);
  s.cx = 0;
  s.cy = PERCH_Y;
  s.cz = -80;
}

function beginSwoop(s: State) {
  setMode(s, 'swoop');
  s.sw[0] = s.bx;
  s.sw[1] = s.by;
  s.sw[2] = s.bz;
  s.swDur = clamp((LAND_Z - s.bz) / Math.max(150, s.speed * 0.8), 1.3, 2.2);
}

function land(s: State, env: SceneEnv) {
  setMode(s, 'land');
  s.crouch = 1;
  s.sonarOn = false;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.2, freq: 180, q: 0.7, type: 'lowpass' });
    noise(bus, { duration: 0.5, gain: 0.08, freq: 900, q: 0.6, type: 'bandpass' });
    tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.4, gain: 0.16, glideTo: 40 });
  }
  if (s.hum) setHum(s.hum, 40, 0.012, 260);
}

function toggleSonar(s: State, env: SceneEnv) {
  s.sonarOn = !s.sonarOn;
  if (s.sonarOn) {
    s.ping = 0;
    s.pingT = 1.4;
    const bus = env.audio();
    if (bus) ping(bus);
  } else {
    const bus = env.audio();
    if (bus) tone(bus, 900, { type: 'sine', attack: 0.004, decay: 0.15, gain: 0.03, glideTo: 500 });
  }
}

function step(s: State, env: SceneEnv) {
  // a click, tap, Space or Enter
  if (s.mode === 'perch') {
    setMode(s, 'leap');
    const bus = env.audio();
    if (bus) {
      noise(bus, { duration: 0.6, gain: 0.12, freq: 700, q: 0.7, type: 'bandpass' });
      if (!s.hum) s.hum = startHum(bus, { type: 'sine', freq: 50, cutoff: 600, noiseAmt: 1 });
    }
  } else if (s.mode === 'glide' || s.mode === 'swoop') toggleSonar(s, env);
  else if (s.mode === 'land' && s.mt > 1.2) startWipe(s, 'perch');
}

function engage(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  const bus = env.audio();
  if (bus && !s.hum) s.hum = startHum(bus, { type: 'sine', freq: 50, cutoff: 600, noiseAmt: 1 });
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    touchAction: 'none',
    posterTime: 2.5,
    init: () => ({
      mode: 'perch',
      mt: 0,
      bx: 0,
      by: PERCH_Y,
      bz: 0,
      vx: 0,
      vy: 0,
      speed: 190,
      bank: 0,
      tuck: 0,
      spread: 0,
      aimX: 0.5,
      aimY: 0.45,
      keys: 0,
      ptrFresh: 0,
      cx: 0,
      cy: PERCH_Y,
      cz: -80,
      hy: 0,
      f: 600,
      roll: 0,
      blocks: new Map(),
      boxes: [],
      cars: Array.from({ length: CARS }, (_, i) => {
        const toward = i % 2 === 0;
        return {
          x: (toward ? -1 : 1) * (14 + (i % 3) * 18),
          z: rand(0, FAR),
          v: (toward ? -1 : 1) * rand(30, 60),
        };
      }),
      motes: Array.from({ length: MOTES }, () => ({
        x: rand(-90, 90),
        y: rand(-60, 60),
        z: rand(10, 300),
      })),
      sw: [0, 0, 0],
      swDur: 1.6,
      crouch: 0,
      sig: 0,
      sigT: 0.6,
      look: 0,
      sonar: 0,
      sonarOn: false,
      ping: 9999,
      pingT: 0,
      P: STAND.slice(),
      lean: 0,
      fall: 0,
      wipe: 0,
      wipeTo: null,
      gust: 0.5,
      touched: false,
      idle: 0,
      autoT: 6,
      autoSonar: 0,
      downAt: -1,
      downX: 0,
      downY: 0,
      hum: null,
      u: 1,
      sky: null,
      tex: makeTextures(),
      amber: glowSprite(64, [
        [0, 'rgba(255,226,170,1)'],
        [0.25, 'rgba(255,170,80,0.55)'],
        [1, 'rgba(255,130,40,0)'],
      ]),
      white: glowSprite(64, [
        [0, 'rgba(255,255,255,1)'],
        [0.3, 'rgba(220,235,255,0.5)'],
        [1, 'rgba(200,220,255,0)'],
      ]),
      red: glowSprite(64, [
        [0, 'rgba(255,190,180,1)'],
        [0.3, 'rgba(255,40,30,0.6)'],
        [1, 'rgba(200,0,0,0)'],
      ]),
      blue: glowSprite(64, [
        [0, 'rgba(210,230,255,1)'],
        [0.3, 'rgba(40,110,255,0.6)'],
        [1, 'rgba(0,40,200,0)'],
      ]),
      haze: glowSprite(64, [
        [0, 'rgba(70,64,70,0.9)'],
        [0.6, 'rgba(60,56,64,0.35)'],
        [1, 'rgba(50,50,60,0)'],
      ]),
      grain: grainTile(128, 17),
      vignette: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.u = Math.min(w / W0, h / H0);
      s.f = Math.max(w, h * 1.5) * 0.56;
      s.hy = h * 0.36;
      paintSky(s, env);
      const v = ctx.createRadialGradient(
        w / 2,
        h * 0.5,
        Math.min(w, h) * 0.3,
        w / 2,
        h * 0.5,
        Math.max(w, h) * 0.75
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,4,0.7)');
      s.vignette = v;
      syncCity(s);
    },
    update: (s, env, dt, t) => {
      const { w, h } = env;
      s.mt += dt;
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 12;
      s.gust = damp(
        s.gust,
        0.4 + 0.6 * Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 0.23 + 2)),
        2,
        dt
      );

      if (s.mode === 'perch') {
        s.lean = damp(s.lean, 0, 3, dt);
        dampPose(s.P, STAND, 3, dt);
        s.cx = Math.sin(t * 0.15) * 6;
        s.cz = -80 + Math.sin(t * 0.1) * 10;
        if (auto) {
          s.autoT -= dt;
          if (s.autoT <= 0) {
            s.autoT = rand(13, 16);
            s.autoSonar = rand(4, 7);
            step(s, env);
          }
        }
      } else if (s.mode === 'leap') {
        dampPose(s.P, READY, 6, dt);
        s.lean = damp(s.lean, 1, 5, dt);
        if (s.mt > 0.45) s.fall += dt * 1.6;
        if (s.mt > 0.55) startWipe(s, 'glide');
      } else if (s.mode === 'glide') {
        // steering: hover or drag with the pointer, or W A S D
        s.ptrFresh = Math.max(0, s.ptrFresh - dt);
        if (env.interactive && (s.ptrFresh > 0 || env.pointer.down) && !auto) {
          s.aimX = clamp(env.pointer.x / Math.max(1, w), 0, 1);
          s.aimY = clamp(env.pointer.y / Math.max(1, h), 0, 1);
        }
        if (s.keys) {
          if (s.keys & 1) s.aimY -= dt * 0.7;
          if (s.keys & 2) s.aimY += dt * 0.7;
          if (s.keys & 4) s.aimX -= dt * 0.7;
          if (s.keys & 8) s.aimX += dt * 0.7;
          s.aimX = clamp(s.aimX, 0, 1);
          s.aimY = clamp(s.aimY, 0, 1);
        }
        if (auto) {
          s.aimX = 0.5 + 0.38 * Math.sin(t * 0.37) * Math.cos(t * 0.11);
          s.aimY = 0.5 + 0.42 * Math.sin(t * 0.29 + 1);
          s.autoSonar -= dt;
          if (s.autoSonar <= 0) {
            s.autoSonar = s.sonarOn ? rand(6, 9) : rand(2.5, 3.5);
            toggleSonar(s, env);
          }
        }
        if (!auto) keepAwake(env);
        const tx = lerp(-AVE + 22, AVE - 22, s.aimX);
        const ty = lerp(PERCH_Y - 10, 26, s.aimY);
        const ax = (tx - s.bx) * 2.4 - s.vx * 2.2;
        s.vx += ax * dt;
        const wantVy = clamp((ty - s.by) * 1.6, -220, 120);
        s.vy = damp(s.vy, wantVy, 2.6, dt);
        s.bx = clamp(s.bx + s.vx * dt, -AVE + 14, AVE - 14);
        s.by = clamp(s.by + s.vy * dt, 18, PERCH_Y + 20);
        // diving trades height for speed, climbing pays it back
        const target = 170 - s.vy * 1.2 + (s.by < 60 ? 40 : 0);
        s.speed = clamp(damp(s.speed, target, 0.9, dt), 120, 420);
        s.bz += s.speed * dt;
        s.tuck = damp(s.tuck, clamp(-s.vy / 160, 0, 1), 4, dt);
        s.spread = damp(s.spread, 1, 2, dt);
        s.bank = damp(s.bank, clamp(s.vx * 0.012, -0.6, 0.6), 5, dt);
        // the camera hangs back over his shoulder
        s.cx = damp(s.cx, s.bx * 0.7, 4, dt);
        const camT = s.by + 6 + s.tuck * 2;
        s.cy = clamp(damp(s.cy, camT, 10, dt), camT - 4, camT + 4);
        s.cz = s.bz - 40 - s.speed * 0.02;
        if (s.hum)
          setHum(s.hum, 40 + s.speed * 0.12, 0.02 + (s.speed / 420) * 0.09, 300 + s.speed * 3);
        // the lights down the avenue are where he is headed: close enough and he dives for him
        if (s.bz >= LAND_Z - SWOOP_AT) beginSwoop(s);
      } else if (s.mode === 'swoop') {
        // the dive: tucked and dropping, then the cape flares and he comes down beside the Joker
        const q = clamp(s.mt / s.swDur, 0, 1);
        const px = s.bx;
        const py = s.by;
        const pz = s.bz;
        s.bz = lerp(s.sw[2], LAND_Z, 1 - Math.pow(1 - q, 2.2));
        s.bx = lerp(s.sw[0], LAND_X, smooth(q));
        s.by = lerp(s.sw[1], LAND_Y + 3, smooth(Math.min(1, q * 1.12)));
        const idt = 1 / Math.max(dt, 0.001);
        s.vx = (s.bx - px) * idt;
        s.vy = (s.by - py) * idt;
        s.speed = (s.bz - pz) * idt;
        s.tuck = damp(s.tuck, q < 0.62 ? 0.9 : 0, 5, dt);
        s.spread = damp(s.spread, 1, 3, dt);
        s.crouch = smooth((q - 0.88) / 0.12) * 0.6;
        s.bank = damp(s.bank, clamp(s.vx * 0.012, -0.6, 0.6), 5, dt);
        const k = smooth((q - 0.25) / 0.75);
        s.cx = lerp(damp(s.cx, s.bx * 0.7, 4, dt), SHOT_X, k);
        // the camera only settles to street height once he is nearly down, so he stays in frame
        s.cy = lerp(s.by + 6 + s.tuck * 2, SHOT_Y, smooth((q - 0.5) / 0.5));
        s.cz = lerp(s.bz - 40 - s.speed * 0.02, SHOT_Z, k);
        s.cz = Math.min(s.cz, s.bz - 30);
        if (s.hum)
          setHum(s.hum, 40 + s.speed * 0.12, 0.03 + (s.speed / 420) * 0.1, 300 + s.speed * 3);
        keepAwake(env);
        if (q >= 1) land(s, env);
      } else {
        // down on the gargoyle: he rises out of the crouch under the beam and the cape settles
        const up = smooth((s.mt - 0.7) / 1.4);
        s.crouch = lerp(1, 0.15, up);
        s.by = lerp(LAND_Y, LAND_Y + 3, up);
        s.bx = LAND_X;
        s.bz = LAND_Z;
        s.speed = 0;
        s.vx = s.vy = 0;
        s.tuck = damp(s.tuck, 0, 4, dt);
        s.spread = damp(s.spread, lerp(0.75, 0.12, up), 3, dt);
        s.bank = damp(s.bank, 0, 4, dt);
        s.cx = SHOT_X;
        s.cy = lerp(SHOT_Y, SHOT_Y - 2, up);
        s.cz = SHOT_Z - Math.min(s.mt, 8) * 1.2;
        keepAwake(env);
        if (s.mt > (auto ? 7 : 10)) startWipe(s, 'perch');
      }
      s.roll = damp(s.roll, s.mode === 'glide' || s.mode === 'swoop' ? s.bank * 0.35 : 0, 4, dt);
      // the signal flickers on over the city, and he looks up at it
      if (s.mode === 'perch') {
        s.sigT -= dt;
        if (s.sigT <= 0 && s.sig === 0) {
          s.sig = 0.001;
          const bus = env.audio();
          if (bus) {
            noise(bus, { duration: 0.12, gain: 0.12, freq: 400, q: 0.8, type: 'lowpass' });
            tone(bus, 58, { type: 'sine', attack: 0.004, decay: 0.5, gain: 0.08, glideTo: 50 });
          }
        }
        if (s.sig > 0) s.sig = Math.min(1, s.sig + dt * 1.4);
        s.look = damp(s.look, s.sig >= 1 ? 1 : 0, 2.2, dt);
      } else s.sig = 1;

      // wipes between the ledge and the glide
      if (s.wipe > 0) {
        const before = s.wipe;
        s.wipe += dt / 0.8;
        if (before < 0.5 && s.wipe >= 0.5) {
          if (s.wipeTo === 'glide') beginGlide(s);
          else toPerch(s);
        }
        if (s.wipe >= 1) {
          s.wipe = 0;
          s.wipeTo = null;
        }
      }

      // sonar
      const flying = s.mode === 'glide' || s.mode === 'swoop';
      s.sonar = damp(s.sonar, s.sonarOn && flying ? 1 : 0, 6, dt);
      if (s.sonarOn) {
        s.ping += dt * 700;
        s.pingT -= dt;
        if (s.pingT <= 0) {
          s.pingT = 1.4;
          s.ping = 0;
          const bus = env.audio();
          if (bus) ping(bus);
        }
      }

      for (const car of s.cars) {
        car.z += car.v * dt;
        if (car.z < s.cz - 10) car.z += FAR * 0.7;
        if (car.z > s.cz + FAR * 0.7) car.z -= FAR * 0.7;
      }
      if (flying)
        for (const m of s.motes) {
          if (m.z < 4) {
            m.z += 300;
            m.x = rand(-90, 90);
            m.y = rand(-60, 60);
          }
          m.z -= s.speed * dt;
        }
      syncCity(s);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      if (Math.abs(s.roll) > 0.001) {
        ctx.translate(w / 2, h * 0.6);
        ctx.rotate(s.roll);
        ctx.translate(-w / 2, -h * 0.6);
      }
      // overscan the sky about the horizon so the roll never shows an edge
      if (s.sky) ctx.drawImage(s.sky, -w * 0.15, s.hy - s.hy * 1.3, w * 1.3, h * 1.3);
      drawSignal(ctx, s, env, t);
      drawCity(ctx, s, env, t);
      if (s.sonar > 0.01) drawSonar(ctx, s, env, s.sonar);
      if (s.mode === 'glide' || s.mode === 'swoop') {
        // wind streaks rushing past
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(200,210,230,${(0.08 + (s.speed / 420) * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const m of s.motes) {
          const x = s.cx + m.x;
          const y = s.cy + m.y;
          const z = s.cz + m.z;
          proj(s, env, x, y, z, PX);
          const ax = PX[0];
          const ay = PX[1];
          proj(s, env, x, y, z + s.speed * 0.05, PX);
          ctx.moveTo(ax, ay);
          ctx.lineTo(PX[0], PX[1]);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      if (s.mode === 'glide' || s.mode === 'swoop' || s.mode === 'land') {
        drawGlideBatman(ctx, s, env, t);
      } else {
        // low cloud tearing past below the ledge in the wind
        for (let i = 0; i < 6; i++) {
          const span = w + 600 * u;
          const x = w + 300 * u - ((t * (30 + i * 9) * u + i * 260 * u) % span);
          const y = h * (0.5 + 0.07 * i) + Math.sin(t * 0.3 + i) * 6 * u;
          ctx.globalAlpha = 0.35;
          ctx.drawImage(s.haze, x - 160 * u, y - 14 * u, 320 * u, 28 * u);
        }
        ctx.globalAlpha = 1;
        drawLedge(ctx, s, env);
        drawPerchBatman(ctx, s, env, t);
      }

      if (s.sonar > 0.01) {
        // a sonar sweep ring centred on him
        proj(s, env, s.bx, s.by, s.bz, PX);
        ctx.globalCompositeOperation = 'lighter';
        const r = (s.ping / 700) * Math.max(w, h) * 0.9;
        ctx.strokeStyle = `rgba(210,232,255,${(0.5 * s.sonar * Math.max(0, 1 - r / Math.max(w, h))).toFixed(3)})`;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.ellipse(PX[0], PX[1], r, r * 0.55, 0, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        // the lenses frame the view
        const lg = ctx.createRadialGradient(
          w / 2,
          h / 2,
          Math.min(w, h) * 0.35,
          w / 2,
          h / 2,
          Math.max(w, h) * 0.7
        );
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(1, `rgba(0,0,0,${(0.7 * s.sonar).toFixed(3)})`);
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, w, h);
      }

      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      // the cape sweeping across the lens between shots
      if (s.wipe > 0) {
        const k = smooth(s.wipe);
        const top = lerp(h * 1.05, -h * 2.4, k);
        const bot = top + h * 2.3;
        ctx.fillStyle = '#030305';
        ctx.beginPath();
        ctx.moveTo(-10, bot);
        scallops(ctx, -10, top + h * 0.15, w + 10, top + h * 0.15, 5, 0.12 * h);
        ctx.lineTo(w + 10, top + h * 0.15);
        ctx.lineTo(w + 10, bot);
        scallops(ctx, w + 10, bot, -10, bot, 5, 0.1 * h);
        ctx.closePath();
        ctx.fill();
      }
      drawGrain(ctx, s.grain, w, h, 0.06);
    },
    onPointerDown: (s, env, x, y) => {
      engage(s, env);
      s.downAt = performance.now();
      s.downX = x;
      s.downY = y;
      if (s.mode === 'perch') step(s, env);
    },
    onPointerUp: (s, env, x, y) => {
      if (s.downAt < 0) return;
      const quick = performance.now() - s.downAt < 260 && Math.hypot(x - s.downX, y - s.downY) < 14;
      s.downAt = -1;
      if (quick && (s.mode === 'glide' || s.mode === 'swoop' || s.mode === 'land') && s.mt > 0.3)
        step(s, env);
    },
    onPointerMove: (s) => {
      s.ptrFresh = 2;
      if (s.mode !== 'perch') s.idle = 0;
    },
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      const bit = k === 'w' ? 1 : k === 's' ? 2 : k === 'a' ? 4 : k === 'd' ? 8 : 0;
      if (bit) {
        s.keys = down ? s.keys | bit : s.keys & ~bit;
        s.ptrFresh = 0;
        if (down) engage(s, env);
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) {
        engage(s, env);
        step(s, env);
      }
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.sky, ...s.tex, s.amber, s.white, s.red, s.blue, s.haze, s.grain);
      s.sky = null;
      s.blocks.clear();
    },
  });
