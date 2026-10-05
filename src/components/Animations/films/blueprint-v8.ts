import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { mulberry, clamp, lerp, seg, tween, ease, morphPair, TAU, type Pt } from '../riso/kit';
import {
  BP,
  BP_INKS,
  DASH,
  pen,
  px,
  stroke,
  drawOn,
  circle,
  line,
  wash,
  hatch,
  dim,
  dimChain,
  callout,
  centreMark,
  arrowHead,
  letter,
  makeSheet,
  sheetUnder,
  sheetOver,
  grid,
  border,
  flare,
  partial,
  splinePts,
  arcPts,
  revCloud,
  stamp,
  GOTHIC,
  type Sheet,
} from '../styles/blueprint';

/*
 * Motor City V8. A crankshaft is drawn in plan, the camera tracking along its axis; the view
 * swings up into a 3/4 isometric exploded V8 that collapses together. Ignition: cylinders light
 * in firing order, pistons blur, exhaust pulses down the pipes, the tach needle swings. The
 * camera dives along the crank axis onto the front pulley, which spins up into a mag wheel:
 * the hero. Pulling back, a fastback muscle car is drawn around that wheel and its front and
 * plan views assemble like a spec sheet, stamped approved. The plan view drops onto a street
 * map of Woodward Ave and drives north past the mile roads, pulls to the kerb under a lamp,
 * and the plan folds back into the side elevation for the title block.
 * Motif: the circle (crank, pulley, wheel).
 */

const DURATION = 20;

/* ---------- timeline ---------- */
const T_SWING = 2.5;
const T_EXPL = 4.6;
const T_COLLAPSE = 5.7;
const T_IGN = 7.0;
const T_DIVE = 9.7;
const T_HERO = 10.9;
const T_SPEC = 12.4;
const T_MAP = 15.1;
const T_DRIVE = 15.8;
const T_PARK = 17.0;
const T_FOLD = 17.6;
const T_TITLE = 18.0;

/* ---------- engine dimensions (3D, y up, z along the crank, +z = front) ---------- */
const THROW = 40;
const ROD = 170;
const R45 = Math.SQRT1_2;
const FIRING = [1, 8, 4, 3, 6, 5, 7, 2];
interface Cyl {
  n: number;
  side: number; // -1 left bank, +1 right
  z: number;
  phase: number;
}
const CYLS: Cyl[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
  const side = n % 2 ? -1 : 1;
  const row = Math.floor((n - 1) / 2);
  return { n, side, z: 200 - row * 130 + (side > 0 ? 25 : 0), phase: FIRING.indexOf(n) * (Math.PI / 2) };
});

/* ---------- car dimensions (2D side elevation, front wheel centre at 0,0, facing right) ---------- */
const TYRE = 100;
const BODY_Y = 1.42; // vertical stretch of the side and front elevations above the wheel centre
const RIM = 78;
const WB = 860;
const GROUND = 100;
const FRONT_X = 720; // front view centre
const TOP_Y = 560; // plan view centre line
const CAR_MID = -410; // car centre along x (side coords)
const PARK_X = 12800;
const LANE_Y = TOP_Y;
const CURB_LANE = TOP_Y + 1275;

interface State {
  sheet: Sheet;
  theta: Float32Array;
  side: Pt[];
  top: Pt[];
  foldA: Pt[];
  foldB: Pt[];
  sideGlass: Pt[];
  map: { minor: Path2D; mile: Path2D; road: Path2D; lanes: Path2D; blocks: Path2D; park: Path2D; trees: Path2D; lamps: Path2D };
  labels: { text: string; x: number; y: number; rot: number; size: number }[];
}

const STEP = 1 / 240;

/* ---------- motion ---------- */

const omega = (t: number) => {
  const crank = 3.2 * tween(t, T_IGN, T_IGN + 0.5, ease.inOutSine);
  const rev = 13 * tween(t, T_IGN + 0.9, T_IGN + 2.1, ease.inOutCubic);
  const blip = 4 * tween(t, T_HERO - 0.2, T_HERO + 0.4, ease.inOutSine);
  const stop = 1 - tween(t, T_HERO + 1.0, T_SPEC + 0.9, ease.inOutSine);
  return (crank + rev + blip) * stop;
};
const sample = (tab: Float32Array, t: number) => {
  const f = clamp(t, 0, DURATION) / STEP;
  const i = Math.min(tab.length - 2, Math.floor(f));
  return lerp(tab[i], tab[i + 1], f - i);
};

/* ---------- 3D wireframe projector ---------- */

type V3 = [number, number, number];
let cyw = 1;
let syw = 0;
let cpt = 1;
let spt = 0;
const setView = (yaw: number, pitch: number) => {
  cyw = Math.cos(yaw);
  syw = Math.sin(yaw);
  cpt = Math.cos(pitch);
  spt = Math.sin(pitch);
};
const P3 = (v: V3): Pt => {
  const x1 = v[0] * cyw + v[2] * syw;
  const z1 = -v[0] * syw + v[2] * cyw;
  const y2 = v[1] * cpt - z1 * spt;
  return [x1, -y2];
};
const D3 = (v: V3): number => {
  const z1 = -v[0] * syw + v[2] * cyw;
  return v[1] * spt + z1 * cpt;
};
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

interface Part {
  lines: Pt[][];
  closed: boolean[];
  hull: Pt[];
  depth: number;
  fill: number;
  washA: number;
  w: number;
  k: number;
  alpha: number;
  color?: string;
  dash?: number[];
  hatch?: boolean;
  glow?: number;
}

const hullOf = (pts: Pt[]): Pt[] => {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
};

/** Two unit vectors perpendicular to axis */
const basis = (a: V3): [V3, V3] => {
  const ref: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u: V3 = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
  const ul = Math.hypot(...u) || 1;
  const uu = mul(u, 1 / ul);
  const v: V3 = [a[1] * uu[2] - a[2] * uu[1], a[2] * uu[0] - a[0] * uu[2], a[0] * uu[1] - a[1] * uu[0]];
  return [uu, v];
};
const ring3 = (c: V3, a: V3, r: number, n = 22): V3[] => {
  const [u, v] = basis(a);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    return add(add(c, u, Math.cos(t) * r), v, Math.sin(t) * r);
  });
};

/** Cylinder from c0 along unit axis a, length len: two rings and two silhouette edges */
const cylPart = (c0: V3, a: V3, r: number, len: number, extra: Partial<Part> = {}, rings: number[] = []): Part => {
  const r0 = ring3(c0, a, r);
  const c1 = add(c0, a, len);
  const r1 = ring3(c1, a, r);
  const p0 = r0.map(P3);
  const p1 = r1.map(P3);
  const lines: Pt[][] = [p0, p1];
  const closed = [true, true];
  for (const f of rings) {
    lines.push(ring3(add(c0, a, len * f), a, r).map(P3));
    closed.push(true);
  }
  const A = P3(c0);
  const B = P3(c1);
  const ax = B[0] - A[0];
  const ay = B[1] - A[1];
  const al = Math.hypot(ax, ay);
  if (al > 0.5) {
    const nx = -ay / al;
    const ny = ax / al;
    let iMax = 0;
    let iMin = 0;
    let dMax = -Infinity;
    let dMin = Infinity;
    p0.forEach((q, i) => {
      const d = (q[0] - A[0]) * nx + (q[1] - A[1]) * ny;
      if (d > dMax) {
        dMax = d;
        iMax = i;
      }
      if (d < dMin) {
        dMin = d;
        iMin = i;
      }
    });
    lines.push([p0[iMax], p1[iMax]], [p0[iMin], p1[iMin]]);
    closed.push(false, false);
  }
  return {
    lines,
    closed,
    hull: hullOf(p0.concat(p1)),
    depth: D3(add(c0, a, len / 2)),
    fill: 0.9,
    washA: 0.1,
    w: 1.8,
    k: 1,
    alpha: 1,
    ...extra,
  };
};

/** Box from corner o along edge vectors ex, ey, ez */
const boxPart = (o: V3, ex: V3, ey: V3, ez: V3, extra: Partial<Part> = {}, more: V3[][] = []): Part => {
  const c = [o, add(o, ex), add(add(o, ex), ey), add(o, ey)];
  const top = c.map((q) => add(q, ez));
  const pc = c.map(P3);
  const pt = top.map(P3);
  const lines: Pt[][] = [pc, pt, [pc[0], pt[0]], [pc[1], pt[1]], [pc[2], pt[2]], [pc[3], pt[3]]];
  const closed = [true, true, false, false, false, false];
  for (const m of more) {
    lines.push(m.map(P3));
    closed.push(false);
  }
  const centre = add(add(add(o, ex, 0.5), ey, 0.5), ez, 0.5);
  return { lines, closed, hull: hullOf(pc.concat(pt)), depth: D3(centre), fill: 0.9, washA: 0.08, w: 2, k: 1, alpha: 1, ...extra };
};

let FILLK = 1;
const drawPart = (c: Ctx, p: Part) => {
  const A = p.alpha;
  if (A <= 0.01 || p.k <= 0) return;
  if (p.hull.length > 2 && p.fill > 0) {
    const hp = new Path2D();
    hp.moveTo(p.hull[0][0], p.hull[0][1]);
    for (let i = 1; i < p.hull.length; i++) hp.lineTo(p.hull[i][0], p.hull[i][1]);
    hp.closePath();
    c.save();
    c.globalAlpha = A * p.fill * FILLK * clamp(p.k * 2);
    c.fillStyle = BP.paper;
    c.fill(hp);
    c.restore();
    wash(c, hp, p.washA * A * p.k);
  }
  const path = new Path2D();
  for (let i = 0; i < p.lines.length; i++) partial(p.lines[i], p.k, p.closed[i], path);
  stroke(c, path, { w: p.w, alpha: A, color: p.color, dash: p.dash, glow: p.glow });
};

/* ---------- engine ---------- */

