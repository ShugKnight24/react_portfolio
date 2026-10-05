import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import {
  TAU,
  clamp,
  lerp,
  seg,
  tween,
  ease,
  noise1,
  mulberry,
  morph,
  morphPair,
  polyPath,
  smoothPath,
  ellipsePts,
  wobble,
  DISPLAY,
  SERIF,
  MONO,
  spacedText,
  type Pt,
} from '../riso/kit';

/*
 * Window Seat: the aperture is the motif. A lens iris opens into an airplane window, the window
 * swallows the screen as we drop through the clouds into layered ridges and a lake, a viewfinder
 * frames a traveller on a cliff, the shutter blades sweep shut, and the shot comes out as a print
 * on a little stack, stamped like a postcard.
 */

const BL = 0; // cornflower
const OR = 1; // orange
const GR = 2; // hunter green
const YE = 3; // yellow

const CX = 800;
const CY = 450;

/* window geometry (inner glass) */
const WIN_W = 420;
const WIN_H = 560;
const WIN_R = 190;
const SIDE_DX = 740;

/* viewfinder / print crop */
const VF_W = 1240;
const VF_H = 700;

/* times */
const T_MORPH0 = 2.5;
const T_MORPH1 = 3.5;
const T_SHUT0 = 13.6;
const T_SHUT_CLOSED = 13.88;
const T_SWAP = 13.95;
const T_SHUT1 = 14.4;
const T_FREEZE = 13.9;

interface Ridge {
  path: Path2D;
  snow: Path2D | null;
  base: number;
  top: number;
  drop: number;
  speed: number;
  k: number;
}

interface Puff {
  path: Path2D;
  x: number;
  y: number;
  sp: number;
  s: number;
}

interface State {
  big: Path2D;
  ridges: Ridge[];
  lake: Path2D;
  lakeDrop: number;
  lakeSpeed: number;
  sea: Path2D[];
  seaAll: Path2D;
  puffs: Puff[];
  wing: Path2D;
  wingEdge: Path2D;
  flaps: Path2D;
  winglet: Path2D;
  engine: Path2D;
  cliff: Path2D;
  cliffRim: Path2D;
  strata: Path2D;
  tufts: Path2D;
  hept: [Pt[], Pt[]];
  heptO: [Pt[], Pt[]];
  grain: Path2D;
  stamp: Path2D;
  stampWin: Path2D;
  table: HTMLCanvasElement[];
}

/* ---------- geometry helpers ---------- */

const rrPath = (cx: number, cy: number, w: number, h: number, rad: number, p: Path2D = new Path2D()) => {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.max(0.1, Math.min(rad, hw, hh));
  p.moveTo(cx - hw + rr, cy - hh);
  p.arcTo(cx + hw, cy - hh, cx + hw, cy + hh, rr);
  p.arcTo(cx + hw, cy + hh, cx - hw, cy + hh, rr);
  p.arcTo(cx - hw, cy + hh, cx - hw, cy - hh, rr);
  p.arcTo(cx - hw, cy - hh, cx + hw, cy - hh, rr);
  p.closePath();
  return p;
};

const rrPts = (cx: number, cy: number, w: number, h: number, rad: number): Pt[] => {
  const pts: Pt[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(rad, hw, hh);
  const corners: [number, number, number][] = [
    [cx + hw - rr, cy - hh + rr, -Math.PI / 2],
    [cx + hw - rr, cy + hh - rr, 0],
    [cx - hw + rr, cy + hh - rr, Math.PI / 2],
    [cx - hw + rr, cy - hh + rr, Math.PI],
  ];
  for (const [ox, oy, a0] of corners)
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (i / 16) * (Math.PI / 2);
      pts.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr]);
    }
  return pts;
};

const polyN = (cx: number, cy: number, R: number, n: number, rot: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * TAU) / n;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R] as Pt;
  });

const circ = (cx: number, cy: number, r: number, p: Path2D = new Path2D()) => {
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, Math.max(0.1, r), 0, TAU);
  return p;
};

const annulus = (cx: number, cy: number, r0: number, r1: number) => {
  const p = circ(cx, cy, r1);
  circ(cx, cy, r0, p);
  return p;
};

/** Big rect plus a hole (fill with evenodd) */
const outside = (hole: Path2D) => {
  const p = new Path2D();
  p.rect(-4000, -4000, 9600, 8900);
  p.addPath(hole);
  return p;
};

