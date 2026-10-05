import { FC, memo } from 'react';
import { LandmarkId, seeded } from './journey';

// Silhouettes for the parallax planes. Everything is generated once from a
// fixed seed, so the scene is stable between renders and costs nothing per frame.
// Each stop has a landmark (mid ground) and a backdrop (far, paler, slower), and
// inside each drawing the further shapes are lighter so the depth reads at a glance.

const f = (n: number) => Math.round(n * 10) / 10;

/** A rolling ridge line closed at the bottom of the box */
const ridgePath = (seed: number, w: number, h: number, base: number, amp: number, step: number) => {
  const rand = seeded(seed);
  const phases = [rand() * 6, rand() * 6, rand() * 6];
  let d = `M0 ${h}`;
  for (let x = 0; x <= w; x += step) {
    const t = x / w;
    const y =
      base -
      amp *
        (0.55 * Math.sin(t * Math.PI * 3 + phases[0]) +
          0.3 * Math.sin(t * Math.PI * 7.3 + phases[1]) +
          0.15 * Math.sin(t * Math.PI * 17 + phases[2])) -
      rand() * amp * 0.12;
    d += ` L${f(x)} ${f(y)}`;
  }
  return `${d} L${w} ${h} Z`;
};

const RIDGE_FAR = ridgePath(7, 2400, 400, 230, 120, 24);
const HILLS = ridgePath(21, 3000, 300, 190, 60, 30);

export const FarRidge: FC = memo(() => (
  <svg viewBox="0 0 2400 400" preserveAspectRatio="none" focusable="false">
    <path d={RIDGE_FAR} fill="currentColor" />
  </svg>
));

export const Hills: FC = memo(() => (
  <svg viewBox="0 0 3000 300" preserveAspectRatio="none" focusable="false">
    <path d={HILLS} fill="currentColor" />
  </svg>
));

// Shared shapes

/** A conifer: a spire and drooping tiers, then a short trunk */
const pine = (x: number, y: number, h: number, tiers = 5) => {
  const w = h * 0.3;
  const trunk = h * 0.035;
  const side: [number, number][] = [];
  for (let i = 0; i < tiers; i++) {
    const k = (i + 1) / tiers;
    const yb = y - h + h * 0.86 * k;
    const hw = w * (0.22 + 0.78 * k);
    side.push([hw, yb]);
    if (i < tiers - 1) side.push([hw * 0.42, yb - h * 0.035]);
  }
  const last = side[side.length - 1][1];
  let d = `M${f(x)} ${f(y - h)}`;
  side.forEach(([dx, sy]) => (d += ` L${f(x + dx)} ${f(sy)}`));
  d += ` L${f(x + trunk)} ${f(last)} L${f(x + trunk)} ${f(y)} L${f(x - trunk)} ${f(y)} L${f(x - trunk)} ${f(last)}`;
  [...side].reverse().forEach(([dx, sy]) => (d += ` L${f(x - dx)} ${f(sy)}`));
  return `${d} Z `;
};

/** A row of pines along a slope, tallest in the middle of the run */
const pineRow = (seed: number, x0: number, x1: number, y0: number, y1: number, h0: number, h1: number, gap: number) => {
  const rand = seeded(seed);
  let d = '';
  for (let x = x0; x <= x1; x += gap * (0.6 + rand() * 0.7)) {
    const t = (x - x0) / (x1 - x0 || 1);
    d += pine(x, y0 + (y1 - y0) * t + rand() * 6, h0 + (h1 - h0) * rand(), 4 + Math.round(rand() * 2));
  }
  return d;
};

/**
 * A jagged mountain range closed at the bottom of the box, plus snow caps that sit on the
 * slopes of the taller peaks so they never poke out past the outline
 */
const jaggedRange = (seed: number, w: number, h: number, base: number, amp: number, step: number, snowLine = 0.55) => {
  const rand = seeded(seed);
  const pts: [number, number][] = [];
  for (let x = 0; x <= w + step; x += step * (0.7 + rand() * 0.6)) {
    const t = x / w;
    const swell = 0.55 + 0.45 * Math.sin(t * Math.PI * 2.3 + seed);
    pts.push([x, base - amp * swell * (0.35 + rand() * 0.65)]);
  }
  let d = `M0 ${h}`;
  pts.forEach(([x, y]) => (d += ` L${f(x)} ${f(y)}`));
  d += ` L${w} ${h} Z`;
  let snow = '';
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [lx, ly] = pts[i - 1];
    const [rx, ry] = pts[i + 1];
    if (y > ly || y > ry || y > base - amp * snowLine) continue;
    const cap = 14 + rand() * 12;
    const tl = Math.min(0.6, cap / (ly - y || 1));
    const tr = Math.min(0.6, cap / (ry - y || 1));
    const ax = x + (lx - x) * tl;
    const ay = y + (ly - y) * tl;
    const bx = x + (rx - x) * tr;
    const by = y + (ry - y) * tr;
    // a ragged lower edge, pulled back toward the peak so it stays on the rock
    snow += `M${f(ax)} ${f(ay)}L${f(x)} ${f(y)}L${f(bx)} ${f(by)}L${f(x + (bx - x) * 0.45)} ${f(y + (by - y) * 0.7)}L${f(x + (ax - x) * 0.1)} ${f(Math.max(ay, by) * 0.98 + y * 0.02)}L${f(x + (ax - x) * 0.55)} ${f(y + (ay - y) * 0.65)}Z`;
  }
  return { d, snow };
};

/** Rows of lit windows, grouped into a few brightness buckets so each is one path */
type Lights = { warm: string[]; cool: string[] };
const lightsIn = (
  rand: () => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  density: number,
  w = 3,
  h = 4,
  gx = 8,
  gy = 11
) => {
  const out: Lights = { warm: ['', '', ''], cool: ['', '', ''] };
  for (let y = y0; y < y1 - h; y += gy) {
    for (let x = x0; x < x1 - w; x += gx) {
      if (rand() > density) continue;
      const bucket = Math.min(2, Math.floor(rand() * 3));
      const key = rand() > 0.82 ? 'cool' : 'warm';
      out[key][bucket] += `M${f(x)} ${f(y)}h${w}v${h}h${-w}Z`;
    }
  }
  return out;
};

const mergeLights = (list: Lights[]): Lights => ({
  warm: [0, 1, 2].map((i) => list.map((l) => l.warm[i]).join('')),
  cool: [0, 1, 2].map((i) => list.map((l) => l.cool[i]).join('')),
});

const LIGHT_O = [0.35, 0.6, 0.92];

const LitWindows: FC<{ lights: Lights; warm?: string; cool?: string; dim?: number }> = ({
  lights,
  warm = '#ffc88a',
  cool = '#cfe0ff',
  dim = 1,
}) => (
  <>
    {lights.warm.map((d, i) => d && <path key={`w${i}`} d={d} fill={warm} opacity={LIGHT_O[i] * dim} />)}
    {lights.cool.map((d, i) => d && <path key={`c${i}`} d={d} fill={cool} opacity={LIGHT_O[i] * dim * 0.8} />)}
  </>
);

// The Bay: a suspension bridge in that famous orange, towers poking out of the fog

