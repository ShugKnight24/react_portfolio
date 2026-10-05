import { createCanvasScene, clamp, damp, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Night Swing: a masked hero in red and blue slinging webs across a city after dark.
 * A moonlit sky, two parallax skyline layers with lit windows baked into cached canvases,
 * and a pool of foreground towers recycled as the camera follows him forever to the right.
 * Holding shoots a web to a rooftop corner ahead; the swing is a real pendulum (gravity and
 * a rope constraint), letting go flings him forward with his momentum. His pose tucks on the
 * swing and spreads in flight, speed lines and wind streaks kick in when he is fast, and if he
 * drops too low a web fires on its own to save him. Left alone he swings by himself.
 */

interface Building {
  x: number;
  w: number;
  cols: number;
  top: number;
  kind: number;
  tx: number;
  ty: number;
  phase: number;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  depth: number;
}

interface State {
  buildings: Building[];
  right: number;
  rnd: () => number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0 flying, 1 web in flight, 2 swinging */
  mode: number;
  ax: number;
  ay: number;
  L: number;
  shootT: number;
  shootDur: number;
  rot: number;
  tuck: number;
  handX: number;
  handY: number;
  held: boolean;
  touched: boolean;
  idle: number;
  /** Current web was fired by the autopilot or the safety net */
  auto: boolean;
  splat: number;
  // the web he let go of, falling away
  owx: number;
  owy: number;
  oax: number;
  oay: number;
  oLife: number;
  camX: number;
  camY: number;
  wind: Streak[];
  lines: Streak[];
  // layout
  s: number;
  baseY: number;
  tileW: number;
  bg: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
  tex: HTMLCanvasElement | null;
  glow: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const W0 = 640;
const H0 = 420;
const G = 1000;
const POOL = 14;
const MAX_WIND = 70;
const MAX_LINES = 26;
const COL = 14;
const ROW = 18;
const TEX_W = 320;
const TEX_H = 760;
const LOW = -62;
const RIM = 'rgba(196,214,255,0.9)';

/* joints: lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot (x, y pairs, pelvis origin) */
const SPREAD = [-12, -22, -22, -31, 12, -22, 22, -31, -8, 11, -15, 22, 8, 11, 13, 23];
const TUCK = [-8, -9, -1, -6, 6, -28, 3, -40, 9, -5, 3, 9, 11, -1, 6, 12];
const J = new Array<number>(16).fill(0);

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sprite(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

/** Put a tower at x and return where the next one may start */
function place(s: State, b: Building, x: number, cols?: number, top?: number) {
  const r = s.rnd;
  b.cols = cols ?? 4 + Math.floor(r() * 6);
  b.w = b.cols * COL + 10;
  b.x = x;
  b.top = top ?? -(220 + r() * 140);
  b.kind = Math.floor(r() * 4);
  b.tx = Math.floor(r() * ((TEX_W - b.w) / COL)) * COL;
  b.ty = Math.floor(r() * 8) * ROW;
  b.phase = r() * TAU;
  return x + b.w + 22 + r() * 60;
}

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const bg = s.bg ?? document.createElement('canvas');
  s.bg = bg;
  bg.width = Math.max(1, Math.round(w * dpr));
  bg.height = Math.max(1, Math.round(h * dpr));
  const c = bg.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = s.s;
  const sky = c.createLinearGradient(0, 0, 0, s.baseY);
  sky.addColorStop(0, '#03040c');
  sky.addColorStop(0.55, '#0a1030');
  sky.addColorStop(0.85, '#1c1a44');
  sky.addColorStop(1, '#3a2346');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(7);
  for (let i = 0; i < Math.round((w * h) / 2400); i++) {
    c.globalAlpha = 0.15 + rnd() * 0.55;
    c.fillStyle = rnd() < 0.15 ? '#bcd0ff' : '#ffffff';
    const r = rnd() < 0.08 ? 1.5 : 0.8;
    c.fillRect(rnd() * w, rnd() * s.baseY * 0.7, r, r);
  }
  c.globalAlpha = 1;
  // moon, up and to the right, where the hero is heading
  const mx = w * 0.78;
  const my = Math.min(h * 0.2, s.baseY - 380 * u);
  const mr = 34 * u;
  const halo = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 5);
  halo.addColorStop(0, 'rgba(190,210,255,0.3)');
  halo.addColorStop(0.35, 'rgba(120,140,230,0.1)');
  halo.addColorStop(1, 'rgba(60,70,160,0)');
  c.fillStyle = halo;
  c.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
  const disc = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#fbfbff');
  disc.addColorStop(0.75, '#dfe4ff');
  disc.addColorStop(1, '#b8c2f2');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(130,140,200,0.2)';
  for (const [ox, oy, rr] of [
    [-0.3, -0.15, 0.2],
    [0.28, 0.25, 0.26],
    [0.1, -0.45, 0.1],
  ]) {
    c.beginPath();
    c.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU);
    c.fill();
  }
  // warm city glow rising off the streets
  const haze = c.createLinearGradient(0, s.baseY - 260 * u, 0, s.baseY);
  haze.addColorStop(0, 'rgba(255,120,80,0)');
  haze.addColorStop(1, 'rgba(255,120,90,0.2)');
  c.fillStyle = haze;
  c.fillRect(0, s.baseY - 260 * u, w, h);
}

