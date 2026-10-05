import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, hash, noise1, mulberry, smoothPath, type Pt } from '../riso/kit';
import {
  NOIR,
  NOIR_SERIF,
  NOIR_TEXT,
  rgba,
  grey,
  poly,
  linGrad,
  radGrad,
  glow,
  shaft,
  blindShafts,
  rain,
  ripples,
  fogBand,
  noirCam,
  finish,
  title,
  rule,
  bake,
  createNoirFX,
  drawFigure,
  standPose,
  toWorld,
  solve,
  type NoirFX,
  type Pose,
  type Look,
} from '../styles/noir';

/*
 * Coming Soon: a trailer for a noir that does not exist, cut on the beat. A studio lantern
 * lights up; THIS FALL; a car chase in four shots (headlights, a side-on tracking shot, tail
 * lights fishtailing away, the pursuer's grille); ONE CITY; a smoky office striped by the blinds;
 * the phone rings and a hand snatches it; ONE NIGHT; a stand-off under a single bulb that cuts
 * tighter and tighter to the eyes; a train thunders between the two of them and when it has
 * gone she has too. Silence, then the drop: MOTOR CITY NOIR, and the release card.
 * The motif is a beam of light: lantern, headlights, blinds, bulb, train windows, the flash.
 */

const DUR = 20;
const T_DROP = 15.5;
const T_END = 18.0;

interface Shot {
  a: number;
  b: number;
  draw: (c: Ctx, r: Riso, t: number, u: number, s: State) => void;
  /** a white frame on the cut */
  flash?: number;
}

interface State {
  fx: NoirFX;
  cards: Record<string, HTMLCanvasElement>;
  titleArt: HTMLCanvasElement;
  endArt: HTMLCanvasElement;
  studioArt: HTMLCanvasElement;
  city: HTMLCanvasElement;
  brick: CanvasPattern | null;
}

/* ---------- small helpers ---------- */

const W = 1600;
const H = 900;
const CX = 800;
const CY = 450;

const rr = (x: number, y: number, w: number, h: number, r: number, p: Path2D = new Path2D()) => {
  const q = Math.min(r, w / 2, h / 2);
  p.moveTo(x + q, y);
  p.arcTo(x + w, y, x + w, y + h, q);
  p.arcTo(x + w, y + h, x, y + h, q);
  p.arcTo(x, y + h, x, y, q);
  p.arcTo(x, y, x + w, y, q);
  p.closePath();
  return p;
};

/** Anamorphic flare: a long thin horizontal streak through a light */
const streak = (c: Ctx, x: number, y: number, len: number, a: number, col: string = NOIR.white) => {
  if (a <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = linGrad(c, x - len, y, x + len, y, [
    [0, rgba(col, 0)],
    [0.5, rgba(col, a)],
    [1, rgba(col, 0)],
  ]);
  c.fillRect(x - len, y - 1.6, len * 2, 3.2);
  c.fillStyle = linGrad(c, x - len * 0.5, y, x + len * 0.5, y, [
    [0, rgba(col, 0)],
    [0.5, rgba(col, a * 0.35)],
    [1, rgba(col, 0)],
  ]);
  c.fillRect(x - len * 0.5, y - 7, len, 14);
  c.restore();
};

/** Shake for impacts: decays after t0 */
const shake = (t: number, t0: number, amp: number, dur = 0.5) => {
  if (t < t0) return [0, 0];
  const k = Math.exp(-((t - t0) / dur) * 4);
  const f = Math.floor(t * 48);
  return [(hash(f * 1.7) - 0.5) * amp * k * 2, (hash(f * 2.9 + 3) - 0.5) * amp * k * 2];
};

const screenRain = (c: Ctx, t: number, k: number, slant = 0.12, speed = 1.3) => {
  rain(c, t, { seed: 11, n: 220 * k, x0: 0, y0: 0, x1: W, y1: H, speed: 1500 * speed, slant, len: 34, width: 1, a: 0.24 });
  rain(c, t, { seed: 12, n: 70 * k, x0: 0, y0: 0, x1: W, y1: H, speed: 2400 * speed, slant: slant * 1.2, len: 80, width: 1.8, a: 0.2 });
};

/* ---------- the cars ---------- */

const SEDAN: Pt[] = [
  [262, -26],
  [262, -40],
  [252, -50],
  [244, -66],
  [222, -78],
  [150, -86],
  [62, -92],
  [42, -96],
  [8, -140],
  [-40, -149],
  [-108, -147],
  [-148, -133],
  [-192, -98],
  [-232, -80],
  [-254, -58],
  [-262, -40],
  [-262, -26],
];

/** A 1940s sedan in profile facing +x, wheels on y = 0 */
const sedanSide = (c: Ctx, x: number, y: number, s: number, rot: number, wheel: number, look: { body: string; rim: string; tail: number; head: number }) => {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const body = smoothPath(SEDAN, true, 0.35);
  const fenders = new Path2D();
  smoothPath(
    [
      [100, -28],
      [116, -66],
      [170, -84],
      [228, -70],
      [256, -40],
      [258, -28],
    ],
    true,
    0.4,
    fenders
  );
  smoothPath(
    [
      [-112, -28],
      [-124, -70],
      [-180, -88],
      [-236, -66],
      [-256, -38],
      [-256, -28],
    ],
    true,
    0.4,
    fenders
  );
  // rim light along the top (street lights overhead)
  c.fillStyle = look.rim;
  c.save();
  c.translate(0, -2.5);
  c.fill(body);
  c.fill(fenders);
  c.restore();
  c.fillStyle = look.body;
  c.fill(body);
  c.fill(fenders);
  // windows
  const win = poly([
    [38, -98],
    [8, -134],
    [-34, -141],
    [-34, -100],
  ]);
  poly(
    [
      [-42, -100],
      [-42, -141],
      [-104, -140],
      [-140, -126],
      [-160, -100],
    ],
    win
  );
  c.fillStyle = grey(0.2);
  c.fill(win);
  c.save();
  c.clip(win);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.moveTo(-60 + rot * 0, -150);
  c.lineTo(-30, -150);
  c.lineTo(-80, -90);
  c.lineTo(-110, -90);
  c.fill();
  c.restore();
  // chrome strip, door seam, running board
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(240, -62);
  c.lineTo(-240, -66);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.beginPath();
  c.moveTo(40, -96);
  c.lineTo(36, -30);
  c.moveTo(-40, -100);
  c.lineTo(-40, -30);
  c.stroke();
  c.fillStyle = NOIR.black;
  c.fillRect(-120, -32, 225, 8);
  // wheels with whitewalls, the hubs spinning
  for (const wx of [170, -172]) {
    c.fillStyle = NOIR.black;
    c.beginPath();
    c.arc(wx, -34, 35, 0, TAU);
    c.fill();
    c.strokeStyle = grey(0.75);
    c.lineWidth = 7;
    c.beginPath();
    c.arc(wx, -34, 23, 0, TAU);
    c.stroke();
    c.fillStyle = grey(0.5);
    c.beginPath();
    c.arc(wx, -34, 13, 0, TAU);
    c.fill();
    c.strokeStyle = NOIR.black;
    c.lineWidth = 2;
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = wheel + (k * TAU) / 3;
      c.moveTo(wx, -34);
      c.lineTo(wx + Math.cos(a) * 13, -34 + Math.sin(a) * 13);
    }
    c.stroke();
  }
  // lamps
  c.fillStyle = grey(0.95);
  c.beginPath();
  c.ellipse(250, -58, 6, 10, 0, 0, TAU);
  c.fill();
  c.fillStyle = NOIR.red;
  c.beginPath();
  c.ellipse(-258, -56, 4, 8, 0, 0, TAU);
  c.fill();
  c.restore();
  glow(c, x + 252 * s, y - 58 * s, 90 * s * look.head, 0.8 * look.head);
  glow(c, x - 258 * s, y - 56 * s, 70 * s, 0.75 * look.tail, NOIR.red);
};

