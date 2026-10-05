import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import {
  TAU,
  clamp,
  ease,
  hash,
  lerp,
  morph,
  morphPair,
  mulberry,
  noise1,
  tween,
  type Pt,
} from '../riso/kit';
import {
  UK,
  block,
  bokashi,
  cartouche,
  kasumi,
  kasumiPath,
  keyline,
  mix,
  petalPts,
  poly,
  printBorder,
  rainPath,
  rgba,
  ribbon,
  sampleSmooth,
  woodGrain,
} from '../styles/ukiyo';

/*
 * Ronin, staged as a run of prints. A cherry petal falls through the rain onto a wanderer's
 * straw hat. Under a great moon he meets a rival across an arched bridge: hands go to hilts,
 * an extreme close-up of an eye under the brim, the hat tilts and the petal lifts off between
 * them. The rain freezes, the petal becomes one white-and-vermilion stroke of the blade across
 * the whole frame, the print splits and petals burst. When it rejoins the two have passed each
 * other: the ronin sheathes, the rival's hat falls in halves and he kneels, and the two halves
 * of the petal settle on the river under the moon.
 */

/* times */
const T_LAND = 2.8;
const T_WALK0 = 3.4;
const T_WALK1 = 7.2;
const T_RTILT = 7.2;
const T_RGRIP = 7.6;
const T_NARROW = 9.9;
const T_TILT = 10.15;
const T_LIFT = 10.35;
const T_CROUCH0 = 10.6;
const T_CROUCH1 = 11.3;
const T_FREEZE = 11.55;
const T_SLASH0 = 11.95;
const T_SWAP = 12.05;
const T_SLASH1 = 12.12;
const T_SPLIT1 = 13.0;
const T_NOTO0 = 13.45;
const T_NOTO1 = 13.95;
const T_NOTO2 = 14.6;
const T_HATCUT = 13.75;
const T_KNEEL0 = 14.3;
const T_KNEEL1 = 14.95;
const T_AWAY = 15.3;
const T_WATER = 16.3;
const T_TITLE = 16.8;
const DURATION = 19;

/* world layout */
const GROUND = 700;
const WATER = 786;
const BR0 = 1400;
const BR1 = 2600;
const BR_H = 140;
const RONIN_X0 = 700;
const RONIN_A = 1560;
const RIVAL_A = 2440;
const RONIN_B = 2150;
const RIVAL_B = 1850;
const MID: Pt = [2000, 470];
const MOON: Pt = [2000, 300];
const MOON_R = 250;
const HILT_U: Pt = [0.934, -0.357];
const MOUTH: Pt = [50, -200];
const BLADE = 150;
const SKIN = '#efd6b8';

const deckY = (x: number) =>
  x <= BR0 || x >= BR1 ? GROUND : GROUND - BR_H * Math.sin((Math.PI * (x - BR0)) / (BR1 - BR0));

interface Flower {
  x: number;
  y: number;
  r: number;
  a: number;
}

interface State {
  gWarm: CanvasPattern;
  gBlue: CanvasPattern;
  gStraw: CanvasPattern;
  branches: Path2D;
  trunk: Path2D;
  flowers: Path2D;
  flowerHearts: Path2D;
  buds: Path2D;
  hills: Path2D[];
  kas: Path2D[];
  petal: Pt[];
  bankL: Path2D;
  bankR: Path2D;
  grass: Path2D;
  deck: Path2D;
  rails: Path2D;
  posts: Path2D;
  pillars: Path2D;
  braces: Path2D;
  giboshi: Path2D;
  lantern: Path2D;
  lanternLight: Path2D;
  kasuri: Path2D;
  checker: Path2D;
  slash: Pt[];
  slashCore: Pt[];
  splatter: Pt[];
  hatL: Pt[];
  hatR: Pt[];
}

/* ---------- motion ---------- */

const roninX = (t: number) => {
  if (t < T_WALK0) return RONIN_X0;
  if (t < T_WALK1) {
    const k = (t - T_WALK0) / (T_WALK1 - T_WALK0);
    const e =
      k < 0.12
        ? (k * k) / 0.24
        : k > 0.88
          ? 1 - ((1 - k) * (1 - k)) / 0.24
          : 0.06 + (k - 0.12) * (0.88 / 0.76);
    return lerp(RONIN_X0, RONIN_A, clamp(e));
  }
  if (t < T_SWAP) return RONIN_A;
  return lerp(RONIN_B, 2390, tween(t, T_AWAY, DURATION, ease.inOutSine));
};
const walkPhase = (x: number) => ((x - RONIN_X0) / 62) * Math.PI;
const walking = (t: number) =>
  t > T_WALK0 && t < T_WALK1
    ? clamp(Math.min((t - T_WALK0) / 0.5, (T_WALK1 - t) / 0.4))
    : t > T_AWAY
      ? clamp((t - T_AWAY) / 0.8) * 0.8
      : 0;

/** Sword state in figure-local coords: tsuba position, blade direction, visible blade length */
interface Sword {
  p: Pt;
  phi: number;
  vis: number;
}
const sheathed = (off: number): Sword => ({
  p: [MOUTH[0] + HILT_U[0] * off, MOUTH[1] + HILT_U[1] * off],
  phi: Math.atan2(HILT_U[1], HILT_U[0]) + Math.PI,
  vis: off,
});
const EXT: Sword = { p: [118, -262], phi: -0.45, vis: BLADE };
const roninSword = (t: number): Sword => {
  if (t < T_SWAP) return sheathed(10 * tween(t, T_FREEZE - 0.1, T_SLASH0, ease.inOutSine));
  if (t < T_NOTO0) {
    // follow-through, settling
    const k = tween(t, T_SWAP, T_SPLIT1, ease.outCubic);
    return {
      p: [EXT.p[0] + 18 * (1 - k), EXT.p[1] - 24 * (1 - k)],
      phi: EXT.phi - 0.35 * (1 - k),
      vis: BLADE,
    };
  }
  const end = sheathed(BLADE);
  if (t < T_NOTO1) {
    // turn the blade over the head toward the scabbard mouth
    const k = tween(t, T_NOTO0, T_NOTO1, ease.inOutCubic);
    const target = end.phi - TAU;
    return {
      p: [lerp(EXT.p[0], end.p[0], k), lerp(EXT.p[1], end.p[1], k) - Math.sin(k * Math.PI) * 40],
      phi: lerp(EXT.phi, target, k),
      vis: BLADE,
    };
  }
  return sheathed(BLADE * (1 - tween(t, T_NOTO1, T_NOTO2, ease.inOutQuint)));
};
const rivalSword = (t: number): Sword =>
  sheathed(t < T_SWAP ? 54 * tween(t, T_SLASH0 - 0.15, T_SWAP, ease.inQuint) : 54);

/** Where the hero petal is (world), and its spin */
const hatSpot = (t: number): Pt => {
  const x = roninX(t);
  const bob = -Math.abs(Math.cos(walkPhase(x))) * 4 * walking(t);
  return [x + 58, deckY(x) - 309 + bob];
};
const petalAt = (t: number): { p: Pt; rot: number } => {
  if (t < T_LAND) {
    const k = t / T_LAND;
    const land = hatSpot(T_LAND);
    const e = ease.inOutSine(k);
    const x = lerp(1060, land[0], e) + Math.sin(k * 7.5) * 46 * (1 - e);
    const y = lerp(150, land[1], ease.inSine(k) * 0.4 + e * 0.6);
    return { p: [x, y], rot: Math.sin(k * 6) * 1.1 + k * 2.4 };
  }
  if (t < T_LIFT) return { p: hatSpot(t), rot: 2.4 + Math.sin(t * 3) * 0.06 };
  const start = hatSpot(T_LIFT);
  const hang = T_FREEZE + 0.15;
  if (t < hang) {
    const k = (t - T_LIFT) / (hang - T_LIFT);
    const up = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 140;
    const x = lerp(start[0], MID[0], ease.inOutSine(k)) + Math.sin(k * 9) * 40 * (1 - k);
    const y = lerp(start[1], MID[1], ease.inOutSine(k)) - up;
    return { p: [x, y], rot: 2.4 + k * 5 + Math.sin(k * 8) * 0.5 };
  }
  return { p: MID, rot: 7.4 };
};

