// Renders the game into the low-res view buffer: parallax backdrop, ground FX,
// shadows, depth-sorted actors/items/projectiles (by feet y), overlay FX,
// beams, foreground, HUD and banners. Uses a reusable draw list (no per-frame
// allocation) and integer-snapped, interpolated positions.
import { Actor } from './actor';
import { Backdrop, drawBackdrop, drawForeground, getBackdrop } from './backgrounds';
import { BOSSES, BossId } from './bosses';
import { createSurface, Surface } from './canvas';
import { FLOOR_BOTTOM, FLOOR_TOP, OUTLINE, VIEW_H, VIEW_W } from './constants';
import { FIGHTERS } from './fighters';
import { drawText } from './font';
import type { Game, PlayerSlot } from './game';
import { Item, itemSprite, Projectile } from './items';
import { lerp, mix } from './math';
import { getSprites, tinted, warmSprites } from './spriteBank';

const SLOT_COLORS = ['#ffd35a', '#39e8ff'];
const SLOT_TAGS = ['1P', '2P'];

interface DrawItem {
  y: number;
  actor: Actor | null;
  item: Item | null;
  proj: Projectile | null;
}

const byY = (a: DrawItem, b: DrawItem) => a.y - b.y;

/**
 * Two-tone contact shadow: a darker core under the feet inside a lighter
 * penumbra, hard-edged to match the pixel art. Cached per width bucket.
 */
const shadowCache = new Map<number, HTMLCanvasElement>();
const actorShadow = (w: number): HTMLCanvasElement => {
  const bw = Math.max(6, Math.min(80, Math.round(w / 2) * 2));
  const hit = shadowCache.get(bw);
  if (hit) return hit;
  const bh = Math.max(3, Math.round(bw * 0.3));
  const s = createSurface(bw, bh);
  if (s.ctx) {
    const img = s.ctx.createImageData(bw, bh);
    const d = img.data;
    const rx = bw / 2;
    const ry = bh / 2;
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const nx = (x + 0.5 - rx) / rx;
        const ny = (y + 0.5 - ry) / ry;
        const e = nx * nx + ny * ny;
        if (e > 1) continue;
        const o = (y * bw + x) * 4;
        d[o] = 12;
        d[o + 1] = 6;
        d[o + 2] = 26;
        d[o + 3] = e < 0.45 ? 128 : 82;
      }
    s.ctx.putImageData(img, 0, 0);
  }
  shadowCache.set(bw, s.canvas);
  return s.canvas;
};

export class Renderer {
  readonly view: Surface = createSurface(VIEW_W, VIEW_H);
  private list: DrawItem[] = Array.from({ length: 160 }, () => ({
    y: 0,
    actor: null,
    item: null,
    proj: null,
  }));
  private sorted: DrawItem[] = [];
  private hpTrail = [100, 100];
  private scoreVal = [-1, -1];
  private scoreStr = ['', ''];
  private bossTrail = 1;
  private backdrop: Backdrop | null = null;
  private backdropTheme = '';
  reduced = false;

  get ctx(): CanvasRenderingContext2D | null {
    return this.view.ctx;
  }