/** The car head-on: waterfall grille, round lamps on the fenders */
const carFront = (c: Ctx, x: number, y: number, s: number, lamps: number, chrome: number) => {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const body = new Path2D();
  smoothPath(
    [
      [-200, -10],
      [-206, -70],
      [-180, -112],
      [-110, -130],
      [-90, -210],
      [90, -210],
      [110, -130],
      [180, -112],
      [206, -70],
      [200, -10],
    ],
    true,
    0.3,
    body
  );
  c.fillStyle = NOIR.night;
  c.fill(body);
  // windshield split
  c.fillStyle = grey(0.16);
  c.fill(
    poly([
      [-80, -200],
      [-6, -200],
      [-6, -142],
      [-96, -142],
    ])
  );
  c.fill(
    poly([
      [80, -200],
      [6, -200],
      [6, -142],
      [96, -142],
    ])
  );
  // grille bars
  const g = rr(-58, -120, 116, 96, 26);
  c.fillStyle = NOIR.black;
  c.fill(g);
  c.save();
  c.clip(g);
  for (let i = -6; i <= 6; i++) {
    c.fillStyle = grey(0.35 + chrome * 0.5 * (1 - Math.abs(i) / 8));
    c.fillRect(i * 9 - 2, -124, 4, 104);
  }
  c.restore();
  // bumper
  c.fillStyle = grey(0.3 + chrome * 0.5);
  c.fillRect(-206, -28, 412, 16);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(-206, -27, 412, 3);
  // tyres
  c.fillStyle = NOIR.black;
  c.fillRect(-196, -14, 50, 20);
  c.fillRect(146, -14, 50, 20);
  // lamp housings
  for (const lx of [-150, 150]) {
    c.fillStyle = grey(0.25);
    c.beginPath();
    c.arc(lx, -88, 30, 0, TAU);
    c.fill();
    c.fillStyle = grey(0.85 + lamps * 0.15);
    c.beginPath();
    c.arc(lx, -88, 22, 0, TAU);
    c.fill();
  }
  c.restore();
  for (const lx of [-150, 150]) {
    glow(c, x + lx * s, y - 88 * s, Math.min(420, 260 * s * (0.4 + lamps)), 0.5 * lamps);
    glow(c, x + lx * s, y - 88 * s, Math.min(180, 60 * s), lamps);
    streak(c, x + lx * s, y - 88 * s, 700 * lamps * Math.min(1.5, s), 0.55 * lamps);
  }
};

const carRear = (c: Ctx, x: number, y: number, s: number, rot: number, tail: number) => {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  const body = new Path2D();
  smoothPath(
    [
      [-190, -8],
      [-196, -64],
      [-170, -100],
      [-100, -118],
      [-84, -190],
      [84, -190],
      [100, -118],
      [170, -100],
      [196, -64],
      [190, -8],
    ],
    true,
    0.3,
    body
  );
  c.fillStyle = grey(0.45);
  c.save();
  c.translate(0, -3);
  c.fill(body);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(body);
  c.fillStyle = grey(0.14);
  c.fill(rr(-70, -180, 140, 36, 14));
  c.fillStyle = grey(0.3);
  c.fillRect(-196, -26, 392, 12);
  for (const lx of [-160, 160]) {
    c.fillStyle = NOIR.red;
    c.beginPath();
    c.ellipse(lx, -70, 9, 15, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (const lx of [-160, 160]) {
    const px = x + (lx * cs - -70 * sn) * s;
    const py = y + (lx * sn + -70 * cs) * s;
    glow(c, px, py, 120 * s * 3, 0.9 * tail, NOIR.red);
    streak(c, px, py, 260, 0.35 * tail, NOIR.red);
  }
};

/* ---------- shots ---------- */

const cardShot =
  (key: string) =>
  (c: Ctx, r: Riso, t: number, u: number, s: State) => {
    c.fillStyle = NOIR.black;
    c.fillRect(0, 0, W, H);
    fogBand(c, s.fx, 0, W, CY + 40, 500, t * 40, 0.12, 1, 1600);
    const a = clamp(u * 9) * clamp((1 - u) * 6);
    const sc = 1 + u * 0.05;
    c.save();
    c.translate(CX, CY);
    c.scale(sc, sc);
    c.globalAlpha = a;
    const art = s.cards[key];
    c.drawImage(art, -600, -150, 1200, 300);
    c.restore();
    void r;
  };

const studioShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  c.fillStyle = NOIR.black;
  c.fillRect(0, 0, W, H);
  const fade = tween(t, 0, 0.6, ease.outSine) * (1 - tween(t, 2.2, 2.5, ease.inSine));
  const ign = t < 0.55 ? 0 : t < 0.9 ? (hash(Math.floor(t * 30)) < 0.55 ? 0.9 : 0.15) : 1;
  const cx = CX;
  const cy = 360;
  c.save();
  c.globalAlpha = fade;
  // the lantern's rays turning slowly behind the ring
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + t * 0.25;
    shaft(c, cx, cy, cx + Math.cos(a) * 900, cy + Math.sin(a) * 900, 6, 120, 0.05 * ign);
  }
  glow(c, cx, cy, 420, 0.25 * ign);
  c.drawImage(s.studioArt, cx - 400, cy - 260, 800, 600);
  // the flame in the lantern
  glow(c, cx, cy + 6, 90, 0.9 * ign);
  c.fillStyle = grey(0.98, ign);
  c.beginPath();
  c.ellipse(cx, cy + 8, 7, 14 + noise1(t * 12) * 2, 0, 0, TAU);
  c.fill();
  c.restore();
  // fog drifting through
  fogBand(c, s.fx, 0, W, 560, 380, t * 60, 0.25 * fade, 0, 1500);
  void r;
  void u;
};

