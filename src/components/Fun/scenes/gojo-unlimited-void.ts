import { clamp, createCanvasScene, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, glowSprite, layer, setHum, shakeX, shakeY, startHum, stopHum } from './heroes-kit';
import type { Hum } from './heroes-kit';
import {
  applyCam,
  arm,
  cam,
  camToScreen,
  drawGojo,
  fixed,
  HANDS,
  headOpts,
  impactFrame,
  inkPx,
  leg,
  letterbox,
  makeOut,
  mixCam,
  mulberry,
  shade,
  smooth,
  speedLines,
  subtitle,
  techTitle,
} from './gojo-kit';
import type { C, Cam, GojoOut, GojoPose, Light } from './gojo-kit';

/**
 * Unlimited Void: Gojo waits on a night crossing, hands in his pockets, while a cursed spirit
 * looms. Tap and the cut-ins run: a finger hooks the blindfold down, his hair falls, the Six
 * Eyes open, the hand sign comes up and he names the domain. The void blooms out of him and
 * swallows the street; inside is an endless space with a vast ring of light, a tunnel of stars
 * and rivers of information pouring into the frozen spirit while Gojo floats, untroubled. The
 * pointer drifts the camera. Tap again (or wait) and it all folds back into his hand, the
 * blindfold goes back up and the spirit drops.
 */

type Phase = 'idle' | 'cast' | 'bloom' | 'domain' | 'collapse';

interface Star {
  x: number;
  y: number;
  z: number;
}

interface Glyph {
  /** Stream lane: angle around the target, radius offset, speed */
  a: number;
  off: number;
  p: number;
  sp: number;
  ch: string;
  size: number;
}

interface State {
  phase: Phase;
  pt: number;
  t: number;
  lastInput: number;
  /** Spirit slumped after the domain, recovering */
  down: number;
  press: { touched: boolean };
  // camera drift in the void
  dx: number;
  dy: number;
  tdx: number;
  tdy: number;
  rmStage: number;
  shake: number;
  stars: Star[];
  glyphs: Glyph[];
  drone: Hum | null;
  sparkleT: number;
  // layout
  w: number;
  h: number;
  m: number;
  portrait: boolean;
  street: HTMLCanvasElement | null;
  nebula: HTMLCanvasElement | null;
  gx: number;
  gy: number;
  gz: number;
  sx: number;
  sy: number;
  sz: number;
  out: GojoOut;
  sprites: Record<'blue' | 'white' | 'violet', HTMLCanvasElement>;
}

const CAST_LEN = 4.4;
const BLOOM_LEN = 2.4;
const COLLAPSE_LEN = 2.6;
const DOMAIN_MAX = 16;
const DOMAIN_IDLE = 7;

const GLYPHS = '無量空処情報知覚伝達生活01∞∑∂λπΩ≠≈∫√∇';

const VOID_LIGHT: Light = { lx: -0.35, ly: -0.9, rim: '#bfe6ff', rimK: 0.85 };
const STREET_LIGHT: Light = { lx: -0.7, ly: -0.7, rim: '#ff8fd8', rimK: 0.35 };

/* ---------- poses ---------- */

function standPose(t: number): GojoPose {
  return {
    lean: Math.sin(t * 0.7) * 0.008,
    turn: 0.18,
    head: headOpts({ look: 'band', band: 1, up: 1, yaw: 0.22, smirk: 1 }),
    headTilt: -0.02,
    armL: arm(-6, 252, HANDS.relaxed, 0, 1.6, 0, -1, false, true),
    armR: arm(8, 252, HANDS.relaxed, 0, -1.6, 0, 1, false, true),
    legL: leg(34, 372),
    legR: leg(-20, 372),
    flow: Math.sin(t * 0.9) * 0.08,
    light: STREET_LIGHT,
    lw: 1.6,
  };
}

/** Left hand hooks the band; k 0 at the eyes, 1 pulled down to the collar */
function pullPose(t: number, k: number): GojoPose {
  const p = standPose(t);
  p.head.yaw = 0.08;
  p.headTilt = lerp(0.02, -0.05, k);
  // wrist sits just below his face, hand points up across the band
  p.armL = fixed(arm(-26, lerp(-104, -40, k), HANDS.hook, 0, 0.4, 0.4, -1), lerp(-0.7, -0.4, k), true);
  return p;
}

/** The domain sign held up beside his face */
function signPose(t: number): GojoPose {
  const p = standPose(t);
  p.head.yaw = -0.1;
  p.headTilt = 0.03;
  p.armR = fixed(arm(-14, -62, HANDS.cross, 0, 3.0, 0.2, -1), 0.2, true);
  p.armL = arm(-6, 252, HANDS.relaxed, 0, 1.6, 0, -1, false, true);
  return p;
}

/** Floating at ease inside the void */
function floatPose(t: number): GojoPose {
  const p = standPose(t);
  p.turn = 0.25;
  p.lean = -0.04 + Math.sin(t * 0.6) * 0.015;
  p.head = headOpts({ look: 'band', band: 0, up: 0, yaw: 0.3, glow: 1, smirk: 0.7, gazeX: 0.5, wy: -14, wx: 4 });
  p.headTilt = -0.06;
  p.armR = fixed(arm(46, 70, HANDS.cross, 0, 3.0, 0.2, 1), 0.15);
  p.armL = arm(110 + Math.sin(t * 0.8) * 6, 200, HANDS.open, 0.1, 2.7, 0.2, -1);
  p.legL = leg(4 + Math.sin(t * 0.5) * 4, 374, 1, 1);
  p.legR = leg(-6, 366, 1, 1);
  p.flow = -0.5 + Math.sin(t * 1.1) * 0.15;
  p.light = VOID_LIGHT;
  return p;
}