const bankAxes = (side: number) => {
  const u: V3 = [side * R45, R45, 0];
  // w lies in the cross-section plane, perpendicular to u, pointing into the valley
  const w: V3 = side < 0 ? [R45, R45, 0] : [-R45, R45, 0];
  return { u, w };
};
const bankPt = (side: number, a: number, b: number, z: number, shift = 0): V3 => {
  const { u, w } = bankAxes(side);
  return [u[0] * (a + shift) + w[0] * b, u[1] * (a + shift) + w[1] * b, z];
};
const pinAngle = (th: number, cy: Cyl) => th - cy.phase + cy.side * (Math.PI / 4);
const pistonS = (th: number, cy: Cyl) => {
  const phi = th - cy.phase;
  const s = Math.sin(phi);
  return THROW * Math.cos(phi) + Math.sqrt(ROD * ROD - THROW * THROW * s * s);
};
/** Combustion glow for cylinder: decays over the power stroke after each firing */
const burnOf = (th: number, cy: Cyl, thIgn: number) => {
  let a = (th - cy.phase) % (2 * TAU);
  if (a < 0) a += 2 * TAU;
  if (th - a < thIgn) return 0;
  return a < 2.2 ? Math.pow(1 - a / 2.2, 1.3) : 0;
};

interface EngineFrame {
  parts: Part[];
  overlays: (() => void)[];
}

const buildEngine = (c: Ctx, t: number, th: number, thIgn: number, xray: number, fade: number): EngineFrame => {
  const parts: Part[] = [];
  const overlays: (() => void)[] = [];
  // Explode: partial in plan, full in the 3/4 swing, collapse after
  const e = lerp(0.35, 1, tween(t, T_SWING - 0.2, T_EXPL - 0.3, ease.inOutSine)) * (1 - tween(t, T_COLLAPSE, T_COLLAPSE + 1.3, ease.inOutCubic));
  const ex = (lag: number) => clamp(e * (1 + lag * 0));
  const kCrank = seg(t, 0.15, 1.2);
  const kPis = seg(t, 0.7, 1.7);
  const kBank = seg(t, 0.9, 1.9);
  const kHead = seg(t, 1.25, 2.25);
  const kTop = seg(t, 1.6, 2.5);
  const kPan = seg(t, 1.7, 2.6);
  const kFront = seg(t, 1.1, 2.0);
  const blockFill = lerp(0.85, 0.08, xray);
  const A = fade;

  const dCrank = -100 * ex(0);
  const dPis = 130 * ex(0.1);
  const dHead = 190 * ex(0.15);
  const dTop = 150 * ex(0.2);
  const dPan = -170 * ex(0.1);
  const dFront = 150 * ex(0.1);

  /* crankshaft */
  const cy0: V3 = [0, dCrank, 0];
  parts.push(cylPart(add(cy0, [0, 0, -300]), [0, 0, 1], 28, 620, { k: kCrank, alpha: A, w: 1.8, washA: 0.14 }));
  parts.push(cylPart(add(cy0, [0, 0, -318]), [0, 0, 1], 132, 20, { k: kCrank, alpha: A, w: 2, washA: 0.08 }, [0.5]));
  for (const cy of CYLS) {
    const pa = pinAngle(th, cy);
    const pin: V3 = add(cy0, [Math.sin(pa) * THROW, Math.cos(pa) * THROW, cy.z - 12]);
    parts.push(cylPart(add(cy0, [0, 0, cy.z - 30]), [0, 0, 1], 64, 14, { k: kCrank, alpha: A, w: 1.4, washA: 0.12 }));
    parts.push(cylPart(pin, [0, 0, 1], 20, 26, { k: kCrank, alpha: A, w: 1.3, washA: 0.2 }));
  }

  /* pistons and rods */
  for (const cy of CYLS) {
    const { u } = bankAxes(cy.side);
    const s = pistonS(th, cy);
    const pa = pinAngle(th, cy);
    const pinC: V3 = add(cy0, [Math.sin(pa) * THROW, Math.cos(pa) * THROW, cy.z + 1]);
    const base: V3 = bankPt(cy.side, s - 36, 0, cy.z, dPis);
    parts.push(cylPart(base, u, 48, 82, { k: kPis, alpha: A, w: 1.7, washA: 0.16 }, [0.72, 0.8, 0.88]));
    const small = bankPt(cy.side, s, 0, cy.z, dPis);
    const big = add(pinC, u, dPis);
    const rp = [P3(big), P3(small)];
    parts.push({ lines: [rp], closed: [false], hull: [], depth: D3(small) - 1, fill: 0, washA: 0, w: 3.2, k: kPis, alpha: A * 0.9 });
    // Motion blur ghosts of the piston crown
    const om = omega(t);
    if (om > 2 && fade > 0.05) {
      const ghosts: Pt[][] = [];
      for (let g = 1; g <= 3; g++) {
        const thg = th - om * 0.011 * g * 2;
        const sg = pistonS(thg, cy);
        ghosts.push(ring3(bankPt(cy.side, sg + 46, 0, cy.z, dPis), u, 48, 18).map(P3));
      }
      overlays.push(() => {
        ghosts.forEach((gp, i) => {
          const pp = new Path2D();
          partial(gp, 1, true, pp);
          stroke(c, pp, { w: 1.2, color: BP.cyan, alpha: A * clamp((om - 2) / 6) * (0.4 - i * 0.11) });
        });
      });
    }
    // Combustion
    const burn = burnOf(th, cy, thIgn);
    if (burn > 0.01) {
      const crown = ring3(bankPt(cy.side, s + 50, 0, cy.z), u, 46, 18);
      const roof = ring3(bankPt(cy.side, 268, 0, cy.z), u, 46, 18);
      const chamber = hullOf(crown.concat(roof).map(P3));
      const plug = P3(bankPt(cy.side, 274, 0, cy.z));
      overlays.push(() => {
        const cp = new Path2D();
        chamber.forEach((q, i) => (i ? cp.lineTo(q[0], q[1]) : cp.moveTo(q[0], q[1])));
        cp.closePath();
        wash(c, cp, 0.85 * burn * A, BP.accent);
        flare(c, plug[0], plug[1], px(50 + 80 * burn), Math.min(1, burn * 1.6) * A);
      });
    }
  }

  /* banks, heads, covers, exhaust */
  for (const side of [-1, 1]) {
    const { u, w } = bankAxes(side);
    const o = bankPt(side, 118, -92, -265);
    const bores: V3[][] = [];
    for (const cy of CYLS) if (cy.side === side) bores.push([...ring3(bankPt(side, 270, 0, cy.z), u, 50, 20), ring3(bankPt(side, 270, 0, cy.z), u, 50, 20)[0]]);
    parts.push(boxPart(o, mul(u, 152), mul(w, 184), [0, 0, 545], { k: kBank, alpha: A, fill: blockFill, w: 2.6, glow: 1, washA: 0.06 }, bores));
    const ho = bankPt(side, 270, -104, -272, dHead);
    parts.push(boxPart(ho, mul(u, 72), mul(w, 208), [0, 0, 560], { k: kHead, alpha: A, fill: lerp(0.9, 0.12, xray), w: 2.4, glow: 1, washA: 0.08 }));
    const ribs: V3[][] = [];
    for (let i = 0; i < 7; i++) {
      const z = -230 + i * 76;
      ribs.push([bankPt(side, 382, -70, z, dHead), bankPt(side, 382, 70, z, dHead)]);
    }
    parts.push(boxPart(bankPt(side, 342, -84, -250, dHead), mul(u, 40), mul(w, 168), [0, 0, 516], { k: kHead, alpha: A * lerp(1, 0.55, xray), fill: lerp(0.9, 0.1, xray), w: 2, washA: 0.12 }, ribs));
    // Spark plugs and exhaust primaries on the outer face
    const plugs: Pt[][] = [];
    const pipes: Pt[][] = [];
    for (const cy of CYLS) {
      if (cy.side !== side) continue;
      plugs.push([P3(bankPt(side, 300, -104, cy.z + 30, dHead)), P3(bankPt(side, 300, -150, cy.z + 30, dHead))]);
      const p0 = bankPt(side, 296, -104, cy.z, dHead);
      const p1 = bankPt(side, 296, -150, cy.z, dHead);
      const p2: V3 = [p1[0] + side * 24, 70, cy.z - 24];
      const p3: V3 = [side * 250, 40, cy.z - 56];
      pipes.push([P3(p0), P3(p1), P3(p2), P3(p3)]);
    }
    pipes.push([P3([side * 250, 30, 240]), P3([side * 250, 30, -330]), P3([side * 250, -60, -420])]);
    parts.push({ lines: plugs, closed: plugs.map(() => false), hull: [], depth: D3(bankPt(side, 300, -150, 0)) + 50, fill: 0, washA: 0, w: 3, k: kHead, alpha: A });
    const pipeDepth = D3([side * 250, 30, 0]);
    parts.push({ lines: pipes, closed: pipes.map(() => false), hull: [], depth: pipeDepth, fill: 0, washA: 0, w: 2.2, k: seg(t, 2.0, 2.9), alpha: A * (1 - ex(0) * 0.6), color: BP.line });
    // Exhaust flow: dashed lines streaming down the pipes after each firing
    if (thIgn < th && fade > 0.05) {
      overlays.push(() => {
        for (const cy of CYLS) {
          if (cy.side !== side) continue;
          let a = (th - cy.phase) % (2 * TAU);
          if (a < 0) a += 2 * TAU;
          // exhaust stroke: valve opens ~ 3pi/2 after firing
          const pulse = a > Math.PI * 0.9 && a < Math.PI * 2.1 ? Math.sin(((a - Math.PI * 0.9) / (Math.PI * 1.2)) * Math.PI) : 0;
          const idx = CYLS.filter((q) => q.side === side).indexOf(cy);
          const pp = new Path2D();
          partial(pipes[idx], 1, false, pp);
          c.save();
          c.lineDashOffset = -t * px(420);
          stroke(c, pp, { w: 2.6, color: BP.accent, dash: [10, 16], alpha: A * pulse * 0.95 });
          c.restore();
        }
        const cp = new Path2D();
        partial(pipes[pipes.length - 1], 1, false, cp);
        c.save();
        c.lineDashOffset = -t * px(520);
        stroke(c, cp, { w: 2, color: BP.cyan, dash: [12, 14], alpha: A * clamp((omega(t) - 1) / 5) * 0.9 });
        c.restore();
        // Exhaust puff leaving the tailpipe
        const tail = P3([side * 250, -60, -420]);
        const ring = (th * 2) % 1;
        stroke(c, circle(tail[0], tail[1], px(8 + ring * 34)), { w: 1.2, color: BP.cyan, dash: DASH.fine, alpha: A * (1 - ring) * clamp((omega(t) - 1) / 5) });
      });
    }
  }

  /* crankcase and pan */
  parts.push(boxPart([-160, -40, -268], [320, 0, 0], [0, 110, 0], [0, 0, 550], { k: kBank, alpha: A, fill: blockFill, w: 2.2, washA: 0.05 }));
  const panO: V3 = [-150, -160 + dPan, -255];
  parts.push(boxPart(panO, [300, 0, 0], [0, 118, 0], [0, 0, 530], { k: kPan, alpha: A, fill: 0.88, w: 2.2, washA: 0.08 }, [
    [add(panO, [0, 30, 0]), add(panO, [0, 30, 530])],
    [add(panO, [300, 30, 0]), add(panO, [300, 30, 530])],
  ]));

  /* intake, carb, air cleaner */
  parts.push(boxPart([-150, 250 + dTop, -205], [300, 0, 0], [0, 70, 0], [0, 0, 440], { k: kTop, alpha: A, fill: 0.9, w: 2.2, washA: 0.1 }));
  parts.push(boxPart([-52, 320 + dTop, -45], [104, 0, 0], [0, 40, 0], [0, 0, 100], { k: kTop, alpha: A, fill: 0.9, w: 1.8, washA: 0.12 }));
  parts.push(cylPart([0, 360 + dTop * 1.25, 5], [0, 1, 0], 132, 40, { k: kTop, alpha: A, fill: 0.92, w: 2.4, glow: 1, washA: 0.12 }, [0.5]));
  parts.push(cylPart([0, 400 + dTop * 1.25, 5], [0, 1, 0], 26, 18, { k: kTop, alpha: A, fill: 0.9, w: 1.6 }));

  /* front: timing cover and the pulley (the motif circle) */
  parts.push(boxPart([-120, -60, 285 + dFront * 0.5], [240, 0, 0], [0, 230, 0], [0, 0, 18], { k: kFront, alpha: A, fill: 0.85, w: 1.8, washA: 0.06 }));
  parts.push(cylPart([0, 175, 300 + dFront], [0, 0, 1], 42, 18, { k: kFront, alpha: A, fill: 0.9, w: 1.6, washA: 0.14 }));
  return { parts, overlays };
};

