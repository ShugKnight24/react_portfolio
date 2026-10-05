import { createCanvasScene, clamp, damp, easeOutBack, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { clonePose, drawFighter, lerpPose, mulberry32, smoothstep } from './power-up';
import type { Pose } from './power-up';

/**
 * Spirit Bomb: a fighter on a night ridge, arms raised, gathering light from every
 * edge of the frame into a sphere overhead. Ported from the old DBZ codex scene with
 * a proper landscape, a lit sphere that lights the world, curving energy streams,
 * and a throw: the sphere arcs off to the horizon, flashes, domes and regrows.
 */

const REST: Pose = {
  pelvisY: 0.5,
  lean: 0,
  chest: 0,
  lEx: -0.18,
  lEy: 0.64,
  lHx: -0.2,
  lHy: 0.48,
  rEx: 0.18,
  rEy: 0.64,
  rHx: 0.2,
  rHy: 0.48,
  lKx: -0.11,
  lKy: 0.27,
  lFx: -0.14,
  rKx: 0.11,
  rKy: 0.27,
  rFx: 0.14,
};
const RAISED: Pose = {
  pelvisY: 0.48,
  lean: 0,
  chest: 0.01,
  lEx: -0.2,
  lEy: 0.99,
  lHx: -0.12,
  lHy: 1.15,
  rEx: 0.2,
  rEy: 0.99,
  rHx: 0.12,
  rHy: 1.15,
  lKx: -0.15,
  lKy: 0.26,
  lFx: -0.2,
  rKx: 0.15,
  rKy: 0.26,
  rFx: 0.2,
};
const THROWN: Pose = {
  pelvisY: 0.47,
  lean: 0.025,
  chest: 0.005,
  lEx: -0.06,
  lEy: 0.86,
  lHx: 0.1,
  lHy: 0.95,
  rEx: 0.27,
  rEy: 0.9,
  rHx: 0.38,
  rHy: 1.02,
  lKx: -0.16,
  lKy: 0.25,
  lFx: -0.23,
  rKx: 0.17,
  rKy: 0.26,
  rFx: 0.21,
};

const MAX_MOTES = 220;
const TRAIL = 22;
const THROW_TIME = 1.25;
const IMPACT_TIME = 2.2;
const GATHER_RATE = 0.28;
const COLORS = ['127,184,255', '130,236,255', '235,245,255'];

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
  swirl: number;
}

interface Voice {
  bus: AudioBus;
  a: OscillatorNode;
  b: OscillatorNode;
  c: OscillatorNode;
  lp: BiquadFilterNode;
  gain: GainNode;
}

type Phase = 'gather' | 'throw' | 'impact';

interface State {
  pointerHeld: boolean;
  keyHeld: boolean;
  touched: boolean;
  phase: Phase;
  phaseT: number;
  energy: number;
  radius: number;
  pop: number;
  raise: number;
  throwW: number;
  gatherGlow: number;
  bx: number;
  by: number;
  bScale: number;
  throwFrom: number;
  throwFromY: number;
  throwR: number;
  trail: Float32Array;
  trailHead: number;
  trailCount: number;
  trailTimer: number;
  motes: Mote[];
  moteCursor: number;
  spawnAcc: number;
  flash: number;
  kick: number;
  demoT: number;
  cx: number;
  gy: number;
  H: number;
  horizon: number;
  rMin: number;
  rMax: number;
  tx: number;
  ty: number;
  stars: Float32Array;
  hillsFar: Float32Array;
  hillsNear: Float32Array;
  trees: Float32Array;
  pose: Pose;
  voice: Voice | null;
}

function hills(w: number, baseY: number, amp: number, seed: number) {
  const rng = mulberry32(seed);
  const f1 = 0.004 + rng() * 0.004;
  const f2 = 0.011 + rng() * 0.01;
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const n = Math.ceil((w + 40) / 12) + 1;
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = -20 + i * 12;
    pts[i * 2] = x;
    pts[i * 2 + 1] = baseY - amp * (0.55 + 0.3 * Math.sin(x * f1 + p1) + 0.15 * Math.sin(x * f2 + p2));
  }
  return pts;
}

function hillY(pts: Float32Array, x: number) {
  const i = clamp(Math.floor((x + 20) / 12), 0, pts.length / 2 - 2);
  const k = (x - pts[i * 2]) / 12;
  return lerp(pts[i * 2 + 1], pts[i * 2 + 3], clamp(k, 0, 1));
}

