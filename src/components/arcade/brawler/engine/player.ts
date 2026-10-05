// Player controller: 8-way walk, double-tap run, jump / jump-kick, hit-confirm
// 3-hit combo, run attack, grab -> knees / throw, weapon pickup/throw and the
// per-character special (costs a little HP, invulnerable while active).
import { Actor, AttackDef, ATTACKS } from './actor';
import { applyHit, releaseGrab } from './combat';
import { JUMP_VZ } from './constants';
import { SpecialType } from './fighters';
import type { Game, PlayerSlot } from './game';
import { PlayerInput } from './input';
import { ANIMS } from './rig';

export const SPECIAL_COST = 6;

const TOSS_ITEM: AttackDef = {
  ...ATTACKS.eToss,
  id: 'pToss',
  startup: 5,
  active: 1,
  recovery: 12,
};

const SPECIAL_ATTACK: Record<SpecialType, AttackDef> = {
  spin: ATTACKS.spSpin,
  dash: ATTACKS.spDash,
  saw: ATTACKS.spSaw,
  orb: ATTACKS.spShoot,
  shot: ATTACKS.spShoot,
  boomerang: ATTACKS.spShoot,
  beam: ATTACKS.spBeam,
  slam: ATTACKS.spSlam,
};

const total = (a: AttackDef) => a.startup + a.active + a.recovery;

export const startSpecial = (g: Game, slot: PlayerSlot, a: Actor): void => {
  const sp = slot.fighter.special;
  a.hp = Math.max(1, a.hp - SPECIAL_COST);
  const atk = SPECIAL_ATTACK[sp.type];
  a.startAttack(atk);
  a.state = 'special';
  a.special = sp.type;
  a.invuln = total(atk) + 8;
  a.vx = 0;
  a.vy = 0;
  a.vz = 0;
  a.z = 0;
  a.bufferedAttack = 0;
  a.bufferedJump = 0;
  a.atk = atk;
  if (sp.type === 'slam') a.vz = 280;
  a.freezeMs = 70; // tiny "super flash" pause
  g.fx.text(a.x, a.y, a.height + 16, sp.name, sp.color, 1, 55);
  g.fx.sparks(a.x, a.y, 24, 1, 6, sp.color);
  g.fx.sparks(a.x, a.y, 24, -1, 6, sp.color);
  g.screenFlash(sp.color);
  g.sfx('special');
};

const startJump = (g: Game, a: Actor, inp: PlayerInput) => {
  a.bufferedJump = 0;
  a.setState('jump', 'jumpUp');
  a.vz = JUMP_VZ;
  a.z = 0.5;
  a.vx = inp.x * a.speed * (inp.run ? 1.7 : 1.1);
  a.vy = inp.y * a.speed * 0.45;
  a.jumpAttackUsed = false;
  a.atk = null;
  a.sqX = 0.8;
  a.sqY = 1.22;
  g.fx.dust(a.x, a.y, 3);
  g.sfx('jump');
};

const startGrab = (g: Game, a: Actor, e: Actor) => {
  g.releaseToken(e);
  e.atk = null;
  e.tint = null;
  e.armor = 0;
  e.vx = e.vy = 0;
  e.grabbedBy = a;
  e.setState('grabbed', 'held');
  a.grabbing = e;
  a.grabT = 0;
  a.kneeCount = 0;
  a.pushT = 0;
  a.atk = null;
  a.vx = a.vy = 0;
  a.facing = e.x > a.x ? 1 : -1;
  a.setState('grabbing', 'grab');
  g.sfx('select');
};