const perfPts = (w: number, h: number, rad: number, sp: number): Pt[] => {
  const pts: Pt[] = [];
  const cs: Pt[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  for (let e = 0; e < 4; e++) {
    const a = cs[e];
    const b = cs[(e + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / sp));
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    // inward normal for clockwise order
    const ix = -uy;
    const iy = ux;
    for (let i = 0; i < n; i++) {
      const s0 = (i * len) / n;
      const mid = s0 + len / (2 * n);
      pts.push([a[0] + ux * s0, a[1] + uy * s0]);
      const mx = a[0] + ux * mid;
      const my = a[1] + uy * mid;
      for (let j = 0; j <= 6; j++) {
        const ang = Math.PI * (j / 6);
        const du = -Math.cos(ang) * rad;
        const dn = Math.sin(ang) * rad;
        pts.push([mx + ux * du + ix * dn, my + uy * du + iy * dn]);
      }
    }
  }
  return pts;
};

/* ---------- fill helpers ---------- */

const fillT = (r: Riso, c: Ctx, p: Path2D, d: number, rule: CanvasFillRule = 'nonzero') => {
  if (d <= 0.012) return;
  c.fillStyle = r.tone(c, d);
  c.fill(p, rule);
};

const knock = (c: Ctx, p: Path2D, rule: CanvasFillRule = 'nonzero') => {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  c.fill(p, rule);
  c.restore();
};

const knockAll = (r: Riso, p: Path2D, rule: CanvasFillRule = 'nonzero') => {
  for (const c of r.layers) knock(c, p, rule);
};

const knockStroke = (c: Ctx, p: Path2D, lw: number) => {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.strokeStyle = '#000';
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke(p);
  c.restore();
};

/** Halftone knockout: lifts ink in dots, like haze */
const hazeAll = (r: Riso, y0: number, y1: number, from: number, to: number, mult: number[]) => {
  r.layers.forEach((c, i) => {
    if (mult[i] <= 0) return;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    r.gradient(c, null, { kind: 'linear', x0: 0, y0, x1: 0, y1, from: from * mult[i], to: to * mult[i] }, 6);
    c.restore();
  });
};

/* ---------- timeline ---------- */

const D_FIN = 9 + 2.5 * 0.5;
const drift = (t: number) => {
  if (t < 9) return t;
  const k = seg(t, 9, 11.5);
  return 9 + 2.5 * (k - (k * k) / 2);
};

interface VP {
  t: number;
  g: number;
  cg: number;
  warm: number;
  wing: number;
  cliff: number;
  arms: number;
  sunX: number;
  sunY: number;
  dd: number;
}

const viewParams = (t: number, tShimmer = t): VP => {
  let sunX: number;
  let sunY: number;
  if (t < 7.4) {
    const k = t / 7.4;
    sunX = lerp(860, 930, k);
    sunY = lerp(372, 300, ease.outSine(k));
  } else {
    const k = tween(t, 7.4, 11.6, ease.inOutSine);
    sunX = lerp(930, 780, k);
    sunY = lerp(300, 412, k) + 18 * seg(t, 11.6, 13.9);
  }
  return {
    t: tShimmer,
    g: tween(t, 7.8, 11.2, ease.inOutSine),
    cg: tween(t, 7.9, 10.3, ease.inOutCubic),
    warm: 0.12 + 0.88 * tween(t, 7.6, 11.6, ease.inOutSine),
    wing: tween(t, 7.5, 9.1, ease.inCubic),
    cliff: tween(t, 9.7, 11.5, ease.outCubic),
    arms: tween(t, 11.5, 12.15, ease.inOutCubic),
    sunX,
    sunY,
    dd: drift(t) - D_FIN,
  };
};

const viewM = (t: number) => {
  const z1 = 1 + 0.08 * tween(t, 7.4, 9.6);
  const k = tween(t, 11.0, 13.6, ease.inOutSine);
  const z = z1 * (1 + 0.3 * k);
  const fx = lerp(800, 1060, k);
  const fy = lerp(450, 520, k);
  return new DOMMatrix().translate(fx, fy).scale(z).translate(-fx, -fy);
};

/* ---------- the landscape seen through every frame ---------- */

const travellerFeet: Pt = [1150, 612];

const drawTraveller = (r: Riso, vp: VP) => {
  const [bl, or, gr, ye] = r.layers;
  const [fx, fy] = travellerFeet;
  const a = vp.arms;
  // legs
  const legs = new Path2D();
  legs.moveTo(fx - 13, fy - 76);
  legs.lineTo(fx + 11, fy - 76);
  legs.lineTo(fx + 15, fy - 2);
  legs.lineTo(fx + 5, fy);
  legs.lineTo(fx - 1, fy - 52);
  legs.lineTo(fx - 9, fy);
  legs.lineTo(fx - 21, fy - 2);
  legs.closePath();
  // boots
  legs.rect(fx - 25, fy - 7, 15, 7);
  legs.rect(fx + 3, fy - 7, 15, 7);
  // torso (jacket)
  const torso = new Path2D();
  torso.moveTo(fx - 16, fy - 140);
  torso.quadraticCurveTo(fx - 2, fy - 148, fx + 14, fy - 140);
  torso.lineTo(fx + 15, fy - 72);
  torso.lineTo(fx - 17, fy - 72);
  torso.closePath();
  // backpack on his back (he faces left)
  const pack = rrPath(fx + 22, fy - 108, 24, 62, 9);
  pack.rect(fx + 8, fy - 136, 6, 50);
  // head + beanie
  const head = circ(fx - 3, fy - 158, 13);
  const beanie = new Path2D();
  beanie.moveTo(fx - 17, fy - 157);
  beanie.quadraticCurveTo(fx - 3, fy - 194, fx + 11, fy - 157);
  beanie.closePath();
  circ(fx - 3, fy - 179, 5, beanie);
  // arm: shoulder -> elbow -> hand, raised to the eye as `a` goes to 1
  const sh: Pt = [fx - 6, fy - 134];
  const hand: Pt = [lerp(fx - 14, fx - 22, a), lerp(fy - 76, fy - 160, a)];
  const elbow: Pt = [lerp(fx - 12, fx - 2, a), lerp(fy - 104, fy - 128, a)];
  const arm = new Path2D();
  arm.moveTo(sh[0], sh[1]);
  arm.lineTo(elbow[0], elbow[1]);
  arm.lineTo(hand[0], hand[1]);
  const cam = new Path2D();
  cam.rect(hand[0] - 15, hand[1] - 10, 20, 15);
  circ(hand[0] - 17, hand[1] - 3, 5, cam);
  // scarf tail flutters behind
  const fl = Math.sin(vp.t * 7.3) * 5 + Math.sin(vp.t * 11.1) * 3;
  const scarf = new Path2D();
  scarf.moveTo(fx + 2, fy - 142);
  scarf.quadraticCurveTo(fx + 26, fy - 146 + fl * 0.4, fx + 44, fy - 136 + fl);
  scarf.lineTo(fx + 40, fy - 128 + fl);
  scarf.quadraticCurveTo(fx + 22, fy - 136, fx + 4, fy - 134);
  scarf.closePath();

  for (const c of [bl, gr]) {
    c.fillStyle = '#000';
    c.fill(legs);
    c.fill(head);
    c.fill(cam);
    knock(c, beanie);
  }
  gr.fill(pack);
  bl.fillStyle = r.tone(bl, 0.45);
  bl.fill(pack);
  or.fillStyle = '#000';
  or.fill(torso);
  or.fill(beanie);
  ye.fillStyle = r.tone(ye, 0.75);
  ye.fill(scarf);
  or.fillStyle = r.tone(or, 0.35);
  or.fill(scarf);
  or.save();
  or.strokeStyle = '#000';
  or.lineWidth = 11;
  or.lineCap = 'round';
  or.lineJoin = 'round';
  or.stroke(arm);
  or.restore();
  // shade on the jacket's back
  const shade = new Path2D();
  shade.rect(fx + 2, fy - 145, 14, 74);
  bl.save();
  bl.clip(torso);
  fillT(r, bl, shade, 0.4);
  bl.restore();
};

const drawView = (r: Riso, s: State, vp: VP) => {
  const [bl, or, gr, ye] = r.layers;
  const { warm, g } = vp;
  const hz = lerp(600, 500, g);

  /* sky */
  r.gradient(bl, s.big, { kind: 'linear', x0: 0, y0: -100, x1: 0, y1: hz, from: 0.88, to: lerp(0.3, 0.1, warm) }, 10);
  r.gradient(ye, s.big, { kind: 'linear', x0: 0, y0: hz - 420, x1: 0, y1: hz, from: 0, to: lerp(0.12, 0.72, warm) }, 9);
  if (warm > 0.15)
    r.gradient(or, s.big, { kind: 'linear', x0: 0, y0: hz - 300, x1: 0, y1: hz + 10, from: 0, to: 0.6 * (warm - 0.12) }, 8);

  /* sun */
  const sun = circ(vp.sunX, vp.sunY, 56);
  const halo = circ(vp.sunX, vp.sunY, 250);
  r.gradient(ye, halo, { kind: 'radial', cx: vp.sunX, cy: vp.sunY, r0: 56, r1: 250, from: 0.55, to: 0 }, 6);
  r.gradient(or, halo, { kind: 'radial', cx: vp.sunX, cy: vp.sunY, r0: 56, r1: 200, from: 0.2 + 0.3 * warm, to: 0 }, 6);
  knockAll(r, sun);
  ye.fillStyle = '#000';
  ye.fill(sun);
  fillT(r, or, sun, 0.15 + 0.7 * warm);

  /* ridges, far to near, with halftone haze between them */
  const drawRidge = (i: number) => {
    const rd = s.ridges[i];
    const ox = -rd.speed * vp.dd;
    const oy = (1 - g) * rd.drop;
    const k = rd.k;
    for (const c of r.layers) {
      c.save();
      c.translate(ox, oy);
    }
    knockAll(r, rd.path);
    r.gradient(bl, rd.path, { kind: 'linear', x0: 0, y0: rd.top, x1: 0, y1: rd.base + 70, from: lerp(0.5, 0.9, k), to: lerp(0.26, 0.62, k) }, 7);
    if (k > 0.2) r.gradient(gr, rd.path, { kind: 'linear', x0: 0, y0: rd.top, x1: 0, y1: rd.base + 90, from: lerp(0.05, 1, k * k), to: lerp(0.02, 0.7, k) }, 6);
    fillT(r, ye, rd.path, lerp(0.3, 0.0, k) * warm);
    fillT(r, or, rd.path, lerp(0.2, 0.0, k) * warm);
    if (rd.snow) {
      for (const c of r.layers) {
        c.save();
        c.clip(rd.path);
        knock(c, rd.snow);
        c.restore();
      }
      bl.save();
      bl.clip(rd.path);
      bl.clip(rd.snow);
      // shadow side of the snow
      const sh = new Path2D();
      sh.rect(-2000, -2000, 6000, 6000);
      bl.fillStyle = r.tone(bl, 0.16);
      bl.fill(sh);
      bl.restore();
    }
    for (const c of r.layers) c.restore();
  };
  const hazeAt = (i: number, amt: number) => {
    const rd = s.ridges[i];
    const y = rd.base + (1 - g) * rd.drop;
    hazeAll(r, y - 120, y + 40, 0, amt, [1, 1, 1, 0.6]);
  };

  drawRidge(0);
  hazeAt(0, 0.32);
  drawRidge(1);
  hazeAt(1, 0.28);

  /* lake */
  {
    const ox = -s.lakeSpeed * vp.dd;
    const oy = (1 - g) * s.lakeDrop;
    for (const c of r.layers) {
      c.save();
      c.translate(ox, oy);
    }
    knockAll(r, s.lake);
    fillT(r, bl, s.lake, lerp(0.42, 0.32, warm));
    fillT(r, ye, s.lake, 0.12 + 0.3 * warm);
    fillT(r, or, s.lake, 0.1 * warm);
    // sun column on the water
    const col = new Path2D();
    const colY = new Path2D();
    const sx = vp.sunX - ox;
    for (let j = 0; j < 12; j++) {
      const y = 604 + j * 10;
      const w = (78 - j * 4.5) * (0.55 + 0.45 * noise1(vp.t * 2.2 + j * 1.7, 4));
      const x = sx - w / 2 + noise1(vp.t * 1.4 + j * 3.1, 9) * 8;
      col.rect(x, y, w, 3.6);
      colY.rect(x - 10, y - 2, w + 20, 6);
    }
    const ripple = new Path2D();
    for (let j = 0; j < 9; j++) {
      const y = 612 + j * 13;
      const x = 380 + ((j * 211 + vp.t * 14) % 760);
      ripple.moveTo(x, y);
      ripple.lineTo(x + 40 + (j % 3) * 18, y);
    }
    for (const c of r.layers) {
      c.save();
      c.clip(s.lake);
    }
    for (const c of r.layers) knockStroke(c, ripple, 2);
    for (const c of r.layers) knock(c, colY);
    ye.fillStyle = '#000';
    ye.fill(colY);
    or.fillStyle = '#000';
    or.fill(col);
    for (const c of r.layers) c.restore();
    for (const c of r.layers) c.restore();
  }

  drawRidge(2);
  hazeAt(2, 0.22);
  drawRidge(3);
  hazeAt(3, 0.14);
  drawRidge(4);

  /* the cliff we end up standing on */
  if (vp.cliff > 0.001) {
    const oy = (1 - vp.cliff) * 560;
    for (const c of r.layers) {
      c.save();
      c.translate(0, oy);
    }
    knockAll(r, s.cliff);
    gr.fillStyle = '#000';
    gr.fill(s.cliff);
    r.gradient(bl, s.cliff, { kind: 'linear', x0: 1040, y0: 600, x1: 1300, y1: 950, from: 0.35, to: 0.85 }, 6);
    knockStroke(gr, s.strata, 1.8);
    knockStroke(bl, s.strata, 1.8);
    // sunlit rim
    for (const c of [bl, gr, or]) knockStroke(c, s.cliffRim, 4);
    ye.save();
    ye.strokeStyle = '#000';
    ye.lineWidth = 4;
    ye.lineCap = 'round';
    ye.stroke(s.cliffRim);
    ye.restore();
    gr.save();
    gr.strokeStyle = '#000';
    gr.lineWidth = 2.6;
    gr.lineCap = 'round';
    gr.stroke(s.tufts);
    gr.restore();
    drawTraveller(r, vp);
    for (const c of r.layers) c.restore();
  }

  /* clouds: a sea that parts as we descend, plus drifting puffs */
  const cloud = (p: Path2D, shade: number) => {
    knockAll(r, p);
    fillT(r, bl, p, shade);
    fillT(r, or, p, 0.14 * warm);
    fillT(r, ye, p, 0.1 * warm);
    // bright rims: knock the cloud outside a copy of itself shifted down
    for (const c of r.layers) {
      c.save();
      c.clip(p);
      c.translate(7, 24);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      const q = new Path2D();
      q.rect(-4000, -4000, 9600, 9000);
      q.addPath(p);
      c.fill(q, 'evenodd');
      c.restore();
    }
  };

  if (vp.cg < 1) {
    const cg = vp.cg;
    const sc = 1 + 0.6 * cg;
    for (const c of r.layers) {
      c.save();
      c.translate(800, 640 - 1500 * cg);
      c.scale(sc, sc);
      c.translate(-800 - vp.t * 6, 0);
    }
    s.sea.forEach((row, i) => cloud(row, 0.1 + i * 0.07));
    r.gradient(bl, s.seaAll, { kind: 'linear', x0: 0, y0: 230, x1: 0, y1: 520, from: 0, to: 0.4 }, 6);
    r.gradient(gr, s.seaAll, { kind: 'linear', x0: 0, y0: 330, x1: 0, y1: 520, from: 0, to: 0.18 }, 4);
    for (const c of r.layers) c.restore();
  }
  for (const pf of s.puffs) {
    const lift = vp.cg * (900 + pf.s * 500);
    const sc = pf.s * (1 + vp.cg * 1.8);
    let x = pf.x - pf.sp * vp.t;
    x = ((((x + 500) % 2600) + 2600) % 2600) - 500;
    const y = pf.y - lift;
    if (y < -400) continue;
    for (const c of r.layers) {
      c.save();
      c.translate(x, y);
      c.scale(sc, sc);
    }
    cloud(pf.path, 0.16);
    for (const c of r.layers) c.restore();
  }

  /* wing */
  if (vp.wing < 1) {
    const k = vp.wing;
    const bob = Math.sin(vp.t * 1.7) * 4;
    for (const c of r.layers) {
      c.save();
      c.translate(-760 * k, 620 * k + bob - 50);
      c.translate(200, 760);
      c.rotate(Math.sin(vp.t * 1.1) * 0.006 + 0.12 * k);
      c.translate(-200, -760);
    }
    knockAll(r, s.wing);
    knockAll(r, s.winglet);
    r.gradient(bl, s.wing, { kind: 'linear', x0: 0, y0: 610, x1: 0, y1: 860, from: 0.5, to: 0.85 }, 6);
    fillT(r, gr, s.wing, 0.45);
    fillT(r, ye, s.wing, 0.08 + 0.18 * warm);
    fillT(r, bl, s.engine, 0.7);
    fillT(r, gr, s.engine, 0.6);
    knockAll(r, s.wingEdge);
    fillT(r, ye, s.wingEdge, 0.35 * warm);
    knockStroke(bl, s.flaps, 2.4);
    knockStroke(gr, s.flaps, 2.4);
    or.fillStyle = '#000';
    or.fill(s.winglet);
    fillT(r, ye, s.winglet, 0.5);
    for (const c of r.layers) c.restore();
  }
};

/* ---------- iris (lens blades and shutter) ---------- */

const drawIris = (r: Riso, cx: number, cy: number, R: number, Rb: number, rot: number, glow: number) => {
  const [bl, or, gr, ye] = r.layers;
  const n = 7;
  const v = polyN(cx, cy, Math.max(R, 0.05), n, rot);
  const disc = circ(cx, cy, Rb);
  const L = Rb * 3;
  const edges = new Path2D();
  for (const c of r.layers) {
    c.save();
    c.clip(disc);
  }
  for (let k = 0; k < n; k++) {
    const p0 = v[k];
    const a = v[(k + 1) % n];
    const b = v[(k + 2) % n];
    const l0 = Math.hypot(a[0] - p0[0], a[1] - p0[1]) || 1;
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d0: Pt = [(a[0] - p0[0]) / l0, (a[1] - p0[1]) / l0];
    const d1: Pt = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1];
    const wedge = polyPath([a, [a[0] + d0[0] * L, a[1] + d0[1] * L], [a[0] + d1[0] * (L + l1), a[1] + d1[1] * (L + l1)]]);
    knockAll(r, wedge);
    bl.fillStyle = '#000';
    bl.fill(wedge);
    fillT(r, gr, wedge, k % 2 ? 0.62 : 0.85);
    fillT(r, or, wedge, k % 2 ? 0.08 : 0.2);
    edges.moveTo(a[0], a[1]);
    edges.lineTo(a[0] + d1[0] * (L + l1), a[1] + d1[1] * (L + l1));
  }
  // gloss on the blades: halftone lift from upper left
  if (glow > 0) {
    for (const c of [bl, gr]) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      r.gradient(c, null, { kind: 'linear', x0: cx - Rb, y0: cy - Rb, x1: cx, y1: cy, from: 0.55 * glow, to: 0 }, 6);
      c.restore();
    }
  }
  for (const c of r.layers) knockStroke(c, edges, Math.max(1.6, Rb * 0.006));
  ye.save();
  ye.strokeStyle = '#000';
  ye.lineWidth = Math.max(1.2, Rb * 0.004);
  ye.stroke(edges);
  ye.restore();
  for (const c of r.layers) c.restore();
};

