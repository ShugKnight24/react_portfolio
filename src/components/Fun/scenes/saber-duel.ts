import { createCanvasScene, clamp, damp, easeOutCubic, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Saber Duel: two cloaked duelists with blue and red blades locked in a bind.
 * Polish over the original: layered stroke blades (white core, coloured glow, no shadowBlur)
 * with a hum flicker, a contact point that slides as the fighters push, sparks and light
 * spill at the bind, rim-lit silhouettes, floor reflections, and a clash that swings the
 * blades apart and slams them back with a flash, spark burst and a little camera shake.
 */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hot: number; // 1 white-gold, 0 tinted
}

interface Mote {
  x: number;
  y: number;
  vy: number;
  phase: number;
  r: number;
}

interface Blade {
  x: number;
  y: number;
  a: number;
}

interface State {
  sparks: Spark[];
  next: number;
  motes: Mote[];
  /** Seconds since the clash started, or -1 when idle */
  clash: number;
  impacted: boolean;
  /** Spark burst pending for the next frame the blades touch */
  burst: boolean;
  /** Impact crackle pending (set when the clash started with sound on) */
  crackle: boolean;
  queued: boolean;
  shake: number;
  flash: number;
  heat: number;
  emit: number;
  apart: number;
  blue: Blade;
  red: Blade;
  hit: boolean;
  hx: number;
  hy: number;
  // layout
  cx: number;
  gy: number;
  s: number;
  bg: CanvasGradient | null;
  floor: CanvasGradient | null;
  vignette: CanvasGradient | null;
}

const MAX_SPARKS = 180;
const BLADE_LEN = 240;
const WIND = 0.28; // swing apart
const SLAM = 0.12; // slam back
const SETTLE = 0.55;
const BLUE_GLOW = 'rgb(60,150,255)';
const BLUE_MID = 'rgb(120,200,255)';
const RED_GLOW = 'rgb(255,40,50)';
const RED_MID = 'rgb(255,110,110)';

const hiltBase = (s: State, side: -1 | 1) => ({
  x: s.cx + side * 92 * s.s,
  y: s.gy - 150 * s.s,
});

/** Angle of a blade at rest, aimed at the bind point */
const baseAngle = (side: -1 | 1) => Math.atan2(-132, -side * 92);

function emitSpark(s: State, x: number, y: number, speed: number, dir: number, spread: number, hot: number) {
  const p = s.sparks[s.next];
  s.next = (s.next + 1) % MAX_SPARKS;
  const a = dir + rand(-spread, spread);
  const v = speed * rand(0.35, 1);
  p.x = x;
  p.y = y;
  p.vx = Math.cos(a) * v;
  p.vy = Math.sin(a) * v;
  p.max = rand(0.25, 0.7);
  p.life = p.max;
  p.hot = hot;
}

/** Segment intersection of the two blades, written into s.hx/s.hy */
function intersect(s: State, L: number) {
  const ax = s.blue.x;
  const ay = s.blue.y;
  const bx = Math.cos(s.blue.a) * L;
  const by = Math.sin(s.blue.a) * L;
  const cx = s.red.x;
  const cy = s.red.y;
  const dx = Math.cos(s.red.a) * L;
  const dy = Math.sin(s.red.a) * L;
  const den = bx * dy - by * dx;
  if (Math.abs(den) < 1e-6) return false;
  const u = ((cx - ax) * dy - (cy - ay) * dx) / den;
  const v = ((cx - ax) * by - (cy - ay) * bx) / den;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  s.hx = ax + bx * u;
  s.hy = ay + by * u;
  return true;
}

function startClash(s: State) {
  if (s.clash >= 0 && s.clash < WIND + SLAM) {
    s.queued = true;
    return false;
  }
  s.clash = 0;
  s.impacted = false;
  s.crackle = false;
  return true;
}

/* ---------- silhouettes (local units, facing +x, feet at y = 0) ---------- */

