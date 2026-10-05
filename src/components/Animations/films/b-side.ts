import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, ease, hash, noise1, mulberry, smoothPath, DISPLAY, MONO, spacedText } from '../riso/kit';
import type { Pt } from '../riso/kit';

/*
 * B-Side. The groove is the motif: a record groove, then the sound wave it carries, then a
 * plucked guitar string, then the skyline line of a city equaliser, and finally the label edge
 * of the record again. Everything moves on a 100 bpm grid (one beat = 0.6 s).
 */

const AQ = 0;
const PK = 1;
const VI = 2;
const BK = 3;

const BEAT = 0.6;
/** Decaying pulse on every beat (or every `period`) after `start` */
const pulse = (t: number, start: number, decay = 0.16, period = BEAT) =>
  t < start ? 0 : Math.exp(-((t - start) % period) / decay);

/* ---------- record geometry ---------- */
const C1: Pt = [700, 450];
const R1 = 330;
const LAB = 110;
const RC = 250;
const TH_C = -0.25;
const TH_Q = -0.55;
const A_MOD = 1.4;
const ZH = 18;
const ROT_T = -(TH_Q + Math.PI / 2);
const Q: Pt = [C1[0] + RC * Math.cos(TH_Q), C1[1] + RC * Math.sin(TH_Q)];
const NEEDLE: Pt = [C1[0] + RC * Math.cos(TH_C), C1[1] + RC * Math.sin(TH_C)];
const PIVOT: Pt = [1200, 190];
const ARM_L = Math.hypot(NEEDLE[0] - PIVOT[0], NEEDLE[1] - PIVOT[1]);
const ARM_T = Math.atan2(NEEDLE[1] - PIVOT[1], NEEDLE[0] - PIVOT[0]);
const ARM_REST = 1.75;
const OMEGA0 = 3.5;
const OMEGA_H = OMEGA0 / Math.pow(ZH, 1.37);

const modF = (a: number) => 0.7 * Math.sin(90 * a) + 0.35 * Math.sin(181 * a + 1.3) + 0.25 * Math.sin(44 * a + 0.4);

/* ---------- guitar geometry ---------- */
const XN = 200;
const XB = 1760;
const STR_Y = [398, 424, 450, 476, 502, 528];
const POSTS: Pt[] = [
  [62, 380],
  [112, 388],
  [162, 396],
  [162, 530],
  [112, 538],
  [62, 546],
];
const fretX = (n: number) => XN + (XB - XN) * (1 - Math.pow(2, -n / 12));
const STRUM0 = 9.6;
const STRUM_END = 12.3;

/* ---------- city ---------- */
const HY = 640;

type Cam = [number, number, number, number];

interface Bld {
  x: number;
  w: number;
  h: number;
  crown: number;
  antenna: boolean;
  seed: number;
}
interface Person {
  x: number;
  r: number;
  arms: number;
  off: number;
  lean: number;
}
interface State {
  phi: Float64Array;
  dt: number;
  blds: Bld[];
  crowd: Person[];
  body: Path2D;
  head: Path2D;
  hand: Path2D;
  fingers: Path2D[];
  thumb: Path2D;
  palm: Path2D;
  creases: Path2D;
}

/* ---------- camera ---------- */
function zoomAt(t: number) {
  if (t < 3) return 1;
  if (t <= 5) return Math.pow(ZH, ease.inOutCubic(seg(t, 3, 5)));
  return ZH * Math.exp(0.85 * ease.inOutSine(seg(t, 5, 9.4)));
}

function cam1(t: number): Cam {
  const z = zoomAt(t);
  const kc = clamp((1 - 1 / Math.min(z, ZH)) / (1 - 1 / ZH));
  return [lerp(800, Q[0], kc), lerp(450, Q[1], kc), z, ROT_T * ease.inOutCubic(seg(t, 3.15, 5))];
}

function cam3(t: number): Cam {
  const s = ease.inOutSine(seg(t, 9.0, 12.4));
  const back = ease.inOutCubic(seg(t, 12.4, 13.2));
  const k = s * (1 - back);
  return [800 + 40 * k, 450 + 6 * k, 1 + 0.06 * k, -0.045 * k];
}

const project = (p: Pt, c: Cam): Pt => {
  const dx = (p[0] - c[0]) * c[2];
  const dy = (p[1] - c[1]) * c[2];
  const co = Math.cos(c[3]);
  const si = Math.sin(c[3]);
  return [800 + dx * co - dy * si, 450 + dx * si + dy * co];
};

function phiAt(t: number, s: State) {
  const n = s.phi.length - 1;
  if (t >= 5) return s.phi[n] + OMEGA_H * (t - 5);
  const f = Math.max(0, t) / s.dt;
  const i = Math.min(n - 1, Math.floor(f));
  return lerp(s.phi[i], s.phi[i + 1], f - i);
}

/* ---------- motion signals ---------- */

/** Scene 2 travelling wave: upward displacement in screen px at screen x */
function waveDisp(x: number, t: number, s: State) {
  const a = TH_Q + (x - 800) / (ZH * RC) - phiAt(t, s);
  let g = lerp(1, 2.6, ease.inOutCubic(seg(t, 5.3, 6.6)));
  g *= 1 + 0.3 * pulse(t, 5.4, 0.14);
  let rip = 0;
  if (t > 5.4) {
    const xr = -200 + (((t - 5.4) % 1.2) / 1.2) * 2000;
    rip = 0.55 * seg(t, 5.8, 6.4) * Math.exp(-(((x - xr) / 170) ** 2));
  }
  return ZH * A_MOD * modF(a) * g * (1 + rip);
}

/** Strum envelope for string i */
function strumEnv(t: number, i: number) {
  if (t < STRUM0 - 0.05) return 0;
  const n = Math.floor((Math.min(t, STRUM_END + 0.29) - STRUM0) / 0.3);
  let e = 0;
  for (let j = Math.max(0, n - 1); j <= n; j++) {
    const down = j % 2 === 0;
    const th = STRUM0 + j * 0.3 + (down ? i : 5 - i) * 0.014 - 0.035;
    if (t < th || th > STRUM_END + 0.1) continue;
    e += (down ? 1 : 0.55) * Math.exp(-(t - th) / 0.38);
  }
  return e;
}

function stringAmp(t: number, i: number) {
  let a = strumEnv(t, i) * (i === 2 ? 30 : 16 + i * 2);
  if (i === 2) a += 55 * Math.exp(-Math.max(0, t - 8.7) / 0.55);
  return a;
}

const stringShape = (x: number) => (x <= XN ? 0 : Math.sin(Math.PI * clamp((x - XN) / (XB - XN))));

function stringDisp(x: number, t: number, i: number) {
  return stringShape(x) * stringAmp(t, i) * Math.cos(TAU * 4.2 * t + i * 1.7);
}

