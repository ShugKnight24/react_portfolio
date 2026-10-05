/**
 * Earth from orbit for the Superman scene. A day texture (rough real coastlines pushed through
 * noise so the shores look fractal), a city lights map and a cloud map are baked once per page
 * and shared by every mount. The globe is then shaded per pixel into a small ImageData each
 * frame: the view geometry and the sun are fixed per resize, so every lit, rim and glint term is
 * precomputed into flat arrays and a frame only rotates the texture lookup.
 */

export const TW = 1024;
export const TH = 512;
export const CW = 512;
export const CH = 256;

export interface EarthTex {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  /** 255 on land, 0 on open water (ocean glint mask) */
  land: Uint8Array;
  lights: Uint8Array;
  cloud: Uint8Array;
}

let cache: EarthTex | null = null;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function hash2(i: number, j: number, seed: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise that wraps every px cells in x, so the texture has no seam at the date line */
function vnoise(x: number, y: number, px: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const a = hash2(x0, yi, seed);
  const b = hash2(x1, yi, seed);
  const c = hash2(x0, yi + 1, seed);
  const d = hash2(x1, yi + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** u wraps in [0, 1), v in [0, 1]; ky stretches cells in y (above 0.5 makes zonal streaks) */
function fbm(u: number, v: number, f: number, oct: number, seed: number, ky = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * f, v * f * ky, f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// Rough coastlines as [lon, lat] rings; noise does the rest
const LANDS: number[][] = [
  // North America
  [-166, 68, -156, 71.5, -140, 69.6, -125, 70, -110, 68, -95, 68, -85, 70, -80, 63, -94, 59, -92, 57, -82, 55, -79, 52, -77, 60, -70, 62, -64, 60, -61, 56, -56, 52, -60, 47, -66, 45, -70, 42, -74, 40, -76, 35, -81, 31, -80, 26, -81, 25, -83, 29, -89, 30, -94, 29, -97, 26, -97, 21, -94, 18, -90, 21, -87, 21, -88, 16, -84, 15, -83, 10, -79, 9, -77, 8, -80, 7, -83, 8, -86, 12, -92, 14, -96, 16, -105, 20, -106, 23, -112, 29, -115, 30, -110, 23, -112, 25, -117, 32, -121, 35, -124, 40, -124, 46, -123, 49, -128, 51, -133, 55, -138, 59, -145, 60, -152, 59, -158, 57, -163, 55, -158, 58, -162, 60, -166, 62, -164, 64],
  // Canadian Arctic islands
  [-120, 72, -100, 74, -85, 73, -80, 76, -70, 78, -62, 82, -90, 82, -110, 78, -122, 75],
  [-90, 70, -80, 70, -72, 68, -76, 64, -86, 65],
  // Greenland
  [-73, 78, -60, 82, -35, 83, -20, 81, -18, 76, -22, 70, -30, 68, -40, 65, -44, 60, -50, 62, -54, 67, -57, 72, -66, 76],
  // Iceland
  [-24, 64, -14, 64, -15, 66, -22, 66.5],
  // South America
  [-77, 8, -72, 12, -63, 11, -60, 8, -52, 5, -50, 0, -44, -2, -35, -5, -35, -9, -39, -14, -39, -18, -41, -22, -48, -26, -49, -29, -53, -34, -58, -35, -57, -38, -62, -39, -65, -42, -65, -46, -68, -50, -69, -53, -68, -55, -72, -54, -74, -50, -75, -45, -73, -38, -71, -30, -70, -20, -75, -15, -77, -12, -81, -6, -80, -2, -80, 1, -78, 4],
  // Africa
  [-17, 15, -17, 21, -13, 27, -10, 30, -9, 33, -6, 36, 0, 36, 10, 37, 11, 33, 20, 31, 25, 32, 32, 31, 34, 28, 38, 22, 43, 13, 51, 12, 50, 8, 45, 2, 40, -3, 39, -8, 40, -15, 35, -20, 35, -25, 32, -29, 27, -34, 20, -35, 18, -32, 15, -27, 12, -18, 13, -12, 12, -6, 9, -1, 9, 4, 5, 4, 0, 5, -5, 5, -8, 4, -12, 7, -15, 11],
  // Madagascar
  [44, -25, 47, -25, 50, -15, 49, -12, 44, -17],
  // Eurasia
  [-10, 36, -9, 43, -2, 43, -1, 46, -4, 48, 2, 51, 5, 53, 8, 54, 9, 57, 11, 54, 14, 54, 20, 55, 24, 58, 22, 60, 25, 65, 21, 63, 17, 61, 19, 60, 16, 56, 12, 56, 10, 59, 5, 58, 5, 62, 15, 68, 20, 70, 30, 71, 40, 68, 44, 66, 55, 68, 60, 70, 70, 73, 80, 73, 90, 76, 100, 78, 112, 74, 130, 72, 140, 72, 150, 71, 160, 70, 170, 70, 180, 69, 180, 65, 170, 60, 162, 58, 156, 51, 156, 57, 163, 62, 155, 60, 143, 59, 135, 54, 141, 52, 140, 48, 135, 43, 130, 42, 129, 35, 126, 37, 125, 40, 121, 40, 122, 37, 119, 35, 122, 31, 121, 28, 118, 24, 111, 21, 108, 22, 106, 19, 109, 15, 109, 11, 105, 9, 103, 10, 100, 13, 100, 8, 103, 1, 101, 3, 98, 8, 98, 14, 94, 17, 92, 22, 89, 22, 86, 20, 80, 15, 80, 10, 77, 8, 73, 17, 73, 21, 69, 22, 67, 25, 62, 25, 57, 25, 56, 27, 52, 28, 50, 30, 48, 30, 50, 26, 52, 24, 56, 24, 58, 22, 59, 22, 55, 17, 52, 16, 45, 13, 43, 15, 39, 21, 35, 28, 34, 31, 35, 36, 30, 36, 27, 37, 26, 40, 29, 41, 23, 40, 22, 37, 21, 40, 19, 42, 13, 45, 12, 44, 16, 41, 16, 38, 13, 40, 10, 44, 7, 43, 3, 43, 0, 39, -2, 37, -6, 36],
  // Britain and Ireland
  [-5, 50, 1, 51, 2, 53, -1, 55, -2, 57, -5, 59, -6, 57, -5, 55, -3, 54, -5, 52],
  [-10, 52, -6, 52, -6, 55, -8, 55, -10, 54],
  // Japan
  [130, 31, 132, 34, 136, 34, 140, 35, 142, 39, 141, 41, 145, 44, 142, 45, 140, 42, 139, 38, 136, 37, 133, 35, 130, 33],
  // Sri Lanka, Taiwan, Philippines
  [80, 6, 82, 7, 81, 9.5, 79.8, 8],
  [120, 22, 122, 25, 121.5, 23],
  [120, 18, 122, 18, 124, 13, 126, 7, 122, 7, 121, 12],
  // Indonesia and New Guinea
  [95, 5, 98, 4, 106, -6, 102, -4, 96, 2],
  [109, 1, 111, -3, 116, -4, 119, 1, 117, 7, 113, 3],
  [105, -6, 114, -7, 114, -8.5, 106, -7.5],
  [119, -1, 125, 1, 122, -5, 120, -5],
  [131, -1, 141, -3, 150, -10, 143, -9, 138, -8, 132, -4],
  // Australia, Tasmania, New Zealand
  [114, -22, 114, -26, 115, -34, 118, -35, 123, -34, 129, -32, 132, -32, 135, -35, 138, -35, 140, -38, 146, -39, 150, -37, 153, -31, 153, -25, 150, -22, 146, -19, 145, -15, 142, -11, 141, -17, 136, -15, 137, -12, 132, -11, 129, -15, 125, -14, 122, -17, 120, -20],
  [145, -41, 148, -41, 148, -43.5, 146, -43.5],
  [172, -34, 178, -38, 175, -41, 171, -46, 167, -46, 172, -41],
  // Cuba, Hispaniola, Svalbard, Novaya Zemlya
  [-85, 22, -78, 23, -74, 20, -78, 20],
  [-74, 20, -69, 19.5, -69, 18, -74, 18],
  [12, 77, 18, 80, 27, 80, 22, 77],
  [52, 71, 58, 76, 68, 77, 56, 72],
];

// [lon, lat, sigma degrees, weight]: where the night side lights up
const CITIES = [
  -80, 38, 9, 1, -120, 37, 4, 0.7, -90, 41, 8, 0.6, -100, 21, 5, 0.6, -46, -22, 5, 0.8, -60, -34, 3, 0.4,
  5, 48, 9, 1, -2, 53, 3, 0.8, 12, 43, 4, 0.7, 35, 55, 10, 0.6, 35, 36, 7, 0.5, 50, 27, 5, 0.6,
  31, 28, 2.2, 0.8, 5, 7, 5, 0.4, 28, -26, 4, 0.5, 78, 22, 9, 1, 115, 32, 10, 1, 138, 36, 4, 1,
  127, 37, 2, 0.8, 105, 15, 6, 0.5, 110, -7, 4, 0.7, 150, -33, 3, 0.6, -74, 4, 4, 0.4, 67, 30, 5, 0.5,
];

// Desert boxes [lon0, lon1, lat0, lat1]
const DESERTS = [
  -15, 35, 16, 31, 35, 58, 15, 32, 118, 145, -31, -20, -118, -104, 25, 37, 88, 115, 38, 47, 15, 25, -28, -19,
  55, 72, 36, 46, -72, -68, -27, -18, 60, 72, 24, 30,
];

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + ((k % w) + w) % w];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + ((x + r + 1) % w)] - src[row + ((x - r) % w + w) % w];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

const BIOME: number[] = [
  // |lat|, r, g, b
  0, 30, 74, 28, 9, 36, 84, 30, 17, 104, 108, 56, 27, 128, 118, 72, 38, 70, 100, 46, 52, 48, 78, 42, 62, 66, 76, 56,
  69, 116, 112, 98, 75, 232, 238, 244, 90, 240, 244, 250,
];

function biome(alat: number, out: number[]) {
  let i = 0;
  while (i < BIOME.length - 8 && alat > BIOME[i + 4]) i += 4;
  const k = Math.max(0, Math.min(1, (alat - BIOME[i]) / (BIOME[i + 4] - BIOME[i])));
  out[0] = BIOME[i + 1] + (BIOME[i + 5] - BIOME[i + 1]) * k;
  out[1] = BIOME[i + 2] + (BIOME[i + 6] - BIOME[i + 2]) * k;
  out[2] = BIOME[i + 3] + (BIOME[i + 7] - BIOME[i + 3]) * k;
}

export function earthTextures(): EarthTex {
  if (cache) return cache;
  const N = TW * TH;
  const r = new Uint8Array(N);
  const g = new Uint8Array(N);
  const b = new Uint8Array(N);
  const land = new Uint8Array(N);
  const lights = new Uint8Array(N);
  const cloud = new Uint8Array(CW * CH);

  // rasterise the coastline rings
  const mask = new Float32Array(N);
  const cv = document.createElement('canvas');
  cv.width = TW;
  cv.height = TH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (c) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, TW, TH);
    c.fillStyle = '#fff';
    const px = (lon: number) => ((lon + 180) / 360) * TW;
    const py = (lat: number) => ((90 - lat) / 180) * TH;
    for (const ring of LANDS) {
      c.beginPath();
      c.moveTo(px(ring[0]), py(ring[1]));
      for (let i = 2; i < ring.length; i += 2) c.lineTo(px(ring[i]), py(ring[i + 1]));
      c.closePath();
      c.fill();
    }
    // Antarctica with its peninsula reaching for South America
    c.beginPath();
    c.moveTo(0, TH);
    for (let lon = -180; lon <= 180; lon += 6) {
      let lat = -70 + 2.5 * Math.sin(lon * 0.09) + 1.5 * Math.sin(lon * 0.23 + 1);
      if (lon > -75 && lon < -55) lat = Math.max(lat, -63 - Math.abs(lon + 62) * 0.35);
      if (lon > -200 && lon < -140) lat -= 6; // Ross Sea
      if (lon > -60 && lon < -20) lat -= 5; // Weddell Sea
      c.lineTo(px(lon), py(lat));
    }
    c.lineTo(TW, TH);
    c.closePath();
    c.fill();
    const data = c.getImageData(0, 0, TW, TH).data;
    for (let i = 0; i < N; i++) mask[i] = data[i * 4] / 255;
  }
  cv.width = cv.height = 0;
  const m1 = boxBlur(mask, TW, TH, 3);
  const m2 = boxBlur(boxBlur(m1, TW, TH, 9), TW, TH, 9);

  // low frequency fields on a half resolution grid, read back bilinearly
  const GW = TW / 2;
  const GH = TH / 2;
  const fields = [11, 23, 41, 59].map((seed, f) => {
    const a = new Float32Array(GW * GH);
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const u = x / GW;
        const v = (y + 0.5) / GH;
        a[y * GW + x] = f < 2 ? fbm(u, v, 10, 3, seed) : f === 2 ? fbm(u, v, 14, 4, seed) : fbm(u, v, 7, 4, seed);
      }
    return a;
  });
  const field = (a: Float32Array, x: number, y: number) => {
    const gx = x * 0.5;
    const gy = Math.max(0, Math.min(GH - 1.001, (y + 0.5) * 0.5 - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const xa = x0 % GW;
    const xb = (x0 + 1) % GW;
    const r0 = y0 * GW;
    const r1 = Math.min(GH - 1, y0 + 1) * GW;
    const top = a[r0 + xa] + (a[r0 + xb] - a[r0 + xa]) * fx;
    const bot = a[r1 + xa] + (a[r1 + xb] - a[r1 + xa]) * fx;
    return top + (bot - top) * fy;
  };

  const col = [0, 0, 0];
  for (let y = 0; y < TH; y++) {
    const v = (y + 0.5) / TH;
    const lat = 90 - v * 180;
    const alat = Math.abs(lat);
    for (let x = 0; x < TW; x++) {
      const i = y * TW + x;
      const u = x / TW;
      const lon = u * 360 - 180;
      const wx = (field(fields[0], x, y) - 0.5) * 30;
      const wy = (field(fields[1], x, y) - 0.5) * 18;
      const sx = (((x + wx) | 0) % TW + TW) % TW;
      const sy = Math.max(0, Math.min(TH - 1, (y + wy) | 0));
      const fine = fbm(u, v, 24, 5, 5);
      const isLand = m1[sy * TW + sx] + (fine - 0.5) * 0.75 > 0.5;
      const n2 = field(fields[2], x, y);
      if (isLand) {
        land[i] = 255;
        biome(alat + (n2 - 0.5) * 12, col);
        // patchwork of dry olive and deep forest so the land is not one flat green
        const n3 = field(fields[3], x, y);
        const dry = smooth(0.52, 0.72, n3) * 0.6;
        const wet = smooth(0.45, 0.28, n3) * 0.5;
        col[0] += (128 - col[0]) * dry - col[0] * 0.45 * wet;
        col[1] += (112 - col[1]) * dry - col[1] * 0.2 * wet;
        col[2] += (66 - col[2]) * dry - col[2] * 0.4 * wet;
        let dw = 0;
        for (let k = 0; k < DESERTS.length; k += 4) {
          const ex = Math.min(lon - DESERTS[k], DESERTS[k + 1] - lon);
          const ey = Math.min(lat - DESERTS[k + 2], DESERTS[k + 3] - lat);
          dw = Math.max(dw, smooth(-2, 5, Math.min(ex, ey) + (n2 - 0.5) * 10));
        }
        if (dw > 0) {
          const dr = 196 + (fine - 0.5) * 60;
          const dg = 160 + (fine - 0.5) * 50;
          const db = 104 + (fine - 0.5) * 30;
          col[0] += (dr - col[0]) * dw;
          col[1] += (dg - col[1]) * dw;
          col[2] += (db - col[2]) * dw;
        }
        const ice = lat < -64 || (lat > 60 && lon > -60 && lon < -18) ? 1 : 0;
        if (ice) {
          const k = 0.85 + fine * 0.15;
          col[0] = 236 * k;
          col[1] = 241 * k;
          col[2] = 248 * k;
        }
        const j = 0.7 + n2 * 0.3 + fine * 0.3;
        r[i] = Math.min(255, col[0] * j);
        g[i] = Math.min(255, col[1] * j);
        b[i] = Math.min(255, col[2] * j);

        if (!ice) {
          let pop = 0.02;
          for (let k = 0; k < CITIES.length; k += 4) {
            let dl = lon - CITIES[k];
            if (dl > 180) dl -= 360;
            else if (dl < -180) dl += 360;
            const dt = lat - CITIES[k + 1];
            const s2 = CITIES[k + 2] * CITIES[k + 2];
            const d2 = dl * dl + dt * dt;
            if (d2 < s2 * 9) pop += CITIES[k + 3] * Math.exp(-d2 / (2 * s2));
          }
          const cluster = smooth(0.5, 0.72, fbm(u, v, 48, 3, 77));
          const dot = hash2(x, y, 9) > 0.72 ? 1 : 0.12;
          const lit = Math.min(1, pop) * cluster * dot;
          lights[i] = Math.min(255, lit * 330);
        }
      } else {
        const shelf = smooth(0.04, 0.55, m2[i]);
        const deep = 0.9 + (n2 - 0.5) * 0.25;
        let or = (6 + shelf * 20) * deep;
        let og = (24 + shelf * 70) * deep;
        let ob = (66 + shelf * 76) * deep;
        if (lat > 74 + (fine - 0.5) * 10) {
          const k = smooth(74, 82, lat + (fine - 0.5) * 10);
          or += (220 - or) * k;
          og += (230 - og) * k;
          ob += (240 - ob) * k;
        }
        r[i] = or;
        g[i] = og;
        b[i] = ob;
      }
    }
  }

  for (let y = 0; y < CH; y++) {
    const v = (y + 0.5) / CH;
    const lat = 90 - v * 180;
    const alat = Math.abs(lat);
    const band =
      0.62 +
      0.32 * Math.exp(-(((lat - 6) / 6) ** 2)) +
      0.3 * Math.exp(-(((alat - 54) / 11) ** 2)) -
      0.22 * Math.exp(-(((alat - 26) / 8) ** 2));
    for (let x = 0; x < CW; x++) {
      const u = x / CW;
      const w1 = fbm(u, v, 5, 3, 91);
      const w2 = fbm(u, v, 5, 3, 97);
      const cu = u + (w1 - 0.5) * 0.09;
      const n = fbm(((cu % 1) + 1) % 1, v + (w2 - 0.5) * 0.06, 9, 5, 103, 1.1);
      cloud[y * CW + x] = smooth(0.46, 0.74, n * band * 1.18) * 235;
    }
  }

  // a soft halo around each cluster of city lights
  const lf = new Float32Array(N);
  for (let i = 0; i < N; i++) lf[i] = lights[i];
  const halo = boxBlur(boxBlur(lf, TW, TH, 2), TW, TH, 2);
  for (let i = 0; i < N; i++) lights[i] = Math.min(255, lights[i] * 0.7 + halo[i] * 1.6);

  cache = { r, g, b, land, lights, cloud };
  return cache;
}

/** Per pixel view geometry for a globe of N x N pixels, baked per resize */
export interface GlobeView {
  n: number;
  img: ImageData;
  u32: Uint32Array;
  count: number;
  idx: Int32Array;
  row: Int32Array;
  lon: Int32Array;
  crow: Int32Array;
  clon: Int32Array;
  day: Float32Array;
  night: Float32Array;
  twi: Float32Array;
  spec: Float32Array;
  rim: Float32Array;
  hr: Float32Array;
  hg: Float32Array;
  hb: Float32Array;
  cov: Uint8Array;
}

/**
 * sun is a unit vector in view space (x right, y down, z toward the viewer).
 * The planet's axis leans by tiltZ in the picture plane and pitch toward the viewer.
 */
export function makeGlobeView(n: number, sun: [number, number, number], tiltZ: number, pitch: number): GlobeView {
  const img = new ImageData(n, n);
  const u32 = new Uint32Array(img.data.buffer);
  const cap = n * n;
  const idx = new Int32Array(cap);
  const row = new Int32Array(cap);
  const lon = new Int32Array(cap);
  const crow = new Int32Array(cap);
  const clon = new Int32Array(cap);
  const day = new Float32Array(cap);
  const night = new Float32Array(cap);
  const twi = new Float32Array(cap);
  const spec = new Float32Array(cap);
  const rim = new Float32Array(cap);
  const hr = new Float32Array(cap);
  const hg = new Float32Array(cap);
  const hb = new Float32Array(cap);
  const cov = new Uint8Array(cap);
  const cz = Math.cos(tiltZ);
  const sz = Math.sin(tiltZ);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Blinn half vector between the sun and the viewer
  let hx = sun[0];
  let hy = sun[1];
  let hz = sun[2] + 1;
  const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const edge = 1.5 / n;
  let count = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * 2 - 1;
      const y = ((j + 0.5) / n) * 2 - 1;
      const d = Math.hypot(x, y);
      if (d > 1) continue;
      const k = count++;
      idx[k] = j * n + i;
      cov[k] = Math.round(Math.max(0, Math.min(1, (1 - d) / edge)) * 255);
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      // view normal into the planet's frame
      const x1 = x * cz + y * sz;
      const y1 = -x * sz + y * cz;
      const y2 = y1 * cp - nz * sp;
      const z2 = y1 * sp + nz * cp;
      const lat = Math.asin(Math.max(-1, Math.min(1, -y2)));
      const lo = Math.atan2(x1, z2);
      const ty = Math.max(0, Math.min(TH - 1, Math.floor((0.5 - lat / Math.PI) * TH)));
      row[k] = ty * TW;
      lon[k] = Math.floor((lo / (Math.PI * 2) + 0.5) * TW) & (TW - 1);
      crow[k] = (ty >> 1) * CW;
      clon[k] = lon[k] >> 1;
      const ndl = x * sun[0] + y * sun[1] + nz * sun[2];
      const lit = smooth(-0.14, 0.24, ndl);
      day[k] = 0.035 + Math.pow(Math.max(0, ndl), 0.75) * 1.12 * lit + lit * 0.05;
      night[k] = 1 - smooth(-0.2, 0.06, ndl);
      twi[k] = Math.exp(-(((ndl - 0.02) / 0.1) ** 2));
      const ndh = Math.max(0, x * hx + y * hy + nz * hz);
      spec[k] = (Math.pow(ndh, 80) * 0.75 + Math.pow(ndh, 14) * 0.07) * lit;
      const limb = 1 - nz;
      rim[k] = Math.min(0.85, Math.pow(limb, 2.4) * 1.05 + limb * 0.06) * (0.25 + lit * 0.75);
      const warm = twi[k];
      hr[k] = 110 * lit + 230 * warm * 0.6 + 8;
      hg[k] = 175 * lit + 120 * warm * 0.4 + 14;
      hb[k] = 255 * lit + 30;
    }
  }
  return { n, img, u32, count, idx, row, lon, crow, clon, day, night, twi, spec, rim, hr, hg, hb, cov };
}

