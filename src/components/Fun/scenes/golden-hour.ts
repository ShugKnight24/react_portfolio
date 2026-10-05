import {
  createCanvasScene,
  clamp,
  damp,
  easeOutBack,
  easeOutCubic,
  lerp,
  rand,
  tone,
  TAU,
} from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Golden Hour: a camera viewfinder pointed at a synthwave sun setting over a neon grid.
 * The pointer pans the camera with layered parallax (sun, mountains, grid). A click fires
 * the shutter: the frame blinks, a flash washes the screen, and the exact framing is
 * captured into an instant print that flies into a stack in the corner and slowly develops.
 */

interface Print {
  cv: HTMLCanvasElement;
  age: number;
  /** Start rect centre and size (the captured square in the viewfinder) */
  sx: number;
  sy: number;
  sw: number;
  rot: number;
  dx: number;
  dy: number;
  /** Fades out once pushed off the stack */
  leaving: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

interface State {
  px: number;
  py: number;
  amb: number;
  scroll: number;
  flash: number;
  shutter: number;
  lock: number;
  frames: number;
  pending: boolean;
  drawn: boolean;
  prints: Print[];
  pool: HTMLCanvasElement[];
  stars: Star[];
  far: number[];
  near: number[];
  sky: CanvasGradient | null;
  vignette: CanvasGradient | null;
  sunFill: CanvasGradient | null;
  sunGlow: CanvasGradient | null;
  sunR: number;
  noiseBuf: AudioBuffer | null;
}

const THUMB = 180;
const MAX_PRINTS = 4;
const FLIGHT = 0.8;

const ridge = (n: number, rough: number) => {
  const pts: number[] = [];
  let y = rand(0.3, 0.7);
  for (let i = 0; i <= n; i++) {
    y = clamp(y + rand(-rough, rough), 0.05, 1);
    pts.push(y);
  }
  return pts;
};

const frameInset = (env: SceneEnv) => Math.max(14, Math.min(env.w, env.h) * 0.055);
const printWidth = (env: SceneEnv) => clamp(Math.min(env.w, env.h) * 0.19, 60, 112);

function shutterSound(s: State, bus: AudioBus) {
  const { ctx, out } = bus;
  if (!s.noiseBuf || s.noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 0.06);
    s.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = s.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  // Two mechanical clicks: mirror up, then curtain close
  const click = (at: number, freq: number, gain: number) => {
    const src = ctx.createBufferSource();
    src.buffer = s.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start(ctx.currentTime + at);
  };
  click(0, 3200, 0.9);
  click(0.075, 2100, 0.7);
  tone(bus, 140, { type: 'sine', attack: 0.002, decay: 0.08, gain: 0.25, glideTo: 60 });
  // Small motor wind after the shot
  tone(bus, 90, { type: 'sawtooth', attack: 0.03, decay: 0.22, gain: 0.03, glideTo: 70, delay: 0.16 });
}

function takePhoto(s: State, env: SceneEnv) {
  if (s.shutter > 0 && s.shutter < 0.12) return;
  s.flash = 1;
  s.shutter = 0.0001;
  s.lock = 1;
  s.pending = true;
  s.frames = s.frames <= 1 ? 36 : s.frames - 1;
  const bus = env.audio();
  if (bus) shutterSound(s, bus);
  env.wake(2600);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.2,
    init: () => ({
      px: 0.18,
      py: -0.1,
      amb: 1.3,
      scroll: 0.35,
      flash: 0,
      shutter: 0,
      lock: 0,
      frames: 36,
      pending: false,
      drawn: false,
      prints: [],
      pool: [],
      stars: Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.pow(Math.random(), 1.6) * 0.5,
        r: rand(0.5, 1.4),
        phase: rand(0, TAU),
      })),
      far: ridge(28, 0.14),
      near: ridge(18, 0.22),
      sky: null,
      vignette: null,
      sunFill: null,
      sunGlow: null,
      sunR: 100,
      noiseBuf: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.66);
      sky.addColorStop(0, '#07060f');
      sky.addColorStop(0.35, '#140a2a');
      sky.addColorStop(0.7, '#3b1150');
      sky.addColorStop(0.92, '#8a2a6a');
      sky.addColorStop(1, '#c2456e');
      s.sky = sky;
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(7,6,15,0)');
      vg.addColorStop(1, 'rgba(7,6,15,0.72)');
      s.vignette = vg;
      const R = Math.min(w * 0.27, h * 0.28);
      s.sunR = R;
      const sf = ctx.createLinearGradient(0, -R, 0, R * 0.45);
      sf.addColorStop(0, '#fff6b0');
      sf.addColorStop(0.28, '#ffd84d');
      sf.addColorStop(0.55, '#ffb347');
      sf.addColorStop(0.85, '#ff4fa3');
      sf.addColorStop(1, '#d9338a');
      s.sunFill = sf;
      const sg = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.4);
      sg.addColorStop(0, 'rgba(255,179,71,0.45)');
      sg.addColorStop(0.4, 'rgba(255,79,163,0.16)');
      sg.addColorStop(1, 'rgba(255,79,163,0)');
      s.sunGlow = sg;
    },
    update: (s, env, dt) => {
      const { pointer, reducedMotion } = env;
      const ambient = !reducedMotion || !s.drawn;
      if (ambient) {
        s.amb += dt;
        s.scroll += dt * 0.55;
      }
      let tx: number;
      let ty: number;
      if (env.interactive && pointer.inside) {
        tx = clamp((pointer.x / env.w - 0.5) * 2, -1, 1);
        ty = clamp((pointer.y / env.h - 0.5) * 2, -1, 1);
      } else if (!reducedMotion) {
        tx = Math.sin(s.amb * 0.23) * 0.4 + 0.1;
        ty = Math.sin(s.amb * 0.17 + 1) * 0.18 - 0.05;
      } else {
        tx = s.px;
        ty = s.py;
      }
      // Heavier smoothing feels like a camera with some mass
      s.px = damp(s.px, tx, 4.5, dt);
      s.py = damp(s.py, ty, 4.5, dt);
      s.flash = Math.max(0, s.flash - dt * 3.2);
      if (s.shutter > 0) {
        s.shutter += dt;
        if (s.shutter > 0.24) s.shutter = 0;
      }
      s.lock = Math.max(0, s.lock - dt * 0.9);
      for (let i = s.prints.length - 1; i >= 0; i--) {
        const p = s.prints[i];
        p.age += dt;
        if (p.leaving > 0) {
          p.leaving += dt * 2.5;
          if (p.leaving >= 1) {
            s.pool.push(p.cv);
            s.prints.splice(i, 1);
          }
        }
      }
    },
    draw: (s, env) => {
      const { ctx, w, h, dpr } = env;
      s.drawn = true;
      const R = s.sunR;
      const hy = h * 0.6 - s.py * h * 0.07;
      const pan = -s.px * w;

      // Sky and stars
      ctx.fillStyle = s.sky ?? '#07060f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f4ecff';
      for (const st of s.stars) {
        const x = ((st.x * w * 1.1 + pan * 0.02) % (w * 1.1) + w * 1.1) % (w * 1.1) - w * 0.05;
        const y = st.y * hy;
        ctx.globalAlpha = (0.35 + 0.35 * Math.sin(s.amb * 1.3 + st.phase)) * (1 - y / hy);
        ctx.fillRect(x, y, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      // Sun with its glow, far layer: moves least
      const sx = w / 2 + pan * 0.045;
      const sy = hy - R * 0.5;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = s.sunGlow ?? 'transparent';
      ctx.fillRect(-R * 2.4, -R * 2.4, R * 4.8, R * 4.8);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.clip();
      ctx.fillStyle = s.sunFill ?? '#ffb347';
      const y0 = -R * 0.18;
      ctx.fillRect(-R, -R, R * 2, y0 + R);
      const period = R * 0.13;
      const phase = (s.amb * R * 0.06) % period;
      for (let y = y0 - period + phase; y < R; y += period) {
        const k = clamp((y - y0) / (R * 0.7), 0, 1);
        const gap = period * (0.14 + 0.6 * k);
        const top = Math.max(y0, y);
        const bottom = y + period - gap;
        if (bottom > top) ctx.fillRect(-R, top, R * 2, bottom - top);
      }
      ctx.restore();

      // Mountains: two ridges with a rim light from the sun
      const drawRidge = (pts: number[], par: number, height: number, fill: string, rim: string) => {
        const span = w * 1.4;
        const x0 = -w * 0.2 + pan * par;
        ctx.beginPath();
        ctx.moveTo(x0, hy + 1);
        for (let i = 0; i < pts.length; i++) {
          const u = i / (pts.length - 1);
          // Lower in the middle so the ridges frame the sun instead of hiding it
          const xs = x0 + u * span;
          const side = 0.25 + 0.75 * Math.min(1, Math.abs(xs - sx) / (R * 2.2));
          ctx.lineTo(xs, hy - pts[i] * height * side);
        }
        ctx.lineTo(x0 + span, hy + 1);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      drawRidge(s.far, 0.07, Math.min(h * 0.2, R * 1.1), '#241040', 'rgba(255,120,190,0.35)');
      drawRidge(s.near, 0.1, Math.min(h * 0.12, R * 0.7), '#140824', 'rgba(255,79,163,0.55)');

      // Ground and perspective grid
      const ground = ctx.createLinearGradient(0, hy, 0, h);
      ground.addColorStop(0, '#1d0a30');
      ground.addColorStop(1, '#07060f');
      ctx.fillStyle = ground;
      ctx.fillRect(0, hy, w, h - hy);

      // Sun reflection on the floor
      const refl = ctx.createRadialGradient(sx, hy, 0, sx, hy, R * 1.6);
      refl.addColorStop(0, 'rgba(255,150,120,0.28)');
      refl.addColorStop(1, 'rgba(255,79,163,0)');
      ctx.fillStyle = refl;
      ctx.fillRect(sx - R * 1.6, hy, R * 3.2, R * 1.6);

      const f = h - hy;
      const vx = w / 2 + pan * 0.13;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, hy, w, h - hy);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const vfade = ctx.createLinearGradient(0, hy, 0, h);
      vfade.addColorStop(0, 'rgba(255,79,163,0)');
      vfade.addColorStop(0.35, 'rgba(255,79,163,0.45)');
      vfade.addColorStop(1, 'rgba(255,110,190,0.9)');
      ctx.strokeStyle = vfade;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const zFar = 40;
      const spacing = 0.55;
      const lines = Math.ceil((w / f) * zFar * 0.05) + 14;
      for (let i = -lines; i <= lines; i++) {
        const X = i * spacing;
        ctx.moveTo(vx + (f * X) / zFar, hy + f / zFar);
        ctx.lineTo(vx + (f * X) / 0.6, hy + f / 0.6);
      }
      ctx.stroke();
      const sc = s.scroll % 1;
      for (let k = 0; k < 22; k++) {
        const z = 1 + k - sc - 0.4;
        if (z <= 0.3) continue;
        const y = hy + f / z;
        if (y > h + 2) continue;
        const a = Math.pow(clamp(1.6 / z, 0, 1), 1.3) * clamp((22 - z) / 6, 0, 1);
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = '#ff5fae';
        ctx.lineWidth = 0.6 + a * 1.2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Horizon glow line
      const hg = ctx.createLinearGradient(0, hy - 14, 0, hy + 14);
      hg.addColorStop(0, 'rgba(255,79,163,0)');
      hg.addColorStop(0.5, 'rgba(255,140,190,0.55)');
      hg.addColorStop(1, 'rgba(255,79,163,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, hy - 14, w, 28);
      ctx.fillStyle = '#ffd1e6';
      ctx.fillRect(0, hy - 0.5, w, 1);

      // Capture the clean frame (no viewfinder overlay) into a print
      const side = Math.min(w, h) * 0.62;
      const cx = w / 2;
      const cy = h / 2;
      if (s.pending) {
        s.pending = false;
        const cv = s.pool.pop() ?? document.createElement('canvas');
        cv.width = THUMB;
        cv.height = THUMB;
        const tctx = cv.getContext('2d');
        if (tctx) {
          tctx.drawImage(env.canvas, (cx - side / 2) * dpr, (cy - side / 2) * dpr, side * dpr, side * dpr, 0, 0, THUMB, THUMB);
          // Warm instant film tint
          tctx.globalCompositeOperation = 'soft-light';
          tctx.fillStyle = 'rgba(255,200,140,0.35)';
          tctx.fillRect(0, 0, THUMB, THUMB);
          tctx.globalCompositeOperation = 'source-over';
        }
        const live = s.prints.filter((p) => p.leaving === 0);
        if (live.length >= MAX_PRINTS) live[0].leaving = 0.0001;
        s.prints.push({
          cv,
          age: 0,
          sx: cx,
          sy: cy,
          sw: side,
          rot: rand(-0.14, 0.14),
          dx: rand(-5, 5),
          dy: rand(-4, 4),
          leaving: 0,
        });
      }

      // Viewfinder overlay
      ctx.fillStyle = s.vignette ?? 'transparent';
      ctx.fillRect(0, 0, w, h);
      const m = frameInset(env);
      const arm = Math.min(w, h) * 0.07;
      ctx.strokeStyle = 'rgba(244,236,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let c = 0; c < 4; c++) {
        const x = c % 2 === 0 ? m : w - m;
        const y = c < 2 ? m : h - m;
        const sxn = c % 2 === 0 ? 1 : -1;
        const syn = c < 2 ? 1 : -1;
        ctx.moveTo(x + arm * sxn, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + arm * syn);
      }
      ctx.stroke();

      // Rule of thirds
      ctx.strokeStyle = 'rgba(244,236,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(m + ((w - 2 * m) * i) / 3, m);
        ctx.lineTo(m + ((w - 2 * m) * i) / 3, h - m);
        ctx.moveTo(m, m + ((h - 2 * m) * i) / 3);
        ctx.lineTo(w - m, m + ((h - 2 * m) * i) / 3);
      }
      ctx.stroke();

      // AF points: the one over the sun lights up green
      const afx = Math.min(w * 0.16, 150);
      const afy = Math.min(h * 0.15, 90);
      let best = -1;
      let bestD = R * 0.9;
      for (let i = 0; i < 9; i++) {
        const ax = cx + ((i % 3) - 1) * afx;
        const ay = cy + (Math.floor(i / 3) - 1) * afy;
        const d = Math.hypot(ax - sx, ay - sy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const blink = s.lock > 0 ? 0.5 + 0.5 * Math.cos(s.lock * 26) : 0;
      for (let i = 0; i < 9; i++) {
        const ax = cx + ((i % 3) - 1) * afx;
        const ay = cy + (Math.floor(i / 3) - 1) * afy;
        const hot = i === best;
        const sz = hot ? 16 : 12;
        ctx.strokeStyle = hot
          ? `rgba(93,255,176,${(0.75 + blink * 0.25).toFixed(3)})`
          : 'rgba(244,236,255,0.28)';
        ctx.lineWidth = hot ? 1.5 : 1;
        ctx.strokeRect(ax - sz / 2, ay - sz / 2, sz, sz);
        if (hot && s.lock > 0) {
          ctx.fillStyle = `rgba(93,255,176,${(0.25 * s.lock).toFixed(3)})`;
          ctx.fillRect(ax - sz / 2, ay - sz / 2, sz, sz);
        }
      }

      // Centre reticle
      ctx.strokeStyle = 'rgba(244,236,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, TAU);
      ctx.moveTo(cx - 22, cy);
      ctx.lineTo(cx - 10, cy);
      ctx.moveTo(cx + 10, cy);
      ctx.lineTo(cx + 22, cy);
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx, cy - 10);
      ctx.moveTo(cx, cy + 10);
      ctx.lineTo(cx, cy + 22);
      ctx.stroke();

      // Readouts
      const fs = 12;
      ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(244,236,255,0.82)';
      const tx = m + 10;
      const ty = h - m - 10;
      ctx.fillText(w < 420 ? 'F2.8  ISO 800' : '1/250   F2.8   ISO 800', tx, ty);
      ctx.fillStyle = '#5dffb0';
      ctx.beginPath();
      ctx.arc(m + 14, m + 15, 3.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(244,236,255,0.82)';
      ctx.fillText('AF', m + 24, m + 19);
      // Battery and remaining frames, top right
      const bx = w - m - 34;
      const by = m + 9;
      ctx.strokeStyle = 'rgba(244,236,255,0.82)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, 24, 11);
      ctx.fillRect(bx + 24, by + 3, 2, 5);
      ctx.fillRect(bx + 2, by + 2, 15, 7);
      ctx.textAlign = 'right';
      ctx.fillText(String(s.frames), bx - 10, by + 10);
      ctx.textAlign = 'left';

      // Prints stack, newest on top
      const pw = printWidth(env);
      const ph = pw * 1.2;
      const baseX = w - m - pw / 2 - 8;
      const baseY = h - m - ph / 2 - 8;
      let slot = 0;
      for (let i = s.prints.length - 1; i >= 0; i--) {
        if (s.prints[i].leaving === 0) slot++;
      }
      let rank = slot;
      for (const p of s.prints) {
        if (p.leaving === 0) rank--;
        const k = clamp(p.age / FLIGHT, 0, 1);
        const e = easeOutCubic(k);
        const depth = p.leaving > 0 ? MAX_PRINTS : rank;
        const tx2 = baseX + p.dx - depth * 3;
        const ty2 = baseY + p.dy - depth * 2;
        const x = lerp(p.sx, tx2, e);
        const y = lerp(p.sy, ty2, e) - Math.sin(k * Math.PI) * h * 0.06;
        // Photo area is square: start scale matches the captured square
        const photo = pw * 0.86;
        const scale = lerp(p.sw / photo, 1, e);
        const rot = p.rot * easeOutBack(k);
        const fade = p.leaving > 0 ? 1 - p.leaving : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(x, y + (p.leaving > 0 ? p.leaving * 20 : 0));
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        const frameA = clamp(k * 3, 0, 1);
        ctx.fillStyle = `rgba(0,0,0,${(0.45 * frameA).toFixed(3)})`;
        ctx.fillRect(-pw / 2 + 3, -ph / 2 + 5, pw, ph);
        ctx.globalAlpha = fade * frameA;
        ctx.fillStyle = '#f4eee2';
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.globalAlpha = fade;
        const inset = (pw - photo) / 2;
        const ix = -pw / 2 + inset;
        const iy = -ph / 2 + inset;
        ctx.drawImage(p.cv, ix, iy, photo, photo);
        // Instant film develops from a dark haze
        const dev = clamp((p.age - FLIGHT * 0.5) / 1.8, 0, 1);
        const haze = k < 1 ? frameA * (1 - dev) : 1 - dev;
        if (haze > 0.01) {
          ctx.fillStyle = `rgba(28,20,40,${(0.9 * haze).toFixed(3)})`;
          ctx.fillRect(ix, iy, photo, photo);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Shutter blink and flash
      if (s.shutter > 0) {
        const k = s.shutter < 0.07 ? s.shutter / 0.07 : 1 - (s.shutter - 0.07) / 0.17;
        const cover = easeOutCubic(clamp(k, 0, 1)) * h * 0.5;
        ctx.fillStyle = '#07060f';
        ctx.fillRect(0, 0, w, cover);
        ctx.fillRect(0, h - cover, w, cover);
      }
      if (s.flash > 0) {
        const peak = env.reducedMotion ? 0.35 : 0.85;
        ctx.fillStyle = `rgba(255,248,236,${(s.flash * s.flash * peak).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env) => takePhoto(s, env),
    onPointerMove: (_s, env) => {
      // Let the camera settle on the new framing under reduced motion too
      if (env.reducedMotion) env.wake(700);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) takePhoto(s, env);
      return true;
    },
    dispose: (s) => {
      for (const p of s.prints) {
        p.cv.width = 0;
        p.cv.height = 0;
      }
      for (const cv of s.pool) {
        cv.width = 0;
        cv.height = 0;
      }
      s.prints.length = 0;
      s.pool.length = 0;
      s.noiseBuf = null;
    },
  });
