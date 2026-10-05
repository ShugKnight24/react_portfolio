// Hit resolution: active hitboxes vs hurtboxes (x overlap, depth-lane
// tolerance, height overlap), guard/armor rules, hit-stop, knockback/launch,
// reaction states (hurt, fall/bounce, down, get-up) and all hit feedback.
import { Actor, AttackDef } from './actor';
import { DT, FLOOR_BOTTOM, FLOOR_TOP, VIEW_W } from './constants';
import type { Game } from './game';
import { clamp } from './math';

export interface HitSpec {
  damage: number;
  knock: number;
  launch: number;
  hitstop: number;
  shake: number;
  stun?: number;
  heavy?: boolean;
  unblockable?: boolean;
  word?: string;
}

const DOWN_TICKS = { player: 34, enemy: 42, boss: 36 } as const;

const launchActor = (v: Actor, dir: 1 | -1, knock: number, vz: number) => {
  v.setState('fall', 'fall');
  v.vz = vz / Math.sqrt(v.weight);
  v.vx = (dir * knock) / v.weight;
  v.vy = 0;
  v.z = Math.max(v.z, 1);
  v.bounced = false;
};

export const releaseGrab = (a: Actor): void => {
  const e = a.grabbing;
  if (e) {
    e.grabbedBy = null;
    if (e.state === 'grabbed') {
      e.setState('hurt', 'hurt');
      e.stun = 10;
      e.vx = a.facing * 80;
    }
  }
  a.grabbing = null;
  a.grabT = 0;
  a.kneeCount = 0;
};

/**
 * Hurtbox check with the difficulty's juggle cap: a falling player can only be
 * re-launched `playerJuggleCap` times before they are untouchable until landing.
 */
export const canHit = (g: Game, v: Actor): boolean =>
  v.hittable &&
  !(v.kind === 'player' && v.state === 'fall' && v.juggle >= g.tuning.playerJuggleCap);

