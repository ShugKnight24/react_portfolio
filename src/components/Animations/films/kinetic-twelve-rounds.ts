import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { clamp, lerp, seg, ease, TAU, type Pt } from '../riso/kit';
import {
  KIN,
  rgba,
  ktext,
  kwidth,
  CAP,
  masked,
  label,
  fmt,
  col,
  row,
  drawGrid,
  wipeBands,
  ecg,
  pose,
  fk,
  ik2,
  ankleFromBall,
  BODY,
  drawFigure,
  makeGait,
  runArm,
  type Gait,
  type FigStyle,
  type Joints,
} from '../styles/kinetic';

/**
 * Twelve Rounds: a boxer's training day as kinetic type. 5:00 AM on the clock, roadwork on a
 * heart-rate line, the skipping rope's rhythm, the heavy bag counted out 1-2-3-2 with numbers
 * that land like punches, sparring called in single words, the final bell, and one word card.
 * The count keeps the beat all day: clock, turns, punches, seconds, bell.
 */

/* ---------- palette ---------- */

const BLACK = KIN.black;
const WHITE = KIN.white;
const RED = '#e8162b';
const YELLOW = '#ffd21a';
const GREY = '#7d7c78';

const DUR = 19;

/* ---------- section times ---------- */

const T_SKIP = 3.4;
const T_BAG = 6.9;
const T_SPAR = 11.6;
const T_BELL = 14.6;
const T_CARD = 16.2;
const WIPE = 0.5;

/* ---------- boxer rig ---------- */

interface Box {
  dx: number;
  dy: number;
  lean: number;
  head: number;
  twist: number;
  uaN: number;
  faN: number;
  hdN: number;
  flN: number;
  uaF: number;
  faF: number;
  hdF: number;
  flF: number;
  pN: number;
  pF: number;
}
const KEYS = Object.keys({ dx: 0, dy: 0, lean: 0, head: 0, twist: 0, uaN: 0, faN: 0, hdN: 0, flN: 0, uaF: 0, faF: 0, hdF: 0, flF: 0, pN: 0, pF: 0 } satisfies Box) as (keyof Box)[];
const mixBox = (a: Box, b: Box, k: number): Box => {
  const o = { ...a };
  for (const key of KEYS) o[key] = lerp(a[key], b[key], k);
  return o;
};

const GUARD: Box = { dx: 0, dy: 0, lean: 8, head: 16, twist: 0.1, uaN: 45, faN: 160, hdN: 150, flN: 1, uaF: 38, faF: 176, hdF: 172, flF: 1, pN: 4, pF: 30 };
const JAB: Box = { ...GUARD, dx: 0.035, dy: 0.006, lean: 13, head: 16, twist: -0.3, uaN: 90, faN: 90, hdN: 90, pF: 34 };
const CROSS: Box = { ...GUARD, dx: 0.065, dy: 0.012, lean: 17, head: 18, twist: 0.95, uaF: 87, faF: 88, hdF: 88, uaN: 32, faN: 168, hdN: 160, pF: 62, pN: 6 };
const HOOK: Box = { ...GUARD, dx: 0.0, dy: 0.014, lean: 9, head: 16, twist: -0.85, uaN: 84, faN: 96, hdN: 98, flN: 0.42, pN: 34, pF: 22 };
const SLIP: Box = { ...GUARD, dx: -0.05, dy: 0.05, lean: -2, head: 4 };
const ROLL: Box = { ...GUARD, dx: 0.0, dy: 0.1, lean: 42, head: 50 };

type Kind = 'jab' | 'cross' | 'hook' | 'slip' | 'roll';
const POSES: Record<Kind, Box> = { jab: JAB, cross: CROSS, hook: HOOK, slip: SLIP, roll: ROLL };
const NAMES: Record<Kind, string> = { jab: 'JAB', cross: 'CROSS', hook: 'HOOK', slip: 'SLIP', roll: 'ROLL' };
const NUM: Record<Kind, string> = { jab: '1', cross: '2', hook: '3', slip: '', roll: '' };

interface Ev {
  t: number;
  kind: Kind;
}

/** Weight of an event for a body part sampled at time tt (fast out, slower return) */
const evW = (tt: number, e: Ev, rise = 0.11, hold = 0.05, back = 0.2) => {
  if (tt < e.t - rise || tt > e.t + hold + back) return 0;
  if (tt < e.t) return ease.outCubic(seg(tt, e.t - rise, e.t));
  return 1 - ease.inOutSine(seg(tt, e.t + hold, e.t + hold + back));
};

/** Kinetic chain: legs and hips lead, then torso, then the arm */
const boxAt = (t: number, evs: Ev[], idle: number, scaleT = 1): Box => {
  const part = (off: number) => {
    let best = 0;
    let kind: Kind | null = null;
    for (const e of evs) {
      const w = evW(t + off, e, 0.11 * scaleT, 0.05 * scaleT, 0.2 * scaleT);
      if (w > best) {
        best = w;
        kind = e.kind;
      }
    }
    return kind ? mixBox(GUARD, POSES[kind], best) : GUARD;
  };
  const legs = part(0.045);
  const torso = part(0.022);
  const arms = part(0);
  // bounce on the balls of the feet between punches
  const bob = Math.sin(idle * TAU * 1.6) * 0.006;
  return {
    ...arms,
    dx: legs.dx + Math.sin(idle * TAU * 0.8) * 0.006,
    dy: legs.dy + bob,
    pN: legs.pN,
    pF: legs.pF,
    lean: torso.lean,
    head: torso.head,
    twist: torso.twist,
  };
};

