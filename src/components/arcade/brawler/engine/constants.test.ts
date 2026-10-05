import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, getTuning } from './constants';

describe('brawler difficulty tuning', () => {
  it('keeps the original two-player balance on normal', () => {
    const t = getTuning('normal', 2);
    expect(t).toMatchObject({
      lives: 3,
      enemyHp: 1,
      enemyDamage: 1,
      maxAttackers: 3,
      attackStagger: 0,
      enemyWindup: 0,
      waveExtra: 0.4,
      waveAliveBonus: 1,
      bossHp: 1.6,
      bossDamage: 1,
      bossPunchCd: 70,
      stunlockHits: 0,
      playerJuggleCap: 3,
      getupInvuln: 80,
      koDropChance: 0.12,
      extraLifeScore: 0,
    });
  });

  it('eases solo play relative to co-op', () => {
    const solo = getTuning('normal', 1);
    const coop = getTuning('normal', 2);
    expect(solo.maxAttackers).toBeLessThan(coop.maxAttackers);
    expect(solo.attackStagger).toBeGreaterThan(0);
    expect(solo.enemyDamage).toBeLessThan(coop.enemyDamage);
    expect(solo.bossHp).toBeLessThan(coop.bossHp);
    expect(solo.bossDamage).toBeLessThan(coop.bossDamage);
    expect(solo.stunlockHits).toBeGreaterThan(0);
    expect(solo.playerJuggleCap).toBeLessThan(coop.playerJuggleCap);
    expect(solo.koDropChance).toBeGreaterThan(coop.koDropChance);
    expect(solo.waveExtra).toBe(0);
  });

  it('treats any count above one as co-op', () => {
    expect(getTuning('hard', 3)).toBe(getTuning('hard', 2));
    expect(getTuning('easy', 0)).toBe(getTuning('easy', 1));
  });

  it.each([1, 2])('scales monotonically from easy to hard (%iP)', (players) => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => getTuning(d, players));
    for (const k of ['enemyHp', 'enemyDamage', 'bossHp', 'bossDamage', 'maxAttackers'] as const) {
      expect(easy[k]).toBeLessThanOrEqual(normal[k]);
      expect(normal[k]).toBeLessThanOrEqual(hard[k]);
    }
    expect(easy.lives).toBeGreaterThanOrEqual(normal.lives);
    expect(easy.enemyWindup).toBeGreaterThanOrEqual(hard.enemyWindup);
    expect(easy.koDropChance).toBeGreaterThanOrEqual(hard.koDropChance);
  });

  it('never produces degenerate values', () => {
    for (const d of DIFFICULTIES) {
      for (const p of [1, 2]) {
        const t = getTuning(d, p);
        expect(t.lives).toBeGreaterThanOrEqual(1);
        expect(t.maxAttackers).toBeGreaterThanOrEqual(1);
        expect(t.enemyWindup).toBeGreaterThanOrEqual(0);
        expect(t.koDropChance).toBeLessThanOrEqual(1);
        expect(t.stunlockHits === 0 || t.stunlockHits >= 2).toBe(true);
        for (const v of Object.values(t)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