/* ---------- lens body (scene 1) ---------- */

const drawLens = (r: Riso, t: number, lz: number, holeR: number, holeRot: number) => {
  const [bl, or, gr, ye] = r.layers;
  const Rin = 300 * lz;
  const r1 = Rin + 34 * lz;
  const r2 = Rin + 112 * lz;
  const r3 = Rin + 205 * lz;
  // backdrop
  const back = outside(circ(CX, CY, r3));
  knockAll(r, back, 'evenodd');
  or.fillStyle = r.tone(or, 0.9);
  or.fill(back, 'evenodd');
  ye.fillStyle = r.tone(ye, 0.6);
  ye.fill(back, 'evenodd');
  bl.save();
  bl.clip(back, 'evenodd');
  r.gradient(bl, null, { kind: 'radial', cx: CX + 20 * lz, cy: CY + 30 * lz, r0: r3, r1: r3 + 230 * lz, from: 0.55, to: 0 }, 7);
  bl.restore();
  // poster grid dots on the backdrop
  const ticks = new Path2D();
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 170;
    ticks.moveTo(x, 70);
    ticks.lineTo(x, 88);
  }
  gr.save();
  gr.clip(back, 'evenodd');
  gr.strokeStyle = '#000';
  gr.lineWidth = 3;
  gr.stroke(ticks);
  gr.restore();

  // barrel
  const barrel = annulus(CX, CY, r2, r3);
  knockAll(r, barrel, 'evenodd');
  bl.save();
  bl.clip(barrel, 'evenodd');
  r.gradient(bl, null, { kind: 'linear', x0: CX - r3, y0: CY - r3, x1: CX + r3, y1: CY + r3, from: 0.25, to: 0.85 }, 8);
  bl.restore();
  fillT(r, gr, barrel, 0.35, 'evenodd');
  // distance scale
  const scale = new Path2D();
  for (let i = -8; i <= 8; i++) {
    const a = -Math.PI / 2 + i * 0.07 + 0.25 * tween(t, 1.2, 2.0);
    const l = i % 4 === 0 ? 22 : 12;
    scale.moveTo(CX + Math.cos(a) * (r3 - 18 * lz), CY + Math.sin(a) * (r3 - 18 * lz));
    scale.lineTo(CX + Math.cos(a) * (r3 - (18 + l) * lz), CY + Math.sin(a) * (r3 - (18 + l) * lz));
  }
  for (const c of r.layers) knockStroke(c, scale, 2.4 * lz);
  const idx = circ(CX, CY - r3 + 9 * lz, 6 * lz);
  knockAll(r, idx);
  or.fillStyle = '#000';
  or.fill(idx);

  // knurled focus ring, it turns as the lens focuses
  const knurl = annulus(CX, CY, r1, r2);
  knockAll(r, knurl, 'evenodd');
  gr.fillStyle = '#000';
  gr.fill(knurl, 'evenodd');
  fillT(r, bl, knurl, 0.5, 'evenodd');
  const fa = 0.5 * tween(t, 0.2, 0.9, ease.outCubic) - 0.35 * tween(t, 1.25, 1.95, ease.inOutCubic) + 0.3 * tween(t, 2.0, 2.5);
  const kn = new Path2D();
  for (let i = 0; i < 96; i++) {
    const a = fa + (i / 96) * TAU;
    kn.moveTo(CX + Math.cos(a) * (r1 + 8 * lz), CY + Math.sin(a) * (r1 + 8 * lz));
    kn.lineTo(CX + Math.cos(a) * (r2 - 8 * lz), CY + Math.sin(a) * (r2 - 8 * lz));
  }
  for (const c of [bl, gr]) {
    c.save();
    c.clip(knurl, 'evenodd');
    knockStroke(c, kn, 3.2 * lz);
    c.restore();
  }

  // front ring with engraved lettering
  const front = annulus(CX, CY, Rin, r1);
  knockAll(r, front, 'evenodd');
  for (const c of [bl, gr]) {
    c.fillStyle = '#000';
    c.fill(front, 'evenodd');
  }
  const txt = 'WINDOW SEAT  1:1.8  f=50mm  ∞  ';
  for (const c of r.layers) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.font = `700 ${15 * lz}px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const chars = Array.from(txt);
    const step = 0.052;
    chars.forEach((ch, i) => {
      const a = -Math.PI * 0.98 + i * step;
      c.save();
      c.translate(CX + Math.cos(a) * (Rin + 17 * lz), CY + Math.sin(a) * (Rin + 17 * lz));
      c.rotate(a + Math.PI / 2);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
  }

  // blades
  if (holeR < 334) drawIris(r, CX, CY, holeR * lz, Rin, holeRot, 1);

  // coating reflections on the glass
  const fade = 1 - seg(t, 2.4, 3.1);
  if (fade > 0) {
    const g1 = new Path2D();
    g1.arc(CX, CY, Rin * 0.8, Math.PI * 1.08, Math.PI * 1.36);
    const g2 = new Path2D();
    g2.arc(CX, CY, Rin * 0.66, Math.PI * 0.12, Math.PI * 0.32);
    const g3 = new Path2D();
    g3.arc(CX, CY, Rin * 0.9, Math.PI * 0.05, Math.PI * 0.45);
    for (const c of r.layers) knockStroke(c, g1, 12 * fade);
    knockStroke(bl, g2, 7 * fade);
    or.save();
    or.strokeStyle = r.tone(or, 0.7 * fade);
    or.lineWidth = 9;
    or.lineCap = 'round';
    or.stroke(g3);
    or.restore();
  }
};

/* ---------- cabin wall and windows (scene 2) ---------- */

const drawCabin = (r: Riso, s: State, t: number, ws: number, inner: Path2D, outer: Path2D, lensClip: Path2D | null) => {
  const [bl, or, gr, ye] = r.layers;
  const sideI: Path2D[] = [];
  const sideO: Path2D[] = [];
  for (const d of [-1, 1]) {
    const x = CX + d * SIDE_DX * ws;
    sideI.push(rrPath(x, CY, WIN_W * ws, WIN_H * ws, WIN_R * ws));
    sideO.push(rrPath(x, CY, (WIN_W + 96) * ws, (WIN_H + 96) * ws, (WIN_R + 48) * ws));
  }
  if (lensClip) for (const c of r.layers) {
    c.save();
    c.clip(lensClip);
  }
  // wall
  const holes = new Path2D();
  holes.addPath(outer);
  for (const p of sideO) holes.addPath(p);
  const wall = outside(holes);
  knockAll(r, wall, 'evenodd');
  fillT(r, bl, wall, 0.1, 'evenodd');
  gr.save();
  gr.clip(wall, 'evenodd');
  r.gradient(gr, null, { kind: 'linear', x0: 0, y0: CY - 500 * ws, x1: 0, y1: CY + 600 * ws, from: 0.0, to: 0.22 }, 7);
  gr.restore();
  // panel seams
  const seams = new Path2D();
  for (const d of [-1, 1]) {
    seams.moveTo(CX + d * 370 * ws, -100);
    seams.lineTo(CX + d * 370 * ws, 1000);
  }
  seams.moveTo(-100, CY + 420 * ws);
  seams.lineTo(1700, CY + 420 * ws);
  bl.save();
  bl.clip(wall, 'evenodd');
  bl.strokeStyle = r.tone(bl, 0.6);
  bl.lineWidth = 3 * ws;
  bl.stroke(seams);
  bl.restore();
  // bevels
  const bevels: [Path2D, Path2D][] = [[outer, inner], [sideO[0], sideI[0]], [sideO[1], sideI[1]]];
  for (const [o, i] of bevels) {
    const ring = new Path2D();
    ring.addPath(o);
    ring.addPath(i);
    knockAll(r, ring, 'evenodd');
    gr.save();
    gr.clip(ring, 'evenodd');
    r.gradient(gr, null, { kind: 'linear', x0: CX - 300 * ws, y0: CY - 340 * ws, x1: CX + 300 * ws, y1: CY + 340 * ws, from: 0.12, to: 0.6 }, 7);
    gr.restore();
    fillT(r, bl, ring, 0.22, 'evenodd');
    fillT(r, ye, ring, 0.2, 'evenodd');
    bl.save();
    bl.strokeStyle = '#000';
    bl.lineWidth = 6 * ws;
    bl.stroke(i);
    bl.strokeStyle = r.tone(bl, 0.6);
    bl.lineWidth = 2.5 * ws;
    bl.stroke(o);
    bl.restore();
    gr.save();
    gr.strokeStyle = '#000';
    gr.lineWidth = 3 * ws;
    gr.stroke(i);
    gr.restore();
  }
  // glint sweeping across the glass
  const gk = seg(t, 4.0, 6.8);
  if (gk > 0 && gk < 1) {
    const gx = lerp(CX - 520, CX + 520, ease.inOutSine(gk)) * 1;
    const band = new Path2D();
    const sk = 0.55;
    band.moveTo(gx - 50, CY - 400);
    band.lineTo(gx + 30, CY - 400);
    band.lineTo(gx + 30 - 800 * sk, CY + 400);
    band.lineTo(gx - 50 - 800 * sk, CY + 400);
    band.closePath();
    band.moveTo(gx + 60, CY - 400);
    band.lineTo(gx + 76, CY - 400);
    band.lineTo(gx + 76 - 800 * sk, CY + 400);
    band.lineTo(gx + 60 - 800 * sk, CY + 400);
    band.closePath();
    for (const c of r.layers) {
      c.save();
      c.clip(inner);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = r.tone(c, 0.42);
      c.fill(band);
      c.restore();
    }
  }
  void or;
  void s;
  if (lensClip) for (const c of r.layers) c.restore();
};

/* ---------- viewfinder (scene 4) ---------- */

const vfRect = (t: number) => {
  const k = tween(t, 12.0, 12.7, ease.inOutCubic);
  return { w: lerp(1900, VF_W, k), h: lerp(1150, VF_H, k), rad: lerp(90, 34, k), k };
};

const drawViewfinder = (r: Riso, t: number) => {
  const [bl, or, gr, ye] = r.layers;
  const { w, h, rad, k } = vfRect(t);
  const frame = rrPath(CX, CY, w, h, rad);
  const sur = outside(frame);
  fillT(r, bl, sur, 0.88, 'evenodd');
  fillT(r, gr, sur, 0.75, 'evenodd');
  // readout in the surround
  if (k > 0.6) {
    for (const c of r.layers) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.font = `700 22px ${MONO}`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('1/250   F8   ISO 100', CX - w / 2 + 6, CY + h / 2 + 30);
      c.textAlign = 'right';
      c.fillText('24', CX + w / 2 - 6, CY + h / 2 + 30);
      c.restore();
    }
    const meter = new Path2D();
    for (let i = -6; i <= 6; i++) {
      const x = CX + i * 14;
      meter.moveTo(x, CY + h / 2 + 22);
      meter.lineTo(x, CY + h / 2 + (i === 0 ? 44 : 36));
    }
    for (const c of r.layers) knockStroke(c, meter, 2.5);
    const dot = circ(CX + 28, CY + h / 2 + 52, 5);
    knockAll(r, dot);
    or.fillStyle = '#000';
    or.fill(dot);
  }
  // corner brackets
  const br = new Path2D();
  const ix = w / 2 - 30;
  const iy = h / 2 - 30;
  const L = 56;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    br.moveTo(CX + sx * ix, CY + sy * (iy - L));
    br.lineTo(CX + sx * ix, CY + sy * iy);
    br.lineTo(CX + sx * (ix - L), CY + sy * iy);
  }
  // focus box glides onto the traveller and confirms with two blinks
  const fk = tween(t, 12.6, 13.15, ease.inOutCubic);
  const m = viewM(t);
  const head = m.transformPoint(new DOMPoint(travellerFeet[0] - 4, travellerFeet[1] - 110));
  const fx = lerp(CX, head.x, fk);
  const fy = lerp(CY, head.y, fk);
  const blink = t > 13.15 && t < 13.55 && Math.floor((t - 13.15) / 0.1) % 2 === 0;
  const fb = new Path2D();
  const fs = lerp(70, 54, fk) + (blink ? -6 : 0);
  const fl = 18;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    fb.moveTo(fx + sx * fs, fy + sy * (fs - fl));
    fb.lineTo(fx + sx * fs, fy + sy * fs);
    fb.lineTo(fx + sx * (fs - fl), fy + sy * fs);
  }
  const op = clamp(k * 2 - 0.6);
  if (op > 0) {
    or.save();
    or.strokeStyle = '#000';
    or.lineCap = 'square';
    or.lineWidth = 6;
    or.stroke(br);
    if (t > 12.5) {
      or.lineWidth = 4;
      or.stroke(fb);
      if (blink) {
        ye.save();
        ye.strokeStyle = '#000';
        ye.lineWidth = 4;
        ye.stroke(fb);
        ye.restore();
      }
    }
    or.restore();
  }
  return frame;
};

/* ---------- the print (scene 5) ---------- */

const printM = (t: number) => {
  const k = tween(t, 14.35, 15.35, ease.outCubic);
  const ps = lerp(1, 0.46, k);
  const a = lerp(0, -0.05, k);
  const px = lerp(CX, 790, k);
  const py = lerp(CY, 392, k);
  return { m: new DOMMatrix().translate(px, py).rotate((a * 180) / Math.PI).scale(ps).translate(-CX, -CY), k };
};

const BORDER = 46;

const drawStackPhoto = (r: Riso, base: DOMMatrix, cx: number, cy: number, rot: number, kind: number) => {
  const [bl, or, gr, ye] = r.layers;
  const w = 560;
  const h = 330;
  const m = base.multiply(new DOMMatrix().translate(cx, cy).rotate((rot * 180) / Math.PI));
  for (const c of r.layers) c.setTransform(m);
  const outer = new Path2D();
  outer.rect(-w / 2 - 22, -h / 2 - 22, w + 44, h + 44);
  const sh = new Path2D();
  sh.rect(-w / 2 - 22 + 7, -h / 2 - 22 + 10, w + 44, h + 44);
  fillT(r, bl, sh, 0.5);
  knockAll(r, outer);
  const img = new Path2D();
  img.rect(-w / 2, -h / 2, w, h);
  if (kind === 0) {
    r.gradient(bl, img, { kind: 'linear', x0: 0, y0: -h / 2, x1: 0, y1: h / 2, from: 0.7, to: 0.2 }, 6);
    const cl = new Path2D();
    for (let i = 0; i < 9; i++) circ(-w / 2 + i * 70, h / 2 - 40 + (i % 2) * 14, 46, cl);
    cl.rect(-w / 2, h / 2 - 30, w, 30);
    for (const c of r.layers) {
      c.save();
      c.clip(img);
      knock(c, cl);
      c.restore();
    }
    const wing = polyPath([
      [-w / 2, h / 2 - 50],
      [w / 2 - 40, h / 2 - 110],
      [w / 2 - 20, h / 2 - 104],
      [-w / 2, h / 2 + 10],
    ]);
    c2(gr, wing, r, 0.6);
    c2(bl, wing, r, 0.4);
    ye.fillStyle = '#000';
    ye.fill(circ(w / 2 - 120, -h / 2 + 80, 34));
  } else {
    r.gradient(or, img, { kind: 'linear', x0: 0, y0: -h / 2, x1: 0, y1: h / 2, from: 0.25, to: 0.85 }, 6);
    fillT(r, ye, img, 0.55);
    const sun = circ(-60, 40, 60);
    knockAll(r, sun);
    ye.fillStyle = '#000';
    ye.fill(sun);
    const hills = new Path2D();
    hills.moveTo(-w / 2, h / 2);
    for (let x = -w / 2; x <= w / 2; x += 20) hills.lineTo(x, 70 + 34 * Math.sin(x / 70) + 14 * Math.sin(x / 23));
    hills.lineTo(w / 2, h / 2);
    hills.closePath();
    for (const c of r.layers) {
      c.save();
      c.clip(img);
    }
    gr.fillStyle = '#000';
    gr.fill(hills);
    fillT(r, bl, hills, 0.5);
    for (const c of r.layers) c.restore();
  }
};

const c2 = (c: Ctx, p: Path2D, r: Riso, d: number) => fillT(r, c, p, d);

const drawPrintScene = (r: Riso, s: State, t: number) => {
  const [bl, or, gr, ye] = r.layers;
  const base = new DOMMatrix().scale(r.scale, r.scale);
  for (const c of r.layers) c.setTransform(base);
  // table (cached per ink in setup)
  r.layers.forEach((c, i) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(s.table[i], 0, 0);
    c.setTransform(base);
  });

  // the stack waiting on the table
  drawStackPhoto(r, base, 735, 418, 0.075, 0);
  drawStackPhoto(r, base, 860, 380, -0.11, 1);
  for (const c of r.layers) c.setTransform(base);

  // the print itself
  const { m, k } = printM(t);
  const pm = base.multiply(m);
  for (const c of r.layers) c.setTransform(pm);
  const outer = new Path2D();
  outer.rect(CX - VF_W / 2 - BORDER, CY - VF_H / 2 - BORDER, VF_W + BORDER * 2, VF_H + BORDER * 2);
  const so = lerp(46, 16, k);
  const sh = new Path2D();
  sh.rect(CX - VF_W / 2 - BORDER + so * 0.7, CY - VF_H / 2 - BORDER + so, VF_W + BORDER * 2, VF_H + BORDER * 2);
  fillT(r, bl, sh, 0.55);
  fillT(r, gr, sh, 0.2);
  knockAll(r, outer);
  const img = new Path2D();
  img.rect(CX - VF_W / 2, CY - VF_H / 2, VF_W, VF_H);
  const vm = pm.multiply(viewM(T_FREEZE));
  for (const c of r.layers) {
    c.save();
    c.clip(img);
    c.setTransform(vm);
  }
  drawView(r, s, viewParams(T_FREEZE, t));
  for (const c of r.layers) c.restore();
  // a glint slides over the fresh print
  const gk = seg(t, 15.0, 16.0);
  if (gk > 0 && gk < 1) {
    const gx = lerp(CX - 1100, CX + 1300, ease.inOutSine(gk));
    const band = new Path2D();
    band.moveTo(gx, CY - 420);
    band.lineTo(gx + 160, CY - 420);
    band.lineTo(gx - 240, CY + 420);
    band.lineTo(gx - 400, CY + 420);
    band.closePath();
    for (const c of r.layers) {
      c.save();
      c.clip(img);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = r.tone(c, 0.3);
      c.fill(band);
      c.restore();
    }
  }

  // stamp lands on the corner
  const sk = seg(t, 15.2, 15.75);
  if (sk > 0) {
    const e = ease.outBack(sk);
    const sx = lerp(1420, 1046, e);
    const sy = lerp(-160, 250, e);
    const rot = lerp(0.7, 0.09, e);
    const sc = lerp(1.4, 1, ease.outCubic(sk));
    const smat = base.multiply(new DOMMatrix().translate(sx, sy).rotate((rot * 180) / Math.PI).scale(sc));
    for (const c of r.layers) c.setTransform(smat);
    const shp = new Path2D();
    shp.addPath(s.stamp, new DOMMatrix().translate(5, 7));
    fillT(r, bl, shp, 0.45);
    knockAll(r, s.stamp);
    // inner art: a tiny airplane window with sun and peaks
    const win = s.stampWin;
    fillT(r, ye, win, 0.7);
    r.gradient(or, win, { kind: 'linear', x0: 0, y0: -50, x1: 0, y1: 40, from: 0.15, to: 0.7 }, 5);
    const sun = circ(8, -6, 17);
    for (const c of r.layers) {
      c.save();
      c.clip(win);
    }
    knockAll(r, sun);
    ye.fillStyle = '#000';
    ye.fill(sun);
    const mt = polyPath([
      [-60, 40],
      [-30, 2],
      [-14, 18],
      [6, -10],
      [36, 26],
      [60, 10],
      [60, 80],
      [-60, 80],
    ]);
    gr.fillStyle = '#000';
    gr.fill(mt);
    const lk = new Path2D();
    lk.rect(-60, 38, 120, 40);
    knockAll(r, lk);
    fillT(r, bl, lk, 0.7);
    for (const c of r.layers) c.restore();
    gr.save();
    gr.strokeStyle = '#000';
    gr.lineWidth = 3;
    gr.stroke(win);
    gr.fillStyle = '#000';
    gr.font = `700 13px ${MONO}`;
    gr.textAlign = 'center';
    gr.textBaseline = 'middle';
    gr.fillText('AIR MAIL', 0, 62);
    gr.restore();
  }

  // postmark
  const pk = seg(t, 15.6, 15.85);
  if (pk > 0) {
    const pmx = 930;
    const pmy = 318;
    const sc = lerp(1.3, 1, ease.outCubic(pk));
    for (const c of r.layers) c.setTransform(base.multiply(new DOMMatrix().translate(pmx, pmy).rotate(-8).scale(sc)));
    bl.save();
    bl.strokeStyle = '#000';
    bl.lineWidth = 3.5;
    bl.stroke(circ(0, 0, 54));
    bl.lineWidth = 2;
    bl.stroke(circ(0, 0, 44));
    bl.fillStyle = '#000';
    bl.font = `900 20px ${DISPLAY}`;
    bl.textAlign = 'center';
    bl.textBaseline = 'middle';
    bl.fillText('BAKU', 0, -10);
    bl.font = `700 14px ${MONO}`;
    bl.fillText('· DTW ·', 0, 14);
    // cancellation waves draw out to the left
    const wk = seg(t, 15.7, 16.1);
    const waves = new Path2D();
    for (let j = 0; j < 4; j++) {
      const y = -30 + j * 20;
      waves.moveTo(-64, y);
      for (let x = -64; x >= -64 - 240 * wk; x -= 6) waves.lineTo(x, y + Math.sin(x / 14) * 5);
    }
    bl.lineWidth = 3;
    bl.lineCap = 'round';
    bl.stroke(waves);
    bl.restore();
  }

  // title
  const tk = tween(t, 15.9, 16.45, ease.outCubic);
  if (tk > 0) {
    for (const c of r.layers) c.setTransform(base);
    const clipR = new Path2D();
    clipR.rect(0, 640, 1600, 140);
    gr.save();
    gr.clip(clipR);
    gr.translate(0, (1 - tk) * 90);
    gr.fillStyle = '#000';
    gr.font = `900 58px ${DISPLAY}`;
    gr.textAlign = 'left';
    gr.textBaseline = 'alphabetic';
    spacedText(gr, 'WINDOW SEAT', 800, 712, 9);
    gr.restore();
    const ck = tween(t, 16.05, 16.6, ease.outCubic);
    bl.save();
    bl.clip(clipR);
    bl.translate(0, (1 - ck) * 70);
    bl.fillStyle = '#000';
    bl.font = `italic 500 28px ${SERIF}`;
    bl.textAlign = 'center';
    bl.fillText('photos from wherever I land', 800, 756);
    bl.restore();
    const rule = new Path2D();
    rule.rect(800 - 150 * ck, 728, 300 * ck, 3);
    or.fillStyle = '#000';
    or.fill(rule);
  }
};

/* ---------- film ---------- */

export const windowSeatFilm: RisoFilm<State> = {
  id: 'window-seat',
  title: 'Window Seat',
  caption: 'An aperture that keeps opening: lens, airplane window, viewfinder, print.',
  theme: 'Travel & Photos',
  motif: 'The aperture / a rounded window frame',
  duration: 18,
  paper: '#f3ead8',
  inks: [
    { color: '#62a8e5', offset: [1.4, -1], angle: 15 },
    { color: '#ff6c2f', offset: [-1.2, 0.9], angle: 75 },
    { color: '#407060', offset: [0, 0], angle: 45 },
    { color: '#ffe800', offset: [0.8, 1.2], angle: 0 },
  ],
  scenes: [
    { at: 0, label: 'Lens' },
    { at: 3.4, label: 'Window seat' },
    { at: 7.4, label: 'Descent' },
    { at: 11.2, label: 'Viewfinder' },
    { at: 14.0, label: 'Print' },
  ],
  posterTime: 11.3,

  setup(r) {
    const big = new Path2D();
    big.rect(-3000, -3000, 7600, 6900);

    /* ridges */
    const mkRidge = (
      seed: number,
      base: number,
      peaks: number,
      hMin: number,
      hMax: number,
      valley: number,
      valleyDrop: number,
      xv: number,
      rough: number,
      drop: number,
      speed: number,
      k: number,
      snowAt: number,
      pines: number
    ): Ridge => {
      const rng = mulberry(seed);
      const pk = Array.from({ length: peaks }, () => ({
        c: -700 + rng() * 3200,
        h: lerp(hMin, hMax, rng()),
        sl: 0.55 + rng() * 0.65,
        skew: 0.65 + rng() * 0.7,
      }));
      const xVal = xv + speed * 0; // final coordinates
      const top: Pt[] = [];
      const hAt: number[] = [];
      for (let x = -800; x <= 2600; x += 7) {
        let h = 0;
        for (const p of pk) {
          const dx = x - p.c;
          const sl = dx < 0 ? p.sl * p.skew : p.sl;
          h = Math.max(h, p.h - Math.abs(dx) * sl);
        }
        h += rough * (noise1(x / 31, seed) * 0.65 + noise1(x / 9, seed + 3) * 0.35) + 16 * noise1(x / 240, seed + 5);
        const ve = Math.exp(-(((x - xVal) / 300) ** 2));
        h = Math.max(4, h) * (1 - valley * ve) - valleyDrop * ve;
        top.push([x, base - h]);
        hAt.push(h);
      }
      const path = polyPath([...top, [2600, base + 1600], [-800, base + 1600]]);
      if (pines > 0) {
        for (let i = 0; i < pines; i++) {
          const j = Math.floor(rng() * top.length);
          const [x, y] = top[j];
          if (Math.abs(x - xVal) < 260) continue;
          const ph = (0.6 + rng() * 0.6) * (k > 0.9 ? 70 : 40);
          const yb = y + 6;
          polyPath(
            [
              [x, yb - ph],
              [x + ph * 0.16, yb - ph * 0.62],
              [x + ph * 0.09, yb - ph * 0.6],
              [x + ph * 0.26, yb - ph * 0.26],
              [x + ph * 0.14, yb - ph * 0.25],
              [x + ph * 0.32, yb],
              [x - ph * 0.32, yb],
              [x - ph * 0.14, yb - ph * 0.25],
              [x - ph * 0.26, yb - ph * 0.26],
              [x - ph * 0.09, yb - ph * 0.6],
              [x - ph * 0.16, yb - ph * 0.62],
            ],
            true,
            path
          );
        }
      }
      let snow: Path2D | null = null;
      if (snowAt > 0) {
        const sp: Pt[] = [];
        for (let x = -800; x <= 2600; x += 7) sp.push([x, base - snowAt + 14 * noise1(x / 13, seed + 9) + 8 * noise1(x / 4, seed + 2)]);
        snow = polyPath([...sp, [2600, -2000], [-800, -2000]]);
      }
      return { path, snow, base, top: base - hMax, drop, speed, k };
    };
    const ridges = [
      mkRidge(11, 500, 16, 110, 235, 0.55, 0, 790, 10, 60, 4, 0, 150, 0),
      mkRidge(23, 572, 14, 80, 170, 0.9, 30, 780, 9, 220, 9, 0.25, 118, 0),
      mkRidge(37, 645, 12, 50, 130, 1, 125, 760, 8, 330, 15, 0.5, 0, 26),
      mkRidge(41, 735, 10, 40, 110, 1, 40, 820, 7, 480, 24, 0.75, 0, 40),
      mkRidge(53, 838, 9, 30, 95, 0.9, 0, 640, 6, 650, 36, 1, 0, 34),
    ];

    /* lake */
    const lake = smoothPath(wobble(ellipsePts(770, 668, 470, 72, 64), 5, 3, 5));

    /* cloud sea: a band with a puffy top and a hanging, shaded underside */
    const srng0 = mulberry(5);
    const bottom: Pt[] = [];
    {
      const cs: [number, number][] = [];
      for (let x = 2700; x >= -1100; ) {
        const rad = 40 + srng0() * 60;
        cs.push([x, rad]);
        x -= rad * (1.1 + srng0() * 0.5);
      }
      for (let x = 2700; x >= -1100; x -= 6) {
        let y = 440;
        for (const [cx, rr] of cs) {
          const dx = x - cx;
          if (Math.abs(dx) < rr) y = Math.max(y, 440 + Math.sqrt(rr * rr - dx * dx) * 0.7 - rr * 0.25);
        }
        bottom.push([x, y + 26 * noise1(x / 210, 8)]);
      }
    }
    const sea: Path2D[] = [];
    const seaAll = new Path2D();
    for (let ri = 0; ri < 3; ri++) {
      const yOff = ri * 70;
      const cs: [number, number, number][] = [];
      for (let x = -1100; x <= 2700; ) {
        const rad = 34 + srng0() * 52;
        cs.push([x, yOff + noise1(x / 160, 5 + ri) * 24, rad]);
        x += rad * (0.9 + srng0() * 0.5);
      }
      const pts: Pt[] = [];
      for (let x = -1100; x <= 2700; x += 5) {
        let y = yOff + 30;
        for (const [cx, cy, rr] of cs) {
          const dx = x - cx;
          if (Math.abs(dx) < rr) y = Math.min(y, cy - Math.sqrt(rr * rr - dx * dx));
        }
        pts.push([x, y]);
      }
      const row = polyPath([...pts, ...bottom]);
      sea.push(row);
      if (ri === 0) seaAll.addPath(row);
    }

    /* puffs */
    const prng = mulberry(77);
    const puffs: Puff[] = [];
    const spots: [number, number, number][] = [
      [700, 420, 0.8],
      [1180, 380, 0.6],
      [300, 330, 0.7],
      [1500, 450, 0.9],
      [950, 250, 0.45],
    ];
    for (const [x, y, sc] of spots) {
      const p = new Path2D();
      const n = 4 + Math.floor(prng() * 3);
      for (let i = 0; i < n; i++) {
        const cx = (i - (n - 1) / 2) * 52 + prng() * 14;
        const rr = 36 + prng() * 30 - Math.abs(i - (n - 1) / 2) * 6;
        circ(cx, -rr * 0.6, rr, p);
      }
      p.rect(-(n * 52) / 2, -14, n * 52, 26);
      puffs.push({ path: p, x, y, sp: 22 + prng() * 26, s: sc });
    }

    /* wing */
    const wing = polyPath([
      [-200, 712],
      [700, 652],
      [1060, 610],
      [1100, 606],
      [1116, 616],
      [1100, 628],
      [760, 712],
      [-200, 900],
    ]);
    const wingEdge = polyPath([
      [-200, 712],
      [700, 652],
      [1060, 610],
      [1062, 617],
      [700, 662],
      [-200, 726],
    ]);
    const flaps = new Path2D();
    flaps.moveTo(-100, 860);
    flaps.lineTo(760, 704);
    for (const x of [120, 380, 620]) {
      const y = 860 - ((x + 100) / 860) * 156;
      flaps.moveTo(x, y);
      flaps.lineTo(x - 10, y + 30);
    }
    const winglet = polyPath([
      [1084, 608],
      [1112, 528],
      [1126, 530],
      [1116, 614],
    ]);
    const engine = new Path2D();
    engine.moveTo(150, 760);
    engine.lineTo(330, 744);
    engine.quadraticCurveTo(352, 770, 330, 800);
    engine.lineTo(150, 820);
    engine.closePath();

    /* cliff */
    const cliffTop: Pt[] = [
      [1020, 646],
      [1045, 628],
      [1080, 618],
      [1120, 614],
      [1170, 612],
      [1230, 606],
      [1300, 598],
      [1380, 592],
      [1460, 580],
      [1560, 570],
      [1700, 560],
      [1900, 556],
    ];
    const cliffFace: Pt[] = [
      [1900, 1400],
      [1080, 1400],
      [1060, 1120],
      [1088, 980],
      [1046, 870],
      [1072, 772],
      [1036, 706],
      [1026, 668],
    ];
    const cliff = polyPath(wobble([...cliffTop, ...cliffFace], 2, 4, 9));
    const cliffRim = polyPath(cliffTop.slice(0, 8), false);
    const strata = new Path2D();
    const srng = mulberry(19);
    for (let i = 0; i < 14; i++) {
      const y = 650 + i * 26 + srng() * 14;
      const x0 = 1075 + srng() * 120 + (i % 3) * 60;
      const len = 50 + srng() * 150;
      strata.moveTo(x0, y);
      strata.quadraticCurveTo(x0 + len * 0.5, y - 6 - srng() * 6, x0 + len, y - 12 - srng() * 8);
    }
    const tufts = new Path2D();
    for (let i = 0; i < 26; i++) {
      const x = 1060 + i * 30 + srng() * 12;
      const tp = cliffTop.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
      const y = tp[1] + 2;
      tufts.moveTo(x, y);
      tufts.lineTo(x - 5, y - 10 - srng() * 6);
      tufts.moveTo(x, y);
      tufts.lineTo(x + 4, y - 12 - srng() * 6);
    }

    /* aperture -> window morphs */
    const hRot = -Math.PI / 2 + 0.25;
    const hept = morphPair(polyN(CX, CY, 335, 7, hRot), rrPts(CX, CY, WIN_W, WIN_H, WIN_R), 180);
    const heptO = morphPair(polyN(CX, CY, 335 + 60, 7, hRot), rrPts(CX, CY, WIN_W + 96, WIN_H + 96, WIN_R + 48), 180);

    /* wood grain */
    const grain = new Path2D();
    const grng = mulberry(3);
    for (let i = 0; i < 16; i++) {
      const y0 = 20 + i * 58 + grng() * 20;
      grain.moveTo(-20, y0);
      for (let x = -20; x <= 1620; x += 20) grain.lineTo(x, y0 + 9 * noise1(x / 180, i) + 4 * noise1(x / 40, i + 30));
    }

    const stamp = polyPath(perfPts(128, 158, 5.5, 15));
    const stampWin = rrPath(0, -6, 92, 112, 40);

    /* table top, one canvas per ink */
    const table = [BL, OR, GR, YE].map((ink) => {
      const { canvas, ctx } = r.scratch(1600, 900);
      const all = new Path2D();
      all.rect(-50, -50, 1700, 1000);
      const ring = (inner: number, outer: number, d: number) => {
        if (d <= 0.012) return;
        const p = circ(800, 420, outer);
        if (inner > 0) circ(800, 420, inner, p);
        ctx.fillStyle = r.tone(ctx, d, ink);
        ctx.fill(p, 'evenodd');
      };
      const vign = (r0: number, r1: number, to: number, steps: number) => {
        for (let j = 0; j < steps; j++) {
          const a = r0 + ((r1 - r0) * j) / steps;
          ring(a, a + (r1 - r0) / steps, (to * (j + 0.5)) / steps);
        }
        ring(r1, 3000, to);
      };
      if (ink === OR) {
        ctx.fillStyle = r.tone(ctx, 0.2, ink);
        ctx.fill(all);
        ctx.strokeStyle = r.tone(ctx, 0.5, ink);
        ctx.lineWidth = 2;
        ctx.stroke(grain);
      } else if (ink === YE) {
        ctx.fillStyle = r.tone(ctx, 0.36, ink);
        ctx.fill(all);
      } else if (ink === BL) vign(380, 1050, 0.3, 14);
      else vign(600, 1100, 0.16, 8);
      return canvas;
    });

    return {
      table,
      big,
      ridges,
      lake,
      lakeDrop: 300,
      lakeSpeed: 13,
      sea,
      seaAll,
      puffs,
      wing,
      wingEdge,
      flaps,
      winglet,
      engine,
      cliff,
      cliffRim,
      strata,
      tufts,
      hept,
      heptO,
      grain,
      stamp,
      stampWin,
    };
  },

  draw(r, t, s) {
    const base = new DOMMatrix().scale(r.scale, r.scale);
    const L = r.layers;

    if (t < T_SWAP) {
      const vp = viewParams(t);
      /* frame shapes for this moment */
      let holeR = 335;
      let holeRot = -Math.PI / 2 + 0.25;
      if (t < T_MORPH0) {
        const R1 = lerp(70, 215, tween(t, 0.0, 0.9, ease.outCubic));
        const R2 = lerp(R1, 112, tween(t, 1.25, 1.85, ease.inOutCubic));
        holeR = lerp(R2, 335, tween(t, 1.95, 2.5, ease.inOutCubic));
        holeRot = -Math.PI / 2 + 0.25 + (1 - holeR / 335) * 0.9;
      }
      const lz =
        lerp(0.94, 1, tween(t, 0, T_MORPH0, ease.outSine)) * (1 + 3.8 * tween(t, 2.6, 3.9, ease.inCubic));
      const ws = 1 + 6.5 * tween(t, 7.4, 9.0, ease.inCubic);
      const showCabin = t >= T_MORPH0 && ws < 6.9;
      const showLens = t < 3.95;
      const showVF = t >= 12.0;

      let inner: Path2D;
      let outer: Path2D;
      if (t < T_MORPH0) {
        inner = polyPath(polyN(CX, CY, holeR * lz, 7, holeRot));
        outer = inner;
      } else if (t < T_MORPH1) {
        const mk = tween(t, T_MORPH0, T_MORPH1, ease.inOutCubic);
        inner = polyPath(morph(s.hept[0], s.hept[1], mk));
        outer = polyPath(morph(s.heptO[0], s.heptO[1], mk));
      } else {
        inner = rrPath(CX, CY, WIN_W * ws, WIN_H * ws, WIN_R * ws);
        outer = rrPath(CX, CY, (WIN_W + 96) * ws, (WIN_H + 96) * ws, (WIN_R + 48) * ws);
      }

      let clip: Path2D | null = null;
      if (t < T_MORPH0) clip = inner;
      else if (showCabin) {
        clip = new Path2D();
        clip.addPath(inner);
        for (const d of [-1, 1]) rrPath(CX + d * SIDE_DX * ws, CY, WIN_W * ws, WIN_H * ws, WIN_R * ws, clip);
      }
      if (showVF) {
        const v = vfRect(t);
        clip = rrPath(CX, CY, v.w, v.h, v.rad);
      }

      const vm = base.multiply(viewM(t));
      for (const c of L) {
        c.save();
        c.setTransform(base);
        if (clip) c.clip(clip);
        c.setTransform(vm);
      }
      drawView(r, s, vp);
      for (const c of L) c.restore();
      for (const c of L) c.setTransform(base);

      if (showCabin) {
        const lensClip = showLens ? circ(CX, CY, 300 * lz) : null;
        drawCabin(r, s, t, ws, inner, outer, lensClip);
      }
      if (showLens) drawLens(r, t, lz, t < T_MORPH0 ? holeR : 400, holeRot);
      if (showVF) drawViewfinder(r, t);
    } else {
      drawPrintScene(r, s, t);
    }

    /* shutter */
    if (t > T_SHUT0 && t < T_SHUT1) {
      for (const c of L) c.setTransform(base);
      const RB = 1150;
      const R =
        t < T_SHUT_CLOSED
          ? lerp(RB, 0, tween(t, T_SHUT0, T_SHUT_CLOSED, ease.inCubic))
          : lerp(0, RB, tween(t, 14.0, T_SHUT1, ease.outCubic));
      const rot = -Math.PI / 2 + (1 - R / RB) * 1.3;
      drawIris(r, CX, CY, R, RB, rot, 0.6);
    }
  },
};
