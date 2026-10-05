import { createCanvasScene, clamp, damp, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
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
  smooth,
  startHum,
  stopHum,
  toStageX,
  toStageY,
  vignette,
} from './games-kit';
import type { Hum, Stage } from './games-kit';
import { chiefFigure, drawRing, FSH, HEAD, newArm, NSH, PELVIS, reach } from './halo-kit';
import type { Arm, ChiefPose, RingShape } from './halo-kit';

/**
 * Master Chief and Cortana in a Forerunner control room, the ring itself filling the great
 * window behind them. Cortana stands on the holo pedestal, a slender blue-violet hologram
 * traced with circuitry, and follows the pointer with her eyes. Hold to have her raise a
 * hand and throw up a holographic map of the ring; the Chief looks up at it. Tap and he
 * steps to the console, pulls her chip (she streams into it as light) and slots it into
 * the back of his helmet; tap again and he puts her back.
 */

/* ---------- constants ---------- */

/** Floor line in stage units */
const FLOOR = -36;
const CH = 1.18;
const CHIEF_HOME = -250;
const CHIEF_NEAR = -132;
/** Pedestal, her feet, and the console with the chip slot */
const PED_X = 150;
const PED_TOP = FLOOR - 52;
const SLOT = [-14, -330] as const;
/** Cortana's design height, and her frame in stage units */
const CORT_H = 420;
const CS = 1.06;
const TAP = 0.22;
const MOTES = 90;
/** Where the ring map hangs */
const MAP = [-20, -690] as const;

const RING: RingShape = { cx: 30, cy: -250, rx: 760, ry: 560, rot: -0.1 };

type Phase = 'holo' | 'toChief' | 'inside' | 'toConsole';

interface State {
  st: Stage;
  bg: HTMLCanvasElement;
  holo: HTMLCanvasElement;
  circuit: HTMLCanvasElement;
  paint: Painter | null;
  motes: Pool;
  phase: Phase;
  pt: number;
  /** Cortana's presence on the pedestal, 0 to 1 */
  vis: number;
  /** The chip carries her */
  charge: number;
  chipIn: boolean;
  flash: number;
  slotFlash: number;
  // the Chief
  cx: number;
  walkPh: number;
  front: Arm;
  back: Arm;
  look: number;
  nod: number;
  lean: number;
  // Cortana
  gx: number;
  gy: number;
  tgx: number;
  tgy: number;
  gesture: number;
  talk: number;
  blink: number;
  map: number;
  mapSpin: number;
  // input
  pressing: boolean;
  keyDown: boolean;
  pressT: number;
  mapping: boolean;
  hum: Hum | null;
  chipX: number;
  chipY: number;
  touched: boolean;
  demoT: number;
  time: number;
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 3.2,
    init: (env) => ({
      st: makeStage(),
      bg: makeLayer(),
      holo: document.createElement('canvas'),
      circuit: makeCircuit(),
      paint: new Painter(env.ctx),
      motes: new Pool(MOTES),
      phase: 'holo',
      pt: 0,
      vis: 1,
      charge: 0,
      chipIn: false,
      flash: 0,
      slotFlash: 0,
      cx: CHIEF_HOME,
      walkPh: 0,
      front: newArm(1.4, 1.5),
      back: newArm(1.6, 1.5),
      look: 0.05,
      nod: 0,
      lean: 0.03,
      gx: -0.7,
      gy: 0.1,
      tgx: -0.7,
      tgy: 0.1,
      gesture: 0,
      talk: 0,
      blink: 0,
      map: 0,
      mapSpin: 0,
      pressing: false,
      keyDown: false,
      pressT: 0,
      mapping: false,
      hum: null,
      chipX: SLOT[0],
      chipY: SLOT[1],
      touched: false,
      demoT: 0,
      time: 0,
    }),
    resize: (s, env) => {
      fitStage(s.st, env.w, env.h);
      const c = prepLayer(s.bg, env.w, env.h, env.dpr, s.st);
      if (c) renderBackdrop(c, s.st);
    },
    update: (s, env, dt, t) => {
      s.time = t;
      if (!s.touched) runDemo(s, dt);
      if (s.pressing || s.keyDown) {
        s.pressT += dt;
        if (s.pressT > TAP && !s.mapping) startMap(s, env);
        if (env.reducedMotion) env.wake(300);
      }
      if (env.reducedMotion && s.touched && (s.phase === 'toChief' || s.phase === 'toConsole' || s.map > 0.02)) env.wake(300);
      step(s, env, dt);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const p = s.paint;
      if (!p) return;
      p.ctx = ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b0a1e';
      ctx.fillRect(0, 0, w, h);
      drawLayer(ctx, s.bg, w, h);
      ctx.save();
      enterStage(ctx, s.st);
      drawRoomLight(ctx, s, t);
      drawConsole(ctx, s, t);
      drawPedestal(ctx, s, t);
      drawCortana(ctx, s, env, t);
      drawChief(p, s, t);
      drawChip(ctx, s, t);
      drawStream(ctx, s, t);
      drawMap(ctx, s, t);
      drawMotes(ctx, s);
      ctx.restore();
      vignette(ctx, w, h, 0.6, '4,4,18');
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.pressing = true;
      s.pressT = 0;
      aimGaze(s, x, y);
      env.wake(3200);
    },
    onPointerMove: (s, env, x, y) => {
      aimGaze(s, x, y);
      env.wake(500);
    },
    onPointerLeave: (s) => {
      s.tgx = -0.7;
      s.tgy = 0.1;
    },
    onPointerUp: (s, env) => {
      if (!s.pressing) return;
      s.pressing = false;
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      s.touched = true;
      if (down) {
        if (!e.repeat && !s.keyDown) {
          s.keyDown = true;
          s.pressT = 0;
          env.wake(3200);
        }
      } else if (s.keyDown) {
        s.keyDown = false;
        release(s, env);
        env.wake(3200);
      }
      return true;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
      freeLayer(s.bg);
      freeLayer(s.holo);
      freeLayer(s.circuit);
      s.paint = null;
    },
  });

/* ---------- input ---------- */

function aimGaze(s: State, x: number, y: number) {
  const sx = toStageX(s.st, x);
  const sy = toStageY(s.st, y);
  const hy = PED_TOP - 388 * CS;
  s.tgx = clamp((sx - PED_X) / 320, -1, 1);
  s.tgy = clamp((sy - hy) / 360, -1, 1);
}

function release(s: State, env: SceneEnv) {
  if (s.pressing || s.keyDown) return;
  if (s.mapping) stopMap(s);
  else if (s.pressT <= TAP + 0.001) toggle(s, env);
  s.pressT = 0;
}

function toggle(s: State, env: SceneEnv) {
  if (s.phase === 'holo') {
    s.phase = 'toChief';
    s.pt = 0;
  } else if (s.phase === 'inside') {
    s.phase = 'toConsole';
    s.pt = 0;
  } else return;
  const bus = env.audio();
  if (bus) noise(bus, { duration: 0.2, gain: 0.04, freq: 500, q: 0.6, type: 'lowpass' });
}

function startMap(s: State, env: SceneEnv) {
  if (s.phase !== 'holo' && s.phase !== 'inside') return;
  s.mapping = true;
  s.talk = Math.max(s.talk, 1.4);
  const bus = env.audio();
  if (bus) {
    [523, 659, 784].forEach((f, i) => tone(bus, f, { type: 'sine', attack: 0.01, decay: 0.4, gain: 0.03, delay: i * 0.07 }));
    if (!s.hum) s.hum = startHum(bus, { type: 'sine', freq: 196, ratio: 1.5, noise: 0.03, filter: 1300, q: 3, gain: 0.025, attack: 0.3 });
  }
}

function stopMap(s: State) {
  s.mapping = false;
  if (s.hum) {
    stopHum(s.hum, 0.3);
    s.hum = null;
  }
}