/** String / horizon baseline */
const baseY = (t: number) => lerp(450, HY, ease.inOutCubic(seg(t, 12.9, 13.6)));

function cityDisp(x: number, t: number) {
  const on = seg(t, 13.3, 13.8) * (1 - seg(t, 15.7, 16.2));
  if (on <= 0) return 0;
  return on * (4 + 12 * pulse(t, 13.2, 0.16)) * Math.sin(x * 0.017 - t * 7.5) * Math.sin(x * 0.0021 + 0.3);
}

/* ---------- the pink line (the motif) ---------- */
const LINE_N = 275;

/** Points of the pink line in the current camera (identity or cam3) */
function pinkPoints(t: number, s: State): Pt[] {
  const pts: Pt[] = [];
  const c1 = t < 5.9 ? cam1(t) : null;
  const kp = ease.inOutCubic(seg(t, 5, 5.9));
  const k3 = ease.inOutCubic(seg(t, 8.2, 9.0));
  const k4 = ease.inOutCubic(seg(t, 12.7, 13.4));
  const by = baseY(t);
  const ph = c1 ? phiAt(t, s) : 0;
  for (let j = 0; j < LINE_N; j++) {
    const x = -20 + (j / (LINE_N - 1)) * 1640;
    let p: Pt;
    if (k3 < 1) {
      let w: Pt = [x, 450 - waveDisp(x, t, s)];
      if (c1 && kp < 1) {
        const a = TH_Q + (x - 800) / (c1[2] * RC);
        const rr = RC + A_MOD * modF(a - ph);
        const g = project([C1[0] + rr * Math.cos(a), C1[1] + rr * Math.sin(a)], c1);
        w = [lerp(g[0], w[0], kp), lerp(g[1], w[1], kp)];
      }
      p = w;
    } else p = [x, 0];
    if (k3 > 0) {
      let q: Pt;
      if (x >= XN) q = [x, 450 - stringDisp(x, t, 2)];
      else {
        const v = (x + 20) / (XN + 20);
        q = [lerp(POSTS[2][0], XN, v), lerp(POSTS[2][1], 450, v)];
      }
      p = [lerp(p[0], q[0], k3), lerp(p[1], q[1], k3)];
    }
    if (t >= 12.6) {
      const dy = by - 450;
      if (x >= XN) p = [x, by - stringDisp(x, t, 2) - cityDisp(x, t)];
      else p = [lerp(p[0], x, k4), lerp(p[1], 450, k4) + dy - cityDisp(x, t) * k4];
    }
    pts.push(p);
  }
  if (t >= 16.1) {
    // Curl the line up into the record label
    const cx = 800;
    const cy = 450;
    const rl = LAB - 5;
    for (let j = 0; j < LINE_N; j++) {
      const u = j / (LINE_N - 1);
      const d = Math.abs(2 * u - 1);
      const k = ease.inOutCubic(seg(t, 16.1 + 0.15 * d, 16.6 + 0.15 * d));
      const [px, py] = pts[j];
      const a0 = Math.atan2(py - cy, px - cx);
      const r0 = Math.hypot(px - cx, py - cy);
      const a1 = Math.PI / 2 + (0.5 - u) * TAU;
      const a = lerp(a0, a1, k);
      const rr = lerp(r0, rl, k);
      pts[j] = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    }
  }
  return pts;
}

const linePath = (pts: Pt[]) => {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  return p;
};

/* ---------- record ---------- */
interface RecOpts {
  cx: number;
  cy: number;
  R: number;
  rev: number;
  spin: number;
  disc: number;
  gB: number;
  gV: number;
  contact: boolean;
  phi: number;
  labelPulse: number;
  labelK: number;
  pinkTone: number;
}

const circ = (cx: number, cy: number, r: number, p = new Path2D()) => {
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, Math.max(0.1, r), 0, TAU);
  return p;
};

function drawRecord(r: Riso, o: RecOpts) {
  const [aq, pk, vi, bk] = r.layers;
  const { cx, cy, spin } = o;
  const R = Math.min(o.R, o.rev);
  if (R > LAB + 1) {
    const body = circ(cx, cy, R);
    circ(cx, cy, LAB, body);
    if (o.disc > 0.01) {
      vi.fillStyle = r.tone(vi, 0.9 * o.disc);
      vi.fill(body, 'evenodd');
      bk.fillStyle = r.tone(bk, 0.5 * o.disc);
      bk.fill(body, 'evenodd');
    }
    // grooves
    const g = new Path2D();
    for (let rr = 130; rr <= Math.min(o.R - 10, R - 4); rr += 5) {
      if (o.contact && rr === RC) continue;
      circ(cx, cy, rr, g);
    }
    if (o.gB > 0.01) {
      bk.lineWidth = 1.5;
      bk.strokeStyle = r.tone(bk, o.gB);
      bk.stroke(g);
    }
    if (o.gV > 0.01) {
      vi.lineWidth = 1.5;
      vi.strokeStyle = r.tone(vi, o.gV);
      vi.stroke(g);
    }
    // rim
    bk.lineWidth = 3;
    bk.strokeStyle = r.tone(bk, 0.9 * o.disc);
    bk.stroke(circ(cx, cy, R - 1.5));
    // contact groove: an empty channel with the pink signal riding in it
    if (o.contact) {
      const m = new Path2D();
      const n = 2400;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rr = RC + A_MOD * modF(a - o.phi);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i) m.lineTo(x, y);
        else m.moveTo(x, y);
      }
      for (const c of [vi, bk]) {
        c.globalCompositeOperation = 'destination-out';
        c.strokeStyle = '#000';
        c.lineWidth = 2.2;
        c.stroke(m);
        c.globalCompositeOperation = 'source-over';
      }
      if (o.pinkTone > 0.01) {
        pk.lineWidth = 1.5;
        pk.strokeStyle = r.tone(pk, o.pinkTone);
        pk.stroke(m);
      }
    }
    // sheen: two fixed wedges of light (dotted knock-out on purpose)
    if (o.disc > 0.3) {
      const w = new Path2D();
      for (const a0 of [-1.15, Math.PI - 1.15]) {
        const a1 = a0 + 0.42;
        w.moveTo(cx + Math.cos(a0) * (R - 4), cy + Math.sin(a0) * (R - 4));
        w.arc(cx, cy, R - 4, a0, a1);
        w.arc(cx, cy, LAB + 10, a1, a0, true);
        w.closePath();
      }
      bk.globalCompositeOperation = 'destination-out';
      bk.fillStyle = r.tone(bk, 0.6);
      bk.fill(w);
      bk.globalCompositeOperation = 'source-over';
      aq.fillStyle = r.tone(aq, 0.4 * o.disc);
      aq.fill(w);
    }
  }
  // label
  if (o.labelK > 0.01) {
    const lr = LAB * (1 + 0.035 * o.labelPulse) * o.labelK;
    pk.fillStyle = '#000';
    pk.fill(circ(cx, cy, lr));
    const ring = circ(cx, cy, lr * 0.74);
    circ(cx, cy, lr * 0.67, ring);
    aq.fillStyle = '#000';
    aq.fill(ring, 'evenodd');
    vi.fillStyle = r.tone(vi, 0.3);
    vi.fill(circ(cx, cy, lr * 0.3));
    bk.save();
    bk.translate(cx, cy);
    bk.rotate(spin);
    bk.scale(o.labelK, o.labelK);
    bk.fillStyle = '#000';
    bk.textAlign = 'center';
    bk.textBaseline = 'middle';
    bk.font = `900 28px ${DISPLAY}`;
    bk.fillText('B-SIDE', 0, -44);
    bk.font = `600 11px ${MONO}`;
    spacedText(bk, '100 BPM  ·  33⅓', 0, 46, 1.5);
    bk.restore();
    for (const c of r.layers) {
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.fill(circ(cx, cy, 7));
      c.globalCompositeOperation = 'source-over';
    }
    bk.lineWidth = 3;
    bk.strokeStyle = '#000';
    bk.stroke(circ(cx, cy, 11));
  }
}

