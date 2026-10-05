// Fixed-timestep loop (60 Hz simulation, interpolated rendering). dt is clamped
// so a stalled tab never fast-forwards the game, and a thrown error in a frame
// is reported but never stops the loop from rescheduling.
import { DT } from './constants';

const MAX_FRAME = 0.1; // s
const MAX_STEPS = 5;

export class FixedLoop {
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = -1;
  private acc = 0;
  private running = false;
  private errors = 0;

  constructor(
    private step: () => void,
    private render: (alpha: number) => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.acc = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = null;
  }

  /** Forget accumulated time (after resume / tab becomes visible). */
  resetClock(): void {
    this.last = -1;
    this.acc = 0;
  }

  private schedule(): void {
    if (!this.running) return;
    if (typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(this.frame);
    else this.timer = setTimeout(() => this.frame(performance.now()), 16);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.schedule();
    try {
      if (this.last < 0) this.last = now;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      if (dt < 0) dt = 0;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS) {
        this.step();
        this.acc -= DT;
        steps++;
      }
      if (steps >= MAX_STEPS) this.acc = 0;
      this.render(this.acc / DT);
    } catch (err) {
      if (this.errors++ < 5) console.error('[brawler] frame error', err);
    }
  };
}