const neutral = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput, wantSpecial: boolean) => {
  if (a.stun > 0) {
    // landing recovery
    a.stun--;
    a.vx *= 0.6;
    a.vy *= 0.6;
    a.play('idle');
    return;
  }
  if (wantSpecial) {
    startSpecial(g, slot, a);
    return;
  }
  if (a.bufferedJump > 0) {
    startJump(g, a, inp);
    return;
  }
  if (a.bufferedAttack > 0) {
    a.bufferedAttack = 0;
    if (inp.x) a.facing = inp.x > 0 ? 1 : -1;
    if (a.heldItem) {
      a.startAttack(TOSS_ITEM);
      a.special = 'item';
      return;
    }
    const w = g.weaponAt(a);
    if (w) {
      a.heldItem = w.kind;
      w.active = false;
      g.fx.text(a.x, a.y, a.height + 6, w.kind.toUpperCase(), '#ffffff', 1, 30);
      g.sfx('pickup');
      return;
    }
    if (a.state === 'run') {
      g.input.stopRun(slot.index);
      a.startAttack(ATTACKS.runAttack);
      g.sfx('whiff');
      return;
    }
    a.comboStep = 1;
    a.comboLanded = false;
    a.startAttack(ATTACKS.jab);
    g.sfx('whiff');
    return;
  }

  const run = inp.run && inp.x !== 0;
  const sp = a.speed * (run ? 1.8 : 1);
  let vx = inp.x * sp;
  let vy = inp.y * a.speed * 0.66;
  if (inp.x && inp.y) {
    vx *= 0.88;
    vy *= 0.88;
  }
  a.vx = vx;
  a.vy = vy;
  if (inp.x) a.facing = inp.x > 0 ? 1 : -1;
  const moving = inp.x !== 0 || inp.y !== 0;
  const st = !moving ? 'idle' : run ? 'run' : 'walk';
  if (a.state !== st) {
    a.state = st;
    a.stateT = 0;
  }
  a.play(st === 'run' ? 'run' : moving ? 'walk' : 'idle');
  if (run && a.stateT % 8 === 0) g.fx.dust(a.x - a.facing * 6, a.y, 1, 0.6);

  // walk into a grabbable enemy to grab (classic "push" grab)
  if (inp.x !== 0) {
    const e = g.grabCandidate(a);
    if (e && Math.sign(e.x - a.x) === inp.x) {
      a.pushT++;
      if (a.pushT >= 5) startGrab(g, a, e);
    } else a.pushT = 0;
  } else a.pushT = 0;
};

const attacking = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput) => {
  const atk = a.atk;
  if (!atk) {
    a.setState('idle', 'idle');
    return;
  }
  a.advanceAttack();
  const ph = a.atkPhase();
  a.frame = atk.frames[ph];
  // attack + jump pressed together (within 3 ticks) -> special
  if (a.atkT <= 3 && inp.jumpP && atk.id === 'jab') {
    startSpecial(g, slot, a);
    return;
  }
  if (atk.lunge) {
    const k =
      ph === 1 ? Math.max(0.15, 1 - (a.atkT - atk.startup) / atk.active) : ph === 0 ? 0.4 : 0;
    a.vx = a.facing * atk.lunge * k;
  } else if (ph === 1 && a.atkT === atk.startup + 1) {
    a.vx = a.facing * 40;
  } else {
    a.vx *= 0.65;
  }
  a.vy = 0;
  if (a.special === 'item' && a.atkT === atk.startup) g.throwHeldItem(a, slot.index);

  const canChain = (atk.id === 'jab' || atk.id === 'cross') && a.atkT >= atk.startup + atk.active;
  if (canChain && a.bufferedAttack > 0) {
    a.bufferedAttack = 0;
    const next = a.comboLanded
      ? atk.id === 'jab'
        ? ATTACKS.cross
        : ATTACKS.finisher
      : ATTACKS.jab;
    a.comboLanded = false;
    if (inp.x) a.facing = inp.x > 0 ? 1 : -1;
    a.startAttack(next);
    g.sfx('whiff');
    return;
  }
  if (a.atkT >= total(atk)) {
    a.atk = null;
    a.special = null;
    a.setState('idle', 'idle');
  }
};

const air = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput) => {
  if (a.stateT <= 3 && inp.attackP && a.bufferedJump === 0 && inp.jump) {
    // pressed attack right after jump -> treat as attack+jump special
    startSpecial(g, slot, a);
    return;
  }
  const maxV = a.speed * 1.8;
  a.vx = Math.max(-maxV, Math.min(maxV, a.vx + inp.x * 5));
  if (a.bufferedAttack > 0 && !a.jumpAttackUsed) {
    a.bufferedAttack = 0;
    a.jumpAttackUsed = true;
    a.atk = ATTACKS.jumpKick;
    a.atkT = 0;
    a.clearHits();
    if (inp.x) a.facing = inp.x > 0 ? 1 : -1;
    a.play('jumpKick', true);
    g.sfx('whiff');
  }
  if (a.atk) a.advanceAttack();
  else a.play(a.vz > 0 ? 'jumpUp' : 'jumpDown');
};