const BRIDGE = (() => {
  const top = 44;
  const deck = 330;
  const base = 470;
  const towers = [330, 870];
  const [c1, c2] = towers;
  // Main span: quadratic with its control halfway across, so x is linear in t
  const mainY = (t: number) => (1 - t) ** 2 * top + 2 * (1 - t) * t * 600 + t ** 2 * top;
  const sideY = (t: number) => (1 - t) ** 2 * 318 + 2 * (1 - t) * t * 250 + t ** 2 * top;
  let hangers = '';
  for (let x = c1 + 14; x < c2 - 8; x += 15) {
    hangers += `M${f(x)} ${f(mainY((x - c1) / (c2 - c1)))}V${deck}`;
  }
  for (let x = 16; x < c1 - 8; x += 15) {
    const t = x / c1;
    hangers += `M${f(x)} ${f(sideY(t))}V${deck}`;
    hangers += `M${f(1200 - x)} ${f(sideY(t))}V${deck}`;
  }
  const cables = `M0 318 Q${c1 / 2} 250 ${c1} ${top} Q600 600 ${c2} ${top} Q${(1200 + c2) / 2} 250 1200 318`;
  let truss = '';
  for (let x = 4; x < 1200; x += 11) truss += `M${x} ${deck + 8}l5.5 11l5.5 -11`;

  // A tower leg steps in at every portal, the way the real ones do
  const steps: [number, number][] = [
    [base, 30],
    [deck, 28],
    [262, 26],
    [196, 24],
    [122, 22],
    [top + 2, 21],
  ];
  const gap = 21;
  const tower = (cx: number) => {
    let legs = '';
    let shade = '';
    [-1, 1].forEach((side) => {
      const inner = cx + side * gap;
      for (let i = 0; i < steps.length - 1; i++) {
        const [y0, w] = steps[i];
        const y1 = steps[i + 1][0];
        const outer = inner + side * w;
        const xa = Math.min(inner, outer);
        legs += `M${f(xa)} ${f(y1)}h${w}V${y0}h${-w}Z`;
        // the inside face sits in shadow
        const sx = side < 0 ? inner - w * 0.32 : inner;
        shade += `M${f(sx)} ${f(y1)}h${f(w * 0.32)}V${y0}h${f(-w * 0.32)}Z`;
      }
      // stepped cap on each leg
      const capX = side < 0 ? inner - 21 : inner;
      legs += `M${f(capX + 2)} ${top - 10}h17v12h-17Z M${f(capX + 5)} ${top - 16}h11v7h-11Z`;
    });
    // Portal struts, the top one tall and fluted
    let struts = `M${cx - gap} ${top + 2}h${gap * 2}v26h${-gap * 2}Z`;
    [122, 196, 262].forEach((y, i) => (struts += `M${cx - gap} ${y}h${gap * 2}v${12 - i * 2}h${-gap * 2}Z`));
    let flutes = '';
    for (let x = cx - gap + 5; x < cx + gap - 2; x += 6) flutes += `M${x} ${top + 6}v18`;
    // X bracing under the deck
    const brace = `M${cx - gap} ${deck + 18}L${cx + gap} ${deck + 72}M${cx + gap} ${deck + 18}L${cx - gap} ${deck + 72}M${cx - gap} ${deck + 72}L${cx + gap} ${base - 20}M${cx + gap} ${deck + 72}L${cx - gap} ${base - 20}`;
    return { legs, shade, struts, flutes, brace, cx };
  };
  return {
    towers: towers.map(tower),
    hangers,
    cables,
    truss,
    deck,
    base,
    top,
  };
})();

const BridgeTower: FC<{ t: (typeof BRIDGE.towers)[number]; face: string; shadow: string }> = ({ t, face, shadow }) => (
  <g>
    <path d={t.brace} stroke={shadow} strokeWidth={4} fill="none" />
    <path d={t.legs + t.struts} fill={face} />
    <path d={t.shade} fill={shadow} opacity={0.75} />
    <path d={t.flutes} stroke={shadow} strokeWidth={1.6} />
    <rect x={t.cx - 64} y={BRIDGE.base - 14} width={128} height={14} rx={2} fill="#2a2f3a" />
  </g>
);

const Bridge: FC = () => (
  <svg viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax meet" focusable="false">
    {/* The far tower is a touch paler: there is more air in front of it */}
    <BridgeTower t={BRIDGE.towers[1]} face="#c4583a" shadow="#8f3b26" />
    <g fill="none" stroke="#a83a20">
      <path d={BRIDGE.hangers} strokeWidth={1.1} opacity={0.65} />
      <path d={BRIDGE.cables} strokeWidth={4.5} strokeLinecap="round" />
    </g>
    <rect x={0} y={BRIDGE.deck - 4} width={1200} height={12} fill="#9a321b" />
    <path d={BRIDGE.truss} stroke="#6e2414" strokeWidth={1.4} fill="none" />
    <rect x={0} y={BRIDGE.deck + 18} width={1200} height={2.5} fill="#6e2414" />
    <BridgeTower t={BRIDGE.towers[0]} face="#b8401f" shadow="#7a2513" />
    {/* Deck lamps and the red beacons up top */}
    <g fill="#ffd59a">
      {Array.from({ length: 19 }, (_, i) => (
        <circle key={i} cx={30 + i * 63} cy={BRIDGE.deck - 7} r={1.8} />
      ))}
    </g>
    <g fill="#ff4b3a">
      {BRIDGE.towers.map((t) => (
        <g key={t.cx}>
          <circle cx={t.cx - 31} cy={BRIDGE.top - 18} r={2.6} />
          <circle cx={t.cx + 31} cy={BRIDGE.top - 18} r={2.6} />
        </g>
      ))}
    </g>
  </svg>
);

/** Headlands on one side, a hilly city on the other, all in haze */
const BAY_BACK = (() => {
  const rand = seeded(415);
  const marin = 'M0 300 L0 120 C80 70 170 60 260 92 C330 116 380 80 460 96 C540 112 600 170 700 210 C740 226 780 240 820 300 Z';
  const marinNear = 'M0 300 L0 196 C70 160 160 150 240 176 C320 200 380 190 450 222 C520 254 560 270 600 300 Z';
  const cityHill = 'M960 300 C1020 250 1080 222 1160 214 C1250 206 1330 190 1420 200 C1500 210 1560 230 1600 236 L1600 300 Z';
  let blocks = '';
  for (let x = 1000; x < 1600; x += 8 + rand() * 12) {
    const t = (x - 960) / 640;
    const ground = 300 - 86 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) + t * 30;
    const h = 8 + rand() * 26 + (Math.abs(x - 1300) < 60 ? 40 * rand() : 0);
    const w = 6 + rand() * 10;
    blocks += `M${f(x)} ${f(ground + 6)}V${f(ground - h)}h${f(w)}V${f(ground + 6)}Z`;
  }
  return { marin, marinNear, cityHill, blocks };
})();

const BayBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={BAY_BACK.marin} fill="#62788f" />
    <path d={BAY_BACK.marinNear} fill="#4b6178" />
    <path d={BAY_BACK.blocks} fill="#6d8299" />
    <path d={BAY_BACK.cityHill} fill="#556a81" />
  </svg>
);

// The Gorge: basalt cliffs, a tall plunge into mist, pines on every ledge

