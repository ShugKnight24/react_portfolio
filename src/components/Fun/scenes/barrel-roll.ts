import {
  createCanvasScene,
  clamp,
  damp,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  noise,
  rand,
  TAU,
  tone,
} from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Barrel Roll: a starfighter skimming a synthwave canyon.
 * Ported from the old video games codex scene, where the ship floated on black.
 * Now it flies through a scrolling neon grid between wireframe canyon walls under a
 * striped sun, banks toward the pointer with damping, threads gold rings, and does a
 * smooth eased 360 roll with ghost trails and helix contrails on click or Space.
 */

const FAR = 60;
const SPEED = 16;
const CAM_H = 1.5;
const WALL_X = 5.5;
const SEG = 2;
const SHIP_Z = 3;
const ROLL_TIME = 0.72;
const RING_R = 0.85;
const TRAIL_N = 34;
const GHOSTS = 6;
const STREAKS = 44;

interface Ring {
  x: number;
  y: number;
  z: number;
  live: boolean;
  hit: number;
  checked: boolean;
}

interface Streak {
  a: number;
  r: number;
  v: number;
  bright: number;
}

interface State {
  dist: number;
  nextRing: number;
  rings: Ring[];
  px: number;
  py: number;
  vx: number;
  vy: number;
  bank: number;
  roll: number;
  rollDir: number;
  rollQueued: boolean;
  tilt: number;
  trailL: Float32Array;
  trailR: Float32Array;
  trailHead: number;
  trailCount: number;
  trailTimer: number;
  ghosts: Float32Array;
  ghostHead: number;
  ghostTimer: number;
  streaks: Streak[];
  burst: number;
  burstX: number;
  burstY: number;
  streak: number;
  stars: Float32Array;
  hy: number;
  f: number;
  S: number;
  xMax: number;
  steer: boolean;
}

const hash = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function spawnRing(s: State, r: Ring, z: number) {
  const xr = Math.min(2.2, s.xMax * 0.7);
  r.x = rand(-xr, xr);
  r.y = rand(0.55, 1.45);
  r.z = z;
  r.live = true;
  r.hit = 0;
  r.checked = false;
}

