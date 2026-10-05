import { createCanvasScene, clamp, damp, easeInOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { drawGlyph, GLYPH_COUNT, greenGrade, limb, makeGlyphAtlas, Rain, TINT_BRIGHT, TINT_HEAD } from './matrix-kit';
import type { GlyphAtlas } from './matrix-kit';

/**
 * Red Pill or Blue Pill: Morpheus in his red leather chair on a stormy night, hands open,
 * a capsule in each palm and both reflected in his little round sunglasses. Hovering a pill
 * previews the choice (the room warms toward red or cools toward blue, the pill lifts and its
 * reflection brightens). Choosing red fizzes the capsule into glyphs, spreads a mirror-like
 * liquid over everything and dissolves the room into cascading code; choosing blue fades to a
 * calm, ordinary morning. Either way the offer comes back after a moment.
 */

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

interface State {
  atlas: GlyphAtlas;
  rain: Rain;
  bits: Bit[];
  bitNext: number;
  drops: Drop[];
  motes: Float32Array;
  /** -1 blue, 0 neither, 1 red */
  hover: number;
  mood: number;
  lift: [number, number];
  /** 0 idle, 1 red, 2 blue */
  choice: number;
  ct: number;
  touched: boolean;
  lightning: number;
  nextBolt: number;
  bolt: number;
  demoT: number;
  idle: number;
  // layout
  s: number;
  cx: number;
  headY: number;
  hands: [number, number, number, number];
  bg: HTMLCanvasElement | null;
  vignette: CanvasGradient | null;
}

const MAX_BITS = 140;
const RED_T = 6.2;
const BLUE_T = 6;
const RED = '#d8232c';
const BLUE = '#2d62e0';

function bit(s: State, x: number, y: number, speed: number) {
  const b = s.bits[s.bitNext];
  s.bitNext = (s.bitNext + 1) % MAX_BITS;
  const a = rand(-Math.PI, 0);
  const v = speed * rand(0.3, 1);
  b.x = x;
  b.y = y;
  b.vx = Math.cos(a) * v;
  b.vy = Math.sin(a) * v - speed * 0.4;
  b.max = rand(0.8, 1.8);
  b.life = b.max;
  b.g = (Math.random() * GLYPH_COUNT) | 0;
}

function choose(s: State, env: SceneEnv, which: 1 | 2) {
  if (s.choice !== 0) return;
  s.choice = which;
  s.ct = 0;
  s.touched = true;
  s.idle = 0;
  env.wake(which === 1 ? RED_T * 1000 : BLUE_T * 1000);
  const [lx, ly, rx, ry] = s.hands;
  const x = which === 1 ? lx : rx;
  const y = which === 1 ? ly : ry;
  for (let i = 0; i < 60; i++) bit(s, x, y - 10 * s.s, 160 * s.s);
  const bus = env.audio();
  if (!bus) return;
  if (which === 1) {
    tone(bus, 180, { type: 'sawtooth', attack: 0.2, decay: 2.4, gain: 0.05, glideTo: 40 });
    tone(bus, 90, { type: 'sine', attack: 0.3, decay: 2.8, gain: 0.12, glideTo: 30 });
    noise(bus, { duration: 1.6, gain: 0.07, freq: 900, q: 0.4, type: 'lowpass' });
    for (let i = 0; i < 8; i++) {
      tone(bus, 600 + Math.random() * 1600, { type: 'square', attack: 0.002, decay: 0.05, gain: 0.02, delay: 0.6 + i * 0.13 });
    }
  } else {
    // a soft major chord and a bird or two
    const root = 392;
    [1, 1.25, 1.5, 2].forEach((m, i) =>
      tone(bus, root * m, { type: 'sine', attack: 0.4, decay: 2.6, gain: 0.04, delay: 0.3 + i * 0.12 })
    );
    for (let i = 0; i < 3; i++) {
      tone(bus, 2600, { type: 'sine', attack: 0.01, decay: 0.09, gain: 0.025, glideTo: 3600, delay: 1.4 + i * 0.16 });
    }
    tone(bus, 2300, { type: 'sine', attack: 0.01, decay: 0.12, gain: 0.02, glideTo: 3100, delay: 2.6 });
  }
}

function hitHand(s: State, x: number, y: number) {
  const [lx, ly, rx, ry] = s.hands;
  const r = 95 * s.s;
  if (Math.hypot(x - lx, y - ly) < r) return 1;
  if (Math.hypot(x - rx, y - ry) < r) return -1;
  return 0;
}

function setHover(s: State, env: SceneEnv, h: number) {
  if (h === s.hover) return;
  s.hover = h;
  env.canvas.style.cursor = h ? 'pointer' : 'default';
  const bus = s.touched && h ? env.audio() : null;
  if (bus) {
    if (h > 0) tone(bus, 196, { type: 'triangle', attack: 0.03, decay: 0.5, gain: 0.04 });
    else tone(bus, 440, { type: 'sine', attack: 0.03, decay: 0.5, gain: 0.03 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 2.2,
    init: () => ({
      atlas: makeGlyphAtlas(40),
      rain: new Rain(),
      bits: Array.from({ length: MAX_BITS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, g: 0 })),
      bitNext: 0,
      drops: Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.25, 0.6), len: rand(0.02, 0.06) })),
      motes: new Float32Array(40 * 3).map(() => Math.random()),
      hover: 0,
      mood: 0,
      lift: [0, 0],
      choice: 0,
      ct: 0,
      touched: false,
      lightning: 0,
      nextBolt: 1.2,
      bolt: 0,
      demoT: 0,
      idle: 0,
      s: 1,
      cx: 0,
      headY: 0,
      hands: [0, 0, 0, 0],
      bg: null,
      vignette: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.s = Math.min(w / 700, h / 420);
      const u = s.s;
      s.cx = w / 2;
      s.headY = h * 0.3;
      s.hands = [s.cx - 150 * u, h * 0.8, s.cx + 150 * u, h * 0.8];
      s.rain.resize(w, h, Math.max(10, 13 * u), 1);
      s.bg = buildRoom(s, env, s.bg);
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.75)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const u = s.s;
      // left alone, Morpheus waits and the hover drifts between the two
      if (!s.touched && s.choice === 0) {
        s.demoT += dt;
        const c = s.demoT % 6;
        s.hover = c < 1.2 ? 0 : c < 3 ? 1 : c < 3.8 ? 0 : -1;
      }
      s.mood = damp(s.mood, s.choice === 1 ? 1 : s.choice === 2 ? -1 : s.hover, 3, dt);
      s.lift[0] = damp(s.lift[0], s.hover > 0 && s.choice === 0 ? 1 : 0, 8, dt);
      s.lift[1] = damp(s.lift[1], s.hover < 0 && s.choice === 0 ? 1 : 0, 8, dt);

      if (s.choice !== 0) {
        s.ct += dt;
        if (s.ct > (s.choice === 1 ? RED_T : BLUE_T)) {
          s.choice = 0;
          s.ct = 0;
          s.hover = 0;
        }
      }
      if (s.choice === 1 && s.ct > 1.2) s.rain.update(dt * lerp(1, 1.6, clamp((s.ct - 1.2) / 2, 0, 1)));

      // storm outside: lightning in doubles, rain streaking the glass
      s.nextBolt -= dt;
      if (s.nextBolt <= 0) {
        s.bolt = 1;
        s.lightning = 1;
        s.nextBolt = rand(5, 9);
        const bus = s.touched && s.choice !== 2 ? env.audio() : null;
        if (bus) noise(bus, { duration: 1.6, gain: 0.08, freq: 220, q: 0.4, type: 'lowpass' });
      }
      if (s.bolt > 0) {
        s.bolt -= dt;
        if (s.bolt < 0.82 && s.bolt > 0.78) s.lightning = 0.8;
      }
      s.lightning = Math.max(0, s.lightning - dt * 5);
      for (const d of s.drops) {
        d.y += d.v * dt;
        if (d.y > 1.1) {
          d.y = -0.1;
          d.x = Math.random();
        }
      }
      for (const b of s.bits) {
        if (b.life <= 0) continue;
        b.life -= dt;
        b.vx *= 1 - dt * 1.2;
        b.vy -= 20 * u * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      const m = s.motes;
      for (let i = 0; i < m.length; i += 3) {
        m[i + 1] -= dt * 0.01 * (0.5 + m[i + 2]);
        m[i] += Math.sin(t * 0.3 + i) * dt * 0.004;
        if (m[i + 1] < 0) m[i + 1] += 1;
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#050606';
      ctx.fillRect(0, 0, w, h);

      // how far each ending has taken over
      let codeK = 0;
      let chromeK = 0;
      let morningK = 0;
      if (s.choice === 1) {
        const c = s.ct;
        chromeK = clamp((c - 0.35) / 2.3, 0, 1);
        codeK = clamp((c - 2.1) / 1.3, 0, 1) * (1 - clamp((c - (RED_T - 1.1)) / 1.1, 0, 1));
        if (c > RED_T - 1.1) chromeK = 0;
      } else if (s.choice === 2) {
        const c = s.ct;
        morningK = easeInOutCubic(clamp((c - 0.4) / 1.6, 0, 1)) * (1 - easeInOutCubic(clamp((c - (BLUE_T - 1.3)) / 1.3, 0, 1)));
      }

      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      drawWindow(ctx, s, w, h, t);
      drawMorpheus(ctx, s, t, h);
      drawHands(ctx, s, t);

      // mood light: warm from the red pill, cold from the blue
      const mood = s.mood;
      if (Math.abs(mood) > 0.01) {
        const red = mood > 0;
        const a = Math.abs(mood);
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = red ? '#b3261e' : '#2350b8';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const [lx, ly, rx, ry] = s.hands;
        const x = red ? lx : rx;
        const y = red ? ly : ry;
        const R = 420 * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, red ? 'rgba(255,70,50,0.28)' : 'rgba(60,120,255,0.28)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
        ctx.restore();
      }
      if (Math.abs(mood) < 0.9) greenGrade(ctx, w, h, 0.1 * (1 - Math.abs(mood)));

      // lightning washes the room
      if (s.lightning > 0.01 && morningK < 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(170,200,255,${(s.lightning * 0.16).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      if (chromeK > 0) drawChrome(ctx, s, w, h, t, chromeK);
      if (codeK > 0) {
        ctx.globalAlpha = codeK;
        ctx.fillStyle = '#010502';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        s.rain.draw(ctx, s.atlas, 0, 0, codeK * 0.75);
        // Morpheus stays, drawn in brighter code
        figure = s;
        const step = s.rain.size;
        const tick = Math.floor(t * 8);
        for (let gy = s.headY - 60 * u; gy < h; gy += step) {
          for (let gx = s.cx - 190 * u; gx < s.cx + 190 * u; gx += step * 0.8) {
            if (!inFigure(gx, gy)) continue;
            const hsh = ((gx * 7.1 + gy * 3.7) | 0) & 1023;
            const scan = 0.5 + 0.5 * Math.sin(gy / (40 * u) - t * 4);
            ctx.globalAlpha = codeK * (0.18 + scan * 0.45) * (0.6 + ((hsh >> 3) & 3) * 0.13);
            drawGlyph(ctx, s.atlas, (hsh + tick * ((hsh & 7) === 0 ? 1 : 0)) % GLYPH_COUNT, scan > 0.85 ? TINT_HEAD : TINT_BRIGHT, gx, gy, step);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (morningK > 0) drawMorning(ctx, s, w, h, t, morningK);

      // capsule fizz
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.bits) {
        if (b.life <= 0) continue;
        const k = b.life / b.max;
        ctx.globalAlpha = k;
        drawGlyph(ctx, s.atlas, b.g, k > 0.6 ? TINT_HEAD : TINT_BRIGHT, b.x, b.y, 14 * u);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (s.vignette) {
        ctx.globalAlpha = 1 - morningK * 0.6;
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    },
    onPointerMove: (s, env, x, y) => {
      if (s.choice !== 0) return;
      if (!s.touched) {
        s.touched = true;
        s.hover = 0;
      }
      setHover(s, env, hitHand(s, x, y));
      env.wake(900);
    },
    onPointerLeave: (s, env) => {
      if (s.touched) setHover(s, env, 0);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      const h = hitHand(s, x, y);
      setHover(s, env, h);
      if (h > 0) choose(s, env, 1);
      else if (h < 0) choose(s, env, 2);
    },
    onKey: (s, env, e, down) => {
      const key = e.key.toLowerCase();
      if (key === 'r' || key === 'b') {
        if (down && !e.repeat) {
          s.touched = true;
          setHover(s, env, key === 'r' ? 1 : -1);
          choose(s, env, key === 'r' ? 1 : 2);
        }
        return true;
      }
      if ((key === ' ' || key === 'enter') && s.hover !== 0) {
        if (down && !e.repeat && s.touched) choose(s, env, s.hover > 0 ? 1 : 2);
        return true;
      }
      return false;
    },
    dispose: (s) => {
      s.atlas.canvas.width = 0;
      if (s.bg) s.bg.width = 0;
    },
  });

let figure: State | null = null;
/** Inside Morpheus's head and shoulders, for the code version of him */
const inFigure = (x: number, y: number) => {
  const s = figure;
  if (!s) return 0;
  const u = s.s;
  const dx = (x - s.cx) / (44 * u);
  const dy = (y - s.headY) / (54 * u);
  if (dx * dx + dy * dy < 1) return 1;
  const sy = y - (s.headY + 60 * u);
  if (sy < 0) return Math.abs(x - s.cx) < 28 * u && sy > -30 * u ? 1 : 0;
  const half = 60 * u + Math.min(sy, 90 * u) * 1.2;
  return Math.abs(x - s.cx) < half ? 1 : 0;
};

/** The room behind him, baked: dark panelled walls, a lamp, and his red leather chair */
function buildRoom(s: State, env: SceneEnv, prev: HTMLCanvasElement | null) {
  const { w, h } = env;
  const u = s.s;
  const c = prev ?? document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * env.dpr));
  c.height = Math.max(1, Math.round(h * env.dpr));
  const g = c.getContext('2d');
  if (!g) return c;
  g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#0d0f0e');
  wall.addColorStop(1, '#070807');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  // wainscot panels
  g.strokeStyle = 'rgba(160,180,160,0.05)';
  g.lineWidth = 2 * u;
  for (let x = w * 0.05; x < w; x += 110 * u) {
    g.strokeRect(x, h * 0.55, 90 * u, h * 0.4);
  }
  // lamp on the right, warm pool on the wall
  const lamp = g.createRadialGradient(w * 0.86, h * 0.36, 0, w * 0.86, h * 0.36, h * 0.55);
  lamp.addColorStop(0, 'rgba(255,200,130,0.22)');
  lamp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1510';
  g.beginPath();
  g.moveTo(w * 0.86 - 24 * u, h * 0.3);
  g.lineTo(w * 0.86 + 24 * u, h * 0.3);
  g.lineTo(w * 0.86 + 34 * u, h * 0.4);
  g.lineTo(w * 0.86 - 34 * u, h * 0.4);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,215,160,0.4)';
  g.fillRect(w * 0.86 - 34 * u, h * 0.4 - 2 * u, 68 * u, 2 * u);

  // the red leather chair back, tufted, framing his head and shoulders
  const cx = s.cx;
  const top = s.headY - 110 * u;
  const cw = 190 * u;
  g.beginPath();
  g.moveTo(cx - cw, h);
  g.lineTo(cx - cw, top + 70 * u);
  g.quadraticCurveTo(cx - cw, top, cx - cw + 70 * u, top);
  g.lineTo(cx + cw - 70 * u, top);
  g.quadraticCurveTo(cx + cw, top, cx + cw, top + 70 * u);
  g.lineTo(cx + cw, h);
  g.closePath();
  const leather = g.createRadialGradient(cx - 60 * u, top + 60 * u, 10 * u, cx, top + 160 * u, 260 * u);
  leather.addColorStop(0, '#6e1a18');
  leather.addColorStop(0.5, '#4a0f0e');
  leather.addColorStop(1, '#220606');
  g.fillStyle = leather;
  g.fill();
  // tufting: buttons with pinched creases in a diamond grid
  for (let row = 0; row < 5; row++) {
    for (let col = -3; col <= 3; col++) {
      const bx = cx + col * 52 * u + (row % 2 ? 26 * u : 0);
      const by = top + 40 * u + row * 46 * u;
      if (Math.abs(bx - cx) > cw - 24 * u) continue;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1.5 * u;
      g.beginPath();
      g.moveTo(bx - 14 * u, by - 12 * u);
      g.lineTo(bx, by);
      g.lineTo(bx + 14 * u, by - 12 * u);
      g.moveTo(bx - 14 * u, by + 12 * u);
      g.lineTo(bx, by);
      g.lineTo(bx + 14 * u, by + 12 * u);
      g.stroke();
      g.fillStyle = '#1c0404';
      g.beginPath();
      g.arc(bx, by, 3 * u, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,160,140,0.25)';
      g.beginPath();
      g.arc(bx - 1 * u, by - 1 * u, 1.2 * u, 0, TAU);
      g.fill();
    }
  }
  // leather sheen on the rolled top
  g.strokeStyle = 'rgba(255,170,150,0.22)';
  g.lineWidth = 3 * u;
  g.beginPath();
  g.moveTo(cx - cw + 20 * u, top + 30 * u);
  g.quadraticCurveTo(cx - cw + 10 * u, top + 8 * u, cx - cw + 70 * u, top + 6 * u);
  g.lineTo(cx + cw - 90 * u, top + 6 * u);
  g.stroke();
  // chair arms, low at the sides
  g.fillStyle = '#3a0b0a';
  g.beginPath();
  g.ellipse(cx - cw - 10 * u, h * 0.9, 50 * u, 90 * u, 0, 0, TAU);
  g.ellipse(cx + cw + 10 * u, h * 0.9, 50 * u, 90 * u, 0, 0, TAU);
  g.fill();
  return c;
}

function drawWindow(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, t: number) {
  const u = s.s;
  const x = w * 0.06;
  const y = h * 0.1;
  const ww = 130 * u;
  const wh = 230 * u;
  const flash = s.lightning;
  const sky = ctx.createLinearGradient(0, y, 0, y + wh);
  sky.addColorStop(0, `rgb(${20 + flash * 150},${30 + flash * 160},${40 + flash * 190})`);
  sky.addColorStop(1, `rgb(${8 + flash * 60},${12 + flash * 70},${16 + flash * 90})`);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, ww, wh);
  // a lightning fork while the flash is up
  if (s.bolt > 0.6) {
    ctx.strokeStyle = `rgba(230,240,255,${(s.bolt - 0.6) * 2.5})`;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    let bx = x + ww * 0.6;
    let by = y;
    ctx.moveTo(bx, by);
    const seed = Math.floor(s.nextBolt * 10);
    for (let i = 0; i < 7; i++) {
      bx += (((seed * (i + 3)) % 7) - 3) * 4 * u;
      by += wh * 0.1;
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  // rain running down the glass
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ww, wh);
  ctx.clip();
  ctx.strokeStyle = `rgba(190,210,220,${0.18 + flash * 0.3})`;
  ctx.lineWidth = 1 * u;
  ctx.beginPath();
  for (const d of s.drops) {
    const dx = x + d.x * ww;
    const dy = y + d.y * wh;
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx - 1 * u, dy + d.len * wh);
  }
  ctx.stroke();
  ctx.restore();
  // frame and mullions
  ctx.strokeStyle = '#141412';
  ctx.lineWidth = 7 * u;
  ctx.strokeRect(x, y, ww, wh);
  ctx.lineWidth = 4 * u;
  ctx.beginPath();
  ctx.moveTo(x + ww / 2, y);
  ctx.lineTo(x + ww / 2, y + wh);
  ctx.moveTo(x, y + wh * 0.45);
  ctx.lineTo(x + ww, y + wh * 0.45);
  ctx.stroke();
  // cold window light across the floor and the chair edge
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x + ww, y + wh * 0.6, 0, x + ww, y + wh * 0.6, 360 * u);
  g.addColorStop(0, `rgba(120,150,190,${0.08 + flash * 0.25})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  void t;
}

const SKIN = '#4a2c20';
const SKIN_HI = '#8a5a42';
const SKIN_LO = '#24130d';
const PALM = '#9a6a52';

function drawMorpheus(ctx: CanvasRenderingContext2D, s: State, t: number, h: number) {
  const u = s.s;
  const cx = s.cx;
  const hy = s.headY + Math.sin(t * 0.8) * 1.2 * u;
  const flash = s.lightning;

  // long coat: broad shoulders, high collar, lapels
  ctx.beginPath();
  ctx.moveTo(cx - 170 * u, h);
  ctx.bezierCurveTo(cx - 172 * u, hy + 140 * u, cx - 150 * u, hy + 78 * u, cx - 60 * u, hy + 62 * u);
  ctx.lineTo(cx + 60 * u, hy + 62 * u);
  ctx.bezierCurveTo(cx + 150 * u, hy + 78 * u, cx + 172 * u, hy + 140 * u, cx + 170 * u, h);
  ctx.closePath();
  const coat = ctx.createLinearGradient(cx - 170 * u, 0, cx + 170 * u, 0);
  coat.addColorStop(0, '#1c1410');
  coat.addColorStop(0.3, '#2c1f18');
  coat.addColorStop(0.55, '#171009');
  coat.addColorStop(1, '#0b0806');
  ctx.fillStyle = coat;
  ctx.fill();
  // rim light on the shoulders from the window
  ctx.strokeStyle = `rgba(160,190,220,${0.35 + flash * 0.5})`;
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(cx - 168 * u, hy + 170 * u);
  ctx.bezierCurveTo(cx - 160 * u, hy + 100 * u, cx - 140 * u, hy + 78 * u, cx - 60 * u, hy + 64 * u);
  ctx.stroke();
  // shirt and vest in the V of the lapels
  ctx.fillStyle = '#0e0c0b';
  ctx.beginPath();
  ctx.moveTo(cx - 34 * u, hy + 60 * u);
  ctx.lineTo(cx + 34 * u, hy + 60 * u);
  ctx.lineTo(cx, hy + 190 * u);
  ctx.closePath();
  ctx.fill();
  // lapels
  ctx.fillStyle = '#231913';
  ctx.beginPath();
  ctx.moveTo(cx - 40 * u, hy + 54 * u);
  ctx.lineTo(cx - 8 * u, hy + 180 * u);
  ctx.lineTo(cx - 62 * u, hy + 110 * u);
  ctx.lineTo(cx - 70 * u, hy + 62 * u);
  ctx.closePath();
  ctx.moveTo(cx + 40 * u, hy + 54 * u);
  ctx.lineTo(cx + 70 * u, hy + 62 * u);
  ctx.lineTo(cx + 62 * u, hy + 110 * u);
  ctx.lineTo(cx + 8 * u, hy + 180 * u);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,180,150,0.14)';
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.moveTo(cx - 40 * u, hy + 54 * u);
  ctx.lineTo(cx - 8 * u, hy + 180 * u);
  ctx.moveTo(cx + 40 * u, hy + 54 * u);
  ctx.lineTo(cx + 8 * u, hy + 180 * u);
  ctx.stroke();

  // neck
  ctx.fillStyle = SKIN_LO;
  ctx.beginPath();
  ctx.moveTo(cx - 24 * u, hy + 30 * u);
  ctx.lineTo(cx + 24 * u, hy + 30 * u);
  ctx.lineTo(cx + 30 * u, hy + 66 * u);
  ctx.lineTo(cx - 30 * u, hy + 66 * u);
  ctx.closePath();
  ctx.fill();

  // the head: bald, lit warm from the lamp on the right, cool rim on the left
  ctx.save();
  ctx.translate(cx, hy);
  ctx.scale(1.14, 1.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, 38 * u, 46 * u, 0, 0, TAU);
  const head = ctx.createRadialGradient(14 * u, -22 * u, 4 * u, 0, 0, 50 * u);
  head.addColorStop(0, SKIN_HI);
  head.addColorStop(0.45, SKIN);
  head.addColorStop(1, SKIN_LO);
  ctx.fillStyle = head;
  ctx.fill();
  // ears
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(-38 * u, 2 * u, 6 * u, 11 * u, 0, 0, TAU);
  ctx.ellipse(38 * u, 2 * u, 6 * u, 11 * u, 0, 0, TAU);
  ctx.fill();
  // jaw, a touch squarer than the dome
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(-32 * u, 16 * u);
  ctx.quadraticCurveTo(-26 * u, 44 * u, 0, 50 * u);
  ctx.quadraticCurveTo(26 * u, 44 * u, 32 * u, 16 * u);
  ctx.closePath();
  ctx.fill();
  // dome highlight and cold rim
  ctx.strokeStyle = `rgba(170,200,230,${0.45 + flash * 0.5})`;
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.ellipse(0, 0, 37 * u, 45 * u, 0, Math.PI * 0.75, Math.PI * 1.35);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,215,180,0.25)';
  ctx.beginPath();
  ctx.ellipse(12 * u, -30 * u, 12 * u, 6 * u, -0.4, 0, TAU);
  ctx.fill();
  // brow, nose and the calm set mouth
  ctx.strokeStyle = 'rgba(15,6,3,0.7)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(-4 * u, 2 * u);
  ctx.quadraticCurveTo(-6 * u, 16 * u, -9 * u, 20 * u);
  ctx.quadraticCurveTo(0, 25 * u, 9 * u, 20 * u);
  ctx.stroke();
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.moveTo(-12 * u, 33 * u);
  ctx.quadraticCurveTo(0, 35 * u, 12 * u, 32.5 * u);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,70,55,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 36.5 * u, 9 * u, 2.4 * u, 0, 0, TAU);
  ctx.fill();

  // the little round sunglasses, pinched on, no arms
  const ly = -6 * u;
  const lr = 11 * u;
  ctx.strokeStyle = '#aab0b4';
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.moveTo(-3.5 * u, ly - 2 * u);
  ctx.quadraticCurveTo(0, ly - 5 * u, 3.5 * u, ly - 2 * u);
  ctx.stroke();
  for (let side = -1; side <= 1; side += 2) {
    const lx = side * 15 * u;
    ctx.fillStyle = '#030304';
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, TAU);
    ctx.fill();
    // each lens holds one pill: red on the left, blue on the right
    const red = side < 0;
    const lift = red ? s.lift[0] : s.lift[1];
    const gone = s.choice === (red ? 1 : 2) ? clamp(1 - s.ct * 2, 0, 1) : 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, lr - 0.6 * u, 0, TAU);
    ctx.clip();
    const sheen = ctx.createLinearGradient(lx - lr, ly - lr, lx + lr, ly + lr);
    sheen.addColorStop(0, 'rgba(90,110,120,0.35)');
    sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    ctx.globalAlpha = gone * (0.7 + lift * 0.3);
    capsule(ctx, lx + side * 1 * u, ly + 3 * u, 3.4 * u, red ? 0.5 : -0.5, red ? RED : BLUE, 0.35 + lift * 0.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(lx - 4 * u, ly - 5 * u, 1.6 * u, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#8c9296';
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** A glossy two tone capsule; size is the radius of its end caps */
function capsule(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, color: string, glow: number) {
  const L = r * 1.6;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  if (glow > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, color === RED ? `rgba(255,60,50,${glow * 0.5})` : `rgba(70,120,255,${glow * 0.5})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  limb(ctx, x - c * L, y - sn * L, x + c * L, y + sn * L, r, r);
  ctx.fillStyle = color;
  ctx.fill();
  // darker underside, bright glossy stripe along the top
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  limb(ctx, x - c * L + sn * r * 0.6, y - sn * L - c * r * 0.6 + r * 0.9, x + c * L + sn * r * 0.6, y + sn * L - c * r * 0.6 + r * 0.9, r, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = r * 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - c * L * 0.8 + sn * r * 0.45, y - sn * L * 0.8 - c * r * 0.45);
  ctx.lineTo(x + c * L * 0.5 + sn * r * 0.45, y + sn * L * 0.5 - c * r * 0.45);
  ctx.stroke();
  ctx.restore();
}

function drawHands(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const u = s.s;
  const [lx, ly, rx, ry] = s.hands;
  for (let side = -1; side <= 1; side += 2) {
    const red = side < 0;
    const x = red ? lx : rx;
    const y = (red ? ly : ry) + Math.sin(t * 0.8 + side) * 1.5 * u;
    const lift = red ? s.lift[0] : s.lift[1];
    // sleeve from the shoulder toward us
    ctx.beginPath();
    limb(ctx, s.cx + side * 100 * u, s.headY + 160 * u, x - side * 10 * u, y - 36 * u, 38 * u, 46 * u);
    const sl = ctx.createLinearGradient(0, s.headY + 100 * u, 0, y);
    sl.addColorStop(0, '#140e0a');
    sl.addColorStop(1, '#2a1d15');
    ctx.fillStyle = sl;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,170,140,0.15)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.ellipse(x - side * 10 * u, y - 36 * u, 44 * u, 16 * u, side * 0.15, Math.PI, TAU);
    ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(side, 1);
    // back of the hand and the thumb side, then the open palm cupped upward
    ctx.beginPath();
    ctx.ellipse(4 * u, -10 * u, 50 * u, 30 * u, 0.1, 0, TAU);
    ctx.fillStyle = SKIN;
    ctx.fill();
    // thumb, out to the side
    ctx.beginPath();
    limb(ctx, -30 * u, -18 * u, -62 * u, -38 * u, 14 * u, 10 * u);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.fillStyle = PALM;
    ctx.beginPath();
    ctx.ellipse(-58 * u, -38 * u, 6 * u, 5 * u, -0.5, 0, TAU);
    ctx.fill();
    // palm
    ctx.beginPath();
    ctx.ellipse(4 * u, -14 * u, 42 * u, 22 * u, 0.08, 0, TAU);
    const pg = ctx.createRadialGradient(0, -18 * u, 4 * u, 4 * u, -12 * u, 44 * u);
    pg.addColorStop(0, '#b98468');
    pg.addColorStop(0.7, PALM);
    pg.addColorStop(1, '#5c3a2b');
    ctx.fillStyle = pg;
    ctx.fill();
    // palm lines
    ctx.strokeStyle = 'rgba(70,35,22,0.45)';
    ctx.lineWidth = 1.3 * u;
    ctx.beginPath();
    ctx.moveTo(-26 * u, -20 * u);
    ctx.quadraticCurveTo(0, -4 * u, 30 * u, -16 * u);
    ctx.moveTo(-18 * u, -30 * u);
    ctx.quadraticCurveTo(4 * u, -24 * u, 24 * u, -30 * u);
    ctx.stroke();
    // fingers toward us, relaxed, tips curling up
    for (let f = 0; f < 4; f++) {
      const fx = -18 * u + f * 16 * u;
      const len = (f === 1 || f === 2 ? 24 : 19) * u;
      const ex = fx + (f - 1.5) * 3 * u;
      const ey = 4 * u + len;
      ctx.beginPath();
      limb(ctx, fx, 2 * u, ex, ey, 8.6 * u, 7.6 * u);
      const fg = ctx.createLinearGradient(fx - 8 * u, 0, fx + 8 * u, 0);
      fg.addColorStop(0, SKIN_LO);
      fg.addColorStop(0.5, PALM);
      fg.addColorStop(1, SKIN);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,20,12,0.5)';
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.moveTo(fx - 6 * u, 2 * u + len * 0.45);
      ctx.lineTo(fx + 6 * u, 2 * u + len * 0.48);
      ctx.stroke();
      // fingertip curling up toward the palm
      ctx.fillStyle = '#b08066';
      ctx.beginPath();
      ctx.ellipse(ex, ey - 2 * u, 5.6 * u, 4.2 * u, 0, 0, TAU);
      ctx.fill();
    }
    // the heel of the palm overlapping the finger roots
    ctx.beginPath();
    ctx.ellipse(6 * u, -4 * u, 40 * u, 10 * u, 0.05, 0, Math.PI);
    ctx.fillStyle = 'rgba(154,106,82,0.9)';
    ctx.fill();
    ctx.restore();

    // the capsule resting in the palm, lifting when hovered
    const gone = s.choice === (red ? 1 : 2) ? clamp(1 - s.ct * 3, 0, 1) : 1;
    if (gone > 0.01) {
      const px = x + side * 2 * u;
      const py = y - 18 * u - lift * 10 * u;
      ctx.fillStyle = `rgba(30,12,8,${0.4 - lift * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x + side * 4 * u, y - 10 * u, 22 * u, 6 * u, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = gone;
      capsule(ctx, px, py, 8 * u, red ? -0.35 : 0.35, red ? RED : BLUE, 0.3 + lift * 0.7);
      ctx.globalAlpha = 1;
    }
  }
}

/** Mirror liquid creeping out from the red pill's hand and over the whole frame */
function drawChrome(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, t: number, k: number) {
  const u = s.s;
  const x0 = s.hands[0];
  const y0 = s.hands[1];
  const R = easeInOutCubic(k) * Math.hypot(w, h) * 1.1;
  ctx.save();
  ctx.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const wob = 1 + Math.sin(a * 5 + t * 3) * 0.05 + Math.sin(a * 9 - t * 4) * 0.03;
    const x = x0 + Math.cos(a) * R * wob;
    const y = y0 + Math.sin(a) * R * wob;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();
  // bands of reflected light, rippling like the mirror in the film
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  const ph = (t * 0.25) % 1;
  for (let i = 0; i <= 12; i++) {
    const q = i / 12;
    const v = Math.pow(Math.sin((q + ph) * Math.PI * 3) * 0.5 + 0.5, 3);
    const c = Math.round(18 + v * 225);
    g.addColorStop(q, `rgb(${c - 12},${c},${c - 6})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // the room, faintly, as a warped reflection
  ctx.globalAlpha = 0.25;
  ctx.globalCompositeOperation = 'multiply';
  if (s.bg) ctx.drawImage(s.bg, 0, h, w, -h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.15 + k * 0.25;
  s.rain.draw(ctx, s.atlas, 0, 0, 1);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // bright meniscus at the edge
  ctx.strokeStyle = 'rgba(235,255,240,0.8)';
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const wob = 1 + Math.sin(a * 5 + t * 3) * 0.05 + Math.sin(a * 9 - t * 4) * 0.03;
    const x = x0 + Math.cos(a) * R * wob;
    const y = y0 + Math.sin(a) * R * wob;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** The blue pill: an ordinary morning, sun through the curtains */
function drawMorning(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, t: number, k: number) {
  const u = s.s;
  ctx.save();
  ctx.globalAlpha = k;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f6e7d3');
  sky.addColorStop(0.6, '#f1d2b0');
  sky.addColorStop(1, '#caa586');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // window with a pale blue sky and a low sun
  const wx = w * 0.56;
  const wy = h * 0.12;
  const ww = w * 0.3;
  const wh = h * 0.5;
  const win = ctx.createLinearGradient(0, wy, 0, wy + wh);
  win.addColorStop(0, '#a8d0f0');
  win.addColorStop(1, '#fbe3c0');
  ctx.fillStyle = win;
  ctx.fillRect(wx, wy, ww, wh);
  const sun = ctx.createRadialGradient(wx + ww * 0.3, wy + wh * 0.75, 0, wx + ww * 0.3, wy + wh * 0.75, ww * 0.9);
  sun.addColorStop(0, 'rgba(255,250,225,1)');
  sun.addColorStop(0.15, 'rgba(255,240,200,0.8)');
  sun.addColorStop(1, 'rgba(255,230,190,0)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  // soft clouds and the tops of the houses across the street
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(wx + ww * 0.7, wy + wh * 0.22, ww * 0.16, wh * 0.04, 0, 0, TAU);
  ctx.ellipse(wx + ww * 0.8, wy + wh * 0.2, ww * 0.1, wh * 0.05, 0, 0, TAU);
  ctx.ellipse(wx + ww * 0.25, wy + wh * 0.35, ww * 0.12, wh * 0.03, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = sun;
  ctx.fillRect(wx - ww, wy - wh * 0.5, ww * 3, wh * 2);
  ctx.fillStyle = 'rgba(190,160,150,0.8)';
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh);
  ctx.lineTo(wx, wy + wh * 0.8);
  ctx.lineTo(wx + ww * 0.15, wy + wh * 0.7);
  ctx.lineTo(wx + ww * 0.3, wy + wh * 0.8);
  ctx.lineTo(wx + ww * 0.3, wy + wh * 0.74);
  ctx.lineTo(wx + ww * 0.55, wy + wh * 0.74);
  ctx.lineTo(wx + ww * 0.55, wy + wh * 0.66);
  ctx.lineTo(wx + ww * 0.62, wy + wh * 0.66);
  ctx.lineTo(wx + ww * 0.62, wy + wh * 0.78);
  ctx.lineTo(wx + ww * 0.8, wy + wh * 0.68);
  ctx.lineTo(wx + ww, wy + wh * 0.78);
  ctx.lineTo(wx + ww, wy + wh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#e9dccb';
  ctx.lineWidth = 8 * u;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.stroke();
  // curtains, stirring
  const sway = Math.sin(t * 0.9) * 6 * u;
  ctx.fillStyle = 'rgba(252,248,242,0.6)';
  ctx.beginPath();
  ctx.moveTo(wx - 30 * u, wy - 16 * u);
  ctx.lineTo(wx + ww * 0.1, wy - 16 * u);
  ctx.quadraticCurveTo(wx + ww * 0.02 + sway, wy + wh * 0.6, wx + ww * 0.1 + sway, wy + wh + 30 * u);
  ctx.lineTo(wx - 30 * u, wy + wh + 30 * u);
  ctx.closePath();
  ctx.moveTo(wx + ww + 30 * u, wy - 16 * u);
  ctx.lineTo(wx + ww * 0.9, wy - 16 * u);
  ctx.quadraticCurveTo(wx + ww * 0.98 - sway, wy + wh * 0.6, wx + ww * 0.9 - sway, wy + wh + 30 * u);
  ctx.lineTo(wx + ww + 30 * u, wy + wh + 30 * u);
  ctx.closePath();
  ctx.fill();
  // sunbeams across the room
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * 0.06;
  ctx.fillStyle = '#fff2d6';
  for (let i = 0; i < 3; i++) {
    const bx = wx + ww * (0.2 + i * 0.25);
    ctx.beginPath();
    ctx.moveTo(bx, wy + wh * 0.2);
    ctx.lineTo(bx + ww * 0.12, wy + wh * 0.2);
    ctx.lineTo(bx - w * 0.35 + ww * 0.2, h);
    ctx.lineTo(bx - w * 0.35, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = k;
  // the foot of a bed with rumpled white sheets, a mug on the sill
  ctx.fillStyle = '#efe6dc';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(w * 0.2, h * 0.7, w * 0.42, h * 0.8);
  ctx.lineTo(w * 0.46, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(180,160,140,0.5)';
  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.86);
  ctx.quadraticCurveTo(w * 0.2, h * 0.8, w * 0.3, h * 0.9);
  ctx.quadraticCurveTo(w * 0.18, h * 0.88, w * 0.05, h * 0.86);
  ctx.fill();
  // a nightstand and the alarm clock that will ring tomorrow too
  ctx.fillStyle = '#b48a66';
  ctx.fillRect(w * 0.44, h * 0.72, 90 * u, h * 0.3);
  ctx.fillStyle = '#9a7252';
  ctx.fillRect(w * 0.44, h * 0.72, 90 * u, 6 * u);
  ctx.fillStyle = '#d9d2c4';
  ctx.beginPath();
  ctx.arc(w * 0.44 + 45 * u, h * 0.72 - 16 * u, 15 * u, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#8f8a80';
  ctx.beginPath();
  ctx.arc(w * 0.44 + 33 * u, h * 0.72 - 30 * u, 6 * u, 0, TAU);
  ctx.arc(w * 0.44 + 57 * u, h * 0.72 - 30 * u, 6 * u, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#4a463f';
  ctx.lineWidth = 1.6 * u;
  ctx.beginPath();
  ctx.moveTo(w * 0.44 + 45 * u, h * 0.72 - 16 * u);
  ctx.lineTo(w * 0.44 + 45 * u, h * 0.72 - 25 * u);
  ctx.moveTo(w * 0.44 + 45 * u, h * 0.72 - 16 * u);
  ctx.lineTo(w * 0.44 + 51 * u, h * 0.72 - 13 * u);
  ctx.stroke();
  ctx.fillStyle = '#6d8fb3';
  ctx.fillRect(wx + ww * 0.62, wy + wh - 26 * u, 18 * u, 22 * u);
  ctx.strokeStyle = '#6d8fb3';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.arc(wx + ww * 0.62 + 20 * u, wy + wh - 15 * u, 6 * u, -1.2, 1.2);
  ctx.stroke();
  // dust in the sunlight
  const m = s.motes;
  ctx.fillStyle = '#fffaf0';
  for (let i = 0; i < m.length; i += 3) {
    ctx.globalAlpha = k * (0.25 + m[i + 2] * 0.4);
    const r = (0.8 + m[i + 2] * 1.6) * u;
    ctx.fillRect(wx - w * 0.2 + m[i] * w * 0.5, m[i + 1] * h, r, r);
  }
  ctx.restore();
}