/** Previews and first visit: the map, the chip into his helmet, and back */
function runDemo(s: State, dt: number) {
  const prev = s.demoT;
  s.demoT += dt;
  const T = s.demoT % 14;
  const P = prev % 14;
  s.mapping = T > 0.6 && T < 4.2;
  if (P < 4.8 && T >= 4.8 && s.phase === 'holo') {
    s.phase = 'toChief';
    s.pt = 0;
  }
  if (P < 10 && T >= 10 && s.phase === 'inside') {
    s.phase = 'toConsole';
    s.pt = 0;
  }
}

/* ---------- simulation ---------- */

/** Stage point to the Chief's torso frame for his current pose */
function toTorso(s: State, wx: number, wy: number, crouch: number) {
  const dx = (wx - s.cx) / CH;
  const dy = (wy - FLOOR) / CH + PELVIS - crouch;
  const c = Math.cos(s.lean);
  const sn = Math.sin(s.lean);
  return [dx * c + dy * sn, -dx * sn + dy * c] as const;
}

function fromTorso(s: State, tx: number, ty: number, crouch: number) {
  const c = Math.cos(s.lean);
  const sn = Math.sin(s.lean);
  const x = tx * c - ty * sn;
  const y = tx * sn + ty * c;
  return [s.cx + x * CH, FLOOR + (y - PELVIS + crouch) * CH] as const;
}

const NAPE = [-20, -206] as const;
const HANG_N = [-10, -26] as const;
const HANG_F = [64, -28] as const;
const HOLD = [70, -96] as const;

function step(s: State, env: SceneEnv, dt: number) {
  const t = s.time;
  s.pt += dt;
  const T = s.pt;
  const bus = env.audio();
  // hand target in the torso frame and whether the elbow rides high
  let hand: readonly [number, number] = HANG_N;
  let bend = -1;
  let cxT = CHIEF_HOME;
  let lookT = 0.06;
  let leanT = 0.03;
  const slotT = toTorso(s, SLOT[0] - 8, SLOT[1] + 4, 0);

  switch (s.phase) {
    case 'toChief': {
      // step in, take the chip, she pours into it, then into the back of his helmet
      cxT = T < 2.2 ? CHIEF_NEAR : CHIEF_HOME;
      if (T > 0.45 && T < 2.0) hand = slotT;
      else if (T >= 2.0 && T < 2.8) {
        hand = NAPE;
        bend = 1;
      } else if (T < 0.45) hand = HOLD;
      lookT = T < 2.0 ? 0.24 : 0.02;
      leanT = T > 0.45 && T < 2.0 ? 0.12 : 0.03;
      if (T > 0.9 && T < 2.0) {
        const k = (T - 0.9) / 1.1;
        s.vis = Math.max(0, 1 - k);
        s.charge = Math.min(1, k);
      }
      if (T > 0.9 && T - dt <= 0.9 && bus) {
        [880, 660, 494, 330].forEach((f, i) => tone(bus, f, { type: 'sine', attack: 0.01, decay: 0.35, gain: 0.04, delay: i * 0.12 }));
      }
      if (!s.chipIn && T > 2.6) {
        s.chipIn = true;
        s.flash = 1;
        if (bus) {
          tone(bus, 1320, { type: 'sine', attack: 0.005, decay: 0.5, gain: 0.05 });
          tone(bus, 1760, { type: 'sine', attack: 0.005, decay: 0.6, gain: 0.03, delay: 0.08 });
        }
      }
      if (T > 3.3) {
        s.phase = 'inside';
        s.pt = 0;
        s.vis = 0;
        s.charge = 1;
      }
      break;
    }
    case 'toConsole': {
      // out of the helmet, a step to the console, and she rises back onto the pedestal
      cxT = T > 0.3 && T < 2.2 ? CHIEF_NEAR : CHIEF_HOME;
      if (T < 0.45) {
        hand = NAPE;
        bend = 1;
      } else if (T < 1.9) hand = slotT;
      lookT = T < 0.45 ? 0.02 : 0.24;
      leanT = T > 0.6 && T < 1.9 ? 0.12 : 0.03;
      if (s.chipIn && T > 0.38) {
        s.chipIn = false;
        if (bus) tone(bus, 220, { type: 'triangle', attack: 0.005, decay: 0.12, gain: 0.05, glideTo: 330 });
      }
      if (T > 1.0 && T - dt <= 1.0) {
        s.slotFlash = 1;
        s.talk = 1.6;
        if (bus) [330, 494, 660, 880].forEach((f, i) => tone(bus, f, { type: 'sine', attack: 0.01, decay: 0.35, gain: 0.04, delay: i * 0.12 }));
      }
      if (T > 1.0) {
        const k = clamp((T - 1.0) / 1.2, 0, 1);
        s.vis = k;
        s.charge = 1 - k;
      }
      if (T > 2.3 && T - dt <= 2.3) s.nod = 1;
      if (T > 3.0) {
        s.phase = 'holo';
        s.pt = 0;
        s.vis = 1;
        s.charge = 0;
      }
      break;
    }
    default:
      break;
  }
  if (s.mapping && s.phase !== 'holo' && s.phase !== 'inside') stopMap(s);
  s.map = damp(s.map, s.mapping ? 1 : 0, s.mapping ? 3 : 5, dt);
  s.mapSpin += dt * (0.25 + s.map * 0.15);
  if (s.hum) shapeHum(s.hum, 196 + Math.sin(s.mapSpin * 2) * 20, 1100 + s.map * 700, 0.025 * s.map, 1.5);
  s.flash = Math.max(0, s.flash - dt * 2.2);
  s.slotFlash = Math.max(0, s.slotFlash - dt * 2);
  s.talk = Math.max(0, s.talk - dt);
  s.nod = Math.max(0, s.nod - dt * 1.6);
  s.blink = (t % 4.3) < 0.13 ? 1 : 0;

  // he walks between his mark and the console
  const v = cxT - s.cx;
  if (Math.abs(v) > 2) {
    s.cx = damp(s.cx, cxT, 4.2, dt);
    s.walkPh += dt * 8.5 * Math.sign(v);
  }
  if (s.map > 0.1) lookT = lerp(lookT, -0.42, s.map);
  s.look = damp(s.look, lookT - Math.sin(s.nod * Math.PI) * 0.16, 6, dt);
  s.lean = damp(s.lean, leanT, 5, dt);

  // his arms
  const want = newArm(0, 0);
  reach(want, NSH[0], NSH[1], hand[0], hand[1], bend);
  const rate = s.phase === 'holo' || s.phase === 'inside' ? 5 : 9;
  s.front.a1 = damp(s.front.a1, want.a1, rate, dt);
  s.front.a2 = damp(s.front.a2, want.a2, rate, dt);
  reach(want, FSH[0], FSH[1], HANG_F[0], HANG_F[1] + Math.sin(t * 1.1) * 2);
  s.back.a1 = damp(s.back.a1, want.a1, 5, dt);
  s.back.a2 = damp(s.back.a2, want.a2, 5, dt);

  // where the chip is: in the slot, in his hand, or out of sight in the helmet
  const handHasChip =
    (s.phase === 'toChief' && s.pt > 0.9 && !s.chipIn) || (s.phase === 'toConsole' && s.pt > 0.38 && s.pt < 1.0);
  if (handHasChip) {
    const br = Math.sin(t * 1.6) * 1.2;
    const ex = NSH[0] + Math.cos(s.front.a1) * 60;
    const ey = NSH[1] + br + Math.sin(s.front.a1) * 60;
    const [wx, wy] = fromTorso(s, ex + Math.cos(s.front.a2) * 62, ey + Math.sin(s.front.a2) * 62, 0);
    s.chipX = wx;
    s.chipY = wy;
  } else {
    s.chipX = SLOT[0];
    s.chipY = SLOT[1];
  }

  // Cortana: gaze, a raised hand for the map, a little talk now and then
  s.gx = damp(s.gx, s.map > 0.4 ? -0.35 : s.tgx, 5, dt);
  s.gy = damp(s.gy, s.map > 0.4 ? -0.85 : s.tgy, 5, dt);
  s.gesture = damp(s.gesture, s.map > 0.05 ? 1 : 0, 4, dt);

  // data motes drift up off the pedestal
  if (!env.reducedMotion || s.motes.items.every((m) => m.life <= 0)) {
    const n = env.reducedMotion ? MOTES : dt * 26 * (0.3 + s.vis);
    for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
      const m = s.motes.spawn(PED_X + rand(-60, 60), PED_TOP - rand(0, 30), rand(-8, 8), rand(-60, -20), rand(1.5, 3.5), rand(1, 2.6));
      if (env.reducedMotion) m.y -= rand(0, 360);
    }
  }
  s.motes.step(dt);
}