/** Apply one hit. Returns false if blocked. */
export const applyHit = (
  g: Game,
  attacker: Actor | null,
  v: Actor,
  h: HitSpec,
  dir: 1 | -1,
  hz: number,
  slot: number
): boolean => {
  // --- guard (shield enemies facing the hit) ---
  if (
    v.shield &&
    !h.unblockable &&
    (v.state === 'idle' || v.state === 'walk' || v.state === 'block') &&
    v.facing === -dir
  ) {
    v.guardHits++;
    if (h.heavy || v.guardHits >= 3) {
      v.guardHits = 0;
      v.setState('hurt', 'hurt');
      v.stun = 44;
      v.vx = dir * 110;
      g.fx.text(v.x, v.y, v.height + 6, 'BREAK!', '#ffd35a', 1, 34);
      g.fx.sparks(v.x + dir * 6, v.y, 22, dir, 8, '#dfe6ee');
      g.sfx('heavy');
      v.freezeMs = 90;
      if (attacker) attacker.freezeMs = 70;
      g.camera.shake(0.2);
      return true;
    }
    v.setState('block', 'block');
    v.vx = dir * 90;
    if (attacker) attacker.vx = -dir * 60;
    g.fx.sparks(v.x - dir * 6, v.y, 24, -dir as 1 | -1, 5, '#dfe6ee');
    g.fx.burst(v.x - dir * 6, v.y + 0.5, 24, 4, '#8fd0ff');
    g.sfx('block');
    v.freezeMs = 45;
    if (attacker) attacker.freezeMs = 45;
    return false;
  }

  let power = attacker ? attacker.power : 1;
  if (v.kind === 'player' && attacker) {
    const tun = g.tuning;
    power *= attacker.kind === 'boss' ? tun.bossDamage : tun.enemyDamage;
  }
  const dmg = Math.max(1, Math.round(h.damage * power));
  v.hp -= dmg;
  v.flash = g.reduced ? 3 : 6;
  v.hpBarT = 110;
  if (slot >= 0) {
    v.lastAttacker = slot;
    g.onPlayerLandedHit(slot, dmg);
  }
  if (v.kind === 'player') g.sfx('hurt');
  if (v.kind === 'boss') {
    v.hitsTaken++;
    v.hitsWindow = 90;
  }

  // hit-stop (ms) on both sides
  v.freezeMs = Math.max(v.freezeMs, h.hitstop);
  if (attacker) attacker.freezeMs = Math.max(attacker.freezeMs, h.hitstop * 0.85);
  g.camera.shake(h.shake);

  const hx = v.x - dir * v.halfWidth * 0.4;
  g.fx.burst(hx, v.y + 0.5, hz, h.heavy ? 9 : 6, h.heavy ? '#ffd35a' : '#ffffff');
  g.fx.sparks(hx, v.y + 0.5, hz, dir, h.heavy ? 8 : 4, h.heavy ? '#ffd35a' : '#fff3a0');
  g.fx.text(
    v.x + dir * 4,
    v.y,
    v.z + v.height + 2,
    String(dmg),
    v.kind === 'player' ? '#ff6b6b' : '#ffffff',
    1,
    26
  );
  if (h.word) g.fx.text(hx, v.y, hz + 16, h.word, '#ffd35a', 2, 38);
  g.sfx(h.heavy ? 'heavy' : 'hit');

  if (v.grabbing) releaseGrab(v);
  if (v.kind === 'player' && v.heldItem) g.dropHeldItem(v);
  if (v.kind === 'enemy') {
    g.releaseToken(v);
    v.ai = 'hover';
  }
  const hadArmor = v.armor > 0;
  if (!hadArmor) {
    v.atk = null;
    v.tint = null;
  }
  v.facing = -dir as 1 | -1;

  if (v.hp <= 0) {
    v.hp = 0;
    v.atk = null;
    v.armor = 0;
    launchActor(v, dir, Math.max(h.knock, 150), Math.max(h.launch, 230));
    v.invuln = 0;
    if (v.kind !== 'player') g.onEnemyLethal(v);
    return true;
  }

  if (hadArmor) {
    if (v.kind !== 'boss') v.armor--;
    v.sqX = 1.12;
    v.sqY = 0.92;
    v.x += (dir * 2) / v.weight;
    return true;
  }

  // stun-lock protection: too many hits in a row knocks the player down
  // (and the get-up grants invulnerability) instead of chaining hit-stun
  let forceDown = false;
  if (v.kind === 'player') {
    const tun = g.tuning;
    const s = g.slots[v.slot];
    if (s && tun.stunlockHits > 0) {
      s.hurtChain = g.tick - s.lastHurtT <= tun.stunlockWindow ? s.hurtChain + 1 : 1;
      s.lastHurtT = g.tick;
      if (s.hurtChain >= tun.stunlockHits && h.launch <= 0 && v.state !== 'fall') {
        forceDown = true;
        s.hurtChain = 0;
      }
    }
  }

  if (h.launch > 0 || v.state === 'fall' || forceDown) {
    launchActor(
      v,
      dir,
      forceDown ? Math.max(h.knock, 120) : h.knock,
      h.launch > 0 ? h.launch : 150
    );
    v.juggle++;
  } else {
    const parity = v.state === 'hurt' ? 1 - v.frame : 0;
    v.setState('hurt', 'hurt');
    v.frame = parity;
    v.stun = h.stun ?? 12 + Math.min(dmg, 12);
    v.vx = (dir * h.knock) / v.weight;
    v.vy = 0;
    v.sqX = 0.86;
    v.sqY = 1.1;
  }
  return true;
};

const boxOf = (a: Actor, atk: AttackDef, out: number[]) => {
  const s = a.size;
  const bx = atk.box.x * s;
  const bw = atk.box.w * s;
  if (atk.around || a.facing > 0) {
    out[0] = a.x + bx;
    out[1] = a.x + bx + bw;
  } else {
    out[0] = a.x - bx - bw;
    out[1] = a.x - bx;
  }
  out[2] = a.z + atk.box.z0 * s;
  out[3] = a.z + atk.box.z1 * s;
  out[4] = atk.box.depth * Math.max(1, s * 0.85);
};