/** The front pulley, kept separate so it can hand off to the wheel */
const pulleyPart = (t: number, th: number, dFront: number): Part => {
  const p = cylPart([0, 0, 300 + dFront], [0, 0, 1], RIM, 34, { k: seg(t, 1.1, 2.0), w: 2.6, glow: 1.2, washA: 0.14, fill: 0.95 }, [0.3, 0.55, 0.8]);
  // Hub and bolt circle on the front face
  const face = 334 + dFront;
  p.lines.push(ring3([0, 0, face], [0, 0, 1], 26).map(P3));
  p.closed.push(true);
  for (let i = 0; i < 3; i++) {
    const a = th + (i / 3) * TAU;
    p.lines.push(ring3([Math.sin(a) * 46, Math.cos(a) * 46, face], [0, 0, 1], 7, 10).map(P3));
    p.closed.push(true);
  }
  // Timing mark
  p.lines.push([P3([Math.sin(th) * 56, Math.cos(th) * 56, face]), P3([Math.sin(th) * 76, Math.cos(th) * 76, face])]);
  p.closed.push(false);
  return p;
};

/* ---------- wheel ---------- */

/** Five-spoke mag wheel with tyre at (ox, oy). grow: 0 pulley ring only .. 1 full wheel */
const drawWheel = (c: Ctx, ox: number, oy: number, th: number, grow: number, alpha: number, o: { k?: number; fill?: boolean; fx?: number } = {}) => {
  if (alpha <= 0.01) return;
  const A = alpha;
  const k = o.k ?? 1;
  const tyreR = lerp(RIM, TYRE, ease.outCubic(clamp(grow * 1.3)));
  const tp = circle(ox, oy, tyreR);
  if (o.fill !== false) {
    c.save();
    c.globalAlpha = A * 0.94;
    c.fillStyle = BP.paper;
    c.fill(tp);
    c.restore();
  }
  wash(c, tp, 0.12 * A);
  drawOn(c, arcPts(ox, oy, tyreR, -Math.PI / 2, -Math.PI / 2 + TAU, 48), k, { w: 2.8, glow: 1.2, alpha: A, nib: false });
  stroke(c, circle(ox, oy, RIM), { w: 2, alpha: A * k });
  const g = clamp(grow * 1.5 - 0.2);
  if (g > 0) {
    // Tyre: sidewall line and tread blocks
    stroke(c, circle(ox, oy, lerp(RIM, 92, g)), { w: 1.1, color: BP.cyan, alpha: A * g });
    const tread = new Path2D();
    for (let i = 0; i < 40; i++) {
      const a = th + (i / 40) * TAU;
      tread.moveTo(ox + Math.cos(a) * (tyreR - 3), oy + Math.sin(a) * (tyreR - 3));
      tread.lineTo(ox + Math.cos(a) * (tyreR - 9), oy + Math.sin(a) * (tyreR - 9));
    }
    stroke(c, tread, { w: 1, color: BP.cyan, alpha: A * g * 0.9 });
  }
  // Pulley grooves give way to the spoke windows
  const pg = 1 - clamp(grow * 2.2);
  if (pg > 0.01) {
    stroke(c, circle(ox, oy, 66), { w: 1.2, color: BP.cyan, alpha: A * pg });
    stroke(c, circle(ox, oy, 56), { w: 1.2, color: BP.cyan, alpha: A * pg });
  }
  const sp = clamp(grow * 1.6 - 0.3);
  if (sp > 0) {
    const win = new Path2D();
    for (let i = 0; i < 5; i++) {
      const a0 = th + (i / 5) * TAU + Math.PI / 5;
      const outer = arcPts(ox, oy, lerp(30, 68, sp), a0 - 0.42, a0 + 0.42, 8);
      const inner = arcPts(ox, oy, 30, a0 + 0.26, a0 - 0.26, 5);
      const pts = outer.concat(inner);
      win.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) win.lineTo(pts[j][0], pts[j][1]);
      win.closePath();
    }
    c.save();
    c.globalAlpha = 0.6 * A * sp;
    c.fillStyle = BP.deep;
    c.fill(win);
    c.restore();
    stroke(c, win, { w: 1.6, alpha: A * sp });
  }
  // Hub, lugs, cap
  stroke(c, circle(ox, oy, 26), { w: 1.6, alpha: A * k });
  const lugs = new Path2D();
  for (let i = 0; i < 5; i++) {
    const a = th + (i / 5) * TAU;
    circle(ox + Math.cos(a) * 18, oy + Math.sin(a) * 18, 3.2, lugs);
  }
  stroke(c, lugs, { w: 1, alpha: A * k });
  wash(c, circle(ox, oy, 9), 0.5 * A, BP.line);
  centreMark(c, ox, oy, tyreR + 18, A * 0.7);
};

/* ---------- car drawings ---------- */

const carSidePts = (): Pt[] => {
  const frontArch = arcPts(0, 0, 114, Math.PI, TAU, 24);
  const upper = splinePts(
    [
      [114, 0],
      [132, 38],
      [214, 40],
      [248, 32],
      [258, 10],
      [262, -30],
      [258, -62],
      [248, -86],
      [200, -94],
      [90, -97],
      [-40, -99],
      [-120, -100],
      [-140, -112],
      [-260, -114],
      [-276, -101],
      [-380, -101],
      [-410, -103],
      [-540, -180],
      [-600, -190],
      [-660, -186],
      [-760, -162],
      [-860, -132],
      [-960, -114],
      [-1010, -108],
      [-1044, -118],
      [-1060, -106],
      [-1066, -70],
      [-1068, -20],
      [-1062, 20],
      [-1040, 40],
      [-986, 40],
      [-974, 0],
    ],
    6
  );
  const upperS = upper.map(([x, y]) => [x, y < 0 ? y * BODY_Y : y] as Pt);
  const rearArch = arcPts(-WB, 0, 114, Math.PI, TAU, 24);
  const rocker = splinePts(
    [
      [-746, 0],
      [-732, 40],
      [-140, 40],
      [-114, 0],
    ],
    4
  );
  return [...frontArch, ...upperS.slice(1), ...rearArch.slice(1), ...rocker.slice(1, -1)];
};

const carTopHalf = (): Pt[] =>
  splinePts(
    [
      [260, 0],
      [258, -150],
      [244, -222],
      [150, -256],
      [-60, -258],
      [-300, -250],
      [-560, -244],
      [-760, -264],
      [-930, -262],
      [-1040, -236],
      [-1060, -150],
      [-1062, 0],
    ],
    6
  );
const carTopPts = (): Pt[] => {
  const h = carTopHalf();
  const mirror = h
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [x, -y] as Pt);
  return h.concat(mirror);
};

const polyP = (pts: Pt[], closed = true, p: Path2D = new Path2D()) => {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
};
const shift = (pts: Pt[], dx: number, dy: number, sy = 1): Pt[] => pts.map(([x, y]) => [x + dx, y * sy + dy]);