/** Joints for a boxer standing with planted feet */
const boxer = (b: Box, x0: number, G: number, H: number): Joints => {
  const leadBall: Pt = [x0 + 0.2 * H, G];
  const rearBall: Pt = [x0 - 0.25 * H, G];
  const hip: Pt = [x0 + b.dx * H, G - 0.5 * H + b.dy * H];
  const rot = (b.lean - 8) * 0.85;
  const lead = ik2(hip, ankleFromBall(leadBall, 90 - b.pN, H), BODY.thigh * H, BODY.shin * H, 1);
  const rear = ik2([hip[0] - 0.01 * H, hip[1]], ankleFromBall(rearBall, 90 - b.pF, H), BODY.thigh * H, BODY.shin * H, 1);
  return fk(
    pose({
      lean: b.lean,
      head: b.head,
      thN: lead.a1,
      shN: lead.a2,
      ftN: 90 - b.pN,
      thF: rear.a1,
      shF: rear.a2,
      ftF: 90 - b.pF,
      uaN: b.uaN + rot,
      faN: b.faN + rot,
      hdN: b.hdN + rot,
      uaF: b.uaF + rot,
      faF: b.faF + rot,
      hdF: b.hdF + rot,
      twist: b.twist,
      flN: b.flN,
      flF: b.flF,
    }),
    hip,
    H
  );
};

/** Skipping: both feet under the hips, a low hop each turn of the rope */
const SKIP_HZ = 2.4;
const skipper = (t: number, x0: number, G: number, H: number) => {
  const ph = (t - T_SKIP) * SKIP_HZ;
  const u = ph - Math.floor(ph);
  // feet leave the floor while the rope passes under (u = 0.5)
  const air = Math.max(0, Math.cos(TAU * (u - 0.5)));
  const h = Math.pow(air, 3) * 0.045 * H;
  const land = Math.pow(Math.max(0, -Math.cos(TAU * (u - 0.5))), 2) * 0.018 * H;
  const alt = Math.floor(ph) % 2 === 0 ? 1 : -1;
  const hip: Pt = [x0, G - 0.552 * H - h + land];
  const bN: Pt = [x0 + 0.06 * H + alt * 0.01 * H, G - h - (alt > 0 ? 0.01 * H * air : 0)];
  const bF: Pt = [x0 - 0.01 * H - alt * 0.01 * H, G - h - (alt < 0 ? 0.01 * H * air : 0)];
  const p = 30 + air * 18;
  const lead = ik2(hip, ankleFromBall(bN, 90 - p, H), BODY.thigh * H, BODY.shin * H, 1);
  const rear = ik2([hip[0] - 0.01 * H, hip[1]], ankleFromBall(bF, 90 - p, H), BODY.thigh * H, BODY.shin * H, 1);
  // wrists turn small circles that drive the rope
  const a = TAU * ph;
  const ua = 16 + Math.sin(a) * 4;
  const fa = 68 + Math.cos(a) * 10;
  const j = fk(
    pose({ lean: 4, head: 10, thN: lead.a1, shN: lead.a2, ftN: 90 - p, thF: rear.a1, shF: rear.a2, ftF: 90 - p, uaN: ua, faN: fa, hdN: fa + 10, uaF: ua - 3, faF: fa - 4, hdF: fa + 6 }),
    hip,
    H
  );
  return { j, ph, u };
};

/* ---------- small drawing helpers ---------- */

const screen = (r: Riso) => r.camera(800, 450, 1, 0);
const fill = (c: Ctx, color: string) => {
  c.fillStyle = color;
  c.fillRect(-400, -400, 2400, 1700);
};

const BOXER: FigStyle = { skin: WHITE, far: '#9b9a96', cut: BLACK, shorts: RED, shoe: '#c9c7c1', hands: 'glove', hand: RED };

/** A big count number punching in: scale from big to rest, with an outline echo */
const punchNum = (c: Ctx, s: string, x: number, y: number, size: number, k: number, color: string, align: 'left' | 'center' | 'right' = 'center') => {
  if (k <= 0) return;
  const e = ease.outExpo(clamp(k));
  const sc = lerp(1.7, 1, e);
  c.save();
  c.translate(x, y);
  c.scale(sc, sc);
  c.globalAlpha = clamp(k * 8);
  ktext(c, s, 0, 0, size, { align, color, nw: 0.5 });
  c.restore();
};

/* ---------- A: 5:00 AM roadwork ---------- */

interface State {
  jog: Gait;
}

const RUN_H = 300;
const RUN_G = row(5.55);
const RUN_V = 3.4 * (RUN_H / 1.78);