  render(g: Game, alpha: number): void {
    const ctx = this.view.ctx;
    if (!ctx) return;
    warmSprites(1.5);
    ctx.imageSmoothingEnabled = false;
    if (this.backdropTheme !== g.stageTheme || !this.backdrop) {
      this.backdrop = getBackdrop(g.stageTheme);
      this.backdropTheme = g.stageTheme;
    }
    const cam = g.camera;
    const shake = g.phase === 'playing' ? 1 : 0;
    const camX = cam.renderX(alpha) - cam.shakeX * shake;
    ctx.save();
    ctx.translate(0, cam.shakeY * shake);
    drawBackdrop(ctx, this.backdrop, camX);

    if (g.phase === 'title') {
      this.drawParade(ctx, g, alpha);
      ctx.restore();
      this.vignette(ctx);
      return;
    }
    if (g.phase === 'select') {
      ctx.restore();
      this.drawSelect(ctx, g);
      return;
    }

    this.drawHazards(ctx, g, camX, false);
    g.fx.draw(ctx, camX, false);
    this.drawWorld(ctx, g, camX, alpha);
    this.drawBeams(ctx, g, camX, alpha);
    this.drawHazards(ctx, g, camX, true);
    g.fx.draw(ctx, camX, true);
    drawForeground(ctx, this.backdrop, camX);
    ctx.restore();

    if (g.flashT > 0) {
      ctx.globalAlpha = (g.flashT / 6) * 0.45;
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    this.drawHud(ctx, g);
    this.drawBanners(ctx, g);
    if (g.paused) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  private vignette(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, VIEW_W, 6);
    ctx.fillRect(0, VIEW_H - 6, VIEW_W, 6);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ world
  private drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, z: number) {
    // shrinks and fades as the body rises, so jumps read clearly
    const k = 1 - Math.min(z, 90) / 180;
    const img = actorShadow(w * k);
    ctx.globalAlpha = 1 - Math.min(z, 90) / 200;
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    ctx.globalAlpha = 1;
  }

  private drawWorld(ctx: CanvasRenderingContext2D, g: Game, camX: number, alpha: number) {
    let n = 0;
    const push = (y: number, actor: Actor | null, item: Item | null, proj: Projectile | null) => {
      if (n >= this.list.length) return;
      const d = this.list[n++];
      d.y = y;
      d.actor = actor;
      d.item = item;
      d.proj = proj;
    };
    for (const a of g.fighters) push(a.y + (a.state === 'grabbed' ? 0.5 : 0), a, null, null);
    for (const it of g.items.items) if (it.active) push(it.y - 0.1, null, it, null);
    for (const p of g.projectiles.items) if (p.active) push(p.y + 0.2, null, null, p);
    if (g.phase === 'ending' || g.phase === 'stageClear') {
      // players only list during tallies
    }
    this.sorted.length = 0;
    for (let i = 0; i < n; i++) this.sorted.push(this.list[i]);
    this.sorted.sort(byY);

    // shadows first (all on ground plane)
    for (const d of this.sorted) {
      if (d.actor) {
        const a = d.actor;
        if (a.state === 'gone') continue;
        const x = lerp(a.px, a.x, alpha) - camX;
        const w = a.state === 'down' || a.state === 'dead' ? a.halfWidth * 5 : a.halfWidth * 2.8;
        this.drawShadow(ctx, x, lerp(a.py, a.y, alpha) + 1, w, lerp(a.pz, a.z, alpha));
      } else if (d.item) {
        this.drawShadow(
          ctx,
          d.item.x - camX,
          d.item.y + 1,
          d.item.kind === 'crate' ? 24 : 14,
          d.item.z
        );
      } else if (d.proj) {
        this.drawShadow(ctx, lerp(d.proj.px, d.proj.x, alpha) - camX, d.proj.y + 1, 10, d.proj.z);
      }
    }
    for (const d of this.sorted) {
      if (d.actor) this.drawActor(ctx, g, d.actor, camX, alpha);
      else if (d.item) this.drawItem(ctx, g, d.item, camX);
      else if (d.proj) this.drawProj(ctx, g, d.proj, camX, alpha);
    }
    // overhead tags / enemy bars after all bodies so they never get covered
    for (const d of this.sorted) if (d.actor) this.drawTags(ctx, g, d.actor, camX, alpha);
  }

  private drawActor(ctx: CanvasRenderingContext2D, g: Game, a: Actor, camX: number, alpha: number) {
    if (a.state === 'gone') return;
    const table = a.facing > 0 ? a.sprites.right : a.sprites.left;
    const frames = table[a.anim];
    const fr = frames[Math.min(a.frame, frames.length - 1)];
    if (!fr) return;
    let x = lerp(a.px, a.x, alpha) - camX;
    const y = lerp(a.py, a.y, alpha);
    const z = lerp(a.pz, a.z, alpha);
    if (a.freezeMs > 0 && a.flash > 0) x += g.tick % 2 ? 1 : -1;
    if (a.kind === 'player' && a.invuln > 0 && a.state !== 'special' && (g.tick >> 2) % 2 === 0)
      return;
    if (a.state === 'dead' && a.deadT > 8 && (g.tick >> 1) % 2 === 0) return;
    if (
      a.kind === 'boss' &&
      a.pattern === 'teleport' &&
      a.state === 'pattern' &&
      a.patT < 18 &&
      g.tick % 3 !== 0
    )
      return;
    let img = fr.img;
    const flashing = a.flash > 0 && (a.flash & 2) !== 0;
    if (flashing && !this.reduced) img = fr.flash ?? tinted(img, '#ffffff');
    else if (a.tint) img = tinted(img, a.tint);
    // squash & stretch: gameplay sets impact squash; rising/falling bodies
    // also stretch a touch along their vertical speed (visual only)
    let sx = a.sqX;
    let sy = a.sqY;
    if (z > 1 && a.state !== 'fall' && a.state !== 'grabbed' && !this.reduced) {
      const st = Math.min(0.08, Math.abs(a.vz) / 3800);
      sy *= 1 + st;
      sx *= 1 - st * 0.6;
    }
    const w = Math.round(img.width * sx);
    const h = Math.round(img.height * sy);
    const dx = Math.round(x - fr.ax * sx);
    const dy = Math.round(y - z - fr.ay * sy);
    ctx.drawImage(img, dx, dy, w, h);
    if (flashing && this.reduced) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(tinted(fr.img, '#ffffff'), dx, dy, w, h);
      ctx.globalAlpha = 1;
    }
    if (a.heldItem) {
      const spr = itemSprite(a.heldItem);
      if (spr)
        ctx.drawImage(
          spr,
          Math.round(dx + fr.hx - spr.width / 2),
          Math.round(dy + fr.hy - spr.height / 2 - 2)
        );
    }
  }