/** Side elevation details (body already drawn); ox, oy = front wheel centre */
const sideDetails = (c: Ctx, s: State, ox: number, oy: number, k: number, a: number) => {
  if (k <= 0 || a <= 0.01) return;
  c.save();
  c.translate(ox, oy);
  c.scale(1, BODY_Y);
  const g = s.sideGlass;
  wash(c, polyP(g), 0.18 * k * a, BP.cyan);
  drawOn(c, g, k, { closed: true, w: 1.8, alpha: a, nib: false });
  const det = new Path2D();
  det.moveTo(-650, -182);
  det.lineTo(-656, -104);
  det.moveTo(-396, -92);
  det.lineTo(-404, 32);
  det.moveTo(-724, -106);
  det.lineTo(-732, 32);
  // Hood scoop opening and cut line
  det.moveTo(-140, -112);
  det.lineTo(-140, -100);
  det.moveTo(-120, -100);
  det.lineTo(-290, -102);
  stroke(c, det, { w: 1.4, alpha: a * k });
  // Body crease with the hip kick over the rear wheel
  const crease = splinePts(
    [
      [236, -32],
      [0, -40],
      [-560, -46],
      [-760, -64],
      [-930, -66],
      [-1056, -52],
    ],
    6
  );
  drawOn(c, crease, k, { w: 1.3, color: BP.cyan, alpha: a, nib: false });
  // Chrome: bumpers, rocker strip, handles, mirror, fuel cap
  const chrome = new Path2D();
  chrome.moveTo(258, 8);
  chrome.lineTo(210, 10);
  chrome.moveTo(-1058, 4);
  chrome.lineTo(-1010, 6);
  chrome.moveTo(-150, 22);
  chrome.lineTo(-730, 22);
  chrome.moveTo(-600, -80);
  chrome.lineTo(-570, -80);
  chrome.roundRect(-430, -114, 22, 12, 4);
  circle(-960, -78, 9, chrome);
  for (let i = 0; i < 4; i++) {
    chrome.moveTo(250 - i * 1.5, -50 + i * 12);
    chrome.lineTo(258, -50 + i * 12);
  }
  stroke(c, chrome, { w: 2, alpha: a * k });
  // Tail light (the accent) and headlamp
  const lamp = new Path2D();
  lamp.roundRect(-1062, -92, 8, 26, 3);
  c.save();
  c.globalAlpha = 0.9 * a * k;
  c.fillStyle = BP.accent;
  c.fill(lamp);
  c.restore();
  stroke(c, circle(248, -44, 10), { w: 1.6, alpha: a * k });
  c.restore();
};

const drawCarSide = (c: Ctx, s: State, ox: number, oy: number, th: number, k: number, a: number, wheels = true) => {
  if (k <= 0 || a <= 0.01) return;
  const body = shift(s.side, ox, oy);
  const bp = polyP(body);
  c.save();
  c.globalAlpha = 0.93 * a * clamp((k - 0.3) * 3);
  c.fillStyle = BP.paper;
  c.fill(bp);
  c.restore();
  wash(c, bp, 0.09 * a * clamp((k - 0.5) * 3));
  drawOn(c, body, ease.inOutSine(k), { closed: true, w: 3, glow: 1.3, alpha: a });
  if (wheels) {
    drawWheel(c, ox, oy, th, 1, a);
    drawWheel(c, ox - WB, oy, th, 1, a * clamp((k - 0.35) * 3), { k: clamp((k - 0.35) * 2) });
  }
};

/** Front elevation centred at (fx, ground y = gy) */
const drawCarFront = (c: Ctx, fx: number, gy: number, k: number, a: number) => {
  if (k <= 0 || a <= 0.01) return;
  const oy = gy - GROUND;
  const half: Pt[] = [
    [0, -190],
    [150, -188],
    [176, -170],
    [212, -94],
    [250, -82],
    [262, -50],
    [262, 20],
    [252, 40],
    [0, 40],
  ];
  const full = half.concat(
    half
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [-x, y] as Pt)
  );
  const pts = shift(full.map(([x, y]) => [x, y < 0 ? y * BODY_Y : y] as Pt), fx, oy);
  const pp = polyP(pts);
  c.save();
  c.globalAlpha = 0.92 * a;
  c.fillStyle = BP.paper;
  c.fill(pp);
  c.restore();
  wash(c, pp, 0.09 * a);
  drawOn(c, pts, k, { closed: true, w: 2.6, glow: 1, alpha: a });
  const kd = clamp((k - 0.4) / 0.6);
  if (kd <= 0) return;
  c.save();
  c.translate(fx, oy);
  c.scale(1, BODY_Y);
  c.translate(-fx, -oy);
  const d = new Path2D();
  // Windshield
  polyP(shift([[-150, -180], [150, -180], [196, -100], [-196, -100]], fx, oy), true, d);
  // Grille, bumper, scoop
  d.rect(fx - 196, oy - 64, 392, 56);
  for (let i = 1; i < 4; i++) {
    d.moveTo(fx - 196, oy - 64 + i * 14);
    d.lineTo(fx + 196, oy - 64 + i * 14);
  }
  d.roundRect(fx - 268, oy - 2, 536, 14, 5);
  polyP(shift([[-58, -96], [58, -96], [70, -84], [-70, -84]], fx, oy), true, d);
  stroke(c, d, { w: 1.4, alpha: a * kd });
  wash(c, polyP(shift([[-150, -180], [150, -180], [196, -100], [-196, -100]], fx, oy)), 0.16 * a * kd, BP.cyan);
  // Quad headlamps
  const lamps = new Path2D();
  for (const x of [-160, -116, 116, 160]) circle(fx + x, oy - 36, 17, lamps);
  stroke(c, lamps, { w: 1.8, alpha: a * kd });
  c.restore();
  // Tyres below the body
  const ty = new Path2D();
  ty.rect(fx - 252, oy + 30, 64, 70);
  ty.rect(fx + 188, oy + 30, 64, 70);
  wash(c, ty, 0.25 * a * kd);
  stroke(c, ty, { w: 2, alpha: a * kd });
  stroke(c, line(fx, oy - 300, fx, gy + 24), { w: 1, color: BP.cyan, dash: DASH.centre, alpha: a * kd * 0.8 });
};

/** Plan view centred at (cx, cy) heading +x, rot about centre */
const drawCarTop = (c: Ctx, s: State, cx: number, cy: number, k: number, a: number, rot = 0, detail = 1) => {
  if (k <= 0 || a <= 0.01) return;
  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.translate(-CAR_MID, 0);
  const pts = s.top;
  const pp = polyP(pts);
  c.save();
  c.globalAlpha = 0.93 * a;
  c.fillStyle = BP.paper;
  c.fill(pp);
  c.restore();
  wash(c, pp, 0.09 * a);
  drawOn(c, pts, k, { closed: true, w: 2.8, glow: 1.2, alpha: a });
  const kd = clamp((k - 0.4) / 0.6) * detail;
  if (kd > 0) {
    const gl = new Path2D();
    polyP([[-410, -210], [-410, 210], [-540, 168], [-540, -168]], true, gl);
    polyP([[-660, -160], [-660, 160], [-900, 128], [-900, -128]], true, gl);
    wash(c, gl, 0.2 * a * kd, BP.cyan);
    stroke(c, gl, { w: 1.6, alpha: a * kd });
    const d = new Path2D();
    d.rect(-540, -168, -120, 336);
    d.rect(-276, -54, 136, 108);
    d.moveTo(-1004, -230);
    d.lineTo(-1004, 230);
    stroke(c, d, { w: 1.3, alpha: a * kd });
    // Twin racing stripes, nose to tail
    const st = new Path2D();
    st.rect(-1060, -78, 1320, 40);
    st.rect(-1060, 38, 1320, 40);
    c.save();
    c.clip(pp);
    wash(c, st, 0.22 * a * kd, BP.line);
    stroke(c, st, { w: 1, alpha: a * kd * 0.8 });
    c.restore();
    // Wheels as hidden lines
    const wh = new Path2D();
    for (const x of [0, -WB]) for (const y of [-1, 1]) wh.rect(x - 100, y > 0 ? 196 : -256, 200, 60);
    stroke(c, wh, { w: 1.1, color: BP.cyan, dash: DASH.hidden, alpha: a * kd });
    stroke(c, line(-1100, 0, 290, 0), { w: 1, color: BP.cyan, dash: DASH.centre, alpha: a * kd * 0.7 });
  }
  c.restore();
};

/* ---------- map ---------- */