const drawRoad = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  fill(c, BLACK);
  // camera: start tight on the clock, pull out to the road
  const z = lerp(1.22, 1, ease.outCubic(seg(t, 0, 0.9)));
  r.camera(800, 450, z, lerp(-0.025, 0, ease.outCubic(seg(t, 0, 0.9))));
  drawGrid(c, WHITE, 0.09);
  // after the roll the clock flies up into the corner
  const fly = ease.inOutExpo(seg(t, 0.95, 1.45));
  c.save();
  c.translate(lerp(800, col(10.4), fly), lerp(340, row(0.85), fly));
  c.scale(lerp(1, 0.3, fly), lerp(1, 0.3, fly));
  c.translate(-800, -340);

  // the clock: 4:59 rolls to 5:00
  const roll = ease.inOutCubic(seg(t, 0.35, 0.62));
  const x = 800;
  const y = 470;
  const size = 360;
  const w = kwidth(c, '4:59', size, { nw: 0.5 });
  const x0 = x - w / 2;
  const digit = (from: string, to: string, dx: number) => {
    const dw = kwidth(c, '0', size, { nw: 0.5 });
    masked(c, x0 + dx - 4, y - size * CAP - 20, dw + 8, size * CAP + 40, () => {
      ktext(c, from, x0 + dx, y - roll * size, size, { color: WHITE, nw: 0.5 });
      ktext(c, to, x0 + dx, y + (1 - roll) * size, size, { color: WHITE, nw: 0.5 });
    });
    return dw;
  };
  const d0 = digit('4', '5', 0);
  const colonW = kwidth(c, ':', size, { nw: 0.5 });
  const blink = t > 0.62 && Math.floor(t * 2) % 2 === 1 ? 0.25 : 1;
  c.globalAlpha = blink;
  ktext(c, ':', x0 + d0, y, size, { color: YELLOW, nw: 0.5 });
  c.globalAlpha = 1;
  const d1 = digit('5', '0', d0 + colonW);
  digit('9', '0', d0 + colonW + d1);
  ktext(c, 'AM', x0 + w + 18, y, 110, { color: YELLOW, nw: 0.5 });
  label(c, 'DAY 01 · ALARM', x0, y + 40, 16, GREY);
  c.restore();

  // world in screen space from here
  screen(r);
  const fade = ease.outCubic(seg(t, 1.2, 1.6));
  if (fade <= 0) return;
  c.save();
  c.globalAlpha = fade;
  // the road: dashed centre line streaming past
  const off = (t * RUN_V) % 120;
  c.fillStyle = rgba(WHITE, 0.9);
  c.fillRect(0, RUN_G, 1600, 3);
  for (let i = -1; i < 16; i++) c.fillRect(i * 120 - off, RUN_G + 34, 60, 6);
  // runner, tracked by the camera
  const L = s.jog.legs(t);
  const [uaN, faN] = runArm(L.uF, 0);
  const [uaF, faF] = runArm(L.uN, 0);
  const shift = 470 - L.hip[0];
  const j = fk(
    pose({ lean: 7, head: 6, thN: L.thN, shN: L.shN, ftN: L.ftN, thF: L.thF, shF: L.shF, ftF: L.ftF, uaN: uaN + 4, faN: faN + 6, hdN: faN, uaF: uaF + 4, faF: faF + 6, hdF: faF }),
    [L.hip[0] + shift, L.hip[1]],
    RUN_H
  );
  drawFigure(c, j, { skin: WHITE, far: '#8e8d89', cut: BLACK, shorts: RED, shoe: YELLOW, hands: 'fist' });
  c.restore();

  // ROADWORK, letter by letter
  ktext(c, 'ROADWORK', col(0.3), row(2.15), 270, { color: YELLOW, nw: 0.47 }, (i) => {
    const k = ease.outExpo(seg(t, 1.35 + i * 0.06, 1.75 + i * 0.06));
    return { dy: (1 - k) * 220, hide: k <= 0 };
  });

  // heart rate trace and distance
  const hk = ease.outCubic(seg(t, 1.9, 2.3));
  if (hk > 0) {
    const x0h = col(6.2);
    const x1h = col(12);
    const yh = row(3.25);
    const bpm = Math.round(lerp(128, 146, seg(t, 1.9, 3.4)));
    const pts: Pt[] = [];
    for (let i = 0; i <= 160; i++) {
      const xx = lerp(x0h, x1h, i / 160);
      const u = (i / 160) * 5 + t * 2.4;
      pts.push([xx, yh - ecg(u - Math.floor(u)) * 70]);
    }
    masked(c, x0h - 4, yh - 90, (x1h - x0h + 8) * hk, 130, () => {
      c.strokeStyle = RED;
      c.lineWidth = 4;
      c.lineJoin = 'round';
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.stroke();
    });
    ktext(c, `${bpm}`, x1h, row(4.2), 110, { align: 'right', color: WHITE, nw: 0.5 });
    label(c, 'BPM', x1h - kwidth(c, `${bpm}`, 110, { nw: 0.5 }) - 50, row(4.2) - 6, 16, RED);
    const km = fmt(lerp(0, 6.4, ease.inOutSine(seg(t, 1.9, 3.4))), 1);
    ktext(c, km, col(6.2), row(4.2), 110, { color: WHITE, nw: 0.5 });
    label(c, 'KM', col(6.2) + kwidth(c, km, 110, { nw: 0.5 }) + 12, row(4.2) - 6, 16, YELLOW);
  }
  label(c, '05:00 · ROADWORK · ZONE 3', col(0.3), 46, 14, GREY);
};

/* ---------- B: skipping ---------- */