const kneeHit = (g: Game, slot: PlayerSlot, a: Actor, e: Actor, final: boolean) => {
  const atk = final ? ATTACKS.kneeFinal : ATTACKS.knee;
  if (final) {
    e.grabbedBy = null;
    a.grabbing = null;
    e.setState('hurt', 'hurt');
    applyHit(g, a, e, atk, a.facing, 20, slot.index);
    return;
  }
  applyHit(g, a, e, atk, a.facing, 20, slot.index);
  if (e.hp <= 0) {
    e.grabbedBy = null;
    a.grabbing = null;
    return;
  }
  e.setState('grabbed', 'held');
  e.vx = 0;
};

const grabbing = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput) => {
  const e = a.grabbing;
  a.vx = 0;
  a.vy = 0;
  if (a.atk) {
    a.advanceAttack();
    const ph = a.atkPhase();
    a.frame = a.atk.frames[ph];
    if (ph === 1 && e && !a.hasHit(e.id)) {
      a.markHit(e.id);
      kneeHit(g, slot, a, e, a.atk.id === 'kneeFinal');
    }
    if (a.atkT >= total(a.atk)) {
      a.atk = null;
      if (!a.grabbing) {
        a.kneeCount = 0;
        a.setState('idle', 'idle');
        return;
      }
      a.play('grab', true);
    }
    if (!a.grabbing) return;
  }
  if (!e || e.state !== 'grabbed' || e.grabbedBy !== a) {
    if (!a.atk) {
      releaseGrab(a);
      a.setState('idle', 'idle');
    }
    return;
  }
  a.grabT++;
  e.x = a.x + a.facing * (a.halfWidth + e.halfWidth - 4);
  e.y = a.y + 0.3;
  e.z = 0;
  e.facing = -a.facing as 1 | -1;
  e.vx = e.vy = 0;
  if (a.atk) return;
  if (a.bufferedAttack > 0) {
    a.bufferedAttack = 0;
    const dir = inp.x || a.bufferedDir;
    if (dir !== 0) {
      a.facing = dir > 0 ? 1 : -1;
      a.setState('throw', 'throw');
      g.sfx('throw');
      return;
    }
    a.kneeCount++;
    a.atk = a.kneeCount >= 3 ? ATTACKS.kneeFinal : ATTACKS.knee;
    a.atkT = 0;
    a.clearHits();
    a.play('knee', true);
    return;
  }
  if (a.bufferedJump > 0) {
    a.bufferedJump = 0;
    releaseGrab(a);
    a.setState('idle', 'idle');
    return;
  }
  if (a.grabT > 120) {
    // enemy struggles free
    releaseGrab(a);
    e.vx = a.facing * 140;
    a.vx = -a.facing * 70;
    a.setState('idle', 'idle');
    g.fx.text(e.x, e.y, e.height + 4, 'ESCAPE', '#ffffff', 1, 26);
  }
};

const throwing = (g: Game, slot: PlayerSlot, a: Actor) => {
  const e = a.grabbing;
  a.vx = 0;
  a.vy = 0;
  const dir = a.facing;
  if (a.stateT < 9) {
    a.frame = 0;
    if (e) {
      e.x = a.x - dir * 3;
      e.y = a.y + 0.3;
      e.z = 14 + a.stateT;
      e.facing = dir;
    }
    return;
  }
  a.frame = 1;
  if (a.stateT === 9 && e) {
    a.grabbing = null;
    e.grabbedBy = null;
    const dmg = Math.round(16 * a.power);
    e.hp -= dmg;
    e.lastAttacker = slot.index;
    e.flash = 6;
    e.hpBarT = 110;
    g.onPlayerLandedHit(slot.index, dmg);
    e.setState('fall', 'fall');
    e.vx = dir * 270;
    e.vz = 210;
    e.z = Math.max(e.z, 20);
    e.bounced = false;
    e.juggle = 0;
    e.thrownBy = slot.index;
    e.thrownCount = 0;
    if (e.hp <= 0) {
      e.hp = 0;
      g.onEnemyLethal(e);
    }
    g.camera.shake(0.2);
    g.fx.text(e.x, e.y, 40, 'TOSS!', '#ffd35a', 2, 34);
    a.kneeCount = 0;
  }
  if (a.stateT >= 26) a.setState('idle', 'idle');
};