const buildMap = () => {
  const minor = new Path2D();
  const mile = new Path2D();
  const road = new Path2D();
  const lanes = new Path2D();
  const blocks = new Path2D();
  const park = new Path2D();
  const trees = new Path2D();
  const lamps = new Path2D();
  const labels: State['labels'] = [];
  const top = LANE_Y - 975; // north carriageway edge (toward median)
  const curb = LANE_Y + 975;
  const walk = curb + 1000;
  const medTop = top - 300;
  const farEdge = medTop - 1950;
  const X0 = -9000;
  const X1 = 26000;
  // Woodward: two carriageways and a median
  for (const y of [farEdge, medTop, top, curb, curb + 600]) {
    road.moveTo(X0, y);
    road.lineTo(X1, y);
  }
  road.moveTo(X0, walk);
  road.lineTo(X1, walk);
  for (const y of [farEdge + 650, farEdge + 1300, top + 650, top + 1300]) {
    lanes.moveTo(X0, y);
    lanes.lineTo(X1, y);
  }
  // Skewed street grid either side of the avenue
  const d1: Pt = [0.5, 0.866];
  const d2: Pt = [0.866, -0.5];
  const L = 16000;
  const famLine = (p: Path2D, x: number, d: Pt) => {
    p.moveTo(x - d[0] * L, LANE_Y - d[1] * L);
    p.lineTo(x + d[0] * L, LANE_Y + d[1] * L);
  };
  const mileX = [3000, 10000, 17000];
  for (let j = -12; j < 30; j++) {
    const x = 3000 + j * (7000 / 6);
    if (j % 6 === 0) {
      // Mile road: a wide double line
      for (const o of [-260, 260]) {
        mile.moveTo(x + o / 0.866 - d1[0] * L, LANE_Y - d1[1] * L);
        mile.lineTo(x + o / 0.866 + d1[0] * L, LANE_Y + d1[1] * L);
      }
    } else famLine(minor, x, d1);
  }
  for (let j = -10; j < 26; j++) famLine(minor, -1500 + j * 1400, d2);
  // Blocks: a few hatched parcels
  const rng = mulberry(91);
  for (let i = 0; i < 26; i++) {
    const bx = -6000 + rng() * 30000;
    const north = rng() < 0.5;
    const by = north ? farEdge - 500 - rng() * 5000 : walk + 400 + rng() * 5000;
    const w = 600 + rng() * 500;
    blocks.moveTo(bx, by);
    blocks.lineTo(bx + w, by);
    blocks.lineTo(bx + w + 300, by + 520);
    blocks.lineTo(bx + 300, by + 520);
    blocks.closePath();
  }
  // Park on the east side between 7 and 8 Mile
  const pk: Pt[] = [
    [4600, walk + 300],
    [8600, walk + 300],
    [9600, walk + 2600],
    [5600, walk + 2900],
  ];
  polyP(pk, true, park);
  for (let i = 0; i < 60; i++) {
    const u = rng();
    const v = rng();
    const x = lerp(lerp(pk[0][0], pk[1][0], u), lerp(pk[3][0], pk[2][0], u), v);
    const y = lerp(lerp(pk[0][1], pk[1][1], u), lerp(pk[3][1], pk[2][1], u), v);
    circle(x, y, 70 + rng() * 60, trees);
  }
  park.ellipse(7200, walk + 1700, 700, 320, 0.2, 0, TAU);
  // Street lamps along the east kerb
  for (let x = -6000; x < 22000; x += 2400) {
    circle(x, curb + 800, 40, lamps);
    lamps.moveTo(x - 60, curb + 800);
    lamps.lineTo(x + 60, curb + 800);
  }
  circle(PARK_X + 520, curb + 800, 40, lamps);
  // Labels
  for (let x = -3000; x < 24000; x += 7000) labels.push({ text: 'WOODWARD AVE', x: x + 3500, y: medTop + 150, rot: 0, size: 15 });
  ['7 MILE RD', '8 MILE RD', '9 MILE RD'].forEach((tx, i) => {
    for (const off of [-3000, 3200]) labels.push({ text: tx, x: mileX[i] + d1[0] * off, y: LANE_Y + d1[1] * off, rot: Math.atan2(d1[1], d1[0]), size: 13 });
  });
  labels.push({ text: 'PALMER PARK', x: 7000, y: walk + 2200, rot: 0, size: 12 });
  return { map: { minor, mile, road, lanes, blocks, park, trees, lamps }, labels, edges: { farEdge, walk, curb } };
};

const drawMap = (c: Ctx, s: State, t: number, reveal: number, a: number, carX: number, carY: number) => {
  if (a <= 0.01 || reveal <= 0) return;
  const m = s.map;
  c.save();
  // Moving mask: the map spreads out from the car
  c.beginPath();
  c.arc(carX, carY, reveal, 0, TAU);
  c.clip();
  wash(c, m.park, 0.1 * a, BP.cyan);
  stroke(c, m.park, { w: 1.4, color: BP.cyan, alpha: a });
  stroke(c, m.trees, { w: 1, color: BP.pale, alpha: a * 0.8 });
  wash(c, m.blocks, 0.08 * a, BP.line);
  stroke(c, m.blocks, { w: 1, color: BP.pale, alpha: a * 0.8 });
  stroke(c, m.minor, { w: 1, color: BP.pale, alpha: a * 0.75 });
  stroke(c, m.mile, { w: 2, color: BP.line, alpha: a * 0.95 });
  stroke(c, m.road, { w: 2.6, color: BP.line, glow: 1, alpha: a });
  c.save();
  c.lineDashOffset = 0;
  stroke(c, m.lanes, { w: 1.2, color: BP.cyan, dash: [26, 22], alpha: a * 0.8 });
  c.restore();
  stroke(c, m.lamps, { w: 1.4, color: BP.line, alpha: a });
  for (const l of s.labels) {
    letter(c, l.text, l.x, l.y, { size: px(l.size), color: BP.cyan, align: 'center', base: 'middle', weight: 700, spacing: px(4), rot: l.rot, alpha: a });
  }
  // Route trace behind the car
  const rt = new Path2D();
  rt.moveTo(CAR_MID, LANE_Y);
  rt.lineTo(Math.min(carX, PARK_X - 1500), LANE_Y);
  if (carX > PARK_X - 1500) rt.quadraticCurveTo(PARK_X - 900, LANE_Y, Math.min(carX, PARK_X - 300), carY);
  stroke(c, rt, { w: 2.4, color: BP.accent, dash: [16, 12], alpha: a * 0.85 });
  c.restore();
  void t;
};

/* ---------- screen furniture ---------- */

const drawTach = (r: Riso, c: Ctx, t: number, a: number) => {
  if (a <= 0.01) return;
  const cx = 1390;
  const cy = 200;
  const R = 92;
  const rpm = Math.min(7.4, (omega(t) / 16) * 5.6 + 0.8 * seg(t, T_IGN + 0.3, T_IGN + 0.6));
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  pen(1);
  c.save();
  c.globalAlpha = 0.65 * a;
  c.fillStyle = BP.deep;
  c.beginPath();
  c.arc(cx, cy, R + 14, 0, TAU);
  c.fill();
  c.restore();
  stroke(c, circle(cx, cy, R + 14), { w: 2, alpha: a });
  const ticks = new Path2D();
  for (let i = 0; i <= 40; i++) {
    const ang = a0 + (i / 40) * sweep;
    const l = i % 5 === 0 ? 14 : 7;
    ticks.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ticks.lineTo(cx + Math.cos(ang) * (R - l), cy + Math.sin(ang) * (R - l));
  }
  stroke(c, ticks, { w: 1.2, alpha: a });
  const red = new Path2D();
  red.arc(cx, cy, R - 4, a0 + (6.5 / 8) * sweep, a0 + sweep);
  stroke(c, red, { w: 5, color: BP.accent, alpha: a, cap: 'butt' });
  for (let i = 0; i <= 8; i++) {
    const ang = a0 + (i / 8) * sweep;
    letter(c, String(i), cx + Math.cos(ang) * (R - 28), cy + Math.sin(ang) * (R - 28), { size: 13, align: 'center', base: 'middle', weight: 700, alpha: a, color: i >= 7 ? BP.accent : BP.line });
  }
  letter(c, 'RPM ×1000', cx, cy + 40, { size: 10, align: 'center', color: BP.cyan, spacing: 1.5, alpha: a });
  const na = a0 + (rpm / 8) * sweep;
  stroke(c, line(cx - Math.cos(na) * 14, cy - Math.sin(na) * 14, cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10)), { w: 3, color: BP.accent, alpha: a });
  wash(c, circle(cx, cy, 8), 0.9 * a, BP.line);
  c.restore();
};

const drawFiringOrder = (r: Riso, c: Ctx, th: number, thIgn: number, a: number) => {
  if (a <= 0.01) return;
  c.save();
  c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
  pen(1);
  const x0 = 60;
  const y0 = 800;
  letter(c, 'FIRING ORDER', x0, y0 - 26, { size: 11, color: BP.cyan, spacing: 2, alpha: a });
  FIRING.forEach((n, i) => {
    const cy = CYLS[n - 1];
    const b = burnOf(th, cy, thIgn);
    const x = x0 + i * 44;
    const box = new Path2D();
    box.roundRect(x, y0 - 14, 34, 34, 4);
    wash(c, box, (0.15 + 0.75 * b) * a, b > 0.05 ? BP.accent : BP.cyan);
    stroke(c, box, { w: 1.4, color: b > 0.05 ? BP.accent : BP.line, alpha: a });
    letter(c, String(n), x + 17, y0 + 4, { size: 18, align: 'center', base: 'middle', weight: 700, alpha: a, font: GOTHIC });
    if (i < 7) letter(c, '·', x + 39, y0 + 4, { size: 14, align: 'center', base: 'middle', alpha: a * 0.6 });
  });
  c.restore();
};

/* ---------- camera ---------- */

interface Cam {
  x: number;
  y: number;
  z: number;
  rot: number;
}
const dolly = (a: Cam, b: Cam, k: number): Cam => {
  const z = a.z * Math.pow(b.z / a.z, k);
  const f = Math.abs(1 / b.z - 1 / a.z) < 1e-6 ? k : (1 / z - 1 / a.z) / (1 / b.z - 1 / a.z);
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z, rot: lerp(a.rot, b.rot, k) };
};

const views = (t: number) => {
  // yaw, pitch of the engine view
  const plan = { yaw: Math.PI / 2, pitch: Math.PI / 2 - 0.0001 };
  const iso = { yaw: -0.5, pitch: 0.36 };
  const iso2 = { yaw: -0.36, pitch: 0.3 };
  const front = { yaw: 0, pitch: 0 };
  if (t < T_SWING) return plan;
  if (t < T_EXPL) {
    const k = tween(t, T_SWING, T_EXPL, ease.inOutCubic);
    return { yaw: lerp(plan.yaw, iso.yaw, k), pitch: lerp(plan.pitch, iso.pitch, k) };
  }
  if (t < T_DIVE) {
    const k = tween(t, T_EXPL, T_DIVE, ease.inOutSine);
    return { yaw: lerp(iso.yaw, iso2.yaw, k), pitch: lerp(iso.pitch, iso2.pitch, k) };
  }
  const k = tween(t, T_DIVE, T_HERO, ease.inOutCubic);
  return { yaw: lerp(iso2.yaw, front.yaw, k), pitch: lerp(iso2.pitch, front.pitch, k) };
};

