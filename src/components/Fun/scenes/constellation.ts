import { createCanvasScene, rand, tone, TAU, damp } from './runtime';
import type { MountScene } from './types';

/**
 * Constellation: drifting motes that link into a network near each other and the cursor.
 * Polish over the original: depth layers with parallax, a cursor "gravity well" that
 * gathers nearby motes, click to drop a new star that pulses and chimes, and linked
 * edges that glow in the Arcade OS green and magenta.
 */

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number; // 0 far, 1 near
  r: number;
  phase: number;
  pulse: number; // 0..1 highlight after being spawned
}

interface State {
  motes: Mote[];
  gx: number;
  gy: number;
  pull: number;
}

const GREEN = [93, 255, 176];
const PINK = [255, 79, 163];
const PENTATONIC = [392, 440, 523.25, 587.33, 659.25, 783.99];

const spawn = (w: number, h: number, x = rand(0, w), y = rand(0, h), pulse = 0): Mote => {
  const z = Math.random();
  return {
    x,
    y,
    vx: rand(-6, 6),
    vy: rand(-14, -3) * (0.4 + z),
    z,
    r: 0.7 + z * 1.9,
    phase: rand(0, TAU),
    pulse,
  };
};

const targetCount = (w: number, h: number) => Math.round(Math.min(160, Math.max(48, (w * h) / 4200)));

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 3,
    init: (env) => ({
      motes: Array.from({ length: targetCount(env.w, env.h) }, () => spawn(env.w, env.h)),
      gx: env.w / 2,
      gy: env.h / 2,
      pull: 0,
    }),
    resize: (s, env) => {
      const want = targetCount(env.w, env.h);
      while (s.motes.length < want) s.motes.push(spawn(env.w, env.h));
      if (s.motes.length > want) s.motes.length = want;
    },
    update: (s, env, dt, t) => {
      const { w, h, pointer } = env;
      const active = env.interactive && pointer.inside;
      s.gx = damp(s.gx, pointer.x, 8, dt);
      s.gy = damp(s.gy, pointer.y, 8, dt);
      s.pull = damp(s.pull, active ? (pointer.down ? 1 : 0.45) : 0, 4, dt);
      for (const m of s.motes) {
        const sway = Math.sin(t * 0.6 + m.phase) * 6;
        m.x += (m.vx + sway) * dt;
        m.y += m.vy * dt;
        if (s.pull > 0.01) {
          const dx = s.gx - m.x;
          const dy = s.gy - m.y;
          const d2 = dx * dx + dy * dy + 900;
          const f = (s.pull * 90000 * (0.5 + m.z)) / d2;
          m.x += dx * f * dt * 0.05;
          m.y += dy * f * dt * 0.05;
        }
        m.pulse = Math.max(0, m.pulse - dt * 0.5);
        if (m.y < -12) {
          m.y = h + 12;
          m.x = rand(0, w);
        }
        if (m.x < -12) m.x = w + 12;
        if (m.x > w + 12) m.x = -12;
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#15112a');
      bg.addColorStop(1, '#07060f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // Two slow nebula clouds give the field depth
      const neb = (x: number, y: number, r: number, c: number[], a: number) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const R = Math.max(w, h);
      neb(w * (0.25 + Math.sin(t * 0.05) * 0.05), h * 0.3, R * 0.45, PINK, 0.07);
      neb(w * (0.75 + Math.cos(t * 0.04) * 0.05), h * 0.75, R * 0.5, GREEN, 0.06);

      const link = Math.min(130, Math.max(80, Math.min(w, h) * 0.2));
      const link2 = link * link;
      const ms = s.motes;
      ctx.lineWidth = 1;
      for (let i = 0; i < ms.length; i++) {
        const a = ms[i];
        for (let j = i + 1; j < ms.length; j++) {
          const b = ms[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > link2) continue;
          const k = 1 - Math.sqrt(d2) / link;
          const depth = (a.z + b.z) / 2;
          const hot = Math.max(a.pulse, b.pulse);
          const c = hot > 0.05 ? PINK : GREEN;
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(k * (0.1 + depth * 0.4) + hot * k * 0.5).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      if (s.pull > 0.02) {
        const ring = ctx.createRadialGradient(s.gx, s.gy, 0, s.gx, s.gy, 120);
        ring.addColorStop(0, `rgba(93,255,176,${0.1 * s.pull})`);
        ring.addColorStop(1, 'rgba(93,255,176,0)');
        ctx.fillStyle = ring;
        ctx.fillRect(s.gx - 120, s.gy - 120, 240, 240);
      }

      for (const m of ms) {
        const flicker = 0.75 + 0.25 * Math.sin(t * 2 + m.phase);
        const c = m.pulse > 0.05 ? PINK : GREEN;
        const alpha = Math.min(1, (0.35 + m.z * 0.65) * flicker);
        if (m.z > 0.7 || m.pulse > 0) {
          const glow = m.r * (4 + m.pulse * 10);
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, glow);
          g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${(alpha * 0.35 + m.pulse * 0.4).toFixed(3)})`);
          g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(m.x - glow, m.y - glow, glow * 2, glow * 2);
        }
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r + m.pulse * 2, 0, TAU);
        ctx.fill();
      }
    },
    onPointerDown: (s, env, x, y) => {
      for (let i = 0; i < 5; i++) {
        const m = spawn(env.w, env.h, x + rand(-18, 18), y + rand(-18, 18), 1);
        m.z = 0.8 + Math.random() * 0.2;
        m.r = 1.8 + m.z;
        s.motes.push(m);
      }
      if (s.motes.length > 220) s.motes.splice(0, s.motes.length - 220);
      const bus = env.audio();
      if (bus) {
        const f = PENTATONIC[Math.floor((1 - y / env.h) * PENTATONIC.length) % PENTATONIC.length];
        tone(bus, f, { type: 'triangle', decay: 0.9, gain: 0.18 });
        tone(bus, f * 2, { type: 'sine', decay: 0.6, gain: 0.05, delay: 0.04 });
      }
    },
  });