/* ---------- scene 1: turntable ---------- */
function drawTurntable(r: Riso, t: number, s: State, z: number) {
  const [aq, pk, vi, bk] = r.layers;
  const phi = phiAt(t, s);
  if (z < 8) {
    // plinth
    const pl = new Path2D();
    pl.roundRect(250, 40, 1130, 820, 36);
    const sh = new Path2D();
    sh.roundRect(262, 56, 1130, 820, 36);
    bk.fillStyle = r.tone(bk, 0.22);
    bk.fill(sh);
    r.gradient(aq, pl, { kind: 'linear', x0: 250, y0: 40, x1: 1380, y1: 860, from: 0.62, to: 0.32 }, 10);
    pk.fillStyle = r.tone(pk, 0.1);
    pk.fill(pl);
    bk.lineWidth = 3;
    bk.strokeStyle = '#000';
    bk.stroke(pl);
    // platter rim with rotating strobe dots
    const rim = circ(C1[0], C1[1], R1 + 18);
    circ(C1[0], C1[1], R1, rim);
    bk.fillStyle = r.tone(bk, 0.85);
    bk.fill(rim, 'evenodd');
    const dots = new Path2D();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU + phi;
      circ(C1[0] + Math.cos(a) * (R1 + 9), C1[1] + Math.sin(a) * (R1 + 9), 2.6, dots);
    }
    bk.globalCompositeOperation = 'destination-out';
    bk.fillStyle = '#000';
    bk.fill(dots);
    bk.globalCompositeOperation = 'source-over';
    pk.fillStyle = '#000';
    pk.fill(dots);
    // controls
    const btn = new Path2D();
    btn.roundRect(300, 730, 110, 80, 10);
    pk.fill(btn);
    bk.lineWidth = 3;
    bk.stroke(btn);
    bk.font = `700 15px ${MONO}`;
    bk.fillStyle = '#000';
    bk.textAlign = 'center';
    bk.textBaseline = 'middle';
    bk.fillText('START', 355, 770);
    for (let i = 0; i < 2; i++) {
      const b = circ(460 + i * 54, 770, 18);
      vi.fillStyle = i === 0 ? '#000' : r.tone(vi, 0.35);
      vi.fill(b);
      bk.lineWidth = 2;
      bk.stroke(b);
    }
    bk.font = `700 11px ${MONO}`;
    bk.fillText('33', 460, 770);
    bk.fillText('45', 514, 770);
    // pitch slider
    bk.lineWidth = 4;
    bk.beginPath();
    bk.moveTo(1300, 470);
    bk.lineTo(1300, 800);
    bk.stroke();
    for (let i = 0; i <= 10; i++) {
      bk.lineWidth = 1.5;
      bk.beginPath();
      bk.moveTo(1316, 470 + i * 33);
      bk.lineTo(1330, 470 + i * 33);
      bk.stroke();
    }
    const knob = new Path2D();
    knob.roundRect(1276, 620 + 8 * Math.sin(t * 0.8), 48, 26, 5);
    vi.fillStyle = '#000';
    vi.fill(knob);
    bk.lineWidth = 2;
    bk.stroke(knob);
    // sound rings on every beat after the drop
    if (t > 1.8 && z < 3) {
      const p = ((t - 1.8) % BEAT) / BEAT;
      const fade = 1 - seg(z, 1, 2.5);
      const ring = circ(C1[0], C1[1], R1 + 24 + 170 * ease.outCubic(p));
      pk.lineWidth = 9 * (1 - p) + 1;
      pk.strokeStyle = r.tone(pk, (1 - p) * 0.85 * fade);
      pk.stroke(ring);
    }
  }
  const zoomFade = seg(t, 5.4, 6.6);
  drawRecord(r, {
    cx: C1[0],
    cy: C1[1],
    R: R1,
    rev: R1,
    spin: phi,
    disc: 1 - seg(t, 5.2, 6.4),
    gB: lerp(1, 0, zoomFade),
    gV: lerp(0, 0.55, zoomFade) * (1 - seg(t, 8.3, 9.2)),
    contact: true,
    phi,
    labelPulse: pulse(t, 1.8, 0.14),
    labelK: 1,
    pinkTone: lerp(0.55, 1, seg(z, 1.5, 6)) * (1 - seg(t, 5.0, 5.5)),
  });
  if (z < 10) drawArm(r, t);
}