const SPEC: Cam = { x: -90, y: 285, z: 0.62, rot: 0 };
const SPEC_IN: Cam = { x: CAR_MID, y: TOP_Y, z: 1.0, rot: 0 };

const carMapPos = (t: number): Pt => {
  const k = tween(t, T_DRIVE, T_PARK + 0.35, (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2));
  const x = lerp(CAR_MID, PARK_X, k);
  const y = lerp(LANE_Y, CURB_LANE, tween(t, T_PARK - 0.45, T_PARK + 0.3, ease.inOutSine));
  return [x, y];
};
const carMapRot = (t: number) => {
  const k = seg(t, T_PARK - 0.45, T_PARK + 0.3);
  return Math.sin(k * Math.PI) * 0.22;
};
/** Final side elevation: front wheel origin and ground under the parked car */
const FINAL_WHEEL: Pt = [PARK_X - CAR_MID, CURB_LANE + 43];
const FINAL_GROUND = FINAL_WHEEL[1] + GROUND;
const FINAL: Cam = { x: PARK_X + 10, y: FINAL_GROUND - 360, z: 0.76, rot: 0 };

const camera = (t: number, s: { carX: number; carY: number }): Cam => {
  if (t < T_SWING) {
    // Track along the crank axis in plan as it is drawn
    const k = tween(t, 0, T_SWING, ease.inOutSine);
    return { x: lerp(-200, 40, k), y: lerp(10, 20, k), z: lerp(1.08, 0.9, k), rot: 0 };
  }
  if (t < T_EXPL) {
    const k = tween(t, T_SWING, T_EXPL, ease.inOutCubic);
    setView(views(t).yaw, views(t).pitch);
    const tc = P3([0, 140, 0]);
    return { x: lerp(40, tc[0], k), y: lerp(20, tc[1], k), z: lerp(0.9, 0.74, k), rot: 0 };
  }
  if (t < T_DIVE) {
    setView(views(t).yaw, views(t).pitch);
    const tc = P3([0, 140, 0]);
    const k = tween(t, T_EXPL, T_DIVE, ease.inOutSine);
    const pull = tween(t, T_COLLAPSE + 0.6, T_IGN + 0.4, ease.inOutSine);
    return { x: tc[0], y: lerp(tc[1], tc[1] + 40, pull), z: lerp(0.74, 1.2, pull) + 0.06 * k, rot: 0 };
  }
  if (t < T_HERO) {
    setView(views(t).yaw, views(t).pitch);
    const v = views(T_DIVE);
    setView(v.yaw, v.pitch);
    const a0 = P3([0, 140, 0]);
    setView(views(t).yaw, views(t).pitch);
    const pul = P3([0, 0, 334]);
    const k = tween(t, T_DIVE, T_HERO, ease.inOutCubic);
    const a: Cam = { x: a0[0], y: a0[1] + 40, z: 1.26, rot: 0 };
    const b: Cam = { x: pul[0], y: pul[1], z: 3.3, rot: 0.32 };
    return dolly(a, b, k);
  }
  if (t < T_SPEC) {
    // Hero: punch in, roll back level
    const k = tween(t, T_HERO, T_SPEC, ease.outCubic);
    const punch = Math.sin(seg(t, T_HERO + 0.35, T_HERO + 0.75) * Math.PI) * 0.18;
    return { x: 0, y: 0, z: 3.3 + punch - 0.25 * k, rot: 0.32 * (1 - ease.outBack(k)) };
  }
  if (t < T_MAP) {
    const a: Cam = { x: 0, y: 0, z: 3.05, rot: 0 };
    const k = tween(t, T_SPEC, T_SPEC + 1.9, ease.inOutCubic);
    const c1 = dolly(a, SPEC, k);
    const drift = seg(t, T_SPEC + 1.9, T_MAP);
    return { ...c1, z: c1.z * (1 + drift * 0.03) };
  }
  if (t < T_DRIVE + 0.1) {
    const k = tween(t, T_MAP, T_DRIVE + 0.1, ease.inOutCubic);
    return dolly({ ...SPEC, z: SPEC.z * 1.03 }, SPEC_IN, k);
  }
  if (t < T_FOLD) {
    // Pull out over the map and track the car; then dive back in at the kerb
    const out = tween(t, T_DRIVE + 0.1, T_DRIVE + 0.9, ease.inOutCubic);
    const back = tween(t, T_PARK - 0.3, T_FOLD, ease.inOutCubic);
    const zoomOut = 1.0 * Math.pow(0.075 / 1.0, out);
    const z = zoomOut * Math.pow(0.5 / zoomOut, back);
    const lead = 1400 * out * (1 - back);
    return { x: s.carX + lead, y: s.carY - 300 * out * (1 - back), z, rot: -0.42 * out * (1 - back) };
  }
  const k = tween(t, T_FOLD, T_TITLE + 0.3, ease.inOutCubic);
  const a: Cam = { x: s.carX, y: s.carY, z: 0.5, rot: 0 };
  const c1 = dolly(a, FINAL, k);
  return { ...c1, z: c1.z * (1 + 0.02 * seg(t, T_TITLE, DURATION)) };
};

/* ---------- film ---------- */