function traceJedi(ctx: CanvasRenderingContext2D) {
  // robe
  ctx.moveTo(-64, 0);
  ctx.bezierCurveTo(-60, -58, -54, -118, -42, -164);
  ctx.bezierCurveTo(-37, -178, -24, -186, -8, -188);
  ctx.lineTo(16, -186);
  ctx.bezierCurveTo(30, -182, 37, -170, 35, -150);
  ctx.bezierCurveTo(38, -100, 48, -52, 62, 0);
  ctx.closePath();
  // hood, peaked at the back
  ctx.moveTo(-28, -184);
  ctx.bezierCurveTo(-38, -206, -30, -232, -6, -238);
  ctx.bezierCurveTo(16, -240, 30, -226, 29, -206);
  ctx.bezierCurveTo(28, -196, 20, -188, 12, -184);
  ctx.closePath();
}

function traceSith(ctx: CanvasRenderingContext2D) {
  // wide cape
  ctx.moveTo(-88, 0);
  ctx.bezierCurveTo(-84, -70, -70, -140, -52, -182);
  ctx.bezierCurveTo(-46, -196, -34, -202, -18, -204);
  ctx.lineTo(22, -202);
  ctx.bezierCurveTo(38, -198, 46, -188, 46, -172);
  ctx.bezierCurveTo(48, -120, 58, -60, 72, 0);
  ctx.closePath();
  // helmet flare
  ctx.moveTo(-28, -198);
  ctx.lineTo(-20, -222);
  ctx.lineTo(26, -222);
  ctx.lineTo(34, -198);
  ctx.closePath();
  // helmet dome with a brow ridge
  ctx.moveTo(-20, -222);
  ctx.bezierCurveTo(-24, -244, -8, -256, 4, -256);
  ctx.bezierCurveTo(20, -256, 30, -242, 26, -222);
  ctx.closePath();
}

function traceArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  w0: number,
  w1: number,
  drape: number
) {
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.moveTo(sx + nx * w0, sy + ny * w0);
  ctx.lineTo(hx + nx * w1, hy + ny * w1);
  ctx.lineTo(hx - nx * w1, hy - ny * w1);
  // sleeve hangs below the forearm
  ctx.quadraticCurveTo(
    (sx + hx) / 2 - nx * (w0 + drape),
    (sy + hy) / 2 + Math.abs(ny) * drape + drape * 0.6,
    sx - nx * w0,
    sy - ny * w0
  );
  ctx.closePath();
  ctx.moveTo(hx + w1 * 1.1, hy);
  ctx.arc(hx, hy, w1 * 1.1, 0, TAU);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 2.6,
    init: () => ({
      sparks: Array.from({ length: MAX_SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hot: 1 })),
      next: 0,
      motes: Array.from({ length: 34 }, () => ({
        x: Math.random(),
        y: Math.random(),
        vy: rand(0.008, 0.03),
        phase: rand(0, TAU),
        r: rand(0.6, 1.6),
      })),
      clash: -1,
      impacted: false,
      burst: false,
      crackle: false,
      queued: false,
      shake: 0,
      flash: 0,
      heat: 0.4,
      emit: 0,
      apart: 0,
      blue: { x: 0, y: 0, a: 0 },
      red: { x: 0, y: 0, a: 0 },
      hit: false,
      hx: 0,
      hy: 0,
      cx: 0,
      gy: 0,
      s: 1,
      bg: null,
      floor: null,
      vignette: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.s = Math.min(w / 560, h / 520);
      s.cx = w / 2;
      s.gy = Math.min(h * 0.84, h * 0.56 + 175 * s.s);
      const bg = ctx.createLinearGradient(0, 0, w, 0);
      bg.addColorStop(0, 'rgba(22,58,160,0.62)');
      bg.addColorStop(0.3, 'rgba(12,22,70,0.35)');
      bg.addColorStop(0.5, 'rgba(7,6,15,0)');
      bg.addColorStop(0.7, 'rgba(80,10,24,0.35)');
      bg.addColorStop(1, 'rgba(170,16,34,0.62)');
      s.bg = bg;
      const floor = ctx.createLinearGradient(0, s.gy, 0, h);
      floor.addColorStop(0, '#0d0b18');
      floor.addColorStop(1, '#050409');
      s.floor = floor;
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const u = s.s;
      // clash timeline: swing apart, slam back, damped wobble
      let apart = 0;
      if (s.clash >= 0) {
        s.clash += dt;
        const c = s.clash;
        if (c < WIND) apart = easeOutCubic(c / WIND);
        else if (c < WIND + SLAM) {
          const q = (c - WIND) / SLAM;
          apart = 1 - q * q * q;
        } else {
          if (!s.impacted) {
            s.impacted = true;
            s.flash = 1;
            s.shake = 1;
            s.heat = 1.4;
            s.burst = true;
            const bus = s.crackle ? env.audio() : null;
            if (bus) noise(bus, { duration: 0.28, gain: 0.3, freq: 3200, q: 0.5, type: 'highpass' });
            s.crackle = false;
          }
          const k = (c - WIND - SLAM) / SETTLE;
          apart = -0.16 * Math.exp(-k * 4) * Math.sin(k * 11);
          if (k >= 1) {
            s.clash = -1;
            if (s.queued) {
              s.queued = false;
              startClash(s);
              s.crackle = true;
            }
          }
        }
      }
      s.apart = apart;

      // idle struggle: the bind slides along the blades as the fighters push
      const push = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.012;
      const strain = Math.sin(t * 1.7) * 0.018;
      const lift = Math.max(0, apart);
      const bh = hiltBase(s, -1);
      const rh = hiltBase(s, 1);
      s.blue.x = bh.x - lift * 14 * u + push * 30 * u;
      s.blue.y = bh.y - lift * 26 * u;
      s.blue.a = baseAngle(-1) - apart * 1.05 + push - strain;
      s.red.x = rh.x + lift * 14 * u + push * 30 * u;
      s.red.y = rh.y - lift * 26 * u;
      s.red.a = baseAngle(1) + apart * 1.05 + push + strain;

      s.hit = intersect(s, BLADE_LEN * u);

      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.flash = Math.max(0, s.flash - dt * 4);
      s.heat = damp(s.heat, s.hit ? 0.45 : 0, s.heat > 0.6 ? 3 : 8, dt);

      // sparks: steady trickle at the bind, a burst on impact
      if (s.hit) {
        if (s.burst) {
          s.burst = false;
          for (let i = 0; i < 70; i++) emitSpark(s, s.hx, s.hy, 520 * u, rand(0, TAU), Math.PI, Math.random() < 0.7 ? 1 : 0);
        }
        s.emit += dt * 34;
        while (s.emit > 1) {
          s.emit -= 1;
          emitSpark(s, s.hx, s.hy, 260 * u, -Math.PI / 2, 1.3, Math.random() < 0.8 ? 1 : 0);
        }
      } else {
        s.emit = 0;
      }
      const g = 620 * u;
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy += g * dt;
        p.vx *= 1 - dt * 1.5;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > s.gy && p.vy > 0) {
          p.y = s.gy;
          p.vy *= -0.3;
          p.vx *= 0.6;
        }
      }
      for (const m of s.motes) {
        m.y -= m.vy * dt;
        if (m.y < -0.02) {
          m.y = 1.02;
          m.x = Math.random();
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      const L = BLADE_LEN * u;
      const hum = 1 + Math.sin(t * 53) * 0.05 + Math.sin(t * 31.7) * 0.04 + (Math.random() - 0.5) * 0.05;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#07060f';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      const amp = s.shake * s.shake * 8 * u;
      if (amp > 0.05) ctx.translate(Math.sin(t * 91) * amp, Math.cos(t * 73) * amp * 0.7);

      // split backdrop
      if (s.bg) {
        ctx.fillStyle = s.bg;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }
      // light spill from the blades and the bind
      ctx.globalCompositeOperation = 'lighter';
      const spillX = s.hit ? s.hx : s.cx;
      const spillY = s.hit ? s.hy : s.gy - 280 * u;
      const spillR = (300 + s.heat * 120) * u;
      const spill = ctx.createRadialGradient(spillX, spillY, 0, spillX, spillY, spillR);
      spill.addColorStop(0, `rgba(190,150,255,${(0.1 + s.heat * 0.14) * hum})`);
      spill.addColorStop(0.5, 'rgba(90,60,160,0.05)');
      spill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spill;
      ctx.fillRect(spillX - spillR, spillY - spillR, spillR * 2, spillR * 2);

      // dust motes catching the light
      for (const m of s.motes) {
        const x = m.x * w + Math.sin(t * 0.5 + m.phase) * 10;
        const y = m.y * s.gy;
        ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 1.3 + m.phase);
        ctx.fillStyle = m.x < 0.5 ? '#6fb6ff' : '#ff6b6b';
        ctx.fillRect(x, y, m.r * u + 0.5, m.r * u + 0.5);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // floor
      if (s.floor) {
        ctx.fillStyle = s.floor;
        ctx.fillRect(-20, s.gy, w + 40, h - s.gy + 20);
      }
      ctx.strokeStyle = 'rgba(160,140,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-20, s.gy + 0.5);
      ctx.lineTo(w + 20, s.gy + 0.5);
      ctx.stroke();

      // blade reflections on the floor
      ctx.save();
      ctx.beginPath();
      ctx.rect(-20, s.gy, w + 40, h - s.gy + 20);
      ctx.clip();
      // squashed mirror: the floor is seen at a grazing angle
      ctx.translate(0, s.gy * 1.35);
      ctx.scale(1, -0.35);
      ctx.globalAlpha = 0.35;
      drawBlades(ctx, s, L, u, hum);
      ctx.restore();

      // shadows under the fighters
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(s.cx - 175 * u, s.gy + 3 * u, 80 * u, 8 * u, 0, 0, TAU);
      ctx.ellipse(s.cx + 180 * u, s.gy + 3 * u, 95 * u, 9 * u, 0, 0, TAU);
      ctx.fill();

      // fighters, rim lit from the blades
      const lean = Math.max(0, s.apart) * 6 * u;
      const breathe = 1 + Math.sin(t * 1.6) * 0.006;
      const jx = s.cx - 175 * u - lean;
      const sx = s.cx + 180 * u + lean;
      const rimK = 0.55 + s.heat * 0.35 + s.flash * 0.3;

      rimLit(
        ctx,
        () => {
          ctx.save();
          ctx.translate(jx, s.gy);
          ctx.scale(u, u * breathe);
          traceJedi(ctx);
          ctx.restore();
          traceArm(ctx, jx + 26 * u, s.gy - 168 * u, s.blue.x, s.blue.y, 12 * u, 6 * u, 10 * u);
        },
        '#15110f',
        `rgba(150,205,255,${clamp(rimK, 0, 1)})`,
        'rgba(40,80,170,0.8)',
        2.8 * u,
        -1.4 * u
      );
      rimLit(
        ctx,
        () => {
          ctx.save();
          ctx.translate(sx, s.gy);
          ctx.scale(-u, u * breathe);
          traceSith(ctx);
          ctx.restore();
          traceArm(ctx, sx - 34 * u, s.gy - 182 * u, s.red.x, s.red.y, 14 * u, 6.5 * u, 4 * u);
        },
        '#08070b',
        `rgba(255,120,110,${clamp(rimK, 0, 1)})`,
        'rgba(150,20,40,0.8)',
        -2.8 * u,
        -1.4 * u
      );

      // helmet glint and hood shadow
      ctx.fillStyle = 'rgba(255,90,90,0.35)';
      ctx.fillRect(sx - 22 * u, s.gy - 232 * u, 12 * u, 2 * u);

      // hilts
      drawHilt(ctx, s.blue, u, '#b8c0c9');
      drawHilt(ctx, s.red, u, '#6d6f78');

      drawBlades(ctx, s, L, u, hum);

      // bind glow and sparks
      ctx.globalCompositeOperation = 'lighter';
      if (s.hit) {
        const r = (26 + s.heat * 40) * u * hum;
        const g = ctx.createRadialGradient(s.hx, s.hy, 0, s.hx, s.hy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.25, 'rgba(255,220,170,0.55)');
        g.addColorStop(0.6, 'rgba(200,120,255,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.hx - r, s.hy - r, r * 2, r * 2);
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, 1.6 * u);
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.hot ? '#ffe9b0' : p.x < s.cx ? '#8fd0ff' : '#ff8a80';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // impact flash
      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(255,240,255,${(s.flash * s.flash * 0.35).toFixed(3)})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => clash(s, env),
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) clash(s, env);
      return true;
    },
  });