const SK_H = 520;
const SK_G = row(5.7);
const SK_X = 990;

const drawSkip = (r: Riso, t: number) => {
  const c = r.layers[0];
  fill(c, YELLOW);
  const k = seg(t, T_SKIP, T_BAG);
  r.camera(lerp(820, 860, k), lerp(450, 470, k), lerp(1, 1.1, ease.inOutSine(k)), lerp(-0.02, 0.025, ease.inOutSine(k)));
  drawGrid(c, BLACK, 0.1);
  const sk = skipper(t, SK_X, SK_G, SK_H);
  const turns = Math.floor(sk.ph);
  // the stack of SKIP words hops on every turn
  for (let line = 0; line < 3; line++) {
    const y = row(1.45) + line * 175;
    ktext(c, 'SKIP', col(0.3), y, 200, { color: BLACK, nw: 0.48 }, (i) => {
      const uu = sk.ph - line * 0.12 - i * 0.05;
      const f = uu - Math.floor(uu);
      const hop = Math.max(0, Math.sin(f * Math.PI * 2)) ** 2;
      const appear = ease.outExpo(seg(t, T_SKIP + 0.1 + line * 0.12 + i * 0.04, T_SKIP + 0.5 + line * 0.12 + i * 0.04));
      return { dy: -hop * 34 + (1 - appear) * 260, hide: appear <= 0 };
    });
  }
  // beat markers 1 2 1 2
  for (let i = 0; i < 4; i++) {
    const on = turns % 4 === i;
    const x = col(0.3) + i * 70;
    c.fillStyle = on ? BLACK : rgba(BLACK, 0.18);
    c.fillRect(x, row(5.2), 54, 54);
    ktext(c, i % 2 ? '2' : '1', x + 27, row(5.2) + 44, 40, { align: 'center', color: on ? YELLOW : BLACK, nw: 0.5 });
  }
  // the counter
  const n = 212 + turns;
  ktext(c, `${n}`, col(12), row(1.6), 190, { align: 'right', color: RED, nw: 0.5 }, (i, len) => {
    const last = i === len - 1;
    const f = sk.ph - Math.floor(sk.ph);
    return last ? { dy: (1 - ease.outBack(clamp(f * 4))) * -30 } : null;
  });
  label(c, 'TURNS', col(12) - 80, row(1.6) + 26, 15, BLACK);
  label(c, `${fmt(SKIP_HZ * 60, 0)} RPM · 3 MIN`, col(12) - 180, row(1.6) + 48, 15, BLACK);

  // rope: a loop from the hands through an apex that turns forward over the head
  const hands: Pt = [(sk.j.wN[0] + sk.j.wF[0]) / 2 + 0.03 * SK_H, (sk.j.wN[1] + sk.j.wF[1]) / 2];
  const C: Pt = [SK_X + 0.02 * SK_H, SK_G - 0.56 * SK_H];
  const R = 0.62 * SK_H;
  const ropeAt = (a: number) => {
    // a = 0 under the feet, rope travels forward over the top
    const ang = TAU * a;
    const ax = C[0] - Math.sin(ang) * R * 0.55;
    const ay = C[1] + Math.cos(ang) * R;
    // out to the apex with a trailing belly, back on a tighter line: a thin crescent loop
    const vx = ax - hands[0];
    const vy = ay - hands[1];
    const nx = -vy * 0.22;
    const ny = vx * 0.22;
    const p = new Path2D();
    p.moveTo(hands[0], hands[1]);
    p.bezierCurveTo(hands[0] + vx * 0.45 + nx, hands[1] + vy * 0.45 + ny, hands[0] + vx * 0.95 + nx * 0.6, hands[1] + vy * 0.95 + ny * 0.6, ax, ay);
    p.bezierCurveTo(hands[0] + vx * 0.95 + nx * 0.1, hands[1] + vy * 0.95 + ny * 0.1, hands[0] + vx * 0.45 + nx * 0.25, hands[1] + vy * 0.45 + ny * 0.25, hands[0] + 3, hands[1] + 3);
    return p;
  };
  const a0 = sk.ph - 0.5;
  // rope behind the body for half the turn
  const behind = Math.cos(TAU * a0) < 0;
  const drawRope = () => {
    for (let g = 3; g >= 0; g--) {
      c.strokeStyle = g === 0 ? RED : rgba(RED, 0.16 + (3 - g) * 0.1);
      c.lineWidth = g === 0 ? 7 : 5;
      c.lineCap = 'round';
      c.stroke(ropeAt(a0 - g * 0.035));
    }
  };
  if (behind) drawRope();
  drawFigure(c, sk.j, { skin: BLACK, far: '#4a4636', cut: YELLOW, shorts: RED, shoe: WHITE, hands: 'fist' });
  if (!behind) drawRope();
  // floor and shadow
  c.fillStyle = BLACK;
  c.fillRect(-200, SK_G + 2, 2000, 4);
  const air = SK_G - sk.j.aN[1] - BODY.ankle * SK_H;
  c.fillStyle = rgba(BLACK, 0.2);
  c.beginPath();
  c.ellipse(SK_X, SK_G + 14, 0.2 * SK_H - air * 0.6, 7, 0, 0, TAU);
  c.fill();
  screen(r);
  label(c, '06:10 · ROPE · ROUND 1–3', col(0.3), 46, 14, BLACK);
};