function drawArm(r: Riso, t: number) {
  const [aq, pk, vi, bk] = r.layers;
  const ang = lerp(ARM_REST, ARM_T, ease.inOutCubic(seg(t, 0.35, 1.45)));
  const lift = 1 - ease.inCubic(seg(t, 1.5, 1.8));
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const hs = ang + 0.38;
  const hx = Math.cos(hs);
  const hy = Math.sin(hs);
  const build = (ox: number, oy: number) => {
    const tip: Pt = [PIVOT[0] + ux * ARM_L + ox, PIVOT[1] + uy * ARM_L + oy];
    const el: Pt = [tip[0] - hx * 52, tip[1] - hy * 52];
    const tube = new Path2D();
    tube.moveTo(PIVOT[0] + ox * 0.3, PIVOT[1] + oy * 0.3);
    tube.lineTo(el[0], el[1]);
    const shell = new Path2D();
    const px = -hy;
    const py = hx;
    const a: Pt = [el[0] - hx * 6, el[1] - hy * 6];
    const b: Pt = [tip[0] + hx * 14, tip[1] + hy * 14];
    shell.moveTo(a[0] + px * 13, a[1] + py * 13);
    shell.lineTo(b[0] + px * 15, b[1] + py * 15);
    shell.lineTo(b[0] - px * 15, b[1] - py * 15);
    shell.lineTo(a[0] - px * 13, a[1] - py * 13);
    shell.closePath();
    // finger lift tab
    shell.moveTo(b[0] + px * 15, b[1] + py * 15);
    shell.lineTo(b[0] + px * 30 + hx * 6, b[1] + py * 30 + hy * 6);
    shell.lineTo(b[0] + px * 26 + hx * 14, b[1] + py * 26 + hy * 14);
    shell.lineTo(b[0] + px * 8, b[1] + py * 8);
    shell.closePath();
    return { tube, shell, tip };
  };
  // shadow
  const sh = build(10 + lift * 18, 14 + lift * 22);
  vi.lineWidth = 12;
  vi.lineCap = 'round';
  vi.strokeStyle = r.tone(vi, 0.45);
  vi.stroke(sh.tube);
  vi.fillStyle = r.tone(vi, 0.45);
  vi.fill(sh.shell);
  // base
  const base = circ(PIVOT[0], PIVOT[1], 64);
  vi.fillStyle = r.tone(vi, 0.55);
  vi.fill(base);
  bk.lineWidth = 3;
  bk.strokeStyle = '#000';
  bk.stroke(base);
  const cw = new Path2D();
  const cx0 = PIVOT[0] - ux * 44;
  const cy0 = PIVOT[1] - uy * 44;
  const cx1 = PIVOT[0] - ux * 104;
  const cy1 = PIVOT[1] - uy * 104;
  cw.moveTo(cx0 - uy * 26, cy0 + ux * 26);
  cw.lineTo(cx1 - uy * 26, cy1 + ux * 26);
  cw.lineTo(cx1 + uy * 26, cy1 - ux * 26);
  cw.lineTo(cx0 + uy * 26, cy0 - ux * 26);
  cw.closePath();
  bk.fillStyle = '#000';
  bk.fill(cw);
  aq.fillStyle = r.tone(aq, 0.7);
  aq.fill(cw);
  // rest post
  const post = circ(PIVOT[0] + Math.cos(ARM_REST) * (ARM_L - 70), PIVOT[1] + Math.sin(ARM_REST) * (ARM_L - 70), 12);
  bk.fill(post);
  // arm
  const arm = build(-lift * 5, -lift * 7);
  bk.lineWidth = 12;
  bk.lineCap = 'round';
  bk.stroke(arm.tube);
  bk.fill(arm.shell);
  bk.globalCompositeOperation = 'destination-out';
  bk.lineWidth = 3;
  bk.stroke(arm.tube);
  bk.globalCompositeOperation = 'source-over';
  aq.lineWidth = 3;
  aq.strokeStyle = '#000';
  aq.stroke(arm.tube);
  pk.fillStyle = '#000';
  pk.fill(circ(arm.tip[0], arm.tip[1], 5));
  const piv = circ(PIVOT[0], PIVOT[1], 26);
  bk.fill(piv);
  pk.fill(circ(PIVOT[0], PIVOT[1], 10));
}

/* ---------- scene 2: the wave in screen space ---------- */
function drawWaveExtras(r: Riso, t: number, s: State, main: Pt[]) {
  const [aq, pk, vi] = r.layers;
  const e = seg(t, 5.5, 6.2) * (1 - seg(t, 8.2, 8.9));
  if (e <= 0.01) return;
  // area under the wave
  const fill = new Path2D();
  fill.moveTo(main[0][0], 450);
  for (const p of main) fill.lineTo(p[0], p[1]);
  fill.lineTo(main[main.length - 1][0], 450);
  fill.closePath();
  pk.fillStyle = r.tone(pk, 0.26 * e);
  pk.fill(fill);
  // echoes
  const echo = (lag: number, dy: number) => {
    const p = new Path2D();
    for (let j = 0; j < LINE_N; j += 2) {
      const x = -20 + (j / (LINE_N - 1)) * 1640;
      const y = 450 + dy - waveDisp(x, t - lag, s) * 0.92;
      if (j) p.lineTo(x, y);
      else p.moveTo(x, y);
    }
    return p;
  };
  aq.lineWidth = 7;
  aq.lineJoin = 'round';
  aq.strokeStyle = r.tone(aq, 0.95 * e);
  aq.stroke(echo(0.12, 10));
  vi.lineWidth = 5;
  vi.lineJoin = 'round';
  vi.strokeStyle = r.tone(vi, 0.9 * e);
  vi.stroke(echo(0.24, 22));
  // step sequencer: eight steps, one lights on every eighth note
  const step = Math.floor(Math.max(0, t - 5.4) / (BEAT / 2)) % 8;
  const sq = new Path2D();
  const lit = new Path2D();
  for (let i = 0; i < 8; i++) {
    const x = 800 + (i - 3.5) * 46 - 14;
    const y = 790;
    (i === step && t > 5.4 ? lit : sq).rect(x, y, 28, 28);
  }
  vi.fillStyle = r.tone(vi, 0.5 * e);
  vi.fill(sq);
  pk.fillStyle = r.tone(pk, e);
  pk.fill(lit);
  aq.fillStyle = r.tone(aq, e);
  aq.fill(lit);
}