const box: number[] = [0, 0, 0, 0, 0];

const overlaps = (
  v: Actor,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  depth: number
): boolean => {
  if (Math.abs(v.y - y) > depth) return false;
  const hw = v.halfWidth;
  if (x1 < v.x - hw || x0 > v.x + hw) return false;
  return z1 >= v.z && z0 <= v.z + v.height * 0.95;
};

/** Active melee hitboxes vs everything on the other team (and crates). */
export const resolveMelee = (g: Game): void => {
  const list = g.fighters;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const atk = a.atk;
    if (!atk || a.freezeMs > 0 || atk.box.w <= 0) continue;
    if (a.atkPhase() !== 1) continue;
    if (!a.alive || a.state === 'hurt' || a.state === 'fall') continue;
    boxOf(a, atk, box);
    for (let j = 0; j < list.length; j++) {
      const v = list[j];
      if (v === a || v.team === a.team || !canHit(g, v) || a.hasHit(v.id)) continue;
      if (!overlaps(v, box[0], box[1], box[2], box[3], a.y, box[4])) continue;
      a.markHit(v.id);
      const dir: 1 | -1 = atk.around ? (v.x >= a.x ? 1 : -1) : a.facing;
      const hz = (Math.max(box[2], v.z) + Math.min(box[3], v.z + v.height)) / 2;
      const landed = applyHit(g, a, v, atk, dir, hz, a.kind === 'player' ? a.slot : -1);
      if (landed && a.kind === 'player') a.comboLanded = true;
    }
    if (a.team === 0) {
      const crates = g.items.items;
      for (let c = 0; c < crates.length; c++) {
        const it = crates[c];
        if (!it.active || it.kind !== 'crate' || a.hasHit(-(c + 1))) continue;
        if (
          Math.abs(it.y - a.y) > box[4] ||
          box[1] < it.x - 11 ||
          box[0] > it.x + 11 ||
          box[2] > 30 // crate is ~22 tall; big fighters' jabs start ~24 up
        )
          continue;
        a.markHit(-(c + 1));
        g.hitCrate(it, a.facing);
        a.freezeMs = Math.max(a.freezeMs, 40);
      }
    }
  }

  // thrown bodies bowl over other enemies
  for (const e of g.enemies) {
    if (e.thrownBy < 0 || e.state !== 'fall') continue;
    for (const o of g.enemies) {
      if (o === e || !o.hittable) continue;
      let seen = false;
      for (let k = 0; k < e.thrownCount; k++) if (e.thrownHit[k] === o.id) seen = true;
      if (seen) continue;
      if (Math.abs(o.y - e.y) > 12 || Math.abs(o.x - e.x) > e.halfWidth + o.halfWidth) continue;
      if (e.thrownCount < e.thrownHit.length) e.thrownHit[e.thrownCount++] = o.id;
      const dir: 1 | -1 = e.vx >= 0 ? 1 : -1;
      applyHit(
        g,
        null,
        o,
        {
          damage: 14,
          knock: 180,
          launch: 190,
          hitstop: 80,
          shake: 0.3,
          heavy: true,
          unblockable: true,
          word: 'BONK!',
        },
        dir,
        e.z + 16,
        e.thrownBy
      );
    }
  }
};

