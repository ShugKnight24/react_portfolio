import { createCanvasScene, clamp, damp, lerp, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Two Decks: a pair of turntables and a mixer under sweeping club lights.
 * Grab a record to scratch it: the vinyl follows the hand exactly, keeps its momentum
 * when released and eases back to 33 rpm. Strobe dots, tonearms, a target light and
 * VU meters all respond. Scratch audio is a looping synthesized phrase whose playback
 * rate and level follow the record speed.
 */

interface Deck {
  cx: number;
  cy: number;
  r: number;
  angle: number;
  vel: number;
  grabbed: boolean;
  grabAngle: number;
  pending: number;
  vu: number;
  arm: number;
  hue: string;
  label: string;
  sprite: HTMLCanvasElement;
  voice: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null;
}

interface Layout {
  vertical: boolean;
  mx: number;
  my: number;
  mw: number;
  mh: number;
}

interface State {
  decks: Deck[];
  layout: Layout;
  amb: number;
  drawn: boolean;
  energy: number;
  buffer: AudioBuffer | null;
  haze: CanvasGradient | null;
}

const BASE = (33.333 / 60) * TAU; // rad/s at 33 rpm
const MAGENTA = '#ff4fa3';
const GREEN = '#5dffb0';

function renderVinyl(sprite: HTMLCanvasElement, r: number, dpr: number, hue: string, label: string) {
  const size = Math.ceil(r * 2 * dpr) + 2;
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, size / 2, size / 2);
  g.fillStyle = '#0c0b12';
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  // Grooves in bands, with a gap between tracks
  g.lineWidth = 0.6;
  for (let rr = r * 0.4; rr < r * 0.97; rr += Math.max(1.6, r / 70)) {
    const track = Math.floor(((rr - r * 0.4) / (r * 0.57)) * 5);
    const edge = ((rr - r * 0.4) / (r * 0.57)) * 5 - track;
    if (edge > 0.94) continue;
    g.strokeStyle = (Math.floor(rr) % 3 === 0) ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)';
    g.beginPath();
    g.arc(0, 0, rr, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(0, 0, r - 0.5, 0, TAU);
  g.stroke();
  // Label
  const lr = r * 0.33;
  g.fillStyle = hue;
  g.beginPath();
  g.arc(0, 0, lr, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(7,6,15,0.85)';
  g.beginPath();
  g.arc(0, 0, lr * 0.92, -0.5, 0.9);
  g.arc(0, 0, lr * 0.62, 0.9, -0.5, true);
  g.closePath();
  g.fill();
  g.fillStyle = '#f4ecff';
  g.fillRect(-lr * 0.55, -lr * 0.55, lr * 0.5, lr * 0.08);
  g.fillRect(-lr * 0.55, -lr * 0.4, lr * 0.32, lr * 0.08);
  if (lr >= 22) {
    g.font = `bold ${Math.max(12, Math.round(lr * 0.36))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#07060f';
    g.fillText(label, 0, lr * 0.52);
  }
  g.fillStyle = '#d9d4e8';
  g.beginPath();
  g.arc(0, 0, Math.max(2, r * 0.025), 0, TAU);
  g.fill();
}

function makeBuffer(ctx: AudioContext) {
  // A short "fresh" style phrase: a formant-ish buzz with a few syllable hits
  const dur = 1.6;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let phase = 0;
  const hits = [0, 0.22, 0.4, 0.8, 1.02, 1.2];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let env = 0;
    for (const h of hits) {
      const k = t - h;
      if (k >= 0 && k < 0.3) env = Math.max(env, Math.exp(-k * 9) * Math.min(1, k * 300));
    }
    const f = 170 + 60 * Math.sin(t * 7) + 40 * env;
    phase += f / sr;
    const saw = (phase % 1) * 2 - 1;
    const form = Math.sin(phase * TAU * 3.2) * 0.4 + Math.sin(phase * TAU * 7.1) * 0.2;
    d[i] = (saw * 0.45 + form + (Math.random() * 2 - 1) * 0.25) * env * 0.8;
  }
  return buf;
}

function ensureVoice(s: State, deck: Deck, bus: AudioBus) {
  if (deck.voice && deck.voice.src.context === bus.ctx) return;
  const { ctx, out } = bus;
  if (!s.buffer || s.buffer.sampleRate !== ctx.sampleRate) s.buffer = makeBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(out);
  src.start();
  deck.voice = { src, gain, filter };
}

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  const vertical = w / h < 0.95;
  if (vertical) {
    const mh = clamp(h * 0.09, 34, 52);
    const slot = (h - mh - 24) / 2;
    const r = Math.min(slot * 0.38, (w - 32) / 3.2);
    // Plinth spans cx - 1.2r to cx + 1.9r, so shift left to centre it
    const cx = w / 2 - r * 0.35;
    s.decks[0].cx = s.decks[1].cx = cx;
    s.decks[0].cy = 12 + slot / 2;
    s.decks[1].cy = h - 12 - slot / 2;
    s.decks[0].r = s.decks[1].r = r;
    const mw = Math.min(w - 32, r * 3.1);
    s.layout = { vertical, mx: w / 2 - mw / 2, my: h / 2 - mh / 2, mw, mh };
  } else {
    const r = Math.min(h * 0.3, (w - 32) / 6.4);
    const mw = clamp(r * 0.9, 70, 140);
    const m = r * 0.12;
    const cy = h * 0.56;
    // Plinths span cx - 1.2r to cx + 1.4r
    s.decks[0].cx = w / 2 - mw / 2 - m - r * 1.4;
    s.decks[1].cx = w / 2 + mw / 2 + m + r * 1.2;
    s.decks[0].cy = s.decks[1].cy = cy;
    s.decks[0].r = s.decks[1].r = r;
    const mh = r * 2.2;
    s.layout = { vertical, mx: w / 2 - mw / 2, my: cy - mh / 2, mw, mh };
  }
}

function plinth(d: Deck, vertical: boolean) {
  const r = d.r;
  const pw = vertical ? r * 3.1 : r * 2.6;
  const ph = r * 2.45;
  return { x: d.cx - r * 1.2, y: d.cy - ph / 2, w: pw, h: ph };
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const wrap = (a: number) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    touchAction: 'none',
    cursor: 'grab',
    posterTime: 2.6,
    init: () => {
      const mk = (hue: string, label: string, angle: number): Deck => ({
        cx: 0,
        cy: 0,
        r: 50,
        angle,
        vel: BASE,
        grabbed: false,
        grabAngle: 0,
        pending: 0,
        vu: 0,
        arm: 0,
        hue,
        label,
        sprite: document.createElement('canvas'),
        voice: null,
      });
      return {
        decks: [mk(MAGENTA, 'A', 0.4), mk(GREEN, 'B', 2.1)],
        layout: { vertical: false, mx: 0, my: 0, mw: 0, mh: 0 },
        amb: 0,
        drawn: false,
        energy: 0,
        buffer: null,
        haze: null,
      };
    },
    resize: (s, env) => {
      layout(s, env);
      for (const d of s.decks) renderVinyl(d.sprite, d.r, env.dpr, d.hue, d.label);
      const haze = env.ctx.createLinearGradient(0, 0, 0, env.h);
      haze.addColorStop(0, '#0d0a1c');
      haze.addColorStop(0.55, '#07060f');
      haze.addColorStop(1, '#0b0916');
      s.haze = haze;
    },
    update: (s, env, dt) => {
      const ambient = !env.reducedMotion || !s.drawn;
      if (ambient) s.amb += dt;
      const target = env.reducedMotion && s.drawn ? 0 : BASE;
      let energy = 0;
      for (const d of s.decks) {
        if (d.grabbed) {
          d.angle += d.pending;
          const inst = d.pending / Math.max(dt, 1e-3);
          d.pending = 0;
          d.vel = damp(d.vel, inst, 18, dt);
        } else {
          // Inertia: the platter motor pulls the record back to 33 rpm
          d.vel = damp(d.vel, target, 2.2, dt);
          d.angle += d.vel * dt;
        }
        d.angle %= TAU;
        const dev = Math.abs(d.vel - BASE) / BASE;
        d.vu = damp(d.vu, clamp(0.35 + dev * 0.4, 0, 1) * (0.8 + 0.2 * Math.sin(s.amb * 11 + d.cx)), 10, dt);
        d.arm = damp(d.arm, 1, 1.6, dt);
        energy = Math.max(energy, d.grabbed ? clamp(Math.abs(d.vel) / BASE, 0, 2) / 2 + 0.3 : 0);
        if (d.voice) {
          const v = d.voice;
          const t = v.src.context.currentTime;
          const speed = Math.abs(d.vel) / BASE;
          const level = d.grabbed ? clamp(speed * 0.35, 0, 0.45) : 0;
          v.gain.gain.setTargetAtTime(level, t, d.grabbed ? 0.015 : 0.06);
          v.src.playbackRate.setTargetAtTime(clamp(speed, 0.05, 4), t, 0.01);
          v.filter.frequency.setTargetAtTime(400 + clamp(speed, 0, 3) * 1400, t, 0.02);
        }
      }
      s.energy = damp(s.energy, energy, 6, dt);
    },
    draw: (s, env) => {
      const { ctx, w, h } = env;
      s.drawn = true;
      const L = s.layout;
      ctx.fillStyle = s.haze ?? '#07060f';
      ctx.fillRect(0, 0, w, h);

      // Club lights: beams from the ceiling, additive
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beams = 4;
      for (let i = 0; i < beams; i++) {
        const ox = w * (0.15 + (i * 0.7) / (beams - 1));
        const sweep = Math.sin(s.amb * (0.35 + i * 0.07) + i * 1.7) * 0.5 + (i < 2 ? 0.18 : -0.18);
        const len = Math.hypot(w, h) * 1.1;
        const spread = 0.09 + s.energy * 0.04;
        const col = i % 2 === 0 ? '255,79,163' : '93,255,176';
        const a = 0.15 + s.energy * 0.14 + 0.04 * Math.sin(s.amb * 3.9 + i);
        const ang = Math.PI / 2 + sweep;
        const g = ctx.createLinearGradient(ox, 0, ox + Math.cos(ang) * len * 0.8, Math.sin(ang) * len * 0.8);
        g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, -4);
        ctx.lineTo(ox + Math.cos(ang - spread) * len, Math.sin(ang - spread) * len);
        ctx.lineTo(ox + Math.cos(ang + spread) * len, Math.sin(ang + spread) * len);
        ctx.closePath();
        ctx.fill();
        // Lamp
        ctx.fillStyle = `rgba(${col},0.9)`;
        ctx.fillRect(ox - 6, 0, 12, 3);
      }
      // Floor wash under the decks
      const wash = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, Math.max(w, h) * 0.6);
      wash.addColorStop(0, `rgba(160,80,255,${(0.1 + s.energy * 0.1).toFixed(3)})`);
      wash.addColorStop(1, 'rgba(160,80,255,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Decks
      for (let di = 0; di < s.decks.length; di++) {
        const d = s.decks[di];
        const p = plinth(d, L.vertical);
        const r = d.r;
        const cr = Math.min(14, r * 0.12);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        rrect(ctx, p.x + 4, p.y + 10, p.w, p.h, cr);
        ctx.fill();
        const body = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        body.addColorStop(0, '#1e1a33');
        body.addColorStop(0.1, '#141126');
        body.addColorStop(1, '#0c0a17');
        ctx.fillStyle = body;
        rrect(ctx, p.x, p.y, p.w, p.h, cr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Platter with strobe dots that rotate with the record
        ctx.fillStyle = '#1c1a26';
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, r * 1.08, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,215,240,0.55)';
        const dots = 48;
        const dr = r * 1.045;
        const ds = Math.max(1.2, r * 0.018);
        for (let k = 0; k < dots; k++) {
          const a = d.angle + (k / dots) * TAU;
          ctx.fillRect(d.cx + Math.cos(a) * dr - ds / 2, d.cy + Math.sin(a) * dr - ds / 2, ds, ds);
        }

        // Vinyl sprite
        ctx.save();
        ctx.translate(d.cx, d.cy);
        ctx.rotate(d.angle);
        ctx.drawImage(d.sprite, -r - 1 / env.dpr, -r - 1 / env.dpr, r * 2 + 2 / env.dpr, r * 2 + 2 / env.dpr);
        ctx.restore();

        // Static sheen: two soft light wedges that do not rotate
        ctx.save();
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, r, 0, TAU);
        ctx.arc(d.cx, d.cy, r * 0.34, 0, TAU, true);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        for (const base of [-0.9, 2.24]) {
          const sheen = ctx.createRadialGradient(
            d.cx + Math.cos(base) * r * 0.65,
            d.cy + Math.sin(base) * r * 0.65,
            0,
            d.cx + Math.cos(base) * r * 0.65,
            d.cy + Math.sin(base) * r * 0.65,
            r * 0.55
          );
          sheen.addColorStop(0, 'rgba(210,200,255,0.13)');
          sheen.addColorStop(1, 'rgba(210,200,255,0)');
          ctx.fillStyle = sheen;
          ctx.fillRect(d.cx - r, d.cy - r, r * 2, r * 2);
        }
        // Target light from the plinth corner
        const tlx = d.cx - r * 0.95;
        const tly = d.cy + r * 0.95;
        const tl = ctx.createRadialGradient(tlx, tly, 0, tlx, tly, r * 1.1);
        tl.addColorStop(0, 'rgba(255,240,220,0.14)');
        tl.addColorStop(1, 'rgba(255,240,220,0)');
        ctx.fillStyle = tl;
        ctx.fillRect(d.cx - r, d.cy - r, r * 2, r * 2);
        ctx.restore();

        // Hand ring while scratching
        if (d.grabbed) {
          ctx.strokeStyle = d.hue;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(d.cx, d.cy, r + 3, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Tonearm: pivot at the top right, stylus lands on the outer tracks
        const px = p.x + p.w - r * 0.32;
        const py = p.y + r * 0.35;
        const rest = Math.PI / 2 - 0.08;
        const sxT = d.cx + Math.cos(0.35) * r * 0.76;
        const syT = d.cy + Math.sin(0.35) * r * 0.76;
        const play = Math.atan2(syT - py, sxT - px);
        const wobble = d.grabbed ? Math.sin(s.amb * 40) * 0.01 * clamp(Math.abs(d.vel) / BASE, 0, 2) : 0;
        const armA = lerp(rest, play, d.arm) + wobble;
        const armL = Math.hypot(sxT - px, syT - py);
        ctx.save();
        ctx.translate(px, py);
        ctx.fillStyle = '#2a2640';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.13, 0, TAU);
        ctx.fill();
        ctx.rotate(armA);
        ctx.fillStyle = '#3a3552';
        ctx.fillRect(-r * 0.28, -r * 0.06, r * 0.16, r * 0.12);
        ctx.strokeStyle = '#cfc9df';
        ctx.lineWidth = Math.max(2, r * 0.035);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 0.12, 0);
        ctx.lineTo(armL * 0.84, 0);
        ctx.lineTo(armL * 0.93, r * 0.06);
        ctx.stroke();
        ctx.translate(armL, r * 0.06);
        ctx.rotate(0.35);
        ctx.fillStyle = '#e8e3f4';
        ctx.fillRect(-r * 0.1, -r * 0.06, r * 0.18, r * 0.12);
        ctx.restore();
        ctx.fillStyle = '#6a6488';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.05, 0, TAU);
        ctx.fill();

        // Speed LED: green at 33 rpm, magenta when off speed
        const off = clamp(Math.abs(d.vel - BASE) / BASE, 0, 1);
        const lx = p.x + r * 0.2;
        const ly = p.y + p.h - r * 0.18;
        const led = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.14);
        const ledCol = off > 0.08 ? '255,79,163' : '93,255,176';
        const ledA = env.reducedMotion && !d.grabbed ? 0.5 : 0.9;
        led.addColorStop(0, `rgba(${ledCol},${ledA})`);
        led.addColorStop(1, `rgba(${ledCol},0)`);
        ctx.fillStyle = led;
        ctx.fillRect(lx - r * 0.14, ly - r * 0.14, r * 0.28, r * 0.28);
      }

      // Mixer
      const mr = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      rrect(ctx, L.mx + 3, L.my + 8, L.mw, L.mh, mr);
      ctx.fill();
      ctx.fillStyle = '#13101f';
      rrect(ctx, L.mx, L.my, L.mw, L.mh, mr);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
      const segs = 10;
      if (L.vertical) {
        // Horizontal strip: two VU bars and a crossfader
        const pad = 10;
        const barW = (L.mw - pad * 4) * 0.3;
        const segH = (L.mh - pad * 2) / 2 - 2;
        for (let di = 0; di < 2; di++) {
          const d = s.decks[di];
          const lit = Math.round(d.vu * segs);
          const bx = di === 0 ? L.mx + pad : L.mx + L.mw - pad - barW;
          const segW = barW / segs;
          for (let k = 0; k < segs; k++) {
            const idx = di === 0 ? k : segs - 1 - k;
            ctx.fillStyle = idx < lit ? (idx >= segs - 2 ? MAGENTA : GREEN) : 'rgba(255,255,255,0.07)';
            ctx.fillRect(bx + k * segW + 1, L.my + L.mh / 2 - segH / 2, segW - 2, segH);
          }
        }
        const fx = L.mx + L.mw / 2;
        const tw = L.mw * 0.28;
        ctx.fillStyle = '#07060f';
        ctx.fillRect(fx - tw / 2, L.my + L.mh / 2 - 2, tw, 4);
        ctx.fillStyle = '#cfc9df';
        ctx.fillRect(fx - 5 + Math.sin(s.amb * 0.5) * tw * 0.2, L.my + L.mh / 2 - 9, 10, 18);
      } else {
        const pad = Math.max(10, L.mw * 0.12);
        const barW = Math.max(6, L.mw * 0.12);
        const top = L.my + pad;
        const segH = ((L.mh * 0.62 - pad) / segs);
        for (let di = 0; di < 2; di++) {
          const d = s.decks[di];
          const lit = Math.round(d.vu * segs);
          const bx = di === 0 ? L.mx + pad : L.mx + L.mw - pad - barW;
          for (let k = 0; k < segs; k++) {
            const idx = segs - 1 - k;
            ctx.fillStyle = idx < lit ? (idx >= segs - 2 ? MAGENTA : GREEN) : 'rgba(255,255,255,0.07)';
            ctx.fillRect(bx, top + k * segH + 1, barW, segH - 2);
          }
        }
        // Knobs between the meters
        const kr = Math.min(L.mw * 0.1, 10);
        for (let k = 0; k < 3; k++) {
          const kx = L.mx + L.mw / 2;
          const ky = top + kr + k * kr * 3;
          ctx.fillStyle = '#231e3a';
          ctx.beginPath();
          ctx.arc(kx, ky, kr, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = k === 1 ? MAGENTA : GREEN;
          ctx.lineWidth = 1.5;
          const a = -2 + k * 1.1;
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(kx + Math.cos(a) * kr * 0.8, ky + Math.sin(a) * kr * 0.8);
          ctx.stroke();
        }
        const fy = L.my + L.mh - pad * 1.4;
        const tw = L.mw - pad * 2;
        ctx.fillStyle = '#07060f';
        ctx.fillRect(L.mx + pad, fy - 2, tw, 4);
        ctx.fillStyle = '#cfc9df';
        ctx.fillRect(L.mx + L.mw / 2 - 6 + Math.sin(s.amb * 0.5) * tw * 0.2, fy - 9, 12, 18);
      }
    },
    onPointerDown: (s, env, x, y) => {
      for (const d of s.decks) {
        if (Math.hypot(x - d.cx, y - d.cy) > d.r * 1.08) continue;
        d.grabbed = true;
        d.grabAngle = Math.atan2(y - d.cy, x - d.cx);
        d.pending = 0;
        env.canvas.style.cursor = 'grabbing';
        const bus = env.audio();
        if (bus) ensureVoice(s, d, bus);
        env.wake(2400);
        return;
      }
    },
    onPointerMove: (s, env, x, y) => {
      for (const d of s.decks) {
        if (!d.grabbed) continue;
        const a = Math.atan2(y - d.cy, x - d.cx);
        // Near the spindle the angle is noisy, so damp small radii
        const near = clamp(Math.hypot(x - d.cx, y - d.cy) / (d.r * 0.3), 0, 1);
        d.pending += wrap(a - d.grabAngle) * near;
        d.grabAngle = a;
        env.wake(2400);
      }
    },
    onPointerUp: (s, env) => {
      for (const d of s.decks) d.grabbed = false;
      env.canvas.style.cursor = 'grab';
    },
    dispose: (s) => {
      for (const d of s.decks) {
        if (d.voice) {
          try {
            d.voice.src.stop();
          } catch {
            /* already stopped */
          }
          d.voice.src.disconnect();
          d.voice = null;
        }
        d.sprite.width = 0;
        d.sprite.height = 0;
      }
      s.buffer = null;
    },
  });
