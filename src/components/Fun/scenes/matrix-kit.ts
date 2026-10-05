/**
 * Shared pieces for the Matrix scenes: a glyph atlas (mirrored katakana and digits built
 * from stroked polylines, never canvas text), a pooled falling code rain that draws from
 * that atlas, and a few colour helpers for the green grade.
 */

/* Glyphs on a 4 x 6 grid as lists of polylines [x0, y0, x1, y1, ...] */
const GLYPHS: number[][][] = [
  [[0, 1, 4, 1, 3, 2.5], [2, 2, 2, 4, 0.5, 6]],
  [[3.5, 0.5, 0.5, 3.5], [2.2, 2, 2.2, 6]],
  [[2, 0, 2, 1], [0.5, 1.8, 0.5, 1, 3.5, 1, 3.5, 2.5, 1.5, 6]],
  [[0.5, 1, 3.5, 1], [2, 1, 2, 5.5], [0, 5.5, 4, 5.5]],
  [[0, 2, 4, 2], [2.5, 0, 2.5, 6, 1.5, 5.5], [2.5, 2.5, 0, 5]],
  [[0.5, 2, 3.5, 2, 3.2, 5.5, 2.2, 5], [1.8, 0, 1.8, 3, 0.5, 6]],
  [[0.5, 1.5, 3.5, 1], [0, 3.2, 4, 2.6], [1.8, 0, 2.6, 6]],
  [[1.5, 0, 0, 2.5], [1.2, 1, 3.8, 1, 3.2, 3, 0.8, 6]],
  [[1.2, 0, 0, 2.5], [0.8, 1.6, 4, 1.6], [2.6, 1.6, 2.4, 4, 0.8, 6]],
  [[0.5, 1, 3.5, 1, 3.5, 5.5], [0.5, 5.5, 3.5, 5.5]],
  [[0, 2, 4, 2], [1.2, 0.5, 1.2, 3.5], [3, 0.5, 3, 3.5, 1.5, 6]],
  [[0.5, 0.5, 1.5, 1.5], [0.3, 2.5, 1.3, 3.3], [0.5, 6, 4, 1.5]],
  [[0.5, 1, 3.5, 1, 0.5, 6], [2, 3.5, 4, 6]],
  [[0, 2.5, 4, 1.8, 2.5, 3.5], [1.2, 0, 1.4, 5, 4, 5.5]],
  [[1.5, 0, 0, 2.5], [1.2, 1, 3.8, 1, 3, 3.5, 0.8, 6], [1, 2.5, 3, 3.8]],
  [[0.3, 1, 0.9, 2.2], [1.8, 0.6, 2.3, 1.8], [4, 0.8, 1.4, 6]],
  [[0.8, 0.8, 3.2, 0.8], [0, 2.4, 4, 2.4], [2, 2.4, 2, 4.5, 1, 6]],
  [[0, 2, 4, 2], [2, 0, 2, 4, 0.8, 6]],
  [[0.8, 1.5, 3.2, 1.5], [0, 5, 4, 5]],
  [[0.5, 1, 3.5, 1, 0.8, 6], [1.2, 3, 3.8, 5.5]],
  [[1.5, 1.5, 0, 5.5], [2.5, 1.5, 4, 5.5]],
  [[0.8, 0.5, 0.8, 5.5, 4, 5.5], [0.8, 3, 3.5, 2]],
  [[0.5, 1, 3.5, 1, 3, 3.5, 0.8, 6]],
  [[0, 4, 1.5, 1.5, 4, 5]],
  [[0, 2, 4, 2], [2, 0, 2, 6], [1, 3.5, 0, 5.5], [3, 3.5, 4, 5.5]],
  [[0, 1, 4, 1, 2, 4], [1.5, 3.5, 3, 6]],
  [[1, 0.8, 3, 1.5], [1, 2.8, 3, 3.5], [0.5, 4.8, 3.5, 5.8]],
  [[1.8, 0, 0.2, 5.5, 3.5, 5], [2.8, 3.5, 4, 6]],
  [[3.5, 0, 0.5, 6], [0.8, 2, 3.8, 4.5]],
  [[0.5, 1, 3.5, 1], [0, 3, 4, 3], [2, 1, 2, 5.5, 4, 5.5]],
  [[0, 2, 4, 1.6, 3, 3.5], [1.3, 0, 2.5, 6]],
  [[0.5, 2, 3, 2, 3, 5], [0, 5, 4, 5]],
  [[0.5, 1, 3.5, 1, 3.5, 5.5, 0.5, 5.5], [0.5, 3.2, 3.5, 3.2]],
  [[0.8, 0.6, 3.2, 0.6], [0.5, 2, 3.5, 2, 3, 4, 1, 6]],
  [[1, 0.5, 1, 3.5], [3, 0.5, 3, 3, 1.5, 6]],
  [[1.2, 0.5, 1.2, 3, 0, 6], [2.6, 0.5, 2.6, 5.5, 4, 3.8]],
  [[0.8, 0.5, 0.8, 5.5, 4, 3]],
  [[0.5, 1, 3.5, 1, 3.5, 5.5, 0.5, 5.5, 0.5, 1]],
  [[0.5, 2.2, 0.5, 1, 3.5, 1, 3.2, 3.5, 1, 6]],
  [[0.5, 1, 1.5, 2], [0.3, 6, 4, 1.5]],
  // digits and a few symbols
  [[2, 0.5, 3.5, 1.5, 3.5, 4.5, 2, 5.5, 0.5, 4.5, 0.5, 1.5, 2, 0.5]],
  [[1, 1.5, 2.2, 0.5, 2.2, 5.5], [1, 5.5, 3.4, 5.5]],
  [[0.5, 1.2, 1.5, 0.5, 3, 0.5, 3.5, 1.5, 3.3, 2.8, 0.5, 5.5, 3.8, 5.5]],
  [[0.5, 0.5, 3.5, 0.5, 1.8, 2.6, 3.5, 3.4, 3.5, 4.8, 2.5, 5.6, 0.5, 5.4]],
  [[3.5, 0.5, 0.8, 0.5, 0.6, 2.6, 2.8, 2.4, 3.6, 3.6, 3.2, 5.2, 0.5, 5.5]],
  [[0.5, 0.5, 3.5, 0.5, 1.6, 5.8]],
  [[3.4, 3, 1, 3, 0.5, 1.8, 1, 0.5, 3, 0.5, 3.5, 1.5, 3.4, 4, 2, 5.8]],
  [[0.5, 0.5, 3.5, 0.5, 0.5, 5.5, 3.5, 5.5]],
  [[0.5, 2, 3.5, 2], [0.5, 4, 3.5, 4]],
  [[2, 1.6, 2, 2.4], [2, 4.2, 2, 5]],
];