/** Timers for reaction states. Returns true if the actor is in one. */
export const updateReaction = (g: Game, a: Actor): boolean => {
  switch (a.state) {
    case 'hurt':
      a.vx *= 0.8;
      a.vy = 0;
      a.stun--;
      if (a.stun <= 0) a.setState('idle', 'idle');
      return true;
    case 'fall':
      a.vy = 0;
      a.play('fall');
      return true;
    case 'down': {
      a.vx *= 0.75;
      a.vy = 0;
      if (a.stateT >= DOWN_TICKS[a.kind]) {
        if (a.hp <= 0) {
          a.setState('dead', 'dead');
        } else {
          a.setState('getup', 'getup');
        }
      }
      return true;
    }
    case 'getup':
      a.vx = 0;
      a.frame = a.stateT < 12 ? 0 : 1;
      if (a.stateT >= 22) {
        a.setState('idle', 'idle');
        a.invuln = a.kind === 'player' ? g.tuning.getupInvuln : a.kind === 'boss' ? 50 : 16;
        if (a.kind === 'boss') a.aiT = 999; // immediately answer with a pattern
      }
      return true;
    case 'dead':
      a.vx *= 0.8;
      a.deadT++;
      return true;
    default:
      return false;
  }
};

/** Landing from a launch. */
export const landFall = (g: Game, a: Actor, impactVz: number): void => {
  if (!a.bounced && impactVz < -120) {
    a.bounced = true;
    a.vz = Math.min(130, -impactVz * 0.35);
    a.z = 0.5;
    a.vx *= 0.55;
    a.sqX = 1.35;
    a.sqY = 0.7;
    g.fx.dust(a.x, a.y, 5, 1.2);
    g.camera.shake(0.08 * a.weight);
    g.sfx('land');
    return;
  }
  a.vx *= 0.3;
  a.vz = 0;
  a.z = 0;
  a.juggle = 0;
  a.thrownBy = -1;
  a.thrownCount = 0;
  g.fx.dust(a.x, a.y, 4, 0.8);
  if (a.hp <= 0) {
    a.setState('down', 'dead');
    if (a.kind !== 'player') g.onEnemyKO(a);
  } else {
    a.setState('down', 'down');
  }
};

// ---------------------------------------------------------------------------
// Projectiles & hazards
// ---------------------------------------------------------------------------

export const updateProjectiles = (g: Game): void => {
  const camX = g.camera.x;
  for (const p of g.projectiles.items) {
    if (!p.active) continue;
    p.px = p.x;
    p.pz = p.z;
    p.t++;
    p.life--;
    if (p.kind === 'batarang') {
      const owner = g.actorById(p.owner);
      if (p.t === 26) {
        p.returning = true;
        p.hitCount = 0;
      }
      if (p.returning && owner) {
        const dx = owner.x - p.x;
        const dy = owner.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 900 * DT;
        p.vy = (dy / d) * 120;
        p.vx = clamp(p.vx, -300, 300);
        if (d < 12) p.active = false;
      } else {
        p.vx *= 0.975;
      }
    } else if (p.kind === 'homing') {
      const t = g.nearestPlayer(p.x, p.y);
      if (t && p.t < 150) {
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 160 * DT;
        p.vy += (dy / d) * 90 * DT;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 110) {
          p.vx = (p.vx / sp) * 110;
          p.vy = (p.vy / sp) * 110;
        }
      }
    }
    if (p.interval && p.t % p.interval === 0) p.hitCount = 0;
    p.x += p.vx * DT;
    p.y = clamp(p.y + p.vy * DT, FLOOR_TOP, FLOOR_BOTTOM);
    if (p.g) {
      p.vz -= p.g * DT;
      p.z += p.vz * DT;
    }
    if (p.kind === 'orb' && p.t % 3 === 0) g.fx.smoke(p.x - p.vx * 0.03, p.y, p.z, '#b15cff');
    if (p.z <= 0 && p.g) {
      g.fx.sparks(p.x, p.y, 2, p.vx > 0 ? 1 : -1, 6, p.kind === 'pie' ? '#f4f0e0' : '#aef0c0');
      g.sfx('whiff');
      p.active = false;
      continue;
    }
    if (p.life <= 0 || p.x < camX - 60 || p.x > camX + VIEW_W + 60) {
      p.active = false;
      continue;
    }
    const targets = p.team === 0 ? g.enemies : g.playerActors;
    for (const v of targets) {
      if (!canHit(g, v) || v.team === p.team) continue;
      let seen = false;
      for (let k = 0; k < p.hitCount; k++) if (p.hitList[k] === v.id) seen = true;
      if (seen) continue;
      if (Math.abs(v.y - p.y) > p.depth || Math.abs(v.x - p.x) > p.w / 2 + v.halfWidth) continue;
      if (p.z + p.h / 2 < v.z || p.z - p.h / 2 > v.z + v.height) continue;
      if (p.hitCount < p.hitList.length) p.hitList[p.hitCount++] = v.id;
      const dir: 1 | -1 = p.vx >= 0 ? 1 : -1;
      const owner = p.team === 0 ? g.actorById(p.owner) : null;
      const landed = applyHit(
        g,
        owner,
        v,
        {
          damage: p.damage,
          knock: p.knock,
          launch: p.launch,
          hitstop: p.hitstop,
          shake: 0.12,
          heavy: p.launch > 0,
          unblockable: p.kind === 'orb',
        },
        dir,
        p.z,
        p.slot
      );
      if (landed && p.stun && v.state === 'hurt') {
        v.stun = p.stun;
        g.fx.text(v.x, v.y, v.height + 8, 'STUCK!', '#f2f2f2', 1, 30);
      }
      if (!landed || --p.pierce <= 0) {
        p.active = false;
        break;
      }
    }
    if (p.active && p.team === 0) {
      for (const it of g.items.items) {
        if (!it.active || it.kind !== 'crate') continue;
        if (Math.abs(it.y - p.y) < 10 && Math.abs(it.x - p.x) < 12 && p.z < 24) {
          g.hitCrate(it, p.vx >= 0 ? 1 : -1);
          if (--p.pierce <= 0) p.active = false;
          break;
        }
      }
    }
  }
};