/** Shot A: headlights rushing at a low camera down a wet street */
const headlightsShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  const [sx, sy] = shake(t, 3.5, 6, 2);
  noirCam(r, t, CX - sx, CY - sy, 1);
  c.fillStyle = NOIR.black;
  c.fillRect(-100, -100, W + 200, H + 200);
  // buildings converging to the vanishing point
  const vy = 420;
  c.fillStyle = NOIR.night;
  c.fill(poly([[-100, 120], [690, vy - 40], [690, vy + 10], [-100, 700]]));
  c.fill(poly([[1700, 120], [910, vy - 40], [910, vy + 10], [1700, 700]]));
  c.drawImage(s.city, 560, vy - 170, 480, 180);
  // street lamps along both sides, streaking past
  for (let i = 0; i < 6; i++) {
    const k = ((i / 6 + u * 0.9) % 1) ** 2;
    const xl = lerp(700, -200, k);
    const xr = lerp(900, 1800, k);
    const yy = lerp(vy - 30, -40, k);
    glow(c, xl, yy, 30 + k * 160, 0.6);
    glow(c, xr, yy, 30 + k * 160, 0.6);
  }
  // wet asphalt with the lights' reflections
  c.fillStyle = linGrad(c, 0, vy, 0, H, [
    [0, grey(0.08)],
    [1, grey(0.02)],
  ]);
  c.fill(poly([[690, vy + 10], [910, vy + 10], [1800, H + 50], [-200, H + 50]]));
  const k = ease.inExpo(u) * 0.9 + u * 0.1;
  const ls = lerp(0.12, 2.8, k);
  const lx = CX;
  const ly = lerp(vy + 8, 700, k);
  // reflections of the headlights in the water
  for (const side of [-1, 1]) {
    const hx = lx + side * 150 * ls;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = linGrad(c, 0, ly, 0, H, [
      [0, `rgba(255,255,255,${0.35})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(hx - 18 * ls, ly - 50 * ls, 36 * ls, H - ly + 50 * ls);
    c.restore();
  }
  carFront(c, lx, ly, ls, 0.6 + k * 0.6, 0.4);
  screenRain(c, t, 1, 0.05, 1.6);
  void s;
};

/** Shot B: tracking alongside the sedan, the city smeared behind it */
const sideShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  const bob = Math.sin(t * 40) * 1.5;
  noirCam(r, t, CX, CY + bob, 1);
  c.fillStyle = NOIR.night;
  c.fillRect(-100, -100, W + 200, H + 200);
  // the city smeared into horizontal streaks by the speed
  c.fillStyle = linGrad(c, 0, 140, 0, 560, [
    [0, grey(0.05)],
    [0.6, grey(0.12)],
    [1, grey(0.07)],
  ]);
  c.fillRect(-100, 140, W + 200, 420);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const len = 300 + hash(i * 1.3) * 900;
    const span = W + len + 200;
    const x = (((hash(i * 2.1) * span - t * (2600 + hash(i) * 1800)) % span) + span) % span - len - 100;
    const y = 150 + hash(i * 4.7) * 400;
    const a = 0.03 + hash(i * 6.1) * 0.12;
    c.fillStyle = linGrad(c, x, 0, x + len, 0, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, `rgba(255,255,255,${a})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(x, y, len, 2 + hash(i * 8.3) * 14);
  }
  c.restore();
  for (let i = 0; i < 4; i++) {
    const x = (((i * 520 - t * 3400) % 2080) + 2080) % 2080 - 240;
    streak(c, x, 210, 420, 0.5);
  }
  // road
  c.fillStyle = linGrad(c, 0, 560, 0, H, [
    [0, grey(0.1)],
    [1, grey(0.03)],
  ]);
  c.fillRect(-100, 560, W + 200, 400);
  c.strokeStyle = 'rgba(255,255,255,0.3)';
  c.lineWidth = 3;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = (((i * 360 - t * 3000) % 2160) + 2160) % 2160 - 280;
    c.moveTo(x, 720);
    c.lineTo(x + 180, 720);
  }
  c.stroke();
  // the car, its reflection, spray off the back wheel
  const x = 760 + Math.sin(u * 3) * 20;
  const y = 650 + bob;
  c.save();
  c.translate(0, y * 2 + 6);
  c.scale(1, -1);
  c.globalAlpha = 0.25;
  sedanSide(c, x, y, 1.45, 0, t * 40, { body: NOIR.night, rim: grey(0.6), tail: 1, head: 1 });
  c.restore();
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const k = ((hash(i) + t * 3) % 1);
    const px = x - 250 * 1.45 + -k * 260 + noise1(i + t * 5) * 10;
    const py = y - 10 - Math.sin(k * Math.PI) * 60 * hash(i * 2);
    c.fillStyle = `rgba(255,255,255,${0.25 * (1 - k)})`;
    c.fillRect(px, py, 10 + k * 20, 2);
  }
  c.restore();
  sedanSide(c, x, y, 1.45, 0, t * 40, { body: NOIR.night, rim: grey(0.72), tail: 1, head: 1 });
  // the pursuer's lamps glaring at the left edge
  glow(c, 30, 570, 300, 0.7);
  streak(c, 30, 570, 600, 0.6);
  screenRain(c, t, 0.8, 0.9, 1.4);
};

/** Shot C: tail lights fishtailing away round the corner */
const rearShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, CY, 1.02 + u * 0.05);
  c.fillStyle = NOIR.black;
  c.fillRect(-100, -100, W + 200, H + 200);
  const vy = 400;
  c.drawImage(s.city, 300, vy - 250, 1000, 280);
  c.fillStyle = NOIR.night;
  c.fill(poly([[-100, 80], [560, vy - 60], [560, vy + 30], [-100, 760]]));
  c.fill(poly([[1700, 80], [1060, vy - 60], [1060, vy + 30], [1700, 760]]));
  c.fillStyle = linGrad(c, 0, vy, 0, H, [
    [0, grey(0.07)],
    [1, grey(0.02)],
  ]);
  c.fill(poly([[560, vy + 30], [1060, vy + 30], [1800, H + 60], [-200, H + 60]]));
  const k = ease.outCubic(u);
  const x = lerp(820, 1000, k) + Math.sin(u * 9) * 30 * (1 - u);
  const y = lerp(760, 470, k);
  const sc = lerp(1.25, 0.38, k);
  const rot = Math.sin(u * 7) * 0.12 * (1 - u * 0.5);
  // red reflections streaming on the wet road
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const lx of [-160, 160]) {
    const px = x + lx * sc;
    c.fillStyle = linGrad(c, 0, y, 0, H, [
      [0, rgba(NOIR.red, 0.4)],
      [1, rgba(NOIR.red, 0)],
    ]);
    c.fillRect(px - 10 * sc, y - 40 * sc, 20 * sc, H - y);
  }
  c.restore();
  // tyre smoke
  fogBand(c, s.fx, x - 400 * sc, x + 400 * sc, y - 20 * sc, 220 * sc, t * 300, 0.35, 0, 600 * sc);
  carRear(c, x, y, sc, rot, 1);
  screenRain(c, t, 1, 0.1, 1.2);
};

/** Shot D: the pursuer's grille fills the frame, lamps blaze into a white-out */
const grilleShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  const [sx, sy] = shake(t, 5.0, 10, 1);
  noirCam(r, t, CX - sx, CY - sy, 1);
  c.fillStyle = NOIR.black;
  c.fillRect(-100, -100, W + 200, H + 200);
  const ls = lerp(3.6, 4.6, ease.inCubic(u));
  carFront(c, CX - 40, 1020 + u * 40, ls, 0.8 + u * 0.8, 1);
  screenRain(c, t, 1, 0.05, 1.8);
  void s;
};