/** Shade the globe into view.img for ground rotation rot (texels) and cloud rotation crot */
export function shadeGlobe(view: GlobeView, tex: EarthTex, rot: number, crot: number) {
  const { u32, count, idx, row, lon, crow, clon, day, night, twi, spec, rim, hr, hg, hb, cov } = view;
  const { r: tr, g: tg, b: tb, land, lights, cloud } = tex;
  const ro = Math.floor(rot) & (TW - 1);
  const cro = Math.floor(crot) & (CW - 1);
  const tm = TW - 1;
  const cm = CW - 1;
  for (let k = 0; k < count; k++) {
    const ti = row[k] + ((lon[k] - ro) & tm);
    const cl = cloud[crow[k] + ((clon[k] - cro) & cm)] * (1 / 255);
    const dl = day[k];
    let r = tr[ti] * dl;
    let g = tg[ti] * dl;
    let b = tb[ti] * dl;
    // clouds: bright on the day side, picking up a warm edge at the terminator
    const cb = 250 * dl;
    const tw = twi[k] * cl;
    r += (cb + tw * 36 - r) * cl;
    g += (cb + tw * 8 - g) * cl;
    b += (cb * 1.02 - tw * 30 - b) * cl;
    // sun glint on open water
    const sp = spec[k] * (1 - land[ti] * (1 / 255)) * (1 - cl);
    r += sp * 255;
    g += sp * 236;
    b += sp * 205;
    // city lights on the night side, dimmed under cloud
    const nl = night[k] * lights[ti] * (1 - cl * 0.8);
    r += nl * 1.0;
    g += nl * 0.72;
    b += nl * 0.36;
    // atmosphere haze toward the limb
    const rm = rim[k];
    r += (hr[k] - r) * rm;
    g += (hg[k] - g) * rm;
    b += (hb[k] - b) * rm;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    u32[idx[k]] = (cov[k] << 24) | (b << 16) | (g << 8) | r;
  }
}