/* ---------- scene 3: guitar ---------- */
function drawGuitar(r: Riso, t: number, s: State, pink: Pt[]) {
  const [aq, pk, vi, bk] = r.layers;
  const h = 560 * ease.outCubic(seg(t, 9.0, 10.0)) * (1 - ease.inCubic(seg(t, 13.0, 13.6)));
  if (h < 1) return;
  // the whole guitar rides down with the string as it becomes the horizon
  const dy = baseY(t) - 450;
  const mask = new Path2D();
  mask.rect(-400, 463 + dy - h, 2400, 2 * h);
  for (const c of r.layers) {
    c.save();
    c.clip(mask);
    c.translate(0, dy);
  }
  // body
  r.gradient(aq, s.body, { kind: 'radial', cx: 1470, cy: 463, r0: 120, r1: 520, from: 0.85, to: 0.35 }, 10);
  pk.fillStyle = r.tone(pk, 0.16);
  pk.fill(s.body);
  bk.lineWidth = 5;
  bk.strokeStyle = '#000';
  bk.stroke(s.body);
  // soundhole + rosette
  const hole = circ(1470, 463, 118);
  vi.fillStyle = '#000';
  vi.fill(hole);
  bk.fillStyle = r.tone(bk, 0.7);
  bk.fill(hole);
  pk.lineWidth = 6;
  pk.strokeStyle = '#000';
  pk.stroke(circ(1470, 463, 130));
  pk.lineWidth = 2;
  pk.stroke(circ(1470, 463, 141));
  bk.lineWidth = 3;
  bk.stroke(circ(1470, 463, 150));
  vi.lineWidth = 2;
  vi.strokeStyle = r.tone(vi, 0.7);
  vi.stroke(circ(1470, 463, 136));
  // neck
  const neck = new Path2D();
  neck.rect(XN - 10, 381, 1060, 165);
  vi.fillStyle = '#000';
  vi.fill(neck);
  bk.fillStyle = r.tone(bk, 0.42);
  bk.fill(neck);
  bk.lineWidth = 3;
  bk.stroke(neck);
  const frets = new Path2D();
  for (let n = 1; n <= 19; n++) {
    const x = fretX(n);
    frets.moveTo(x, 382);
    frets.lineTo(x, 545);
  }
  for (const c of [vi, bk]) {
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = 6;
    c.stroke(frets);
    c.globalCompositeOperation = 'source-over';
  }
  aq.lineWidth = 3;
  aq.strokeStyle = '#000';
  aq.stroke(frets);
  const inl = new Path2D();
  for (const n of [3, 5, 7, 9, 15, 17]) circ((fretX(n) + fretX(n - 1)) / 2, 463, 9, inl);
  const x12 = (fretX(12) + fretX(11)) / 2;
  circ(x12, 424, 9, inl);
  circ(x12, 502, 9, inl);
  pk.fillStyle = '#000';
  pk.fill(inl);
  // headstock
  vi.fill(s.head);
  bk.fillStyle = r.tone(bk, 0.72);
  bk.fill(s.head);
  bk.lineWidth = 3;
  bk.stroke(s.head);
  const tuners = new Path2D();
  const postsP = new Path2D();
  POSTS.forEach(([x, y], i) => {
    const ty = i < 3 ? y - 62 : y + 62;
    tuners.ellipse(x, ty, 17, 13, 0, 0, TAU);
    tuners.moveTo(x, y);
    circ(x, y, 7, postsP);
  });
  aq.fillStyle = '#000';
  aq.fill(tuners);
  pk.fillStyle = r.tone(pk, 0.5);
  pk.fill(tuners);
  bk.lineWidth = 2.5;
  bk.stroke(tuners);
  const nut = new Path2D();
  nut.rect(XN - 6, 380, 12, 168);
  for (const c of [vi, bk]) {
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.fill(nut);
    c.fill(postsP);
    c.globalCompositeOperation = 'source-over';
  }
  bk.lineWidth = 2;
  bk.stroke(postsP);
  aq.fillStyle = r.tone(aq, 0.4);
  aq.fill(nut);
  // strings
  const pinkP = linePath(pink.map((q): Pt => [q[0], q[1] - dy]));
  const strings = new Path2D();
  const ghosts = new Path2D();
  for (let i = 0; i < 6; i++) {
    if (i === 2) continue;
    const y0 = STR_Y[i];
    for (const g of [1, -1]) {
      const p = g === 1 ? strings : ghosts;
      p.moveTo(POSTS[i][0], POSTS[i][1]);
      p.lineTo(XN, y0);
      for (let x = XN + 20; x <= 1800; x += 20) p.lineTo(x, y0 - g * stringDisp(x, t, i));
    }
  }
  for (const c of [aq, vi, bk]) {
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = 6;
    c.stroke(strings);
    c.lineWidth = 10;
    c.stroke(pinkP);
    c.globalCompositeOperation = 'source-over';
  }
  bk.lineWidth = 2.4;
  bk.strokeStyle = '#000';
  bk.stroke(strings);
  bk.lineWidth = 1.6;
  bk.strokeStyle = r.tone(bk, 0.45);
  bk.stroke(ghosts);
  // fretting hand: palm below the neck, tapered fingers arching onto strings 3-5
  const handIn = ease.outCubic(seg(t, 9.2, 9.9));
  const hy = (1 - handIn) * 320 + ease.inCubic(seg(t, 12.3, 12.85)) * 420;
  const pressY = 3 * pulse(t, STRUM0, 0.12);
  const part = (p: Path2D, gap: number) => {
    for (const c of [vi, bk, aq]) {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
      c.lineJoin = 'round';
      c.lineWidth = gap;
      c.stroke(p);
      c.fillStyle = '#000';
      c.fill(p);
      c.globalCompositeOperation = 'source-over';
    }
    bk.fillStyle = '#000';
    bk.fill(p);
  };
  // thumb tip peeks over the top edge of the neck and slides behind it
  const top = new Path2D();
  top.rect(0, 0, 1600, 381);
  for (const c of r.layers) {
    c.save();
    c.clip(top);
    c.translate(0, hy);
  }
  part(s.thumb, 6);
  for (const c of r.layers) c.restore();
  for (const c of r.layers) {
    c.save();
    c.translate(0, hy);
  }
  part(s.palm, 8);
  s.fingers.forEach((f, i) => {
    for (const c of r.layers) {
      c.save();
      c.translate(0, pressY * (i < 3 ? 1 : 0.4));
    }
    part(f, 6);
    for (const c of r.layers) c.restore();
  });
  bk.globalCompositeOperation = 'destination-out';
  bk.strokeStyle = '#000';
  bk.lineWidth = 2.5;
  bk.lineCap = 'round';
  bk.stroke(s.creases);
  bk.globalCompositeOperation = 'source-over';
  for (const c of r.layers) c.restore();
  // strumming hand
  const amp = 120 * seg(t, 9.1, 9.5) * (1 - seg(t, 12.25, 12.7));
  const py = 463 + amp * Math.sin((Math.PI * (t - STRUM0)) / 0.3);
  const enter = (1 - ease.outCubic(seg(t, 9.0, 9.6))) * 420 + ease.inCubic(seg(t, 12.3, 12.9)) * 420;
  const px = 1395 + 8 * Math.sin(t * 3) + enter * 0.6;
  bk.save();
  bk.translate(px, py + enter);
  bk.rotate(-0.12);
  bk.fillStyle = '#000';
  bk.fill(s.hand);
  bk.restore();
  for (const c of [aq, vi, bk]) {
    c.save();
    c.translate(px, py + enter);
    c.rotate(-0.12);
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = 12;
    c.stroke(s.hand);
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }
  bk.save();
  bk.translate(px, py + enter);
  bk.rotate(-0.12);
  bk.fill(s.hand);
  bk.globalCompositeOperation = 'destination-out';
  bk.lineWidth = 3;
  bk.lineCap = 'round';
  bk.beginPath();
  bk.moveTo(30, -4);
  bk.quadraticCurveTo(62, -16, 98, -22);
  bk.moveTo(118, 8);
  bk.quadraticCurveTo(138, 26, 140, 46);
  bk.moveTo(96, 30);
  bk.quadraticCurveTo(112, 56, 108, 78);
  bk.stroke();
  bk.globalCompositeOperation = 'source-over';
  bk.restore();
  pk.save();
  pk.translate(px, py + enter);
  pk.rotate(-0.12);
  pk.fillStyle = '#000';
  pk.beginPath();
  pk.moveTo(-36, 10);
  pk.quadraticCurveTo(4, -34, 52, -32);
  pk.quadraticCurveTo(62, 18, 44, 38);
  pk.quadraticCurveTo(-8, 36, -36, 10);
  pk.fill();
  pk.restore();
  for (const c of r.layers) c.restore();
}