/** Seated man at a desk: arms on the desk, head bowed */
const SEATED: Pose = {
  lean: 0.18,
  head: 0.28,
  ankleN: [46, 96],
  ankleF: [40, 98],
  wristN: [66, -44],
  wristF: [60, -40],
  elbowN: 1,
  elbowF: 1,
  handN: 'relaxed',
  handF: 'fist',
  seated: true,
};

const blindsOver = (c: Ctx, k: number, ox: number, oy: number, ang = -0.42, pitch = 46, gap = 0.48, a = 0.2) => {
  // the projected stripes of the blinds lying across the whole set
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(ox, oy);
  c.rotate(ang);
  c.fillStyle = `rgba(255,255,255,${a * k})`;
  const p = new Path2D();
  for (let i = -20; i < 20; i++) p.rect(-1400, i * pitch, 2800, pitch * gap);
  c.fill(p);
  c.restore();
};

/** Shot E: the office, smoke curling through the blind light */
const officeShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  const z = lerp(1, 1.12, ease.inOutSine(u));
  noirCam(r, t, lerp(820, 860, u), lerp(450, 440, u), z);
  c.fillStyle = grey(0.1);
  c.fillRect(-200, -200, W + 400, H + 400);
  // back wall panelling
  c.fillStyle = grey(0.13);
  for (let i = 0; i < 9; i++) c.fillRect(-100 + i * 220, 140, 180, 640);
  // window with blinds, the city glowing through it
  const wx = 1010;
  const wy = 170;
  const ww = 380;
  const wh = 430;
  const neon = 0.85 + (hash(Math.floor(t * 12)) < 0.1 ? -0.4 : 0) + noise1(t * 3) * 0.08;
  c.fillStyle = grey(0.8 * neon);
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = grey(0.12);
  for (let i = 0; i < 18; i++) c.fillRect(wx, wy + i * (wh / 18), ww, (wh / 18) * 0.52);
  c.strokeStyle = NOIR.black;
  c.lineWidth = 14;
  c.strokeRect(wx, wy, ww, wh);
  // door with frosted glass and reversed lettering
  c.fillStyle = grey(0.07);
  c.fillRect(110, 190, 250, 600);
  c.fillStyle = grey(0.32);
  c.fillRect(140, 220, 190, 230);
  c.save();
  c.translate(235, 330);
  c.scale(-1, 1);
  title(c, 'INVESTIGATIONS', 0, 0, { size: 17, spacing: 3, col: NOIR.black, a: 0.75, font: NOIR_TEXT });
  title(c, 'PRIVATE', 0, -26, { size: 15, spacing: 6, col: NOIR.black, a: 0.75, font: NOIR_TEXT });
  c.restore();
  // the stripes across the room
  blindsOver(c, neon, wx, wy + 40, -0.5, 44, 0.46, 0.13);
  // the man behind the desk, back lit
  const look: Look = { body: NOIR.black, far: NOIR.black, rim: grey(0.75), rimDx: 3, rimDy: -1, hat: 'fedora' };
  const breathe = Math.sin(t * 1.4) * 1.5;
  drawFigure(c, { ...SEATED, head: (SEATED.head ?? 0) + Math.sin(t * 0.8) * 0.03, wristN: [66, -44 + breathe] }, look, 690, 600, 1.55, 1);
  // desk, lamp, glass, ashtray smoke, the telephone
  c.fillStyle = NOIR.black;
  c.fillRect(420, 590, 760, 34);
  c.fillRect(440, 624, 720, 200);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(420, 590, 760, 2);
  c.fillStyle = NOIR.black;
  c.fill(
    poly([
      [520, 590],
      [530, 520],
      [500, 500],
      [600, 500],
      [570, 520],
      [580, 590],
    ])
  );
  glow(c, 550, 520, 140, 0.35);
  shaft(c, 550, 510, 560, 600, 90, 190, 0.18);
  c.fillStyle = grey(0.5);
  c.fillRect(1000, 560, 26, 30);
  c.fillStyle = NOIR.black;
  c.fill(rr(870, 552, 90, 38, 14));
  c.fillRect(886, 540, 58, 14);
  // smoke from the ashtray, through the light
  c.save();
  c.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    c.strokeStyle = `rgba(220,220,220,${0.16 - k * 0.03})`;
    c.lineWidth = 3 + k * 5;
    c.beginPath();
    const x0 = 1080;
    const y0 = 580;
    c.moveTo(x0, y0);
    for (let i = 1; i < 18; i++) c.lineTo(x0 + noise1(i * 0.35 - t * 0.9, k + 4) * i * 3 - i * 4, y0 - i * 22);
    c.stroke();
  }
  c.restore();
  // the ceiling fan's shadow sweeping the wall
  c.save();
  c.translate(820, 120);
  c.rotate(t * 3.4);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 0; k < 3; k++) {
    c.rotate(TAU / 3);
    c.fill(rr(10, -22, 360, 44, 22));
  }
  c.restore();
  fogBand(c, s.fx, -200, 1800, 300, 500, t * 18, 0.22, 0, 1400);
  blindShafts(c, { x: wx, y: wy, w: ww, h: wh, slats: 18, open: 0.48, vx: -560, vy: 420, spread: 1.1, a: 0.06 * neon });
};

const phoneArt = (c: Ctx, t: number, ring: number, lift: number) => {
  // body
  const jx = Math.sin(t * 120) * 3 * ring;
  c.save();
  c.translate(CX + jx, 640);
  const body = new Path2D();
  smoothPath(
    [
      [-250, 120],
      [-210, -60],
      [-120, -110],
      [120, -110],
      [210, -60],
      [250, 120],
    ],
    true,
    0.3,
    body
  );
  c.fillStyle = grey(0.55);
  c.save();
  c.translate(-3, -3);
  c.fill(body);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(body);
  // dial
  c.fillStyle = grey(0.22);
  c.beginPath();
  c.arc(0, 10, 100, 0, TAU);
  c.fill();
  c.fillStyle = NOIR.black;
  for (let i = 0; i < 10; i++) {
    const a = -0.6 + (i / 10) * 4.6;
    c.beginPath();
    c.arc(Math.cos(a) * 70, 10 + Math.sin(a) * 70, 15, 0, TAU);
    c.fill();
  }
  c.fillStyle = grey(0.7);
  c.beginPath();
  c.arc(0, 10, 28, 0, TAU);
  c.fill();
  c.strokeStyle = grey(0.6);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(78, 70);
  c.lineTo(100, 96);
  c.stroke();
  // cradle and receiver
  c.fillStyle = NOIR.black;
  c.fillRect(-170, -140, 40, 40);
  c.fillRect(130, -140, 40, 40);
  c.restore();
  c.save();
  c.translate(CX + jx * 1.4, 480 - lift * 520);
  c.rotate(-lift * 0.25 + Math.sin(t * 90) * 0.01 * ring);
  const rec = new Path2D();
  smoothPath(
    [
      [-290, 10],
      [-300, -40],
      [-230, -60],
      [-180, -30],
      [180, -30],
      [230, -60],
      [300, -40],
      [290, 10],
      [200, 20],
      [-200, 20],
    ],
    true,
    0.35,
    rec
  );
  c.fillStyle = grey(0.62);
  c.save();
  c.translate(-3, -3);
  c.fill(rec);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(rec);
  c.restore();
  // ring lines
  if (ring > 0.01) {
    c.save();
    c.strokeStyle = `rgba(255,255,255,${0.5 * ring})`;
    c.lineWidth = 4;
    c.lineCap = 'round';
    const ph = (t * 6) % 1;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const rad = 330 + k * 45 + ph * 30;
        c.beginPath();
        c.arc(CX, 560, rad, side > 0 ? -0.35 : Math.PI - 0.35, side > 0 ? 0.35 : Math.PI + 0.35);
        c.stroke();
      }
    }
    c.restore();
  }
};