export const updateHazards = (g: Game): void => {
  for (const h of g.hazards.items) {
    if (!h.active) continue;
    h.t++;
    if (h.t === h.warn) {
      if (h.kind === 'steam') {
        for (let i = 0; i < 6; i++)
          g.fx.smoke(h.x + (Math.random() - 0.5) * 12, h.y, i * 8, '#e8f4ff');
        g.sfx('whiff');
      } else if (h.kind === 'shock') {
        g.fx.ring(h.x, h.y, h.w * 1.3, h.color);
      } else if (h.kind === 'laser') {
        g.camera.shake(0.3);
        g.sfx('special');
      }
    }
    if (h.t >= h.warn + h.life) {
      h.active = false;
      continue;
    }
    if (h.t < h.warn) continue;
    if (h.kind === 'steam' && h.t % 3 === 0)
      g.fx.smoke(h.x + (Math.random() - 0.5) * 10, h.y, 4 + Math.random() * 30, '#e8f4ff');
    for (const p of g.playerActors) {
      if (!canHit(g, p)) continue;
      let seen = false;
      for (let k = 0; k < h.hitCount; k++) if (h.hitList[k] === p.id) seen = true;
      if (seen) continue;
      const inside =
        h.kind === 'laser'
          ? Math.abs(p.y - h.y) <= h.depth && p.x >= h.x && p.x <= h.x + h.w && p.z < 30
          : Math.abs(p.x - h.x) <= h.w &&
            Math.abs(p.y - h.y) <= h.depth &&
            (h.kind !== 'shock' || p.z < 8);
      if (!inside) continue;
      if (h.hitCount < h.hitList.length) h.hitList[h.hitCount++] = p.id;
      const dir: 1 | -1 = p.x >= h.x + (h.kind === 'laser' ? h.w / 2 : 0) ? 1 : -1;
      applyHit(
        g,
        null,
        p,
        {
          damage: h.damage,
          knock: 160,
          launch: h.launch,
          hitstop: 90,
          shake: 0.3,
          heavy: true,
          unblockable: true,
        },
        dir,
        p.z + 16,
        -1
      );
    }
  }
};