function fillHills(ctx: CanvasRenderingContext2D, pts: Float32Array, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0], bottom);
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineTo(pts[pts.length - 2], bottom);
  ctx.closePath();
  ctx.fill();
}

function startVoice(bus: AudioBus): Voice {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 2;
  lp.connect(gain);
  const mk = (type: OscillatorType, f: number, g: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og).connect(lp);
    o.start(now);
    return o;
  };
  return { bus, a: mk('sine', 196, 0.6), b: mk('sine', 197.2, 0.6), c: mk('triangle', 392, 0.25), lp, gain };
}

function stopVoice(v: Voice) {
  const now = v.bus.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0.0001, now, 0.15);
  for (const o of [v.a, v.b, v.c]) {
    try {
      o.stop(now + 0.9);
    } catch {
      /* already stopped */
    }
  }
}

function spawnMote(s: State, w: number, h: number) {
  const m = s.motes[s.moteCursor];
  s.moteCursor = (s.moteCursor + 1) % MAX_MOTES;
  const edge = Math.random();
  // Mostly from the sides and top, some rising from the land
  if (edge < 0.3) {
    m.x = -8;
    m.y = rand(0, s.horizon + 20);
  } else if (edge < 0.6) {
    m.x = w + 8;
    m.y = rand(0, s.horizon + 20);
  } else if (edge < 0.85) {
    m.x = rand(0, w);
    m.y = -8;
  } else {
    m.x = rand(0, w);
    m.y = Math.min(h + 8, hillY(s.hillsNear, m.x) + rand(0, 20));
  }
  const dx = s.bx - m.x;
  const dy = s.by - m.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = rand(40, 90);
  m.vx = (dx / d) * sp;
  m.vy = (dy / d) * sp;
  m.life = 1;
  m.size = rand(1, 2.4);
  m.hue = Math.random() < 0.15 ? 2 : Math.random() < 0.5 ? 1 : 0;
  m.swirl = rand(-1, 1);
}