/* ---------- scene 4: city equaliser ---------- */
function bldHeight(b: Bld, i: number, t: number, n: number) {
  const f = i / (n - 1);
  const kick = pulse(t, 13.2, 0.22);
  const snare = pulse(t, 13.5, 0.18, BEAT * 2);
  const hat = pulse(t, 13.2, 0.08, BEAT / 2);
  let lvl = 0.35 + 0.55 * kick * Math.exp(-f * 2.2) + 0.5 * snare * Math.exp(-(((f - 0.6) / 0.2) ** 2)) + 0.3 * hat * f;
  lvl += 0.15 * noise1(t * 5 + i * 3.1, 4);
  const rise = ease.outCubic(seg(t, 13.1 + i * 0.018, 13.8 + i * 0.018));
  const sink = 1 - ease.inCubic(seg(t, 16.15 + Math.abs(f - 0.5) * 0.3, 16.6 + Math.abs(f - 0.5) * 0.3));
  return b.h * clamp(lvl, 0.15, 1.1) * rise * sink;
}

function drawCity(r: Riso, t: number, s: State) {
  const [aq, pk, vi, bk] = r.layers;
  const by = baseY(t);
  const up = ease.outCubic(seg(t, 12.85, 13.8)) * (1 - ease.inCubic(seg(t, 16.3, 17.0)));
  if (up > 0.002) {
    const sky = new Path2D();
    sky.rect(0, by - up * by, 1600, up * by);
    r.gradient(vi, sky, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: by, from: 0.92, to: 0.22 }, 12);
    r.gradient(aq, sky, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: by, from: 0.6, to: 0.05 }, 10);
    // search beams sway on the half bar
    const beams = new Path2D();
    for (const [bx, ph] of [
      [540, 0],
      [1060, 1.9],
    ]) {
      const a = -Math.PI / 2 + 0.45 * Math.sin((TAU * t) / (BEAT * 4) + ph);
      const ex = bx + Math.cos(a) * 900;
      const ey = by + Math.sin(a) * 900;
      const nx = -Math.sin(a) * 60;
      const ny = Math.cos(a) * 60;
      beams.moveTo(bx, by);
      beams.lineTo(ex + nx, ey + ny);
      beams.lineTo(ex - nx, ey - ny);
      beams.closePath();
    }
    vi.save();
    vi.clip(sky);
    vi.globalCompositeOperation = 'destination-out';
    vi.fillStyle = r.tone(vi, 0.45);
    vi.fill(beams);
    vi.globalCompositeOperation = 'source-over';
    // moon
    const moon = circ(1220, 160, 62);
    vi.globalCompositeOperation = 'destination-out';
    vi.fillStyle = '#000';
    vi.fill(moon);
    vi.globalCompositeOperation = 'source-over';
    vi.restore();
    aq.save();
    aq.clip(sky);
    aq.globalCompositeOperation = 'destination-out';
    aq.fillStyle = '#000';
    aq.fill(moon);
    aq.globalCompositeOperation = 'source-over';
    aq.fillStyle = r.tone(aq, 0.22);
    aq.fill(moon);
    pk.save();
    pk.clip(sky);
    pk.fillStyle = r.tone(pk, 0.12);
    pk.fill(beams);
    pk.restore();
    aq.restore();
    // ground glow
    const ground = new Path2D();
    ground.rect(0, by, 1600, up * (900 - by));
    r.gradient(pk, ground, { kind: 'radial', cx: 800, cy: 960, r0: 0, r1: 760, from: 0.85, to: 0.18 }, 10);
    vi.fillStyle = r.tone(vi, 0.18);
    vi.fill(ground);
  }
  // skyline bars
  const n = s.blds.length;
  const bars = new Path2D();
  const extra = new Path2D();
  const winP = new Path2D();
  const winA = new Path2D();
  const caps = new Path2D();
  s.blds.forEach((b, i) => {
    const hgt = bldHeight(b, i, t, n);
    if (hgt < 1) return;
    const top = by - hgt;
    bars.rect(b.x, top, b.w, hgt + 2);
    if (b.crown > 0 && hgt > 60) extra.rect(b.x + b.w * 0.2, top - b.crown, b.w * 0.6, b.crown + 1);
    if (b.antenna && hgt > 80) extra.rect(b.x + b.w / 2 - 1.5, top - b.crown - 34, 3, 36);
    const cols = Math.max(2, Math.floor((b.w - 10) / 14));
    const cw = (b.w - 10) / cols;
    for (let row = 0; by - 22 - row * 20 > top + 8; row++) {
      for (let c = 0; c < cols; c++) {
        const hv = hash(b.seed + row * 13.7 + c * 3.3);
        const flick = hash(b.seed + row * 2.1 + c + Math.floor((t - 13.2) / BEAT) * 0.37);
        const x = b.x + 5 + c * cw + 2;
        const y = by - 22 - row * 20;
        if (hv > 0.6 || (hv > 0.45 && flick > 0.6)) winP.rect(x, y, cw - 5, 10);
        else if (hv > 0.3) winA.rect(x, y, cw - 5, 10);
      }
    }
    // peak-hold cap that falls under gravity
    let cap = 0;
    for (let k = 0; k <= 14; k++) {
      const tau = k * 0.04;
      cap = Math.max(cap, bldHeight(b, i, t - tau, n) - 700 * tau * tau);
    }
    if (cap > 4) caps.rect(b.x + 4, by - cap - 22, b.w - 8, 8);
  });
  vi.fillStyle = '#000';
  vi.fill(bars);
  vi.fill(extra);
  bk.fillStyle = r.tone(bk, 0.78);
  bk.fill(bars);
  bk.fill(extra);
  for (const c of [vi, bk]) {
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.fill(winP);
    c.fill(winA);
    c.globalCompositeOperation = 'source-over';
  }
  pk.fillStyle = '#000';
  pk.fill(winP);
  pk.fill(caps);
  aq.fillStyle = '#000';
  aq.fill(winA);
  aq.fillStyle = r.tone(aq, 0.5);
  aq.fill(caps);
  // speakers
  const sx = (1 - ease.outCubic(seg(t, 13.45, 14.1))) * 330 + ease.inCubic(seg(t, 16.1, 16.7)) * 330;
  if (sx < 329) {
    const kick = pulse(t, 13.2, 0.15);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 24 - sx : 1346 + sx;
      const cab = new Path2D();
      cab.roundRect(x0, 300, 230, 620, 10);
      bk.fillStyle = '#000';
      bk.fill(cab);
      vi.fillStyle = '#000';
      vi.fill(cab);
      for (const [cy, rr] of [
        [430, 80],
        [690, 96],
      ]) {
        const cx = x0 + 115;
        const sc = 1 + 0.07 * kick;
        const R = rr * sc;
        for (const c of [vi, bk]) {
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = '#000';
          c.fill(circ(cx, cy, R + 6));
          c.globalCompositeOperation = 'source-over';
        }
        const sur = circ(cx, cy, R);
        circ(cx, cy, R * 0.84, sur);
        pk.fillStyle = '#000';
        pk.fill(sur, 'evenodd');
        bk.fillStyle = r.tone(bk, 0.55);
        bk.fill(sur, 'evenodd');
        r.gradient(vi, circ(cx, cy, R * 0.84), { kind: 'radial', cx, cy, r0: R * 0.3, r1: R * 0.84, from: 0.35, to: 0.95 }, 6);
        bk.lineWidth = 2;
        bk.strokeStyle = r.tone(bk, 0.7);
        bk.stroke(circ(cx, cy, R * 0.6));
        aq.fillStyle = '#000';
        aq.fill(circ(cx, cy, R * 0.28));
        pk.fill(circ(cx, cy, R * 0.28));
      }
      // tweeter
      const tw = circ(x0 + 115, 560, 18);
      aq.fill(tw);
    }
  }
  // crowd
  const cyOff = (1 - ease.outCubic(seg(t, 13.5, 14.2))) * 280 + ease.inCubic(seg(t, 16.05, 16.6)) * 280;
  if (cyOff < 279) {
    const crowd = new Path2D();
    const arms = new Path2D();
    for (const p of s.crowd) {
      const bob = 8 * pulse(t, 13.2 + p.off, 0.2);
      const sy = 880 + cyOff + bob;
      circ(p.x + p.lean, sy - 34 - p.r, p.r, crowd);
      crowd.roundRect(p.x - 46, sy - 18, 92, 140, 34);
      for (let a = 0; a < p.arms; a++) {
        const sd = a === 0 ? (p.x % 2 > 1 ? 1 : -1) : -(p.x % 2 > 1 ? 1 : -1);
        const pump = pulse(t, 13.2 + p.off, 0.22);
        const hx = p.x + sd * (34 + 10 * pump);
        const hyy = sy - 150 - 45 * pump;
        arms.moveTo(p.x + sd * 32, sy - 4);
        arms.quadraticCurveTo(p.x + sd * 58, sy - 80, hx, hyy);
        circ(hx, hyy - 6, 15, crowd);
      }
    }
    bk.fillStyle = '#000';
    bk.fill(crowd);
    bk.lineWidth = 20;
    bk.lineCap = 'round';
    bk.strokeStyle = '#000';
    bk.stroke(arms);
  }
}