/* ---------- the cursed spirit ---------- */

/**
 * An original cursed spirit: a gaunt, hunched shape of dark flesh in a tattered skirt, a bone
 * mask crowded with eyes and arms long enough to drag. (x, y) is between its feet, s px per
 * unit; it stands about 820 units. frozen 0..1 drowns it in the void, slump folds it over.
 */
function drawSpirit(c: C, x: number, y: number, s: number, t: number, frozen: number, slump: number, light: Light, lw: number) {
  const fz = frozen > 0.5;
  const jit = fz ? Math.sin(t * 70) * 1.5 : 0;
  c.save();
  c.translate(x + jit * s, y);
  c.scale(s, s);
  const ink = '#07050a';
  const base = fz ? '#5d6688' : '#3a2c42';
  const dark = fz ? '#323a5a' : '#1c1422';
  const bone = fz ? '#eaf3ff' : '#e8dfc8';
  const boneSh = fz ? '#a9b8d8' : '#b3a688';
  const L = light;
  const l = lw / s;
  const breathe = fz ? 0 : Math.sin(t * 1.6) * 6;
  c.translate(0, slump * 140);
  c.rotate(-slump * 0.3);
  // tattered lower body
  const skirt = (g: C) => {
    g.moveTo(-120, -380);
    g.quadraticCurveTo(-190, -200, -200, -10);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const px = -200 + (400 * i) / n;
      g.lineTo(px - 18, i % 2 ? -60 : 0);
    }
    g.quadraticCurveTo(190, -200, 120, -380);
    g.closePath();
  };
  shade(c, skirt, base, dark, L, 26, ink, l * 1.6);
  // gaunt torso, hunched forward
  const torso = (g: C) => smooth(g, [-120, -360, -150, -520, -110, -680 + breathe, -10, -790 + breathe, 110, -760 + breathe, 170, -620, 140, -460, 110, -360]);
  shade(c, torso, base, dark, L, 24, ink, l * 1.6);
  // rib ridges
  c.strokeStyle = fz ? 'rgba(200,225,255,0.35)' : 'rgba(150,110,160,0.35)';
  c.lineWidth = l * 3;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    c.moveTo(-90 + i * 6, -600 + i * 48);
    c.quadraticCurveTo(10, -560 + i * 48, 110 - i * 8, -610 + i * 48);
  }
  c.stroke();
  // long arms with kinked elbows and four long fingers
  for (const side of [-1, 1]) {
    const sx = side * 120;
    const sy = -680 + breathe;
    const sway = fz ? 0 : Math.sin(t * 1.2 + side) * 14;
    const ex = side * 250 + sway;
    const ey = -470;
    const hx = side * 230 + sway * 1.5;
    const hy = -110 - slump * 30;
    shade(
      c,
      (g) => {
        g.moveTo(sx - side * 26, sy - 20);
        g.quadraticCurveTo(ex + side * 40, ey - 60, ex + side * 22, ey);
        g.quadraticCurveTo(hx + side * 30, (ey + hy) / 2, hx + side * 16, hy);
        g.lineTo(hx - side * 16, hy + 4);
        g.quadraticCurveTo(hx - side * 10, (ey + hy) / 2, ex - side * 22, ey + 10);
        g.quadraticCurveTo(ex - side * 30, ey - 40, sx - side * 30, sy + 70);
        g.closePath();
      },
      base,
      dark,
      L,
      10,
      ink,
      l * 1.4
    );
    for (let k = 0; k < 4; k++) {
      const fx = hx + side * (k - 1.5) * 13;
      const curl = fz ? 0.2 : 0.5 + Math.sin(t * 2 + k) * 0.1;
      shade(
        c,
        (g) => {
          g.moveTo(fx - 7, hy);
          g.quadraticCurveTo(fx + side * 6, hy + 60, fx + side * 30 * curl, hy + 110);
          g.quadraticCurveTo(fx + side * 2, hy + 56, fx + 7, hy);
          g.closePath();
        },
        base,
        dark,
        L,
        4,
        ink,
        l
      );
    }
  }
  // bone mask, tipped forward, crowded with eyes
  c.save();
  c.translate(-30, -770 + breathe);
  c.rotate(-0.15 + (fz ? 0.12 : Math.sin(t * 0.9) * 0.04));
  shade(c, (g) => smooth(g, [-70, -40, -60, -150, 0, -185, 66, -150, 76, -40, 40, 50, -36, 50]), bone, boneSh, L, 10, ink, l * 1.5);
  const eyes = [
    [-30, -120, 13],
    [22, -128, 15],
    [-40, -78, 11],
    [4, -86, 17],
    [46, -78, 11],
    [-16, -40, 9],
    [28, -40, 9],
  ];
  for (const [ex, ey, er] of eyes) {
    c.fillStyle = '#0a0308';
    c.beginPath();
    c.ellipse(ex, ey, er * 1.2, er, 0, 0, TAU);
    c.fill();
    const glowCol = fz ? '#dff4ff' : '#ff2a3a';
    c.fillStyle = glowCol;
    c.beginPath();
    const pr = fz ? er * 0.75 : er * 0.42;
    c.arc(ex + (fz ? 0 : Math.sin(t * 1.3) * 2), ey, pr, 0, TAU);
    c.fill();
    if (fz) {
      c.fillStyle = '#3a6ac0';
      c.beginPath();
      c.arc(ex + Math.sin(t * 40 + ex) * 1.5, ey, er * 0.12, 0, TAU);
      c.fill();
    }
  }
  // a stitched slit of a mouth, hanging open when frozen
  const open = 4 + frozen * 26;
  c.fillStyle = '#12040a';
  c.beginPath();
  c.moveTo(-30, 10);
  c.quadraticCurveTo(4, 10 + open, 38, 8);
  c.quadraticCurveTo(4, 14, -30, 10);
  c.fill();
  c.strokeStyle = ink;
  c.lineWidth = l * 1.2;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const sx2 = -24 + i * 11;
    c.moveTo(sx2, 2);
    c.lineTo(sx2 + 2, 20 + open * 0.5);
  }
  c.stroke();
  // cracks lit from inside once it is drowning
  if (frozen > 0.01) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = frozen * 0.8;
    c.strokeStyle = '#9fdcff';
    c.lineWidth = l * 2;
    c.beginPath();
    c.moveTo(4, -185);
    c.lineTo(-6, -150);
    c.lineTo(10, -120);
    c.lineTo(0, -95);
    c.moveTo(-60, -150);
    c.lineTo(-40, -110);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
  c.restore();
  c.restore();
}

