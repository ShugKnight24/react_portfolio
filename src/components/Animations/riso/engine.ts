/**
 * Riso press: a tiny Canvas 2D renderer that makes every frame look like a risograph print.
 *
 * A film draws each ink onto its own layer (only coverage matters, colour is ignored), using
 * solid fills or halftone tones. The press then knocks a little speckle out of every layer,
 * tints it with its ink, and overprints the layers on warm paper with multiply and a slight
 * misregistration, so overlaps mix like real inks. Halftone screens and grain are pinned to the
 * paper (device space), like a real print, so they never swim when the camera moves.
 *
 * Films draw in a fixed 1600 x 900 logical space and must be pure functions of time, so the
 * timeline can scrub to any frame.
 *
 * Films in other styles (woodblock, blueprint, cut paper, neon) set mode: 'direct' and paint in
 * full colour straight onto the frame: r.layers is then a single context, the background is
 * filled with `paper` (as a textured sheet when paperTexture is set) and `grain` is optional.
 */

export const W = 1600;
export const H = 900;

/** Halftone cell size in logical px */
const CELL = 5.5;
const LEVELS = 24;
const DEFAULT_ANGLES = [15, 75, 45, 0, 30, 60];

export interface Ink {
  color: string;
  /** Halftone screen angle in degrees */
  angle?: number;
  /** Misregistration in logical px */
  offset?: [number, number];
  /** Ink density when overprinted, default 0.9 */
  opacity?: number;
}

export interface FilmScene {
  /** Start time in seconds */
  at: number;
  label: string;
}

export interface RisoFilm<S = unknown> {
  id: string;
  title: string;
  /** One line under the title */
  caption: string;
  /** Portfolio theme this film belongs to, e.g. "Luna" */
  theme: string;
  /** The recurring motif, in a few words */
  motif: string;
  /** Seconds */
  duration: number;
  paper: string;
  inks: Ink[];
  scenes: FilmScene[];
  /** Frame used for the gallery card */
  posterTime?: number;
  /** Style series the film belongs to on the Animations page, default "Risograph" */
  series?: string;
  /** Browsing category on the Animations page (Cinematic, Athletic, Video game, ...); derived from theme when unset */
  category?: string;
  /** 'riso' (default) overprints ink layers; 'direct' paints full colour on one context */
  mode?: 'riso' | 'direct';
  /** Direct mode: draw the paper sheet (fibres, mottling) behind the frame instead of a flat fill */
  paperTexture?: boolean;
  /** Strength of the multiply grain over the finished frame, default 0.55 in riso and 0 in direct */
  grain?: number;
  /** Build caches (paths, sprites, seeded detail). Called again whenever the press resizes */
  setup?(r: Riso): S;
  /** Draw the frame at time t onto r.layers. Must not depend on anything but t and s */
  draw(r: Riso, t: number, s: S): void;
}

export type Ctx = CanvasRenderingContext2D;

export type ToneGradient =
  | { kind: 'linear'; x0: number; y0: number; x1: number; y1: number; from: number; to: number }
  | { kind: 'radial'; cx: number; cy: number; r0: number; r1: number; from: number; to: number };

export interface Riso {
  readonly W: number;
  readonly H: number;
  /** Device px per logical px */
  readonly scale: number;
  /** One context per ink, already in logical coordinates (with the camera applied).
   * In direct mode this is a single full-colour context. */
  readonly layers: Ctx[];
  /** Run fn on every layer inside save/restore */
  all(fn: (ctx: Ctx, ink: number) => void): void;
  /** Camera for every layer this frame: centre of view in logical px, zoom and rotation */
  camera(cx: number, cy: number, zoom?: number, rot?: number): void;
  /**
   * Fill style for a halftone of density d (0..1) on this layer.
   * Ask for it right before filling, since it is pinned to the current transform.
   * On a scratch canvas, pass the ink index so the dots use that ink's screen angle.
   */
  tone(ctx: Ctx, d: number, ink?: number): string | CanvasPattern;
  /** Stepped halftone gradient, clipped to path (or the whole canvas when path is null) */
  gradient(ctx: Ctx, path: Path2D | null, g: ToneGradient, steps?: number): void;
  /** Make a scratch canvas sized for logical (w, h) at the press scale */
  scratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx };
}