/* ---------- C: heavy bag ---------- */

const BAG_H = 470;
const BAG_G = row(5.85);
const BAG_X = 520;

const COMBO: Ev[] = [
  { t: 7.55, kind: 'jab' },
  { t: 7.83, kind: 'cross' },
  { t: 8.12, kind: 'hook' },
  { t: 8.42, kind: 'cross' },
  { t: 9.45, kind: 'jab' },
  { t: 9.66, kind: 'cross' },
  { t: 9.88, kind: 'hook' },
  { t: 10.1, kind: 'cross' },
];

const bagSwing = (t: number) => {
  let th = 0;
  for (const e of COMBO) {
    const d = t - e.t;
    if (d <= 0) continue;
    const a = e.kind === 'hook' ? 0.05 : e.kind === 'cross' ? 0.075 : 0.045;
    th += a * Math.exp(-d * 1.6) * Math.sin(d * 5.2);
  }
  return th;
};

const impact = (t: number) => {
  let v = 0;
  for (const e of COMBO) {
    const d = t - e.t;
    if (d >= 0 && d < 0.3) v = Math.max(v, 1 - d / 0.3);
  }
  return v;
};

const drawBag = (c: Ctx, t: number, x: number) => {
  const th = bagSwing(t);
  const pivot: Pt = [x, -420];
  c.save();
  c.translate(pivot[0], pivot[1]);
  c.rotate(-th);
  const top = 420 + 140;
  const bw = 0.3 * BAG_H;
  const bh = 0.72 * BAG_H;
  // chain
  c.strokeStyle = GREY;
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, top - 40);
  c.moveTo(0, top - 40);
  c.lineTo(-bw * 0.42, top);
  c.moveTo(0, top - 40);
  c.lineTo(bw * 0.42, top);
  c.stroke();
  // bag body
  const dent = impact(t) * 16;
  const p = new Path2D();
  p.moveTo(-bw / 2 + 10, top);
  p.lineTo(bw / 2 - 10, top);
  p.quadraticCurveTo(bw / 2 + 4, top + 6, bw / 2 + 2, top + 40);
  p.lineTo(bw / 2, top + bh - 40);
  p.quadraticCurveTo(bw / 2, top + bh, bw / 2 - 30, top + bh);
  p.lineTo(-bw / 2 + 30, top + bh);
  p.quadraticCurveTo(-bw / 2, top + bh, -bw / 2, top + bh - 40);
  p.lineTo(-bw / 2 + dent, top + bh * 0.42);
  p.lineTo(-bw / 2 - 2, top + 40);
  p.quadraticCurveTo(-bw / 2 - 4, top + 6, -bw / 2 + 10, top);
  p.closePath();
  c.fillStyle = RED;
  c.fill(p);
  c.save();
  c.clip(p);
  c.fillStyle = '#b30f20';
  c.fillRect(bw * 0.16, top, bw, bh);
  c.fillStyle = BLACK;
  c.fillRect(-bw, top + bh * 0.12, bw * 2, 16);
  c.fillRect(-bw, top + bh * 0.84, bw * 2, 16);
  c.fillStyle = WHITE;
  c.save();
  c.translate(0, top + bh * 0.5);
  c.rotate(-Math.PI / 2);
  ktext(c, 'HEAVY', 0, bw * 0.12, bw * 0.42, { align: 'center', color: rgba(WHITE, 0.9), nw: 0.5 });
  c.restore();
  c.restore();
  c.restore();
};