const GORGE = (() => {
  const rand = seeded(42);
  // Back wall the falls drop over, paler since it sits deeper in the mist
  const back = 'M380 520 L380 214 C430 204 470 210 520 200 L572 196 L574 206 L626 206 L628 196 L690 202 C740 208 790 200 830 212 L830 520 Z';
  const left = 'M0 520 L0 168 L40 160 L92 172 L140 150 L200 162 L250 146 L300 158 L360 150 L410 166 L452 172 L470 232 L488 300 L500 380 L516 470 L520 520 Z';
  const right = 'M1200 520 L1200 176 L1150 166 L1100 180 L1050 156 L990 170 L940 154 L880 164 L800 176 L752 182 L736 240 L716 320 L700 400 L688 470 L684 520 Z';
  // Columns of basalt on the inside faces
  let columns = '';
  for (let i = 0; i < 9; i++) {
    const x = 420 + i * 9 + rand() * 4;
    const y0 = 190 + (x - 420) * 1.8 + rand() * 20;
    columns += `M${f(x)} ${f(y0)}L${f(x + 6 + i * 1.2)} 520`;
    const xr = 780 - i * 9 - rand() * 4;
    const yr = 196 + (780 - xr) * 1.7 + rand() * 20;
    columns += `M${f(xr)} ${f(yr)}L${f(xr - 6 - i * 1.2)} 520`;
  }
  const pinesBack = pineRow(7, 392, 560, 206, 200, 22, 34, 13) + pineRow(8, 640, 820, 204, 210, 22, 34, 13);
  const pinesTop = pineRow(11, 10, 440, 166, 168, 46, 86, 24) + pineRow(12, 770, 1190, 178, 172, 46, 90, 24);
  const pinesFront =
    pine(40, 540, 330, 7) + pine(118, 548, 250, 6) + pine(190, 552, 170, 5) + pine(1168, 540, 340, 7) + pine(1088, 550, 240, 6) + pine(1020, 556, 160, 5);
  // Mossy ledges stepping down both walls
  let ledges = '';
  for (let i = 0; i < 14; i++) {
    const y = 200 + i * 22 + rand() * 10;
    const len = 30 + rand() * 70;
    const lx = 60 + rand() * 300 + (y - 200) * 0.25;
    ledges += `M${f(lx)} ${f(y)}q${f(len / 2)} ${f(-4 - rand() * 4)} ${f(len)} ${f(2)}`;
    const rx = 1140 - rand() * 300 - (y - 200) * 0.25;
    ledges += `M${f(rx)} ${f(y + 8)}q${f(-len / 2)} ${f(-4 - rand() * 4)} ${f(-len)} ${f(2)}`;
  }
  return { back, left, right, columns, ledges, pinesBack, pinesTop, pinesFront };
})();

const Falls: FC = () => (
  <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax meet" focusable="false">
    <defs>
      <linearGradient id="tp-fall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f4f6f4" stopOpacity="0.9" />
        <stop offset="0.75" stopColor="#e6ecea" stopOpacity="0.55" />
        <stop offset="1" stopColor="#e6ecea" stopOpacity="0.1" />
      </linearGradient>
      <radialGradient id="tp-mist" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#eef2f0" stopOpacity="0.55" />
        <stop offset="1" stopColor="#eef2f0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="tp-cliff-l" x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0" stopColor="#121a17" />
        <stop offset="0.75" stopColor="#22302b" />
        <stop offset="1" stopColor="#34453e" />
      </linearGradient>
      <linearGradient id="tp-cliff-r" x1="1" y1="0" x2="0" y2="0.3">
        <stop offset="0" stopColor="#121a17" />
        <stop offset="0.75" stopColor="#22302b" />
        <stop offset="1" stopColor="#34453e" />
      </linearGradient>
      <linearGradient id="tp-river" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9fb6b3" stopOpacity="0.55" />
        <stop offset="1" stopColor="#4d6463" stopOpacity="0.8" />
      </linearGradient>
    </defs>
    <path d={GORGE.back} fill="#3c4c47" />
    <path d={GORGE.pinesBack} fill="#33433d" />
    <path d="M574 204 C578 300 570 420 566 492 L634 492 C630 420 622 300 626 204 Z" fill="url(#tp-fall)" />
    <g data-falls-streaks="" stroke="#fff" strokeOpacity="0.38" strokeWidth="2.2">
      {[580, 591, 600, 610, 619].map((x, i) => (
        <path key={x} d={`M${x} ${204 + i * 6}V490`} strokeDasharray={`${16 + i * 4} ${24 + i * 3}`} />
      ))}
    </g>
    {/* The footbridge across the falls, the way Multnomah has one */}
    <path d="M512 318 H688 V354 H678 C662 336 634 327 600 327 C566 327 538 336 522 354 H512 Z" fill="#9aa8a2" />
    <path d="M512 312 H688 M512 318 H688" stroke="#b9c4bf" strokeWidth={1.6} />
    <path d="M524 312 V318 M548 312 V318 M572 312 V318 M596 312 V318 M620 312 V318 M644 312 V318 M668 312 V318" stroke="#b9c4bf" strokeWidth={1.2} />
    <path d="M520 520 C540 494 560 486 600 486 C640 486 664 494 684 520 Z" fill="url(#tp-river)" />
    <ellipse cx="600" cy="486" rx="150" ry="46" fill="url(#tp-mist)" />
    <path d={GORGE.left} fill="url(#tp-cliff-l)" />
    <path d={GORGE.right} fill="url(#tp-cliff-r)" />
    <path d={GORGE.ledges} stroke="#3d4f47" strokeWidth={2.2} strokeLinecap="round" opacity={0.7} fill="none" />
    <path d={GORGE.columns} stroke="#33433d" strokeWidth={2} opacity={0.8} />
    {/* A long thin ribbon down the left wall */}
    <path d="M286 160 C288 260 284 380 288 520" stroke="#e8eeec" strokeOpacity="0.45" strokeWidth="2.4" fill="none" />
    <path d={GORGE.pinesTop} fill="#151e1b" />
    <ellipse cx="600" cy="510" rx="260" ry="40" fill="url(#tp-mist)" />
    <path d={GORGE.pinesFront} fill="#0a100e" />
  </svg>
);

/** The mountain: a broad snowy cone that shows up behind everything */
const MOUNTAIN = (() => {
  const rand = seeded(1312);
  const cone = 'M0 300 L180 262 C300 230 420 160 520 96 C560 70 600 52 640 50 C690 50 720 66 760 92 C860 160 980 228 1120 262 L1600 300 Z';
  // Ragged snow line with gullies running down
  let snow = 'M520 96 C560 70 600 52 640 50 C690 50 720 66 760 92';
  const pts: [number, number][] = [];
  for (let x = 770; x >= 500; x -= 18) {
    const t = (x - 500) / 270;
    const y = 104 + Math.sin(t * Math.PI) * 52 + rand() * 30;
    pts.push([x, y]);
    pts.push([x - 9, y - 18 - rand() * 14]);
  }
  pts.forEach(([x, y]) => (snow += ` L${f(x)} ${f(y)}`));
  snow += ' Z';
  let gullies = '';
  for (let i = 0; i < 7; i++) {
    const x = 560 + i * 26 + rand() * 10;
    gullies += `M${f(x)} ${f(70 + rand() * 20)}L${f(x + (x - 640) * 0.5)} ${f(170 + rand() * 50)}`;
  }
  return { cone, snow, gullies };
})();

const GorgeBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={MOUNTAIN.cone} fill="#4c5b6a" />
    <path d={MOUNTAIN.snow} fill="#eef2f6" />
    {/* the far side of the peak catches less light */}
    <path d="M640 50 C690 50 720 66 760 92 L770 104 L700 150 L668 96 Z" fill="#c3cfda" />
    <path d={MOUNTAIN.gullies} stroke="#9aaab8" strokeWidth={2} opacity={0.8} />
    <path d="M0 300 L0 250 C140 220 260 236 380 246 C520 258 640 240 780 252 C940 266 1100 232 1260 240 C1400 248 1500 236 1600 244 L1600 300 Z" fill="#36444d" />
  </svg>
);

// Salt and spray paint: palms, a lifeguard stand and a mural wall at golden hour