function clash(s: State, env: SceneEnv) {
  const fresh = startClash(s);
  const bus = env.audio();
  if (!bus || !fresh) return;
  // swing: a rising hum whoosh, then the crackling impact
  noise(bus, { duration: 0.3, gain: 0.12, freq: 700, q: 0.7 });
  tone(bus, 92, { type: 'sawtooth', attack: 0.04, decay: 0.3, gain: 0.05, glideTo: 150 });
  const at = WIND + SLAM;
  tone(bus, 180, { type: 'square', attack: 0.004, decay: 0.35, gain: 0.07, glideTo: 60, delay: at });
  tone(bus, 1250, { type: 'sine', attack: 0.002, decay: 0.18, gain: 0.05, glideTo: 700, delay: at });
  tone(bus, 110, { type: 'sawtooth', attack: 0.02, decay: 0.7, gain: 0.04, glideTo: 96, delay: at + 0.05 });
  s.crackle = true;
}

function drawHilt(ctx: CanvasRenderingContext2D, b: Blade, u: number, metal: string) {
  const c = Math.cos(b.a);
  const sn = Math.sin(b.a);
  const len = 34 * u;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#1b1b22';
  ctx.lineWidth = 8 * u;
  ctx.beginPath();
  ctx.moveTo(b.x + c * 4 * u, b.y + sn * 4 * u);
  ctx.lineTo(b.x - c * len, b.y - sn * len);
  ctx.stroke();
  ctx.strokeStyle = metal;
  ctx.lineWidth = 5.5 * u;
  ctx.beginPath();
  ctx.moveTo(b.x + c * 4 * u, b.y + sn * 4 * u);
  ctx.lineTo(b.x - c * len, b.y - sn * len);
  ctx.stroke();
  // grip bands
  ctx.strokeStyle = '#141419';
  ctx.lineWidth = 6 * u;
  for (let i = 1; i <= 3; i++) {
    const d = (8 + i * 6) * u;
    ctx.beginPath();
    ctx.moveTo(b.x - c * d, b.y - sn * d);
    ctx.lineTo(b.x - c * (d + 2.5 * u), b.y - sn * (d + 2.5 * u));
    ctx.stroke();
  }
}