/* ---------- backdrops ---------- */

function paintStreet(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.street, w, h, dpr);
  s.street = a.cv;
  const c = a.c;
  if (!c) return;
  const hz = h * 0.6;
  const g = c.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#05060f');
  g.addColorStop(1, '#251838');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(31);
  // two rows of towers with lit windows and blank glowing screens
  for (const [row, base, top, col] of [
    [0, hz, 0.1, '#120f22'],
    [1, hz + 4, 0.25, '#0a0816'],
  ] as const) {
    let x = -10;
    while (x < w) {
      const bw = (40 + rnd() * 90) * (s.m / 600);
      const bh = h * (top + rnd() * 0.35);
      c.fillStyle = col;
      c.fillRect(x, base - bh, bw, bh + 4);
      c.fillStyle = row ? 'rgba(255,200,140,0.5)' : 'rgba(160,190,255,0.35)';
      for (let yy = base - bh + 8; yy < base - 6; yy += 9)
        for (let xx = x + 5; xx < x + bw - 5; xx += 8) if (rnd() < 0.3) c.fillRect(xx, yy, 3, 4);
      if (rnd() < 0.35 && bw > 50) {
        const sw = bw * 0.7;
        const sh = sw * 0.55;
        const sx = x + bw * 0.15;
        const sy = base - bh + bh * 0.2;
        const sg = c.createLinearGradient(sx, sy, sx + sw, sy + sh);
        const hue = Math.floor(rnd() * 360);
        sg.addColorStop(0, `hsla(${hue},80%,60%,0.75)`);
        sg.addColorStop(1, `hsla(${(hue + 60) % 360},80%,45%,0.75)`);
        c.fillStyle = sg;
        c.fillRect(sx, sy, sw, sh);
      }
      x += bw + 2;
    }
  }
  // the crossing: asphalt and zebra stripes in perspective
  const rg = c.createLinearGradient(0, hz, 0, h);
  rg.addColorStop(0, '#1b1426');
  rg.addColorStop(1, '#09070d');
  c.fillStyle = rg;
  c.fillRect(0, hz, w, h - hz);
  c.fillStyle = 'rgba(220,215,235,0.18)';
  const vx = w * 0.5;
  for (let i = -14; i <= 14; i++) {
    const x0 = vx + i * w * 0.07;
    const x1 = vx + i * w * 0.07 + w * 0.035;
    c.beginPath();
    c.moveTo(lerp(vx, x0, 0.25), hz + (h - hz) * 0.25);
    c.lineTo(lerp(vx, x1, 0.25), hz + (h - hz) * 0.25);
    c.lineTo(lerp(vx, x1, 0.55) , hz + (h - hz) * 0.55);
    c.lineTo(lerp(vx, x0, 0.55), hz + (h - hz) * 0.55);
    c.closePath();
    c.fill();
  }
  // wet street reflections
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w;
    const y = hz + rnd() * (h - hz);
    const rr = s.m * (0.02 + rnd() * 0.05);
    const gg = c.createRadialGradient(x, y, 0, x, y, rr);
    gg.addColorStop(0, `hsla(${Math.floor(rnd() * 360)},80%,65%,0.16)`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg;
    c.fillRect(x - rr, y - rr * 0.4, rr * 2, rr * 0.8);
  }
}