const drawBagScene = (r: Riso, t: number) => {
  const c = r.layers[0];
  fill(c, BLACK);
  // camera: wide for the first combo, push in on the second, settle back
  const k1 = ease.inOutCubic(seg(t, 8.7, 9.25));
  const k2 = ease.inOutCubic(seg(t, 10.5, 11.4));
  let z = lerp(lerp(1.0, 1.32, k1), 1.12, k2);
  let cx = lerp(lerp(860, 880, k1), 840, k2);
  let cy = lerp(lerp(470, 430, k1), 460, k2);
  const rot = lerp(lerp(0, -0.035, k1), 0.015, k2);
  // shake on impacts
  const im = impact(t);
  cx += Math.sin(t * 90) * im * 10;
  cy += Math.cos(t * 77) * im * 7;
  z *= 1 + im * 0.012;
  // push from the scene start
  z *= lerp(1.08, 1, ease.outCubic(seg(t, T_BAG, T_BAG + 0.8)));
  r.camera(cx, cy, z, rot);
  drawGrid(c, WHITE, 0.08);

  // the count, behind everything: the current number slams in on impact
  let cur: Ev | null = null;
  for (const e of COMBO) if (t >= e.t - 0.06) cur = e;
  if (cur) {
    const k = seg(t, cur.t - 0.06, cur.t + 0.12);
    const next = COMBO.find((e) => e.t > cur!.t);
    const out = next ? seg(t, next.t - 0.09, next.t - 0.06) : seg(t, cur.t + 0.5, cur.t + 0.8);
    c.save();
    c.globalAlpha = 1 - out;
    punchNum(c, NUM[cur.kind], 1090, 760, 760, k, YELLOW);
    c.restore();
    c.globalAlpha = 1 - out;
    ktext(c, NAMES[cur.kind], 1090, 860, 60, { align: 'center', color: WHITE, nw: 0.5 }, (i) => ({ dy: (1 - ease.outExpo(seg(t, cur!.t + i * 0.02, cur!.t + 0.15 + i * 0.02))) * 40 }));
    c.globalAlpha = 1;
  }

  // floor
  c.fillStyle = rgba(WHITE, 0.85);
  c.fillRect(-400, BAG_G + 1, 2400, 3);
  const b = boxAt(t, COMBO, t - T_BAG, 1);
  const j = boxer(b, BAG_X, BAG_G, BAG_H);
  const bagX = BAG_X + 0.69 * BAG_H;
  drawBag(c, t, bagX);
  drawFigure(c, j, BOXER);
  // impact burst at the glove
  if (im > 0 && cur && cur.kind !== 'slip' && cur.kind !== 'roll') {
    const g = cur.kind === 'cross' ? j.wF : j.wN;
    const gx = g[0] + 0.08 * BAG_H;
    const gy = g[1];
    c.strokeStyle = YELLOW;
    c.lineWidth = 6;
    c.lineCap = 'butt';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + ((i - 4) / 4) * 1.1 + Math.PI;
      const r0 = 40 + (1 - im) * 90;
      const r1 = r0 + 60 * im;
      c.beginPath();
      c.moveTo(gx - Math.cos(a + Math.PI) * 0 + Math.cos(a) * -r0, gy + Math.sin(a) * -r0);
      c.lineTo(gx + Math.cos(a) * -r1, gy + Math.sin(a) * -r1);
      c.stroke();
    }
  }

  screen(r);
  // combo readout builds up: 1-2-3-2
  const shown = COMBO.filter((e) => t >= e.t);
  const second = t >= COMBO[4].t - 0.05;
  const seq = (second ? shown.slice(4) : shown.slice(0, 4)).map((e) => NUM[e.kind]);
  ktext(c, seq.join('-'), col(0.3), row(1.15), 120, { color: WHITE, nw: 0.5 }, (i) => {
    const e = (second ? COMBO.slice(4) : COMBO)[Math.floor(i / 2)];
    if (!e) return null;
    const k = ease.outBack(seg(t, e.t, e.t + 0.15));
    return { dy: (1 - k) * -60, color: i % 2 ? GREY : WHITE };
  });
  label(c, second ? 'COMBO 2 · FASTER' : 'COMBO 1', col(0.3), row(1.15) + 30, 15, YELLOW);
  // punch counter and force bars
  const count = 1236 + shown.length;
  ktext(c, count.toLocaleString('en-US'), col(12), row(1.15), 90, { align: 'right', color: WHITE, nw: 0.5 });
  label(c, 'PUNCHES TODAY', col(12) - 200, row(1.15) + 28, 15, GREY);
  shown.forEach((e, i) => {
    const f = e.kind === 'cross' ? 0.95 : e.kind === 'hook' ? 0.8 : 0.55;
    const k = ease.outExpo(seg(t, e.t, e.t + 0.2));
    const x = col(9) + i * 46;
    const hgt = 150 * f * k;
    c.fillStyle = i >= 4 ? YELLOW : rgba(WHITE, 0.75);
    c.fillRect(x, row(2.9) - hgt, 34, hgt);
  });
  label(c, 'FORCE', col(9), row(2.9) + 22, 14, GREY);
  label(c, '07:30 · HEAVY BAG · 6 × 3 MIN', col(0.3), 46, 14, GREY);
};

/* ---------- D: sparring ---------- */

const SP_H = 420;
const SP_G = row(5.8);
const SP_A = 625; // our boxer
const SP_B = 950; // partner, mirrored

const SPAR_US: Ev[] = [
  { t: 12.3, kind: 'slip' },
  { t: 12.95, kind: 'roll' },
  { t: 13.62, kind: 'cross' },
];
const SPAR_THEM: Ev[] = [
  { t: 12.3, kind: 'jab' },
  { t: 12.95, kind: 'hook' },
];
const COUNTER_T = 13.62;