/** rain time: slows to a stop before the draw, resumes after the split */
const rainTime = (t: number) => {
  const a = T_FREEZE - 0.3;
  const b = T_FREEZE + 0.2;
  if (t < a) return t;
  if (t < b) {
    const k = (t - a) / (b - a);
    return a + (b - a) * (k - (k * k) / 2);
  }
  const frozen = a + (b - a) * 0.5;
  if (t < T_SPLIT1) return frozen;
  const k = t - T_SPLIT1;
  return frozen + (k < 0.6 ? (k * k) / 1.2 : k - 0.3);
};

/* ---------- camera ---------- */

interface Cam {
  x: number;
  y: number;
  z: number;
  rot: number;
}
const lerpCam = (a: Cam, b: Cam, k: number, dip = 0): Cam => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) * (1 - dip * Math.sin(k * Math.PI)),
  rot: lerp(a.rot, b.rot, k),
});

const EYE: Pt = [RONIN_A + 18, deckY(RONIN_A) - 294];
const camera = (t: number): Cam => {
  const pa = petalAt(Math.min(t, T_LAND)).p;
  const camA: Cam = { x: pa[0] - 10, y: pa[1] + 40, z: 3.4, rot: 0 };
  const follow: Cam = { x: roninX(t) + 300, y: 470, z: 1, rot: 0 };
  const w1: Cam = { x: 2000, y: 440, z: 0.92, rot: 0.05 };
  const rival: Cam = { x: RIVAL_A - 20, y: 360, z: 2.7, rot: 0.02 };
  const eye: Cam = { x: EYE[0] + 4, y: EYE[1] - 2, z: 13, rot: 0 };
  const w2: Cam = { x: 2000, y: 470, z: 1.05, rot: -0.06 };
  const push: Cam = { x: MID[0], y: MID[1] + 10, z: 1.38, rot: -0.07 };
  const w4: Cam = { x: 2000, y: 515, z: 1.0, rot: 0 };
  if (t < T_LAND) return camA;
  if (t < 4.8) return lerpCam(camA, follow, tween(t, T_LAND, 4.8, ease.inOutCubic));
  if (t < 5.2) return follow;
  if (t < 6.8) return lerpCam(follow, w1, tween(t, 5.2, 6.8, ease.inOutSine));
  if (t < 8.1) return lerpCam(w1, rival, tween(t, 6.9, 8.1, ease.inOutCubic));
  if (t < 9.5) return lerpCam(rival, eye, tween(t, 8.25, 9.5, ease.inOutCubic), 0.8);
  if (t < 10.35) {
    const k = tween(t, 9.5, 10.35);
    return { ...eye, z: eye.z * (1 + 0.04 * k) };
  }
  if (t < 11.3)
    return lerpCam({ ...eye, z: eye.z * 1.04 }, w2, tween(t, 10.35, 11.3, ease.inOutCubic));
  if (t < T_SWAP) {
    const c = lerpCam(w2, push, tween(t, 11.3, T_SWAP, ease.inOutSine));
    return c;
  }
  if (t < T_SPLIT1) {
    const j = Math.exp(-(t - T_SWAP) * 8) * 9;
    return { ...push, x: push.x + j * Math.sin(t * 90), y: push.y + j * Math.cos(t * 77) };
  }
  const c = lerpCam(push, w4, tween(t, T_SPLIT1, 14.6, ease.inOutCubic));
  return { ...c, z: c.z * (1 + 0.05 * tween(t, 14.6, DURATION, ease.inOutSine)) };
};

/* ---------- setup pieces ---------- */

function buildTree(rng: () => number) {
  const branches = new Path2D();
  const trunk = new Path2D();
  const flowers = new Path2D();
  const hearts = new Path2D();
  const buds = new Path2D();
  const fl: Flower[] = [];
  // trunk: a leaning, knotted trunk
  const tpts: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    tpts.push([240 + k * 90 + Math.sin(k * 5) * 18, GROUND + 20 - k * 470]);
  }
  ribbon(tpts, 60, 26, 3, 0.25, trunk);
  const grow = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const pts: Pt[] = [[x, y]];
    let cx = x;
    let cy = y;
    let ca = a;
    const n = 10;
    for (let i = 0; i < n; i++) {
      ca += (rng() - 0.5) * 0.5;
      cx += Math.cos(ca) * (len / n);
      cy += Math.sin(ca) * (len / n);
      pts.push([cx, cy]);
    }
    ribbon(pts, w, w * 0.35, depth * 13 + rng() * 9, 0.25, depth === 0 ? trunk : branches);
    if (depth < 3) {
      const kids = depth === 0 ? 4 : 2 + Math.floor(rng() * 2);
      for (let k = 0; k < kids; k++) {
        const at = pts[3 + Math.floor(rng() * (pts.length - 4))];
        grow(
          at[0],
          at[1],
          ca + (rng() - 0.5) * 1.6 + (k % 2 ? 0.5 : -0.5),
          len * (0.5 + rng() * 0.25),
          w * 0.55,
          depth + 1
        );
      }
      grow(cx, cy, ca + (rng() - 0.5) * 0.6, len * 0.6, w * 0.6, depth + 1);
    } else {
      for (let k = 0; k < 7; k++) {
        const at = pts[Math.floor(rng() * pts.length)];
        fl.push({
          x: at[0] + (rng() - 0.5) * 34,
          y: at[1] + (rng() - 0.5) * 30,
          r: 7 + rng() * 6,
          a: rng() * TAU,
        });
      }
    }
  };
  const top = tpts[tpts.length - 1];
  grow(top[0], top[1], -0.35, 380, 24, 0);
  grow(top[0] - 20, top[1] + 60, -2.6, 220, 18, 1);
  grow(top[0] + 8, top[1] + 30, -1.2, 260, 18, 1);
  for (const f of fl) {
    for (let p = 0; p < 5; p++) {
      const a = f.a + (p * TAU) / 5;
      const px = f.x + Math.cos(a) * f.r * 0.55;
      const py = f.y + Math.sin(a) * f.r * 0.55;
      flowers.moveTo(px + f.r * 0.5, py);
      flowers.ellipse(px, py, f.r * 0.55, f.r * 0.42, a, 0, TAU);
    }
    hearts.moveTo(f.x + f.r * 0.22, f.y);
    hearts.arc(f.x, f.y, f.r * 0.22, 0, TAU);
    if (rng() < 0.3) {
      const bx = f.x + (rng() - 0.5) * 40;
      const by = f.y + (rng() - 0.5) * 40;
      buds.moveTo(bx + 3, by);
      buds.arc(bx, by, 3, 0, TAU);
    }
  }
  return { branches, trunk, flowers, hearts, buds };
}

function buildBridge() {
  const deck = new Path2D();
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = BR0 - 30; x <= BR1 + 30; x += 12) {
    top.push([x, deckY(x)]);
    bot.push([x, deckY(x) + 28]);
  }
  poly([...top, ...bot.reverse()], deck);
  const rails = new Path2D();
  const railTop: Pt[] = [];
  const railMid: Pt[] = [];
  for (let x = BR0; x <= BR1; x += 12) {
    railTop.push([x, deckY(x) - 58]);
    railMid.push([x, deckY(x) - 30]);
  }
  ribbon(railTop, 9, 9, 3, 0.1, rails);
  ribbon(railMid, 5, 5, 4, 0.1, rails);
  const posts = new Path2D();
  for (let x = BR0; x <= BR1 + 1; x += 100) posts.rect(x - 6, deckY(x) - 62, 12, 64);
  const giboshi = new Path2D();
  for (const x of [BR0, BR1]) {
    const y = deckY(x) - 62;
    giboshi.moveTo(x - 9, y);
    giboshi.bezierCurveTo(x - 14, y - 12, x - 4, y - 18, x, y - 30);
    giboshi.bezierCurveTo(x + 4, y - 18, x + 14, y - 12, x + 9, y);
    giboshi.closePath();
  }
  const pillars = new Path2D();
  const braces = new Path2D();
  const px = [1580, 1780, 2220, 2420];
  for (const x of px) pillars.rect(x - 14, deckY(x) + 20, 28, 960 - deckY(x));
  for (let i = 0; i < px.length; i += 2) {
    const a = px[i];
    const b = px[i + 1];
    braces.moveTo(a, deckY(a) + 60);
    braces.lineTo(b, WATER - 20);
    braces.moveTo(b, deckY(b) + 60);
    braces.lineTo(a, WATER - 20);
  }
  return { deck, rails, posts, giboshi, pillars, braces };
}

