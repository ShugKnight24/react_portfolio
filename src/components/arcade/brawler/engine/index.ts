// Engine facade used by the React shell: owns the fixed-step loop, input
// listeners, DPR-aware canvas sizing, tab-visibility pausing and the dev-only
// synchronous `window.__brawler.step(n)` hook. dispose() tears all of it down.
import { VIEW_H, VIEW_W } from './constants';
import { Game, UiSnapshot } from './game';
import { InputManager } from './input';
import { FixedLoop } from './loop';
import { Renderer } from './render';

export { FIGHTERS } from './fighters';
export type { PlayerSlot, UiSnapshot } from './game';
export { getSprites } from './spriteBank';

export interface EngineOptions {
  reducedMotion: boolean;
  onUi: (s: UiSnapshot) => void;
}

interface DevHook {
  step: (n?: number) => void;
  engine: BrawlerEngine;
  game: Game;
}

declare global {
  interface Window {
    __brawler?: DevHook;
  }
}

export class BrawlerEngine {
  readonly input: InputManager;
  readonly game: Game;
  readonly renderer = new Renderer();
  private loop: FixedLoop;
  private ctx: CanvasRenderingContext2D | null = null;
  private offs: Array<() => void> = [];
  private disposed = false;
  private hidden = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: EngineOptions
  ) {
    this.input = new InputManager(
      () => typeof document !== 'undefined' && document.activeElement === canvas
    );
    this.game = new Game(this.input, opts.onUi);
    this.setReducedMotion(opts.reducedMotion);
    try {
      this.ctx = canvas.getContext('2d');
    } catch {
      this.ctx = null;
    }
    this.loop = new FixedLoop(
      () => this.game.update(),
      (alpha) => this.draw(alpha)
    );
  }

  setReducedMotion(on: boolean): void {
    this.game.reduced = on;
    this.game.camera.reduced = on;
    this.game.fx.reduced = on;
    this.renderer.reduced = on;
  }

  start(): void {
    if (this.disposed) return;
    this.input.attach();
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        this.hidden = true;
        if (this.game.phase === 'playing' && !this.game.paused) this.game.togglePause(true);
        this.loop.stop();
      } else if (this.hidden) {
        this.hidden = false;
        this.loop.resetClock();
        this.loop.start();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVis));

    const onResize = () => this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(onResize);
      ro.observe(this.canvas);
      this.offs.push(() => ro.disconnect());
    } else {
      window.addEventListener('resize', onResize);
      this.offs.push(() => window.removeEventListener('resize', onResize));
    }
    this.resize();

    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const hook: DevHook = { step: (n = 1) => this.step(n), engine: this, game: this.game };
      window.__brawler = hook;
      this.offs.push(() => {
        if (window.__brawler === hook) delete window.__brawler;
      });
    }
    this.loop.start();
  }

  resize(): void {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(VIEW_W, Math.round((rect.width || VIEW_W) * dpr));
    const h = Math.max(VIEW_H, Math.round((rect.height || VIEW_H) * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.draw(1);
  }

  private draw(alpha: number): void {
    this.renderer.render(this.game, alpha);
    const ctx = this.ctx;
    const view = this.renderer.view.canvas;
    if (!ctx || !this.renderer.ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(view, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** Synchronously advance n fixed ticks (debug/testing). */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.game.update();
    this.draw(1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.input.detach();
    this.offs.forEach((off) => off());
    this.offs = [];
  }
}