const drawSpar = (r: Riso, t: number) => {
  const c = r.layers[0];
  fill(c, RED);
  const kIn = ease.inOutCubic(seg(t, 13.25, COUNTER_T));
  const kOut = ease.outCubic(seg(t, COUNTER_T + 0.25, T_BELL));
  const hit = COUNTER_T <= t ? Math.max(0, 1 - (t - COUNTER_T) / 0.25) : 0;
  r.camera(lerp(825, 900, kIn) + Math.sin(t * 80) * hit * 12, lerp(470, 420, kIn), lerp(1.0, 1.42, kIn) - kOut * 0.12, lerp(0, -0.04, kIn));
  drawGrid(c, BLACK, 0.12);

  // the word for each beat, behind the fighters
  const words: [number, string, string][] = [
    [12.3, 'SLIP', BLACK],
    [12.95, 'ROLL', BLACK],
    [COUNTER_T, 'COUNTER', YELLOW],
  ];
  for (let i = 0; i < words.length; i++) {
    const [wt, w, colr] = words[i];
    const nt = words[i + 1]?.[0] ?? 99;
    if (t < wt - 0.04 || t > nt - 0.02) continue;
    const k = seg(t, wt - 0.04, wt + 0.12);
    const big = w === 'COUNTER';
    c.save();
    c.translate(825, big ? 600 : 560);
    const sc = lerp(big ? 1.5 : 1.3, 1, ease.outExpo(k)) * (big ? 1 + (t - wt) * 0.04 : 1);
    c.scale(sc, sc);
    ktext(c, w, 0, 0, big ? 400 : 440, { align: 'center', color: colr, nw: 0.46 }, (ci) => ({ dy: (1 - ease.outExpo(seg(t, wt + ci * 0.025, wt + 0.18 + ci * 0.025))) * 160 }));
    c.restore();
  }

  c.fillStyle = BLACK;
  c.fillRect(-400, SP_G + 1, 2400, 4);
  // partner, mirrored, throws at us
  const them = boxAt(t, SPAR_THEM, t * 0.9 + 0.3, 1.2);
  const jt = boxer(them, 0, SP_G, SP_H);
  // knocked back by the counter
  const rock = t > COUNTER_T ? ease.outCubic(seg(t, COUNTER_T, COUNTER_T + 0.3)) * (1 - 0.6 * seg(t, COUNTER_T + 0.4, T_BELL)) : 0;
  c.save();
  c.translate(SP_B + rock * 30, 0);
  c.scale(-1, 1);
  if (rock > 0) {
    c.translate(0, SP_G);
    c.rotate(rock * 0.06);
    c.translate(0, -SP_G);
  }
  drawFigure(c, jt, { skin: BLACK, far: '#3d0a10', cut: RED, shorts: WHITE, shoe: BLACK, hands: 'glove', hand: BLACK });
  c.restore();
  const us = boxAt(t, SPAR_US, t - T_SPAR, 1.15);
  const ju = boxer(us, SP_A, SP_G, SP_H);
  drawFigure(c, ju, { ...BOXER, cut: RED, hand: YELLOW, shorts: BLACK });

  // impact frame
  if (hit > 0) {
    c.save();
    c.globalAlpha = hit;
    c.strokeStyle = WHITE;
    c.lineWidth = 8;
    const gx = ju.wF[0] + 0.09 * SP_H;
    const gy = ju.wF[1];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r0 = 50 + (1 - hit) * 140;
      c.beginPath();
      c.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
      c.lineTo(gx + Math.cos(a) * (r0 + 70), gy + Math.sin(a) * (r0 + 70));
      c.stroke();
    }
    c.restore();
  }

  screen(r);
  // round clock counts the last seconds down
  const left = Math.max(0, T_BELL - t);
  const secs = Math.ceil(left - 1e-6);
  const tick = left - Math.floor(left);
  c.fillStyle = BLACK;
  c.fillRect(col(10) - 20, row(0.35), col(12) - col(10) + 20, 128);
  ktext(c, `0:0${secs}`, col(12) - 16, row(0.35) + 108, 108, { align: 'right', color: WHITE, nw: 0.5 }, (i, n) => (i === n - 1 ? { dy: (1 - ease.outExpo(clamp((1 - tick) * 5))) * -24 } : null));
  label(c, 'ROUND 12 / 12', col(10) - 10, row(0.35) + 150, 15, BLACK);
  label(c, '17:45 · SPARRING · 12 × 3 MIN', col(0.3), 46, 14, BLACK);
  if (t > COUNTER_T) {
    const k = ease.outExpo(seg(t, COUNTER_T + 0.1, COUNTER_T + 0.4));
    masked(c, col(0.3), row(0.5), 600 * k, 140, () => {
      ktext(c, 'LANDED 187 / 412', col(0.3), row(1.2), 64, { color: BLACK, nw: 0.48 });
    });
  }
};

/* ---------- E: the bell, F: the word card ---------- */

const drawBell = (r: Riso, t: number) => {
  const c = r.layers[0];
  fill(c, BLACK);
  r.camera(800, 450, lerp(1.15, 1, ease.outCubic(seg(t, T_BELL, T_BELL + 0.8))), 0);
  // rings ripple out from the bell
  const cx = 800;
  const cy = 360;
  for (let i = 0; i < 6; i++) {
    const p = (t - T_BELL) * 1.6 - i * 0.22;
    if (p <= 0 || p > 1.4) continue;
    c.strokeStyle = rgba(YELLOW, 1 - p / 1.4);
    c.lineWidth = 18 * (1 - p / 1.6);
    c.beginPath();
    c.arc(cx, cy, 120 + p * 700, 0, TAU);
    c.stroke();
  }
  // the bell itself rings (rocks) and then gets pulled into a point
  const close = ease.inExpo(seg(t, T_CARD - 0.45, T_CARD - 0.05));
  const sc = 1 - close;
  if (sc > 0.01) {
    const rock = Math.sin((t - T_BELL) * 32) * Math.exp(-(t - T_BELL) * 2.4) * 0.2;
    c.save();
    c.translate(cx, cy);
    c.scale(sc, sc);
    c.rotate(rock);
    c.fillStyle = YELLOW;
    c.beginPath();
    c.arc(0, 0, 150, 0, TAU);
    c.fill();
    c.fillStyle = BLACK;
    c.beginPath();
    c.arc(0, 0, 110, 0, TAU);
    c.fill();
    c.fillStyle = YELLOW;
    c.beginPath();
    c.arc(0, 0, 40, 0, TAU);
    c.fill();
    c.fillRect(-12, -190, 24, 46);
    c.restore();
  }
  screen(r);
  ktext(c, 'FINAL BELL', 800, 760, 200, { align: 'center', color: WHITE, nw: 0.48 }, (i) => {
    const kk = ease.outExpo(seg(t, T_BELL + 0.15 + i * 0.04, T_BELL + 0.45 + i * 0.04));
    const out = ease.inCubic(seg(t, T_CARD - 0.4 + i * 0.015, T_CARD - 0.1 + i * 0.015));
    return { dy: (1 - kk) * 200 - out * 240, hide: kk <= 0 || out >= 1 };
  });
  label(c, 'ROUND 12 · 3:00 · TIME', 800, 860, 15, GREY, 'center');
};