/** Shot F: the phone rings on the desk */
const phoneShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, CY, 1 + u * 0.06);
  c.fillStyle = grey(0.08);
  c.fillRect(-100, -100, W + 200, H + 200);
  c.fillStyle = NOIR.black;
  c.fillRect(-100, 700, W + 200, 300);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(-100, 700, W + 200, 2);
  const ring = Math.sin(u * Math.PI * 4) > -0.2 ? 1 : 0.2;
  phoneArt(c, t, ring, 0);
  blindsOver(c, 1, 1300, 100, -0.5, 60, 0.45, 0.14);
  fogBand(c, s.fx, -100, 1700, 300, 400, t * 18, 0.18, 1, 1400);
};

/** Shot G: a hand snatches the receiver */
const handShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, CY, 1.06);
  c.fillStyle = grey(0.08);
  c.fillRect(-100, -100, W + 200, H + 200);
  c.fillStyle = NOIR.black;
  c.fillRect(-100, 700, W + 200, 300);
  const grab = ease.outCubic(seg(u, 0, 0.45));
  const lift = ease.inCubic(seg(u, 0.5, 1));
  phoneArt(c, t, 1 - grab, lift);
  // the hand: sleeve, cuff, knuckles, fingers wrapped over the receiver
  const hx = lerp(1700, 1010, grab) - lift * 40;
  const hy = lerp(120, 430, grab) - lift * 520;
  c.save();
  c.translate(hx, hy);
  c.rotate(-0.15 - lift * 0.25);
  const sleeve = poly([
    [140, -120],
    [600, -340],
    [700, -120],
    [190, 40],
  ]);
  c.fillStyle = grey(0.4);
  c.save();
  c.translate(-3, -3);
  c.fill(sleeve);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(sleeve);
  c.fillStyle = grey(0.7);
  c.fill(
    poly([
      [120, -100],
      [158, -126],
      [210, 30],
      [170, 50],
    ])
  );
  // back of the hand
  const back = new Path2D();
  smoothPath(
    [
      [170, -118],
      [60, -132],
      [-70, -118],
      [-96, -84],
      [-40, -50],
      [90, -30],
      [170, 20],
    ],
    true,
    0.4,
    back
  );
  // four fingers curling down over the front of the receiver, the thumb behind
  const fingers: [Pt, Pt, Pt, number][] = [
    [[-86, -96], [-140, -60], [-128, 20], 30],
    [[-56, -112], [-112, -70], [-98, 26], 32],
    [[-22, -122], [-76, -82], [-64, 22], 31],
    [[12, -124], [-38, -88], [-30, 12], 27],
  ];
  const strokeFingers = (col: string, dx: number, dy: number, extra: number) => {
    c.strokeStyle = col;
    c.lineCap = 'round';
    for (const [a0, a1, a2, w] of fingers) {
      c.lineWidth = w + extra;
      c.beginPath();
      c.moveTo(a0[0] + dx, a0[1] + dy);
      c.quadraticCurveTo(a1[0] + dx, a1[1] + dy, a2[0] + dx, a2[1] + dy);
      c.stroke();
    }
    c.lineWidth = 30 + extra;
    c.beginPath();
    c.moveTo(100 + dx, -40 + dy);
    c.quadraticCurveTo(40 + dx, -10 + dy, -10 + dx, -6 + dy);
    c.stroke();
  };
  c.fillStyle = grey(0.5);
  c.save();
  c.translate(-3, -3);
  c.fill(back);
  c.restore();
  strokeFingers(grey(0.5), -3, -3, 0);
  c.fillStyle = grey(0.06);
  c.fill(back);
  strokeFingers(grey(0.06), 0, 0, 0);
  // knuckle highlights
  c.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [a0] of fingers) {
    c.beginPath();
    c.ellipse(a0[0] - 4, a0[1] - 2, 9, 5, -0.4, 0, TAU);
    c.fill();
  }
  c.restore();
  blindsOver(c, 1, 1300, 100, -0.5, 60, 0.45, 0.14);
  void s;
};

const MAN_LOOK: Look = { body: NOIR.black, far: NOIR.black, rim: grey(0.82), rimDx: 3, rimDy: -2, hat: 'fedora' };
const WOMAN_LOOK: Look = { body: NOIR.black, far: NOIR.black, rim: grey(0.82), rimDx: -3, rimDy: -2, kind: 'woman', hat: 'brim' };

/** Shot H1: the stand-off under one bulb */
const standoffWide = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, lerp(470, 455, u), lerp(1, 1.06, u));
  c.fillStyle = grey(0.06);
  c.fillRect(-200, -200, W + 400, H + 400);
  // brick walls on both sides, receding
  c.fillStyle = s.brick ?? NOIR.night;
  c.fill(poly([[-200, -100], [420, 120], [420, 640], [-200, 900]]));
  c.fill(poly([[1800, -100], [1180, 120], [1180, 640], [1800, 900]]));
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fill(poly([[-200, -100], [420, 120], [420, 640], [-200, 900]]));
  // far end of the alley in fog
  c.fillStyle = grey(0.2);
  c.fillRect(420, 120, 760, 520);
  fogBand(c, s.fx, 300, 1300, 520, 300, t * 20, 0.4, 0, 1000);
  // ground
  c.fillStyle = linGrad(c, 0, 640, 0, H, [
    [0, grey(0.14)],
    [1, grey(0.03)],
  ]);
  c.fill(poly([[420, 640], [1180, 640], [1800, 1000], [-200, 1000]]));
  // the bulb, swinging a little
  const sw = Math.sin(t * 1.3) * 0.05;
  const bx = CX + Math.sin(sw) * 260;
  const by = 120 + 260 - Math.cos(sw) * 260;
  c.strokeStyle = NOIR.black;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(CX, -120);
  c.lineTo(bx, by);
  c.stroke();
  shaft(c, bx, by, bx, 760, 30, 720, 0.16);
  glow(c, bx, by, 240, 0.6);
  glow(c, bx, by, 30, 1);
  ripples(c, t, CX, 760, 520, 90, 40, 5, 0.3, 26);
  // long shadows thrown toward the camera
  c.fillStyle = 'rgba(0,0,0,0.55)';
  for (const [fx, d] of [
    [560, -1],
    [1040, 1],
  ] as [number, number][]) {
    c.beginPath();
    c.moveTo(fx - 18, 708);
    c.lineTo(fx + 18, 708);
    c.lineTo(fx + d * 240 + 60, 900);
    c.lineTo(fx + d * 240 - 60, 900);
    c.fill();
  }
  // the two of them, still, coats moving in the wind
  const fl = noise1(t * 1.4, 2) * 0.4 + 0.2;
  drawFigure(c, { ...standPose({ pockets: true, head: 0.02 }), flare: fl }, MAN_LOOK, 560, 708 - 172 * 1.05, 1.05, 1);
  drawFigure(c, { ...standPose({ pockets: true, head: 0.0 }), flare: -fl }, WOMAN_LOOK, 1040, 708 - 172 * 1.0, 1.0, -1);
  screenRain(c, t, 0.8, 0.08, 1);
};

