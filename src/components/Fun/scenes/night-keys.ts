import { createCanvasScene, clamp, damp, rand, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Night Keys: a one octave synth under a night sky. Every note lights its key in its own
 * colour, sends up a glowing ribbon and a spray of sparks, and draws itself on the little
 * oscilloscope in the panel. Mouse, touch (with glissando) and the computer keyboard all play.
 * When nobody is playing it noodles a quiet melody by itself, silently.
 */

interface Key {
  note: number; // semitone from C4
  black: boolean;
  label: string;
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Voice {
  ctx: AudioContext;
  gain: GainNode;
  oscs: OscillatorNode[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  key: number;
}

interface Ribbon {
  x: number;
  y: number;
  age: number;
  key: number;
  phase: number;
  alive: boolean;
}

interface Fx {
  ctx: AudioContext;
  input: GainNode;
}

interface State {
  keys: Key[];
  held: boolean[];
  press: number[];
  glow: number[];
  level: number[];
  sparks: Spark[];
  sparkHead: number;
  ribbons: Ribbon[];
  ribbonHead: number;
  sprites: HTMLCanvasElement[];
  colors: string[];
  voices: (Voice | null)[];
  fx: Fx | null;
  pointerKey: number;
  idle: number;
  demoTimer: number;
  demoStep: number;
  demoKey: number;
  demoOff: number;
  amb: number;
  drawn: boolean;
  body: { x: number; y: number; w: number; h: number; panel: number };
  stars: { x: number; y: number; r: number; p: number }[];
  city: { x: number; w: number; h: number; seed: number }[];
}

// White keys C D E F G A B C, black keys C# D# F# G# A#
const WHITE = [
  { note: 0, label: 'A', code: 'KeyA' },
  { note: 2, label: 'S', code: 'KeyS' },
  { note: 4, label: 'D', code: 'KeyD' },
  { note: 5, label: 'F', code: 'KeyF' },
  { note: 7, label: 'G', code: 'KeyG' },
  { note: 9, label: 'H', code: 'KeyH' },
  { note: 11, label: 'J', code: 'KeyJ' },
  { note: 12, label: 'K', code: 'KeyK' },
];
const BLACK = [
  { note: 1, label: 'W', code: 'KeyW', after: 0 },
  { note: 3, label: 'E', code: 'KeyE', after: 1 },
  { note: 6, label: 'T', code: 'KeyT', after: 3 },
  { note: 8, label: 'Y', code: 'KeyY', after: 4 },
  { note: 10, label: 'U', code: 'KeyU', after: 5 },
];
// A small melody (key indices into the white row) for the idle demo
const DEMO = [0, 2, 4, 7, 4, 5, 3, 1, 2, 4, 6, 4];
const MAX_SPARKS = 180;
const MAX_RIBBONS = 16;
const RIBBON_LIFE = 2.2;

const freqOf = (note: number) => 261.63 * Math.pow(2, note / 12);
const hueOf = (note: number) => 330 - (note / 12) * 180;

function makeSprite(hue: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  if (g) {
    const rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    rg.addColorStop(0, `hsla(${hue},100%,92%,1)`);
    rg.addColorStop(0.18, `hsla(${hue},100%,70%,0.85)`);
    rg.addColorStop(0.5, `hsla(${hue},100%,60%,0.22)`);
    rg.addColorStop(1, `hsla(${hue},100%,60%,0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, 48, 48);
  }
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Key outline: square top (tucked under the felt), rounded bottom corners */
function keyPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.closePath();
}

function ensureFx(s: State, bus: AudioBus): Fx {
  if (s.fx && s.fx.ctx === bus.ctx) return s.fx;
  const { ctx, out } = bus;
  const input = ctx.createGain();
  input.gain.value = 1;
  // A soft feedback echo gives the synth some room
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2200;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  input.connect(out);
  input.connect(delay);
  delay.connect(tone).connect(fb).connect(delay);
  tone.connect(wet).connect(out);
  s.fx = { ctx, input };
  return s.fx;
}

function noteOn(s: State, env: SceneEnv, i: number, sound: boolean) {
  const k = s.keys[i];
  s.held[i] = true;
  s.glow[i] = 1;
  s.level[i] = 1;
  // Sparks from the top edge of the key
  const top = k.y;
  const count = env.reducedMotion ? 8 : 16;
  for (let n = 0; n < count; n++) {
    const p = s.sparks[s.sparkHead];
    s.sparkHead = (s.sparkHead + 1) % MAX_SPARKS;
    p.x = k.x + k.w / 2 + rand(-k.w * 0.35, k.w * 0.35);
    p.y = top + rand(-2, 6);
    p.vx = rand(-30, 30);
    p.vy = rand(-170, -60);
    p.max = rand(0.9, 1.8);
    p.life = p.max;
    p.size = rand(10, 22);
    p.key = i;
  }
  const r = s.ribbons[s.ribbonHead];
  s.ribbonHead = (s.ribbonHead + 1) % MAX_RIBBONS;
  r.x = k.x + k.w / 2;
  r.y = top;
  r.age = 0;
  r.key = i;
  r.phase = rand(0, TAU);
  r.alive = true;

  if (!sound) return;
  const bus = env.audio();
  if (!bus) return;
  releaseVoice(s, i, 0.03);
  const fx = ensureFx(s, bus);
  const { ctx } = bus;
  const t0 = ctx.currentTime;
  const f = freqOf(k.note);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(f * 9, t0);
  filter.frequency.exponentialRampToValueAtTime(f * 2.5, t0 + 0.6);
  const oscs: OscillatorNode[] = [];
  const parts: [OscillatorType, number, number][] = [
    ['sawtooth', 1, -7],
    ['sawtooth', 1, 7],
    ['triangle', 0.5, 0],
  ];
  for (const [type, mult, detune] of parts) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.detune.value = detune;
    o.connect(filter);
    o.start(t0);
    oscs.push(o);
  }
  filter.connect(gain).connect(fx.input);
  s.voices[i] = { ctx, gain, oscs };
}

function releaseVoice(s: State, i: number, time = 0.45) {
  const v = s.voices[i];
  if (!v) return;
  s.voices[i] = null;
  if (v.ctx.state === 'closed') return;
  const t = v.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, t + time);
  for (const o of v.oscs) o.stop(t + time + 0.05);
}

function noteOff(s: State, i: number) {
  s.held[i] = false;
  releaseVoice(s, i);
}

function keyAt(s: State, x: number, y: number) {
  // Black keys sit on top, so test them first
  for (let i = s.keys.length - 1; i >= 0; i--) {
    const k = s.keys[i];
    if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return i;
  }
  return -1;
}

const interact = (s: State) => {
  s.idle = 0;
  if (s.demoKey >= 0) {
    s.held[s.demoKey] = false;
    s.demoKey = -1;
  }
};

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 3.2,
    init: () => {
      const keys: Key[] = [
        ...WHITE.map((k) => ({ ...k, black: false, x: 0, y: 0, w: 0, h: 0 })),
        ...BLACK.map((k) => ({ note: k.note, label: k.label, code: k.code, black: true, x: 0, y: 0, w: 0, h: 0 })),
      ];
      const n = keys.length;
      return {
        keys,
        held: new Array<boolean>(n).fill(false),
        press: new Array<number>(n).fill(0),
        glow: new Array<number>(n).fill(0),
        level: new Array<number>(n).fill(0),
        sparks: Array.from({ length: MAX_SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, key: 0 })),
        sparkHead: 0,
        ribbons: Array.from({ length: MAX_RIBBONS }, () => ({ x: 0, y: 0, age: 0, key: 0, phase: 0, alive: false })),
        ribbonHead: 0,
        sprites: keys.map((k) => makeSprite(hueOf(k.note))),
        colors: keys.map((k) => `hsl(${hueOf(k.note)},100%,66%)`),
        voices: new Array<Voice | null>(n).fill(null),
        fx: null,
        pointerKey: -1,
        idle: 10,
        demoTimer: 0.2,
        demoStep: 0,
        demoKey: -1,
        demoOff: 0,
        amb: 0,
        drawn: false,
        body: { x: 0, y: 0, w: 0, h: 0, panel: 0 },
        stars: Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.5, 1.5), p: rand(0, TAU) })),
        city: (() => {
          const out: { x: number; w: number; h: number; seed: number }[] = [];
          let x = -0.02;
          while (x < 1.02) {
            const bw = rand(0.03, 0.07);
            out.push({ x, w: bw, h: rand(0.25, 1) * (0.55 + 0.45 * Math.abs(x - 0.5) * 2), seed: 1 + Math.floor(rand(0, 1e6)) });
            x += bw + rand(0.002, 0.012);
          }
          return out;
        })(),
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      const kbW = Math.min(w - 32, 760, h * 1.7);
      const ww = kbW / 8;
      const pad = clamp(ww * 0.22, 8, 16);
      const keyH = Math.min(ww * 3.4, h * 0.34);
      const panel = clamp(keyH * 0.36, 40, 76);
      const bodyW = kbW + pad * 2;
      const bodyH = keyH + panel + pad * 1.6;
      const bx = (w - bodyW) / 2;
      const by = Math.min(h - bodyH - Math.max(16, h * 0.06), h * 0.52);
      s.body = { x: bx, y: by, w: bodyW, h: bodyH, panel };
      const kx = bx + pad;
      const ky = by + panel + pad * 0.6;
      let wi = 0;
      for (const k of s.keys) {
        if (!k.black) {
          k.x = kx + wi * ww;
          k.y = ky;
          k.w = ww;
          k.h = keyH;
          wi++;
        }
      }
      for (let i = 0; i < BLACK.length; i++) {
        const k = s.keys[WHITE.length + i];
        const bw = ww * 0.6;
        k.x = kx + (BLACK[i].after + 1) * ww - bw / 2;
        k.y = ky;
        k.w = bw;
        k.h = keyH * 0.6;
      }
    },
    update: (s, env, dt) => {
      const ambient = !env.reducedMotion || !s.drawn;
      if (ambient) s.amb += dt;
      const n = s.keys.length;
      for (let i = 0; i < n; i++) {
        s.press[i] = damp(s.press[i], s.held[i] ? 1 : 0, 30, dt);
        const target = s.held[i] ? 0.75 : 0;
        s.glow[i] = s.glow[i] > target ? damp(s.glow[i], target, s.held[i] ? 6 : 2.6, dt) : target;
        s.level[i] = damp(s.level[i], s.held[i] ? 0.7 : 0, s.held[i] ? 3 : 3.5, dt);
      }
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy += 40 * dt;
        p.vx *= Math.exp(-1.2 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const r of s.ribbons) {
        if (!r.alive) continue;
        r.age += dt;
        if (r.age > RIBBON_LIFE) r.alive = false;
      }

      // Idle demo: only when ambient motion is allowed
      s.idle += dt;
      const demo = ambient && s.idle > 5 && s.pointerKey < 0 && !s.held.some((hld, i) => hld && i !== s.demoKey);
      if (s.demoKey >= 0) {
        s.demoOff -= dt;
        if (s.demoOff <= 0 || !demo) {
          s.held[s.demoKey] = false;
          s.demoKey = -1;
        }
      }
      if (demo) {
        s.demoTimer -= dt;
        if (s.demoTimer <= 0) {
          const idx = DEMO[s.demoStep % DEMO.length];
          s.demoStep++;
          s.demoTimer = s.demoStep % 4 === 0 ? 0.9 : 0.45;
          noteOn(s, env, idx, false);
          s.demoKey = idx;
          s.demoOff = 0.3;
        }
      }
    },
    draw: (s, env) => {
      const { ctx, w, h } = env;
      s.drawn = true;
      const b = s.body;

      // Night sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#07060f');
      sky.addColorStop(0.7, '#120c26');
      sky.addColorStop(1, '#1a1030');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#efe8ff';
      for (const st of s.stars) {
        ctx.globalAlpha = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(s.amb * 0.9 + st.p));
        ctx.fillRect(st.x * w, st.y * b.y, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      // Moon and a quiet skyline behind the synth
      const mr = Math.min(w, h) * 0.05;
      const mx = w * 0.82;
      const my = Math.max(mr * 2, b.y * 0.28);
      const moon = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 5);
      moon.addColorStop(0, 'rgba(255,220,240,0.16)');
      moon.addColorStop(1, 'rgba(255,220,240,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
      // Crescent: clip out an offset disc so the sky shows through
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
      ctx.arc(mx - mr * 0.45, my - mr * 0.2, mr * 0.9, 0, TAU);
      ctx.clip('evenodd');
      ctx.fillStyle = '#f6e9f4';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.restore();
      const ground = b.y + b.h * 0.4;
      const cityH = Math.min(b.y * 0.5, h * 0.28);
      const win = Math.max(2, Math.round(Math.min(w, h) * 0.006));
      for (const c of s.city) {
        const bx = c.x * w;
        const bw = c.w * w;
        const bh = ground - b.y + c.h * cityH;
        ctx.fillStyle = '#100c22';
        ctx.fillRect(bx, ground - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,79,163,0.18)';
        ctx.fillRect(bx, ground - bh, bw, 1);
        let seed = c.seed;
        for (let wy = ground - bh + win * 2; wy < b.y - win; wy += win * 3) {
          for (let wx = bx + win; wx < bx + bw - win; wx += win * 2.5) {
            seed = (seed * 16807) % 2147483647;
            if (seed % 7 !== 0) continue;
            ctx.fillStyle = seed % 3 === 0 ? 'rgba(93,255,176,0.5)' : 'rgba(255,214,150,0.45)';
            ctx.fillRect(wx, wy, win, win);
          }
        }
      }

      // Ambient light pooled above the keyboard, tinted by recent notes
      let hue = 300;
      let energy = 0;
      let wsum = 0;
      for (let i = 0; i < s.keys.length; i++) {
        const g = s.glow[i];
        if (g > 0.01) {
          hue = (hue * wsum + hueOf(s.keys[i].note) * g) / (wsum + g);
          wsum += g;
          energy = Math.max(energy, g);
        }
      }
      const pool = ctx.createRadialGradient(w / 2, b.y + b.h * 0.2, 0, w / 2, b.y, Math.max(w, h) * 0.7);
      pool.addColorStop(0, `hsla(${hue.toFixed(0)},90%,55%,${(0.1 + energy * 0.14).toFixed(3)})`);
      pool.addColorStop(1, 'hsla(260,80%,40%,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, w, h);

      // Ribbons and sparks, additive
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const ceiling = Math.max(10, b.y * 0.08);
      for (const r of s.ribbons) {
        if (!r.alive) continue;
        const k = r.age / RIBBON_LIFE;
        const reach = (r.y - ceiling) * Math.min(1, 1 - Math.pow(1 - Math.min(1, r.age / 0.9), 3));
        const fade = 1 - k;
        ctx.strokeStyle = s.colors[r.key];
        const amp = 6 + k * 18;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass === 0 ? fade * 0.18 : fade * 0.75;
          ctx.lineWidth = pass === 0 ? 8 : 1.6;
          ctx.beginPath();
          const steps = 26;
          for (let j = 0; j <= steps; j++) {
            const u = j / steps;
            const y = r.y - u * reach;
            const x = r.x + Math.sin(u * 7 + r.phase - r.age * 4) * amp * u;
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      for (const p of s.sparks) {
        if (p.life <= 0) continue;
        const a = p.life / p.max;
        const sz = p.size * (0.4 + 0.6 * a);
        ctx.globalAlpha = a;
        ctx.drawImage(s.sprites[p.key], p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      ctx.restore();

      // Keyboard body
      const r = Math.min(14, b.w * 0.03);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, b.x + 4, b.y + 10, b.w, b.h, r);
      ctx.fill();
      const bodyG = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      bodyG.addColorStop(0, '#1d1932');
      bodyG.addColorStop(0.12, '#0f0d1c');
      bodyG.addColorStop(1, '#0a0914');
      ctx.fillStyle = bodyG;
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Panel: oscilloscope screen and knobs
      const pad = (b.h - b.panel - s.keys[0].h) / 1.6;
      const scrH = b.panel - pad * 0.9;
      const scrW = Math.min(b.w * 0.5, 260);
      const scrX = b.x + pad;
      const scrY = b.y + pad * 0.7;
      ctx.fillStyle = '#050a08';
      roundRect(ctx, scrX, scrY, scrW, scrH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(93,255,176,0.18)';
      ctx.stroke();
      ctx.save();
      roundRect(ctx, scrX, scrY, scrW, scrH, 6);
      ctx.clip();
      ctx.strokeStyle = 'rgba(93,255,176,0.08)';
      ctx.beginPath();
      for (let gx = 1; gx < 6; gx++) {
        ctx.moveTo(scrX + (scrW * gx) / 6, scrY);
        ctx.lineTo(scrX + (scrW * gx) / 6, scrY + scrH);
      }
      ctx.moveTo(scrX, scrY + scrH / 2);
      ctx.lineTo(scrX + scrW, scrY + scrH / 2);
      ctx.stroke();
      let total = 0;
      for (let i = 0; i < s.keys.length; i++) total += s.level[i];
      const norm = total > 1 ? 1 / total : 1;
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(93,255,176,0.2)' : '#5dffb0';
        ctx.lineWidth = pass === 0 ? 5 : 1.5;
        ctx.beginPath();
        const steps = 90;
        for (let j = 0; j <= steps; j++) {
          const u = j / steps;
          let v = Math.sin(u * 40 + s.amb * 3) * 0.02;
          for (let i = 0; i < s.keys.length; i++) {
            const lv = s.level[i];
            if (lv < 0.005) continue;
            const f = freqOf(s.keys[i].note) / 261.63;
            v += Math.sin(u * TAU * 3 * f + s.amb * 8 * f) * lv * norm;
          }
          const x = scrX + u * scrW;
          const y = scrY + scrH / 2 - v * scrH * 0.38;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      // Knobs
      const knobR = Math.min(scrH * 0.3, 14);
      const knobs = Math.max(0, Math.min(4, Math.floor((b.w - scrW - pad * 3) / (knobR * 3.2))));
      for (let i = 0; i < knobs; i++) {
        const kx = b.x + b.w - pad - knobR - i * knobR * 3.2;
        const ky = scrY + scrH / 2;
        ctx.fillStyle = '#231e3a';
        ctx.beginPath();
        ctx.arc(kx, ky, knobR, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.stroke();
        const ang = -2.2 + ((i * 1.37 + 0.6) % 3) * 1.3 + Math.sin(s.amb * 0.3 + i) * 0.05;
        ctx.strokeStyle = i === 0 ? '#ff4fa3' : '#5dffb0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(kx + Math.cos(ang) * knobR * 0.3, ky + Math.sin(ang) * knobR * 0.3);
        ctx.lineTo(kx + Math.cos(ang) * knobR * 0.85, ky + Math.sin(ang) * knobR * 0.85);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Keys
      const showLabels = s.keys[0].w >= 24;
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < s.keys.length; i++) {
        const k = s.keys[i];
        const pr = s.press[i];
        const g = s.glow[i];
        const dy = pr * 3;
        const x = k.x + (k.black ? 0 : 1);
        const kw = k.w - (k.black ? 0 : 2);
        const kh = k.h - (k.black ? 0 : 1);
        const rr = Math.min(6, kw * 0.15);
        if (k.black) {
          // Drop shadow for the raised black key
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          keyPath(ctx, x + 2, k.y, kw, kh + 4 - dy, rr);
          ctx.fill();
        }
        const grad = ctx.createLinearGradient(0, k.y, 0, k.y + kh);
        if (k.black) {
          grad.addColorStop(0, '#2a2540');
          grad.addColorStop(1, '#121020');
        } else {
          grad.addColorStop(0, '#d9d4e8');
          grad.addColorStop(0.85, '#f5f2fb');
          grad.addColorStop(1, '#cfc9df');
        }
        ctx.fillStyle = grad;
        keyPath(ctx, x, k.y, kw, kh + dy, rr);
        ctx.fill();
        if (g > 0.01) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, g * (k.black ? 1 : 0.85));
          const lit = ctx.createLinearGradient(0, k.y, 0, k.y + kh);
          lit.addColorStop(0, 'rgba(255,255,255,0)');
          lit.addColorStop(1, s.colors[i]);
          ctx.fillStyle = lit;
          keyPath(ctx, x, k.y, kw, kh + dy, rr);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = g * 0.9;
          const gs = kw * 2.6;
          ctx.drawImage(s.sprites[i], x + kw / 2 - gs / 2, k.y + kh - gs * 0.55, gs, gs);
          ctx.restore();
        }
        if (showLabels) {
          ctx.fillStyle = k.black
            ? `rgba(244,236,255,${(0.45 + g * 0.5).toFixed(3)})`
            : g > 0.2
              ? 'rgba(20,10,30,0.85)'
              : 'rgba(40,30,70,0.5)';
          ctx.fillText(k.label, x + kw / 2, k.y + kh - (k.black ? 10 : 12) + dy * 0.5);
        }
      }
      // Felt strip that hides the key tops
      ctx.fillStyle = '#ff4fa3';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(s.keys[0].x, s.keys[0].y - 2, s.keys[0].w * 8, 3);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    },
    onPointerDown: (s, env, x, y) => {
      interact(s);
      const i = keyAt(s, x, y);
      if (i < 0) return;
      s.pointerKey = i;
      noteOn(s, env, i, true);
      env.wake(2400);
    },
    onPointerMove: (s, env, x, y) => {
      if (!env.pointer.down || s.pointerKey < 0) return;
      const i = keyAt(s, x, y);
      if (i === s.pointerKey) return;
      noteOff(s, s.pointerKey);
      s.pointerKey = i;
      if (i >= 0) {
        noteOn(s, env, i, true);
        env.wake(2400);
      }
    },
    onPointerUp: (s) => {
      if (s.pointerKey >= 0) noteOff(s, s.pointerKey);
      s.pointerKey = -1;
    },
    onKey: (s, env, e, down) => {
      const code = e.code || `Key${e.key.toUpperCase()}`;
      const i = s.keys.findIndex((k) => k.code === code);
      if (i < 0) return false;
      if (down) {
        if (!e.repeat && !s.held[i]) {
          interact(s);
          noteOn(s, env, i, true);
          env.wake(2400);
        }
      } else {
        noteOff(s, i);
      }
      return true;
    },
    dispose: (s) => {
      for (let i = 0; i < s.voices.length; i++) {
        const v = s.voices[i];
        if (!v) continue;
        for (const o of v.oscs) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
        s.voices[i] = null;
      }
      s.fx = null;
      for (const c of s.sprites) {
        c.width = 0;
        c.height = 0;
      }
    },
  });