const drawCard = (r: Riso, t: number) => {
  const c = r.layers[0];
  fill(c, BLACK);
  const hold = seg(t, T_CARD, DUR);
  r.camera(800, 450, lerp(1.0, 1.04, ease.outSine(hold)), 0);
  drawGrid(c, WHITE, lerp(0, 0.08, seg(t, T_CARD + 0.8, T_CARD + 1.6)));
  // AGAIN. punches in letter by letter on the beat
  ktext(c, 'AGAIN.', 800, 600, 400, { align: 'center', color: WHITE, nw: 0.5, track: 0.01 }, (i) => {
    const tt = T_CARD + 0.05 + i * 0.13;
    const k = seg(t, tt, tt + 0.14);
    if (k <= 0) return { hide: true };
    const e = ease.outExpo(k);
    return { s: lerp(1.6, 1, e), color: i === 5 ? YELLOW : WHITE };
  });
  const sub = ease.outExpo(seg(t, T_CARD + 1.0, T_CARD + 1.4));
  masked(c, 0, 640, 1600, 90 * sub, () => {
    ktext(c, '05:00 AM', 800, 700, 64, { align: 'center', color: YELLOW, nw: 0.5 });
  });
  label(c, 'DAY 02', col(0.3), 46, 14, GREY);
  label(c, 'ROADWORK · ROPE · BAG · 12 ROUNDS', col(6), 46, 14, GREY);
};

/* ---------- film ---------- */

export const kineticTwelveRoundsFilm: RisoFilm<State> = {
  id: 'kinetic-twelve-rounds',
  title: 'Twelve Rounds',
  caption: "A boxer's training day in words and numbers, from 5:00 AM roadwork to the final bell.",
  theme: 'Athletic',
  category: 'Athletic',
  motif: 'the count that keeps the beat',
  duration: DUR,
  series: 'Kinetic',
  mode: 'direct',
  paper: BLACK,
  grain: 0.05,
  inks: [{ color: RED }, { color: YELLOW }, { color: BLACK }, { color: WHITE }],
  scenes: [
    { at: 0, label: '5:00 AM' },
    { at: T_SKIP, label: 'Rope' },
    { at: T_BAG, label: '1-2-3-2' },
    { at: T_SPAR, label: 'Sparring' },
    { at: T_BELL, label: 'Final bell' },
    { at: T_CARD, label: 'Again' },
  ],
  posterTime: COUNTER_T + 0.12,
  setup() {
    const jog = makeGait({
      H: RUN_H,
      t0: -0.5,
      t1: T_SKIP + 0.5,
      phase: (t) => 1.38 * t,
      hip: (t, u) => [RUN_V * t, RUN_G - 0.515 * RUN_H + 0.012 * RUN_H * Math.cos(TAU * 2 * (u - 0.17))],
      ground: () => RUN_G,
      contact: () => 0.34,
      sprint: () => 0.08,
    });
    return { jog };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    const sceneAt = (tt: number) => {
      if (tt < T_SKIP) drawRoad(r, s, tt);
      else if (tt < T_BAG) drawSkip(r, tt);
      else if (tt < T_SPAR) drawBagScene(r, tt);
      else if (tt < T_BELL) drawSpar(r, tt);
      else if (tt < T_CARD) drawBell(r, tt);
      else drawCard(r, tt);
    };
    // hard banded wipes on the beat between sections
    const cuts: [number, string, 1 | -1][] = [
      [T_SKIP, YELLOW, 1],
      [T_BAG, RED, -1],
      [T_SPAR, YELLOW, 1],
    ];
    for (const [ct, colr, dir] of cuts) {
      if (t >= ct - WIPE / 2 && t < ct + WIPE / 2) {
        const k = seg(t, ct - WIPE / 2, ct + WIPE / 2);
        sceneAt(Math.min(t, ct - 0.001));
        const w = wipeBands(k, { n: 4, slant: 300, stagger: 0.06, lag: 0.22, dir });
        c.save();
        screen(r);
        c.clip(w.revealed);
        sceneAt(Math.max(t, ct));
        c.restore();
        screen(r);
        c.fillStyle = colr;
        c.fill(w.covered);
        c.fillStyle = BLACK;
        return;
      }
    }
    sceneAt(t);
    // white flash on the bell
    if (t >= T_BELL && t < T_BELL + 0.12) {
      screen(r);
      c.fillStyle = rgba(WHITE, 1 - (t - T_BELL) / 0.12);
      c.fillRect(0, 0, 1600, 900);
    }
  },
};