/* ---------- backdrop (cached) ---------- */

/** The great window, as a polygon in stage units */
const WIN = [-520, -230, -580, -520, -470, -820, 470, -820, 580, -520, 520, -230] as const;

function renderBackdrop(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  enterStage(c, st);
  const L = st.left - 40;
  const R = st.right + 40;
  const T = st.top - 40;
  const B = st.bottom + 40;

  // outside: dusk over the ring
  c.save();
  c.beginPath();
  c.moveTo(WIN[0], WIN[1]);
  for (let i = 2; i < WIN.length; i += 2) c.lineTo(WIN[i], WIN[i + 1]);
  c.closePath();
  c.clip();
  const sky = c.createLinearGradient(0, -900, 0, -230);
  sky.addColorStop(0, '#090822');
  sky.addColorStop(0.4, '#26205e');
  sky.addColorStop(0.72, '#5a4a9c');
  sky.addColorStop(1, '#b4b6e6');
  c.fillStyle = sky;
  c.fillRect(-700, -900, 1400, 700);
  for (let i = 0; i < 200; i++) {
    const x = -600 + hash(i + 11) * 1200;
    const y = -860 + hash(i + 411) * 420;
    const a = (1 - (y + 860) / 420) * (0.3 + hash(i + 811) * 0.7);
    c.fillStyle = `rgba(230,225,255,${a.toFixed(3)})`;
    const r = 0.6 + hash(i + 1211) * 1.3;
    c.fillRect(x, y, r, r);
  }
  c.globalCompositeOperation = 'lighter';
  glow(c, -300, -640, 420, '110,80,220', 0.16);
  glow(c, 300, -460, 380, '80,140,230', 0.14);
  c.globalCompositeOperation = 'source-over';
  drawRing(c, RING, hash);
  hills(c, -700, 700, -296, 60, 5, '#5d58a6');
  hills(c, -700, 700, -262, 40, 17, '#3c3682');
  c.fillStyle = '#2c2668';
  c.fillRect(-700, -262, 1400, 40);
  c.restore();

  // the room: dark Forerunner metal round the window
  c.save();
  c.beginPath();
  c.rect(L, T, R - L, B - T);
  c.moveTo(WIN[0], WIN[1]);
  for (let i = WIN.length - 2; i >= 2; i -= 2) c.lineTo(WIN[i], WIN[i + 1]);
  c.closePath();
  const wall = c.createLinearGradient(0, T, 0, FLOOR);
  wall.addColorStop(0, '#0d0f22');
  wall.addColorStop(0.6, '#1b1f3a');
  wall.addColorStop(1, '#262b4a');
  c.fillStyle = wall;
  c.fill('evenodd');
  c.restore();
  // panel facets and seams fanning out from the window
  c.strokeStyle = 'rgba(4,4,14,0.7)';
  c.lineWidth = 2;
  const seams = [
    [-580, -520, L, -640],
    [-520, -230, L, -200],
    [-470, -820, -620, T],
    [470, -820, 620, T],
    [580, -520, R, -640],
    [520, -230, R, -200],
  ];
  for (const [x0, y0, x1, y1] of seams) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = L + (i + 0.5) * ((R - L) / 6);
    if (Math.abs(x) < 600) continue;
    c.beginPath();
    c.moveTo(x, -220);
    c.lineTo(x + Math.sign(x) * 60, T);
    c.stroke();
  }
  // a lit rim round the window frame and the sill
  c.lineJoin = 'round';
  c.strokeStyle = '#3a4068';
  c.lineWidth = 18;
  c.beginPath();
  c.moveTo(WIN[0], WIN[1]);
  for (let i = 2; i < WIN.length; i += 2) c.lineTo(WIN[i], WIN[i + 1]);
  c.closePath();
  c.stroke();
  c.strokeStyle = 'rgba(200,210,255,0.55)';
  c.lineWidth = 2;
  c.stroke();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(90,190,255,0.7)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-600, -200);
  c.lineTo(600, -200);
  for (const sx of [-1, 1]) {
    c.moveTo(sx * 600, -200);
    c.lineTo(sx * 660, -260);
    c.lineTo(sx * 660, -600);
    c.lineTo(sx * 720, -660);
  }
  c.stroke();
  c.strokeStyle = 'rgba(90,190,255,0.16)';
  c.lineWidth = 10;
  c.stroke();
  c.globalCompositeOperation = 'source-over';

  // the floor: polished metal with panel lines running toward the window
  const fl = c.createLinearGradient(0, FLOOR, 0, B);
  fl.addColorStop(0, '#3a3f60');
  fl.addColorStop(0.12, '#1c2038');
  fl.addColorStop(1, '#0a0b18');
  c.fillStyle = fl;
  c.fillRect(L, FLOOR, R - L, B - FLOOR);
  c.strokeStyle = 'rgba(6,6,16,0.6)';
  c.lineWidth = 1.5;
  for (let i = -8; i <= 8; i++) {
    c.beginPath();
    c.moveTo(i * 70, FLOOR);
    c.lineTo(i * 150, B);
    c.stroke();
  }
  c.strokeStyle = 'rgba(210,220,255,0.5)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(L, FLOOR + 0.5);
  c.lineTo(R, FLOOR + 0.5);
  c.stroke();
  c.restore();
}