/** Close profile: a huge head with a band of light across the eyes */
const eyesShot =
  (who: 'man' | 'woman', tight: number) =>
  (c: Ctx, r: Riso, t: number, u: number, s: State) => {
    noirCam(r, t, CX, CY, 1 + u * 0.05 * tight);
    c.fillStyle = grey(0.05);
    c.fillRect(-100, -100, W + 200, H + 200);
    fogBand(c, s.fx, -100, 1700, 400, 600, t * 30, 0.2, 1, 1500);
    const man = who === 'man';
    const dir = man ? 1 : -1;
    const S = lerp(6.5, 11, tight);
    const look = man ? MAN_LOOK : WOMAN_LOOK;
    const pose: Pose = { ...standPose({ head: 0.04 }), lean: 0.02 };
    // place the eye at a fixed screen point
    const target: Pt = man ? [620 - tight * 80, 430] : [980 + tight * 80, 430];
    const probe = drawFigureProbe(pose);
    const ex = target[0] - probe[0] * S * dir;
    const ey = target[1] - probe[1] * S;
    const b = drawFigure(c, pose, { ...look, rimDx: 4 * dir, rimDy: -3 }, ex, ey, S, dir);
    // the band of light across the eyes
    const e = toWorld(b.eye, ex, ey, S, dir);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = linGrad(c, 0, e[1] - 60, 0, e[1] + 60, [
      [0, 'rgba(255,255,255,0)'],
      [0.3, 'rgba(255,255,255,0.22)'],
      [0.7, 'rgba(255,255,255,0.22)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(-100, e[1] - 60, W + 200, 120);
    c.restore();
    // the eye itself: a lid, an iris and a catch light
    const blink = Math.abs(Math.sin(u * 2.2 + (man ? 0 : 1))) > 0.97 ? 0.15 : 1;
    c.save();
    c.translate(e[0] - dir * 4 * (S / 7), e[1] + 3 * (S / 7));
    c.scale(dir * (S / 7), S / 7);
    c.fillStyle = grey(0.72);
    c.beginPath();
    c.moveTo(-12, 0);
    c.quadraticCurveTo(-2, -8 * blink, 10, -1);
    c.quadraticCurveTo(0, 6 * blink, -12, 0);
    c.fill();
    c.fillStyle = NOIR.black;
    c.beginPath();
    c.arc(3.5, -0.6, 4.4 * blink, 0, TAU);
    c.fill();
    c.fillStyle = grey(1);
    c.beginPath();
    c.arc(5, -2, 1.2 * blink, 0, TAU);
    c.fill();
    c.strokeStyle = NOIR.black;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-13, -1);
    c.quadraticCurveTo(-2, -10 * blink, 11, -2);
    c.stroke();
    c.restore();
    screenRain(c, t, 0.7, 0.08, 1);
  };

/** Eye position for a pose, in local units (no drawing) */
const drawFigureProbe = (p: Pose): Pt => solve(p).eye;

/* ---------- the train ---------- */

const T_TRAIN_IN = 13.42;
const T_TRAIN_OUT = 14.6;

const trainX = (t: number) => {
  // the head arrives from the right and the whole train clears to the left
  const k = seg(t, T_TRAIN_IN, T_TRAIN_OUT);
  return lerp(1700, -5300, k);
};

const drawTrain = (c: Ctx, t: number, y: number, s: number) => {
  const x0 = trainX(t);
  if (x0 > 1700 || x0 < -5300) return;
  c.save();
  c.translate(0, y);
  // cars: 4 of 1250 px with lit windows, dark gaps between
  for (let k = 0; k < 4; k++) {
    const cx = x0 + k * 1270;
    if (cx > W + 100 || cx + 1250 < -100) continue;
    const car = rr(cx, -300 * s, 1250, 290 * s, 40);
    c.fillStyle = NOIR.night;
    c.fill(car);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(cx + 20, -300 * s + 8, 1210, 3);
    for (let i = 0; i < 9; i++) {
      const wx = cx + 50 + i * 132;
      c.fillStyle = grey(0.85);
      c.fillRect(wx, -230 * s, 90, 100 * s);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      if (hash(i + k * 9) < 0.4) c.fillRect(wx + 30, -200 * s, 26, 70 * s);
    }
    c.fillStyle = NOIR.black;
    c.fillRect(cx + 60, -20 * s, 200, 26);
    c.fillRect(cx + 990, -20 * s, 200, 26);
  }
  c.restore();
  // motion smear
  if (x0 + 5080 < -100) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.fillRect(Math.max(-100, x0), y - 240 * s, W + 200, 120 * s);
  c.restore();
};

/** How much the train's windows are lighting the platforms right now (strobing) */
const trainLight = (t: number) => {
  const x0 = trainX(t);
  if (t < T_TRAIN_IN || t > T_TRAIN_OUT) return 0;
  // a light pulse each time a window passes the centre of frame
  const local = ((CX - x0) % 1270 + 1270) % 1270;
  const inWin = local > 50 && local < 1240 ? ((local - 50) % 132) / 132 : 0;
  return 0.35 + 0.65 * (inWin < 0.68 ? 1 : 0);
};

const platformShot =
  (variant: 'wide' | 'gone') =>
  (c: Ctx, r: Riso, t: number, u: number, s: State) => {
    const [sx, sy] = t > T_TRAIN_IN && t < T_TRAIN_OUT ? shake(t, T_TRAIN_IN, 3, 2) : [0, 0];
    noirCam(r, t, CX - sx, CY - sy, 1 + u * 0.03);
    c.fillStyle = grey(0.05);
    c.fillRect(-200, -200, W + 400, H + 400);
    // station canopy, columns and the far platform
    c.fillStyle = NOIR.black;
    c.fillRect(-100, 100, W + 200, 60);
    for (let i = 0; i < 6; i++) c.fillRect(120 + i * 300, 150, 18, 340);
    c.fillStyle = grey(0.18);
    c.fillRect(-100, 470, W + 200, 30);
    // the far platform lamp, and her under it
    const lampX = 1080;
    glow(c, lampX, 180, 220, 0.5);
    shaft(c, lampX, 180, lampX, 480, 30, 260, 0.14);
    fogBand(c, s.fx, -100, 1700, 420, 340, t * 40, 0.4, 0, 1200);
    const tl = trainLight(t);
    if (variant === 'wide') drawFigure(c, { ...standPose({ pockets: true }), flare: tl * 0.3 }, { ...WOMAN_LOOK, rim: grey(0.6 + tl * 0.35) }, lampX, 470 - 172 * 0.62, 0.62, -1);
    else {
      // just a page from a newspaper skittering where she stood
      const k = (t - 14.6) * 1.4;
      c.fillStyle = grey(0.55);
      c.save();
      c.translate(lampX - 40 - k * 160, 462 - Math.abs(Math.sin(k * 6)) * 14);
      c.rotate(k * 3);
      c.fillRect(-14, -10, 28, 20);
      c.restore();
    }
    // tracks
    c.fillStyle = grey(0.04);
    c.fillRect(-100, 500, W + 200, 150);
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-100, 560);
    c.lineTo(W + 100, 560);
    c.moveTo(-100, 610);
    c.lineTo(W + 100, 610);
    c.stroke();
    drawTrain(c, t, 640, 1.25);
    // near platform edge and the man in the foreground, his back to us
    c.fillStyle = grey(0.12);
    c.fillRect(-100, 650, W + 200, 300);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(-100, 650, W + 200, 4);
    drawFigure(c, { ...standPose({ pockets: true, head: 0.05 }), flare: 0.2 + tl * 0.3 }, { ...MAN_LOOK, rim: grey(0.5 + tl * 0.4) }, 330, 980 - 172 * 1.9, 1.9, 1);
    if (tl > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,255,255,${0.08 * tl})`;
      c.fillRect(-100, -100, W + 200, H + 200);
      c.restore();
    }
    screenRain(c, t, 0.4, 0.06, 1);
  };

/** Close on him while the windows strobe across his face */
const trainFaceShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, CY, 1);
  c.fillStyle = grey(0.04);
  c.fillRect(-100, -100, W + 200, H + 200);
  const tl = trainLight(t);
  // the train smear behind him
  drawTrain(c, t, 760, 2.4);
  const pose: Pose = { ...standPose({ head: 0.04 }), lean: 0.02 };
  const S = 7;
  const b = drawFigure(c, pose, { ...MAN_LOOK, rim: grey(0.4 + tl * 0.6), rimDx: 5, rimDy: -2 }, 520, 1180, S, 1);
  const e = toWorld(b.eye, 520, 1180, S, 1);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = `rgba(255,255,255,${0.2 * tl})`;
  c.fillRect(-100, e[1] - 50, W + 200, 100);
  c.restore();
  fogBand(c, s.fx, -100, 1700, 500, 600, t * 60, 0.2, 1, 1500);
};

/* ---------- the drop and the cards ---------- */

const dropShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  const lt = t - T_DROP;
  const [sx, sy] = shake(t, T_DROP, 22, 0.9);
  noirCam(r, t, CX - sx, CY - sy, 1 + lt * 0.012);
  c.fillStyle = NOIR.black;
  c.fillRect(-200, -200, W + 400, H + 400);
  // shockwave ring off the hit
  const ring = ease.outCubic(seg(lt, 0, 0.45));
  if (ring < 1) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,255,255,${0.22 * (1 - ring)})`;
    c.lineWidth = 10 * (1 - ring) + 1;
    c.beginPath();
    c.ellipse(CX, CY, 100 + ring * 1100, 40 + ring * 420, 0, 0, TAU);
    c.stroke();
    c.restore();
  }
  fogBand(c, s.fx, -200, 1800, 560, 520, t * 30, 0.32, 0, 1500);
  fogBand(c, s.fx, -200, 1800, 340, 420, -t * 22 + 300, 0.18, 1, 1300);
  // the title slams in
  const slam = ease.outExpo(seg(lt, 0, 0.35));
  const sc = lerp(1.35, 1, slam);
  c.save();
  c.translate(CX, CY);
  c.scale(sc, sc);
  c.globalAlpha = clamp(lt * 8);
  c.drawImage(s.titleArt, -700, -220, 1400, 440);
  c.restore();
  // the red rule drawing out from the centre
  const rw = ease.inOutCubic(seg(lt, 0.25, 1.1));
  c.fillStyle = NOIR.red;
  c.fillRect(CX - 330 * rw, CY + 128, 660 * rw, 3);
  glow(c, CX, CY + 130, 340 * rw, 0.2 * rw, NOIR.red);
  // falling ash / rain slowed right down
  rain(c, t, { seed: 5, n: 160, x0: 0, y0: 0, x1: W, y1: H, speed: 120, slant: 0.05, len: 6, width: 1.4, a: 0.3 });
  void u;
};