/* ---------- scene 5: run-out ---------- */
function drawFinale(r: Riso, t: number) {
  if (t < 16.6) return;
  const k = seg(t, 16.6, 18.4);
  const spin = -3.1 * (1 - k) * (1 - k);
  const rev = lerp(LAB, 300, ease.outCubic(seg(t, 16.72, 17.5)));
  drawRecord(r, {
    cx: 800,
    cy: 450,
    R: 300,
    rev,
    spin,
    disc: 1,
    gB: 1,
    gV: 0,
    contact: false,
    phi: 0,
    labelPulse: t < 18.4 ? pulse(t, 16.8, 0.14) * (1 - k) : 0,
    labelK: ease.outBack(seg(t, 16.68, 17.0)),
  pinkTone: 0,
  });
  // leading edge ripple as the grooves press outward
  const [aq, pk, , bk] = r.layers;
  const e = seg(t, 16.72, 17.5);
  if (e > 0 && e < 1) {
    pk.lineWidth = 6 * (1 - e) + 1;
    pk.strokeStyle = r.tone(pk, 0.9 * (1 - e));
    pk.stroke(circ(800, 450, rev + 8));
  }
  // caption
  const c = seg(t, 18.0, 18.6);
  if (c > 0) {
    bk.font = `700 20px ${MONO}`;
    bk.textBaseline = 'middle';
    bk.fillStyle = r.tone(bk, 0.25 + 0.75 * c);
    spacedText(bk, 'MUSIC ALWAYS ON', 800, 830, 9);
    aq.fillStyle = r.tone(aq, c);
    aq.fillRect(800 - 160 * c, 856, 320 * c, 4);
  }
}

