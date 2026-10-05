/**
 * Neon series: shared look for the synthwave / CRT films (direct mode).
 *
 * Every tube is painted twice: a bright thin core (plus faint red/cyan offset copies for chromatic
 * aberration) onto the frame, and a wide stroke onto a small glow buffer. At the end of the frame
 * the glow buffer is blurred at low resolution and added back with 'lighter', which gives the
 * bloom for the price of two tiny blurs. Dark silhouettes occlude the glow buffer too, so the
 * bloom wraps around shapes instead of shining through them. A cached overlay adds scanlines and
 * a vignette.
 */
import type { Riso, Ctx } from '../riso/engine';
import { TAU, clamp, hash, lerp, mulberry, noise1, seg } from '../riso/kit';

export const NEON = {
  bg: '#07040f',
  ink: '#0c0718',
  ink2: '#150c2a',
  magenta: '#ff2bd6',
  pink: '#ff5fa8',
  cyan: '#2de2ff',
  violet: '#9a5cff',
  amber: '#ffb13b',
  red: '#ff3355',
  white: '#fff3fb',
} as const;

/* Glow buffer: 480 x 270 for the 1600 x 900 frame */
const GW = 480;
const GH = 270;
const GS = GW / 1600;

const mk = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas, ctx };
};

const hotCache = new Map<string, string>();
/** The colour pushed toward white: the hot core of a tube */
export const hot = (col: string, k = 0.62) => {
  const key = col + k;
  const hit = hotCache.get(key);
  if (hit) return hit;
  const n = parseInt(col.slice(1), 16);
  const ch = (v: number) => Math.round(lerp(v, 255, k));
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  hotCache.set(key, out);
  return out;
};