function drawBlades(ctx: CanvasRenderingContext2D, s: State, L: number, u: number, hum: number) {
  const base = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  blade(ctx, s.blue, L, u, hum, BLUE_GLOW, BLUE_MID, base);
  blade(ctx, s.red, L, u, 2 - hum, RED_GLOW, RED_MID, base);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = base;
}

function blade(
  ctx: CanvasRenderingContext2D,
  b: Blade,
  L: number,
  u: number,
  hum: number,
  glow: string,
  mid: string,
  base: number
) {
  const x0 = b.x + Math.cos(b.a) * 5 * u;
  const y0 = b.y + Math.sin(b.a) * 5 * u;
  const x1 = b.x + Math.cos(b.a) * L;
  const y1 = b.y + Math.sin(b.a) * L;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = glow;
  ctx.globalAlpha = base * 0.08;
  ctx.lineWidth = 44 * u * hum;
  ctx.stroke();
  ctx.globalAlpha = base * 0.14;
  ctx.lineWidth = 24 * u * hum;
  ctx.stroke();
  ctx.globalAlpha = base * 0.3;
  ctx.lineWidth = 13 * u * hum;
  ctx.stroke();
  ctx.strokeStyle = mid;
  ctx.globalAlpha = base * 0.55;
  ctx.lineWidth = 8.5 * u * hum;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = base * 0.95;
  ctx.lineWidth = 3.6 * u;
  ctx.stroke();
}

/**
 * Fill a silhouette with a lit rim on the side facing the light (+o) and a fainter
 * back rim on the other side: three offset fills of the same path, clipped to it.
 */
function rimLit(
  ctx: CanvasRenderingContext2D,
  trace: () => void,
  body: string,
  rim: string,
  back: string,
  ox: number,
  oy: number
) {
  ctx.save();
  ctx.beginPath();
  trace();
  ctx.fillStyle = back;
  ctx.fill();
  ctx.clip();
  ctx.translate(ox * 0.6, oy * 0.6);
  ctx.beginPath();
  trace();
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.translate(-ox * 1.6, -oy * 1.6);
  ctx.beginPath();
  trace();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
}