function hills(c: CanvasRenderingContext2D, L: number, R: number, base: number, amp: number, seed: number, color: string) {
  c.beginPath();
  c.moveTo(L, base + 60);
  for (let x = L; x <= R; x += 14) {
    const n = Math.sin(x * 0.004 + seed) * 0.5 + Math.sin(x * 0.012 + seed * 2) * 0.3 + hash(Math.floor(x / 14) + seed * 50) * 0.2;
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

/** A procedural circuit board in Cortana's design units (2 px per unit) */
function makeCircuit() {
  const W = 280;
  const H = 460;
  const k = 2;
  const cv = document.createElement('canvas');
  cv.width = W * k;
  cv.height = H * k;
  const c = cv.getContext('2d');
  if (!c) return cv;
  c.scale(k, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const dirs = [
    [0, 1],
    [0.7, 0.7],
    [-0.7, 0.7],
    [1, 0],
    [-1, 0],
  ];
  for (let i = 0; i < 230; i++) {
    let x = hash(i * 3.1) * W;
    let y = hash(i * 7.7) * H;
    const bright = hash(i * 1.9) > 0.72;
    c.strokeStyle = bright ? 'rgba(235,252,255,0.95)' : 'rgba(20,24,110,0.85)';
    c.fillStyle = c.strokeStyle;
    c.lineWidth = bright ? 0.7 : 0.9;
    c.beginPath();
    c.moveTo(x, y);
    let d = Math.floor(hash(i * 5.3) * 2) === 0 ? 0 : 3;
    const n = 2 + Math.floor(hash(i * 2.2) * 4);
    for (let j = 0; j < n; j++) {
      const L = 5 + hash(i * 11 + j) * 18;
      x += dirs[d][0] * L;
      y += dirs[d][1] * L;
      c.lineTo(x, y);
      d = Math.floor(hash(i * 13 + j * 7) * dirs.length);
    }
    c.stroke();
    c.beginPath();
    c.arc(x, y, bright ? 1.2 : 1, 0, TAU);
    c.fill();
  }
  // fine glyph ticks between the traces
  for (let i = 0; i < 400; i++) {
    const x = hash(i * 9.1 + 3) * W;
    const y = hash(i * 4.3 + 8) * H;
    c.fillStyle = hash(i) > 0.5 ? 'rgba(30,40,140,0.6)' : 'rgba(220,245,255,0.5)';
    c.fillRect(x, y, 1.6 + hash(i * 3) * 3, 0.7);
  }
  return cv;
}

/* ---------- room, console and pedestal ---------- */

function drawRoomLight(ctx: CanvasRenderingContext2D, s: State, t: number) {
  // her light pooling on the floor and lifting the room
  ctx.globalCompositeOperation = 'lighter';
  const on = 0.3 + 0.7 * s.vis;
  ctx.save();
  ctx.translate(PED_X, FLOOR + 10);
  ctx.scale(3, 0.5);
  glow(ctx, 0, 0, 110, '90,170,255', 0.35 * on);
  ctx.restore();
  glow(ctx, PED_X, PED_TOP - 220, 420, '90,140,255', 0.1 * on + 0.06 * s.map);
  // a glint sliding along the ring's rim
  const g = (t * 0.025) % 1;
  const th = Math.PI + (0.1 + g * 0.8) * Math.PI;
  const x = RING.cx + Math.cos(th) * RING.rx * Math.cos(RING.rot) - Math.sin(th) * RING.ry * Math.sin(RING.rot);
  const y = RING.cy + Math.cos(th) * RING.rx * Math.sin(RING.rot) + Math.sin(th) * RING.ry * Math.cos(RING.rot);
  if (y > -820 && y < -230 && Math.abs(x) < 520) glow(ctx, x, y, 28, '220,230,255', 0.3);
  ctx.globalCompositeOperation = 'source-over';
}

function drawConsole(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const x = SLOT[0];
  // a slim Forerunner lectern: a tapered stem and an angled face with the chip slot
  const stem = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
  stem.addColorStop(0, '#20243c');
  stem.addColorStop(0.6, '#5a6080');
  stem.addColorStop(1, '#2a2e48');
  ctx.fillStyle = 'rgba(4,4,14,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, FLOOR + 3, 56, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = stem;
  ctx.strokeStyle = 'rgba(6,6,18,0.95)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 40, FLOOR);
  ctx.lineTo(x - 16, SLOT[1] + 40);
  ctx.lineTo(x + 16, SLOT[1] + 40);
  ctx.lineTo(x + 40, FLOOR);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7d84a6';
  ctx.beginPath();
  ctx.moveTo(x - 46, SLOT[1] + 30);
  ctx.lineTo(x - 30, SLOT[1] - 4);
  ctx.lineTo(x + 40, SLOT[1] + 10);
  ctx.lineTo(x + 34, SLOT[1] + 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,236,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(x - 30, SLOT[1] - 4);
  ctx.lineTo(x + 40, SLOT[1] + 10);
  ctx.lineTo(x + 38, SLOT[1] + 14);
  ctx.lineTo(x - 32, SLOT[1]);
  ctx.closePath();
  ctx.fill();
  // glowing glyph lines and the slot
  ctx.globalCompositeOperation = 'lighter';
  const live = s.chipIn ? 0.35 : 0.8;
  ctx.strokeStyle = `rgba(110,210,255,${live.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 24, FLOOR - 10);
  ctx.lineTo(x - 8, SLOT[1] + 60);
  ctx.moveTo(x + 24, FLOOR - 10);
  ctx.lineTo(x + 8, SLOT[1] + 60);
  ctx.stroke();
  glow(ctx, x, SLOT[1] + 8, 40 + s.slotFlash * 80, '110,210,255', 0.4 * live + s.slotFlash * 0.7);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05060c';
  ctx.fillRect(x - 10, SLOT[1] + 5, 22, 6);
  // the link from the console to the pedestal, live while she is home
  if (s.vis > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const k = s.vis * (0.6 + 0.4 * Math.sin(t * 3));
    const g = ctx.createLinearGradient(x, 0, PED_X, 0);
    g.addColorStop(0, `rgba(110,210,255,${(0.4 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(110,210,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 20, FLOOR - 4);
    ctx.lineTo(PED_X - 70, FLOOR - 4);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawPedestal(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const x = PED_X;
  ctx.fillStyle = 'rgba(4,4,14,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, FLOOR + 3, 120, 10, 0, 0, TAU);
  ctx.fill();
  // a stepped Forerunner plinth with an emitter ring on top
  const body = ctx.createLinearGradient(x - 100, 0, x + 100, 0);
  body.addColorStop(0, '#22263e');
  body.addColorStop(0.55, '#6a7092');
  body.addColorStop(1, '#30344e');
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(6,6,18,0.95)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 108, FLOOR);
  ctx.lineTo(x - 98, FLOOR - 26);
  ctx.lineTo(x - 78, FLOOR - 34);
  ctx.lineTo(x - 70, PED_TOP + 8);
  ctx.lineTo(x + 70, PED_TOP + 8);
  ctx.lineTo(x + 78, FLOOR - 34);
  ctx.lineTo(x + 98, FLOOR - 26);
  ctx.lineTo(x + 108, FLOOR);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9ca2c2';
  ctx.beginPath();
  ctx.ellipse(x, PED_TOP + 8, 70, 11, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const on = 0.3 + 0.7 * Math.max(s.vis, s.slotFlash);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(110,210,255,${(0.9 * on).toFixed(3)})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(x, PED_TOP + 8, 50, 7, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 92, FLOOR - 22);
  ctx.lineTo(x + 92, FLOOR - 22);
  ctx.stroke();
  // the projection column
  const fl = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
  const cone = ctx.createLinearGradient(0, PED_TOP + 8, 0, PED_TOP - 440);
  cone.addColorStop(0, `rgba(110,200,255,${(0.28 * s.vis * fl).toFixed(3)})`);
  cone.addColorStop(1, 'rgba(110,200,255,0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(x - 50, PED_TOP + 8);
  ctx.lineTo(x - 110, PED_TOP - 440);
  ctx.lineTo(x + 110, PED_TOP - 440);
  ctx.lineTo(x + 50, PED_TOP + 8);
  ctx.closePath();
  ctx.fill();
  glow(ctx, x, PED_TOP + 6, 100, '110,200,255', 0.35 * on);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- the ring map ---------- */

function drawMap(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const k = smooth(clamp(s.map, 0, 1));
  if (k < 0.01) return;
  const [cx, cy] = MAP;
  const R = 300 * (0.6 + 0.4 * k);
  const band = 26;
  const tilt = 0.32;
  const spin = s.mapSpin;
  // project a point on the ring (angle a, offset w across the band) to the stage
  const proj = (a: number, w: number) => {
    const x = Math.cos(a + spin) * R;
    const z = Math.sin(a + spin) * R;
    const y = w;
    const py = y * Math.cos(tilt) - z * Math.sin(tilt);
    const pz = y * Math.sin(tilt) + z * Math.cos(tilt);
    const f = 900 / (900 + pz);
    return [cx + x * f, cy + py * f, pz] as const;
  };
  ctx.globalCompositeOperation = 'lighter';
  // the beam from her raised hand, or from the console when she is with the Chief
  const src = s.vis > 0.5 ? cortanaHand(s) : ([SLOT[0], SLOT[1]] as const);
  const g = ctx.createLinearGradient(src[0], src[1], cx, cy + 60);
  g.addColorStop(0, `rgba(140,220,255,${(0.5 * k).toFixed(3)})`);
  g.addColorStop(1, `rgba(120,180,255,${(0.04 * k).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(src[0], src[1]);
  ctx.lineTo(cx - R * 0.9, cy + 40);
  ctx.lineTo(cx + R * 0.9, cy + 40);
  ctx.closePath();
  ctx.fill();
  glow(ctx, cx, cy, R * 1.2, '90,160,255', 0.16 * k);
  // the band: two rims and cross ribs, brighter on the near half
  const N = 72;
  for (const w of [-band, band]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU;
      const a1 = ((i + 1) / N) * TAU;
      const p0 = proj(a0, w);
      const p1 = proj(a1, w);
      const near = clamp(0.5 - (p0[2] / R) * 0.5, 0, 1);
      ctx.strokeStyle = `rgba(150,225,255,${((0.25 + 0.65 * near) * k).toFixed(3)})`;
      ctx.lineWidth = 1 + near * 1.4;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    const p0 = proj(a, -band);
    const p1 = proj(a, band);
    const near = clamp(0.5 - (p0[2] / R) * 0.5, 0, 1);
    ctx.strokeStyle = `rgba(150,225,255,${((0.1 + 0.4 * near) * k).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
  }
  // a landscape fill on the inner face of the near half
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU;
    const a1 = ((i + 1) / N) * TAU;
    const p0 = proj(a0, -band);
    const p1 = proj(a1, -band);
    const p2 = proj(a1, band);
    const p3 = proj(a0, band);
    if (p0[2] > 0) continue;
    const hgt = hash(i * 1.7);
    ctx.fillStyle = `rgba(${hgt > 0.5 ? '90,200,170' : '90,150,255'},${(0.1 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    ctx.fill();
  }
  // the marked site: a beacon on the ring with a pulse
  const mk = proj(1.2, 0);
  const pulse = (t * 1.2) % 1;
  ctx.strokeStyle = `rgba(255,220,120,${((1 - pulse) * 0.9 * k).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(mk[0], mk[1], 8 + pulse * 30, (8 + pulse * 30) * 0.5, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,230,150,${(0.95 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(mk[0], mk[1] - 12);
  ctx.lineTo(mk[0] + 6, mk[1]);
  ctx.lineTo(mk[0], mk[1] + 12);
  ctx.lineTo(mk[0] - 6, mk[1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(255,230,150,${(0.5 * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(mk[0], mk[1] - 14);
  ctx.lineTo(mk[0], mk[1] - 70);
  ctx.lineTo(mk[0] + 40, mk[1] - 70);
  ctx.stroke();
  glow(ctx, mk[0], mk[1], 40, '255,210,120', 0.5 * k);
  // a sweep of light round the band
  const sw = proj(-spin * 3, 0);
  glow(ctx, sw[0], sw[1], 36, '170,235,255', 0.5 * k);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- Cortana ---------- */

/** Her frame: feet on the pedestal, design units scaled by CS */
const W_C = 280;
const H_C = 460;

/** Where her raised hand is in stage units */
function cortanaHand(s: State) {
  const [hx, hy] = armPoints(s, false)[2];
  return [PED_X + hx * CS, PED_TOP + hy * CS] as const;
}

/** Shoulder, elbow, wrist and fingertip for an arm; far is her right arm, toward the Chief */
function armPoints(s: State, near: boolean): (readonly [number, number])[] {
  const t = s.time;
  const sway = Math.sin(t * 0.8) * 1.5;
  if (near) {
    // hand resting on her hip
    return [
      [36 + sway * 0.3, -330],
      [62 + sway * 0.4, -266],
      [38 + sway, -214],
      [30 + sway, -200],
    ];
  }
  const g = smooth(s.gesture);
  const lift = Math.sin(t * 1.4) * 2 * g;
  return [
    [-26 + sway * 0.3, -330],
    [lerp(-38, -58, g), lerp(-266, -284, g)],
    [lerp(-40, -84, g), lerp(-206, -330 + lift, g)],
    [lerp(-42, -98, g), lerp(-188, -340 + lift, g)],
  ];
}

function drawCortana(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv, t: number) {
  const v = s.vis;
  if (v < 0.01) return;
  const st = s.st;
  // render her opaque into a layer, then composite it as light
  const scale = st.k * env.dpr * CS;
  const cw = Math.max(1, Math.ceil(W_C * scale));
  const chh = Math.max(1, Math.ceil(H_C * scale));
  if (s.holo.width !== cw || s.holo.height !== chh) {
    s.holo.width = cw;
    s.holo.height = chh;
  }
  const c = s.holo.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cw, chh);
  c.setTransform(scale, 0, 0, scale, (W_C / 2) * scale, (H_C - 10) * scale);
  cortanaFigure(c, s, t);
  // scanlines cut through her
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'rgba(0,0,0,0.3)';
  const gap = Math.max(2, Math.round(3 * env.dpr));
  const off = Math.floor((t * 24) % gap);
  for (let y = off; y < chh; y += gap) c.fillRect(0, y, cw, Math.max(1, Math.round(env.dpr)));
  c.globalCompositeOperation = 'source-over';

  const W = W_C * CS;
  const H = H_C * CS;
  const x0 = PED_X - W / 2;
  const y0 = PED_TOP - (H - 10 * CS);
  // she materialises from the feet up and dissolves from the head down
  const leaving = s.phase === 'toChief';
  const span = CORT_H * CS + 30;
  const edge = leaving ? PED_TOP - span * v : PED_TOP - span * v;
  const flick = 0.86 + 0.08 * Math.sin(t * 31) + 0.06 * Math.sin(t * 13.7);
  const glitch = hash(Math.floor(t * 7)) > 0.94 && !env.reducedMotion;
  ctx.save();
  ctx.beginPath();
  if (leaving) ctx.rect(x0 - 40, PED_TOP - span * v, W + 80, span * v + 20);
  else ctx.rect(x0 - 40, edge, W + 80, PED_TOP - edge + 20);
  ctx.clip();
  ctx.globalAlpha = 0.86 * flick;
  if (glitch) {
    const cut = Math.floor(hash(Math.floor(t * 7) + 3) * chh * 0.7);
    const hgt = Math.max(1, Math.floor(chh * 0.06));
    const sc = st.k * env.dpr;
    ctx.drawImage(s.holo, 0, 0, cw, cut, x0, y0, W, cut / sc);
    ctx.drawImage(s.holo, 0, cut, cw, hgt, x0 + 7, y0 + cut / sc, W, hgt / sc);
    ctx.drawImage(s.holo, 0, cut + hgt, cw, chh - cut - hgt, x0, y0 + (cut + hgt) / sc, W, (chh - cut - hgt) / sc);
  } else {
    ctx.drawImage(s.holo, x0, y0, W, H);
  }
  // bloom of the same image
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.24 * flick;
  ctx.drawImage(s.holo, x0 - 4, y0 - 4, W + 8, H + 8);
  ctx.globalAlpha = 0.12 * flick;
  ctx.drawImage(s.holo, x0 - 10, y0 - 10, W + 20, H + 20);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (v < 0.999) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(190,240,255,0.85)';
    ctx.fillRect(PED_X - 80, edge - 1.5, 160, 3);
    glow(ctx, PED_X, edge, 90, '120,210,255', 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** A smooth tube through centre points with radii, as a closed path */
function tube(c: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], rads: readonly number[]) {
  const n = pts.length;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    L.push([pts[i][0] + nx * rads[i], pts[i][1] + ny * rads[i]]);
    R.push([pts[i][0] - nx * rads[i], pts[i][1] - ny * rads[i]]);
  }
  const side = (P: [number, number][], rev: boolean) => {
    const Q = rev ? [...P].reverse() : P;
    for (let i = 1; i < Q.length - 1; i++) {
      const mx = (Q[i][0] + Q[i + 1][0]) / 2;
      const my = (Q[i][1] + Q[i + 1][1]) / 2;
      c.quadraticCurveTo(Q[i][0], Q[i][1], mx, my);
    }
    c.lineTo(Q[Q.length - 1][0], Q[Q.length - 1][1]);
  };
  c.moveTo(L[0][0], L[0][1]);
  side(L, false);
  // round the far end
  const e = pts[n - 1];
  c.arc(e[0], e[1], rads[n - 1], Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]), Math.atan2(R[n - 1][1] - e[1], R[n - 1][0] - e[0]), true);
  side(R, true);
  const s0 = pts[0];
  c.arc(s0[0], s0[1], rads[0], Math.atan2(R[0][1] - s0[1], R[0][0] - s0[0]), Math.atan2(L[0][1] - s0[1], L[0][0] - s0[0]), true);
  c.closePath();
}

/** Cortana in her own frame: feet at the origin, a three quarter turn toward the Chief */
function cortanaFigure(c: CanvasRenderingContext2D, s: State, t: number) {
  const breathe = Math.sin(t * 1.5) * 0.8;
  const sway = Math.sin(t * 0.8) * 1.5;
  const fill = c.createLinearGradient(0, -CORT_H, 0, 0);
  fill.addColorStop(0, '#a6e8ff');
  fill.addColorStop(0.35, '#68b8ff');
  fill.addColorStop(0.75, '#5a86ff');
  fill.addColorStop(1, '#7a5cf0');
  const edge = 'rgba(220,250,255,0.95)';

  // the parts of her silhouette, each a closed sub-path
  const legN = () =>
    tube(
      c,
      [
        [20 + sway, -190],
        [18 + sway * 0.8, -148],
        [15 + sway * 0.5, -104],
        [14, -66],
        [12, -16],
      ],
      [16, 12, 8.5, 9.5, 4.8]
    );
  const legF = () =>
    tube(
      c,
      [
        [-12 + sway, -188],
        [-12 + sway * 0.8, -146],
        [-6 + sway * 0.4, -102],
        [-14, -62],
        [-22, -16],
      ],
      [15, 11.5, 8.5, 9, 4.6]
    );
  const feet = () => {
    c.moveTo(6, -18);
    c.quadraticCurveTo(16, -10, 14, -2);
    c.quadraticCurveTo(6, 2, -2, 0);
    c.quadraticCurveTo(2, -8, 6, -18);
    c.closePath();
    c.moveTo(-20, -18);
    c.quadraticCurveTo(-26, -8, -38, -2);
    c.quadraticCurveTo(-30, 2, -20, 0);
    c.quadraticCurveTo(-16, -8, -20, -18);
    c.closePath();
  };
  const torso = () => {
    const b = breathe;
    const x = sway;
    const h = x * 0.3;
    c.moveTo(-20 + h, -338);
    c.bezierCurveTo(-27 + h, -332, -32 + h, -318, -32, -304);
    c.bezierCurveTo(-34, -296 + b, -32, -286 + b, -26, -276);
    c.bezierCurveTo(-20 + x * 0.3, -266, -17 + x * 0.5, -258, -17 + x * 0.5, -248);
    c.bezierCurveTo(-17 + x * 0.6, -236, -27 + x, -222, -31 + x, -206);
    c.bezierCurveTo(-33 + x, -192, -28 + x, -180, -18 + x, -172);
    c.bezierCurveTo(-10 + x, -168, -2 + x, -166, 2 + x, -170);
    c.bezierCurveTo(10 + x, -168, 22 + x, -174, 34 + x, -186);
    c.bezierCurveTo(42 + x, -198, 40 + x, -214, 32 + x, -226);
    c.bezierCurveTo(24 + x * 0.6, -238, 18 + x * 0.5, -248, 17 + x * 0.5, -254);
    c.bezierCurveTo(17, -266, 26, -280 + b, 29, -292 + b);
    c.bezierCurveTo(31, -306, 33 + h, -320, 32 + h, -330);
    c.bezierCurveTo(28 + h, -338, 18, -340, 8, -344);
    c.lineTo(-8, -344);
    c.bezierCurveTo(-14, -342, -17 + h, -341, -20 + h, -338);
    c.closePath();
  };
  const neck = () =>
    tube(
      c,
      [
        [-2 + sway * 0.3, -336],
        [-5 + s.gx * 2, -364],
      ],
      [8, 7]
    );
  const arm = (near: boolean) => {
    const [sh, el, wr, fi] = armPoints(s, near);
    tube(c, [sh, [lerp(sh[0], el[0], 0.4), lerp(sh[1], el[1], 0.4)], el], [8.6, 7.4, 5.8]);
    tube(c, [el, [lerp(el[0], wr[0], 0.35), lerp(el[1], wr[1], 0.35)], wr], [5.8, 5.4, 4.1]);
    // the hand, tapering to the fingertips
    const a = Math.atan2(fi[1] - wr[1], fi[0] - wr[0]);
    const cx = Math.cos(a);
    const sn = Math.sin(a);
    const px = -sn;
    const py = cx;
    c.moveTo(wr[0] + px * 4.6, wr[1] + py * 4.6);
    c.quadraticCurveTo(wr[0] + cx * 10 + px * 6, wr[1] + sn * 10 + py * 6, fi[0] + px * 1.5, fi[1] + py * 1.5);
    c.quadraticCurveTo(fi[0] + cx * 2, fi[1] + sn * 2, fi[0] - px * 1.5, fi[1] - py * 1.5);
    c.quadraticCurveTo(wr[0] + cx * 10 - px * 5, wr[1] + sn * 10 - py * 5, wr[0] - px * 4.6, wr[1] - py * 4.6);
    c.closePath();
  };

  // the head, in its own small frame turned by the gaze
  const hx = -6 + s.gx * 2.5 + sway * 0.3;
  const hy = -386 + s.gy * 1.5;
  const tilt = s.gx * 0.06 - s.gy * 0.05 + Math.sin(t * 0.6) * 0.02;
  const head = () => {
    c.save();
    c.translate(hx, hy);
    c.rotate(tilt);
    // skull and face in three quarter: brow, nose, lips, chin, jaw to the ear
    c.moveTo(18, -24);
    c.bezierCurveTo(10, -36, -12, -36, -20, -22);
    c.bezierCurveTo(-23, -16, -23, -10, -22, -6);
    c.bezierCurveTo(-22, -3, -24, 1, -26, 6);
    c.lineTo(-23, 8);
    c.bezierCurveTo(-23.5, 10, -23, 12, -22.5, 13);
    c.bezierCurveTo(-23, 15, -22, 17, -21, 18);
    c.bezierCurveTo(-20, 21, -17, 23, -13, 23.5);
    c.bezierCurveTo(-6, 23, 4, 18, 11, 11);
    c.bezierCurveTo(16, 6, 20, -4, 20, -12);
    c.bezierCurveTo(21, -18, 20, -22, 18, -24);
    c.closePath();
    c.restore();
  };

  // fill all parts together, with a bright edge round the outside only
  const parts = [legF, legN, feet, () => arm(true), torso, neck, () => arm(false), head];
  c.lineJoin = 'round';
  c.strokeStyle = edge;
  c.lineWidth = 3.2;
  for (const p of parts) {
    c.beginPath();
    p();
    c.stroke();
  }
  c.fillStyle = fill;
  for (const p of parts) {
    c.beginPath();
    p();
    c.fill();
  }

  // shade, circuitry and streams, clipped to her silhouette
  c.save();
  c.beginPath();
  for (const p of parts) p();
  c.clip();
  // form: a cooler shadow on the side away from the light, a lift on the near side
  const shade = c.createLinearGradient(-40, 0, 50, 0);
  shade.addColorStop(0, 'rgba(40,40,170,0.45)');
  shade.addColorStop(0.45, 'rgba(40,40,170,0)');
  shade.addColorStop(0.8, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(230,250,255,0.35)');
  c.fillStyle = shade;
  c.fillRect(-140, -440, 280, 450);
  // circuitry over the body, kept off the face
  c.save();
  c.beginPath();
  c.rect(-W_C / 2, hy + 14, W_C, H_C);
  c.clip();
  c.globalAlpha = 0.85;
  c.drawImage(s.circuit, -W_C / 2, -H_C + 10, W_C, H_C);
  c.restore();
  // data streams rising through her
  for (let i = 0; i < 5; i++) {
    const y = -((t * 90 + i * 97) % 440);
    const g = c.createLinearGradient(0, y - 30, 0, y + 6);
    g.addColorStop(0, 'rgba(200,245,255,0)');
    g.addColorStop(0.8, 'rgba(220,250,255,0.55)');
    g.addColorStop(1, 'rgba(220,250,255,0)');
    c.fillStyle = g;
    c.fillRect(-140, y - 30, 280, 36);
  }
  c.restore();

  // the near leg and both arms keep a fine edge where they cross the body
  c.strokeStyle = 'rgba(225,250,255,0.55)';
  c.lineWidth = 1.2;
  for (const p of [legN, () => arm(true), () => arm(false)]) {
    c.beginPath();
    p();
    c.stroke();
  }
  // anatomy in light: collarbones, sternum, ribs, waist, knees
  c.strokeStyle = 'rgba(225,250,255,0.6)';
  c.lineWidth = 1.1;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-20, -334);
  c.quadraticCurveTo(-8, -330, -2, -332);
  c.moveTo(4, -332);
  c.quadraticCurveTo(18, -330, 32, -334);
  c.moveTo(-1, -326);
  c.lineTo(-2, -284);
  c.moveTo(-26, -294 + breathe);
  c.quadraticCurveTo(-14, -280 + breathe, -4, -286 + breathe);
  c.moveTo(4, -286 + breathe);
  c.quadraticCurveTo(16, -278 + breathe, 26, -292 + breathe);
  c.moveTo(-12 + sway * 0.5, -232);
  c.quadraticCurveTo(-2 + sway * 0.5, -226, 8 + sway * 0.5, -232);
  c.moveTo(-22 + sway, -204);
  c.quadraticCurveTo(-6 + sway, -182, 0 + sway, -176);
  c.moveTo(28 + sway, -206);
  c.quadraticCurveTo(14 + sway, -184, 8 + sway, -176);
  c.moveTo(8 + sway * 0.5, -106);
  c.quadraticCurveTo(14, -100, 20, -104);
  c.moveTo(-18 + sway * 0.4, -100);
  c.quadraticCurveTo(-12, -94, -6, -98);
  c.stroke();

  // soft modelling inside the face: the far cheek falls into shadow
  c.save();
  c.beginPath();
  head();
  c.clip();
  c.translate(hx, hy);
  c.rotate(tilt);
  const cheek = c.createRadialGradient(-17, 6, 1, -17, 6, 14);
  cheek.addColorStop(0, 'rgba(40,40,160,0.3)');
  cheek.addColorStop(1, 'rgba(40,40,160,0)');
  c.fillStyle = cheek;
  c.fillRect(-32, -8, 30, 30);
  c.restore();

  // the head in its own frame
  c.save();
  c.translate(hx, hy);
  c.rotate(tilt);
  // the cheekbone and jaw catch the light
  c.strokeStyle = 'rgba(235,252,255,0.6)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-8, 3);
  c.quadraticCurveTo(0, 6, 8, 2);
  c.moveTo(-11, 23);
  c.quadraticCurveTo(3, 19, 12, 9);
  c.stroke();

  // the face: brows, eyes that follow the pointer, nose, lips
  const ex = s.gx * 1.4;
  const ey = s.gy * 1.1;
  const lid = 1 - s.blink;
  c.strokeStyle = 'rgba(22,22,110,0.92)';
  c.lineCap = 'round';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-21.5, -10.5);
  c.quadraticCurveTo(-18, -13.2, -14, -12);
  c.moveTo(-8.5, -12);
  c.quadraticCurveTo(-2, -14.6, 5, -11.4);
  c.stroke();
  // eye whites in pale light, then the irises
  c.fillStyle = 'rgba(225,248,255,0.95)';
  c.beginPath();
  c.ellipse(-17, -5, 2.9, 1.7 * lid + 0.15, -0.08, 0, TAU);
  c.ellipse(-3, -5, 4.8, 2.3 * lid + 0.15, 0.05, 0, TAU);
  c.fill();
  if (lid > 0.5) {
    c.fillStyle = 'rgba(40,60,190,0.95)';
    c.beginPath();
    c.arc(-17.6 + ex, -5 + ey, 1.4, 0, TAU);
    c.arc(-4 + ex * 1.2, -5 + ey, 2, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(10,10,60,0.95)';
    c.beginPath();
    c.arc(-17.6 + ex, -5 + ey, 0.7, 0, TAU);
    c.arc(-4 + ex * 1.2, -5 + ey, 1, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fillRect(-3.6 + ex * 1.2, -6.2 + ey, 0.9, 0.9);
  }
  // upper lids with a lifted outer corner
  c.strokeStyle = 'rgba(14,14,80,0.95)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-19.8, -5.2);
  c.quadraticCurveTo(-17, -7.6, -14, -5.8);
  c.moveTo(-7.8, -5);
  c.quadraticCurveTo(-3, -8.6, 2, -5.8);
  c.lineTo(3.6, -6.8);
  c.stroke();
  c.strokeStyle = 'rgba(30,30,120,0.5)';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-7, -3.2);
  c.quadraticCurveTo(-3, -2, 1.5, -3.6);
  c.stroke();
  // nose: the bridge and a nostril shadow
  c.strokeStyle = 'rgba(30,36,140,0.7)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-12.5, -3);
  c.quadraticCurveTo(-15, 1, -18.5, 5.4);
  c.moveTo(-20, 6.8);
  c.quadraticCurveTo(-18, 8, -15.5, 7);
  c.stroke();
  // lips: a darker upper lip with a bow, a fuller lower lip with a highlight
  const talk = s.talk > 0 ? Math.abs(Math.sin(s.time * 11)) * 1.6 : 0;
  c.fillStyle = 'rgba(80,46,180,0.95)';
  c.beginPath();
  c.moveTo(-22, 12.8);
  c.quadraticCurveTo(-20.5, 11, -19, 11.2);
  c.quadraticCurveTo(-17.8, 11.9, -16.6, 11.2);
  c.quadraticCurveTo(-13, 11, -9, 13);
  c.quadraticCurveTo(-15, 13.6, -22, 12.8);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(112,80,226,0.95)';
  c.beginPath();
  c.moveTo(-21.4, 13.6 + talk);
  c.quadraticCurveTo(-15, 13.9 + talk, -9.6, 13.4 + talk * 0.6);
  c.quadraticCurveTo(-14, 18 + talk, -21.4, 13.6 + talk);
  c.closePath();
  c.fill();
  if (talk > 0.2) {
    c.fillStyle = 'rgba(20,14,70,0.9)';
    c.fillRect(-19, 13.2, 8, talk * 0.7);
  }
  c.fillStyle = 'rgba(230,240,255,0.55)';
  c.fillRect(-17, 15 + talk, 3, 0.8);

  // hair: a short dark bob, the fringe swept across the brow, a lock framing the cheek
  const hair = c.createLinearGradient(0, -44, 0, 22);
  hair.addColorStop(0, '#5c50e6');
  hair.addColorStop(0.55, '#3028b0');
  hair.addColorStop(1, '#221d86');
  c.fillStyle = hair;
  c.strokeStyle = edge;
  c.lineWidth = 1.3;
  c.lineJoin = 'round';
  const flutter = Math.sin(t * 2.2) * 0.6;
  c.beginPath();
  c.moveTo(-21, -14);
  c.bezierCurveTo(-26, -30, -8, -44, 10, -41);
  c.bezierCurveTo(26, -38, 31, -22, 29, -6);
  c.bezierCurveTo(28, 6, 26, 14, 21 + flutter, 20);
  c.bezierCurveTo(19, 16, 17, 10, 16, 4);
  c.bezierCurveTo(15, -4, 12, -12, 6, -16);
  c.bezierCurveTo(0, -20, -12, -20, -21, -14);
  c.closePath();
  c.fill();
  c.stroke();
  // the lock in front of the ear
  c.beginPath();
  c.moveTo(8, -16);
  c.bezierCurveTo(4, -4, 4, 8, 9 + flutter, 21);
  c.bezierCurveTo(11, 12, 13, 2, 14, -10);
  c.closePath();
  c.fill();
  c.stroke();
  // the fringe, sweeping down to a point over the far brow
  c.beginPath();
  c.moveTo(6, -32);
  c.bezierCurveTo(-6, -30, -16, -24, -22, -13);
  c.lineTo(-25.5, -7 + flutter * 0.5);
  c.bezierCurveTo(-20, -12, -12, -17, -2, -19);
  c.bezierCurveTo(4, -21, 8, -26, 6, -32);
  c.closePath();
  c.fill();
  c.stroke();
  // strands of light through the hair
  c.strokeStyle = 'rgba(190,210,255,0.8)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(-16, -28);
  c.quadraticCurveTo(4, -40, 24, -26);
  c.moveTo(-18, -18);
  c.quadraticCurveTo(-6, -27, 4, -27);
  c.moveTo(22, -16);
  c.quadraticCurveTo(26, 0, 22, 14);
  c.moveTo(10, -10);
  c.quadraticCurveTo(8, 4, 10, 16);
  c.stroke();
  c.restore();
}

/* ---------- the Chief ---------- */

const pose: ChiefPose = {
  crouch: 0,
  lean: 0.03,
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
const FEET = [0, 0, 0, 0];

function drawChief(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  ctx.fillStyle = 'rgba(4,4,14,0.55)';
  ctx.beginPath();
  ctx.ellipse(s.cx + 4, FLOOR + 3, 92, 10, 0, 0, TAU);
  ctx.fill();
  pose.br = Math.sin(t * 1.6) * 1.2;
  pose.front.a1 = s.front.a1;
  pose.front.a2 = s.front.a2;
  pose.back.a1 = s.back.a1;
  pose.back.a2 = s.back.a2;
  pose.look = s.look;
  pose.lean = s.lean;
  pose.feet = undefined;
  const walking = Math.abs(s.cx - CHIEF_HOME) > 3 && Math.abs(s.cx - CHIEF_NEAR) > 3;
  if (walking) {
    const ph = s.walkPh;
    FEET[0] = 44 + Math.sin(ph) * 22;
    FEET[1] = -Math.max(0, Math.cos(ph)) * 12;
    FEET[2] = -38 - Math.sin(ph) * 22;
    FEET[3] = -5 - Math.max(0, -Math.cos(ph)) * 12;
    pose.feet = FEET;
  }
  ctx.save();
  ctx.translate(s.cx, FLOOR);
  ctx.scale(CH, CH);
  const inside = s.chipIn;
  chiefFigure(p, pose, t, {
    visor: () => {
      // Cortana in his head: the visor runs cool blue, with a flash as the chip seats
      const a = (inside ? 0.62 + 0.1 * Math.sin(t * 2.4) : 0) + s.flash * 0.4;
      if (a <= 0.01) return;
      ctx.fillStyle = `rgba(30,110,240,${Math.min(0.8, a).toFixed(3)})`;
      ctx.fillRect(-10, -36, 64, 50);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(110,200,255,${(0.25 * a + s.flash * 0.6).toFixed(3)})`;
      ctx.fillRect(-10, -36, 64, 50);
      ctx.globalCompositeOperation = 'source-over';
    },
  });
  ctx.restore();
  // the slot at the back of the helmet glows while she is inside
  if (inside || s.flash > 0.02) {
    const br = Math.sin(t * 1.6) * 1.2;
    const [lx, ly] = fromTorso(s, HEAD[0] - 34, HEAD[1] + 6 + br, 0);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, lx, ly, 24 + s.flash * 70, '110,200,255', 0.5 + s.flash * 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Her data chip: a slim dark card with a glowing core, in the slot or in his hand */
function drawChip(ctx: CanvasRenderingContext2D, s: State, t: number) {
  if (s.chipIn) return;
  const inSlot = s.chipX === SLOT[0] && s.chipY === SLOT[1];
  ctx.save();
  ctx.translate(s.chipX, s.chipY + (inSlot ? -2 : -10));
  ctx.rotate(inSlot ? 0.2 : -0.3);
  ctx.scale(1.3, 1.3);
  ctx.fillStyle = '#20232c';
  ctx.strokeStyle = '#08090c';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-4, -16);
  ctx.lineTo(4, -16);
  ctx.lineTo(6, -12);
  ctx.lineTo(6, 4);
  ctx.lineTo(-6, 4);
  ctx.lineTo(-6, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9ca3b6';
  ctx.fillRect(-5, -2, 10, 2);
  const g = 0.35 + 0.65 * s.charge;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(120,215,255,${(0.6 + 0.4 * s.charge * (0.8 + 0.2 * Math.sin(t * 8))).toFixed(3)})`;
  ctx.fillRect(-1.5, -13, 3, 9);
  glow(ctx, 0, -9, 16 + s.charge * 18, '110,200,255', 0.5 * g);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Her light streaming between the pedestal and the chip */
function drawStream(ctx: CanvasRenderingContext2D, s: State, t: number) {
  let k = 0;
  let toChip = true;
  if (s.phase === 'toChief' && s.pt > 0.8 && s.pt < 2.1) k = Math.sin(clamp((s.pt - 0.8) / 1.25, 0, 1) * Math.PI);
  else if (s.phase === 'toConsole' && s.pt > 0.9 && s.pt < 2.3) {
    k = Math.sin(clamp((s.pt - 0.9) / 1.35, 0, 1) * Math.PI);
    toChip = false;
  }
  if (k < 0.01) return;
  const ax = PED_X;
  const ay = PED_TOP - 220;
  const bx = s.chipX;
  const by = s.chipY - 10;
  const mx = (ax + bx) / 2;
  const my = Math.min(ay, by) - 120;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [wd, col] of [
    [12, 'rgba(80,170,255,0.18)'],
    [5, 'rgba(130,215,255,0.45)'],
    [1.8, 'rgba(230,250,255,0.9)'],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = wd * k;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    let u = (t * 1.6 + i / 9) % 1;
    if (!toChip) u = 1 - u;
    const iu = 1 - u;
    const x = iu * iu * ax + 2 * iu * u * mx + u * u * bx;
    const y = iu * iu * ay + 2 * iu * u * my + u * u * by;
    glow(ctx, x, y, 18 * k, '150,225,255', 0.8 * k);
  }
  glow(ctx, bx, by, 60 * k, '110,200,255', 0.6 * k);
  ctx.globalCompositeOperation = 'source-over';
}

function drawMotes(ctx: CanvasRenderingContext2D, s: State) {
  ctx.globalCompositeOperation = 'lighter';
  for (const m of s.motes.items) {
    if (m.life <= 0) continue;
    const a = Math.min(1, (m.life / m.max) * 2) * 0.7 * (0.3 + 0.7 * s.vis);
    ctx.fillStyle = `rgba(150,225,255,${a.toFixed(3)})`;
    ctx.fillRect(m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
  }
  ctx.globalCompositeOperation = 'source-over';
}

