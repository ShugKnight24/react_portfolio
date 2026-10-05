// Playable roster: pulls names/stats from the shared arcade roster and pairs
// each with a hand-authored pixel costume (Look) and a special move.
import { defaultCharacters } from '../../data/characterRoster';
import { AnimId, Look } from './rig';

export type SpecialType = 'spin' | 'dash' | 'saw' | 'orb' | 'shot' | 'boomerang' | 'slam' | 'beam';

export interface SpecialDef {
  type: SpecialType;
  name: string;
  color: string;
  anim: AnimId;
}

export interface FighterDef {
  id: string;
  name: string;
  nickname: string;
  color: string;
  look: Look;
  /** walk speed px/s */
  speed: number;
  /** damage multiplier */
  power: number;
  special: SpecialDef;
  blurb: string;
}

const L = (
  o: Omit<Look, 'build' | 'scale' | 'eyeStyle'> &
    Partial<Pick<Look, 'build' | 'scale' | 'eyeStyle'>>
): Look => ({
  build: 1,
  scale: 1,
  eyeStyle: 'cartoon',
  ...o,
});

interface Spec {
  id: string;
  look: Look;
  special: SpecialDef;
  blurb: string;
}

const SPECS: Spec[] = [
  {
    id: 'shugmi',
    look: L({
      key: 'p-shugmi',
      head: 'hero',
      beard: '#1c1a2b',
      beardStyle: 'full',
      skin: '#e8b48a',
      hair: '#1c1a2b',
      hairStyle: 'bald',
      top: '#12c6e0',
      trim: '#7928ca',
      topStyle: 'hoodie',
      pants: '#2b2f4a',
      shoes: '#f2f2f2',
    }),
    special: { type: 'spin', name: 'SHIP TO PROD', color: '#00f0ff', anim: 'spSpin' },
    blurb: 'Balanced builder. Spinning deploy hits everything around him.',
  },
  {
    id: 'saitama',
    look: L({
      key: 'p-saitama',
      head: 'egg',
      eyeKind: 'dot',
      mood: 'deadpan',
      skin: '#f6d2a8',
      hair: '#f6d2a8',
      hairStyle: 'bald',
      top: '#f2c200',
      trim: '#d6202a',
      topStyle: 'bodysuit',
      pants: '#f2c200',
      shoes: '#d6202a',
      gloves: '#d6202a',
      cape: '#f7f7f7',
      belt: '#1d1d1d',
    }),
    special: { type: 'dash', name: 'SERIOUS PUNCH', color: '#ffe066', anim: 'spDash' },
    blurb: 'One punch. Dashing special sends a whole lane flying.',
  },
  {
    id: 'denji',
    look: L({
      key: 'p-denji',
      head: 'lean',
      eyeKind: 'sharp',
      mood: 'cocky',
      fangs: true,
      skin: '#f1c7a0',
      hair: '#f2c94c',
      hairStyle: 'messy',
      top: '#f4f4f4',
      trim: '#1a1a1a',
      topStyle: 'shirt',
      pants: '#1e2233',
      shoes: '#3a2a20',
      prop: 'chainsaw',
    }),
    special: { type: 'saw', name: 'RIPCORD REV', color: '#ff7a1a', anim: 'spSaw' },
    blurb: 'Chainsaw grinder. Multi-hit special shreds crowds.',
  },
  {
    id: 'gojo',
    look: L({
      key: 'p-gojo',
      head: 'lean',
      mood: 'cocky',
      skin: '#f6d7c3',
      hair: '#f5f7ff',
      hairStyle: 'spikyWhite',
      top: '#1e2045',
      trim: '#3b3f7a',
      topStyle: 'suit',
      pants: '#1e2045',
      shoes: '#111122',
      eyeStyle: 'blindfold',
      mask: '#14141f',
    }),
    special: { type: 'orb', name: 'HOLLOW PURPLE', color: '#b15cff', anim: 'spShoot' },
    blurb: 'Fires a slow piercing orb that erases the lane.',
  },
  {
    id: 'spiderman',
    look: L({
      key: 'p-spidey',
      head: 'round',
      skin: '#e0282e',
      hair: '#e0282e',
      hairStyle: 'none',
      top: '#e0282e',
      trim: '#1b1b2a',
      topStyle: 'bodysuit',
      pants: '#2250c8',
      shoes: '#e0282e',
      gloves: '#e0282e',
      eyeStyle: 'mask',
      mask: '#e0282e',
      emblem: 'spider',
      build: 0.92,
    }),
    special: { type: 'shot', name: 'WEB BLOSSOM', color: '#f2f2f2', anim: 'spShoot' },
    blurb: 'Fastest mover. Web shot stuns enemies in a line.',
  },
  {
    id: 'batman',
    look: L({
      key: 'p-batman',
      head: 'square',
      mood: 'mean',
      skin: '#f0c6a0',
      hair: '#2e3440',
      hairStyle: 'none',
      top: '#6b7383',
      trim: '#f2c230',
      topStyle: 'bodysuit',
      pants: '#2b3140',
      shoes: '#1e222c',
      gloves: '#1e222c',
      eyeStyle: 'cowl',
      mask: '#2b3140',
      cape: '#1f2433',
      belt: '#f2c230',
      emblem: 'bat',
      build: 1.08,
    }),
    special: { type: 'boomerang', name: 'BATARANG', color: '#c9d1d9', anim: 'spShoot' },
    blurb: 'Batarang flies out and back, hitting twice.',
  },
  {
    id: 'hulk',
    look: L({
      key: 'p-hulk',
      head: 'brute',
      brow: true,
      mood: 'mean',
      skin: '#4cb84a',
      hair: '#1b1b1b',
      hairStyle: 'short',
      top: '#4cb84a',
      trim: '#7b3fb0',
      topStyle: 'bare',
      pants: '#7b3fb0',
      shoes: '#4cb84a',
      build: 1.4,
      scale: 1.12,
    }),
    special: { type: 'slam', name: 'GAMMA CLAP', color: '#8dff6a', anim: 'spSlam' },
    blurb: 'Slow bruiser. Ground slam shockwave hits both sides.',
  },
  {
    id: 'reacher',
    look: L({
      key: 'p-reacher',
      head: 'square',
      eyeKind: 'narrow',
      beardStyle: 'stubble',
      beard: '#6b4a2b',
      mood: 'deadpan',
      skin: '#e9b98f',
      hair: '#6b4a2b',
      hairStyle: 'short',
      top: '#8c6a45',
      trim: '#e8dcc4',
      topStyle: 'suit',
      pants: '#3a4a66',
      shoes: '#4a3524',
      build: 1.22,
      scale: 1.06,
    }),
    special: { type: 'dash', name: 'KINETIC HEADBUTT', color: '#ffb347', anim: 'spDash' },
    blurb: 'Heavy hitter. Charging headbutt breaks guards.',
  },
  {
    id: 'goku',
    look: L({
      key: 'p-goku',
      head: 'lean',
      eyeKind: 'sharp',
      skin: '#f3c9a0',
      hair: '#141418',
      hairStyle: 'spiky',
      top: '#f08a1c',
      trim: '#2a55c8',
      topStyle: 'gi',
      pants: '#f08a1c',
      shoes: '#2a55c8',
      gloves: '#2a55c8',
      belt: '#2a55c8',
    }),
    special: { type: 'beam', name: 'KAMEHAMEHA', color: '#6ad7ff', anim: 'spBeam' },
    blurb: 'Full-screen energy beam down the lane.',
  },
  {
    id: 'vegeta',
    look: L({
      key: 'p-vegeta',
      head: 'lean',
      eyeKind: 'sharp',
      mood: 'cocky',
      skin: '#f0c4a0',
      hair: '#141418',
      hairStyle: 'flame',
      top: '#2a3a9a',
      trim: '#f4f4f4',
      topStyle: 'armor',
      pants: '#2a3a9a',
      shoes: '#f4f4f4',
      gloves: '#f4f4f4',
      brow: true,
    }),
    special: { type: 'beam', name: 'FINAL FLASH', color: '#ffe95c', anim: 'spBeam' },
    blurb: 'Prideful prince. Golden beam wipes the lane.',
  },
];

export const FIGHTERS: FighterDef[] = SPECS.map((spec) => {
  const c = defaultCharacters.find((ch) => ch.id === spec.id);
  const agility = c?.stats.agility ?? 90;
  const power = c?.stats.power ?? 90;
  return {
    id: spec.id,
    name: (c?.name ?? spec.id).replace('The Incredible ', ''),
    nickname: c?.nickname ?? '',
    color: c?.primaryColor ?? '#ffffff',
    // special-move frames glow in the move's colour
    look: { ...spec.look, aura: spec.look.aura ?? spec.special.color },
    speed: 64 + (agility - 88) * 1.3,
    power: 0.88 + (power - 90) * 0.012,
    special: spec.special,
    blurb: spec.blurb,
  };
});

export const fighterById = (id: string): FighterDef =>
  FIGHTERS.find((f) => f.id === id) ?? FIGHTERS[0];