function startRoll(s: State, env: SceneEnv) {
  if (s.roll >= 0) {
    if (s.roll > 0.6) s.rollQueued = true;
    return;
  }
  s.roll = 0;
  s.rollDir = s.vx < -1 ? -1 : 1;
  env.wake(ROLL_TIME * 1000 + 900);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.6, freq: 1400, q: 0.9, gain: 0.16 });
    tone(bus, 330, { type: 'sawtooth', glideTo: 660, attack: 0.02, decay: 0.45, gain: 0.05 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    posterTime: 3.3,
    cursor: 'crosshair',
    init: (env) => {
      const stars = new Float32Array(80 * 3);
      for (let i = 0; i < stars.length; i += 3) {
        stars[i] = Math.random();
        stars[i + 1] = Math.random() * Math.random();
        stars[i + 2] = Math.random() * TAU;
      }
      const s: State = {
        dist: 0,
        nextRing: 10,
        rings: Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0, live: false, hit: 0, checked: false })),
        px: env.w / 2,
        py: env.h * 0.7,
        vx: 0,
        vy: 0,
        bank: 0,
        roll: -1,
        rollDir: 1,
        rollQueued: false,
        tilt: 0,
        trailL: new Float32Array(TRAIL_N * 3),
        trailR: new Float32Array(TRAIL_N * 3),
        trailHead: 0,
        trailCount: 0,
        trailTimer: 0,
        ghosts: new Float32Array(GHOSTS * 3),
        ghostHead: 0,
        ghostTimer: 0,
        streaks: Array.from({ length: STREAKS }, () => ({ a: 0, r: 0, v: 0, bright: 0 })),
        burst: 0,
        burstX: 0,
        burstY: 0,
        streak: 0,
        stars,
        hy: 0,
        f: 1,
        S: 1,
        xMax: 2,
        steer: false,
      };
      for (const st of s.streaks) {
        st.a = rand(0, TAU);
        st.r = rand(10, 400);
        st.v = rand(0.8, 1.6);
        st.bright = Math.random();
      }
      return s;
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.hy = h * (w > h ? 0.44 : 0.4);
      s.f = h * 0.9;
      s.S = Math.min(w * 0.34, h * 0.3) * 0.5;
      s.xMax = ((w * 0.42) * SHIP_Z) / s.f;
      s.px = clamp(s.px, w * 0.1, w * 0.9);
      s.py = clamp(s.py, s.hy + s.S * 0.6, h - s.S * 0.45);
      if (!s.rings.some((r) => r.live)) {
        spawnRing(s, s.rings[0], 12);
        spawnRing(s, s.rings[1], 28);
        spawnRing(s, s.rings[2], 44);
        spawnRing(s, s.rings[3], 61);
        s.nextRing = s.dist + 30;
      }
    },
    update: (s, env, dt, t) => {
      const { w, h, pointer } = env;
      const cx = w / 2;
      s.dist += SPEED * dt;

      // Rings scroll toward the camera; score a pass when one crosses the ship plane
      const shipX = ((s.px - cx) * SHIP_Z) / s.f;
      const shipY = CAM_H - ((s.py - s.hy) * SHIP_Z) / s.f;
      for (const r of s.rings) {
        if (!r.live) continue;
        r.z -= SPEED * dt;
        r.hit = Math.max(0, r.hit - dt * 1.8);
        if (!r.checked && r.z <= SHIP_Z) {
          r.checked = true;
          if (Math.hypot(r.x - shipX, r.y - shipY) < RING_R * 1.05) {
            r.hit = 1;
            s.burst = 1;
            s.burstX = s.px;
            s.burstY = s.py;
            const bus = env.audio();
            if (bus) {
              tone(bus, 880, { type: 'triangle', decay: 0.35, gain: 0.08 });
              tone(bus, 1318.5, { type: 'triangle', decay: 0.5, gain: 0.07, delay: 0.07 });
            }
          }
        }
        if (r.z < 0.5) r.live = false;
      }
      if (s.dist >= s.nextRing) {
        const slot = s.rings.find((r) => !r.live);
        if (slot) spawnRing(s, slot, FAR * 0.75);
        s.nextRing = s.dist + rand(13, 19);
      }
      s.burst = Math.max(0, s.burst - dt * 2.2);

      // Steering target: pointer when present, else an autopilot that threads the rings
      let tx: number;
      let ty: number;
      const usingPointer = env.interactive && pointer.inside && s.steer;
      if (usingPointer) {
        tx = pointer.x;
        ty = pointer.y;
      } else {
        let next: Ring | null = null;
        for (const r of s.rings) if (r.live && !r.checked && (!next || r.z < next.z)) next = r;
        tx = cx + Math.sin(t * 0.55) * w * 0.18;
        ty = s.hy + (h - s.hy) * 0.55 + Math.sin(t * 0.9) * (h - s.hy) * 0.12;
        if (next && next.z < 30) {
          const k = 1 - next.z / 30;
          tx = lerp(tx, cx + (next.x * s.f) / SHIP_Z, k);
          ty = lerp(ty, s.hy + ((CAM_H - next.y) * s.f) / SHIP_Z, k);
        }
      }
      tx = clamp(tx, w * 0.1, w * 0.9);
      ty = clamp(ty, s.hy + s.S * 0.6, h - s.S * 0.45);
      // Critically damped spring toward the target
      const k = 22;
      const c = 2 * Math.sqrt(k) * 0.95;
      s.vx += ((tx - s.px) * k - s.vx * c) * dt;
      s.vy += ((ty - s.py) * k - s.vy * c) * dt;
      s.px += s.vx * dt;
      s.py += s.vy * dt;
      const bankTarget = clamp((s.vx / w) * 1.6, -0.75, 0.75);
      s.bank = damp(s.bank, bankTarget, 6, dt);
      s.tilt = damp(s.tilt, -s.bank * 0.22, 3, dt);

      if (s.roll >= 0) {
        s.roll += dt / ROLL_TIME;
        if (s.roll >= 1) {
          s.roll = -1;
          if (s.rollQueued) {
            s.rollQueued = false;
            startRoll(s, env);
          }
        }
      }
      const angle = s.bank + (s.roll >= 0 ? s.rollDir * TAU * easeInOutCubic(s.roll) : 0);

      // Wingtip contrails recede outward from the vanishing point
      const vpx = cx;
      const vpy = s.hy;
      const grow = Math.exp(1.7 * dt);
      for (const tr of [s.trailL, s.trailR]) {
        for (let i = 0; i < TRAIL_N; i++) {
          tr[i * 3] = vpx + (tr[i * 3] - vpx) * grow;
          tr[i * 3 + 1] = vpy + (tr[i * 3 + 1] - vpy) * grow;
          tr[i * 3 + 2] += dt;
        }
      }
      s.trailTimer -= dt;
      if (s.trailTimer <= 0) {
        s.trailTimer = 1 / 45;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const S = s.S;
        const i = s.trailHead;
        for (const [tr, side] of [
          [s.trailL, -1],
          [s.trailR, 1],
        ] as const) {
          const lx = side * 1.0 * S;
          const ly = 0.26 * S;
          tr[i * 3] = s.px + lx * ca - ly * sa;
          tr[i * 3 + 1] = s.py + lx * sa + ly * ca;
          tr[i * 3 + 2] = 0;
        }
        s.trailHead = (s.trailHead + 1) % TRAIL_N;
        s.trailCount = Math.min(TRAIL_N, s.trailCount + 1);
      }

      // Roll ghosts
      s.ghostTimer -= dt;
      if (s.ghostTimer <= 0) {
        s.ghostTimer = 1 / 30;
        const g = s.ghostHead;
        s.ghosts[g * 3] = s.px;
        s.ghosts[g * 3 + 1] = s.py;
        s.ghosts[g * 3 + 2] = angle;
        s.ghostHead = (s.ghostHead + 1) % GHOSTS;
      }
      s.streak = damp(s.streak, s.roll >= 0 ? 1 : 0, 6, dt);

      const maxR = Math.hypot(w, h);
      for (const st of s.streaks) {
        st.r *= Math.exp(st.v * 1.3 * dt);
        st.r += 20 * dt;
        if (st.r > maxR) {
          st.a = rand(0, TAU);
          st.r = rand(8, 60);
          st.v = rand(0.8, 1.6);
          st.bright = Math.random();
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const cx = w / 2;
      const { hy, f, S } = s;
      const proj = (x: number, z: number) => cx + (x * f) / z;
      const projY = (y: number, z: number) => hy + ((CAM_H - y) * f) / z;
      const big = Math.max(w, h) * 1.5;

      ctx.fillStyle = '#07060f';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(cx, hy);
      ctx.rotate(s.tilt);
      ctx.translate(-cx, -hy);

      // Sky
      const sky = ctx.createLinearGradient(0, hy - h * 0.6, 0, hy);
      sky.addColorStop(0, '#07060f');
      sky.addColorStop(0.55, '#1c0a33');
      sky.addColorStop(0.85, '#4a1250');
      sky.addColorStop(1, '#8a1f63');
      ctx.fillStyle = sky;
      ctx.fillRect(cx - big, hy - big, big * 2, big);

      for (let i = 0; i < s.stars.length; i += 3) {
        const a = 0.3 + 0.35 * Math.sin(t * 1.4 + s.stars[i + 2]);
        ctx.fillStyle = `rgba(230,220,255,${a})`;
        ctx.fillRect(s.stars[i] * w * 1.4 - w * 0.2, hy - (1 - s.stars[i + 1]) * hy * 1.2, 1.3, 1.3);
      }

      // Striped synthwave sun
      const sunR = Math.min(w, h) * 0.24;
      const sunY = hy - sunR * 0.28;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(cx, sunY, sunR * 0.8, cx, sunY, sunR * 2.4);
      halo.addColorStop(0, 'rgba(255,79,163,0.35)');
      halo.addColorStop(1, 'rgba(255,79,163,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - sunR * 2.4, sunY - sunR * 2.4, sunR * 4.8, sunR * 2.4 + (hy - sunY));
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, sunY, sunR, 0, TAU);
      ctx.clip();
      const sun = ctx.createLinearGradient(0, sunY - sunR, 0, hy);
      sun.addColorStop(0, '#ffe36e');
      sun.addColorStop(0.5, '#ff9a5a');
      sun.addColorStop(1, '#ff4fa3');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.rect(cx - sunR, sunY - sunR, sunR * 2, sunR * 0.95);
      let y = sunY - sunR * 0.05;
      let band = sunR * 0.1;
      const scroll = ((t * 12) % (sunR * 0.16)) * 0.5;
      y += scroll * 0.3;
      while (y < hy) {
        const gap = Math.max(1, band * 0.35);
        ctx.rect(cx - sunR, y, sunR * 2, band);
        y += band + gap;
        band = Math.max(2, band * 0.82);
      }
      ctx.fill();
      ctx.restore();

      // Floor
      const floor = ctx.createLinearGradient(0, hy, 0, h + 40);
      floor.addColorStop(0, '#2a0b3d');
      floor.addColorStop(0.3, '#12061f');
      floor.addColorStop(1, '#07060f');
      ctx.fillStyle = floor;
      ctx.fillRect(cx - big, hy, big * 2, big);

      // Grid
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;
      const off = s.dist % SEG;
      for (let z = SEG - off; z < FAR; z += SEG) {
        if (z < 0.6) continue;
        const a = (1 - z / FAR) * 0.7;
        const yy = projY(0, z);
        ctx.strokeStyle = `rgba(255,79,163,${a})`;
        ctx.beginPath();
        ctx.moveTo(proj(-WALL_X, z), yy);
        ctx.lineTo(proj(WALL_X, z), yy);
        ctx.stroke();
      }
      const near = 0.6;
      for (let x = -WALL_X; x <= WALL_X + 0.01; x += 1.1) {
        const g = ctx.createLinearGradient(0, projY(0, near), 0, hy);
        g.addColorStop(0, 'rgba(255,79,163,0.6)');
        g.addColorStop(1, 'rgba(255,79,163,0.05)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(proj(x, near), projY(0, near));
        ctx.lineTo(proj(x, FAR), projY(0, FAR));
        ctx.stroke();
      }
      const hg = ctx.createLinearGradient(0, hy - 6, 0, hy + 6);
      hg.addColorStop(0, 'rgba(255,120,190,0)');
      hg.addColorStop(0.5, 'rgba(255,150,210,0.8)');
      hg.addColorStop(1, 'rgba(255,120,190,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(cx - big, hy - 6, big * 2, 12);
      ctx.globalCompositeOperation = 'source-over';

      // Canyon walls, far to near
      const first = Math.floor(s.dist / SEG);
      for (const side of [-1, 1]) {
        const X = side * WALL_X;
        const wallG = ctx.createLinearGradient(cx, 0, side > 0 ? w : 0, 0);
        wallG.addColorStop(0, '#3a1050');
        wallG.addColorStop(0.35, '#1a0a2e');
        wallG.addColorStop(1, '#0b0716');
        ctx.fillStyle = wallG;
        ctx.beginPath();
        let started = false;
        const tops: number[] = [];
        for (let i = first + Math.ceil(FAR / SEG); i >= first; i--) {
          const z = Math.max(near, i * SEG - s.dist);
          const top = 1.8 + 2.8 * hash(i * 2 + (side > 0 ? 1 : 0));
          const px = proj(X, z);
          const py = projY(top, z);
          tops.push(px, py, z);
          if (!started) {
            ctx.moveTo(proj(X, FAR), projY(0, FAR));
            started = true;
          }
          ctx.lineTo(px, py);
        }
        ctx.lineTo(proj(X, near), projY(0, near));
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < tops.length; i += 3) {
          if (i === 0) ctx.moveTo(tops[i], tops[i + 1]);
          else ctx.lineTo(tops[i], tops[i + 1]);
        }
        ctx.strokeStyle = 'rgba(93,216,255,0.7)';
        ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < tops.length; i += 3) {
          const z = tops[i + 2];
          const a = (1 - z / FAR) * 0.28;
          if (a <= 0.01) continue;
          ctx.strokeStyle = `rgba(93,216,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(tops[i], tops[i + 1]);
          ctx.lineTo(tops[i], projY(0, z));
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Speed streaks from the vanishing point
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const st of s.streaks) {
        const r0 = st.r;
        const r1 = st.r * (1.08 + 0.15 * s.streak);
        const a = Math.min(1, r0 / 200) * (0.18 + 0.3 * st.bright) * (0.6 + 0.8 * s.streak);
        const ca = Math.cos(st.a);
        const sa = Math.sin(st.a) * 0.75;
        ctx.strokeStyle = st.bright > 0.7 ? `rgba(93,216,255,${a})` : `rgba(240,230,255,${a})`;
        ctx.lineWidth = 1 + st.bright;
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0, hy + sa * r0);
        ctx.lineTo(cx + ca * r1, hy + sa * r1);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // Rings beyond the ship
      const drawRing = (r: Ring) => {
        const rx = proj(r.x, r.z);
        const ry = projY(r.y, r.z);
        const rr = (RING_R * f) / r.z;
        const fade = clamp((FAR * 0.75 - r.z) / 8, 0, 1) * (r.z < SHIP_Z ? clamp((r.z - 0.5) / (SHIP_Z - 0.5), 0, 1) : 1);
        if (fade <= 0.01) return;
        const hot = r.hit;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hot > 0 ? `rgba(93,255,176,${0.3 * fade})` : `rgba(255,190,70,${0.25 * fade})`;
        ctx.lineWidth = Math.max(2, rr * 0.22);
        ctx.beginPath();
        ctx.arc(rx, ry, rr * (1 + hot * 0.2), 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = hot > 0 ? `rgba(200,255,225,${fade})` : `rgba(255,226,120,${0.95 * fade})`;
        ctx.lineWidth = Math.max(1, rr * 0.07);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      };
      for (const r of s.rings) if (r.live && r.z >= SHIP_Z) drawRing(r);

      // Contrails
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const tr of [s.trailL, s.trailR]) {
        let prevX = 0;
        let prevY = 0;
        for (let n = 0; n < s.trailCount; n++) {
          const idx = (s.trailHead - 1 - n + TRAIL_N) % TRAIL_N;
          const x = tr[idx * 3];
          const y = tr[idx * 3 + 1];
          if (n > 0) {
            const k = 1 - n / TRAIL_N;
            ctx.strokeStyle = `rgba(150,230,255,${0.5 * k * k})`;
            ctx.lineWidth = Math.max(1, S * 0.03 * k);
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          prevX = x;
          prevY = y;
        }
      }

      // Roll ghosts
      if (s.streak > 0.02) {
        for (let n = 1; n < GHOSTS; n++) {
          const idx = (s.ghostHead - 1 - n + GHOSTS * 2) % GHOSTS;
          const k = 1 - n / GHOSTS;
          drawShip(ctx, s.ghosts[idx * 3], s.ghosts[idx * 3 + 1], S, s.ghosts[idx * 3 + 2], t, 0.16 * k * s.streak);
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      const angle = s.bank + (s.roll >= 0 ? s.rollDir * TAU * easeInOutCubic(s.roll) : 0);
      drawShip(ctx, s.px, s.py, S, angle, t, 1);

      // Deflector shimmer while rolling
      if (s.streak > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(93,216,255,${0.35 * s.streak})`;
        ctx.lineWidth = Math.max(1, S * 0.03);
        ctx.beginPath();
        ctx.ellipse(s.px, s.py, S * 1.15, S * 1.15, 0, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      // Rings the ship has passed, drawn over it
      for (const r of s.rings) if (r.live && r.z < SHIP_Z) drawRing(r);

      if (s.burst > 0.01) {
        const k = 1 - s.burst;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(93,255,176,${s.burst * 0.8})`;
        ctx.lineWidth = Math.max(1, S * 0.05 * s.burst);
        ctx.beginPath();
        ctx.arc(s.burstX, s.burstY, S * (0.6 + easeOutCubic(k) * 1.4), 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      const vig = ctx.createRadialGradient(cx, h * 0.5, Math.min(w, h) * 0.4, cx, h * 0.5, Math.max(w, h) * 0.8);
      vig.addColorStop(0, 'rgba(7,6,15,0)');
      vig.addColorStop(1, 'rgba(7,6,15,0.5)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerMove: (s, env) => {
      s.steer = true;
      if (env.reducedMotion) env.wake(700);
    },
    onPointerDown: (s, env) => {
      s.steer = true;
      startRoll(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) startRoll(s, env);
      return true;
    },
  });

/**
 * Starfighter seen from behind: swept wings with up-canted blades, a central
 * fuselage with canopy, blue accents and a hot engine core. alpha < 1 draws a
 * ghost (additive outline only).
 */
function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  S: number,
  angle: number,
  t: number,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(S, S);
  ctx.lineJoin = 'round';

  const wing = (side: number) => {
    ctx.moveTo(side * 0.14, -0.08);
    ctx.lineTo(side * 0.98, 0.17);
    ctx.lineTo(side * 1.02, 0.3);
    ctx.lineTo(side * 0.14, 0.17);
    ctx.closePath();
  };
  const blade = (side: number) => {
    ctx.moveTo(side * 0.8, 0.22);
    ctx.lineTo(side * 0.9, -0.36);
    ctx.lineTo(side * 0.97, -0.3);
    ctx.lineTo(side * 0.98, 0.27);
    ctx.closePath();
  };
  const hull = () => {
    ctx.moveTo(0, -0.34);
    ctx.lineTo(0.2, -0.06);
    ctx.lineTo(0.15, 0.2);
    ctx.lineTo(-0.15, 0.2);
    ctx.lineTo(-0.2, -0.06);
    ctx.closePath();
  };

  if (alpha < 1) {
    ctx.fillStyle = `rgba(93,216,255,${alpha})`;
    ctx.beginPath();
    wing(-1);
    wing(1);
    ctx.fill();
    ctx.beginPath();
    blade(-1);
    blade(1);
    ctx.fill();
    ctx.beginPath();
    hull();
    ctx.fill();
    ctx.restore();
    return;
  }

  // Engine glow behind everything
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.9 + 0.1 * Math.sin(t * 43);
  const eg = ctx.createRadialGradient(0, 0.06, 0, 0, 0.06, 0.55 * flick);
  eg.addColorStop(0, 'rgba(255,255,255,0.9)');
  eg.addColorStop(0.25, 'rgba(120,220,255,0.6)');
  eg.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(-0.6, -0.5, 1.2, 1.2);
  ctx.globalCompositeOperation = 'source-over';

  const metal = ctx.createLinearGradient(0, -0.4, 0, 0.3);
  metal.addColorStop(0, '#f2f0fa');
  metal.addColorStop(0.55, '#a9a6bd');
  metal.addColorStop(1, '#4b4760');

  ctx.fillStyle = metal;
  ctx.beginPath();
  wing(-1);
  wing(1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,79,163,0.8)';
  ctx.lineWidth = 1.2 / S;
  ctx.stroke();

  // Blue wing stripes
  ctx.fillStyle = '#2f62e0';
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 0.3, 0.02);
    ctx.lineTo(side * 0.7, 0.13);
    ctx.lineTo(side * 0.7, 0.19);
    ctx.lineTo(side * 0.3, 0.1);
    ctx.closePath();
  }
  ctx.fill();

  const bladeG = ctx.createLinearGradient(0, -0.36, 0, 0.3);
  bladeG.addColorStop(0, '#5b8cff');
  bladeG.addColorStop(1, '#1d3a9a');
  ctx.fillStyle = bladeG;
  ctx.beginPath();
  blade(-1);
  blade(1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,225,255,0.7)';
  ctx.stroke();

  ctx.fillStyle = metal;
  ctx.beginPath();
  hull();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.stroke();

  // Canopy
  const glass = ctx.createLinearGradient(0, -0.3, 0, -0.05);
  glass.addColorStop(0, '#bfe8ff');
  glass.addColorStop(1, '#1f4f9a');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(0, -0.16, 0.07, 0.11, 0, 0, TAU);
  ctx.fill();

  // Engine nozzle
  ctx.fillStyle = '#26233a';
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.09, 0.07, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(0, 0.08, 0, 0, 0.08, 0.08);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.5, 'rgba(140,230,255,0.9)');
  core.addColorStop(1, 'rgba(90,160,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0.08, 0.085 * flick, 0, TAU);
  ctx.fill();
  // Wingtip nav lights
  ctx.fillStyle = `rgba(255,79,163,${0.6 + 0.4 * Math.sin(t * 6)})`;
  ctx.beginPath();
  ctx.arc(-1.0, 0.26, 0.025, 0, TAU);
  ctx.moveTo(1.025, 0.26);
  ctx.arc(1.0, 0.26, 0.025, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