/** rgba() from a #rrggbb colour */
export const rgba = (col: string, a: number) => {
  const n = parseInt(col.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a)})`;
};

export interface NeonFX {
  glow: HTMLCanvasElement;
  gctx: Ctx;
  b1: HTMLCanvasElement;
  b1c: Ctx;
  overlay: HTMLCanvasElement;
}

/** Build the glow buffers and the scanline / vignette overlay. Call from setup */
export const createNeonFX = (r: Riso): NeonFX => {
  const g = mk(GW, GH);
  const b1 = mk(GW, GH);
  const o = r.scratch(1600, 900);
  const c = o.ctx;
  // vignette
  const v = c.createRadialGradient(800, 450, 260, 800, 450, 980);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  v.addColorStop(1, 'rgba(0,0,0,0.78)');
  c.fillStyle = v;
  c.fillRect(0, 0, 1600, 900);
  // scanlines
  c.fillStyle = 'rgba(0,0,0,0.26)';
  for (let y = 0; y < 900; y += 3) c.fillRect(0, y + 1.6, 1600, 1.1);
  // faint aperture-grille columns
  c.fillStyle = 'rgba(0,0,0,0.07)';
  for (let x = 0; x < 1600; x += 3) c.fillRect(x, 0, 1, 900);
  return { glow: g.canvas, gctx: g.ctx, b1: b1.canvas, b1c: b1.ctx, overlay: o.canvas };
};

/**
 * Ignition flicker: 0 before t0, stuttering on and off through [t0, t0 + dur], then steady 1.
 * Pure function of t.
 */
export const flick = (t: number, t0: number, dur = 0.6, seed = 0) => {
  if (t < t0) return 0;
  const k = (t - t0) / dur;
  if (k >= 1) return 1;
  const h = hash(Math.floor(t * 28) * 1.37 + seed * 17.1);
  return h < 0.25 + k * 0.9 ? 0.55 + 0.45 * k : 0.06;
};

/** Steady tube hum: tiny brightness wobble around 1 */
export const hum = (t: number, seed = 0, amt = 0.06) => 1 + amt * noise1(t * 9 + seed * 3.1, seed);

export interface Part {
  p: Path2D;
  /** Stroke width for limb-like parts; omit for filled shapes */
  w?: number;
}

export interface Baked {
  main: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Neon {
  /** Bloom strength */
  power = 1;
  /** Chromatic aberration in screen px */
  ab = 1.6;
  /** Logical-to-screen zoom of the current transform, for screen-constant aberration */
  private zs = 1;
  private zstack: number[] = [];

  constructor(
    readonly c: Ctx,
    readonly g: Ctx,
    private r: Riso | null = null
  ) {
    for (const x of [c, g]) {
      x.lineCap = 'round';
      x.lineJoin = 'round';
    }
  }

  /** Start a frame: the frame context plus a cleared glow buffer */
  static frame(r: Riso, fx: NeonFX) {
    const g = fx.gctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, GW, GH);
    g.setTransform(GS, 0, 0, GS, 0, 0);
    const n = new Neon(r.layers[0], g, r);
    n.fx = fx;
    return n;
  }

  /**
   * Pre-render static neon art (frame part and glow part) for the logical rect (x, y, w, h).
   * k > 1 bakes at higher resolution for art that will be zoomed into.
   */
  static bake(r: Riso, x: number, y: number, w: number, h: number, k: number, draw: (n: Neon) => void): Baked {
    const m = r.scratch(w * k, h * k);
    m.ctx.scale(k, k);
    m.ctx.translate(-x, -y);
    const gl = mk(Math.ceil(w * GS * Math.min(k, 1.5)), Math.ceil(h * GS * Math.min(k, 1.5)));
    const gk = GS * Math.min(k, 1.5);
    gl.ctx.setTransform(gk, 0, 0, gk, -x * gk, -y * gk);
    const n = new Neon(m.ctx, gl.ctx);
    n.zs = k;
    draw(n);
    return { main: m.canvas, glow: gl.canvas, x, y, w, h };
  }

  private fx: NeonFX | null = null;

  /** Draw baked art at its own logical position under the current transform */
  sprite(b: Baked, a = 1) {
    if (a <= 0.01) return;
    this.c.globalAlpha = clamp(a);
    this.c.drawImage(b.main, b.x, b.y, b.w, b.h);
    this.c.globalAlpha = 1;
    this.g.globalAlpha = clamp(a);
    this.g.drawImage(b.glow, b.x, b.y, b.w, b.h);
    this.g.globalAlpha = 1;
  }

  /** Camera on both the frame and the glow buffer */
  cam(cx: number, cy: number, zoom = 1, rot = 0) {
    this.r?.camera(cx, cy, zoom, rot);
    this.g.setTransform(
      new DOMMatrix()
        .scale(GS, GS)
        .translate(800, 450)
        .rotate((rot * 180) / Math.PI)
        .scale(zoom, zoom)
        .translate(-cx, -cy)
    );
    this.zs = zoom;
  }

  save() {
    this.c.save();
    this.g.save();
    this.zstack.push(this.zs);
  }
  restore() {
    this.c.restore();
    this.g.restore();
    this.zs = this.zstack.pop() ?? 1;
  }
  translate(x: number, y: number) {
    this.c.translate(x, y);
    this.g.translate(x, y);
  }
  rotate(a: number) {
    this.c.rotate(a);
    this.g.rotate(a);
  }
  scale(x: number, y = x) {
    this.c.scale(x, y);
    this.g.scale(x, y);
    this.zs *= Math.sqrt(Math.abs(x * y));
  }
  clip(p: Path2D, rule: CanvasFillRule = 'nonzero') {
    this.c.clip(p, rule);
    this.g.clip(p, rule);
  }
  /** Run body inside save/restore */
  with(set: () => void, body: () => void) {
    this.save();
    set();
    body();
    this.restore();
  }

  /** A glowing tube along path */
  tube(p: Path2D, col: string, w = 3, a = 1, glow = 1) {
    if (a <= 0.01) return;
    const { c, g } = this;
    c.globalCompositeOperation = 'lighter';
    if (this.ab > 0.05 && a > 0.5 && w > 1.2) {
      const o = this.ab / this.zs;
      c.lineWidth = w * 1.1;
      c.globalAlpha = 0.42 * a;
      c.translate(-o, 0);
      c.strokeStyle = '#ff1f4f';
      c.stroke(p);
      c.translate(2 * o, 0);
      c.strokeStyle = '#14d4ff';
      c.stroke(p);
      c.translate(-o, 0);
    }
    c.globalAlpha = 0.8 * a;
    c.strokeStyle = col;
    c.lineWidth = w * 1.9;
    c.stroke(p);
    c.globalAlpha = a;
    c.strokeStyle = hot(col);
    c.lineWidth = w * 0.72;
    c.stroke(p);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    if (glow > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(a * glow);
      g.strokeStyle = col;
      g.lineWidth = w * 3.4;
      g.stroke(p);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  }

  /** Only the glow of a stroke (haze, light spill) */
  haze(p: Path2D, col: string, w: number, a = 1) {
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(a);
    g.strokeStyle = col;
    g.lineWidth = w;
    g.stroke(p);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /** Lit fill (sun, screens, signs): style on the frame, flat colour into the glow */
  fill(p: Path2D, style: string | CanvasGradient | CanvasPattern, glowCol?: string, glowA = 0.6, rule: CanvasFillRule = 'nonzero', add = false) {
    const { c, g } = this;
    if (add) c.globalCompositeOperation = 'lighter';
    c.fillStyle = style;
    c.fill(p, rule);
    c.globalCompositeOperation = 'source-over';
    if (glowCol && glowA > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(glowA);
      g.fillStyle = glowCol;
      g.fill(p, rule);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  }

  /** Additive soft light, frame only */
  light(p: Path2D, style: string | CanvasGradient, a = 1) {
    const c = this.c;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = clamp(a);
    c.fillStyle = style;
    c.fill(p);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  /** Dark occluding fill: hides what is behind on the frame and in the glow */
  dark(p: Path2D, style: string | CanvasGradient = NEON.ink, rule: CanvasFillRule = 'nonzero', a = 1) {
    const { c, g } = this;
    c.globalAlpha = a;
    c.fillStyle = style;
    c.fill(p, rule);
    c.globalAlpha = 1;
    g.globalAlpha = a;
    g.fillStyle = '#000';
    g.fill(p, rule);
    g.globalAlpha = 1;
  }

  /** Remove glow inside p (for fog bands) with a vertical fade */
  fadeGlow(y0: number, y1: number, x0 = -4000, x1 = 8000) {
    const g = this.g;
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Dark silhouette with a neon rim: every part is first stroked wide in colour, then filled dark,
   * so the union of the parts gets one clean glowing outline.
   */
  rim(parts: Part[], col: string, rimW = 3, a = 1, fillStyle: string | CanvasGradient = NEON.ink) {
    const { c, g } = this;
    if (a > 0.01) {
      c.globalCompositeOperation = 'lighter';
      // rims only fringe when the picture is hit hard; tubes always do
      if (this.ab > 2.5) {
        const o = (this.ab * 1.4) / this.zs;
        c.globalAlpha = 0.5 * a;
        for (const [dx, sc] of [
          [-o, '#ff1f4f'],
          [o, '#14d4ff'],
        ] as const) {
          c.translate(dx, 0);
          c.strokeStyle = sc;
          for (const q of parts) {
            c.lineWidth = (q.w ?? 0) + rimW * 2;
            c.stroke(q.p);
          }
          c.translate(-dx, 0);
        }
      }
      c.globalAlpha = 0.85 * a;
      c.strokeStyle = col;
      for (const q of parts) {
        c.lineWidth = (q.w ?? 0) + rimW * 2.6;
        c.stroke(q.p);
      }
      c.globalAlpha = a;
      c.strokeStyle = hot(col);
      for (const q of parts) {
        c.lineWidth = (q.w ?? 0) + rimW * 1.2;
        c.stroke(q.p);
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(a);
      g.strokeStyle = col;
      for (const q of parts) {
        g.lineWidth = (q.w ?? 0) + rimW * 6;
        g.stroke(q.p);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // dark body
    c.fillStyle = fillStyle;
    c.strokeStyle = fillStyle;
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    for (const q of parts) {
      if (q.w === undefined) {
        c.fill(q.p);
        g.fill(q.p);
      } else {
        c.lineWidth = q.w;
        c.stroke(q.p);
        g.lineWidth = q.w;
        g.stroke(q.p);
      }
    }
  }

  /** Neon sign lettering: outlined glyphs as tubes */
  text(
    str: string,
    x: number,
    y: number,
    size: number,
    col: string,
    o: { font?: string; w?: number; a?: number; spacing?: number; fill?: string; fillA?: number } = {}
  ) {
    const { c, g } = this;
    const a = o.a ?? 1;
    if (a <= 0.01) return;
    const font = o.font ?? `italic 800 ${size}px "Avenir Next", "Futura", "Trebuchet MS", system-ui, sans-serif`;
    const w = o.w ?? Math.max(1.5, size * 0.035);
    const chars = Array.from(str);
    for (const x2 of [c, g]) {
      x2.font = font;
      x2.textAlign = 'left';
      x2.textBaseline = 'middle';
    }
    const sp = o.spacing ?? 0;
    const widths = chars.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((s, v) => s + v, 0) + sp * (chars.length - 1);
    const each = (fn: (ch: string, px: number) => void) => {
      let px = x - total / 2;
      chars.forEach((ch, i) => {
        fn(ch, px);
        px += widths[i] + sp;
      });
    };
    if (o.fill) {
      c.globalAlpha = (o.fillA ?? 0.25) * a;
      c.fillStyle = o.fill;
      each((ch, px) => c.fillText(ch, px, y));
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'lighter';
    if (this.ab > 0.05) {
      const off = this.ab / this.zs;
      c.globalAlpha = 0.4 * a;
      c.lineWidth = w;
      c.strokeStyle = '#ff1f4f';
      each((ch, px) => c.strokeText(ch, px - off, y));
      c.strokeStyle = '#14d4ff';
      each((ch, px) => c.strokeText(ch, px + off, y));
    }
    c.globalAlpha = 0.85 * a;
    c.strokeStyle = col;
    c.lineWidth = w * 1.8;
    each((ch, px) => c.strokeText(ch, px, y));
    c.globalAlpha = a;
    c.strokeStyle = hot(col);
    c.lineWidth = w * 0.7;
    each((ch, px) => c.strokeText(ch, px, y));
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(a);
    g.strokeStyle = col;
    g.lineWidth = w * 3.5;
    each((ch, px) => g.strokeText(ch, px, y));
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /**
   * Finish the frame: bloom, scanlines, vignette, rolling bar and a screen-wide flash.
   * Resets the camera.
   */
  end(t: number, o: { flash?: number; flashCol?: string; roll?: boolean } = {}) {
    const { c } = this;
    const fx = this.fx;
    if (!fx) return;
    const dw = c.canvas.width;
    const dh = c.canvas.height;
    const p = Math.max(0, this.power);
    // tight and wide blur merged at low resolution, then one additive upscale
    const b = fx.b1c;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.clearRect(0, 0, GW, GH);
    b.filter = 'blur(2px)';
    b.drawImage(fx.glow, 0, 0);
    b.filter = 'blur(9px)';
    b.globalCompositeOperation = 'lighter';
    b.globalAlpha = 0.9;
    b.drawImage(fx.glow, 0, 0);
    b.filter = 'none';
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'lighter';
    let a1 = p * 0.95;
    while (a1 > 0.01) {
      c.globalAlpha = Math.min(1, a1);
      c.drawImage(fx.b1, 0, 0, dw, dh);
      a1 -= 1;
    }
    if (o.flash && o.flash > 0.01) {
      c.globalAlpha = clamp(o.flash);
      c.fillStyle = o.flashCol ?? '#ffffff';
      c.fillRect(0, 0, dw, dh);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(fx.overlay, 0, 0, dw, dh);
    if (o.roll !== false) {
      // a slow bright bar rolling down the tube
      const y = (((t * 0.11) % 1) * 1.4 - 0.2) * dh;
      const gr = c.createLinearGradient(0, y - dh * 0.08, 0, y + dh * 0.08);
      gr.addColorStop(0, 'rgba(160,140,255,0)');
      gr.addColorStop(0.5, 'rgba(160,140,255,0.035)');
      gr.addColorStop(1, 'rgba(160,140,255,0)');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = gr;
      c.fillRect(0, y - dh * 0.08, dw, dh * 0.16);
      c.globalCompositeOperation = 'source-over';
    }
  }
}

/* ---------- shared scenery ---------- */

/** Perspective grid floor between the horizon hz and bottom, scrolling toward the viewer */
export const gridFloor = (
  N: Neon,
  o: {
    hz: number;
    vx: number;
    bottom?: number;
    scroll: number;
    rows?: number;
    cols?: number;
    colGap?: number;
    col: string;
    w?: number;
    a?: number;
    /** 0..1: horizontal lines break into dashed ripples (grid becomes water) */
    water?: number;
    t?: number;
    bg?: string;
    x0?: number;
    x1?: number;
  }
) => {
  const bottom = o.bottom ?? 900;
  const D = bottom - o.hz;
  const rows = o.rows ?? 14;
  const cols = o.cols ?? 14;
  const gap = o.colGap ?? 150;
  const a = o.a ?? 1;
  const water = o.water ?? 0;
  const x0 = o.x0 ?? -200;
  const x1 = o.x1 ?? 1800;
  if (a <= 0.01) return;
  const fr = o.scroll - Math.floor(o.scroll);
  const hp = new Path2D();
  for (let i = 0; i < rows; i++) {
    const z = 0.35 + (i + 1 - fr) * 0.55;
    const y = o.hz + D / z;
    if (y > bottom + 20) continue;
    hp.moveTo(x0, y);
    hp.lineTo(x1, y);
  }
  const vp = new Path2D();
  for (let i = -cols; i <= cols; i++) {
    const X = i * gap;
    vp.moveTo(o.vx + X * 0.02, o.hz);
    vp.lineTo(o.vx + X * 6, o.hz + D * 6);
  }
  N.with(
    () => {
      const cp = new Path2D();
      cp.rect(x0, o.hz, x1 - x0, bottom - o.hz + 40);
      N.clip(cp);
    },
    () => {
      const w = o.w ?? 2.2;
      if (water < 0.99) N.tube(vp, o.col, w, a * (1 - water) * 0.85);
      if (water < 0.99) N.tube(hp, o.col, w, a * (1 - water));
      if (water > 0.01) {
        // each row breaks into its own ripple dashes, longer and wider apart toward the viewer
        const c = N.c;
        const g = N.g;
        const tt = o.t ?? 0;
        for (let i = 0; i < rows + 6; i++) {
          const z = 0.35 + (i + 1 - fr) * 0.42;
          const u = 1 / z;
          const y = o.hz + D * u * 0.78;
          if (y > bottom + 20) continue;
          const rp = new Path2D();
          rp.moveTo(x0, y);
          rp.lineTo(x1, y);
          for (const x of [c, g]) {
            x.setLineDash([24 + 70 * u, 30 + 60 * u]);
            x.lineDashOffset = hash(i + Math.floor(o.scroll - fr) * 7.3) * 400 + tt * 30 * (0.5 + u);
          }
          N.tube(rp, o.col, w * lerp(0.5, 1, Math.min(1, u)), a * water * Math.min(1, 0.35 + u));
        }
        for (const x of [c, g]) x.setLineDash([]);
      }
    }
  );
  // horizon haze: dark fade on the frame, glow knocked back
  const c = N.c;
  const gr = c.createLinearGradient(0, o.hz, 0, o.hz + D * 0.42);
  gr.addColorStop(0, o.bg ?? NEON.bg);
  gr.addColorStop(0.3, rgba(o.bg ?? NEON.bg, 0.6));
  gr.addColorStop(1, rgba(o.bg ?? NEON.bg, 0));
  c.fillStyle = gr;
  c.fillRect(x0, o.hz - 1, x1 - x0, D * 0.42 + 1);
  N.fadeGlow(o.hz, o.hz + D * 0.4, x0, x1);
};

/** Synthwave sun with slits that scroll downward; clipped above clipY */
export const neonSun = (
  N: Neon,
  cx: number,
  cy: number,
  R: number,
  o: { clipY?: number; phase?: number; a?: number; top?: string; bottom?: string; slits?: number } = {}
) => {
  const a = o.a ?? 1;
  if (a <= 0.01 || R <= 0) return;
  const top = o.top ?? NEON.amber;
  const bot = o.bottom ?? NEON.magenta;
  const c = N.c;
  // halo
  const halo = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
  halo.addColorStop(0, rgba(bot, 0.28 * a));
  halo.addColorStop(1, rgba(bot, 0));
  const hp = new Path2D();
  hp.rect(cx - R * 2.5, cy - R * 2.5, R * 5, (o.clipY ?? cy + R * 2.5) - (cy - R * 2.5));
  N.light(hp, halo);

  const body = new Path2D();
  const nS = o.slits ?? 7;
  const ph = (o.phase ?? 0) % 1;
  // slits only on the lower half, thickening downward
  const cut = new Path2D();
  for (let i = 0; i < nS; i++) {
    const k = (i + ph) / nS;
    const sy = cy - R * 0.55 + k * R * 1.5;
    const th = lerp(R * 0.01, R * 0.13, k);
    cut.rect(cx - R - 2, sy, R * 2 + 4, th);
  }
  body.arc(cx, cy, R, 0, TAU);
  N.with(
    () => {
      if (o.clipY !== undefined) {
        const cp = new Path2D();
        cp.rect(cx - R * 3, cy - R * 3, R * 6, o.clipY - (cy - R * 3));
        N.clip(cp);
      }
    },
    () => {
      const gr = c.createLinearGradient(0, cy - R, 0, cy + R * 0.2);
      gr.addColorStop(0, hot(top, 0.3));
      gr.addColorStop(0.3, top);
      gr.addColorStop(0.75, NEON.pink);
      gr.addColorStop(1, bot);
      c.globalAlpha = a;
      // body minus slits
      c.save();
      c.clip(body);
      const full = new Path2D();
      full.rect(cx - R - 2, cy - R - 2, R * 2 + 4, R * 2 + 4);
      full.addPath(cut);
      c.fillStyle = gr;
      c.fill(full, 'evenodd');
      c.restore();
      c.globalAlpha = 1;
      const g = N.g;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.2 * a;
      g.fillStyle = bot;
      g.fill(body);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  );
};

export interface Star {
  x: number;
  y: number;
  s: number;
  ph: number;
}

export const makeStars = (n: number, seed: number, x0 = 0, x1 = 1600, y0 = 0, y1 = 450): Star[] => {
  const rng = mulberry(seed);
  return Array.from({ length: n }, () => ({
    x: lerp(x0, x1, rng()),
    y: lerp(y0, y1, rng() * rng()),
    s: 0.8 + rng() * rng() * 2.4,
    ph: rng() * 10,
  }));
};

/** Twinkling stars, batched into two brightness groups */
export const drawStars = (N: Neon, stars: Star[], t: number, a = 1) => {
  if (a <= 0.01) return;
  const p1 = new Path2D();
  const p2 = new Path2D();
  for (const s of stars) {
    const on = 0.5 + 0.5 * Math.sin(t * 2.3 + s.ph * 3);
    (on > 0.5 ? p1 : p2).rect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
  }
  N.fill(p1, rgba('#d8ccff', 0.9 * a), NEON.violet, 0.5 * a);
  N.fill(p2, rgba('#b0a0ff', 0.45 * a));
};

/** Spark burst: radiating tube lines, k in 0..1 through the burst */
export const sparks = (N: Neon, x: number, y: number, k: number, seed: number, col: string, R = 120, n = 12) => {
  if (k <= 0 || k >= 1) return;
  const p = new Path2D();
  const e = 1 - Math.pow(1 - k, 3);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + hash(seed + i) * 0.5;
    const len = R * (0.5 + hash(seed * 3 + i) * 0.7);
    const r0 = len * e;
    const r1 = len * Math.min(1, e * 1.25 + 0.1) * (1 - 0.6 * k) + r0 * 0.6 * k;
    p.moveTo(x + Math.cos(ang) * r0 * 0.9, y + Math.sin(ang) * r0 * 0.9);
    p.lineTo(x + Math.cos(ang) * Math.max(r0, r1 + R * 0.15), y + Math.sin(ang) * Math.max(r0, r1 + R * 0.15));
  }
  N.tube(p, col, 3 * (1 - k * 0.6), 1 - seg(k, 0.6, 1));
  const ring = new Path2D();
  ring.arc(x, y, R * 0.3 + R * 0.7 * e, 0, TAU);
  N.tube(ring, col, 2.4 * (1 - k), (1 - k) * 0.8);
};

/** Rectangle path helper */
export const rect = (x: number, y: number, w: number, h: number, p = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

export const line = (x0: number, y0: number, x1: number, y1: number, p = new Path2D()) => {
  p.moveTo(x0, y0);
  p.lineTo(x1, y1);
  return p;
};