const endShot = (c: Ctx, r: Riso, t: number, u: number, s: State) => {
  noirCam(r, t, CX, CY, 1 + u * 0.02);
  c.fillStyle = NOIR.black;
  c.fillRect(-200, -200, W + 400, H + 400);
  fogBand(c, s.fx, -200, 1800, 640, 400, t * 20, 0.2, 0, 1500);
  const a = clamp((t - T_END) * 5);
  c.globalAlpha = a;
  c.drawImage(s.endArt, 0, 0, W, H);
  c.globalAlpha = 1;
  void r;
};

/* ---------- the edit ---------- */

const SHOTS: Shot[] = [
  { a: 0, b: 2.5, draw: studioShot },
  { a: 2.5, b: 3.5, draw: cardShot('THIS FALL') },
  { a: 3.5, b: 4.0, draw: headlightsShot, flash: 0.5 },
  { a: 4.0, b: 4.5, draw: sideShot, flash: 0.35 },
  { a: 4.5, b: 5.0, draw: rearShot },
  { a: 5.0, b: 5.5, draw: grilleShot, flash: 0.4 },
  { a: 5.5, b: 6.5, draw: cardShot('ONE CITY'), flash: 0.9 },
  { a: 6.5, b: 8.5, draw: officeShot },
  { a: 8.5, b: 9.0, draw: phoneShot, flash: 0.25 },
  { a: 9.0, b: 9.5, draw: handShot },
  { a: 9.5, b: 10.5, draw: cardShot('ONE NIGHT') },
  { a: 10.5, b: 11.5, draw: standoffWide },
  { a: 11.5, b: 12.0, draw: eyesShot('man', 0) },
  { a: 12.0, b: 12.5, draw: eyesShot('woman', 0) },
  { a: 12.5, b: 12.75, draw: eyesShot('man', 1) },
  { a: 12.75, b: 13.0, draw: eyesShot('woman', 1) },
  { a: 13.0, b: 13.75, draw: platformShot('wide') },
  { a: 13.75, b: 14.0, draw: trainFaceShot },
  { a: 14.0, b: 14.25, draw: platformShot('wide') },
  { a: 14.25, b: 14.5, draw: trainFaceShot },
  { a: 14.5, b: 15.0, draw: platformShot('gone') },
  { a: 15.0, b: T_DROP, draw: (c) => {
    c.fillStyle = NOIR.black;
    c.fillRect(0, 0, W, H);
  } },
  { a: T_DROP, b: T_END, draw: dropShot, flash: 1 },
  { a: T_END, b: DUR + 1, draw: endShot },
];

/* ---------- setup ---------- */