/* ---------- drawing ---------- */

function drawTree(c: Ctx, s: State, t: number, lw: number) {
  const sway = Math.sin(t * 0.9) * 0.012;
  c.save();
  c.translate(310, GROUND);
  c.rotate(sway);
  c.translate(-310, -GROUND);
  c.fillStyle = mix(UK.sumi, UK.indigo, 0.25);
  c.fill(s.trunk);
  c.fill(s.branches);
  keyline(c, s.trunk, lw * 0.6, 2);
  c.fillStyle = UK.pink;
  c.fill(s.flowers);
  c.strokeStyle = rgba(UK.vermilion, 0.6);
  c.lineWidth = lw * 0.35;
  c.stroke(s.flowers);
  c.fillStyle = UK.washiLight;
  c.fill(s.flowerHearts);
  c.fillStyle = UK.vermilion;
  c.fill(s.buds);
  c.restore();
}

function drawWater(c: Ctx, s: State, t: number, lw: number) {
  const water = new Path2D();
  water.rect(BR0 - 200, WATER, BR1 - BR0 + 400, 600);
  block(c, water, mix(UK.prussian, UK.indigo, 0.3), s.gBlue, 0.9);
  c.save();
  c.clip(water);
  const g = c.createLinearGradient(0, WATER, 0, WATER + 60);
  g.addColorStop(0, rgba(UK.pale, 0.55));
  g.addColorStop(1, rgba(UK.pale, 0));
  c.fillStyle = g;
  c.fillRect(BR0 - 200, WATER, BR1 - BR0 + 400, 60);
  // reflections of the vermilion pillars, broken by ripples
  c.fillStyle = rgba(UK.vermilion, 0.42);
  for (const x of [1580, 1780, 2220, 2420]) {
    for (let y = WATER + 4; y < WATER + 200; y += 9) {
      const w = 26 + Math.sin(y * 0.3 + t * 3) * 6;
      c.fillRect(x - w / 2 + Math.sin(y * 0.15 - t * 2) * 6, y, w, 5);
    }
  }
  // flow lines
  c.strokeStyle = rgba(UK.pale, 0.75);
  c.lineWidth = lw * 0.8;
  c.lineCap = 'round';
  c.beginPath();
  for (let j = 0; j < 12; j++) {
    const y = WATER + 14 + j * j * 2.2 + j * 8;
    const sp = 90 + j * 12;
    const off = (t * (20 + j * 4)) % sp;
    for (let x = BR0 - 200 + off - sp; x < BR1 + 200; x += sp) {
      const w = sp * (0.4 + hash(j * 7 + Math.floor(x / sp)) * 0.3);
      c.moveTo(x, y);
      c.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
    }
  }
  c.stroke();
  c.restore();
}

function drawBridge(c: Ctx, s: State, lw: number) {
  const ver = UK.vermilion;
  block(c, s.pillars, mix(ver, UK.sumi, 0.25), s.gWarm, 0.8, Math.PI / 2);
  keyline(c, s.pillars, lw, 3);
  c.strokeStyle = mix(ver, UK.sumi, 0.35);
  c.lineWidth = lw * 3;
  c.stroke(s.braces);
  block(c, s.deck, ver, s.gWarm, 0.9);
  keyline(c, s.deck, lw * 1.1, 4);
  block(c, s.posts, ver, s.gWarm, 0.6);
  keyline(c, s.posts, lw * 0.8, 5);
  c.fillStyle = ver;
  c.fill(s.rails);
  keyline(c, s.rails, lw * 0.7, 6);
  block(c, s.giboshi, UK.gold, null);
  keyline(c, s.giboshi, lw * 0.7, 7);
}

/* ---------- sky, moon, rain ---------- */

function drawSkyBase(c: Ctx, night: number) {
  c.fillStyle = rgba(UK.grey, 0.25);
  c.fillRect(-20, -20, 1640, 940);
  c.fillStyle = rgba(UK.indigo, 0.35 * night);
  c.fillRect(-20, -20, 1640, 940);
  bokashi(c, -20, -20, 1640, 460, mix(UK.indigo, UK.night, 0.4), 0.95, 0);
  bokashi(c, -20, 900, 1640, 520, mix(UK.pink, UK.grey, 0.3), 0.3, 0);
}

function drawHills(c: Ctx, s: State, cam: Cam, t: number) {
  const par = [0.06, 0.12];
  s.hills.forEach((h, i) => {
    c.save();
    const zz = 1 + (cam.z - 1) * (0.12 + i * 0.1);
    c.translate(800, 600);
    c.scale(zz, zz);
    c.translate(-800 - cam.x * par[i] + 100, -600 - (cam.y - 470) * 0.15);
    c.fillStyle = i === 0 ? mix(UK.grey, UK.indigo, 0.45) : mix(UK.indigo, UK.night, 0.3);
    c.globalAlpha = i === 0 ? 0.55 : 0.75;
    c.fill(h);
    c.restore();
  });
  kasumi(
    c,
    s.kas[0],
    1400 - cam.x * 0.08 - t * 10,
    520 - (cam.y - 470) * 0.15,
    UK.washiLight,
    0.45,
    UK.washiLight
  );
  kasumi(
    c,
    s.kas[1],
    300 - cam.x * 0.1 + t * 6,
    330 - (cam.y - 470) * 0.1,
    mix(UK.washi, UK.pink, 0.4),
    0.4,
    UK.washiLight
  );
}

function drawMoon(c: Ctx, s: State) {
  const [mx, my] = MOON;
  const halo = c.createRadialGradient(mx, my, MOON_R * 0.9, mx, my, MOON_R * 1.7);
  halo.addColorStop(0, rgba(UK.washiLight, 0.35));
  halo.addColorStop(1, rgba(UK.washiLight, 0));
  c.fillStyle = halo;
  c.fillRect(mx - MOON_R * 1.8, my - MOON_R * 1.8, MOON_R * 3.6, MOON_R * 3.6);
  const disc = new Path2D();
  disc.arc(mx, my, MOON_R, 0, TAU);
  block(c, disc, mix(UK.washiLight, UK.gold, 0.12), s.gWarm, 0.35);
  c.save();
  c.clip(disc);
  bokashi(c, mx - MOON_R, my + MOON_R, MOON_R * 2, my - MOON_R * 0.2, UK.pink, 0.35, 0);
  c.restore();
}

/** Broad sheets of rain sweeping across, a curtain over the print */
function drawRain(c: Ctx, t: number, rt: number, heavy: number) {
  c.save();
  for (let i = 0; i < 3; i++) {
    const x = ((rt * (90 + i * 30) + i * 700) % 2600) - 600;
    c.fillStyle = rgba(UK.grey, 0.08 + 0.05 * heavy);
    c.beginPath();
    c.moveTo(x, -20);
    c.lineTo(x + 260 + i * 60, -20);
    c.lineTo(x + 80 + i * 60, 920);
    c.lineTo(x - 180, 920);
    c.closePath();
    c.fill();
  }
  const rain = rainPath(rt, 7, Math.round(260 + heavy * 120), 0.22, 1500, 80);
  c.strokeStyle = rgba(UK.sumi, 0.42);
  c.lineWidth = 1.3;
  c.lineCap = 'round';
  c.stroke(rain);
  const rain2 = rainPath(rt * 1.2, 11, Math.round(90 + heavy * 70), 0.22, 1900, 150);
  c.strokeStyle = rgba(UK.indigo, 0.55);
  c.lineWidth = 2.3;
  c.stroke(rain2);
  c.restore();
  void t;
}

