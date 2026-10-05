import type { RisoFilm } from '../riso/engine';
import { auraFilm } from './aura';
import { bSideFilm } from './b-side';
import { bakuDetroitFilm } from './baku-detroit';
import { blueprintKeyboardFilm } from './blueprint-keyboard';
import { blueprintV8Film } from './blueprint-v8';
import { buzzerBeaterFilm } from './buzzer-beater';
import { decoMotorCityFilm } from './deco-motor-city';
import { decoOrientLineFilm } from './deco-orient-line';
import { helloWorldFilm } from './hello-world';
import { inkCaspianWindFilm } from './ink-caspian-wind';
import { inkIronMountainFilm } from './ink-iron-mountain';
import { inkKoiFilm } from './ink-koi';
import { insertCoinFilm } from './insert-coin';
import { ironHoursFilm } from './iron-hours';
import { kineticSplitsFilm } from './kinetic-splits';
import { kineticTwelveRoundsFilm } from './kinetic-twelve-rounds';
import { littlePrinceFilm } from './little-prince';
import { lowpolyAttractFilm } from './lowpoly-attract';
import { lowpolyBossArenaFilm } from './lowpoly-boss-arena';
import { lunaFilm } from './luna';
import { marginaliaFilm } from './marginalia';
import { neonFinalBossFilm } from './neon-final-boss';
import { neonNightDriveFilm } from './neon-night-drive';
import { noirComingSoonFilm } from './noir-coming-soon';
import { noirLongTakeFilm } from './noir-long-take';
import { paperCaucasusFilm } from './paper-caucasus';
import { paperSnowDayFilm } from './paper-snow-day';
import { paperTrailFilm } from './paper-trail';
import { pixelDetroitRunFilm } from './pixel-detroit-run';
import { pixelDungeonFilm } from './pixel-dungeon';
import { popDeployFridayFilm } from './pop-deploy-friday';
import { popGymHeroFilm } from './pop-gym-hero';
import { risoNightWalkFilm } from './riso-night-walk';
import { saturdayMorningFilm } from './saturday-morning';
import { ukiyoCascadesFilm } from './ukiyo-cascades';
import { ukiyoCaspianFilm } from './ukiyo-caspian';
import { ukiyoRoninFilm } from './ukiyo-ronin';
import { windowSeatFilm } from './window-seat';

// Reel order. Each film is typed with its own state; the player only needs the shared shape
const ALL_FILMS = [
  lunaFilm,
  bakuDetroitFilm,
  ironHoursFilm,
  insertCoinFilm,
  auraFilm,
  buzzerBeaterFilm,
  marginaliaFilm,
  bSideFilm,
  windowSeatFilm,
  helloWorldFilm,
  saturdayMorningFilm,
  ukiyoCaspianFilm,
  ukiyoRoninFilm,
  blueprintV8Film,
  blueprintKeyboardFilm,
  paperTrailFilm,
  paperCaucasusFilm,
  neonNightDriveFilm,
  neonFinalBossFilm,
  ukiyoCascadesFilm,
  inkIronMountainFilm,
  inkKoiFilm,
  popDeployFridayFilm,
  popGymHeroFilm,
  pixelDetroitRunFilm,
  pixelDungeonFilm,
  decoMotorCityFilm,
  decoOrientLineFilm,
  noirLongTakeFilm,
  noirComingSoonFilm,
  kineticSplitsFilm,
  kineticTwelveRoundsFilm,
  lowpolyAttractFilm,
  lowpolyBossArenaFilm,
  risoNightWalkFilm,
  paperSnowDayFilm,
  inkCaspianWindFilm,
  littlePrinceFilm,
] as unknown as RisoFilm<never>[];

/** Archived films stay in the codebase but leave the reel. Remove an id here to bring one back. */
export const ARCHIVED_FILM_IDS = new Set([
  'b-side',
  'ukiyo-ronin',
  'pop-deploy-friday',
  'pop-gym-hero',
  'kinetic-splits',
  'kinetic-twelve-rounds',
]);

export const FILM_ARCHIVE = ALL_FILMS.filter((f) => ARCHIVED_FILM_IDS.has(f.id));

export const FILMS = ALL_FILMS.filter((f) => !ARCHIVED_FILM_IDS.has(f.id));

export const findFilm = (id: string | undefined) => FILMS.find((f) => f.id === id);