export const blueprintV8Film: RisoFilm<State> = {
  id: 'blueprint-v8',
  title: 'Motor City V8',
  caption: 'A V8 drawn from the plan up fires, its pulley spins into a mag wheel, and the car cruises Woodward.',
  theme: 'Detroit',
  motif: 'The circle: crank, pulley, wheel',
  duration: DURATION,
  series: 'Blueprint',
  mode: 'direct',
  paper: BP.paper,
  grain: 0.12,
  inks: BP_INKS,
  scenes: [
    { at: 0, label: 'Plan' },
    { at: T_SWING, label: 'Exploded 3/4' },
    { at: T_IGN, label: 'Ignition' },
    { at: T_HERO, label: 'Pulley to wheel' },
    { at: T_SPEC + 0.6, label: 'Spec sheet' },
    { at: T_MAP, label: 'Woodward Ave' },
  ],
  posterTime: 15.0,
  setup(r: Riso) {
    const n = Math.ceil(DURATION / STEP) + 2;
    const theta = new Float32Array(n);
    for (let i = 1; i < n; i++) theta[i] = theta[i - 1] + omega((i - 0.5) * STEP) * STEP;
    const side = carSidePts();
    const top = carTopPts();
    // Fold: plan outline (centred) to side outline (centred), same point count
    const sideC = side.map(([x, y]) => [x - CAR_MID, y + 43] as Pt);
    const topC = top.map(([x, y]) => [x - CAR_MID, y] as Pt);
    const [foldA, foldB] = morphPair(topC, sideC, 200);
    const sideGlass = splinePts(
      [
        [-416, -100],
        [-536, -174],
        [-600, -182],
        [-656, -180],
        [-740, -152],
        [-724, -106],
      ],
      5
    );
    const mp = buildMap();
    return { sheet: makeSheet(r, 41), theta, side, top, foldA, foldB, sideGlass, map: mp.map, labels: mp.labels };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    sheetUnder(r, c, s.sheet);
    const th = sample(s.theta, t);
    const thIgn = sample(s.theta, T_IGN + 0.45);
    const [carX, carY] = carMapPos(t);
    const cam = camera(t, { carX, carY });
    r.camera(cam.x, cam.y, cam.z, cam.rot);
    pen(cam.z);
    const mapA = seg(t, T_MAP + 0.3, T_DRIVE) * (1 - seg(t, T_FOLD - 0.1, T_FOLD + 0.5));
    grid(c, cam.x, cam.y, cam.z, r.W, r.H, cam.rot, seg(t, 0, 0.8) * (1 - mapA * 0.6));

    /* ---- engine ---- */
    if (t < T_HERO + 0.05) {
      const v = views(t);
      setView(v.yaw, v.pitch);
      const engineFade = 1 - seg(t, T_DIVE + 0.65, T_HERO - 0.05);
      const xray = seg(t, T_IGN - 0.3, T_IGN + 0.3) * (1 - seg(t, T_DIVE, T_DIVE + 0.5));
      const eng = buildEngine(c, t, th, thIgn, xray, engineFade);
      const e = lerp(0.35, 1, tween(t, T_SWING - 0.2, T_EXPL - 0.3, ease.inOutSine)) * (1 - tween(t, T_COLLAPSE, T_COLLAPSE + 1.3, ease.inOutCubic));
      const pul = pulleyPart(t, th, 150 * e);
      eng.parts.push(pul);
      // Crank axis centre line, through every view
      const ax0 = P3([0, -100 * e, -420]);
      const ax1 = P3([0, -100 * e, 480]);
      stroke(c, line(ax0[0], ax0[1], lerp(ax0[0], ax1[0], seg(t, 0, 0.9)), lerp(ax0[1], ax1[1], seg(t, 0, 0.9))), { w: 1.1, color: BP.cyan, dash: DASH.centre, alpha: 0.85 * engineFade });
      FILLK = lerp(0.35, 1, seg(t, T_SWING, T_EXPL));
      eng.parts.sort((a, b) => a.depth - b.depth);
      for (const p of eng.parts) drawPart(c, p);
      for (const o of eng.overlays) o();

      // Plan: dimension chain along the crank and a section label
      const planA = 1 - seg(t, T_SWING - 0.1, T_SWING + 0.4);
      if (planA > 0.01) {
        const zs = [200, 70, -60, -190].map((z) => P3([0, 0, z]));
        const y = 400;
        dimChain(c, zs.map(([x]) => [x, y] as Pt).reverse(), 0, ['4.40', '4.40', '4.40'], seg(t, 0.9, 2.1), { alpha: planA });
        dim(c, [P3([0, 0, -300])[0], y + 60], [P3([0, 0, 320])[0], y + 60], 0, 'CRANK 24.80', seg(t, 1.6, 2.4), { alpha: planA });
      }
      // Exploded callouts and a revision cloud
      const callA = seg(t, T_EXPL - 0.4, T_EXPL) * (1 - seg(t, T_COLLAPSE + 0.1, T_COLLAPSE + 0.5));
      if (callA > 0.01) {
        const lb = (a0: number) => seg(t, a0, a0 + 0.7);
        const eo = 190 * e;
        const tops = 150 * e * 1.25;
        callout(c, P3([0, 400 + tops, 5]), [cam.x - 640, cam.y - 330], 'AIR CLEANER', lb(T_EXPL - 0.4), { num: '6', alpha: callA });
        callout(c, P3(bankPt(-1, 360, 60, 120, eo)), [cam.x - 640, cam.y - 140], 'CYL. HEAD', lb(T_EXPL - 0.3), { num: '4', alpha: callA });
        callout(c, P3(bankPt(-1, 260, -92, 200)), [cam.x - 640, cam.y + 70], 'BLOCK · 90° V', lb(T_EXPL - 0.2), { num: '5', alpha: callA });
        callout(c, P3([0, -160 - 170 * e, 100]), [cam.x - 560, cam.y + 300], 'OIL PAN', lb(T_EXPL - 0.1), { num: '7', alpha: callA });
        callout(c, P3(bankPt(1, 230, 0, 70, 130 * e)), [cam.x + 560, cam.y - 240], 'PISTON ×8', lb(T_EXPL - 0.35), { num: '3', alpha: callA });
        callout(c, P3([0, -100 * e, -60]), [cam.x + 560, cam.y + 230], 'CRANKSHAFT', lb(T_EXPL - 0.25), { num: '1', alpha: callA });
        callout(c, P3([0, 0, 334 + 150 * e]), [cam.x + 540, cam.y + 40], 'DAMPER PULLEY', lb(T_EXPL - 0.15), { num: '2', alpha: callA });
        const ap = P3([0, 380 + tops, 5]);
        revCloud(c, ap[0] - 190, ap[1] - 90, 380, 120, 'A', seg(t, T_EXPL + 0.2, T_EXPL + 0.9), { alpha: callA });
      }
      if (t > T_DIVE + 0.6) {
        // Pulley face note as we arrive
        const pc = P3([0, 0, 334]);
        letter(c, 'VIEW A · ALONG CRANK AXIS', pc[0], pc[1] - 150, { size: px(13), color: BP.cyan, align: 'center', spacing: px(3), alpha: seg(t, T_DIVE + 0.6, T_HERO) }, 1);
      }
    }

    /* ---- hero wheel ---- */
    if (t >= T_HERO && t < T_SPEC + 0.6) {
      const grow = tween(t, T_HERO, T_HERO + 0.9, ease.inOutCubic);
      drawWheel(c, 0, 0, th, grow, 1);
      // Speed lines and shock ring
      const om = omega(t);
      const sl = new Path2D();
      for (let i = 0; i < 14; i++) {
        const a = th * 0.9 + (i / 14) * TAU;
        const rr = 116 + (i % 3) * 10;
        sl.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        sl.arc(0, 0, rr, a, a + 0.32 + om * 0.012);
      }
      stroke(c, sl, { w: 1.6, color: BP.cyan, alpha: clamp(om / 10) * grow * (1 - seg(t, T_SPEC - 0.6, T_SPEC)) });
      const sk = seg(t, T_HERO + 0.4, T_HERO + 1.2);
      if (sk > 0 && sk < 1) {
        stroke(c, circle(0, 0, lerp(102, 330, ease.outCubic(sk))), { w: 2.4, color: BP.line, glow: 1.4, alpha: (1 - sk) * 0.8 });
        stroke(c, circle(0, 0, lerp(102, 250, ease.outCubic(sk))), { w: 1.2, color: BP.accent, alpha: (1 - sk) * 0.9 });
      }
      const ka = seg(t, T_HERO + 0.7, T_HERO + 1.3) * (1 - seg(t, T_SPEC + 0.2, T_SPEC + 0.6));
      dim(c, [-TYRE, 0], [TYRE, 0], -150, 'Ø 26.0', ka, { alpha: ka > 0 ? 1 : 0 });
      callout(c, [52, 52], [190, 150], 'MAG WHEEL 15 × 7', ka, { num: '8', alpha: 1 - seg(t, T_SPEC + 0.2, T_SPEC + 0.6) });
    }

    /* ---- spec sheet: side, front and plan views ---- */
    if (t >= T_SPEC && t < T_DRIVE + 0.6) {
      const out = 1 - seg(t, T_MAP, T_MAP + 0.45);
      const kSide = seg(t, T_SPEC + 0.1, T_SPEC + 1.6);
      // Ground line
      const kg = seg(t, T_SPEC + 0.2, T_SPEC + 1.2);
      stroke(c, line(lerp(0, -1300, kg), GROUND, lerp(0, 1100, kg), GROUND), { w: 2.2, glow: 1, alpha: out });
      drawCarSide(c, s, 0, 0, th, kSide, out, false);
      drawWheel(c, 0, 0, th, 1, out);
      drawWheel(c, -WB, 0, th, 1, out * clamp((kSide - 0.35) * 3), { k: clamp((kSide - 0.35) * 2) });
      sideDetails(c, s, 0, 0, seg(t, T_SPEC + 0.9, T_SPEC + 1.9), out);
      // Front view slides in from the right, plan view rises from below
      const fIn = tween(t, T_SPEC + 0.9, T_SPEC + 1.7, ease.outCubic);
      const tIn = tween(t, T_SPEC + 1.1, T_SPEC + 1.9, ease.outCubic);
      drawCarFront(c, FRONT_X + 500 * (1 - fIn), GROUND, seg(t, T_SPEC + 0.9, T_SPEC + 1.9), out * fIn);
      // Plan view stays for the map
      const planA = t < T_MAP ? tIn : 1;
      if (t < T_DRIVE) drawCarTop(c, s, CAR_MID, TOP_Y + 500 * (1 - tIn), seg(t, T_SPEC + 1.1, T_SPEC + 2.1), planA, 0, 1);
      // Projection lines between views
      const pl = new Path2D();
      for (const x of [260, 0, -WB, -1062]) {
        pl.moveTo(x, GROUND + 20);
        pl.lineTo(x, TOP_Y - 280);
      }
      for (const y of [-190 * BODY_Y, -98 * BODY_Y, GROUND]) {
        pl.moveTo(270, y);
        pl.lineTo(FRONT_X - 290, y);
      }
      const plA = seg(t, T_SPEC + 1.7, T_SPEC + 2.2) * out;
      stroke(c, pl, { w: 0.9, color: BP.cyan, dash: DASH.fine, alpha: plA * 0.8 });
      // Dimension chains
      const kc = seg(t, T_SPEC + 1.8, T_SPEC + 2.6);
      dimChain(c, [[-1068, TOP_Y + 262], [-WB, TOP_Y + 262], [0, TOP_Y + 262], [260, TOP_Y + 262]], 80, ['36.2', '108.0', '32.4'], kc, { alpha: out });
      dim(c, [-1068, -190 * BODY_Y], [260, -190 * BODY_Y], -22, 'OVERALL 198.6', seg(t, T_SPEC + 2.0, T_SPEC + 2.7), { alpha: out });
      dim(c, [330, TOP_Y - 258], [330, TOP_Y + 258], -40, '74.6', seg(t, T_SPEC + 2.1, T_SPEC + 2.7), { alpha: out });
      dim(c, [FRONT_X - 220, GROUND], [FRONT_X + 220, GROUND], 70, 'TRACK 61.0', seg(t, T_SPEC + 2.2, T_SPEC + 2.8), { alpha: out });
      dim(c, [FRONT_X + 262, GROUND], [FRONT_X + 262, -190 * BODY_Y], 50, '52.1', seg(t, T_SPEC + 2.3, T_SPEC + 2.9), { alpha: out });
      // Chrome callouts
      const ca = (a0: number) => seg(t, a0, a0 + 0.6);
      callout(c, [-210, -113 * BODY_Y], [-150, -345], 'COWL-INDUCTION SCOOP', ca(T_SPEC + 1.6), { num: '9', alpha: out });
      callout(c, [-1046, -116 * BODY_Y], [-800, -345], 'DUCKTAIL', ca(T_SPEC + 1.7), { num: '10', alpha: out });
      callout(c, [258, 8], [330, -345], 'CHROME BUMPER', ca(T_SPEC + 1.8), { num: '11', alpha: out });
      callout(c, [FRONT_X + 160, -36 * BODY_Y], [FRONT_X + 120, 260], 'QUAD LAMPS', ca(T_SPEC + 1.9), { num: '12', alpha: out });
      revCloud(c, -300, -132 * BODY_Y, 184, 70, 'B', seg(t, T_SPEC + 2.2, T_SPEC + 2.7), { alpha: out });
      // Section hatch through the rocker panel (section marker on the side view)
      const sa = seg(t, T_SPEC + 2.0, T_SPEC + 2.5) * out;
      if (sa > 0) {
        const sec = new Path2D();
        sec.rect(-520, 4, 60, 34);
        hatch(c, sec, [-520, 4, 60, 34], { gap: 7, w: 0.9, alpha: sa });
        stroke(c, sec, { w: 1.2, alpha: sa });
        letter(c, 'C–C', -490, 66, { size: px(12), color: BP.cyan, align: 'center', weight: 700, alpha: sa });
      }
      stamp(c, FRONT_X + 80, TOP_Y + 60, 'APPROVED', tween(t, T_SPEC + 2.45, T_SPEC + 2.7, ease.outCubic) * (t < T_MAP + 0.4 ? 1 : 0) * out + 0, { size: 46, rot: -0.14, sub: 'MOTOR CITY · ENG. DEPT.', seed: 3 });
    }

    /* ---- Woodward map ---- */
    if (t >= T_MAP + 0.2 && t < T_FOLD + 0.6) {
      const reveal = 800 + Math.pow(seg(t, T_MAP + 0.3, T_DRIVE + 1.0), 1.6) * 30000;
      drawMap(c, s, t, reveal, mapA, carX, carY);
      if (t >= T_DRIVE) {
        const foldK = tween(t, T_FOLD, T_FOLD + 0.6, ease.inOutCubic);
        if (foldK <= 0) {
          drawCarTop(c, s, carX, carY, 1, 1, carMapRot(t), clamp(1 - seg(t, T_DRIVE + 0.2, T_DRIVE + 0.6) + seg(t, T_PARK - 0.1, T_PARK + 0.4)));
          // Motion streaks while cruising
          const sp = clamp((carX - CAR_MID) / 1500) * (1 - seg(t, T_PARK - 0.5, T_PARK));
          if (sp > 0.02) {
            const st = new Path2D();
            for (const y of [-200, -80, 80, 200]) {
              st.moveTo(carX - 700, carY + y);
              st.lineTo(carX - 700 - 900 * sp, carY + y);
            }
            stroke(c, st, { w: 2, color: BP.cyan, alpha: sp * 0.8 });
          }
        }
      }
    }
    // Plan folds into side elevation at the kerb
    if (t >= T_FOLD && t < T_FOLD + 0.6) {
      const k = tween(t, T_FOLD, T_FOLD + 0.6, ease.inOutCubic);
      const pts = s.foldA.map((p, i) => [carX + lerp(p[0], s.foldB[i][0], k), carY + lerp(p[1], s.foldB[i][1], k)] as Pt);
      const pp = polyP(pts);
      c.save();
      c.globalAlpha = 0.93;
      c.fillStyle = BP.paper;
      c.fill(pp);
      c.restore();
      wash(c, pp, 0.09);
      stroke(c, pp, { w: 3, glow: 1.3 });
    }

    /* ---- final: parked under the lamp ---- */
    if (t >= T_FOLD + 0.45) {
      const [wx, wy] = FINAL_WHEEL;
      const gk = seg(t, T_FOLD + 0.4, T_FOLD + 1.2);
      // Kerb, ground and sidewalk
      const g = new Path2D();
      g.moveTo(wx - 1800 * gk - 200, FINAL_GROUND);
      g.lineTo(wx + 1400 * gk, FINAL_GROUND);
      stroke(c, g, { w: 2.4, glow: 1 });
      const kerb = new Path2D();
      kerb.moveTo(wx - 1800 * gk - 200, FINAL_GROUND - 22);
      kerb.lineTo(wx + 1400 * gk, FINAL_GROUND - 22);
      stroke(c, kerb, { w: 1.2, color: BP.pale, alpha: gk });
      const earth = new Path2D();
      for (let x = wx - 2000; x < wx + 1400; x += 44) {
        if (Math.abs(x - wx) > 1800 * gk + 200) continue;
        earth.moveTo(x, FINAL_GROUND + 4);
        earth.lineTo(x - 16, FINAL_GROUND + 20);
      }
      stroke(c, earth, { w: 1, color: BP.pale, alpha: 0.8 * gk });
      // Lamp post behind the car, arm over the roof
      const lx = PARK_X + 520;
      const lk = seg(t, T_FOLD + 0.45, T_FOLD + 0.95);
      const post: Pt[] = [
        [lx, FINAL_GROUND - 22],
        [lx, FINAL_GROUND - 640],
        ...splinePts(
          [
            [lx, FINAL_GROUND - 640],
            [lx - 40, FINAL_GROUND - 720],
            [lx - 200, FINAL_GROUND - 730],
            [lx - 420, FINAL_GROUND - 700],
          ],
          8
        ).slice(1),
      ];
      drawOn(c, post, lk, { w: 2.6, glow: 1 });
      const base = new Path2D();
      base.moveTo(lx - 28, FINAL_GROUND - 22);
      base.lineTo(lx - 14, FINAL_GROUND - 120);
      base.lineTo(lx + 14, FINAL_GROUND - 120);
      base.lineTo(lx + 28, FINAL_GROUND - 22);
      stroke(c, base, { w: 1.8, alpha: lk });
      const hx = lx - 420;
      const hy = FINAL_GROUND - 700;
      if (lk >= 1) {
        const lit = seg(t, T_FOLD + 0.95, T_FOLD + 1.25);
        const cone = new Path2D();
        cone.moveTo(hx - 30, hy + 30);
        cone.lineTo(hx - 420, FINAL_GROUND - 6);
        cone.lineTo(hx + 360, FINAL_GROUND - 6);
        cone.lineTo(hx + 30, hy + 30);
        cone.closePath();
        const gr = c.createLinearGradient(hx, hy, hx, FINAL_GROUND);
        gr.addColorStop(0, 'rgba(210,236,255,0.32)');
        gr.addColorStop(1, 'rgba(210,236,255,0.02)');
        c.save();
        c.globalAlpha = lit;
        c.fillStyle = gr;
        c.fill(cone);
        c.restore();
        const rays = new Path2D();
        for (let i = 0; i <= 6; i++) {
          rays.moveTo(hx, hy + 34);
          rays.lineTo(lerp(hx - 420, hx + 360, i / 6), FINAL_GROUND - 10);
        }
        stroke(c, rays, { w: 1, color: BP.cyan, dash: DASH.fine, alpha: lit * 0.8 });
        flare(c, hx, hy + 20, 70, lit * 0.35, BP.line);
      }
      const head = new Path2D();
      head.moveTo(hx - 34, hy + 30);
      head.lineTo(hx - 20, hy);
      head.lineTo(hx + 20, hy);
      head.lineTo(hx + 34, hy + 30);
      head.closePath();
      const ha = seg(lk, 0.85, 1);
      wash(c, head, 0.4 * ha, BP.line);
      stroke(c, head, { w: 1.8, alpha: ha });
      drawCarSide(c, s, wx, wy, 0, 1, 1, true);
      sideDetails(c, s, wx, wy, seg(t, T_FOLD + 0.6, T_FOLD + 1.4), 1);
      c.save();
      c.translate(wx, wy);
      dimChain(c, [[-1068, GROUND], [-WB, GROUND], [0, GROUND]], 64, ['36.2', 'WHEELBASE 108.0'], seg(t, T_TITLE - 0.3, T_TITLE + 0.4));
      c.restore();
      stamp(c, wx - 1060, wy - 470, 'RELEASED', tween(t, T_TITLE + 0.3, T_TITLE + 0.55, ease.outCubic), { size: 40, rot: -0.1, sub: 'WOODWARD AVE · DET.', seed: 8 });
    }

    /* ---- screen furniture ---- */
    c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
    pen(1);
    const ignA = seg(t, T_IGN - 0.2, T_IGN + 0.3) * (1 - seg(t, T_DIVE + 0.3, T_DIVE + 0.8));
    drawTach(r, c, t, ignA);
    drawFiringOrder(r, c, th, thIgn, ignA);
    if (mapA > 0.05) {
      // North arrow and scale bar
      const na = mapA;
      const nx = 1460;
      const ny = 150;
      const nr = cam.rot;
      const arrow = new Path2D();
      const dir = -Math.PI / 2 + nr - 0.52;
      arrow.moveTo(nx + Math.cos(dir) * 50, ny + Math.sin(dir) * 50);
      arrow.lineTo(nx + Math.cos(dir + 2.6) * 22, ny + Math.sin(dir + 2.6) * 22);
      arrow.lineTo(nx, ny);
      arrow.lineTo(nx + Math.cos(dir - 2.6) * 22, ny + Math.sin(dir - 2.6) * 22);
      arrow.closePath();
      wash(c, arrow, 0.6 * na, BP.line);
      stroke(c, arrow, { w: 1.6, alpha: na });
      stroke(c, circle(nx, ny, 58), { w: 1.2, color: BP.cyan, alpha: na });
      letter(c, 'N', nx + Math.cos(dir) * 76, ny + Math.sin(dir) * 76, { size: 18, align: 'center', base: 'middle', weight: 700, font: GOTHIC, alpha: na });
      const sb = new Path2D();
      sb.rect(60, 820, 240, 10);
      wash(c, rectP(60, 820, 120, 10), 0.8 * na, BP.line);
      stroke(c, sb, { w: 1.2, alpha: na });
      letter(c, '0', 60, 812, { size: 11, align: 'center', alpha: na, color: BP.cyan });
      letter(c, '½ MI', 300, 812, { size: 11, align: 'center', alpha: na, color: BP.cyan });
      letter(c, 'STREET PLAN · WOODWARD AVE · NORTHBOUND', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: na });
    }
    border(r, c, { title: 'MOTOR CITY V8', sub: 'DETROIT · MICH.', dwg: '313-V8-01', scale: '1 : 10', sheet: '1 OF 1', by: 'S. SHUMUNOV' }, seg(t, 0, 1.1), seg(t, T_TITLE - 0.2, T_TITLE + 0.6));
    const noteA = (a0: number, a1: number) => seg(t, a0, a0 + 0.4) * (1 - seg(t, a1, a1 + 0.3));
    letter(c, 'PLAN VIEW · CRANKSHAFT', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * noteA(0.4, T_SWING) });
    letter(c, 'ISOMETRIC · EXPLODED ASSY.', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * noteA(T_SWING + 0.6, T_IGN - 0.3) });
    letter(c, 'IGNITION TEST · X-RAY', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * noteA(T_IGN, T_DIVE + 0.3) });
    letter(c, 'GENERAL ARRANGEMENT · 3 VIEWS', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * noteA(T_SPEC + 0.8, T_MAP) });
    letter(c, 'SIDE ELEVATION · PARKED', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * noteA(T_FOLD + 0.6, DURATION) });
    sheetOver(r, c, s.sheet);
  },
};

const rectP = (x: number, y: number, w: number, h: number) => {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
};
void arrowHead;
