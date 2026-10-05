// Fixed-capacity object pools for all transient FX. Nothing here allocates in
// the per-frame update/draw paths; spawns recycle the oldest slot when full.
import { OUTLINE } from './constants';
import { drawText } from './font';

export const PK_DUST = 0;
export const PK_SPARK = 1;
export const PK_DEBRIS = 2;
export const PK_RING = 3;
export const PK_CONFETTI = 4;
export const PK_BURST = 5;
export const PK_SMOKE = 6;

export class Particle {
  active = false;
  kind = 0;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  g = 0;
  life = 0;
  max = 1;
  size = 1;
  color = '#fff';
  /** draw above actors (sparks) vs. at ground level (dust) */
  top = false;
}

export class FloatText {
  active = false;
  x = 0;
  y = 0;
  z = 0;
  vz = 0;
  life = 0;
  max = 1;
  text = '';
  color = '#fff';
  scale = 1;
}

export class FxPools {
  readonly parts: Particle[];
  readonly texts: FloatText[];
  private pi = 0;
  private ti = 0;
  reduced = false;

  constructor(partCap = 320, textCap = 40) {
    this.parts = Array.from({ length: partCap }, () => new Particle());
    this.texts = Array.from({ length: textCap }, () => new FloatText());
  }

  private nextPart(): Particle {
    const n = this.parts.length;
    for (let k = 0; k < n; k++) {
      const p = this.parts[(this.pi + k) % n];
      if (!p.active) {
        this.pi = (this.pi + k + 1) % n;
        return p;
      }
    }
    const p = this.parts[this.pi];
    this.pi = (this.pi + 1) % n;
    return p;
  }

  private emit(
    kind: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: string,
    g: number,
    top: boolean
  ): Particle {
    const p = this.nextPart();
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.g = g;
    p.top = top;
    return p;
  }

