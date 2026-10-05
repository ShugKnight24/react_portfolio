import { FC } from 'react';
import { GAMING_SPRITES } from './presetsGaming';
import { HEROES_SPRITES } from './presetsHeroes';
import { Jordan, Kobe, Luna, Ovechkin, Shugmi } from './presetsOriginals';

/** Roster id (and legacy aliases) to sprite art. Unknown ids fall back to Shugmi. */
export const PRESET_SPRITES: Record<string, FC> = {
  luna: Luna,
  shugmi: Shugmi,
  kobe: Kobe,
  jordan: Jordan,
  ovechkin: Ovechkin,
  ...HEROES_SPRITES,
  ...GAMING_SPRITES,
};