/** A seamless strip of distant towers: the last tower ends exactly at the tile edge */
function paintLayer(
  prev: HTMLCanvasElement | null,
  s: State,
  env: SceneEnv,
  seed: number,
  lo: number,
  hi: number,
  body: string,
  win: number,
  lit: number
) {
  const { h, dpr } = env;
  const cv = prev ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.round(s.tileW * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d');
  if (!c) return cv;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = s.s;
  const rnd = mulberry(seed);
  let x = 0;
  while (x < s.tileW - 1) {
    let bw = (30 + rnd() * 60) * u;
    if (s.tileW - (x + bw) < 30 * u) bw = s.tileW - x;
    const top = s.baseY - (lo + rnd() * (hi - lo)) * u;
    c.fillStyle = body;
    c.fillRect(x, top, bw + 0.5, h - top);
    const spire = rnd();
    if (spire < 0.18) {
      c.beginPath();
      c.moveTo(x + bw * 0.3, top);
      c.lineTo(x + bw * 0.5, top - (20 + rnd() * 40) * u);
      c.lineTo(x + bw * 0.7, top);
      c.fill();
    } else if (spire < 0.4) {
      c.fillRect(x + bw * 0.2, top - 10 * u, bw * 0.6, 10 * u);
    }
    // lit windows
    const gx = win * 1.8 * u;
    const gy = win * 2.3 * u;
    for (let wy = top + gy; wy < h; wy += gy) {
      for (let wx = x + gx * 0.6; wx < x + bw - gx * 0.6; wx += gx) {
        if (rnd() > lit) continue;
        c.globalAlpha = 0.35 + rnd() * 0.5;
        c.fillStyle = rnd() < 0.8 ? '#ffcf7a' : '#a8d4ff';
        c.fillRect(wx, wy, win * u, win * 1.3 * u);
      }
    }
    c.globalAlpha = 1;
    x += bw;
  }
  return cv;
}

/** Window grid shared by the foreground towers; each samples its own patch */
function paintWindows(s: State, env: SceneEnv) {
  const cv = s.tex ?? document.createElement('canvas');
  s.tex = cv;
  const k = s.s * env.dpr;
  cv.width = Math.max(1, Math.round(TEX_W * k));
  cv.height = Math.max(1, Math.round(TEX_H * k));
  const c = cv.getContext('2d');
  if (!c) return;
  c.setTransform(k, 0, 0, k, 0, 0);
  const rnd = mulberry(23);
  for (let y = 0; y < TEX_H; y += ROW) {
    // whole floors tend to be lit or dark together
    const floor = rnd() < 0.35 ? 0.65 : 0.22;
    for (let x = 0; x < TEX_W; x += COL) {
      if (rnd() < floor) {
        const r = rnd();
        c.fillStyle = r < 0.55 ? '#ffd27e' : r < 0.85 ? '#ffedb8' : '#9fd0ff';
        c.globalAlpha = 0.55 + rnd() * 0.45;
        c.fillRect(x, y, 6, 9);
        c.globalAlpha = 0.18;
        c.fillRect(x - 1, y + 9, 8, 2);
      } else {
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(80,100,170,0.14)';
        c.fillRect(x, y, 6, 9);
      }
    }
  }
  c.globalAlpha = 1;
}

function pickAnchor(s: State) {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (const b of s.buildings) {
    for (let side = 0; side < 2; side++) {
      const cx = b.x + side * b.w;
      const dx = cx - s.x;
      const dy = s.y - b.top;
      if (dx < 70 || dx > 360 || dy < 50) continue;
      const score = Math.abs(dx - 190) + Math.abs(dy - 180) * 0.6;
      if (score < best) {
        best = score;
        bx = cx;
        by = b.top;
      }
    }
  }
  if (best === Infinity) {
    // nothing ideal: the nearest rooftop ahead will do
    let near = Infinity;
    for (const b of s.buildings) {
      const cx = Math.max(b.x, s.x + 90);
      if (cx > b.x + b.w) continue;
      if (cx - s.x < near) {
        near = cx - s.x;
        bx = cx;
        by = b.top;
      }
    }
    if (near === Infinity) {
      bx = s.x + 200;
      by = -300;
    }
  }
  s.ax = bx;
  s.ay = by;
}

function thwip(bus: AudioBus) {
  noise(bus, { duration: 0.07, gain: 0.09, freq: 3600, q: 0.9, type: 'highpass' });
  tone(bus, 1500, { type: 'triangle', attack: 0.003, decay: 0.09, gain: 0.045, glideTo: 640 });
}

function shoot(s: State, env: SceneEnv, auto: boolean, sound: boolean) {
  if (s.mode !== 0) return;
  pickAnchor(s);
  s.mode = 1;
  s.shootT = 0;
  s.shootDur = clamp(Math.hypot(s.ax - s.handX, s.ay - s.handY) / 2600, 0.06, 0.16);
  s.auto = auto;
  const bus = sound ? env.audio() : null;
  if (bus) thwip(bus);
}

function letGo(s: State, env: SceneEnv, sound: boolean) {
  if (s.mode === 0) return;
  s.owx = s.handX;
  s.owy = s.handY;
  s.oax = s.mode === 2 ? s.ax : lerp(s.handX, s.ax, s.shootT);
  s.oay = s.mode === 2 ? s.ay : lerp(s.handY, s.ay, s.shootT);
  s.oLife = 1;
  if (s.mode === 2) {
    // fling: a kick along the direction of travel and a little lift
    s.vx += 70;
    s.vy -= 110;
    const bus = sound ? env.audio() : null;
    if (bus) noise(bus, { duration: 0.3, gain: 0.05, freq: 900, q: 0.6 });
  }
  s.mode = 0;
  s.auto = false;
}

function drawLayer(ctx: CanvasRenderingContext2D, s: State, cv: HTMLCanvasElement | null, f: number, h: number) {
  if (!cv) return;
  const off = (((s.camX * s.s * f) % s.tileW) + s.tileW) % s.tileW;
  const y = s.camY * f;
  ctx.drawImage(cv, -off, y, s.tileW, h);
  ctx.drawImage(cv, -off + s.tileW, y, s.tileW, h);
}

const sx = (s: State, env: SceneEnv, wx: number) => env.w * 0.4 + (wx - s.camX) * s.s;
const sy = (s: State, wy: number) => s.baseY + s.camY + wy * s.s;

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wd: number, col: string) {
  ctx.strokeStyle = col;
  ctx.lineWidth = wd;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** The hero in local units (pelvis origin, head up); rim fills every part with one colour */
function figure(ctx: CanvasRenderingContext2D, rim: string | null) {
  const red = rim ?? '#c91f30';
  const blue = rim ?? '#1d38a6';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // far arm and leg
  limb(ctx, -6, -17, J[0], J[1], 4.4, blue);
  limb(ctx, J[0], J[1], J[2], J[3], 3.7, red);
  limb(ctx, -3, 0, J[8], J[9], 5.6, blue);
  limb(ctx, J[8], J[9], J[10], J[11], 4.6, blue);
  limb(ctx, lerp(J[8], J[10], 0.5), lerp(J[9], J[11], 0.5), J[10], J[11], 4.9, red);
  // torso: blue flanks, red chest
  ctx.fillStyle = blue;
  ctx.beginPath();
  ctx.moveTo(-8, -20);
  ctx.lineTo(8, -20);
  ctx.quadraticCurveTo(7, -9, 5, 2);
  ctx.lineTo(-5, 2);
  ctx.quadraticCurveTo(-7, -9, -8, -20);
  ctx.fill();
  if (!rim) {
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(-5.5, -20);
    ctx.lineTo(5.5, -20);
    ctx.lineTo(3, -3);
    ctx.lineTo(-3, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#12131c';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(1.6, -13);
    ctx.lineTo(0, -11);
    ctx.lineTo(-1.6, -13);
    ctx.closePath();
    ctx.fill();
  }
  // near leg
  limb(ctx, 3, 0, J[12], J[13], 5.6, blue);
  limb(ctx, J[12], J[13], J[14], J[15], 4.6, blue);
  limb(ctx, lerp(J[12], J[14], 0.5), lerp(J[13], J[15], 0.5), J[14], J[15], 4.9, red);
  // head and mask
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.moveTo(-2.4, -20);
  ctx.lineTo(2.4, -20);
  ctx.lineTo(2, -23);
  ctx.lineTo(-2, -23);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.4, -26.5, 5.6, 6.6, 0, 0, TAU);
  ctx.fill();
  if (!rim) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0.4, -33);
    ctx.lineTo(0.4, -20);
    ctx.moveTo(-5, -26.5);
    ctx.quadraticCurveTo(0.4, -24, 5.8, -26.5);
    ctx.stroke();
    ctx.fillStyle = '#f4f7ff';
    ctx.strokeStyle = '#08080e';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(-1.6, -27.4, 1.7, 2.6, -0.45, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(2.8, -27.4, 1.7, 2.6, 0.45, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // near arm (the web arm)
  limb(ctx, 6, -17, J[4], J[5], 4.4, blue);
  limb(ctx, J[4], J[5], J[6], J[7], 3.7, red);
}

function setPose(s: State) {
  const k = s.tuck;
  for (let i = 0; i < 16; i++) J[i] = lerp(SPREAD[i], TUCK[i], k);
  if (s.mode !== 0) {
    // web arm reaches straight up the line
    J[4] = 3;
    J[5] = -29;
    J[6] = 2;
    J[7] = -41;
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 0.07,
    init: () => {
      const buildings: Building[] = Array.from({ length: POOL }, () => ({
        x: 0,
        w: 0,
        cols: 0,
        top: 0,
        kind: 0,
        tx: 0,
        ty: 0,
        phase: 0,
      }));
      const s: State = {
        buildings,
        right: 0,
        rnd: mulberry(5),
        // opening frame: the bottom of a big swing, the web taut above him
        x: 40,
        y: -90,
        vx: 780,
        vy: 0,
        mode: 2,
        ax: 40,
        ay: -300,
        L: 210,
        shootT: 1,
        shootDur: 0.1,
        rot: 0,
        tuck: 1,
        handX: 40,
        handY: -131,
        held: false,
        touched: false,
        idle: 0,
        auto: true,
        splat: 0,
        owx: 0,
        owy: 0,
        oax: 0,
        oay: 0,
        oLife: 0,
        camX: 40 + 94,
        camY: 0,
        wind: Array.from({ length: MAX_WIND }, () => ({
          x: Math.random(),
          y: Math.random(),
          len: rand(0.5, 1),
          depth: rand(0.4, 1.3),
        })),
        lines: Array.from({ length: MAX_LINES }, () => ({
          x: Math.random() * 1.4 - 0.2,
          y: Math.random(),
          len: rand(0.4, 1),
          depth: rand(0.7, 1.4),
        })),
        s: 1,
        baseY: 0,
        tileW: 1,
        bg: null,
        far: null,
        mid: null,
        tex: null,
        glow: sprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.25, 'rgba(255,210,210,0.55)'],
          [0.6, 'rgba(255,80,90,0.15)'],
          [1, 'rgba(255,40,60,0)'],
        ]),
        vignette: null,
      };
      // the swing's rooftop, then towers behind and ahead of it
      let x = place(s, buildings[0], 40, 7, -300);
      let back = 40;
      for (let i = 1; i < 4; i++) {
        const b = buildings[i];
        const gap = 22 + s.rnd() * 60;
        place(s, b, 0);
        b.x = back - gap - b.w;
        back = b.x;
      }
      for (let i = 4; i < POOL; i++) x = place(s, buildings[i], x);
      s.right = x;
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.s = Math.min(w / W0, h / H0);
      const u = s.s;
      s.baseY = Math.min(h + 10 * u, h * 0.5 + 250 * u);
      s.tileW = Math.max(w, 700 * u);
      paintBackdrop(s, env);
      s.far = paintLayer(s.far, s, env, 3, 150, 340, '#141936', 2.2, 0.16);
      s.mid = paintLayer(s.mid, s, env, 9, 110, 270, '#0c1028', 3.2, 0.24);
      paintWindows(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w, h } = env;
      const u = s.s;
      if (s.held) s.idle = 0;
      else s.idle += dt;
      const autop = !env.interactive || !s.touched || s.idle > 4;
      if (env.reducedMotion && s.touched && s.idle < 3) env.wake(300);

      // autopilot and the safety net
      if (s.mode === 0) {
        if (s.y > LOW && s.vy > 0) shoot(s, env, true, s.touched && env.interactive);
        else if (autop && ((s.vy > 150 && s.y > -230) || s.y > -140)) shoot(s, env, true, false);
      } else if (s.mode === 2 && !s.held && (s.auto || autop)) {
        const past = s.x - s.ax > s.L * Math.sin(0.6);
        if (past && s.vy < 0) letGo(s, env, false);
      }

      // physics in world units, two substeps
      const h2 = dt / 2;
      for (let i = 0; i < 2; i++) {
        s.vy += G * h2;
        if (s.mode === 2) {
          const dx = s.x - s.ax;
          const dy = s.y - s.ay;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          // a little pump through the bottom keeps the swing alive
          const tx = ny;
          const ty = -nx;
          if (ny > 0.3 && s.vx * tx + s.vy * ty > 0) {
            s.vx += tx * 170 * h2;
            s.vy += ty * 170 * h2;
          }
          s.vx *= 1 - 0.04 * h2;
        } else {
          s.vx *= 1 - 0.08 * h2;
          if (s.vx < 220) s.vx = damp(s.vx, 220, 2, h2);
        }
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > 1150) {
          s.vx *= 1150 / sp;
          s.vy *= 1150 / sp;
        }
        s.x += s.vx * h2;
        s.y += s.vy * h2;
        if (s.mode === 2) {
          const dx = s.x - s.ax;
          const dy = s.y - s.ay;
          const d = Math.hypot(dx, dy);
          if (d > s.L) {
            const nx = dx / d;
            const ny = dy / d;
            s.x = s.ax + nx * s.L;
            s.y = s.ay + ny * s.L;
            const vr = s.vx * nx + s.vy * ny;
            if (vr > 0) {
              s.vx -= vr * nx;
              s.vy -= vr * ny;
            }
          }
        }
      }
      if (s.y > -20) {
        s.y = -20;
        s.vy = Math.min(s.vy, 0);
      }

      // pose: tucked on the swing, spread in the air, body follows the motion
      let target: number;
      if (s.mode === 2) target = Math.atan2(s.ax - s.x, s.y - s.ay);
      else target = clamp(Math.atan2(s.vy, Math.max(1, s.vx)) * 0.7 + 0.35, -0.9, 1.5);
      let dr = target - s.rot;
      dr = ((((dr + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
      s.rot += dr * (1 - Math.exp(-(s.mode === 2 ? 14 : 5) * dt));
      s.tuck = damp(s.tuck, s.mode === 2 ? 1 : s.mode === 1 ? 0.45 : 0, 6, dt);
      const c = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const lhx = 2;
      const lhy = -41;
      s.handX = s.x + lhx * c - lhy * sn;
      s.handY = s.y + lhx * sn + lhy * c;

      if (s.mode === 1) {
        s.shootT += dt / s.shootDur;
        if (s.shootT >= 1) {
          s.shootT = 1;
          s.mode = 2;
          s.L = clamp(Math.hypot(s.x - s.ax, s.y - s.ay), 90, 320);
          s.splat = 1;
        }
      }
      s.splat = Math.max(0, s.splat - dt * 3);
      s.oLife = Math.max(0, s.oLife - dt * 2.2);

      // camera
      s.camX = damp(s.camX, s.x + clamp(s.vx * 0.12, 0, 120), 5, dt);
      const raw = s.baseY + s.y * u;
      s.camY = damp(s.camY, Math.max(0, h * 0.2 - raw), 4, dt);

      // recycle towers that fell behind
      const left = s.camX - (w * 0.4) / u - 80;
      for (const b of s.buildings) {
        if (b.x + b.w < left) s.right = place(s, b, s.right);
      }

      // wind and speed lines ride against the motion
      const speed = Math.hypot(s.vx, s.vy);
      for (const p of s.wind) {
        p.x -= (s.vx * u * p.depth * dt) / w;
        p.y -= (s.vy * u * p.depth * 0.6 * dt) / h;
        if (p.x < -0.05) p.x += 1.1;
        if (p.x > 1.05) p.x -= 1.1;
        if (p.y < -0.05) p.y += 1.1;
        if (p.y > 1.05) p.y -= 1.1;
      }
      const ang = Math.atan2(s.vy, s.vx);
      for (const l of s.lines) {
        l.x -= (Math.cos(ang) * speed * u * 2.4 * l.depth * dt) / w;
        l.y -= (Math.sin(ang) * speed * u * 2.4 * l.depth * dt) / h;
        if (l.x < -0.3 || l.x > 1.3 || l.y < -0.3 || l.y > 1.3) {
          l.x = 1.1 + Math.random() * 0.2;
          l.y = Math.random();
          if (Math.abs(Math.sin(ang)) > 0.5) {
            l.x = Math.random();
            l.y = Math.sin(ang) > 0 ? 1.1 + Math.random() * 0.1 : -0.1 - Math.random() * 0.1;
          }
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h, dpr } = env;
      const u = s.s;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

      // parallax skylines
      drawLayer(ctx, s, s.far, 0.12, h);
      drawLayer(ctx, s, s.mid, 0.35, h);
      // low mist between the layers
      const mist = ctx.createLinearGradient(0, s.baseY + s.camY * 0.5 - 140 * u, 0, s.baseY + s.camY * 0.5);
      mist.addColorStop(0, 'rgba(90,70,140,0)');
      mist.addColorStop(1, 'rgba(90,70,140,0.22)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, s.baseY + s.camY * 0.5 - 140 * u, w, h);

      // foreground towers
      const tex = s.tex;
      const k = u * dpr;
      for (const b of s.buildings) {
        const bx = sx(s, env, b.x);
        const bw = b.w * u;
        if (bx > w + 60 * u || bx + bw < -60 * u) continue;
        const top = sy(s, b.top);
        ctx.fillStyle = '#080a17';
        ctx.fillRect(bx, top, bw, h - top + 2);
        if (tex) {
          const dy = top + 12 * u;
          const srcH = Math.min((h - dy) * dpr, tex.height - b.ty * k);
          if (srcH > 1) {
            ctx.globalAlpha = 0.95;
            ctx.drawImage(tex, b.tx * k, b.ty * k, (b.cols * COL - 8) * k, srcH, bx + 8 * u, dy, (b.cols * COL - 8) * u, srcH / dpr);
            ctx.globalAlpha = 1;
          }
        }
        // moonlit edge and parapet
        ctx.fillStyle = 'rgba(150,175,255,0.2)';
        ctx.fillRect(bx + bw - 2 * u, top, 2 * u, h - top);
        ctx.fillStyle = 'rgba(180,200,255,0.4)';
        ctx.fillRect(bx - 1 * u, top - 3 * u, bw + 2 * u, 1.5 * u);
        ctx.fillStyle = '#0b0d1d';
        ctx.fillRect(bx - 1 * u, top - 1.5 * u, bw + 2 * u, 3 * u);
        const mx = bx + bw * 0.5;
        if (b.kind === 1) {
          ctx.strokeStyle = '#141830';
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.moveTo(mx, top);
          ctx.lineTo(mx, top - 46 * u);
          ctx.stroke();
          const blink = Math.sin(t * 2.2 + b.phase) > 0.2 ? 1 : 0.25;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = blink;
          const r = 9 * u;
          ctx.drawImage(s.glow, mx - r, top - 46 * u - r, r * 2, r * 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        } else if (b.kind === 2) {
          ctx.fillStyle = '#0c0f22';
          const tx = bx + bw * 0.22;
          ctx.fillRect(tx + 2 * u, top - 12 * u, 1.6 * u, 12 * u);
          ctx.fillRect(tx + 16 * u, top - 12 * u, 1.6 * u, 12 * u);
          ctx.beginPath();
          ctx.moveTo(tx, top - 12 * u);
          ctx.lineTo(tx, top - 30 * u);
          ctx.lineTo(tx + 9.5 * u, top - 37 * u);
          ctx.lineTo(tx + 19.5 * u, top - 30 * u);
          ctx.lineTo(tx + 19.5 * u, top - 12 * u);
          ctx.fill();
          ctx.fillStyle = 'rgba(180,200,255,0.25)';
          ctx.fillRect(tx + 17.5 * u, top - 30 * u, 2 * u, 18 * u);
        } else if (b.kind === 3) {
          ctx.fillStyle = '#0a0c1b';
          ctx.fillRect(bx + bw * 0.25, top - 16 * u, bw * 0.5, 16 * u);
          ctx.fillStyle = 'rgba(180,200,255,0.3)';
          ctx.fillRect(bx + bw * 0.75 - 1.5 * u, top - 16 * u, 1.5 * u, 16 * u);
        }
      }

      const speed = Math.hypot(s.vx, s.vy);
      const fast = clamp((speed - 560) / 460, 0, 1);

      // wind streaks
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#cfdcff';
      ctx.lineWidth = Math.max(0.8, 1.1 * u);
      const ang = Math.atan2(s.vy, s.vx);
      const cs = Math.cos(ang);
      const snA = Math.sin(ang);
      ctx.beginPath();
      for (const p of s.wind) {
        const px = p.x * w;
        const py = p.y * h;
        const L = (2 + speed * 0.03 * p.len * p.depth) * u;
        ctx.moveTo(px, py);
        ctx.lineTo(px + cs * L, py + snA * L);
      }
      ctx.globalAlpha = 0.12 + fast * 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // the web he let go of, sagging away
      if (s.oLife > 0.01) {
        const x0 = sx(s, env, s.owx);
        const y0 = sy(s, s.owy);
        const x1 = sx(s, env, s.oax);
        const y1 = sy(s, s.oay);
        const sag = (1 - s.oLife) * 90 * u + 10 * u;
        ctx.strokeStyle = `rgba(235,240,255,${(s.oLife * 0.6).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.7, 1.1 * u);
        ctx.beginPath();
        ctx.moveTo(x0, y0 + (1 - s.oLife) * 40 * u);
        ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1);
        ctx.stroke();
      }

      // live web
      const hx = sx(s, env, s.handX);
      const hy = sy(s, s.handY);
      if (s.mode !== 0) {
        const ax = sx(s, env, s.ax);
        const ay = sy(s, s.ay);
        const tx = lerp(hx, ax, s.shootT);
        const ty = lerp(hy, ay, s.shootT);
        const sag = s.mode === 1 ? (1 - s.shootT) * 26 * u + 6 * u : 0;
        ctx.strokeStyle = 'rgba(200,220,255,0.18)';
        ctx.lineWidth = 3.2 * u;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo((hx + tx) / 2, (hy + ty) / 2 + sag, tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#f4f6ff';
        ctx.lineWidth = Math.max(0.8, 1.3 * u);
        ctx.stroke();
        if (s.mode === 2) {
          // splat where it stuck
          ctx.strokeStyle = 'rgba(240,244,255,0.85)';
          ctx.lineWidth = Math.max(0.6, 0.9 * u);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI * 0.1 + (i / 5) * Math.PI * 0.8;
            const r = (6 + (i % 2) * 3) * u * (1 + s.splat * 0.6);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + Math.cos(a) * r, ay - Math.sin(a) * r * 0.5);
          }
          ctx.stroke();
          if (s.splat > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = s.splat * 0.7;
            const r = 22 * u;
            ctx.drawImage(s.glow, ax - r, ay - r, r * 2, r * 2);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }

      // the hero: moonlit rim pass, then the suit
      setPose(s);
      const px = sx(s, env, s.x);
      const py = sy(s, s.y);
      const fs = u * 1.05;
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        if (pass === 0) ctx.translate(px + 1.3 * u, py - 1.3 * u);
        else ctx.translate(px, py);
        ctx.rotate(s.rot);
        ctx.scale(fs, fs);
        figure(ctx, pass === 0 ? RIM : null);
        ctx.restore();
      }

      // speed lines
      if (fast > 0.01) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.8, 1.4 * u);
        ctx.globalAlpha = fast * 0.35;
        ctx.beginPath();
        for (const l of s.lines) {
          const lx = l.x * w;
          const ly = l.y * h;
          if (Math.abs(lx - px) < 40 * u && Math.abs(ly - py) < 40 * u) continue;
          const L = (50 + l.len * 130) * u * (0.6 + fast * 0.6);
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + cs * L, ly + snA * L);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      for (const c of [s.bg, s.far, s.mid, s.tex, s.glow]) if (c) c.width = c.height = 0;
      s.bg = s.far = s.mid = s.tex = null;
    },
  });

function press(s: State, env: SceneEnv) {
  s.held = true;
  s.touched = true;
  s.idle = 0;
  if (s.mode === 0) shoot(s, env, false, true);
  else s.auto = false;
  env.wake(600);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  s.idle = 0;
  letGo(s, env, true);
  env.wake(600);
}