export interface Press {
  /** Match the canvas backing store to a CSS size */
  resize(cssW: number, cssH: number, dpr: number): void;
  render<S>(film: RisoFilm<S>, t: number): void;
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}

/* ---------- seeded noise ---------- */

export const mulberry = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return { canvas: c, ctx };
};

/** Paper: base colour, soft mottling, fibres and fine tooth */
const makePaper = (w: number, h: number, color: string, scale: number) => {
  const { canvas, ctx } = makeCanvas(w, h);
  const rng = mulberry(7);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (60 + rng() * 260) * scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng() < 0.55;
    g.addColorStop(0, dark ? 'rgba(120,90,50,0.035)' : 'rgba(255,255,245,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * Math.PI * 2;
    const l = (2 + rng() * 9) * scale;
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(90,70,40,0.07)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(0.6, 0.5 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 16;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Speckle tile: sparse holes where the drum skipped ink, used with destination-out */
const makeSpeckle = (size: number, seed: number, scale: number) => {
  const { canvas, ctx } = makeCanvas(size, size);
  const rng = mulberry(seed);
  for (let i = 0; i < size * size * 0.0016; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = (0.35 + rng() * rng() * 1.6) * scale;
    ctx.fillStyle = `rgba(0,0,0,${0.35 + rng() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine uneven coverage
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] === 0) d[i] = rng() < 0.5 ? Math.floor(rng() * 34) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Grain laid over the finished print with multiply */
const makeGrain = (size: number, seed: number) => {
  const { canvas, ctx } = makeCanvas(size, size);
  const rng = mulberry(seed);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 255 - Math.floor(rng() * rng() * 46);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v - 2;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Halftone tile: one dot per cell, sized so coverage roughly matches d */
const makeDotTile = (cellPx: number, d: number) => {
  const { canvas, ctx } = makeCanvas(cellPx, cellPx);
  const c = cellPx / 2;
  const area = d * cellPx * cellPx;
  let r = Math.sqrt(area / Math.PI);
  // Past the inscribed circle, grow faster so dense tones close up toward solid
  if (r > c) r = c + (r - c) * 1.6;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(c, c, Math.min(r, cellPx * 0.72), 0, Math.PI * 2);
  ctx.fill();
  return canvas;
};

export function createPress(canvas: HTMLCanvasElement, opts: { maxWidth?: number } = {}): Press {
  const maxWidth = opts.maxWidth ?? 2200;
  const main = canvas.getContext('2d', { alpha: false });
  if (!main) throw new Error('Canvas 2D is unavailable');

  let dw = 0;
  let dh = 0;
  let scale = 1;
  let layerCanvases: HTMLCanvasElement[] = [];
  let layerCtxs: Ctx[] = [];
  let paper: HTMLCanvasElement | null = null;
  let paperColor = '';
  let speckle: CanvasPattern | null = null;
  let grain: CanvasPattern | null = null;
  let dotTiles: HTMLCanvasElement[] = [];
  /** patterns[ink][level] */
  let patterns: (CanvasPattern | null)[][] = [];
  let currentFilm: RisoFilm<unknown> | null = null;
  let filmState: unknown = undefined;
  let filmInks: Ink[] = [];

  const inkIndex = new Map<Ctx, number>();
  inkIndex.set(main, 0);
  /** Contexts the current film draws on: its ink layers, or the frame itself in direct mode */
  let active: Ctx[] = [];

  const ensureLayers = (n: number) => {
    while (layerCanvases.length < n) {
      const { canvas: c, ctx } = makeCanvas(dw, dh);
      inkIndex.set(ctx, layerCanvases.length);
      layerCanvases.push(c);
      layerCtxs.push(ctx);
    }
  };

  const resetCaches = () => {
    paper = null;
    patterns = [];
    currentFilm = null;
    const cellPx = Math.max(3, Math.round(CELL * scale));
    dotTiles = [];
    for (let l = 0; l <= LEVELS; l++) dotTiles.push(makeDotTile(cellPx, l / LEVELS));
    const sp = makeSpeckle(Math.round(256 * Math.max(1, scale * 0.8)), 11, scale);
    speckle = main.createPattern(sp, 'repeat');
    const gr = makeGrain(256, 23);
    grain = main.createPattern(gr, 'repeat');
  };

  const riso: Riso = {
    W,
    H,
    get scale() {
      return scale;
    },
    get layers() {
      return active;
    },
    all(fn) {
      for (let i = 0; i < active.length; i++) {
        const ctx = active[i];
        ctx.save();
        fn(ctx, i);
        ctx.restore();
      }
    },
    camera(cx, cy, zoom = 1, rot = 0) {
      const m = new DOMMatrix()
        .scale(scale, scale)
        .translate(W / 2, H / 2)
        .rotate((rot * 180) / Math.PI)
        .scale(zoom, zoom)
        .translate(-cx, -cy);
      for (const ctx of active) ctx.setTransform(m);
    },
    tone(ctx, d, inkOverride) {
      if (d <= 0.012) return 'rgba(0,0,0,0)';
      if (d >= 0.985) return '#000';
      const ink = inkOverride ?? inkIndex.get(ctx) ?? 0;
      const level = Math.max(1, Math.min(LEVELS - 1, Math.round(d * LEVELS)));
      const row = (patterns[ink] ??= []);
      let p = row[level];
      if (!p) {
        p = ctx.createPattern(dotTiles[level], 'repeat');
        row[level] = p;
      }
      if (!p) return '#000';
      const angle = filmInks[ink]?.angle ?? DEFAULT_ANGLES[ink % DEFAULT_ANGLES.length];
      // Pin the screen to the paper: undo the current transform, then rotate in device space
      const m = ctx.getTransform().invertSelf().multiply(new DOMMatrix().rotate(angle));
      p.setTransform(m);
      return p;
    },
    gradient(ctx, path, g, steps = 14) {
      ctx.save();
      if (path) ctx.clip(path);
      if (g.kind === 'linear') {
        const dx = g.x1 - g.x0;
        const dy = g.y1 - g.y0;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const big = 6000;
        for (let j = 0; j < steps; j++) {
          const a = j === 0 ? -big : (j / steps) * len;
          const b = j === steps - 1 ? len + big : ((j + 1) / steps) * len + 0.5;
          const d = g.from + (g.to - g.from) * ((j + 0.5) / steps);
          ctx.beginPath();
          ctx.moveTo(g.x0 + ux * a - uy * big, g.y0 + uy * a + ux * big);
          ctx.lineTo(g.x0 + ux * b - uy * big, g.y0 + uy * b + ux * big);
          ctx.lineTo(g.x0 + ux * b + uy * big, g.y0 + uy * b - ux * big);
          ctx.lineTo(g.x0 + ux * a + uy * big, g.y0 + uy * a - ux * big);
          ctx.closePath();
          ctx.fillStyle = riso.tone(ctx, d);
          ctx.fill();
        }
      } else {
        // Rings from the centre out, each an annulus so nothing already on the layer is touched
        const ring = (inner: number, outer: number, d: number) => {
          ctx.beginPath();
          ctx.arc(g.cx, g.cy, Math.max(0.1, outer), 0, Math.PI * 2);
          if (inner > 0) ctx.arc(g.cx, g.cy, inner, 0, Math.PI * 2, true);
          ctx.fillStyle = riso.tone(ctx, d);
          ctx.fill('evenodd');
        };
        for (let j = 0; j < steps; j++) {
          const inner = j === 0 ? 0 : g.r0 + ((g.r1 - g.r0) * j) / steps;
          const outer = g.r0 + ((g.r1 - g.r0) * (j + 1)) / steps;
          ring(inner, outer, g.from + (g.to - g.from) * ((j + 0.5) / steps));
        }
        ring(g.r1, 9000, g.to);
      }
      ctx.restore();
    },
    scratch(w, h) {
      const s = makeCanvas(w * scale, h * scale);
      s.ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return s;
    },
  };

  const press: Press = {
    canvas,
    resize(cssW, _cssH, dpr) {
      let w = Math.max(2, Math.round(cssW * dpr));
      if (w > maxWidth) w = maxWidth;
      const h = Math.round((w * H) / W);
      if (w === dw && h === dh) return;
      dw = w;
      dh = h;
      scale = dw / W;
      canvas.width = dw;
      canvas.height = dh;
      for (const c of layerCanvases) {
        c.width = dw;
        c.height = dh;
      }
      resetCaches();
    },
    render(film, t) {
      if (!dw) return;
      if (currentFilm !== (film as RisoFilm<unknown>)) {
        currentFilm = film as RisoFilm<unknown>;
        filmInks = film.inks;
        ensureLayers(film.mode === 'direct' ? 0 : film.inks.length);
        active = film.mode === 'direct' ? [main] : layerCtxs.slice(0, film.inks.length);
        patterns = [];
        filmState = film.setup?.(riso);
      }
      const direct = film.mode === 'direct';
      const textured = !direct || film.paperTexture;
      if (textured && (!paper || paperColor !== film.paper)) {
        paper = makePaper(dw, dh, film.paper, scale);
        paperColor = film.paper;
      }
      const base = new DOMMatrix().scale(scale, scale);
      const clamped = Math.max(0, Math.min(film.duration, t));

      if (direct) {
        active = [main];
        main.setTransform(1, 0, 0, 1, 0, 0);
        main.globalCompositeOperation = 'source-over';
        main.globalAlpha = 1;
        main.filter = 'none';
        if (textured && paper) main.drawImage(paper, 0, 0);
        else {
          main.fillStyle = film.paper;
          main.fillRect(0, 0, dw, dh);
        }
        main.setTransform(base);
        main.fillStyle = '#000';
        main.strokeStyle = '#000';
        main.save();
        (film.draw as (r: Riso, t: number, s: unknown) => void)(riso, clamped, filmState);
        main.restore();
        main.setTransform(1, 0, 0, 1, 0, 0);
        const g = film.grain ?? 0;
        if (grain && g > 0) {
          main.globalCompositeOperation = 'multiply';
          main.globalAlpha = g;
          main.fillStyle = grain;
          main.fillRect(0, 0, dw, dh);
        }
        main.globalCompositeOperation = 'source-over';
        main.globalAlpha = 1;
        return;
      }

      active = layerCtxs.slice(0, film.inks.length);
      for (let i = 0; i < film.inks.length; i++) {
        const ctx = layerCtxs[i];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, dw, dh);
        ctx.setTransform(base);
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
      }

      (film.draw as (r: Riso, t: number, s: unknown) => void)(riso, clamped, filmState);

      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalCompositeOperation = 'source-over';
      main.globalAlpha = 1;
      if (paper) main.drawImage(paper, 0, 0);

      for (let i = 0; i < film.inks.length; i++) {
        const ink = film.inks[i];
        const ctx = layerCtxs[i];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        if (speckle) {
          // Each ink skips in different places
          speckle.setTransform(new DOMMatrix().translate(i * 97, i * 61).rotate(i * 37));
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = speckle;
          ctx.fillRect(0, 0, dw, dh);
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = ink.color;
        ctx.fillRect(0, 0, dw, dh);
        ctx.globalCompositeOperation = 'source-over';

        const [ox, oy] = ink.offset ?? [0, 0];
        main.globalCompositeOperation = 'multiply';
        main.globalAlpha = ink.opacity ?? 0.9;
        main.drawImage(layerCanvases[i], Math.round(ox * scale * 10) / 10, Math.round(oy * scale * 10) / 10);
      }

      if (grain && (film.grain ?? 0.55) > 0) {
        main.globalCompositeOperation = 'multiply';
        main.globalAlpha = film.grain ?? 0.55;
        main.fillStyle = grain;
        main.fillRect(0, 0, dw, dh);
      }
      main.globalCompositeOperation = 'source-over';
      main.globalAlpha = 1;
    },
    dispose() {
      for (const c of layerCanvases) {
        c.width = 0;
        c.height = 0;
      }
      layerCanvases = [];
      layerCtxs = [];
      inkIndex.clear();
      paper = null;
      currentFilm = null;
    },
  };

  return press;
}