export const GLYPH_COUNT = GLYPHS.length;

/** Tint rows in the atlas */
export const TINT_HEAD = 0;
export const TINT_BRIGHT = 1;
export const TINT_MID = 2;
export const TINT_DARK = 3;
export const TINT_WHITE = 4;
const TINTS = ['#eaffea', '#8dffa6', '#22e05c', '#0d8a36', '#ffffff'];

export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  /** Cell size in atlas pixels */
  cell: number;
}

/** Build the glyph atlas once per mount; cell is the atlas pixel size of one glyph cell */
export function makeGlyphAtlas(cell = 40): GlyphAtlas {
  const c = document.createElement('canvas');
  c.width = cell * GLYPH_COUNT;
  c.height = cell * TINTS.length;
  const g = c.getContext('2d');
  if (!g) return { canvas: c, cell };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const k = (cell * 0.7) / 6; // grid unit
  const ox = (cell - 4 * k) / 2;
  const oy = (cell - 6 * k) / 2;
  for (let row = 0; row < TINTS.length; row++) {
    for (let i = 0; i < GLYPH_COUNT; i++) {
      const bx = i * cell;
      const by = row * cell;
      const trace = () => {
        g.beginPath();
        for (const line of GLYPHS[i]) {
          for (let p = 0; p < line.length; p += 2) {
            // mirrored, as the film's code is
            const x = bx + ox + (4 - line[p]) * k;
            const y = by + oy + line[p + 1] * k;
            if (p === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        }
      };
      trace();
      // soft halo first, then the crisp stroke
      g.strokeStyle = TINTS[row];
      g.globalAlpha = 0.22;
      g.lineWidth = k * 1.5;
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = k * 0.55;
      g.stroke();
    }
  }
  return { canvas: c, cell };
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  atlas: GlyphAtlas,
  glyph: number,
  tint: number,
  x: number,
  y: number,
  size: number
) {
  const c = atlas.cell;
  ctx.drawImage(atlas.canvas, glyph * c, tint * c, c, c, x - size / 2, y - size / 2, size, size);
}

/**
 * Falling code columns with pooled glyph buffers. Positions are in CSS pixels
 * relative to the rain's own box; the draw call takes an offset and a scale.
 */
export class Rain {
  cols = 0;
  size = 14;
  maxLen = 30;
  y: Float32Array = new Float32Array(0);
  speed: Float32Array = new Float32Array(0);
  len: Uint8Array = new Uint8Array(0);
  glyph: Uint8Array = new Uint8Array(0);
  w = 0;
  h = 0;
  private mutate = 0;

  resize(w: number, h: number, size: number, density = 1) {
    this.w = w;
    this.h = h;
    this.size = size;
    const cols = Math.max(1, Math.ceil((w / size) * density));
    if (cols !== this.cols) {
      this.cols = cols;
      this.y = new Float32Array(cols);
      this.speed = new Float32Array(cols);
      this.len = new Uint8Array(cols);
      this.glyph = new Uint8Array(cols * this.maxLen);
      for (let i = 0; i < cols; i++) this.reset(i, true);
      for (let i = 0; i < this.glyph.length; i++) this.glyph[i] = (Math.random() * GLYPH_COUNT) | 0;
    }
  }

  reset(i: number, scatter: boolean) {
    this.len[i] = 8 + ((Math.random() * (this.maxLen - 8)) | 0);
    this.speed[i] = (0.45 + Math.random() * 0.9) * this.size * 7;
    this.y[i] = scatter ? Math.random() * (this.h + this.len[i] * this.size) : -Math.random() * this.h * 0.5;
  }

  update(dt: number) {
    const s = this.size;
    for (let i = 0; i < this.cols; i++) {
      const prev = Math.floor(this.y[i] / s);
      this.y[i] += this.speed[i] * dt;
      // a new head glyph each time the stream steps down a cell
      if (Math.floor(this.y[i] / s) !== prev) {
        const base = i * this.maxLen;
        for (let j = this.maxLen - 1; j > 0; j--) this.glyph[base + j] = this.glyph[base + j - 1];
        this.glyph[base] = (Math.random() * GLYPH_COUNT) | 0;
      }
      if (this.y[i] - this.len[i] * s > this.h) this.reset(i, false);
    }
    this.mutate += dt * this.cols * 3;
    while (this.mutate > 1) {
      this.mutate -= 1;
      this.glyph[(Math.random() * this.glyph.length) | 0] = (Math.random() * GLYPH_COUNT) | 0;
    }
  }

  /**
   * Draw the streams. alpha scales everything; mask(x, y) may return 0..1 to thin the rain
   * over parts of the frame (return 1 everywhere for a full field).
   */
  draw(
    ctx: CanvasRenderingContext2D,
    atlas: GlyphAtlas,
    ox: number,
    oy: number,
    alpha: number,
    mask?: (x: number, y: number) => number
  ) {
    if (alpha <= 0.005) return;
    const s = this.size;
    const colW = this.w / this.cols;
    const base = ctx.globalAlpha;
    for (let i = 0; i < this.cols; i++) {
      const x = ox + (i + 0.5) * colW;
      const head = Math.floor(this.y[i] / s) * s;
      const L = this.len[i];
      const gi = i * this.maxLen;
      for (let j = 0; j < L; j++) {
        const y = head - j * s;
        if (y < -s || y > this.h + s) continue;
        const m = mask ? mask(x, oy + y) : 1;
        if (m <= 0.02) continue;
        const k = 1 - j / L;
        const tint = j === 0 ? TINT_HEAD : j < 3 ? TINT_BRIGHT : j < L * 0.6 ? TINT_MID : TINT_DARK;
        ctx.globalAlpha = base * alpha * m * (j === 0 ? 1 : 0.25 + 0.75 * k);
        drawGlyph(ctx, atlas, this.glyph[gi + j], tint, x, oy + y, s);
      }
    }
    ctx.globalAlpha = base;
  }
}

/** Tiny seeded generator so layouts stay stable across resizes */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Push the frame toward the film's green: a 'color' blend layer at strength k (0..1) */
export function greenGrade(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, hue = '#1f8a3c') {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = Math.min(1, k);
  ctx.fillStyle = hue;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ---------- figure helpers: every subpath is traced with the same winding ---------- */

/** Tapered limb from (ax, ay) to (bx, by) with round ends */
export function limb(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  wa: number,
  wb: number
) {
  const dx = bx - ax;
  const dy = by - ay;
  const a = Math.atan2(dy, dx);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  ctx.moveTo(ax + nx * wa, ay + ny * wa);
  ctx.lineTo(bx + nx * wb, by + ny * wb);
  ctx.arc(bx, by, wb, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(ax - nx * wa, ay - ny * wa);
  ctx.arc(ax, ay, wa, a - Math.PI / 2, a - Math.PI * 1.5, true);
  ctx.closePath();
}

/** Closed polygon from a flat point list, always traced with the same winding as limb() */
export function poly(ctx: CanvasRenderingContext2D, pts: ArrayLike<number>, n = pts.length / 2) {
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  if (area <= 0) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  } else {
    ctx.moveTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  }
  ctx.closePath();
}

/** Smooth closed outline through points (midpoint quadratic curves), same winding rule */
export function blob(ctx: CanvasRenderingContext2D, pts: ArrayLike<number>, n = pts.length / 2) {
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  const rev = area > 0;
  const X = (i: number) => pts[(rev ? n - 1 - (i % n) : i % n) * 2];
  const Y = (i: number) => pts[(rev ? n - 1 - (i % n) : i % n) * 2 + 1];
  ctx.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
  for (let i = 1; i <= n; i++) {
    ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  }
  ctx.closePath();
}

/**
 * Fill a silhouette with a lit rim on the side facing the light (+o) and a fainter
 * back rim on the other side: offset fills of the same path, clipped to it.
 */
export function rimFill(
  ctx: CanvasRenderingContext2D,
  trace: () => void,
  body: string | CanvasGradient,
  rim: string,
  back: string,
  ox: number,
  oy: number
) {
  ctx.save();
  ctx.beginPath();
  trace();
  ctx.fillStyle = back;
  ctx.fill();
  ctx.clip();
  ctx.translate(ox * 0.6, oy * 0.6);
  ctx.beginPath();
  trace();
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.translate(-ox * 1.6, -oy * 1.6);
  ctx.beginPath();
  trace();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
}

/** Two bone IK: writes the joint into out[0..1]; bend is +1 or -1 */
export function ik(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  bend: number,
  out: Float32Array | number[]
) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.001);
  const a = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1);
  const k = Math.acos(Math.max(-1, Math.min(1, cos)));
  out[0] = ax + Math.cos(a + k * bend) * l1;
  out[1] = ay + Math.sin(a + k * bend) * l1;
}
