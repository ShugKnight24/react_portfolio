// Offscreen canvas helpers. Every function tolerates environments where
// getContext('2d') returns null (jsdom in tests) by returning null contexts.

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
}

/**
 * `readback` asks for a CPU-backed context: fast getImageData for bake-time
 * pixel passes, without stalling the GPU.
 */
export const createSurface = (w: number, h: number, readback = false): Surface => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = readback
      ? (canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null)
      : canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
};

/** Snap anti-aliased edges to hard pixels (alpha >= threshold becomes opaque). */
export const hardenAlpha = (s: Surface, threshold = 110): void => {
  if (!s.ctx) return;
  const { width, height } = s.canvas;
  const img = s.ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= threshold ? 255 : 0;
  s.ctx.putImageData(img, 0, 0);
};

/** Mirror a surface horizontally into a new surface. */
export const mirrorSurface = (src: HTMLCanvasElement): Surface => {
  const out = createSurface(src.width, src.height);
  if (out.ctx) {
    out.ctx.save();
    out.ctx.translate(src.width, 0);
    out.ctx.scale(-1, 1);
    out.ctx.drawImage(src, 0, 0);
    out.ctx.restore();
  }
  return out;
};

/** Solid-colour silhouette of a surface (used for hit flashes / telegraphs). */
export const tintSurface = (src: HTMLCanvasElement, color: string): Surface => {
  const out = createSurface(src.width, src.height);
  if (out.ctx) {
    out.ctx.drawImage(src, 0, 0);
    out.ctx.globalCompositeOperation = 'source-in';
    out.ctx.fillStyle = color;
    out.ctx.fillRect(0, 0, src.width, src.height);
    out.ctx.globalCompositeOperation = 'source-over';
  }
  return out;
};
