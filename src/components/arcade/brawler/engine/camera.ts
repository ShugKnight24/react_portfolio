// Belt-scroll camera: frames all living players with a deadzone, only scrolls
// forward (classic arcade), never leaves a lagging player off-screen, honours
// wave scroll-locks, and owns trauma-based screen shake (visual offset only).
import { DT, VIEW_W } from './constants';
import { clamp } from './math';

const DEADZONE = 28;
const LAG_MARGIN = 26;

export class Camera {
  x = 0;
  prevX = 0;
  /** hard right limit for the camera left edge (stage end or wave lock) */
  limit = 0;
  stageMax = 0;
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  reduced = false;
  private t = 0;

  reset(stageLen: number): void {
    this.x = 0;
    this.prevX = 0;
    this.stageMax = Math.max(0, stageLen - VIEW_W);
    this.limit = this.stageMax;
    this.trauma = 0;
  }

  /** minX/maxX are the extreme x positions of active players. */
  update(minX: number, maxX: number, hasPlayers: boolean): void {
    this.prevX = this.x;
    if (hasPlayers) {
      const mid = (minX + maxX) / 2;
      const centre = this.x + VIEW_W * 0.42;
      let target = this.x;
      if (mid > centre + DEADZONE) target = this.x + (mid - centre - DEADZONE);
      // don't scroll past the lagging player
      target = Math.min(target, minX - LAG_MARGIN);
      target = clamp(target, this.x, Math.min(this.limit, this.stageMax));
      this.x += (target - this.x) * 0.2;
      if (Math.abs(target - this.x) < 0.05) this.x = target;
    }
    this.t += DT;
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - 1.8 * DT);
    if (this.reduced || this.trauma <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
    } else {
      const s = this.trauma * this.trauma;
      this.shakeX = Math.round(6 * s * Math.sin(this.t * 71));
      this.shakeY = Math.round(4 * s * Math.sin(this.t * 53 + 1.3));
    }
  }

  shake(amount: number): void {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Interpolated, integer-snapped render position. */
  renderX(alpha: number): number {
    return Math.round(this.prevX + (this.x - this.prevX) * alpha);
  }
}