function paintNebula(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.nebula, w * 1.3, h * 1.3, dpr);
  s.nebula = a.cv;
  const c = a.c;
  if (!c) return;
  const W = w * 1.3;
  const H = h * 1.3;
  c.fillStyle = '#010208';
  c.fillRect(0, 0, W, H);
  const rnd = mulberry(12);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = Math.max(W, H) * (0.2 + rnd() * 0.35);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() < 0.5 ? '70,110,255' : rnd() < 0.5 ? '140,70,255' : '40,200,255';
    g.addColorStop(0, `rgba(${col},${0.12 + rnd() * 0.1})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < (W * H) / 900; i++) {
    c.globalAlpha = 0.2 + rnd() * 0.8;
    c.fillStyle = rnd() < 0.2 ? '#bfe0ff' : '#ffffff';
    const r = rnd() < 0.05 ? 1.6 : 0.7;
    c.fillRect(rnd() * W, rnd() * H, r, r);
  }
  c.globalAlpha = 1;
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.w = w;
  s.h = h;
  s.m = Math.min(w, h);
  s.portrait = h > w * 1.1;
  // Gojo and the spirit on the street, rig units -> px
  s.gz = s.portrait ? Math.min(w / 560, h / 1250) : h / 1000;
  s.gx = w * (s.portrait ? 0.33 : 0.33);
  s.gy = h * (s.portrait ? 0.86 : 0.97);
  s.sz = s.gz * (s.portrait ? 0.5 : 0.72);
  s.sx = w * (s.portrait ? 0.78 : 0.74);
  s.sy = h * (s.portrait ? 0.66 : 0.9);
  paintStreet(s, env);
  paintNebula(s, env);
}

/* ---------- audio ---------- */

function chord(bus: AudioBus, notes: number[], gain: number, decay: number, delay = 0) {
  for (const f of notes) tone(bus, f, { type: 'sine', attack: 0.6, decay, gain, delay });
}

function startDrone(s: State, env: SceneEnv) {
  const bus = env.audio();
  if (!bus || s.drone) return;
  s.drone = startHum(bus, { type: 'triangle', freq: 55, cutoff: 500, noiseAmt: 0.12 });
  setHum(s.drone, 55, 0.12, 600);
}

function stopDrone(s: State) {
  stopHum(s.drone);
  s.drone = null;
}

/* ---------- void pieces ---------- */

function voidCenter(s: State): [number, number] {
  return [s.w * (s.portrait ? 0.5 : 0.6) - s.dx * s.m * 0.05, s.h * (s.portrait ? 0.34 : 0.42) - s.dy * s.m * 0.05];
}

function drawVoid(c: C, s: State, env: SceneEnv, t: number, k: number) {
  const { w, h } = env;
  const m = s.m;
  const rm = env.reducedMotion;
  if (s.nebula) c.drawImage(s.nebula, -w * 0.15 - s.dx * m * 0.08, -h * 0.15 - s.dy * m * 0.08, w * 1.3, h * 1.3);
  const [cx, cy] = voidCenter(s);
  // star tunnel rushing out of the ring
  c.save();
  c.globalCompositeOperation = 'lighter';
  const f = m * 0.5;
  for (const st of s.stars) {
    const z1 = st.z;
    const z0 = st.z + (rm ? 0 : 0.18);
    const x1 = cx + (st.x / z1) * f;
    const y1 = cy + (st.y / z1) * f;
    const x0 = cx + (st.x / z0) * f;
    const y0 = cy + (st.y / z0) * f;
    const a = clamp(1.3 - z1 / 4, 0, 1) * k;
    if (a <= 0.02) continue;
    c.strokeStyle = `rgba(200,230,255,${a})`;
    c.lineWidth = Math.max(0.6, 2.2 / z1);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1 + (rm ? 1 : 0), y1);
    c.stroke();
  }
  c.restore();
  // the event horizon: a black disc rimmed with light, an accretion band across its face
  const R = m * (s.portrait ? 0.3 : 0.36);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = k;
  c.drawImage(s.sprites.blue, cx - R * 2.2, cy - R * 2.2, R * 4.4, R * 4.4);
  c.restore();
  // lensed back of the disk arcing over the top
  c.save();
  c.globalAlpha = k;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(190,225,255,0.55)';
  c.lineWidth = R * 0.06;
  c.beginPath();
  c.ellipse(cx, cy, R * 1.08, R * 1.08, 0, Math.PI * 1.05, Math.PI * 1.95);
  c.stroke();
  c.fillStyle = '#000000';
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.fill();
  const rg = c.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.12);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.5, 'rgba(140,200,255,0.6)');
  rg.addColorStop(1, 'rgba(60,120,255,0)');
  c.fillStyle = rg;
  c.beginPath();
  c.arc(cx, cy, R * 1.12, 0, TAU);
  c.arc(cx, cy, R * 0.96, 0, TAU, true);
  c.fill();
  // accretion band in front, tilted, brighter on the side spinning toward us
  c.translate(cx, cy);
  c.rotate(-0.18);
  const bg = c.createLinearGradient(-R * 2, 0, R * 2, 0);
  bg.addColorStop(0, 'rgba(120,170,255,0)');
  bg.addColorStop(0.3, 'rgba(170,215,255,0.7)');
  bg.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  bg.addColorStop(0.8, 'rgba(150,200,255,0.6)');
  bg.addColorStop(1, 'rgba(120,170,255,0)');
  c.strokeStyle = bg;
  c.lineWidth = R * 0.07;
  c.beginPath();
  c.ellipse(0, 0, R * 1.9, R * 0.26, 0, 0, Math.PI);
  c.stroke();
  c.globalAlpha = k * 0.4;
  c.lineWidth = R * 0.18;
  c.beginPath();
  c.ellipse(0, 0, R * 1.9, R * 0.26, 0, 0, Math.PI);
  c.stroke();
  // glints running round the ring
  c.globalAlpha = k;
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const a = t * 0.6 + (i * TAU) / 6;
    c.beginPath();
    c.arc(Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, Math.max(1, R * 0.012), 0, TAU);
    c.fill();
  }
  c.restore();
}

/** Rivers of text and light pouring into the spirit's head */
function drawStreams(c: C, s: State, t: number, k: number, tx: number, ty: number) {
  if (k <= 0.01) return;
  const m = s.m;
  const reach = Math.hypot(s.w, s.h);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const g of s.glyphs) {
    const q = (g.p + t * g.sp) % 1;
    const r = (1 - q) * reach * 0.9 + 6;
    const a = g.a + (1 - q) * 0.9;
    const x = tx + Math.cos(a) * r + Math.sin(a * 3 + t) * g.off * m * 0.04;
    const y = ty + Math.sin(a) * r * 0.75;
    const alpha = clamp(q * 3, 0, 1) * clamp((1 - q) * 6, 0, 1) * k;
    if (alpha < 0.03) continue;
    c.globalAlpha = alpha * 0.85;
    c.fillStyle = g.size > 1.2 ? '#e8f6ff' : '#8fd2ff';
    c.font = `${Math.round(m * 0.018 * g.size + 6)}px ui-monospace, Menlo, monospace`;
    c.fillText(g.ch, x, y);
  }
  // bright filaments converging
  c.globalAlpha = 0.35 * k;
  c.strokeStyle = '#9fdcff';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + t * 0.15;
    const r0 = reach * 0.7;
    c.moveTo(tx + Math.cos(a) * r0, ty + Math.sin(a) * r0 * 0.7);
    c.quadraticCurveTo(tx + Math.cos(a + 0.6) * r0 * 0.4, ty + Math.sin(a + 0.6) * r0 * 0.3, tx, ty);
  }
  c.stroke();
  c.restore();
}

/* ---------- scene ---------- */

function begin(s: State, env: SceneEnv) {
  s.phase = 'cast';
  s.pt = 0;
  s.lastInput = s.t;
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.18, freq: 900, q: 0.6 });
    tone(bus, 110, { type: 'sine', attack: 0.2, decay: 1.4, gain: 0.12 });
  }
}

function startCollapse(s: State, env: SceneEnv) {
  s.phase = 'collapse';
  s.pt = 0;
  stopDrone(s);
  const bus = env.audio();
  if (bus) {
    for (let i = 0; i < 5; i++) noise(bus, { duration: 0.25, gain: 0.12, freq: 3000 + i * 900, q: 0.8, type: 'highpass' });
    tone(bus, 880, { type: 'triangle', attack: 0.005, decay: 0.8, gain: 0.08, glideTo: 110 });
    tone(bus, 55, { type: 'sine', attack: 0.01, decay: 1.2, gain: 0.4, glideTo: 30 });
  }
}

function setStage(s: State, env: SceneEnv, stage: number) {
  s.rmStage = stage % 2;
  if (s.rmStage === 1) {
    s.phase = 'domain';
    s.pt = 3;
    const bus = env.audio();
    if (bus) chord(bus, [110, 165, 220, 330], 0.07, 2.4);
  } else {
    s.phase = 'idle';
    s.pt = 0;
    s.down = 1;
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 1,
    init: (env) => {
      const rnd = mulberry(3);
      const stars: Star[] = [];
      for (let i = 0; i < 260; i++) stars.push({ x: (rnd() * 2 - 1) * 3, y: (rnd() * 2 - 1) * 2, z: 0.2 + rnd() * 4 });
      const glyphs: Glyph[] = [];
      for (let i = 0; i < 150; i++)
        glyphs.push({ a: rnd() * TAU, off: rnd() * 2 - 1, p: rnd(), sp: 0.18 + rnd() * 0.3, ch: GLYPHS[Math.floor(rnd() * GLYPHS.length)], size: 0.6 + rnd() * 1.2 });
      const s: State = {
        phase: 'idle',
        pt: 0,
        t: 0,
        lastInput: 0,
        down: 0,
        press: { touched: false },
        dx: 0,
        dy: 0,
        tdx: 0,
        tdy: 0,
        rmStage: 0,
        shake: 0,
        stars,
        glyphs,
        drone: null,
        sparkleT: 0,
        w: 0,
        h: 0,
        m: 1,
        portrait: false,
        street: null,
        nebula: null,
        gx: 0,
        gy: 0,
        gz: 1,
        sx: 0,
        sy: 0,
        sz: 1,
        out: makeOut(),
        sprites: {
          blue: glowSprite(128, [
            [0, 'rgba(160,215,255,0.55)'],
            [0.45, 'rgba(70,130,255,0.22)'],
            [1, 'rgba(20,40,160,0)'],
          ]),
          white: glowSprite(64, [
            [0, 'rgba(255,255,255,1)'],
            [1, 'rgba(255,255,255,0)'],
          ]),
          violet: glowSprite(64, [
            [0, 'rgba(200,170,255,0.8)'],
            [1, 'rgba(120,60,255,0)'],
          ]),
        },
      };
      // still frames show the domain itself
      if (!env.interactive || env.reducedMotion) {
        s.phase = 'domain';
        s.pt = 3;
        s.rmStage = 1;
      }
      return s;
    },
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      s.t = t;
      if (env.reducedMotion) {
        s.dx = s.tdx;
        s.dy = s.tdy;
        return;
      }
      s.pt += dt;
      s.shake = Math.max(0, s.shake - dt * 1.5);
      s.dx += (s.tdx - s.dx) * (1 - Math.exp(-dt * 2.5));
      s.dy += (s.tdy - s.dy) * (1 - Math.exp(-dt * 2.5));
      if (env.reducedMotion) return;
      for (const st of s.stars) {
        st.z -= dt * (s.phase === 'domain' ? 0.5 : 0.25);
        if (st.z < 0.15) {
          st.z = 4;
          st.x = rand(-3, 3);
          st.y = rand(-2, 2);
        }
      }
      if (s.phase === 'idle') s.down = Math.max(0, s.down - dt * 0.25);
      const bus = env.audio();
      if (s.phase === 'cast') {
        const p = s.pt;
        if (bus) {
          const cue = (at: number) => p - dt < at && p >= at;
          if (cue(1.15)) tone(bus, 1760, { type: 'sine', attack: 0.01, decay: 0.9, gain: 0.06, glideTo: 2200 });
          if (cue(1.9)) {
            noise(bus, { duration: 0.2, gain: 0.25, freq: 5000, q: 0.5, type: 'highpass' });
            tone(bus, 60, { type: 'sine', attack: 0.005, decay: 0.7, gain: 0.35, glideTo: 40 });
          }
          if (cue(2.6)) tone(bus, 220, { type: 'sine', attack: 1.2, decay: 1.4, gain: 0.07, glideTo: 440 });
        }
        if (p >= CAST_LEN) {
          s.phase = 'bloom';
          s.pt = 0;
          s.shake = 0.6;
          if (bus) {
            tone(bus, 40, { type: 'sine', attack: 0.01, decay: 2.5, gain: 0.55, glideTo: 28 });
            noise(bus, { duration: 2, gain: 0.3, freq: 300, q: 0.5, type: 'lowpass' });
            chord(bus, [110, 165, 220, 330], 0.06, 3, 0.4);
          }
        }
      } else if (s.phase === 'bloom') {
        if (s.pt >= BLOOM_LEN) {
          s.phase = 'domain';
          s.pt = 0;
          s.lastInput = t;
          startDrone(s, env);
        }
      } else if (s.phase === 'domain') {
        if (env.interactive && (t - s.lastInput > DOMAIN_IDLE || s.pt > DOMAIN_MAX)) startCollapse(s, env);
        if (s.drone) setHum(s.drone, 55 + Math.sin(t * 0.3) * 3, 0.1, 500 + Math.sin(t * 0.7) * 200);
        s.sparkleT -= dt;
        if (bus && s.sparkleT <= 0) {
          s.sparkleT = rand(0.12, 0.4);
          const pent = [880, 990, 1175, 1320, 1480, 1760, 1980];
          tone(bus, pent[Math.floor(Math.random() * pent.length)], { type: 'sine', attack: 0.005, decay: 0.5, gain: 0.025 });
        }
      } else if (s.phase === 'collapse') {
        if (s.pt >= COLLAPSE_LEN) {
          s.phase = 'idle';
          s.pt = 0;
          s.down = 1;
        }
      }
    },
    draw: (s, env, t) => {
      const c = env.ctx;
      const { w, h } = env;
      const m = s.m;
      const phase = s.phase;
      const pt = s.pt;
      let bars = 0;
      let sub = '';
      let subA = 0;
      let impact = 0;
      c.save();
      c.translate(shakeX(s.shake * m * 0.015, t), shakeY(s.shake * m * 0.015, t));

      const street = (pose: GojoPose, frozen = 0) => {
        if (s.street) c.drawImage(s.street, 0, 0, w, h);
        drawSpirit(c, s.sx, s.sy, s.sz, t, frozen, s.down, { lx: -0.7, ly: -0.7, rim: '#ff9de0', rimK: 0.3 }, 1.6);
        c.save();
        applyCam(c, cam(0, 0, s.gz), s.gx, s.gy);
        pose.lw = inkPx(s.gz) / s.gz;
        pose.head.t = t;
        drawGojo(c, 0, 0, 1, pose, s.out);
        c.restore();
      };
      // a close up on Gojo against a dark, out of focus street
      const closeUp = (pose: GojoPose, k: Cam, speed: number, tint: string) => {
        if (s.street) {
          c.drawImage(s.street, -w * 0.25, -h * 0.25, w * 1.5, h * 1.5);
        }
        c.fillStyle = 'rgba(4,4,14,0.55)';
        c.fillRect(0, 0, w, h);
        if (tint) {
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.14;
          c.fillStyle = tint;
          c.fillRect(0, 0, w, h);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
        }
        speedLines(c, w, h, w / 2, h / 2, m * 0.45, 60, 'rgba(220,235,255,0.9)', speed * 0.3, t);
        c.save();
        applyCam(c, k, w / 2, h / 2);
        pose.lw = inkPx(k.z) / k.z;
        pose.head.t = t;
        drawGojo(c, 0, 0, 1, pose, s.out);
        c.restore();
      };

      if (phase === 'idle') {
        const p = standPose(t);
        p.head.smirk = s.down > 0.3 ? 1 : 0.7;
        street(p);
      } else if (phase === 'cast') {
        bars = 1;
        const faceZ = Math.min(h / 125, w / 160);
        if (pt < 1.15) {
          // a finger hooks the blindfold and drags it down; the hair falls
          const k = easeInOutCubic(clamp((pt - 0.2) / 0.8, 0, 1));
          const p = pullPose(t, k);
          p.head.band = 1 - k;
          p.head.up = 1 - easeOutCubic(clamp((pt - 0.35) / 0.7, 0, 1));
          p.head.open = clamp((pt - 0.75) / 0.3, 0, 1);
          p.head.glow = p.head.open * 0.8;
          p.light = { lx: -0.5, ly: -0.85, rim: '#9ed2ff', rimK: 0.5 };
          const ch = { x: 4, y: -760 };
          closeUp(p, mixCam(cam(ch.x, ch.y, faceZ * 0.95, 0.04), cam(ch.x, ch.y + 6, faceZ * 1.08, 0.02), pt / 1.15), 0, '');
        } else if (pt < 1.9) {
          // extreme close up: the Six Eyes
          const p = pullPose(t, 1);
          p.head.band = 0;
          p.head.up = 0;
          p.head.glow = 1;
          p.head.yaw = 0.08;
          p.armL = arm(-6, 252, HANDS.relaxed, 0, 1.6, 0, -1, false, true);
          p.light = { lx: -0.5, ly: -0.85, rim: '#9ed2ff', rimK: 0.5 };
          const k = (pt - 1.15) / 0.75;
          // his left eye, in rig units: chin (~ x 4, -720) plus the eye offset
          const ex = 4 + 15.5;
          const ey = -720 - 46;
          closeUp(p, mixCam(cam(ex, ey, m / 46, -0.03), cam(ex, ey, m / 38, -0.05), k), 0.2, '#3aa0ff');
        } else {
          // the hand sign, and the name of the domain
          const k = clamp((pt - 1.9) / 2.5, 0, 1);
          const p = signPose(t);
          p.head.band = 0;
          p.head.up = 0;
          p.head.glow = 1;
          p.light = { lx: 0.3, ly: -0.95, rim: '#bfe6ff', rimK: 0.9 };
          closeUp(p, mixCam(cam(-40, -740, m / 230, -0.1), cam(-40, -745, m / 190, -0.13), easeOutCubic(k)), 0.4 + k * 0.4, '#5a7bff');
          sub = 'Domain Expansion.';
          subA = clamp((pt - 2.2) * 3, 0, 1) * clamp((CAST_LEN - pt) * 4, 0, 1);
          if (pt > 1.9 && pt < 2.0) impact = 1;
        }
      } else if (phase === 'bloom') {
        // the void swells out of him and eats the street
        const p = signPose(t);
        p.head.band = 0;
        p.head.up = 0;
        p.head.glow = 1;
        p.armR = fixed(arm(-14, -62, HANDS.cross, 0, 3.0, 0.2, -1), 0.2, true);
        const k = easeInOutCubic(clamp(pt / 1.3, 0, 1));
        street(p);
        const [ox, oy] = camToScreen(cam(0, 0, s.gz), s.gx, s.gy, s.out.rtx, s.out.rty);
        const r = k * Math.hypot(w, h) * 1.1;
        if (r > 1) {
          c.save();
          c.beginPath();
          c.arc(ox, oy, r, 0, TAU);
          c.clip();
          drawVoid(c, s, env, t, clamp(k * 1.5 - 0.3, 0, 1));
          c.restore();
          // the bright skin of the bubble
          c.strokeStyle = 'rgba(255,255,255,0.95)';
          c.lineWidth = m * 0.012 * (1 - k) + 1.5;
          c.beginPath();
          c.arc(ox, oy, r, 0, TAU);
          c.stroke();
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = 'rgba(120,190,255,0.5)';
          c.lineWidth = m * 0.05 * (1 - k);
          c.stroke();
          c.restore();
        }
        if (pt < 0.12) impact = 1;
        // with the whole frame swallowed, the name stands on its own
        if (pt > 1.1) {
          c.fillStyle = `rgba(0,0,0,${clamp((pt - 1.1) * 2.5, 0, 0.75) * clamp((BLOOM_LEN - pt) * 3, 0, 1)})`;
          c.fillRect(0, 0, w, h);
          const a = clamp((pt - 1.2) * 3, 0, 1) * clamp((BLOOM_LEN - pt) * 4, 0, 1);
          techTitle(c, w / 2, h * 0.46, clamp(m * 0.15, 26, 110), '無量空処', 'Unlimited Void', a, '#7cc8ff', (1 - a) * 0.5);
        }
      } else if (phase === 'domain' || phase === 'collapse') {
        let k = 1;
        let shrink = 1;
        if (phase === 'collapse') {
          shrink = 1 - easeInOutCubic(clamp(pt / 0.9, 0, 1));
          k = 1;
        }
        const enter = phase === 'domain' ? easeOutCubic(clamp(pt / 1.2, 0, 1)) : 1;
        // void interior
        const drawInterior = () => {
          drawVoid(c, s, env, t, k);
          // the spirit, small and far, frozen with the river pouring in
          const sz = s.portrait ? Math.min(w / 1500, (h * 0.26) / 820) : (h * 0.33) / 820;
          const spx = w * (s.portrait ? 0.76 : 0.78) - s.dx * m * 0.12;
          const spy = h * (s.portrait ? 0.5 : 0.74) - s.dy * m * 0.12 + Math.sin(t * 0.5) * m * 0.006;
          drawStreams(c, s, t, k * enter, spx - 30 * sz, spy - 870 * sz);
          drawSpirit(c, spx, spy, sz, t, 1, 0, { lx: -0.5, ly: -0.8, rim: '#bfe6ff', rimK: 0.6 }, 1.4);
          // Gojo floating serenely in front of the ring
          const p = floatPose(t);
          const gz = s.portrait ? Math.min(w / 520, (h * 0.55) / 880) : (h * 0.7) / 880;
          const gx = w * (s.portrait ? 0.36 : 0.27) - s.dx * m * 0.2;
          const gy = h * (s.portrait ? 0.88 : 0.86) - s.dy * m * 0.2 + Math.sin(t * 0.8) * m * 0.01;
          c.save();
          c.globalCompositeOperation = 'lighter';
          const [hx, hy] = [gx, gy - 600 * gz];
          c.globalAlpha = 0.5;
          c.drawImage(s.sprites.blue, hx - 500 * gz, hy - 500 * gz, 1000 * gz, 1000 * gz);
          c.restore();
          c.save();
          applyCam(c, cam(0, 0, gz), gx, gy);
          p.lw = inkPx(gz) / gz;
          p.head.t = t;
          drawGojo(c, 0, 0, 1, p, s.out);
          c.restore();
        };
        if (phase === 'domain') {
          drawInterior();
          bars = 1;
          if (pt < 0.3) {
            c.fillStyle = `rgba(255,255,255,${0.7 * (1 - pt / 0.3)})`;
            c.fillRect(0, 0, w, h);
          }
        } else {
          // collapse: the void falls back into his hand, then the blindfold goes back up
          if (pt < 0.95) {
            const p = signPose(t);
            p.head.band = 0;
            p.head.up = 0;
            p.head.glow = 1;
            street(p, 1);
            const [ox, oy] = camToScreen(cam(0, 0, s.gz), s.gx, s.gy, s.out.rtx, s.out.rty);
            const r = shrink * Math.hypot(w, h) * 1.1;
            if (r > 1) {
              c.save();
              c.beginPath();
              c.arc(ox, oy, r, 0, TAU);
              c.clip();
              drawInterior();
              c.restore();
              c.strokeStyle = 'rgba(255,255,255,0.9)';
              c.lineWidth = 2;
              c.beginPath();
              c.arc(ox, oy, r, 0, TAU);
              c.stroke();
            }
            if (pt > 0.85) impact = 1;
          } else {
            bars = 1;
            const k2 = easeInOutCubic(clamp((pt - 1.05) / 1.1, 0, 1));
            const p = pullPose(t, 1 - k2);
            p.head.band = k2;
            p.head.up = k2;
            p.head.open = 1 - clamp(k2 * 2, 0, 1);
            p.head.glow = 1 - k2;
            p.head.smirk = 1;
            p.light = { lx: -0.5, ly: -0.85, rim: '#9ed2ff', rimK: 0.4 };
            const faceZ = Math.min(h / 125, w / 160);
            closeUp(p, cam(4, -754, faceZ, -0.03), 0, '');
            sub = pt > 1.4 ? 'Relax. It only felt like forever.' : '';
            subA = clamp((pt - 1.4) * 3, 0, 1) * clamp((COLLAPSE_LEN - pt) * 4, 0, 1);
          }
        }
      }
      c.restore();

      if (impact > 0) impactFrame(c, w, h, impact, '#d8ecff');
      // vignette
      const vg = c.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,10,0.5)');
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);
      letterbox(c, w, h, bars);
      subtitle(c, w, h, sub, subA);
      if (phase === 'idle' && env.interactive && !s.press.touched) {
        const k = 0.45 + Math.sin(t * 3) * 0.2;
        c.save();
        c.globalAlpha = k;
        c.font = `600 ${Math.round(clamp(m * 0.03, 10, 15))}px ui-sans-serif, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillStyle = '#d8e8ff';
        c.fillText('Tap to expand the domain', w / 2, h * 0.07);
        c.restore();
      }
    },
    onPointerDown: (s, env) => {
      s.press.touched = true;
      s.lastInput = s.t;
      if (env.reducedMotion) {
        setStage(s, env, s.rmStage + 1);
        return;
      }
      if (s.phase === 'idle') begin(s, env);
      else if (s.phase === 'domain' && s.pt > 1.2) startCollapse(s, env);
    },
    onPointerMove: (s, env, x, y) => {
      s.lastInput = s.t;
      s.tdx = clamp((x / env.w) * 2 - 1, -1, 1);
      s.tdy = clamp((y / env.h) * 2 - 1, -1, 1);
      if (env.reducedMotion) {
        s.dx = s.tdx;
        s.dy = s.tdy;
      }
    },
    onPointerLeave: (s) => {
      s.tdx = 0;
      s.tdy = 0;
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (!down || e.repeat) return true;
      s.press.touched = true;
      s.lastInput = s.t;
      if (env.reducedMotion) setStage(s, env, s.rmStage + 1);
      else if (s.phase === 'idle') begin(s, env);
      else if (s.phase === 'domain' && s.pt > 1.2) startCollapse(s, env);
      return true;
    },
    dispose: (s) => {
      stopDrone(s);
      freeCanvas(s.street, s.nebula);
    },
  });