function beginThrow(s: State, env: SceneEnv) {
  s.phase = 'throw';
  s.phaseT = 0;
  s.throwFrom = s.bx;
  s.throwFromY = s.by;
  s.throwR = s.radius;
  s.trailCount = 0;
  if (s.voice) {
    stopVoice(s.voice);
    s.voice = null;
  }
  env.wake(THROW_TIME * 1000 + IMPACT_TIME * 1000 + 600);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.9, freq: 900, q: 0.6, gain: 0.22 });
    tone(bus, 520, { type: 'triangle', glideTo: 140, decay: 1, gain: 0.1 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 3.4,
    cursor: 'pointer',
    init: () => {
      const rng = mulberry32(5);
      const stars = new Float32Array(110 * 4);
      for (let i = 0; i < stars.length; i += 4) {
        stars[i] = rng();
        stars[i + 1] = rng();
        stars[i + 2] = rng() * TAU;
        stars[i + 3] = 0.6 + rng() * 1.2;
      }
      return {
        pointerHeld: false,
        keyHeld: false,
        touched: false,
        phase: 'gather',
        phaseT: 0,
        energy: 0.12,
        radius: 0,
        pop: 1,
        raise: 1,
        throwW: 0,
        gatherGlow: 0,
        bx: 0,
        by: 0,
        bScale: 1,
        throwFrom: 0,
        throwFromY: 0,
        throwR: 0,
        trail: new Float32Array(TRAIL * 3),
        trailHead: 0,
        trailCount: 0,
        trailTimer: 0,
        motes: Array.from({ length: MAX_MOTES }, () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          size: 1,
          hue: 0,
          swirl: 0,
        })),
        moteCursor: 0,
        spawnAcc: 0,
        flash: 0,
        kick: 0,
        demoT: 0,
        cx: 0,
        gy: 0,
        H: 1,
        horizon: 0,
        rMin: 1,
        rMax: 2,
        tx: 0,
        ty: 0,
        stars,
        hillsFar: new Float32Array(4),
        hillsNear: new Float32Array(4),
        trees: new Float32Array(0),
        pose: clonePose(RAISED),
        voice: null,
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.H = Math.min(h * 0.34, w * 0.5);
      s.cx = w * (w > h * 1.2 ? 0.42 : 0.5);
      s.gy = h * 0.9;
      s.horizon = s.gy - s.H * 0.55;
      s.rMin = s.H * 0.07;
      s.rMax = Math.min(s.H * 0.52, w * 0.24);
      s.tx = w * (w > h * 1.2 ? 0.84 : 0.8);
      s.hillsFar = hills(w, s.horizon, s.H * 0.22, 13);
      s.hillsNear = hills(w, s.horizon + s.H * 0.12, s.H * 0.16, 41);
      s.ty = hillY(s.hillsFar, s.tx) + s.H * 0.02;
      const rng = mulberry32(77);
      const trees: number[] = [];
      for (let x = rand(0, 10); x < w; x += 7 + rng() * 22) {
        if (Math.abs(x - s.cx) < s.H * 0.5) continue;
        trees.push(x, hillY(s.hillsNear, x), 0.6 + rng() * 0.8);
      }
      s.trees = new Float32Array(trees);
    },
    update: (s, env, dt, t) => {
      const { w, h, reducedMotion: rm } = env;
      const holding = s.pointerHeld || s.keyHeld;
      s.phaseT += dt;

      if (s.phase === 'gather') {
        s.pop = Math.min(1, s.pop + dt * 1.6);
        s.raise = damp(s.raise, 1, 3, dt);
        s.throwW = damp(s.throwW, 0, 4, dt);
        const demo = !s.touched && (!env.interactive || rm);
        if (holding) {
          s.energy = Math.min(1, s.energy + dt * GATHER_RATE);
          if (rm) env.wake(300);
        } else if (demo) {
          if (rm) s.energy = damp(s.energy, 0.62, 1.2, dt);
          else {
            s.demoT += dt;
            s.energy = Math.min(1, s.energy + dt * 0.16);
            if (s.demoT > 5.5) {
              s.demoT = 0;
              beginThrow(s, env);
            }
          }
        } else if (s.energy < 0.3) {
          s.energy = Math.min(0.3, s.energy + dt * 0.05);
        }
      } else if (s.phase === 'throw') {
        s.throwW = damp(s.throwW, 1, 14, dt);
        s.raise = damp(s.raise, 1, 3, dt);
        if (s.phaseT >= THROW_TIME) {
          s.phase = 'impact';
          s.phaseT = 0;
          s.flash = rm ? 0.35 : 1;
          s.kick = 1;
          s.energy = 0;
          const bus = env.audio();
          if (bus) {
            tone(bus, 72, { type: 'sine', glideTo: 28, decay: 1.6, gain: 0.4 });
            noise(bus, { duration: 1.6, freq: 380, type: 'lowpass', gain: 0.4 });
            tone(bus, 1320, { type: 'sine', decay: 1.2, gain: 0.03, delay: 0.05 });
          }
        }
      } else {
        s.throwW = damp(s.throwW, 0, 2.5, dt);
        s.raise = damp(s.raise, s.phaseT > 1.2 ? 1 : 0, 3, dt);
        if (s.phaseT >= IMPACT_TIME) {
          s.phase = 'gather';
          s.phaseT = 0;
          s.pop = 0;
          s.energy = 0.05;
        }
      }

      const eased = easeOutCubic(s.energy);
      const target = lerp(s.rMin, s.rMax, eased) * (s.phase === 'gather' ? easeOutBack(clamp(s.pop, 0, 1)) : 1);
      s.radius = s.phase === 'gather' ? damp(s.radius, target, 6, dt) : s.radius;

      lerpPose(s.pose, REST, RAISED, s.raise);
      lerpPose(s.pose, s.pose, THROWN, s.throwW);
      s.pose.chest += Math.sin(t * 1.6) * 0.004;

      const H = s.H;
      const handsY = s.gy - H * 1.15;
      const restX = s.cx;
      const restY = handsY - s.radius - H * 0.05;
      if (s.phase === 'throw') {
        const k = clamp(s.phaseT / THROW_TIME, 0, 1);
        const kk = Math.pow(k, 1.5);
        const c1x = lerp(s.throwFrom, s.tx, 0.4);
        const c1y = s.throwFromY - H * 0.55;
        const a = 1 - kk;
        s.bx = a * a * s.throwFrom + 2 * a * kk * c1x + kk * kk * s.tx;
        s.by = a * a * s.throwFromY + 2 * a * kk * c1y + kk * kk * s.ty;
        s.bScale = lerp(1, 0.1, Math.pow(k, 1.2));
        s.trailTimer -= dt;
        if (s.trailTimer <= 0) {
          s.trailTimer = 1 / 40;
          s.trail[s.trailHead * 3] = s.bx;
          s.trail[s.trailHead * 3 + 1] = s.by;
          s.trail[s.trailHead * 3 + 2] = s.throwR * s.bScale;
          s.trailHead = (s.trailHead + 1) % TRAIL;
          s.trailCount = Math.min(TRAIL, s.trailCount + 1);
        }
      } else {
        s.bx = restX;
        s.by = restY;
        s.bScale = 1;
        if (s.phase === 'impact') s.trailCount = Math.max(0, s.trailCount - dt * 60);
      }

      // Energy streams
      const gathering = s.phase === 'gather';
      s.gatherGlow = damp(s.gatherGlow, gathering ? (holding ? 1 : 0.35) : 0, 3, dt);
      const streaming = holding || (!s.touched && env.reducedMotion);
      s.spawnAcc += dt * (gathering ? (streaming ? 110 : 22 + 40 * (1 - s.energy)) : 0);
      while (s.spawnAcc >= 1) {
        s.spawnAcc -= 1;
        spawnMote(s, w, h);
      }
      const R = s.radius;
      for (const m of s.motes) {
        if (m.life <= 0) continue;
        const dx = s.bx - m.x;
        const dy = s.by - m.y;
        const d = Math.hypot(dx, dy) || 1;
        if (gathering && d < R * 0.85) {
          m.life = 0;
          continue;
        }
        if (!gathering) {
          m.life -= dt * 1.5;
          m.vx *= Math.exp(-2 * dt);
          m.vy *= Math.exp(-2 * dt);
        } else {
          const sp = 90 + 260 * (streaming ? 1 : 0.4) + 400 / (1 + d / 60);
          const sw = m.swirl * Math.min(1, d / 200) * 0.9;
          const ux = dx / d;
          const uy = dy / d;
          m.vx = damp(m.vx, (ux - uy * sw) * sp, 2.4, dt);
          m.vy = damp(m.vy, (uy + ux * sw) * sp, 2.4, dt);
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }

      s.flash = Math.max(0, s.flash - dt * 1.6);
      s.kick = Math.max(0, s.kick - dt * 1.8);

      // Pad voice follows gathered energy while held
      if (holding && gathering && !s.voice) {
        const bus = env.audio();
        if (bus) s.voice = startVoice(bus);
      }
      if (s.voice) {
        const v = s.voice;
        const now = v.bus.ctx.currentTime;
        const f = 196 * Math.pow(2, s.energy);
        v.gain.gain.setTargetAtTime(0.05 + 0.08 * s.energy, now, 0.1);
        v.a.frequency.setTargetAtTime(f, now, 0.1);
        v.b.frequency.setTargetAtTime(f * 1.006, now, 0.1);
        v.c.frequency.setTargetAtTime(f * 1.5, now, 0.1);
        v.lp.frequency.setTargetAtTime(700 + 2600 * s.energy, now, 0.1);
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h, reducedMotion: rm } = env;
      const { H, gy, horizon } = s;
      const R = s.radius * s.bScale;
      const glow = s.phase === 'gather' ? 0.35 + 0.65 * easeOutCubic(s.energy) : s.phase === 'throw' ? 1 - s.phaseT / THROW_TIME : 0;
      const impact = s.phase === 'impact' ? s.phaseT / IMPACT_TIME : 1;
      const dome = s.phase === 'impact' ? Math.sin(Math.min(1, s.phaseT / 0.25) * Math.PI * 0.5) * (1 - smoothstep(0.35, 1, impact)) : 0;

      const shake = rm ? 0 : s.kick * H * 0.02;
      ctx.save();
      ctx.translate(Math.sin(t * 47) * shake, Math.sin(t * 39 + 1) * shake);
      const pad = 20;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#07060f');
      sky.addColorStop(0.65, '#0b1026');
      sky.addColorStop(1, '#16224a');
      ctx.fillStyle = sky;
      ctx.fillRect(-pad, -pad, w + pad * 2, horizon + pad + 2);
      for (let i = 0; i < s.stars.length; i += 4) {
        const y = s.stars[i + 1] * horizon;
        const a = (0.3 + 0.4 * Math.sin(t * 1.1 + s.stars[i + 2])) * (1 - y / horizon) * (1 - glow * 0.4);
        if (a <= 0.03) continue;
        ctx.fillStyle = `rgba(210,225,255,${a})`;
        ctx.fillRect(s.stars[i] * w, y, s.stars[i + 3], s.stars[i + 3]);
      }

      ctx.globalCompositeOperation = 'lighter';
      // Sphere light on the sky
      const skyR = Math.max(w, h) * (0.35 + 0.35 * glow);
      const sg = ctx.createRadialGradient(s.bx, s.by, 0, s.bx, s.by, skyR);
      sg.addColorStop(0, `rgba(110,170,255,${0.22 * glow})`);
      sg.addColorStop(0.4, `rgba(60,110,230,${0.08 * glow})`);
      sg.addColorStop(1, 'rgba(60,110,230,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);

      // Convergence rays from the edges
      const rays = s.gatherGlow * glow;
      if (rays > 0.02) {
        ctx.strokeStyle = `rgba(150,200,255,${0.07 * rays})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const far = Math.hypot(w, h);
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * TAU + t * 0.08;
          ctx.moveTo(s.bx + Math.cos(a) * far, s.by + Math.sin(a) * far);
          ctx.lineTo(s.bx + Math.cos(a) * R * 1.6, s.by + Math.sin(a) * R * 1.6);
        }
        ctx.stroke();
      }

      // Impact dome on the horizon
      if (dome > 0.01) {
        const dr = w * 0.12 + w * 0.3 * easeOutCubic(Math.min(1, s.phaseT / 0.9));
        const dg = ctx.createRadialGradient(s.tx, s.ty, 0, s.tx, s.ty, dr);
        dg.addColorStop(0, `rgba(255,255,255,${0.9 * dome})`);
        dg.addColorStop(0.35, `rgba(170,215,255,${0.6 * dome})`);
        dg.addColorStop(0.8, `rgba(90,150,255,${0.25 * dome})`);
        dg.addColorStop(1, 'rgba(90,150,255,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.ellipse(s.tx, s.ty, dr, dr * 0.85, 0, Math.PI, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Land
      ctx.fillStyle = '#10152c';
      fillHills(ctx, s.hillsFar, horizon + H * 0.3);
      if (dome > 0.01) {
        ctx.strokeStyle = `rgba(190,225,255,${0.6 * dome})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < s.hillsFar.length; i += 2) {
          if (i === 0) ctx.moveTo(s.hillsFar[i], s.hillsFar[i + 1]);
          else ctx.lineTo(s.hillsFar[i], s.hillsFar[i + 1]);
        }
        ctx.stroke();
      }
      const land = ctx.createLinearGradient(0, horizon, 0, h);
      land.addColorStop(0, '#0c1024');
      land.addColorStop(1, '#07060f');
      ctx.fillStyle = land;
      fillHills(ctx, s.hillsNear, h + pad);
      // Pines on the near ridge
      ctx.fillStyle = '#080a18';
      ctx.beginPath();
      for (let i = 0; i < s.trees.length; i += 3) {
        const x = s.trees[i];
        const y = s.trees[i + 1] + 2;
        const th = H * 0.075 * s.trees[i + 2];
        ctx.moveTo(x, y - th);
        ctx.lineTo(x + th * 0.28, y);
        ctx.lineTo(x - th * 0.28, y);
        ctx.closePath();
      }
      ctx.fill();

      // Foreground outcrop under the fighter
      ctx.fillStyle = '#090a16';
      ctx.beginPath();
      ctx.ellipse(s.cx, gy + H * 0.06, H * 0.9, H * 0.12, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(-pad, gy + H * 0.05, w + pad * 2, h - gy + pad);

      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(s.cx, gy);
      ctx.scale(1, 0.2);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 1.1);
      pool.addColorStop(0, `rgba(120,175,255,${0.25 * glow})`);
      pool.addColorStop(1, 'rgba(120,175,255,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(-H * 1.1, -H * 1.1, H * 2.2, H * 2.2);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      ctx.globalCompositeOperation = 'lighter';
      // Streams
      ctx.lineCap = 'round';
      for (const m of s.motes) {
        if (m.life <= 0) continue;
        const near = 1 / (1 + Math.hypot(s.bx - m.x, s.by - m.y) / (H * 0.8));
        ctx.strokeStyle = `rgba(${COLORS[m.hue]},${(0.15 + 0.85 * near) * m.life})`;
        ctx.lineWidth = m.size * (0.7 + near);
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 0.07, m.y - m.vy * 0.07);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';

      // Fighter, top-lit by the sphere
      const top = gy - H * 1.2;
      const body = ctx.createLinearGradient(0, top, 0, gy);
      body.addColorStop(0, '#1c2448');
      body.addColorStop(1, '#0b0d1c');
      const pants = ctx.createLinearGradient(0, gy - H * 0.55, 0, gy);
      pants.addColorStop(0, '#40241a');
      pants.addColorStop(1, '#1d0f0b');
      const rim = ctx.createLinearGradient(0, top - H * 0.2, 0, gy);
      const lit = Math.max(glow, dome * 0.9);
      rim.addColorStop(0, `rgba(215,235,255,${0.45 + 0.5 * lit})`);
      rim.addColorStop(1, `rgba(110,160,255,${0.12 + 0.2 * lit})`);
      drawFighter(
        ctx,
        s.cx,
        gy,
        H,
        s.pose,
        {
          body,
          pants,
          band: '#141a3a',
          hair: '22,20,40',
          rim,
          rimWidth: Math.max(1, H * 0.007),
          detail: `rgba(160,200,255,${0.1 + 0.15 * glow})`,
          eye: '#dfe9ff',
          eyeAlpha: 0.35,
          hairUp: 0.12 + 0.1 * glow,
        },
        t
      );

      ctx.globalCompositeOperation = 'lighter';
      // Throw trail
      const tc = Math.floor(s.trailCount);
      for (let i = 0; i < tc; i++) {
        const idx = (s.trailHead - 1 - i + TRAIL * 2) % TRAIL;
        const k = 1 - i / TRAIL;
        const x = s.trail[idx * 3];
        const y = s.trail[idx * 3 + 1];
        const r = s.trail[idx * 3 + 2] * (0.4 + 0.5 * k);
        ctx.fillStyle = `rgba(120,180,255,${0.12 * k})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      // The sphere
      if (s.phase !== 'impact' && R > 0.5) {
        const pulse = 1 + 0.025 * Math.sin(t * 6);
        const r = R * pulse;
        const halo = ctx.createRadialGradient(s.bx, s.by, r * 0.6, s.bx, s.by, r * 2.6);
        halo.addColorStop(0, 'rgba(120,180,255,0.45)');
        halo.addColorStop(0.4, 'rgba(80,140,255,0.14)');
        halo.addColorStop(1, 'rgba(80,140,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(s.bx - r * 2.6, s.by - r * 2.6, r * 5.2, r * 5.2);
        ctx.globalCompositeOperation = 'source-over';
        const core = ctx.createRadialGradient(s.bx - r * 0.25, s.by - r * 0.3, r * 0.05, s.bx, s.by, r);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.35, '#dcefff');
        core.addColorStop(0.72, '#8fc2ff');
        core.addColorStop(1, '#4f86f0');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(s.bx, s.by, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        // Surface currents sliding around the rim
        ctx.lineWidth = Math.max(1, r * 0.035);
        for (let i = 0; i < 5; i++) {
          const a0 = t * (0.9 + i * 0.23) * (i % 2 ? -1 : 1) + i * 1.3;
          ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.1 * Math.sin(t * 3 + i)})`;
          ctx.beginPath();
          ctx.arc(s.bx, s.by, r * (0.62 + i * 0.07), a0, a0 + 0.9 + 0.3 * Math.sin(t + i));
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(210,235,255,0.55)';
        ctx.lineWidth = Math.max(1, r * 0.025);
        ctx.beginPath();
        ctx.arc(s.bx, s.by, r, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(210,230,255,${s.flash * 0.6})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      const vig = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      vig.addColorStop(0, 'rgba(7,6,15,0)');
      vig.addColorStop(1, 'rgba(7,6,15,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s) => {
      s.pointerHeld = true;
      s.touched = true;
    },
    onPointerUp: (s, env) => {
      s.pointerHeld = false;
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        s.keyHeld = true;
        s.touched = true;
      } else {
        s.keyHeld = false;
        release(s, env);
      }
      return true;
    },
    dispose: (s) => {
      if (s.voice) stopVoice(s.voice);
      s.voice = null;
    },
  });

function release(s: State, env: SceneEnv) {
  if (s.pointerHeld || s.keyHeld) return;
  if (s.voice) {
    stopVoice(s.voice);
    s.voice = null;
  }
  if (s.phase === 'gather' && s.energy > 0.18 && s.pop >= 1) beginThrow(s, env);
}