  dust(x: number, y: number, n: number, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (10 + Math.random() * 30) * spread;
      this.emit(
        PK_DUST,
        x + (Math.random() - 0.5) * 8,
        y,
        1 + Math.random() * 3,
        Math.cos(a) * sp,
        Math.sin(a) * sp * 0.3,
        8 + Math.random() * 16,
        18 + Math.random() * 14,
        2 + Math.random() * 2,
        '#e8dcc8',
        0,
        false
      );
    }
  }

  sparks(x: number, y: number, z: number, dir: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.8;
      const sp = 90 + Math.random() * 140;
      this.emit(
        PK_SPARK,
        x,
        y,
        z,
        Math.cos(a) * sp * dir,
        (Math.random() - 0.5) * 30,
        Math.sin(a) * sp + 30,
        8 + Math.random() * 8,
        1 + Math.random() * 1.5,
        color,
        300,
        true
      );
    }
  }

  burst(x: number, y: number, z: number, size: number, color: string): void {
    this.emit(PK_BURST, x, y, z, 0, 0, 0, this.reduced ? 5 : 8, size, color, 0, true);
  }

  ring(x: number, y: number, size: number, color: string): void {
    this.emit(PK_RING, x, y, 0, 0, 0, 0, 22, size, color, 0, false);
  }

  debris(x: number, y: number, z: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      this.emit(
        PK_DEBRIS,
        x,
        y,
        z,
        (Math.random() - 0.5) * 160,
        (Math.random() - 0.5) * 40,
        80 + Math.random() * 140,
        40 + Math.random() * 20,
        2 + Math.random() * 2,
        color,
        600,
        true
      );
    }
  }

  confetti(x: number, y: number, n: number): void {
    const cols = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585'];
    for (let i = 0; i < n; i++) {
      this.emit(
        PK_CONFETTI,
        x + (Math.random() - 0.5) * 60,
        y,
        60 + Math.random() * 60,
        (Math.random() - 0.5) * 80,
        0,
        40 + Math.random() * 120,
        90 + Math.random() * 60,
        2,
        cols[i % cols.length],
        200,
        true
      );
    }
  }

  smoke(x: number, y: number, z: number, color: string): void {
    this.emit(
      PK_SMOKE,
      x,
      y,
      z,
      (Math.random() - 0.5) * 10,
      0,
      16 + Math.random() * 10,
      26,
      3 + Math.random() * 2,
      color,
      0,
      true
    );
  }

  text(x: number, y: number, z: number, str: string, color: string, scale = 1, life = 40): void {
    const n = this.texts.length;
    let t = this.texts[this.ti];
    for (let k = 0; k < n; k++) {
      const c = this.texts[(this.ti + k) % n];
      if (!c.active) {
        t = c;
        this.ti = (this.ti + k + 1) % n;
        break;
      }
    }
    t.active = true;
    t.x = x;
    t.y = y;
    t.z = z;
    t.vz = scale > 1 ? 20 : 40;
    t.life = life;
    t.max = life;
    t.text = str;
    t.color = color;
    t.scale = scale;
  }

  update(dt: number): void {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life--;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.g * dt;
      p.z += p.vz * dt;
      if (p.kind === PK_DUST || p.kind === PK_SMOKE) {
        p.vx *= 0.9;
        p.vz *= 0.92;
      }
      if (p.z < 0) {
        if (p.kind === PK_DEBRIS || p.kind === PK_CONFETTI) {
          p.z = 0;
          p.vz = -p.vz * 0.35;
          p.vx *= 0.6;
        } else {
          p.z = 0;
        }
      }
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      t.life--;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.z += t.vz * dt;
      t.vz *= 0.9;
    }
  }

  clear(): void {
    for (const p of this.parts) p.active = false;
    for (const t of this.texts) t.active = false;
  }

  /** Draw ground-level (top=false) or overlay (top=true) particles. */
  draw(ctx: CanvasRenderingContext2D, camX: number, top: boolean): void {
    for (const p of this.parts) {
      if (!p.active || p.top !== top) continue;
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y - p.z);
      const k = p.life / p.max;
      switch (p.kind) {
        case PK_DUST:
        case PK_SMOKE: {
          // rounded puff: plus-shaped blob with a darker underside
          const s = Math.max(1, Math.round(p.size * (1.6 - k * 0.6)));
          const h = s >> 1;
          ctx.globalAlpha = Math.min(1, k * 1.4) * 0.8;
          ctx.fillStyle = p.color;
          if (s >= 3) {
            ctx.fillRect(sx - h + 1, sy - h, s - 2, s);
            ctx.fillRect(sx - h, sy - h + 1, s, s - 2);
            ctx.globalAlpha *= 0.5;
            ctx.fillStyle = OUTLINE;
            ctx.fillRect(sx - h + 1, sy - h + s - 1, s - 2, 1);
          } else {
            ctx.fillRect(sx - h, sy - h, s, s);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case PK_SPARK: {
          // streak trailing along the spark's motion, hot white head
          const len = Math.max(1, Math.round(p.size * 2 * k + 1));
          const dx = p.vx > 0 ? -1 : 1;
          const dy = p.vz > 0 ? 1 : -1;
          ctx.fillStyle = p.color;
          for (let i = 1; i <= len; i++)
            ctx.fillRect(sx + dx * i, sy + Math.round((dy * i) / 2), 1, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx, sy, 1, 1);
          break;
        }
        case PK_DEBRIS:
        case PK_CONFETTI: {
          ctx.fillStyle = p.kind === PK_DEBRIS ? OUTLINE : p.color;
          const s = Math.round(p.size);
          ctx.fillRect(sx - 1, sy - 1, s + 1, s + 1);
          if (p.kind === PK_DEBRIS) {
            ctx.fillStyle = p.color;
            ctx.fillRect(sx, sy, Math.max(1, s - 1), Math.max(1, s - 1));
          }
          break;
        }
        case PK_RING: {
          const r = p.size * (1.15 - k);
          const ry = r * 0.3;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(1, k * 1.6);
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * ry), 2, 1);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case PK_BURST: {
          // arcade impact star: 8 tapered rays around a white-hot core, with
          // a ring that snaps outward on the last frames
          const grow = 1 - k;
          const r = Math.round(p.size * (0.6 + grow * 0.7));
          const inner = Math.max(1, Math.round(r * 0.4));
          const d = Math.round(r * 0.7);
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(sx - r - 1, sy - 1, r * 2 + 3, 3);
          ctx.fillRect(sx - 1, sy - r - 1, 3, r * 2 + 3);
          for (let i = -d; i <= d; i++) {
            ctx.fillRect(sx + i - 1, sy + i - 1, 3, 3);
            ctx.fillRect(sx + i - 1, sy - i - 1, 3, 3);
          }
          ctx.fillStyle = p.color;
          ctx.fillRect(sx - r, sy, r * 2 + 1, 1);
          ctx.fillRect(sx, sy - r, 1, r * 2 + 1);
          for (let i = -d; i <= d; i++) {
            ctx.fillRect(sx + i, sy + i, 1, 1);
            ctx.fillRect(sx + i, sy - i, 1, 1);
          }
          if (k > 0.45) {
            ctx.fillStyle = OUTLINE;
            ctx.fillRect(sx - inner - 1, sy - inner, inner * 2 + 3, inner * 2 + 1);
            ctx.fillRect(sx - inner, sy - inner - 1, inner * 2 + 1, inner * 2 + 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - inner, sy - inner, inner * 2 + 1, inner * 2 + 1);
          } else {
            const rr = r + 2;
            ctx.fillStyle = p.color;
            for (let i = 0; i < 16; i++) {
              const a = (i / 16) * Math.PI * 2;
              ctx.fillRect(
                Math.round(sx + Math.cos(a) * rr),
                Math.round(sy + Math.sin(a) * rr),
                1,
                1
              );
            }
          }
          break;
        }
      }
    }
    if (top) {
      for (const t of this.texts) {
        if (!t.active) continue;
        const blink = t.life < 10 && t.life % 4 < 2;
        if (blink) continue;
        drawText(ctx, t.text, t.x - camX, t.y - t.z, t.color, t.scale, 'center');
      }
    }
  }
}