const setup = (r: Riso): State => {
  const fx = createNoirFX(r);
  const card = (text: string) =>
    bake(r, 1200, 300, (g) => {
      title(g, text, 600, 180, { size: 96, spacing: 34, col: NOIR.white, bloom: 0.55 });
    });
  const cards: Record<string, HTMLCanvasElement> = {
    'THIS FALL': card('THIS FALL'),
    'ONE CITY': card('ONE CITY'),
    'ONE NIGHT': card('ONE NIGHT'),
  };
  const titleArt = bake(r, 1400, 440, (g) => {
    title(g, 'MOTOR CITY', 700, 150, { size: 64, spacing: 40, col: NOIR.pale, bloom: 0.4 });
    title(g, 'NOIR', 700, 330, { size: 200, spacing: 56, col: NOIR.white, bloom: 0.6 });
  });
  const endArt = bake(r, 1600, 900, (g) => {
    title(g, 'COMING SOON', 800, 360, { size: 104, spacing: 26, col: NOIR.white, bloom: 0.45 });
    rule(g, 800, 405, 520, 0.8);
    title(g, 'ONLY IN THEATRES', 800, 460, { size: 22, spacing: 16, col: NOIR.silver });
    title(g, 'NOVEMBER 14', 800, 510, { size: 34, spacing: 18, col: NOIR.pale });
    // billing block: tall condensed caps
    g.save();
    g.translate(800, 630);
    g.scale(0.62, 1);
    const lines = [
      'LANTERN HALL PICTURES PRESENTS  A FILM IN ONE NIGHT  MOTOR CITY NOIR',
      'MUSIC BY THE BASEMENT TRIO  CINEMATOGRAPHY BY ONE LONG LENS  EDITED ON THE BEAT',
      'WRITTEN AND DIRECTED BY S. SHUMUNOV',
    ];
    lines.forEach((L, i) => title(g, L, 0, i * 24, { size: 18, spacing: 2.5, col: NOIR.gray, font: NOIR_TEXT }));
    g.restore();
    // the studio lantern, small
    g.strokeStyle = NOIR.gray;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(800, 728, 18, 0, TAU);
    g.stroke();
    g.fillStyle = NOIR.gray;
    g.fillRect(795, 718, 10, 16);
  });
  // the studio emblem: a street lantern inside a ring, with the name below
  const studioArt = bake(r, 800, 600, (g) => {
    const cx = 400;
    const cy = 260;
    g.strokeStyle = NOIR.silver;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, 150, 0, TAU);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, 160, 0, TAU);
    g.stroke();
    // lantern: finial, cap, glass cage with mullions, base, bracket
    g.fillStyle = NOIR.night;
    g.strokeStyle = NOIR.pale;
    g.lineWidth = 2.5;
    const cage = poly([
      [cx - 34, cy - 40],
      [cx + 34, cy - 40],
      [cx + 26, cy + 52],
      [cx - 26, cy + 52],
    ]);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fill(cage);
    g.stroke(cage);
    g.beginPath();
    g.moveTo(cx, cy - 40);
    g.lineTo(cx, cy + 52);
    g.stroke();
    g.fillStyle = NOIR.pale;
    g.fill(
      poly([
        [cx - 50, cy - 40],
        [cx, cy - 86],
        [cx + 50, cy - 40],
      ])
    );
    g.fillRect(cx - 3, cy - 108, 6, 24);
    g.beginPath();
    g.arc(cx, cy - 112, 6, 0, TAU);
    g.fill();
    g.fillRect(cx - 32, cy + 52, 64, 10);
    g.fillRect(cx - 8, cy + 62, 16, 60);
    title(g, 'LANTERN HALL', cx, cy + 250, { size: 50, spacing: 22, col: NOIR.white, bloom: 0.4 });
    rule(g, cx, cy + 278, 360, 0.7);
    title(g, 'PICTURES', cx, cy + 312, { size: 18, spacing: 16, col: NOIR.silver });
  });
  // a distant skyline strip for the street shots
  const city = bake(r, 1000, 280, (g) => {
    const rng = mulberry(8);
    let x = 0;
    while (x < 1000) {
      const w = 30 + rng() * 70;
      const h = 60 + rng() * 200;
      g.fillStyle = grey(0.12 + rng() * 0.06);
      g.fillRect(x, 280 - h, w, h);
      for (let y = 280 - h + 10; y < 270; y += 10)
        for (let wx = x + 4; wx < x + w - 4; wx += 8) {
          if (rng() < 0.12) {
            g.fillStyle = grey(0.5 + rng() * 0.4, 0.8);
            g.fillRect(wx, y, 3, 4);
          }
        }
      x += w + 2;
    }
  });
  // brick for the alley
  const bt = r.scratch(120, 64);
  const rng = mulberry(3);
  bt.ctx.fillStyle = grey(0.1);
  bt.ctx.fillRect(0, 0, 120, 64);
  for (let row = 0; row < 4; row++)
    for (let i = -1; i < 5; i++) {
      bt.ctx.fillStyle = grey(0.08 + rng() * 0.04);
      bt.ctx.fillRect(i * 30 + (row % 2 ? 15 : 0) + 1, row * 16 + 1, 28, 14);
    }
  const brick = r.layers[0].createPattern(bt.canvas, 'repeat');
  brick?.setTransform(new DOMMatrix().scale(1 / r.scale, 1 / r.scale));
  return { fx, cards, titleArt, endArt, studioArt, city, brick };
};

export const noirComingSoonFilm: RisoFilm<State> = {
  id: 'noir-coming-soon',
  title: 'Coming Soon',
  caption: 'A trailer for a noir that does not exist, cut on the beat: chase, phone, stand-off, train, drop.',
  theme: 'Cinematic',
  category: 'Cinematic',
  motif: 'A beam of light cutting the dark: lantern, headlights, blinds, train windows, the flash',
  duration: DUR,
  series: 'Noir',
  mode: 'direct',
  paper: NOIR.black,
  grain: 0,
  inks: [{ color: NOIR.black }, { color: NOIR.gray }, { color: NOIR.white }, { color: NOIR.red }],
  scenes: [
    { at: 0, label: 'Studio' },
    { at: 3.5, label: 'The chase' },
    { at: 6.5, label: 'The office' },
    { at: 10.5, label: 'Stand-off' },
    { at: 13.0, label: 'The train' },
    { at: T_DROP, label: 'Title' },
  ],
  posterTime: 17.2,
  setup,
  draw(r: Riso, t: number, s: State) {
    const c = r.layers[0];
    let shot = SHOTS[SHOTS.length - 1];
    for (const sh of SHOTS) {
      if (t >= sh.a && t < sh.b) {
        shot = sh;
        break;
      }
    }
    const u = clamp((t - shot.a) / (shot.b - shot.a));
    c.save();
    shot.draw(c, r, t, u, s);
    c.restore();
    r.camera(800, 450, 1);
    const since = t - shot.a;
    const flash = (shot.flash ?? 0) * clamp(1 - since / 0.09);
    const dropFlash = t >= T_DROP ? Math.exp(-(t - T_DROP) * 6) * 0.85 : 0;
    finish(c, s.fx, t, {
      halation: 1.1,
      threshold: 0.78,
      grain: 0.55,
      damage: 1.2,
      white: Math.max(flash, dropFlash),
      black: t > DUR - 0.3 ? seg(t, DUR - 0.3, DUR) * 0 : 0,
    });
    void ripples;
    void TAU;
  },
};