/* ---------- figures ---------- */

interface Pose {
  walk: number;
  amp: number;
  crouch: number;
  kneel: number;
  grip: number;
  sword: Sword;
  hatTilt: number;
  hat: boolean;
  narrow: number;
  t: number;
}

const hatPts = (): Pt[] => {
  const q = (a: Pt, b: Pt, c2: Pt, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const k = i / n;
      const u = 1 - k;
      return [
        u * u * a[0] + 2 * u * k * b[0] + k * k * c2[0],
        u * u * a[1] + 2 * u * k * b[1] + k * k * c2[1],
      ] as Pt;
    });
  return [
    ...q([-108, -296], [-46, -350], [4, -364], 14),
    ...q([4, -364], [50, -350], [112, -298], 14),
    ...q([112, -298], [2, -312], [-108, -296], 14),
  ];
};

function drawHat(c: Ctx, s: State, pts: Pt[], rival: boolean, lw: number) {
  const hat = poly(pts);
  if (rival) {
    block(c, hat, mix(UK.sumi, UK.indigo, 0.35), s.gWarm, 0.35, -0.4);
  } else {
    block(c, hat, mix(UK.sand, UK.ochre, 0.45), s.gStraw, 1, -0.4);
  }
  c.save();
  c.clip(hat);
  c.strokeStyle = rival ? rgba(UK.pale, 0.25) : rgba(UK.sumi, 0.45);
  c.lineWidth = lw * 0.45;
  c.beginPath();
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    c.moveTo(4, -364);
    c.lineTo(lerp(-110, 114, k), -296 - Math.sin(k * Math.PI) * 14);
  }
  c.stroke();
  if (rival) {
    // lacquered vermilion rim
    c.strokeStyle = UK.vermilion;
    c.lineWidth = lw * 3;
    c.beginPath();
    c.moveTo(-108, -296);
    c.quadraticCurveTo(2, -312, 112, -298);
    c.stroke();
  }
  c.restore();
  keyline(c, hat, lw * 1.1, rival ? 29 : 19);
}

function drawSword(c: Ctx, sw: Sword, lw: number, rival: boolean) {
  const dx = Math.cos(sw.phi);
  const dy = Math.sin(sw.phi);
  const nx = -dy;
  const ny = dx;
  const [px, py] = sw.p;
  if (sw.vis > 0.5) {
    const L = sw.vis;
    const tip = L >= BLADE - 0.5;
    const sori = L * 0.05;
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const bend = Math.sin(k * Math.PI) * sori * (tip ? 1 : 0.3);
      pts.push([px + dx * L * k + nx * bend, py + dy * L * k + ny * bend]);
    }
    const blade = ribbon(pts, 7, tip ? 1 : 7, 71, 0.02);
    c.fillStyle = mix(UK.pale, UK.washiLight, 0.55);
    c.fill(blade);
    c.strokeStyle = rgba(UK.washiLight, 0.9);
    c.lineWidth = lw * 0.6;
    c.beginPath();
    c.moveTo(pts[0][0] + nx * 1.5, pts[0][1] + ny * 1.5);
    for (const p of pts) c.lineTo(p[0] + nx * 1.5, p[1] + ny * 1.5);
    c.stroke();
    keyline(c, blade, lw * 0.6, 72);
  }
  // hilt (tsuka) with its diamond wrap
  const H = 58;
  const end: Pt = [px - dx * H, py - dy * H];
  const hp = ribbon([[px, py], end], 10, 9, 31, 0.02);
  c.fillStyle = rival ? mix(UK.vermilion, UK.sumi, 0.3) : UK.washiLight;
  c.fill(hp);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.55;
  c.beginPath();
  for (let i = 0; i <= 7; i++) {
    const k = i / 7;
    const sgn = i % 2 ? 1 : -1;
    const x = px - dx * H * k + nx * sgn * 4.2;
    const y = py - dy * H * k + ny * sgn * 4.2;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  keyline(c, hp, lw * 0.6, 32);
  c.fillStyle = UK.sumi;
  c.beginPath();
  c.arc(end[0], end[1], 5.5, 0, TAU);
  c.fill();
  // tsuba
  c.save();
  c.translate(px, py);
  c.rotate(sw.phi);
  c.fillStyle = UK.gold;
  c.beginPath();
  c.ellipse(0, 0, 3.5, 12, 0, 0, TAU);
  c.fill();
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.6;
  c.stroke();
  c.restore();
}