export const bSideFilm: RisoFilm<State> = {
  id: 'b-side',
  title: 'B-Side',
  caption: 'A groove becomes a wave, a string, a city skyline, and a record again.',
  theme: 'Music',
  motif: 'The groove / sound wave',
  duration: 20,
  paper: '#f3ead8',
  inks: [
    { color: '#5ec8e5', offset: [1.5, -1] },
    { color: '#ff48b0', offset: [-1.2, 0.8] },
    { color: '#9d7ad2', offset: [0.6, 1.2] },
    { color: '#2b2b30', offset: [0, 0], opacity: 0.86 },
  ],
  scenes: [
    { at: 0, label: 'Needle drop' },
    { at: 3, label: 'Into the groove' },
    { at: 8.4, label: 'Plucked' },
    { at: 12.6, label: 'Skyline EQ' },
    { at: 16, label: 'Run-out' },
  ],
  posterTime: 14.6,
  setup() {
    const dt = 1 / 240;
    const n = Math.round(5 / dt);
    const phi = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      const tm = (i - 0.5) * dt;
      phi[i] = phi[i - 1] + (OMEGA0 / Math.pow(zoomAt(tm), 1.37)) * dt;
    }
    const rng = mulberry(1977);
    const blds: Bld[] = [];
    let x = 4;
    let i = 0;
    while (x < 1600) {
      const w = 44 + Math.floor(rng() * 22);
      const mid = 1 - Math.abs(x + w / 2 - 800) / 900;
      blds.push({
        x,
        w,
        h: 110 + rng() * 170 + mid * 160,
        crown: rng() < 0.4 ? 10 + rng() * 16 : 0,
        antenna: rng() < 0.3,
        seed: i * 17.3 + 5,
      });
      x += w + 8 + Math.floor(rng() * 6);
      i++;
    }
    const crowd: Person[] = [];
    for (let cx = 300; cx < 1320; cx += 68 + rng() * 22) {
      crowd.push({
        x: cx,
        r: 26 + rng() * 9,
        arms: rng() < 0.25 ? 0 : rng() < 0.7 ? 1 : 2,
        off: rng() < 0.5 ? 0 : BEAT / 2,
        lean: (rng() - 0.5) * 10,
      });
    }
    const body = smoothPath(
      [
        [1228, 384],
        [1290, 300],
        [1330, 180],
        [1420, 92],
        [1560, 60],
        [1700, 70],
        [1820, 130],
        [1820, 800],
        [1700, 858],
        [1560, 866],
        [1420, 834],
        [1330, 746],
        [1290, 626],
        [1228, 544],
      ],
      true,
      0.5
    );
    const head = smoothPath(
      [
        [XN, 382],
        [150, 352],
        [70, 336],
        [24, 350],
        [16, 463],
        [24, 576],
        [70, 590],
        [150, 574],
        [XN, 544],
      ],
      true,
      0.4
    );
    const hand = smoothPath(
      [
        [22, -26],
        [70, -50],
        [124, -42],
        [154, -10],
        [164, 32],
        [330, 470],
        [230, 560],
        [96, 98],
        [50, 84],
        [24, 48],
        [28, 8],
      ],
      true,
      0.45
    );
    const creases = new Path2D();
    /** Tapered finger along a quadratic curve with a rounded tip and two joint creases */
    const finger = (b0: Pt, c0: Pt, tip: Pt, w0: number, w1: number) => {
      const n = 16;
      const left: Pt[] = [];
      const right: Pt[] = [];
      let last: Pt = [0, 1];
      for (let j = 0; j <= n; j++) {
        const u = j / n;
        const x = (1 - u) * (1 - u) * b0[0] + 2 * u * (1 - u) * c0[0] + u * u * tip[0];
        const y = (1 - u) * (1 - u) * b0[1] + 2 * u * (1 - u) * c0[1] + u * u * tip[1];
        const tx = 2 * (1 - u) * (c0[0] - b0[0]) + 2 * u * (tip[0] - c0[0]);
        const ty = 2 * (1 - u) * (c0[1] - b0[1]) + 2 * u * (tip[1] - c0[1]);
        const l = Math.hypot(tx, ty) || 1;
        const nx = -ty / l;
        const ny = tx / l;
        // knuckle swell at the middle joint
        const w = (lerp(w0, w1, u) / 2) * (1 + 0.1 * Math.exp(-(((u - 0.5) / 0.08) ** 2)));
        left.push([x + nx * w, y + ny * w]);
        right.push([x - nx * w, y - ny * w]);
        last = [tx / l, ty / l];
        if (j === 8 || j === 13) {
          creases.moveTo(x + nx * w * 0.55, y + ny * w * 0.55);
          creases.lineTo(x - nx * w * 0.55 + (tx / l) * 3, y - ny * w * 0.55 + (ty / l) * 3);
        }
      }
      const p = new Path2D();
      p.moveTo(left[0][0], left[0][1]);
      for (const q of left) p.lineTo(q[0], q[1]);
      const ang = Math.atan2(last[1], last[0]);
      p.arc(tip[0], tip[1], w1 / 2, ang - Math.PI / 2, ang + Math.PI / 2);
      for (let j = right.length - 1; j >= 0; j--) p.lineTo(right[j][0], right[j][1]);
      p.closePath();
      return p;
    };
    const fx = (n: number) => (fretX(n) + fretX(n + 1)) / 2 + 8;
    const fingers = [
      finger([700, 668], [738, 600], [756, 566], 28, 19),
      finger([650, 650], [654, 556], [fx(6), 528], 33, 22),
      finger([592, 642], [584, 540], [fx(5), 502], 34, 23),
      finger([532, 652], [498, 548], [fx(4), 476], 33, 22),
    ];
    const thumb = finger([592, 420], [600, 362], [650, 364], 30, 22);
    const palm = smoothPath(
      [
        [516, 664],
        [580, 630],
        [660, 636],
        [716, 662],
        [736, 730],
        [716, 830],
        [700, 960],
        [530, 960],
        [500, 830],
        [500, 730],
      ],
      true,
      0.5
    );
    creases.moveTo(536, 690);
    creases.quadraticCurveTo(620, 668, 704, 690);
    creases.moveTo(560, 800);
    creases.quadraticCurveTo(600, 760, 640, 735);
    return { phi, dt, blds, crowd, body, head, hand, fingers, thumb, palm, creases };
  },
  draw(r, t, s) {
    if (t < 9.4) {
      const c = cam1(t);
      r.camera(c[0], c[1], c[2], c[3]);
      drawTurntable(r, t, s, c[2]);
    }
    const pink = t >= 5 && t < 17.3 ? pinkPoints(t, s) : null;
    if (pink && t < 8.95) {
      r.camera(800, 450, 1);
      drawWaveExtras(r, t, s, pink);
    }
    if (t >= 12.85 && t < 17.1) {
      r.camera(800, 450, 1);
      drawCity(r, t, s);
    }
    if (pink && t >= 8.8 && t < 13.65) {
      const c = cam3(t);
      r.camera(c[0], c[1], c[2], c[3]);
      drawGuitar(r, t, s, pink);
    }
    if (t >= 16) {
      r.camera(800, 450, 1);
      drawFinale(r, t);
    }
    if (pink) {
      const c = cam3(t);
      r.camera(c[0], c[1], c[2], c[3]);
      const pk: Ctx = r.layers[PK];
      const w =
        t < 5.9
          ? lerp(1.5 * ZH, 12, ease.inOutCubic(seg(t, 5, 5.9)))
          : t < 12.6
            ? lerp(12, 6, ease.inOutCubic(seg(t, 8.2, 9.0)))
            : lerp(6, 8, seg(t, 12.8, 13.6));
      // vibration blur band on the plucked string
      if (t > 8.6 && t < 13.4) {
        const band = new Path2D();
        const by = t >= 12.6 ? baseY(t) : 450;
        const amp = stringAmp(t, 2);
        band.moveTo(XN, by);
        for (let x = XN; x <= 1800; x += 20) band.lineTo(x, by - stringShape(x) * amp);
        for (let x = 1800; x >= XN; x -= 20) band.lineTo(x, by + stringShape(x) * amp);
        band.closePath();
        pk.fillStyle = r.tone(pk, 0.22 * seg(t, 9.2, 9.7));
        pk.fill(band);
      }
      if (t < 17.0) {
        pk.lineWidth = w;
        pk.lineJoin = 'round';
        pk.lineCap = 'round';
        pk.strokeStyle = '#000';
        pk.stroke(linePath(pink));
      }
    }
    r.camera(800, 450, 1);
  },
};