/** A palm: curved ringed trunk and fronds with leaflets hanging off a curved spine */
const palm = (x: number, ground: number, h: number, lean: number, seed: number) => {
  const rand = seeded(seed);
  const tx = x + lean;
  const ty = ground - h;
  const cx = x + lean * 0.15;
  const cy = ground - h * 0.55;
  const at = (t: number) => ({
    x: (1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * tx,
    y: (1 - t) ** 2 * ground + 2 * (1 - t) * t * cy + t * t * ty,
  });
  let trunk = '';
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = at(t);
    const w = 9 - t * 4.5;
    left.push(`${f(p.x - w)} ${f(p.y)}`);
    right.unshift(`${f(p.x + w)} ${f(p.y)}`);
  }
  trunk = `M${left.join(' L')} L${right.join(' L')} Z`;
  let rings = '';
  for (let i = 1; i < 18; i++) {
    const t = i / 18;
    const p = at(t);
    const w = 9 - t * 4.5;
    rings += `M${f(p.x - w)} ${f(p.y)}l${f(w * 2)} ${f(-1.5)}`;
  }
  let fronds = '';
  const angles = [-176, -150, -128, -104, -76, -52, -26, -4, 20, 160];
  angles.forEach((deg, k) => {
    const a = (deg * Math.PI) / 180;
    const len = h * (0.32 + rand() * 0.12);
    const droop = len * (0.35 + rand() * 0.25) * (Math.abs(Math.cos(a)) + 0.3);
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.6 + droop;
    const mx = tx + Math.cos(a) * len * 0.55;
    const my = ty + Math.sin(a) * len * 0.6 - droop * 0.2;
    const pt = (t: number) => ({
      x: (1 - t) ** 2 * tx + 2 * (1 - t) * t * mx + t * t * ex,
      y: (1 - t) ** 2 * ty + 2 * (1 - t) * t * my + t * t * ey,
    });
    // spine
    fronds += `M${f(tx)} ${f(ty - 2)} Q${f(mx)} ${f(my - 2)} ${f(ex)} ${f(ey)} Q${f(mx)} ${f(my + 3)} ${f(tx)} ${f(ty + 3)} Z`;
    // leaflets hang from both sides, shorter toward the tip
    for (let i = 1; i < 11; i++) {
      const t = i / 11;
      const p = pt(t);
      const q = pt(Math.min(1, t + 0.04));
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const n = Math.hypot(dx, dy) || 1;
      const ll = len * 0.22 * (1 - t * 0.7);
      [-1, 1].forEach((s) => {
        const lx = p.x + (-dy / n) * ll * s * 0.6 + dx * 0.3;
        const ly = p.y + (dx / n) * ll * s * 0.6 + ll * 0.75;
        fronds += `M${f(p.x)} ${f(p.y)}L${f(lx)} ${f(ly)}L${f(q.x)} ${f(q.y)}Z`;
      });
    }
    if (k === 0) fronds += `M${f(tx - 6)} ${f(ty)}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z`;
  });
  return { trunk, rings, fronds };
};

const PALMS = [palm(150, 470, 360, 46, 3), palm(250, 470, 260, -34, 4), palm(1030, 470, 330, -52, 5), palm(1130, 470, 230, 28, 6)];

const BEACH = (() => {
  const rand = seeded(77);
  // A few leopard spots on the mural's big cat patch
  let spots = '';
  for (let i = 0; i < 16; i++) {
    const x = 900 + rand() * 120;
    const y = 368 + rand() * 60;
    spots += `M${f(x)} ${f(y)}a${f(3 + rand() * 3)} ${f(2 + rand() * 2)} 0 1 0 0.1 0Z`;
  }
  return { spots };
})();

const Beach: FC = () => (
  <svg viewBox="0 0 1200 470" preserveAspectRatio="xMidYMax meet" focusable="false">
    <defs>
      <clipPath id="tp-wall">
        <rect x="640" y="352" width="410" height="104" rx="3" />
      </clipPath>
    </defs>
    {/* Lifeguard stand */}
    <g>
      <path d="M402 470 L424 380 M466 470 L446 380 M410 440 H460" stroke="#3a2533" strokeWidth={5} />
      <path d="M470 392 L548 462" stroke="#3a2533" strokeWidth={6} />
      <path d="M470 380 L548 452" stroke="#4a3141" strokeWidth={2} />
      <rect x={392} y={326} width={94} height={56} rx={3} fill="#d9695e" />
      <rect x={392} y={348} width={94} height={8} fill="#f3c25a" />
      <rect x={404} y={334} width={30} height={12} rx={1} fill="#2a1c28" />
      <rect x={444} y={334} width={30} height={12} rx={1} fill="#2a1c28" />
      <path d="M380 328 L440 304 L498 328 Z" fill="#3aa3a8" />
      <path d="M440 304 V272" stroke="#3a2533" strokeWidth={2.5} />
      <path d="M441 273 L466 280 L441 288 Z" fill="#e8513f" />
    </g>
    {/* Mural wall and the street sign that says it all */}
    <rect x={636} y={348} width={418} height={110} rx={4} fill="#3b2a3d" />
    <g clipPath="url(#tp-wall)">
      <rect x={640} y={352} width={410} height={104} fill="#5a3d6a" />
      <circle cx={712} cy={410} r={52} fill="#f2a541" />
      <circle cx={712} cy={410} r={30} fill="#f7cf6b" />
      <path d="M640 446 C680 420 720 470 760 444 C800 418 840 470 880 444 L880 460 L640 460 Z" fill="#3fb6b2" />
      <path d="M640 430 C680 404 720 454 760 428 C800 402 840 454 880 428" stroke="#9fe3d9" strokeWidth={4} fill="none" />
      <path d="M790 352 L830 410 L800 410 L846 456 L860 456 L820 396 L850 396 L812 352 Z" fill="#e2508f" />
      <path d="M880 352 H1050 V456 H880 Z" fill="#e8893a" />
      <path d={BEACH.spots} fill="#2a1a24" />
      <path d="M880 352 C930 380 940 420 880 456 Z" fill="#2fa36b" />
      <circle cx={990} cy={392} r={11} fill="#f7e26b" />
      <circle cx={990} cy={392} r={4.5} fill="#1a1016" />
    </g>
    <rect x={632} y={344} width={426} height={7} rx={2} fill="#2a1c2b" />
    <path d="M610 470 V300" stroke="#2a1c28" strokeWidth={4} />
    <rect x={576} y={292} width={70} height={18} rx={2} fill="#2d7a4d" />
    <text
      x={611}
      y={305.5}
      textAnchor="middle"
      fontFamily="system-ui, sans-serif"
      fontSize="12"
      fontWeight="700"
      letterSpacing="1.5"
      fill="#f4f1e8"
    >
      DREAM
    </text>
    {/* Palms in front, backlit so mostly silhouette */}
    {PALMS.map((p, i) => (
      <g key={i}>
        <path d={p.trunk} fill="#1d1220" />
        <path d={p.rings} stroke="#3a2638" strokeWidth={1.4} />
        <path d={p.fronds} fill="#170e1a" />
      </g>
    ))}
    <path d="M0 470 L0 452 C200 440 420 448 600 452 C800 456 1000 444 1200 450 L1200 470 Z" fill="#2c1b27" />
  </svg>
);

const BEACH_BACK = (() => {
  const rand = seeded(902);
  let towers = '';
  let stripes = '';
  [
    [1060, 70, 150],
    [1150, 56, 196],
    [1230, 64, 170],
    [1320, 52, 214],
    [1400, 70, 140],
    [180, 50, 120],
    [250, 60, 150],
  ].forEach(([x, w, h]) => {
    const top = 290 - h;
    towers += `M${x} 292V${top}h${w}V292Z`;
    for (let y = top + 8; y < 288; y += 7) stripes += `M${x + 3} ${y}h${w - 6}`;
    if (rand() > 0.4) towers += `M${x + w * 0.3} ${top}v-10h${w * 0.4}v10Z`;
  });
  return { towers, stripes };
})();

const BeachBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={BEACH_BACK.towers} fill="#7a5576" />
    <path d={BEACH_BACK.stripes} stroke="#9c7392" strokeWidth={1.4} />
    {/* a pier running out to sea and one sailboat taking its time */}
    <path d="M420 272 H760" stroke="#6a4a68" strokeWidth={4} />
    <path d="M440 272 V292 M500 272 V292 M560 272 V292 M620 272 V292 M680 272 V292 M740 272 V292" stroke="#6a4a68" strokeWidth={2.5} />
    <path d="M880 286 L922 286 L916 292 L886 292 Z M900 284 V238 L922 282 Z M898 284 L884 252 L898 252 Z" fill="#8a6386" />
  </svg>
);

// Pittsburgh: the gothic classroom tower at blue hour