/** A swordsman, feet at (x, y), facing dir (1 = right) */
function drawFigure(
  c: Ctx,
  s: State,
  kind: 'ronin' | 'rival',
  x: number,
  y: number,
  dir: number,
  pose: Pose,
  lw: number
) {
  const ronin = kind === 'ronin';
  const t = pose.t;
  const sw = Math.sin(pose.walk) * pose.amp;
  const bob = -Math.abs(Math.cos(pose.walk)) * 4 * pose.amp;
  const cr = pose.crouch;
  const kn = pose.kneel;
  c.save();
  c.translate(x, y + bob);
  c.scale(dir, 1);
  const a = sw * 13 + cr * 22;
  const b = -sw * 13 - cr * 20;

  /* feet */
  const feet = new Path2D();
  feet.rect(lerp(16 + a, 70, kn), -12, 30, 12);
  feet.rect(lerp(-42 + b, -70, kn), -12, 30, 12);
  c.fillStyle = UK.sumi;
  c.fill(feet);

  /* hakama: stand -> crouch -> kneel */
  const top = -164 + cr * 24;
  const stand: Pt[] = [
    [-50, top],
    [54, top],
    [76 + a, -10],
    [8 + a * 0.5, -10],
    [3, -70 + cr * 20],
    [-4 + b * 0.5, -10],
    [-74 + b, -10],
  ];
  const kneel: Pt[] = [
    [-50, -64],
    [54, -64],
    [104, -40],
    [104, -4],
    [20, -4],
    [-20, -8],
    [-84, -4],
  ];
  const hpts = stand.map(
    (p, i) => [lerp(p[0], kneel[i][0], kn), lerp(p[1], kneel[i][1], kn)] as Pt
  );
  const hak = poly(hpts);
  block(
    c,
    hak,
    ronin ? mix(UK.grey, UK.sumi, 0.4) : mix(UK.indigo, UK.sumi, 0.2),
    s.gBlue,
    0.7,
    Math.PI / 2
  );
  c.save();
  c.clip(hak);
  // pleats and stripes
  c.strokeStyle = rgba(UK.sumi, 0.6);
  c.lineWidth = lw * 0.6;
  c.beginPath();
  for (const [f0, f1] of [
    [0.18, 0.12],
    [0.4, 0.32],
    [0.62, 0.7],
    [0.82, 0.9],
  ] as Pt[]) {
    c.moveTo(lerp(hpts[0][0], hpts[1][0], f0), hpts[0][1] + 4);
    c.lineTo(lerp(hpts[6][0], hpts[2][0], f1), lerp(hpts[6][1], hpts[2][1], f1) - 4);
  }
  c.stroke();
  if (ronin) {
    c.strokeStyle = rgba(UK.washiLight, 0.2);
    c.lineWidth = lw * 0.5;
    c.beginPath();
    for (let i = -100; i < 120; i += 9) {
      c.moveTo(i * 0.6, top);
      c.lineTo(i, 0);
    }
    c.stroke();
  }
  c.restore();
  keyline(c, hak, lw, 11);

  /* upper body: drops with the crouch and kneel, leans forward */
  c.save();
  const lean = cr * 0.08 + kn * 0.26;
  c.translate(0, cr * 24 + kn * 100);
  c.translate(0, -164);
  c.rotate(lean);
  c.translate(0, 164);

  const obi = new Path2D();
  obi.rect(-50, -172, 104, 14);
  c.fillStyle = ronin ? UK.ochre : UK.vermilion;
  c.fill(obi);
  keyline(c, obi, lw * 0.7, 12);

  /* scabbards through the obi */
  const u = HILT_U;
  const saya = (mx: number, my: number, len: number, w: number, seed: number) => {
    const p = ribbon(
      [
        [mx - u[0] * len, my - u[1] * len],
        [mx, my],
      ],
      w * 0.9,
      w,
      seed,
      0.02
    );
    c.fillStyle = ronin ? UK.sumi : mix(UK.sumi, UK.vermilion, 0.35);
    c.fill(p);
    c.strokeStyle = rgba(UK.pale, 0.5);
    c.lineWidth = lw * 0.5;
    c.beginPath();
    c.moveTo(mx - u[0] * len + 3, my - u[1] * len - 2);
    c.lineTo(mx - 4, my - 4);
    c.stroke();
  };
  saya(44, -186, 118, 9, 21);
  saya(MOUTH[0], MOUTH[1], 196, 11, 22);
  drawSword(
    c,
    { p: [44 + u[0] * 2, -186 + u[1] * 2], phi: Math.atan2(u[1], u[0]) + Math.PI, vis: 0 },
    lw * 0.9,
    !ronin
  );

  /* haori with folds */
  const fl = Math.sin(t * 5.2 + (ronin ? 0 : 2)) * 8 + noise1(t * 2, ronin ? 3 : 5) * 7;
  const cloak = poly(
    sampleSmooth(
      [
        [-42, -288],
        [36, -290],
        [54, -232],
        [62, -150],
        [14, -142],
        [-46, -146],
        [-74 - fl, -156],
        [-76 - fl * 0.6, -200],
        [-58, -254],
      ],
      4,
      true
    )
  );
  block(
    c,
    cloak,
    ronin ? UK.indigo : mix(UK.sand, UK.ochre, 0.35),
    ronin ? s.gBlue : s.gWarm,
    0.8,
    Math.PI / 2
  );
  c.save();
  c.clip(cloak);
  c.fillStyle = ronin ? rgba(UK.washiLight, 0.7) : rgba(UK.sumi, 0.75);
  c.fill(ronin ? s.kasuri : s.checker);
  c.strokeStyle = ronin ? rgba(UK.night, 0.75) : rgba(UK.sumi, 0.6);
  c.lineWidth = lw * 0.9;
  c.beginPath();
  c.moveTo(-28, -282);
  c.quadraticCurveTo(-46, -220, -54 - fl * 0.5, -150);
  c.moveTo(-6, -270);
  c.quadraticCurveTo(-14, -210, -8, -146);
  c.moveTo(16, -262);
  c.quadraticCurveTo(28, -210, 30, -146);
  c.moveTo(-58, -200);
  c.quadraticCurveTo(-40, -196, -30, -184);
  c.stroke();
  // front edge of the haori over the kimono
  c.strokeStyle = rgba(UK.washiLight, 0.55);
  c.lineWidth = lw * 1.2;
  c.beginPath();
  c.moveTo(20, -284);
  c.quadraticCurveTo(40, -220, 50, -152);
  c.stroke();
  c.restore();
  keyline(c, cloak, lw, 13);

  /* head and face */
  if (ronin) {
    const face = poly(
      sampleSmooth(
        [
          [-8, -303],
          [24, -303],
          [27.5, -298],
          [28.5, -294],
          [32, -289],
          [27.5, -287.6],
          [28.2, -285],
          [26.6, -283.2],
          [26.4, -279.5],
          [17, -275],
          [6, -273],
          [-6, -283],
        ],
        4,
        true
      )
    );
    c.fillStyle = SKIN;
    c.fill(face);
    c.save();
    c.clip(face);
    c.fillStyle = rgba(UK.sumi, 0.3);
    c.fillRect(-10, -304, 46, 5);
    c.fillStyle = rgba(UK.vermilion, 0.13);
    c.beginPath();
    c.ellipse(15, -285.5, 6, 3.5, 0, 0, TAU);
    c.fill();
    // ear
    c.strokeStyle = rgba(UK.sumi, 0.7);
    c.lineWidth = lw * 0.4;
    c.beginPath();
    c.moveTo(-1, -294);
    c.quadraticCurveTo(-5, -290, -1, -285);
    c.stroke();
    c.restore();
    // eye under the brim: almond, iris, heavy upper lid; it narrows before the draw
    const eh = 3.1 * (1 - pose.narrow * 0.6);
    const eye = new Path2D();
    eye.moveTo(12, -294);
    eye.quadraticCurveTo(17, -294 - eh * 1.3, 22.5, -294.4);
    eye.quadraticCurveTo(17, -294 + eh * 0.8, 12, -294);
    eye.closePath();
    c.fillStyle = UK.washiLight;
    c.fill(eye);
    c.save();
    c.clip(eye);
    c.fillStyle = UK.sumi;
    c.beginPath();
    c.arc(19.2, -294.2, 1.7, 0, TAU);
    c.fill();
    c.restore();
    c.strokeStyle = UK.sumi;
    c.lineCap = 'round';
    c.lineWidth = lw * 0.5;
    c.stroke(eye);
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(11.5, -294);
    c.quadraticCurveTo(17, -294 - eh * 1.4, 23.5, -294.8);
    c.stroke();
    // brow, set hard
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(11, -298.4 + pose.narrow * 0.6);
    c.quadraticCurveTo(17, -300, 24, -299.2 + pose.narrow * 0.4);
    c.stroke();
    // nostril, mouth, cheek
    c.lineWidth = lw * 0.4;
    c.beginPath();
    c.moveTo(27, -289);
    c.lineTo(25, -288.4);
    c.moveTo(22, -283.4);
    c.lineTo(27, -283.6);
    c.moveTo(8, -287);
    c.quadraticCurveTo(10, -283, 14, -281);
    c.stroke();
    keyline(c, face, lw * 0.6, 14);
  } else {
    const head = new Path2D();
    head.ellipse(6, -306, 22, 26, 0, 0, TAU);
    c.fillStyle = SKIN;
    c.fill(head);
    keyline(c, head, lw * 0.7, 15);
    const hair = new Path2D();
    hair.moveTo(-17, -306);
    hair.bezierCurveTo(-16, -336, 22, -340, 26, -312);
    hair.lineTo(10, -318);
    hair.closePath();
    hair.moveTo(-4, -330);
    hair.lineTo(24, -338);
    hair.lineTo(26, -331);
    hair.lineTo(-2, -325);
    hair.closePath();
    c.fillStyle = UK.sumi;
    c.fill(hair);
    // fierce eye, brow, moustache
    c.strokeStyle = UK.sumi;
    c.lineCap = 'round';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(12, -312);
    c.lineTo(26, -308);
    c.stroke();
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(15, -306);
    c.quadraticCurveTo(20, -308.5, 25, -305);
    c.moveTo(18, -294);
    c.quadraticCurveTo(24, -296, 28, -291);
    c.stroke();
    c.fillStyle = UK.sumi;
    c.beginPath();
    c.arc(21, -305.6, 1.3, 0, TAU);
    c.fill();
  }
  const collar = poly([
    [2, -278],
    [18, -278],
    [9, -258],
  ]);
  c.fillStyle = UK.washiLight;
  c.fill(collar);
  keyline(c, collar, lw * 0.5, 16);

  /* katana: blade, tsuba and hilt */
  drawSword(c, pose.sword, lw, !ronin);

  /* near arm in its hanging sleeve; the hand grips the hilt */
  const sws = pose.sword;
  const gp: Pt = [sws.p[0] - Math.cos(sws.phi) * 16, sws.p[1] - Math.sin(sws.phi) * 16];
  const rest: Pt = [46, -186];
  const hand: Pt = [lerp(rest[0], gp[0], pose.grip), lerp(rest[1], gp[1], pose.grip)];
  const S: Pt = [8, -274];
  const dxh = hand[0] - S[0];
  const dyh = hand[1] - S[1];
  const d = Math.hypot(dxh, dyh) || 1;
  const bend = Math.min(46, Math.sqrt(Math.max(0, 85 * 85 - (d / 2) * (d / 2))));
  const E: Pt = [
    S[0] + dxh / 2 - (dyh / d) * bend * Math.sign(dxh || 1),
    S[1] + dyh / 2 + (dxh / d) * bend * Math.sign(dxh || 1),
  ];
  const armCol = ronin ? mix(UK.indigo, UK.night, 0.35) : mix(UK.sand, UK.ochre, 0.55);
  const pocket = poly(
    sampleSmooth(
      [
        [E[0] - 22, E[1] - 6],
        [E[0] + 12, E[1] + 4],
        [E[0] + 6, E[1] + 38 + fl * 0.3],
        [E[0] - 10, E[1] + 46 + fl * 0.4],
        [E[0] - 26, E[1] + 28],
      ],
      4,
      true
    )
  );
  const arm = ribbon(
    sampleSmooth(
      [S, E, [lerp(E[0], hand[0], 0.6), lerp(E[1], hand[1], 0.6)], [hand[0] - 5, hand[1]]],
      5,
      false
    ),
    40,
    20,
    61,
    0.08
  );
  for (const part of [pocket, arm]) {
    block(c, part, armCol, ronin ? s.gBlue : s.gWarm, 0.8, Math.PI / 2);
    if (!ronin) {
      c.save();
      c.clip(part);
      c.fillStyle = rgba(UK.sumi, 0.7);
      c.fill(s.checker);
      c.restore();
    }
    keyline(c, part, lw, 17);
  }
  const handP = new Path2D();
  handP.ellipse(hand[0], hand[1], 8, 6.5, -0.4, 0, TAU);
  c.fillStyle = SKIN;
  c.fill(handP);
  keyline(c, handP, lw * 0.6, 18);

  /* hat */
  if (pose.hat) {
    c.save();
    c.translate(0, ronin ? 0 : -20);
    c.translate(0, -300);
    c.rotate(pose.hatTilt);
    c.translate(0, 300);
    drawHat(c, s, ronin ? hatPts() : hatPts(), !ronin, lw);
    c.restore();
  }
  c.restore();
  c.restore();
}