const specialUpdate = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput) => {
  const atk = a.atk;
  if (!atk) {
    a.special = null;
    a.setState('idle', 'idle');
    return;
  }
  const type = a.special as SpecialType;
  if (type === 'slam' && a.airborne && a.atkT >= atk.startup - 1) {
    a.atkT = atk.startup - 1; // hold until landing
  } else {
    a.advanceAttack();
  }
  const ph = a.atkPhase();
  const def = ANIMS[atk.anim];
  if (def.loop && ph === 1) {
    a.animT++;
    if (a.animT >= def.rate) {
      a.animT = 0;
      a.frame = (a.frame + 1) % def.poses.length;
    }
  } else {
    a.frame = Math.min(atk.frames[ph], def.poses.length - 1);
  }
  const color = slot.fighter.special.color;
  switch (type) {
    case 'spin':
      a.vx = inp.x * 55;
      a.vy = inp.y * 35;
      if (ph === 1 && a.atkT % 4 === 0) {
        g.fx.sparks(a.x, a.y, 20, 1, 2, color);
        g.fx.sparks(a.x, a.y, 20, -1, 2, color);
      }
      break;
    case 'dash':
      if (ph === 0) {
        a.vx = 0;
        if (a.atkT % 3 === 0)
          g.fx.sparks(a.x - a.facing * 4, a.y, 22, -a.facing as 1 | -1, 2, color);
      } else if (ph === 1) {
        a.vx = a.facing * (atk.lunge ?? 300);
        if (a.atkT % 2 === 0) g.fx.dust(a.x - a.facing * 8, a.y, 1, 0.5);
      } else a.vx *= 0.75;
      a.vy = 0;
      break;
    case 'saw':
      a.vx = ph === 1 ? a.facing * 30 + inp.x * 20 : 0;
      a.vy = inp.y * 20;
      if (ph === 1 && a.atkT % 3 === 0)
        g.fx.sparks(a.x + a.facing * 26, a.y, 22, a.facing, 3, '#ffd35a');
      break;
    case 'orb':
    case 'shot':
    case 'boomerang':
      a.vx = 0;
      a.vy = 0;
      if (a.atkT === atk.startup) g.spawnPlayerProjectile(a, type, slot.index);
      break;
    case 'beam':
      a.vx = 0;
      a.vy = 0;
      if (ph === 0 && a.atkT % 2 === 0)
        g.fx.sparks(a.x + a.facing * 14, a.y, 22, -a.facing as 1 | -1, 1, color);
      if (ph === 1 && a.atkT === atk.startup + 1) g.camera.shake(0.25);
      break;
    case 'slam':
      a.vy = 0;
      a.vx *= 0.9;
      break;
  }
  if (a.atkT >= total(atk)) {
    a.atk = null;
    a.special = null;
    a.setState('idle', 'idle');
  }
};

export const onPlayerLand = (g: Game, a: Actor): void => {
  a.vz = 0;
  a.z = 0;
  if (a.state === 'jump') {
    const hadKick = a.atk !== null;
    a.atk = null;
    a.setState('idle', 'idle');
    a.stun = hadKick ? 5 : 2;
    a.sqX = 1.25;
    a.sqY = 0.8;
    g.fx.dust(a.x, a.y, 3);
    g.sfx('land');
  } else if (a.state === 'special' && a.special === 'slam' && a.atk) {
    a.atkT = a.atk.startup;
    a.sqX = 1.35;
    a.sqY = 0.7;
    g.fx.ring(a.x, a.y, 80, '#8dff6a');
    g.fx.dust(a.x, a.y, 12, 2);
    g.fx.dust(a.x - 30, a.y, 4, 1);
    g.fx.dust(a.x + 30, a.y, 4, 1);
  }
};

export const updatePlayer = (g: Game, slot: PlayerSlot, a: Actor, inp: PlayerInput): void => {
  if (inp.attackP) {
    a.bufferedAttack = 9;
    a.bufferedDir = inp.x;
  } else if (a.bufferedAttack > 0) a.bufferedAttack--;
  if (inp.jumpP) a.bufferedJump = 6;
  else if (a.bufferedJump > 0) a.bufferedJump--;
  const wantSpecial = inp.specialP || (inp.attackP && inp.jumpP);
  switch (a.state) {
    case 'idle':
    case 'walk':
    case 'run':
      neutral(g, slot, a, inp, wantSpecial);
      break;
    case 'jump':
      air(g, slot, a, inp);
      break;
    case 'attack':
      attacking(g, slot, a, inp);
      break;
    case 'special':
      specialUpdate(g, slot, a, inp);
      break;
    case 'grabbing':
      grabbing(g, slot, a, inp);
      break;
    case 'throw':
      throwing(g, slot, a);
      break;
    case 'victory':
      a.vx = 0;
      a.vy = 0;
      a.play('victory');
      break;
    default:
      break;
  }
};