const CATHEDRAL = (() => {
  const rand = seeded(9);
  // Sections from the bottom up: [left, right, top]
  const tiers: [number, number, number][] = [
    [266, 434, 168],
    [282, 418, 110],
    [296, 404, 72],
    [310, 390, 48],
  ];
  let body = 'M150 640 V572 H266 V560 H434 V572 H550 V640 Z';
  let piers = '';
  let recess = '';
  let pinnacles = '';
  let lights: Lights[] = [];
  let bottom = 560;
  tiers.forEach(([l, r, top], i) => {
    body += `M${l} ${bottom + 1}V${top}H${r}V${bottom + 1}Z`;
    const n = Math.max(3, Math.round((r - l) / 18));
    const step = (r - l) / n;
    for (let k = 0; k <= n; k++) {
      const x = l + k * step;
      // each pier rises a little past the setback and ends in a spike
      piers += `M${f(x - 3)} ${bottom}V${top - 4}h6V${bottom}Z`;
      pinnacles += `M${f(x - 3.5)} ${top - 4}L${f(x)} ${top - 15 - (k % 2 ? 0 : 5)}L${f(x + 3.5)} ${top - 4}Z`;
      if (k < n) {
        recess += `M${f(x + 3)} ${bottom}V${top + 4}h${f(step - 6)}V${bottom}Z`;
        lights.push(lightsIn(rand, x + 5, x + step - 3, top + 10, bottom - 6, 0.2 - i * 0.03, 3, 4, step, 10));
      }
    }
    bottom = top;
  });
  // Wing windows: tall pointed arches
  let arches = '';
  for (let x = 166; x < 540; x += 22) {
    if (x > 254 && x < 440) continue;
    arches += `M${x} 628V594a5 7 0 0 1 10 0V628Z`;
  }
  let crenels = '';
  for (let x = 150; x < 552; x += 12) {
    if (x > 260 && x < 440) continue;
    crenels += `M${x} 572v-6h6v6Z`;
  }
  lights = [mergeLights(lights)];
  // Trees out front and a couple of street lamps
  const trees = (seed: number, y: number, r0: number, r1: number, xs: number[]) => {
    const tr = seeded(seed);
    let d = '';
    xs.forEach((x) => {
      for (let k = 0; k < 5; k++) {
        const r = r0 + tr() * (r1 - r0);
        const cx = x + (tr() - 0.5) * r * 1.6;
        const cy = y - r * (0.6 + tr() * 0.8);
        d += `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;
      }
      d += `M${x - 3} ${y}V${y - r0}h6V${y}Z`;
    });
    return d;
  };
  return {
    body,
    piers,
    recess,
    pinnacles,
    arches,
    crenels,
    lights: lights[0],
    treesBack: trees(31, 640, 22, 34, [120, 210, 500, 600]),
    treesFront: trees(32, 650, 26, 44, [40, 170, 300, 410, 560, 680]),
  };
})();

const Tower: FC = () => (
  <svg viewBox="0 0 700 650" preserveAspectRatio="xMidYMax meet" focusable="false">
    <defs>
      <linearGradient id="tp-stone" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3a3448" />
        <stop offset="0.55" stopColor="#2a2536" />
        <stop offset="1" stopColor="#1d1a27" />
      </linearGradient>
    </defs>
    <path d={CATHEDRAL.body} fill="url(#tp-stone)" />
    <path d={CATHEDRAL.recess} fill="#17141f" />
    <path d={CATHEDRAL.piers} fill="url(#tp-stone)" />
    <path d={CATHEDRAL.pinnacles} fill="#2e2939" />
    <path d={CATHEDRAL.crenels} fill="#2a2535" />
    <path d={CATHEDRAL.arches} fill="#ffb977" opacity={0.55} />
    <LitWindows lights={CATHEDRAL.lights} warm="#ffc27e" />
    <path d={CATHEDRAL.treesBack} fill="#1b1825" />
    <g stroke="#2a2433" strokeWidth={2.5}>
      <path d="M232 650V604M478 650V604" />
    </g>
    <g fill="#ffd29a">
      <circle cx={232} cy={602} r={3.2} />
      <circle cx={478} cy={602} r={3.2} />
    </g>
    <circle cx={232} cy={602} r={12} fill="#ffb067" opacity={0.18} />
    <circle cx={478} cy={602} r={12} fill="#ffb067" opacity={0.18} />
    <path d={CATHEDRAL.treesFront} fill="#100e16" />
  </svg>
);

const PGH_BACK = (() => {
  const rand = seeded(64);
  const hill = 'M0 300 L0 170 C120 120 240 110 360 150 C460 184 520 200 600 190 C700 178 760 120 880 112 C1000 104 1100 160 1220 176 C1340 192 1460 150 1600 140 L1600 300 Z';
  // Houses stacked up the slopes, with a few lit windows
  let houses = '';
  let lit = '';
  const yAt = (x: number) => {
    const t = x / 1600;
    return 190 - 60 * Math.sin(t * Math.PI * 2.2 + 0.6) * 0.8;
  };
  for (let x = 20; x < 1580; x += 14 + rand() * 16) {
    for (let row = 0; row < 3; row++) {
      if (rand() > 0.6) continue;
      const y = yAt(x) + 14 + row * 22 + rand() * 6;
      const w = 9 + rand() * 6;
      houses += `M${f(x)} ${f(y)}h${f(w)}v-8l${f(-w / 2)} -6l${f(-w / 2)} 6Z`;
      if (rand() > 0.55) lit += `M${f(x + 2)} ${f(y - 6)}h2.5v2.5h-2.5Z`;
    }
  }
  return { hill, houses, lit };
})();

const TowerBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={PGH_BACK.hill} fill="#2f2a44" />
    <path d={PGH_BACK.houses} fill="#3a3452" />
    <path d={PGH_BACK.lit} fill="#ffbf7a" opacity={0.75} />
    {/* One of the city's many golden arch bridges */}
    <g fill="none" stroke="#8c7346" opacity={0.85}>
      <path d="M980 262 Q1110 196 1240 262" strokeWidth={4} />
      <path d="M960 250 H1260" strokeWidth={3} />
      <path d="M1010 250V246M1040 250V228M1070 250V216M1100 250V210M1130 250V210M1160 250V216M1190 250V228M1220 250V246" strokeWidth={1.5} />
    </g>
    <path d="M0 300 V262 C300 256 600 268 900 262 C1200 256 1400 266 1600 262 V300 Z" fill="#241f35" />
  </svg>
);

// New York: Lower Manhattan, Midtown and the Chrysler crown all lit up

const NYC = (() => {
  const rand = seeded(1977);
  const W = 1600;
  const river = 560;
  type Block = { x: number; w: number; h: number; set?: number };
  const row = (seed: number, hMin: number, hMax: number, avoid: [number, number][]) => {
    const r = seeded(seed);
    const list: Block[] = [];
    let x = -10;
    while (x < W) {
      const w = 30 + r() * 52;
      const blocked = avoid.some(([a, b]) => x + w > a && x < b);
      const h = blocked ? hMin * 0.6 + r() * 40 : hMin + r() * (hMax - hMin);
      list.push({ x, w, h, set: r() > 0.6 ? 0.25 + r() * 0.25 : undefined });
      x += w + 1 + r() * 4;
    }
    return list;
  };
  const shape = (b: Block) => {
    const top = river - b.h;
    if (!b.set) return `M${f(b.x)} ${river}V${f(top)}h${f(b.w)}V${river}Z`;
    const inset = b.w * b.set;
    const mid = top + b.h * 0.22;
    return `M${f(b.x)} ${river}V${f(mid)}h${f(inset)}V${f(top)}h${f(b.w - inset * 2)}V${f(mid)}h${f(inset)}V${river}Z`;
  };
  const mid = row(5, 150, 290, [[1110, 1200]]);
  const front = row(6, 70, 210, [[250, 360], [740, 860], [1090, 1210]]);
  const midBody = mid.map(shape).join('');
  const frontBody = front.map(shape).join('');
  const midLights = mergeLights(mid.map((b) => lightsIn(rand, b.x + 4, b.x + b.w - 3, river - b.h + 10, river - 4, 0.16)));
  const frontLights = mergeLights(front.map((b) => lightsIn(rand, b.x + 4, b.x + b.w - 3, river - b.h + 10, river - 4, 0.24)));
  // Rooftop water tanks on a handful of the low ones
  let tanks = '';
  front.forEach((b) => {
    if (b.h > 150 || b.set || rand() > 0.45) return;
    const x = b.x + b.w * (0.25 + rand() * 0.4);
    const y = river - b.h;
    tanks += `M${f(x)} ${y}v-6h1.5v6ZM${f(x + 10)} ${y}v-6h1.5v6ZM${f(x - 1)} ${y - 6}v-12h14v12ZM${f(x - 1)} ${y - 18}l7 -6l7 6Z`;
  });

  // One World Trade: square base, tapering faces that meet as triangles, then the spire
  const owt = {
    body: 'M268 560V474H332V560Z M270 474L285 168H315L330 474Z',
    facet: 'M270 474L300 168L330 474Z',
    top: 'M283 168h34v-10h-34Z M298.5 158V44h3V158Z M295 120h10v4h-10Z',
  };
  // Empire State: stacked setbacks, a fluted crown and the mast
  const esb =
    'M740 560V362H752V300H764V240H776V204H786V180H792V156H808V180H814V204H824V240H836V300H848V362H860V560Z M796 156V112H804V156Z M798.6 112L799.4 62H800.6L801.4 112Z';
  let esbFlutes = '';
  for (let x = 779; x < 822; x += 5) esbFlutes += `M${x} 206V236`;
  // Chrysler: shaft, setbacks, then terraced arches with sunburst windows and the needle
  const cx = 1150;
  let chrysler = `M${cx - 50} 560V472H${cx - 34}V300H${cx - 28}V258H${cx + 28}V300H${cx + 34}V472H${cx + 50}V560Z`;
  let crownWindows = '';
  for (let k = 0; k < 6; k++) {
    const w = 54 - k * 8.5;
    const y = 262 - k * 17;
    const r = w / 2;
    chrysler += `M${f(cx - r)} ${f(y)}A${f(r)} ${f(r * 1.05)} 0 0 1 ${f(cx + r)} ${f(y)}Z`;
    // triangles pointing out along each arch
    const n = Math.max(3, 7 - k);
    for (let j = 0; j < n; j++) {
      const a = Math.PI * (0.12 + (0.76 * j) / (n - 1));
      const ox = cx - Math.cos(a) * r * 0.78;
      const oy = y - Math.sin(a) * r * 0.82;
      const ix = cx - Math.cos(a) * r * 0.45;
      const iy = y - Math.sin(a) * r * 0.5;
      const px = -Math.sin(a) * 2.2;
      const py = Math.cos(a) * 2.2;
      crownWindows += `M${f(ix + px)} ${f(iy - py)}L${f(ox)} ${f(oy)}L${f(ix - px)} ${f(iy + py)}Z`;
    }
  }
  chrysler += `M${cx - 2} 166L${cx} 70L${cx + 2} 166Z`;
  let chryslerStripes = '';
  for (let x = cx - 30; x <= cx + 30; x += 6) chryslerStripes += `M${x} 304V470`;
  // Reflections in the river under the brightest buildings
  let glints = '';
  for (let x = 0; x < W; x += 5 + rand() * 9) {
    const len = 4 + rand() * 18;
    glints += `M${f(x)} ${f(river + 6 + rand() * 30)}h${f(len)}`;
  }
  return { river, midBody, frontBody, midLights, frontLights, tanks, owt, esb, esbFlutes, chrysler, crownWindows, chryslerStripes, glints, cx };
})();

const Skyline: FC = () => (
  <svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax meet" focusable="false">
    <defs>
      <linearGradient id="tp-owt" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1c2238" />
        <stop offset="1" stopColor="#2c3552" />
      </linearGradient>
      <radialGradient id="tp-crown" cx="0.5" cy="0.6" r="0.5">
        <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.35" />
        <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Mid row: paler and dimmer, a few blocks back */}
    <path d={NYC.midBody} fill="#191d30" />
    <LitWindows lights={NYC.midLights} dim={0.55} />
    <path d={NYC.esb} fill="#1a1e31" />
    <path d={NYC.esbFlutes} stroke="#ffe4b8" strokeOpacity={0.5} strokeWidth={1.6} />
    <rect x={790} y={160} width={20} height={18} fill="#ffe4b8" opacity={0.35} />
    {/* Front row */}
    <path d={NYC.frontBody} fill="#0c0e18" />
    <path d={NYC.tanks} fill="#0c0e18" />
    <LitWindows lights={NYC.frontLights} />
    <path d={NYC.owt.body} fill="#121729" />
    <path d={NYC.owt.facet} fill="url(#tp-owt)" />
    <path d="M270 474L300 168L330 474" stroke="#4a5a80" strokeOpacity={0.5} strokeWidth={1} fill="none" />
    <path d={NYC.owt.top} fill="#121729" />
    <circle cx={NYC.cx} cy={210} r={70} fill="url(#tp-crown)" />
    <path d={NYC.chrysler} fill="#141826" />
    <path d={NYC.chryslerStripes} stroke="#ffc88a" strokeOpacity={0.22} strokeWidth={1.4} />
    <path d={NYC.crownWindows} fill="#ffe7bd" opacity={0.92} />
    <g fill="#ff4b3a">
      <circle cx={300} cy={44} r={2.6} />
      <circle cx={800} cy={62} r={2.2} />
      <circle cx={NYC.cx} cy={72} r={2} />
    </g>
    <circle cx={300} cy={44} r={9} fill="#ff4b3a" opacity={0.2} />
    {/* River, with the city smeared across it */}
    <rect x={0} y={NYC.river} width={1600} height={40} fill="#080a12" />
    <path d={NYC.glints} stroke="#ffc88a" strokeOpacity={0.4} strokeWidth={1.6} />
    <rect x={0} y={NYC.river} width={1600} height={2} fill="#2a2f45" />
  </svg>
);

const NYC_BACK = (() => {
  const rand = seeded(311);
  let body = '';
  let lit = '';
  for (let x = 0; x < 1600; ) {
    const w = 24 + rand() * 40;
    const h = 30 + rand() * 90;
    body += `M${f(x)} 300V${f(300 - h)}h${f(w)}V300Z`;
    for (let y = 300 - h + 6; y < 296; y += 9) {
      for (let wx = x + 3; wx < x + w - 3; wx += 7) if (rand() > 0.9) lit += `M${f(wx)} ${f(y)}h2v3h-2Z`;
    }
    x += w + 2 + rand() * 10;
  }
  return { body, lit };
})();

const SkylineBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={NYC_BACK.body} fill="#20253c" />
    <path d={NYC_BACK.lit} fill="#ffcf9a" opacity={0.45} />
    {/* A stone bridge with twin arches, way off in the haze */}
    <g fill="#272c46">
      <path d="M360 300V168h44V300Z M640 300V168h44V300Z" />
      <path d="M364 168l20 -22l20 22Z M644 168l20 -22l20 22Z" />
    </g>
    <path d="M370 300V214a7 12 0 0 1 14 0V300Z M390 300V214a7 12 0 0 1 14 0V300Z M650 300V214a7 12 0 0 1 14 0V300Z M670 300V214a7 12 0 0 1 14 0V300Z" fill="#141829" />
    <g fill="none" stroke="#3a4062" strokeWidth={1.4}>
      <path d="M220 262 Q300 250 382 172 Q522 262 662 172 Q760 250 860 262" />
      <path d="M200 262 H880" strokeWidth={3} />
    </g>
  </svg>
);

// Seattle: the Needle over the waterfront, a wooded bluff and the Olympics in the haze

const NEEDLE = (() => {
  const rand = seeded(1962);
  const cx = 600;
  const base = 600;
  // Legs pinch in at the waist and flare back out under the top house, like an hourglass
  const leg = (s: number, foot: number, waist: number, top: number) =>
    `M${f(cx + s * foot)} ${base} C${f(cx + s * foot * 0.38)} 470 ${f(cx + s * waist * 0.9)} 390 ${f(cx + s * waist)} 342 C${f(cx + s * waist * 1.2)} 270 ${f(cx + s * top * 0.8)} 206 ${f(cx + s * top)} 162`;
  let outer = '';
  let inner = '';
  [-1, 1].forEach((s) => {
    outer += leg(s, 168, 25, 80) + leg(s, 152, 21, 72);
    inner += leg(s, 62, 12, 44);
  });
  // Glass band under the roof, split into panes
  let mullions = '';
  for (let x = 518; x <= 682; x += 9) mullions += `M${x} 106L${f(x + (x - cx) * 0.04)} 124`;

  // Downtown off to the left, a few blocks deep
  let towers = '';
  let towerLines = '';
  [
    [36, 46, 190],
    [86, 38, 240],
    [128, 58, 330],
    [190, 44, 270],
    [238, 52, 210],
    [294, 36, 300],
    [334, 48, 180],
    [386, 40, 140],
  ].forEach(([x, w, h]) => {
    const top = base - h;
    towers += `M${x} ${base}V${top}h${w}V${base}Z`;
    if (h > 260) towers += `M${x + w * 0.35} ${top}v-14h${w * 0.3}v14Z`;
    for (let y = top + 10; y < base - 6; y += 9) towerLines += `M${x + 4} ${y}h${w - 8}`;
  });

  // Low waterfront apartments with rows of balconies
  let flats = '';
  let balconies = '';
  for (let x = 150; x < 940; ) {
    const w = 46 + rand() * 70;
    const h = 34 + rand() * 46;
    flats += `M${f(x)} ${base}V${f(base - h)}h${f(w)}V${base}Z`;
    for (let y = base - h + 8; y < base - 6; y += 10) balconies += `M${f(x + 4)} ${f(y)}h${f(w - 8)}`;
    x += w + 2 + rand() * 8;
  }

  // The bluff on the right and its pines
  const bluff = 'M820 600 C870 520 930 430 1000 392 C1070 356 1140 344 1200 340 V600 Z';
  const bluffPines = pineRow(1964, 860, 1200, 470, 344, 70, 132, 22);
  const frontPines = pine(1150, 620, 300, 7) + pine(1080, 626, 210, 6) + pine(40, 624, 230, 6);
  return { cx, outer, inner, mullions, towers, towerLines, flats, balconies, bluff, bluffPines, frontPines };
})();

const Needle: FC = () => (
  <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax meet" focusable="false">
    <defs>
      <linearGradient id="tp-glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2c3a48" />
        <stop offset="0.5" stopColor="#6d8aa3" />
        <stop offset="1" stopColor="#24303c" />
      </linearGradient>
    </defs>
    <path d={NEEDLE.towers} fill="#34404d" />
    <path d={NEEDLE.towerLines} stroke="#43505e" strokeWidth={1.2} />
    {/* Core, then the far legs a shade paler than the near ones */}
    <rect x={NEEDLE.cx - 7} y={150} width={14} height={450} fill="#a8b3bd" />
    <rect x={NEEDLE.cx - 3} y={248} width={6} height={12} rx={1.5} fill="#e7b25e" />
    <g fill="none" strokeLinecap="round">
      <path d={NEEDLE.outer} stroke="#b9c3cc" strokeWidth={7} />
      <path d={NEEDLE.inner} stroke="#d5dce2" strokeWidth={8} />
    </g>
    <rect x={NEEDLE.cx - 32} y={337} width={64} height={9} rx={2} fill="#c6cfd7" />
    <rect x={NEEDLE.cx - 118} y={540} width={236} height={7} fill="#97a3ae" />
    {/* Top house: flared halo, glass band, the gold roof and the spire */}
    <path d="M524 162 L676 162 L712 138 L488 138 Z" fill="#c9d1d8" />
    <path d="M540 162 L660 162 L690 146 L510 146 Z" fill="#9aa6b1" />
    <rect x={484} y={126} width={232} height={12} rx={2} fill="#e3e8ec" />
    <path d="M512 126 L688 126 L682 104 L518 104 Z" fill="url(#tp-glass)" />
    <path d={NEEDLE.mullions} stroke="#1c2631" strokeWidth={1.2} opacity={0.7} />
    <path d="M500 104 H700 L688 95 H512 Z" fill="#d9a65e" />
    <path d="M540 95 Q600 64 660 95 Z" fill="#c98f47" />
    <path d="M596.5 80 L599 16 H601 L603.5 80 Z" fill="#c6cfd7" />
    <circle cx={600} cy={15} r={2.6} fill="#ff4b3a" />
    <path d={NEEDLE.flats} fill="#2b333c" />
    <path d={NEEDLE.balconies} stroke="#ffd09a" strokeWidth={1.4} strokeDasharray="3 9" opacity={0.35} />
    <path d={NEEDLE.bluff} fill="#203029" />
    <path d={NEEDLE.bluffPines} fill="#15211c" />
    <rect x={0} y={592} width={1200} height={8} fill="#2a3138" />
    <path d={NEEDLE.frontPines} fill="#0a100e" />
  </svg>
);

const SEATTLE_BACK = (() => {
  const olympics = jaggedRange(98, 1100, 300, 230, 120, 34);
  // Rainier sits off to the side, huge and pale, the way it hangs over the city
  const rainier = 'M980 300 L1060 262 C1140 220 1210 160 1270 130 C1300 116 1330 112 1356 120 C1400 136 1440 176 1500 220 C1540 250 1570 270 1600 280 L1600 300 Z';
  const rainierSnow = 'M1214 160 C1240 140 1260 128 1270 130 C1300 116 1330 112 1356 120 C1390 132 1420 158 1452 186 L1430 182 L1416 196 L1392 170 L1370 190 L1350 160 L1326 184 L1300 156 L1280 176 L1258 158 L1238 172 Z';
  return { olympics, rainier, rainierSnow };
})();

const SeattleBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={SEATTLE_BACK.olympics.d} fill="#7b8fa4" />
    <path d={SEATTLE_BACK.olympics.snow} fill="#dfe7ef" opacity={0.9} />
    <path d={SEATTLE_BACK.rainier} fill="#8a9db1" />
    <path d={SEATTLE_BACK.rainierSnow} fill="#eef3f8" />
    <path d="M0 300 V262 C200 252 420 266 640 258 C860 250 1100 266 1300 260 C1440 256 1520 262 1600 260 V300 Z" fill="#5a6e82" />
    {/* A ferry halfway across the Sound */}
    <g fill="#e9edf0">
      <path d="M420 276 H520 L512 286 H430 Z" />
      <path d="M440 276 V266 H500 V276 Z M456 266 V258 H486 V266 Z" />
    </g>
    <path d="M430 286 H512" stroke="#2f3d4b" strokeWidth={2} />
    <path d="M466 258 V250" stroke="#2f3d4b" strokeWidth={2} />
  </svg>
);

// The Cascades: Rainier filling the sky over a valley of firs

const PEAK = (() => {
  const rand = seeded(4392);
  const W = 1200;
  const H = 520;
  // A volcano profile: broad shoulders, long concave flanks, steeper on the right
  const topAt = (x: number) => {
    const d = Math.max(0, Math.abs(x - 610) - 26);
    const s = x < 610 ? 215 : 180;
    return H - 452 / (1 + (d / s) ** 1.6);
  };
  const xs: number[] = [];
  for (let x = 0; x <= W; x += 12) xs.push(x);
  const tops = xs.map((x, i) => topAt(x) + (i % 2 ? rand() * 4 : 0));
  let mountain = `M0 ${H}`;
  xs.forEach((x, i) => (mountain += ` L${x} ${f(tops[i])}`));
  mountain += ` L${W} ${H} Z`;
  // Snow comes a long way down, thinning to nothing at both ends and broken into
  // glacier tongues along its lower edge
  const x0 = 330;
  const x1 = 910;
  const snowIdx = xs.map((_, i) => i).filter((i) => xs[i] >= x0 && xs[i] <= x1);
  const depth = snowIdx.map((i, k) => {
    const t = (xs[i] - x0) / (x1 - x0);
    const taper = Math.sin(Math.PI * t) ** 0.8;
    const tongue = k % 4 === 1 ? 34 + rand() * 30 : k % 4 === 2 ? 14 + rand() * 12 : rand() * 8;
    return taper * (70 + 70 * Math.exp(-(((xs[i] - 610) / 150) ** 2)) + tongue);
  });
  const snowEdge = (list: number[]) =>
    [...list].reverse().map((i) => ` L${xs[i]} ${f(tops[i] + depth[snowIdx.indexOf(i)])}`).join('');
  let snow = `M${xs[snowIdx[0]]} ${f(tops[snowIdx[0]])}`;
  snowIdx.forEach((i) => (snow += ` L${xs[i]} ${f(tops[i])}`));
  snow += `${snowEdge(snowIdx)} Z`;
  // The far side of the summit is in shadow
  const right = snowIdx.filter((i) => xs[i] >= 636);
  let shade = `M${xs[right[0]]} ${f(tops[right[0]])}`;
  right.forEach((i) => (shade += ` L${xs[i]} ${f(tops[i])}`));
  shade += `${snowEdge(right)} Z`;
  let crevasses = '';
  for (let i = 0; i < 10; i++) {
    const x = 470 + i * 30 + rand() * 12;
    const y = topAt(x) + 10 + rand() * 14;
    crevasses += `M${f(x)} ${f(y)}l${f((x - 610) * 0.1)} ${f(24 + rand() * 30)}`;
  }
  const rockShade = `M644 ${f(topAt(644))} ${xs
    .filter((x) => x > 644)
    .map((x) => `L${x} ${f(topAt(x))}`)
    .join(' ')} L${W} ${H} L780 ${H} C720 400 680 260 644 ${f(topAt(644))} Z`;
  // Forested ridges in front, then the big firs at the edges
  const ridgeFar = 'M0 520 L0 372 C140 340 260 360 380 392 C480 418 560 410 660 392 C780 370 900 380 1020 360 C1100 348 1160 352 1200 350 V520 Z';
  const ridgeNear = 'M0 520 L0 430 C120 410 240 420 360 446 C460 468 560 470 660 456 C780 440 900 444 1020 430 C1100 422 1160 424 1200 420 V520 Z';
  const firsFar = pineRow(4401, 0, 1200, 382, 356, 26, 46, 16);
  const firsNear = pineRow(4402, 0, 1200, 448, 424, 44, 80, 22);
  const firsFront =
    pine(50, 540, 360, 7) + pine(132, 548, 260, 6) + pine(210, 552, 170, 5) + pine(1160, 540, 380, 7) + pine(1076, 548, 270, 6) + pine(1000, 554, 180, 5);
  return { mountain, snow, shade, crevasses, rockShade, ridgeFar, ridgeNear, firsFar, firsNear, firsFront };
})();

const Peak: FC = () => (
  <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={PEAK.mountain} fill="#5a6878" />
    <path d={PEAK.rockShade} fill="#46535f" />
    <path d={PEAK.snow} fill="#e6ecf1" />
    <path d={PEAK.shade} fill="#b9c6d3" />
    <path d={PEAK.crevasses} stroke="#9fb0c0" strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
    <path d={PEAK.ridgeFar} fill="#2b3b38" />
    <path d={PEAK.firsFar} fill="#22322e" />
    <path d={PEAK.ridgeNear} fill="#18241f" />
    <path d={PEAK.firsNear} fill="#121c18" />
    <path d={PEAK.firsFront} fill="#090f0c" />
  </svg>
);

const PEAK_BACK = (() => ({
  far: jaggedRange(311, 1600, 300, 220, 110, 40, 2),
  near: jaggedRange(312, 1600, 300, 262, 70, 34, 2),
}))();

const PeakBack: FC = () => (
  <svg viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax meet" focusable="false">
    <path d={PEAK_BACK.far.d} fill="#5f7486" />
    <path d={PEAK_BACK.near.d} fill="#46596a" />
  </svg>
);

export const Landmark: FC<{ id: LandmarkId }> = memo(({ id }) => {
  switch (id) {
    case 'bridge':
      return <Bridge />;
    case 'falls':
      return <Falls />;
    case 'beach':
      return <Beach />;
    case 'tower':
      return <Tower />;
    case 'skyline':
      return <Skyline />;
    case 'needle':
      return <Needle />;
    case 'peak':
      return <Peak />;
  }
});

export const Backdrop: FC<{ id: LandmarkId }> = memo(({ id }) => {
  switch (id) {
    case 'bridge':
      return <BayBack />;
    case 'falls':
      return <GorgeBack />;
    case 'beach':
      return <BeachBack />;
    case 'tower':
      return <TowerBack />;
    case 'skyline':
      return <SkylineBack />;
    case 'needle':
      return <SeattleBack />;
    case 'peak':
      return <PeakBack />;
  }
});

// Foreground: grass, reeds and rocks as a repeating tile (used as a CSS background)
const FOREGROUND_W = 1200;
const FOREGROUND_H = 160;
export const FOREGROUND_RATIO = FOREGROUND_W / FOREGROUND_H;

export const foregroundTile = (() => {
  const rand = seeded(311);
  let d = '';
  for (let i = 0; i < 150; i++) {
    const x = rand() * FOREGROUND_W;
    const h = 20 + rand() ** 2 * 110;
    const lean = (rand() - 0.5) * h * 0.6;
    const w = 2 + rand() * 4;
    d += `M${f(x - w)} ${FOREGROUND_H} Q${f(x + lean * 0.3)} ${f(FOREGROUND_H - h * 0.6)} ${f(x + lean)} ${f(FOREGROUND_H - h)} Q${f(x + lean * 0.4 + w)} ${f(FOREGROUND_H - h * 0.5)} ${f(x + w)} ${FOREGROUND_H} Z`;
  }
  [80, 470, 910].forEach((x, i) => {
    const r = 50 + i * 14;
    d += `M${x - r} ${FOREGROUND_H} Q${x - r * 0.8} ${FOREGROUND_H - r * 0.9} ${x} ${FOREGROUND_H - r * 0.75} Q${x + r * 0.9} ${FOREGROUND_H - r * 0.7} ${x + r} ${FOREGROUND_H} Z`;
  });
  d += `M0 ${FOREGROUND_H - 14} H${FOREGROUND_W} V${FOREGROUND_H} H0 Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${FOREGROUND_W} ${FOREGROUND_H}' preserveAspectRatio='none'><path fill='#040405' d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

// Water: short glints that thicken toward the viewer, tiled and slid sideways
const WATER_W = 900;
const WATER_H = 120;
export const WATER_RATIO = WATER_W / WATER_H;

export const waterTile = (() => {
  const rand = seeded(57);
  let d = '';
  for (let i = 0; i < 160; i++) {
    const t = rand() ** 1.6;
    const y = 2 + t * (WATER_H - 6);
    const len = 6 + t * 40 + rand() * 14;
    const x = rand() * (WATER_W - len);
    d += `M${f(x)} ${f(y)}h${f(len)}v${f(0.8 + t * 1.6)}h${f(-len)}Z`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${WATER_W} ${WATER_H}' preserveAspectRatio='none'><path fill='#fff' d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

export type Dot = { x: number; y: number; s: number; o: number; t: number };

export const makeDots = (seed: number, count: number): Dot[] => {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand(),
    s: rand(),
    o: rand(),
    t: rand(),
  }));
};