function petalPath(s: State, p: Pt, rot: number, sc: number, half = 0): Path2D {
  const path = new Path2D();
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  let pts = s.petal;
  if (half !== 0) {
    const n = pts.length;
    const h = Math.floor(n / 2);
    pts = half > 0 ? pts.slice(0, h + 1) : [...pts.slice(h), pts[0]];
  }
  pts.forEach(([x, y], i) => {
    const px = p[0] + (x * cs - (y + 9) * sn) * sc;
    const py = p[1] + (x * sn + (y + 9) * cs) * sc;
    if (i) path.lineTo(px, py);
    else path.moveTo(px, py);
  });
  path.closePath();
  return path;
}

/** stray petals drifting through the world */
function drawDrift(c: Ctx, s: State, t: number, cam: Cam, lw: number, count: number) {
  const path = new Path2D();
  const vw = 1900 / cam.z;
  const vh = 1100 / cam.z;
  const x0 = cam.x - vw / 2;
  const y0 = cam.y - vh / 2;
  for (let i = 0; i < count; i++) {
    const hx = hash(i * 1.7 + 3);
    const hy = hash(i * 2.9 + 1);
    const sp = 30 + hash(i * 5.1) * 40;
    const fy = ((hy * vh + t * sp) % vh) + y0;
    const fx = x0 + ((hx * vw + t * 22 + Math.sin(t * 1.3 + i) * 30) % vw);
    const rot = t * (0.8 + hash(i) * 1.5) + i;
    path.addPath(petalPath(s, [fx, fy], rot, (0.35 + hash(i * 9.3) * 0.25) / Math.sqrt(cam.z)));
  }
  c.fillStyle = UK.pink;
  c.fill(path);
  c.strokeStyle = rgba(UK.vermilion, 0.7);
  c.lineWidth = lw * 0.5;
  c.stroke(path);
}

/* ---------- film ---------- */