  private drawTags(ctx: CanvasRenderingContext2D, g: Game, a: Actor, camX: number, alpha: number) {
    const x = Math.round(lerp(a.px, a.x, alpha) - camX);
    const top = Math.round(lerp(a.py, a.y, alpha) - lerp(a.pz, a.z, alpha) - a.height - 6);
    if (a.kind === 'player' && a.state !== 'dead') {
      const col = SLOT_COLORS[a.slot] ?? '#fff';
      drawText(ctx, SLOT_TAGS[a.slot] ?? 'P', x, top - 6, col, 1, 'center');
      ctx.fillStyle = col;
      ctx.fillRect(x - 1, top + 2, 3, 1);
      ctx.fillRect(x, top + 3, 1, 1);
    } else if (a.kind === 'enemy' && a.hpBarT > 0 && a.hp > 0) {
      const bw = 22;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - bw / 2 - 1, top - 1, bw + 2, 5);
      ctx.fillStyle = '#5a1020';
      ctx.fillRect(x - bw / 2, top, bw, 3);
      ctx.fillStyle = a.hp / a.maxHp < 0.35 ? '#ff4d4d' : '#ffd35a';
      ctx.fillRect(x - bw / 2, top, Math.max(1, Math.round((bw * a.hp) / a.maxHp)), 3);
    }
  }

  private drawItem(ctx: CanvasRenderingContext2D, g: Game, it: Item, camX: number) {
    if (it.life > 0 && it.life < 90 && (g.tick >> 2) % 2 === 0) return;
    let spr = itemSprite(it.kind);
    if (!spr) return;
    if (it.flash > 0) spr = tinted(spr, '#ffffff');
    const bob = it.kind === 'crate' ? 0 : Math.round(Math.sin((g.tick + it.x) * 0.08));
    ctx.drawImage(
      spr,
      Math.round(it.x - camX - spr.width / 2),
      Math.round(it.y - it.z - spr.height + bob)
    );
  }

  private drawProj(
    ctx: CanvasRenderingContext2D,
    g: Game,
    p: Projectile,
    camX: number,
    alpha: number
  ) {
    const spr = itemSprite(p.kind === 'orb' ? 'orb' : p.kind);
    if (!spr) return;
    const x = Math.round(lerp(p.px, p.x, alpha) - camX);
    const y = Math.round(p.y - lerp(p.pz, p.z, alpha));
    if (p.kind === 'batarang' || p.kind === 'bottle' || p.kind === 'pipe') {
      // spin by alternating flips
      const flip = (g.tick >> 2) % 2 === 0;
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      if (p.kind !== 'batarang' && (g.tick >> 3) % 2 === 0) ctx.rotate(Math.PI / 2);
      ctx.drawImage(spr, -Math.round(spr.width / 2), -Math.round(spr.height / 2));
      ctx.restore();
      return;
    }
    if (p.kind === 'orb') {
      const pulse = (g.tick >> 2) % 2;
      ctx.drawImage(
        spr,
        x - spr.width / 2 - pulse,
        y - spr.height / 2 - pulse,
        spr.width + pulse * 2,
        spr.height + pulse * 2
      );
      return;
    }
    ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
  }

  private drawBeams(ctx: CanvasRenderingContext2D, g: Game, camX: number, alpha: number) {
    for (const a of g.playerActors) {
      if (a.state !== 'special' || a.special !== 'beam' || !a.atk || a.atkPhase() !== 1) continue;
      const table = a.facing > 0 ? a.sprites.right : a.sprites.left;
      const fr = table[a.anim][Math.min(a.frame, table[a.anim].length - 1)];
      const x = lerp(a.px, a.x, alpha) - camX;
      const y = lerp(a.py, a.y, alpha) - a.z;
      const hx = Math.round(x - fr.ax + fr.hx);
      const hy = Math.round(y - fr.ay + fr.hy);
      const color = g.slots[a.slot]?.fighter.special.color ?? '#6ad7ff';
      const deep = mix(color, '#1a0a40', 0.45);
      const pale = mix(color, '#ffffff', 0.55);
      const dir = a.facing;
      const x0 = dir > 0 ? hx : 0;
      const x1 = dir > 0 ? VIEW_W : hx;
      const t = g.tick;
      const wob = (t >> 1) % 2;
      // layered beam: dark rim, colour body, pale inner, white-hot core
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x0, hy - 7 - wob, x1 - x0, 15 + wob * 2);
      ctx.fillStyle = deep;
      ctx.fillRect(x0, hy - 6 - wob, x1 - x0, 13 + wob * 2);
      ctx.fillStyle = color;
      ctx.fillRect(x0, hy - 5, x1 - x0, 11);
      ctx.fillStyle = pale;
      ctx.fillRect(x0, hy - 3, x1 - x0, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0, hy - 1, x1 - x0, 3);
      // travelling energy ripples + edge sparks
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 12; k++) {
        const off = (k * 37 + t * 9) % (VIEW_W + 40);
        const px = dir > 0 ? x0 + off : x1 - off;
        if (px < x0 || px > x1) continue;
        const up = (k + (t >> 2)) % 2 ? -1 : 1;
        ctx.fillRect(Math.round(px), hy + up * (6 + ((k * 3 + t) % 3)), 3, 1);
      }
      ctx.fillStyle = pale;
      for (let k = 0; k < 6; k++) {
        const px = dir > 0 ? x0 + 8 + ((k * 53 + t * 5) % 300) : x1 - 8 - ((k * 53 + t * 5) % 300);
        ctx.fillRect(Math.round(px), hy - 2 + ((k + t) % 5) - 2, 6, 1);
      }
      // muzzle: pulsing energy ball at the hands
      const r = 8 + wob;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(hx - r - 1, hy - r + 2, r * 2 + 2, r * 2 - 4);
      ctx.fillRect(hx - r + 2, hy - r - 1, r * 2 - 4, r * 2 + 2);
      ctx.fillStyle = color;
      ctx.fillRect(hx - r, hy - r + 3, r * 2, r * 2 - 6);
      ctx.fillRect(hx - r + 3, hy - r, r * 2 - 6, r * 2);
      ctx.fillStyle = pale;
      ctx.fillRect(hx - r + 3, hy - r + 4, r * 2 - 6, r * 2 - 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 3, hy - 3, 6, 6);
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, g: Game, camX: number, top: boolean) {
    for (const h of g.hazards.items) {
      if (!h.active) continue;
      const warn = h.t < h.warn;
      const blink = (g.tick >> 2) % 2 === 0;
      const x = Math.round(h.x - camX);
      if (h.kind === 'laser') {
        if (!top) {
          if (warn) {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = h.color;
            ctx.fillRect(0, h.y - h.depth, VIEW_W, h.depth * 2);
            ctx.globalAlpha = 1;
          }
          continue;
        }
        const ly = Math.round(h.y - 22);
        if (warn) {
          if (blink) {
            ctx.fillStyle = h.color;
            ctx.fillRect(0, ly, VIEW_W, 1);
            drawText(ctx, '!', 8, ly - 10, h.color, 1);
            drawText(ctx, '!', VIEW_W - 12, ly - 10, h.color, 1);
          }
        } else {
          const th = 10 + ((g.tick >> 1) % 2) * 2;
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(0, ly - th / 2 - 1, VIEW_W, th + 2);
          ctx.fillStyle = h.color;
          ctx.fillRect(0, ly - th / 2, VIEW_W, th);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, ly - 2, VIEW_W, 4);
        }
        continue;
      }
      if (h.kind === 'shock') {
        if (top) continue;
        const r = warn ? h.w * (0.4 + (0.6 * h.t) / h.warn) : h.w;
        ctx.fillStyle = warn ? (blink ? '#ff3b3b' : '#ffd35a') : '#ffffff';
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          ctx.fillRect(
            Math.round(x + Math.cos(a) * r),
            Math.round(h.y + Math.sin(a) * r * 0.32),
            2,
            1
          );
        }
        if (warn) drawText(ctx, '!', x, h.y - 4, '#ff3b3b', 1, 'center');
        continue;
      }
      // steam
      if (!top) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x - 9, h.y - 2, 18, 5);
        ctx.fillStyle = warn && blink ? '#ff5a3c' : '#55555f';
        ctx.fillRect(x - 8, h.y - 1, 16, 3);
        continue;
      }
      if (!warn) {
        const hgt = 70;
        const wob = Math.round(Math.sin(g.tick * 0.5) * 2);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#e8f4ff';
        ctx.fillRect(x - 8 + wob, h.y - hgt, 16, hgt);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 4 - wob, h.y - hgt, 8, hgt);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ title / select
  private drawParade(ctx: CanvasRenderingContext2D, g: Game, alpha: number) {
    const sorted = g.parade.slice().sort((a, b) => a.y - b.y);
    for (const a of sorted) {
      this.drawShadow(ctx, lerp(a.px, a.x, alpha), a.y + 1, a.halfWidth * 2.8, 0);
      this.drawActor(ctx, g, a, 0, alpha);
    }
  }

  private drawSelect(ctx: CanvasRenderingContext2D, g: Game) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
    for (const s of g.slots) {
      if (!s.joined) {
        const x = s.index === 0 ? 44 : VIEW_W - 44;
        if ((g.tick >> 4) % 2 === 0) {
          drawText(ctx, '2P', x, 86, SLOT_COLORS[1], 2, 'center');
          drawText(ctx, 'PRESS', x, 108, '#ffffff', 1, 'center');
          drawText(ctx, ', / NUM1', x, 118, '#ffffff', 1, 'center');
          drawText(ctx, 'TO JOIN', x, 128, '#ffffff', 1, 'center');
        }
        continue;
      }
      const f = FIGHTERS[s.cursor];
      const a = g.previewActor(s.index, f);
      const table = a.facing > 0 ? a.sprites.right : a.sprites.left;
      const frs = table[a.anim];
      const fr = frs[Math.min(a.frame, frs.length - 1)];
      const cx = s.index === 0 ? 44 : VIEW_W - 44;
      const scale = 1.5;
      const floorY = 170;
      const shadow = actorShadow(40);
      ctx.drawImage(shadow, cx - 20, floorY - 4);
      if (fr)
        ctx.drawImage(
          fr.img,
          Math.round(cx - fr.ax * scale),
          Math.round(floorY - fr.ay * scale),
          fr.img.width * scale,
          fr.img.height * scale
        );
      const col = SLOT_COLORS[s.index];
      drawText(ctx, `${s.index + 1}P`, cx, 22, col, 2, 'center');
      drawText(
        ctx,
        f.name.toUpperCase().split(' ')[0].slice(0, 12),
        cx,
        178,
        '#ffffff',
        1,
        'center'
      );
      const sp = f.special.name.split(' ');
      drawText(ctx, sp[0], cx, 190, f.special.color, 1, 'center');
      if (sp[1]) drawText(ctx, sp.slice(1).join(' '), cx, 199, f.special.color, 1, 'center');
      if (s.confirmed) drawText(ctx, 'READY!', cx, 40, col, 2, 'center');
    }
  }

  // ------------------------------------------------------------------ HUD
  private drawHud(ctx: CanvasRenderingContext2D, g: Game) {
    for (const s of g.slots) this.drawPanel(ctx, g, s);
    const b = g.boss;
    if (b && b.state !== 'spawn' && g.bossDefeatedT === 0 && b.hp > 0) {
      const def = BOSSES[b.defId as BossId];
      const x = 60;
      const y = VIEW_H - 14;
      const w = VIEW_W - 120;
      const k = b.hp / b.maxHp;
      this.bossTrail = Math.max(k, this.bossTrail - 0.004);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(x - 4, y - 11, w + 8, 22);
      ctx.globalAlpha = 1;
      drawText(ctx, def ? def.name : 'BOSS', x, y - 9, '#ff6b6b', 1);
      if (b.phase === 2 && (g.tick >> 3) % 2 === 0)
        drawText(ctx, 'ENRAGED', x + w, y - 9, '#ffd35a', 1, 'right');
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 1, y - 1, w + 2, 8);
      ctx.fillStyle = '#3a0a14';
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, Math.round(w * this.bossTrail), 6);
      ctx.fillStyle = k < 0.5 ? '#ff4d4d' : '#ff9a3c';
      ctx.fillRect(x, y, Math.round(w * k), 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, Math.round(w * k), 2);
    } else {
      this.bossTrail = 1;
    }
  }

  private drawPanel(ctx: CanvasRenderingContext2D, g: Game, s: PlayerSlot) {
    const x = 4 + s.index * 192;
    const y = 3;
    const col = SLOT_COLORS[s.index];
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(x, y, 184, 26);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 184, 1);
    const blink = (g.tick >> 4) % 2 === 0;
    if (s.state === 'inactive') {
      if (blink) {
        drawText(ctx, `${s.index + 1}P PRESS START`, x + 92, y + 5, col, 1, 'center');
        drawText(
          ctx,
          s.index === 0 ? 'J OR ENTER' : ', / NUM1 / PAD',
          x + 92,
          y + 15,
          '#ffffff',
          1,
          'center'
        );
      }
      return;
    }
    if (s.state === 'joining') {
      const f = FIGHTERS[s.cursor];
      const portrait = getSprites(f.look).portrait;
      ctx.drawImage(portrait, x + 3, y + 3);
      drawText(ctx, `\` ${f.name.toUpperCase().slice(0, 12)} ~`, x + 28, y + 5, col, 1);
      drawText(ctx, 'ATTACK = JOIN', x + 28, y + 15, blink ? '#ffffff' : '#9aa7b4', 1);
      return;
    }
    if (s.state === 'continue') {
      drawText(ctx, `${s.index + 1}P CONTINUE?`, x + 92, y + 4, col, 1, 'center');
      const ct = g.phase === 'gameOver' ? g.continueT : s.continueT;
      drawText(
        ctx,
        String(Math.max(0, Math.ceil(ct / 60))),
        x + 92,
        y + 13,
        blink ? '#ff6b6b' : '#ffffff',
        2,
        'center'
      );
      return;
    }
    const a = s.actor;
    const portrait = getSprites(s.fighter.look).portrait;
    ctx.fillStyle = col;
    ctx.fillRect(x + 2, y + 2, 24, 24);
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(x + 3, y + 3, 22, 22);
    ctx.drawImage(portrait, x + 3, y + 3);
    drawText(ctx, s.fighter.name.toUpperCase().slice(0, 13), x + 30, y + 4, col, 1);
    if (this.scoreVal[s.index] !== s.score) {
      this.scoreVal[s.index] = s.score;
      this.scoreStr[s.index] = String(s.score).padStart(7, '0');
    }
    drawText(ctx, this.scoreStr[s.index], x + 181, y + 4, '#ffffff', 1, 'right');
    const hp = a ? Math.max(0, a.hp) : 0;
    const max = a ? a.maxHp : 100;
    const k = hp / max;
    const i = s.index;
    this.hpTrail[i] = Math.max(k, this.hpTrail[i] - 0.006);
    if (this.hpTrail[i] > 1) this.hpTrail[i] = 1;
    const bx = x + 30;
    const by = y + 14;
    const bw = 104;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = '#3a0a14';
    ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, Math.round(bw * this.hpTrail[i]), 6);
    const low = k < 0.3;
    ctx.fillStyle = low && (g.tick >> 3) % 2 === 0 ? '#ff4d4d' : low ? '#ff8a3c' : '#7dff6a';
    ctx.fillRect(bx, by, Math.round(bw * k), 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx, by, Math.round(bw * k), 2);
    ctx.fillStyle = OUTLINE;
    for (let t = 1; t < 10; t++) ctx.fillRect(bx + Math.round((bw * t) / 10), by + 4, 1, 2);
    // lives as small hearts
    for (let l = 0; l < Math.min(5, s.lives); l++) {
      const hx = x + 140 + l * 9;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(hx - 1, by - 1, 9, 8);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(hx, by, 3, 3);
      ctx.fillRect(hx + 4, by, 3, 3);
      ctx.fillRect(hx, by + 2, 7, 2);
      ctx.fillRect(hx + 1, by + 4, 5, 1);
      ctx.fillRect(hx + 2, by + 5, 3, 1);
    }
    if (s.combo >= 2) {
      const pop = s.comboT > 70 ? 1 : 0;
      drawText(
        ctx,
        `${s.combo} HITS!`,
        x + 30,
        y + 27 - pop,
        s.combo >= 10 ? '#ff6b6b' : '#ffd35a',
        1
      );
    }
    if (a?.heldItem)
      drawText(ctx, a.heldItem.toUpperCase(), x + 181, y + 27, '#9aa7b4', 1, 'right');
  }

  private drawBanners(ctx: CanvasRenderingContext2D, g: Game) {
    const W2 = VIEW_W / 2;
    if (g.phase === 'playing' && g.stageIntroT > 0) {
      const t = g.stageIntroT;
      const slide = t > 150 ? (t - 150) * 14 : t < 20 ? (20 - t) * -18 : 0;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 62, VIEW_W, 72);
      ctx.globalAlpha = 1;
      drawText(ctx, `STAGE ${g.stage.num}`, W2 + slide, 68, '#ffd35a', 3, 'center');
      drawText(ctx, g.stage.name, W2 - slide, 96, '#ffffff', 2, 'center');
      drawText(ctx, g.stage.subtitle, W2 + slide, 118, '#39e8ff', 1, 'center');
    }
    if (g.phase === 'playing' && g.goT > 0 && g.goT < 190 && (g.tick >> 4) % 2 === 0) {
      drawText(ctx, 'GO', VIEW_W - 44, 78, '#ffd35a', 3, 'center');
      drawText(ctx, '~~~', VIEW_W - 44, 102, '#ffd35a', 2, 'center');
    }
    if (g.phase === 'playing' && g.bossIntroT > 0 && g.boss) {
      const def = BOSSES[g.boss.defId as BossId];
      const t = g.bossIntroT;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#1a0508';
      ctx.fillRect(0, 70, VIEW_W, 58);
      ctx.globalAlpha = 1;
      for (let x = -20; x < VIEW_W + 20; x += 16) {
        const off = (g.tick % 16) - 8;
        ctx.fillStyle = '#ffd35a';
        ctx.fillRect(x + off, 70, 8, 3);
        ctx.fillRect(x - off, 125, 8, 3);
      }
      if ((t >> 3) % 2 === 0 || t < 110) drawText(ctx, 'WARNING', W2, 78, '#ff3b3b', 2, 'center');
      if (t < 140 && def) {
        drawText(ctx, def.name, W2, 96, '#ffffff', 2, 'center');
        drawText(ctx, def.title, W2, 114, '#ffd35a', 1, 'center');
      }
    }
    if (g.koBannerT > 0 && g.koBannerT < 140) {
      const s = g.koBannerT > 120 ? 5 : 4;
      drawText(ctx, 'K.O.!', W2, 70, '#ffd35a', s, 'center');
    }
    if (g.phase === 'stageClear') this.drawTally(ctx, g);
    if (g.phase === 'gameOver') {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      if (g.gameOverFinalT > 0) drawText(ctx, 'GAME OVER', W2, 90, '#ff4d4d', 4, 'center');
      else
        drawText(
          ctx,
          String(Math.max(0, Math.ceil(g.continueT / 60))),
          W2,
          110,
          (g.tick >> 3) % 2 ? '#ffffff' : '#ff6b6b',
          5,
          'center'
        );
    }
    if (g.phase === 'ending') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  private drawTally(ctx: CanvasRenderingContext2D, g: Game) {
    const W2 = VIEW_W / 2;
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(40, 40, VIEW_W - 80, 132);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd35a';
    ctx.fillRect(40, 40, VIEW_W - 80, 1);
    ctx.fillRect(40, 171, VIEW_W - 80, 1);
    drawText(ctx, `STAGE ${g.stage.num} CLEAR!`, W2, 48, '#ffd35a', 2, 'center');
    const t = g.phaseT;
    let row = 0;
    for (const s of g.slots) {
      if (s.state !== 'playing' && s.bonus === 0) continue;
      const y = 76 + row * 42;
      const col = SLOT_COLORS[s.index];
      const shown = Math.min(s.bonus, Math.max(0, t - 30) * 40);
      drawText(ctx, `${s.index + 1}P ${s.fighter.name.toUpperCase().slice(0, 12)}`, 56, y, col, 1);
      drawText(ctx, `KO  ${String(s.stageKos).padStart(3, ' ')}`, 56, y + 11, '#ffffff', 1);
      drawText(ctx, `BEST COMBO ${s.bestCombo}`, 56, y + 21, '#9aa7b4', 1);
      drawText(ctx, `BONUS +${shown}`, VIEW_W - 56, y + 11, '#7dff6a', 1, 'right');
      drawText(
        ctx,
        `SCORE ${String(s.score + shown).padStart(7, '0')}`,
        VIEW_W - 56,
        y,
        '#ffffff',
        1,
        'right'
      );
      row++;
    }
    if (t > 80 && (g.tick >> 4) % 2 === 0)
      drawText(ctx, 'PRESS ATTACK', W2, 158, '#ffffff', 1, 'center');
  }
}

export const FLOOR_RANGE = [FLOOR_TOP, FLOOR_BOTTOM];