export const ukiyoRoninFilm: RisoFilm<State> = {
  id: 'ukiyo-ronin',
  title: 'Ronin',
  caption: 'A petal in the rain, a duel on a moonlit bridge, one decisive draw.',
  theme: 'Anime',
  motif: 'The blossom petal that becomes the blade',
  duration: DURATION,
  series: 'Ukiyo-e',
  mode: 'direct',
  paper: UK.washi,
  paperTexture: true,
  grain: 0.18,
  inks: [
    { color: UK.indigo },
    { color: UK.vermilion },
    { color: UK.pink },
    { color: UK.ochre },
    { color: UK.sumi },
  ],
  scenes: [
    { at: 0, label: 'Rain' },
    { at: 3.0, label: 'Wanderer' },
    { at: 6.4, label: 'Standoff' },
    { at: 10.4, label: 'The draw' },
    { at: 13.2, label: 'Aftermath' },
  ],
  posterTime: 12.5,

  setup(r: Riso) {
    const rng = mulberry(19);
    const tree = buildTree(rng);
    const hill = (seed: number, base: number, amp: number) => {
      const rr = mulberry(seed);
      const pts: Pt[] = [];
      for (let x = -800; x <= 2600; x += 60)
        pts.push([x, base - amp * (0.4 + 0.6 * Math.abs(noise1(x / 420, seed))) - rr() * 12]);
      return poly([[-800, 1200], ...sampleSmooth(pts, 4, false), [2600, 1200]]);
    };
    const bankL = poly([
      [-3000, GROUND],
      [BR0 - 40, GROUND],
      [BR0 + 10, WATER + 2],
      [BR0 + 10, 1500],
      [-3000, 1500],
    ]);
    const bankR = poly([
      [BR1 + 40, GROUND],
      [5000, GROUND],
      [5000, 1500],
      [BR1 - 10, 1500],
      [BR1 - 10, WATER + 2],
    ]);
    const grass = new Path2D();
    for (let i = 0; i < 240; i++) {
      const x = -400 + rng() * 1800;
      const h = 8 + rng() * 16;
      grass.moveTo(x, GROUND + 2);
      grass.quadraticCurveTo(x + 3, GROUND - h * 0.6, x + 6 + rng() * 6, GROUND - h);
    }
    for (let i = 0; i < 60; i++) {
      const x = BR1 + 60 + rng() * 900;
      const h = 8 + rng() * 14;
      grass.moveTo(x, GROUND + 2);
      grass.quadraticCurveTo(x + 3, GROUND - h * 0.6, x + 6, GROUND - h);
    }
    const lantern = new Path2D();
    const LX = 1250;
    lantern.rect(LX - 12, GROUND - 70, 24, 70);
    lantern.rect(LX - 30, GROUND - 82, 60, 12);
    lantern.rect(LX - 24, GROUND - 124, 48, 42);
    lantern.moveTo(LX - 44, GROUND - 124);
    lantern.lineTo(LX, GROUND - 156);
    lantern.lineTo(LX + 44, GROUND - 124);
    lantern.closePath();
    lantern.rect(LX - 5, GROUND - 168, 10, 14);
    const lanternLight = new Path2D();
    lanternLight.rect(LX - 14, GROUND - 116, 28, 26);
    const kasuri = new Path2D();
    for (let y = -300; y < -140; y += 22)
      for (let x = -80; x < 70; x += 20) {
        const jx = x + ((y / 22) % 2) * 10 + rng() * 4;
        kasuri.rect(jx, y + rng() * 4, 7, 2.6);
      }
    const checker = new Path2D();
    for (let y = -300; y < -120; y += 16)
      for (let x = -90; x < 80; x += 16)
        if ((Math.round(x / 16) + Math.round(y / 16)) % 2 === 0) checker.rect(x, y, 16, 16);
    // the blade's stroke: a crescent sweeping the whole frame, and its white core
    const slash = sampleSmooth(
      [
        [-90, 830],
        [360, 560],
        [860, 345],
        [1290, 205],
        [1700, 95],
        [1290, 262],
        [880, 412],
        [400, 628],
      ],
      12,
      true
    );
    const slashCore = sampleSmooth(
      [
        [40, 770],
        [400, 578],
        [870, 370],
        [1290, 226],
        [1580, 132],
        [1290, 244],
        [880, 392],
        [420, 604],
      ],
      12,
      true
    );
    const splatter: Pt[] = Array.from({ length: 60 }, () => {
      const k = rng();
      const x = lerp(-60, 1680, k);
      const y = lerp(820, 110, k) + (rng() - 0.5) * 160 * (0.3 + rng());
      return [x, y] as Pt;
    });
    const hp = hatPts();
    const hatL = [...hp.slice(0, 15), [4, -306] as Pt];
    const hatR = [[4, -306] as Pt, ...hp.slice(14, 29)];
    return {
      gWarm: woodGrain(r, 51, 380, 1),
      gBlue: woodGrain(r, 52, 420, 1.1),
      gStraw: woodGrain(r, 53, 200, 1.6),
      branches: tree.branches,
      trunk: tree.trunk,
      flowers: tree.flowers,
      flowerHearts: tree.hearts,
      buds: tree.buds,
      hills: [hill(7, 600, 230), hill(9, 660, 120)],
      kas: [kasumiPath(1100, 44, 4), kasumiPath(800, 38, 6)],
      petal: petalPts(30, 18),
      bankL,
      bankR,
      grass,
      ...buildBridge(),
      lantern,
      lanternLight,
      kasuri,
      checker,
      slash,
      slashCore,
      splatter,
      hatL,
      hatR,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const base = new DOMMatrix().scale(r.scale, r.scale);
    const cam = camera(t);
    const split = t > T_SWAP && t < T_SPLIT1;
    if (split) {
      // the print is cut along the stroke; the halves slip apart, then close
      const k =
        tween(t, T_SWAP, T_SWAP + 0.1, ease.outCubic) *
        (1 - tween(t, T_SPLIT1 - 0.3, T_SPLIT1, ease.inOutCubic));
      const d = 16 * k;
      const ax = -90;
      const ay = 830;
      const dx = 1790;
      const dy = -735;
      const L = Math.hypot(dx, dy);
      const ux = dx / L;
      const uy = dy / L;
      const nx = -uy;
      const ny = ux;
      for (const side of [-1, 1]) {
        const half = new Path2D();
        const ext = 4000;
        half.moveTo(ax - ux * ext, ay - uy * ext);
        half.lineTo(ax + ux * ext, ay + uy * ext);
        half.lineTo(ax + ux * ext + nx * side * ext, ay + uy * ext + ny * side * ext);
        half.lineTo(ax - ux * ext + nx * side * ext, ay - uy * ext + ny * side * ext);
        half.closePath();
        c.save();
        c.setTransform(base);
        c.clip(half);
        drawScene(
          c,
          s,
          t,
          cam,
          base.translate(nx * side * d + ux * side * d * 0.8, ny * side * d + uy * side * d * 0.8)
        );
        c.restore();
      }
    } else {
      drawScene(c, s, t, cam, base);
    }
    c.setTransform(base);
    drawOverlay(c, s, t, cam);
    printBorder(c, 16, 0.9);
  },
};

const worldM = (base: DOMMatrix, cam: Cam) =>
  base.multiply(
    new DOMMatrix()
      .translate(800, 450)
      .rotate((cam.rot * 180) / Math.PI)
      .scale(cam.z, cam.z)
      .translate(-cam.x, -cam.y)
  );
const toScreen = (cam: Cam, p: Pt): Pt => {
  const x = (p[0] - cam.x) * cam.z;
  const y = (p[1] - cam.y) * cam.z;
  const cs = Math.cos(cam.rot);
  const sn = Math.sin(cam.rot);
  return [800 + x * cs - y * sn, 450 + x * sn + y * cs];
};

function roninPose(t: number): Pose {
  const x = roninX(t);
  const pre = t < T_SWAP;
  return {
    walk: walkPhase(x),
    amp: walking(t),
    crouch: pre
      ? tween(t, T_CROUCH0, T_CROUCH1, ease.inOutCubic)
      : 1 - tween(t, T_SPLIT1, 13.7, ease.inOutSine),
    kneel: 0,
    grip: pre
      ? tween(t, 10.5, 11.0, ease.outCubic)
      : 1 - tween(t, T_NOTO2, T_NOTO2 + 0.5, ease.inOutSine),
    sword: roninSword(t),
    hatTilt: tween(t, T_TILT, T_TILT + 0.35, ease.outCubic) * 0.13 * (1 - tween(t, 13.6, 14.4)),
    hat: true,
    narrow: tween(t, T_NARROW, T_NARROW + 0.25, ease.outCubic),
    t,
  };
}

function rivalPose(t: number): Pose {
  const pre = t < T_SWAP;
  return {
    walk: 0,
    amp: 0,
    crouch: pre
      ? tween(t, T_CROUCH0 + 0.1, T_CROUCH1, ease.inOutCubic)
      : 1 - 0.5 * tween(t, T_SPLIT1, 13.8),
    kneel: tween(t, T_KNEEL0, T_KNEEL1, ease.inOutCubic),
    grip: tween(t, T_RGRIP, T_RGRIP + 0.4, ease.outCubic),
    sword: rivalSword(t),
    hatTilt: -tween(t, T_RTILT, T_RTILT + 0.4, ease.outCubic) * 0.1,
    hat: t < T_HATCUT,
    narrow: 0,
    t,
  };
}

/** world position of a falling hat half (rival's hat cut in two) */
const hatHalf = (
  t: number,
  side: number
): { x: number; y: number; rot: number; landed: number } => {
  const tau = Math.max(0, t - T_HATCUT);
  const hx = RIVAL_B;
  const hy = deckY(RIVAL_B) + 12 - 316;
  const fallTo = WATER - 6;
  const yRaw = hy + 0.5 * 700 * tau * tau;
  const tl = Math.sqrt((2 * (fallTo - hy)) / 700);
  const landed = Math.max(0, tau - tl);
  return {
    x: hx + side * (12 + Math.min(tau, tl) * 70 + landed * 10),
    y: Math.min(yRaw, fallTo) + (landed > 0 ? Math.sin(t * 2 + side) * 2 : 0),
    rot: side * 1.5 * Math.min(1, tau / tl) + (landed > 0 ? Math.sin(t * 1.7 + side) * 0.06 : 0),
    landed,
  };
};

function drawScene(c: Ctx, s: State, t: number, cam: Cam, base: DOMMatrix) {
  const night = tween(t, 4.5, 7.0);
  c.setTransform(base);
  drawSkyBase(c, night);
  const W = worldM(base, cam);
  c.setTransform(W);
  drawMoon(c, s);
  c.setTransform(base);
  drawHills(c, s, cam, t);

  const lw = 2.4 / cam.z;
  c.setTransform(W);
  /* river, banks, lantern, tree, bridge */
  drawWater(c, s, t, lw);
  // the moon in the water, broken by the current
  c.fillStyle = rgba(UK.washiLight, 0.55);
  for (let y = WATER + 10; y < WATER + 240; y += 11) {
    const w = (120 - (y - WATER) * 0.25) * (0.6 + 0.4 * Math.sin(y * 0.4 + t * 2.4));
    c.fillRect(MOON[0] - w / 2 + Math.sin(y * 0.13 - t * 1.6) * 14, y, w, 4);
  }
  block(c, s.bankL, mix(UK.sand, UK.green, 0.35), s.gWarm, 0.9);
  block(c, s.bankR, mix(UK.sand, UK.green, 0.35), s.gWarm, 0.9);
  c.fillStyle = rgba(UK.night, 0.3 * night);
  c.fill(s.bankL);
  c.fill(s.bankR);
  const bankEdge = new Path2D();
  bankEdge.addPath(s.bankL);
  bankEdge.addPath(s.bankR);
  keyline(c, bankEdge, lw, 1);
  c.strokeStyle = mix(UK.green, UK.sumi, 0.4);
  c.lineWidth = lw * 0.8;
  c.stroke(s.grass);
  block(c, s.lantern, UK.stone, s.gWarm, 1);
  c.fillStyle = mix(UK.night, UK.gold, tween(t, 4, 7));
  c.fill(s.lanternLight);
  keyline(c, s.lantern, lw * 0.8, 8);
  drawTree(c, s, t, lw);
  drawBridge(c, s, lw);

  /* the two swordsmen */
  const pre = t < T_SWAP;
  const rx = pre ? RIVAL_A : RIVAL_B;
  drawFigure(c, s, 'rival', rx, deckY(rx), -1, rivalPose(t), lw);
  const ox = roninX(t);
  drawFigure(c, s, 'ronin', ox, deckY(ox), 1, roninPose(t), lw);

  /* the rival's hat, cut in two, falls to the river */
  if (t >= T_HATCUT) {
    for (const side of [-1, 1]) {
      const h = hatHalf(t, side);
      if (h.landed > 0.7) continue;
      c.save();
      c.globalAlpha = 1 - clamp(h.landed / 0.7);
      if (h.landed > 0) {
        c.beginPath();
        c.rect(h.x - 300, h.y - 400, 600, WATER + 8 - (h.y - 400));
        c.clip();
      }
      c.translate(h.x, h.y);
      c.rotate(h.rot);
      c.translate(-4, 300);
      drawHat(c, s, side < 0 ? s.hatR : s.hatL, true, lw);
      c.restore();
    }
  }

  /* drifting petals, and the burst from the cut */
  drawDrift(c, s, t, cam, lw, 26);
  if (t > T_SWAP) {
    const tau = t < T_SPLIT1 ? (t - T_SWAP) * 0.3 : (T_SPLIT1 - T_SWAP) * 0.3 + (t - T_SPLIT1);
    const burst = new Path2D();
    for (let i = 0; i < 40; i++) {
      const a = hash(i * 3.1) * TAU;
      const sp = 0.4 + hash(i * 7.7) * 0.6;
      const R = 420 * sp * (1 - Math.exp(-tau * 2.4));
      const x = MID[0] + Math.cos(a) * R + tau * 30;
      const y = Math.min(
        WATER + 6 + hash(i * 5.3) * 70,
        MID[1] + Math.sin(a) * R * 0.8 + 70 * tau * tau
      );
      burst.addPath(petalPath(s, [x, y], a + tau * (1 + hash(i) * 3), 0.55 + hash(i * 2.3) * 0.4));
    }
    c.fillStyle = mix(UK.pink, UK.washiLight, 0.2);
    c.fill(burst);
    c.strokeStyle = rgba(UK.vermilion, 0.8);
    c.lineWidth = lw * 0.6;
    c.stroke(burst);
  }

  /* the hero petal: whole until the cut, then two halves settling on the water */
  const pf = mix(UK.pink, UK.washiLight, 0.35);
  if (t < T_SLASH0) {
    const hp = petalAt(t);
    const p = petalPath(s, hp.p, hp.rot, 1.25);
    c.fillStyle = pf;
    c.fill(p);
    keyline(c, p, lw * 1.1, 41);
  } else if (t > T_SWAP) {
    const k = tween(t, T_SPLIT1, T_WATER, ease.inOutSine);
    for (const side of [-1, 1]) {
      const sep = 10 * tween(t, T_SWAP, T_SPLIT1, ease.outCubic);
      const tx = MID[0] + side * 44;
      const x = lerp(MID[0] + side * sep, tx, k) + Math.sin(k * 7 + side) * 30 * (1 - k);
      const y = lerp(MID[1] - side * sep * 0.5, WATER + 4, ease.inSine(k) * 0.5 + k * 0.5);
      const rot = 7.4 + side * (0.2 + k * 2) + (t > T_WATER ? Math.sin(t * 1.4 + side) * 0.05 : 0);
      const drift = t > T_WATER ? side * (t - T_WATER) * 9 : 0;
      const hp = petalPath(s, [x + drift, y], rot, 2.0, side);
      c.fillStyle = mix(UK.pink, UK.washiLight, 0.6);
      c.fill(hp);
      keyline(c, hp, lw * 1.3, 42 + side);
    }
  }

  /* ripples: petal halves and hat halves on the water */
  c.save();
  c.lineWidth = lw * 1.2;
  const ring = (cx: number, t0: number) => {
    for (let i = 0; i < 3; i++) {
      const age = t - t0 - i * 0.45;
      if (age <= 0) continue;
      const rr = age * 70;
      c.strokeStyle = rgba(UK.washiLight, clamp(0.85 - age * 0.3));
      c.beginPath();
      c.ellipse(cx, WATER + 12, rr, rr * 0.2, 0, 0, TAU);
      c.stroke();
    }
  };
  for (const side of [-1, 1]) ring(MID[0] + side * (44 + Math.max(0, t - T_WATER) * 9), T_WATER);
  for (const side of [-1, 1]) {
    const h = hatHalf(t, side);
    if (h.landed > 0) ring(h.x, t - h.landed);
  }
  c.restore();

  /* rain */
  c.setTransform(base);
  const rt = rainTime(t);
  drawRain(c, t, rt, tween(t, 6, 9) * (1 - tween(t, 14, 17) * 0.5));
  c.setTransform(W);
  c.strokeStyle = rgba(UK.washiLight, 0.5);
  c.lineWidth = lw * 0.7;
  c.beginPath();
  for (let i = 0; i < 30; i++) {
    const life = (rt * 1.3 + hash(i * 3.7)) % 1;
    const x = BR0 + hash(i * 1.3) * (BR1 - BR0);
    const y = WATER + 14 + hash(i * 2.1) * 180;
    const rr = 4 + life * 26;
    c.moveTo(x + rr, y);
    c.ellipse(x, y, rr, rr * 0.25, 0, 0, TAU);
  }
  c.stroke();
}

/** the blade's stroke across the whole frame (screen space), the flash, and the title */
function drawOverlay(c: Ctx, s: State, t: number, cam: Cam) {
  if (t >= T_SLASH0 && t < T_SPLIT1 + 0.4) {
    const hp = petalAt(T_SLASH0);
    const pts: Pt[] = s.petal.map(([x, y]) => {
      const cs = Math.cos(hp.rot) * 1.25;
      const sn = Math.sin(hp.rot) * 1.25;
      return toScreen(cam, [hp.p[0] + x * cs - (y + 9) * sn, hp.p[1] + x * sn + (y + 9) * cs]);
    });
    const mk = tween(t, T_SLASH0, T_SWAP, ease.outExpo);
    const fade = 1 - tween(t, T_SPLIT1 - 0.4, T_SPLIT1 + 0.4, ease.inCubic);
    const [a, b] = morphPair(pts, s.slash, 160);
    const [a2, b2] = morphPair(pts, s.slashCore, 160);
    const outer = poly(morph(a, b, mk));
    const core = poly(morph(a2, b2, mk));
    // the flash hides the instant the two pass each other
    const flash = Math.exp(-(((t - T_SWAP) / 0.05) ** 2));
    c.save();
    c.fillStyle = rgba(UK.washiLight, 0.92 * flash);
    c.fillRect(0, 0, 1600, 900);
    c.globalAlpha = fade;
    c.fillStyle = mix(UK.pink, UK.vermilion, mk);
    c.fill(outer);
    keyline(c, outer, 3, 51);
    c.fillStyle = UK.washiLight;
    c.fill(core);
    if (t > T_SWAP) {
      // ink thrown off the stroke
      const sk = tween(t, T_SWAP, T_SWAP + 0.15, ease.outCubic);
      const dots = new Path2D();
      s.splatter.forEach(([x, y], i) => {
        const rr = (2 + hash(i * 4.1) * 7) * sk;
        dots.moveTo(x + rr, y);
        dots.arc(x, y, rr, 0, TAU);
      });
      c.fillStyle = i2c(0);
      c.fill(dots);
    }
    c.restore();
  }
  const tk = tween(t, T_TITLE, T_TITLE + 0.6, ease.outCubic);
  if (tk > 0) cartouche(c, 150, 210, 62, 250, 'Ronin', tk, 'RAIN');
}
const i2c = (i: number) => (i ? UK.vermilion : UK.sumi);
