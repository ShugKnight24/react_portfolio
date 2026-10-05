import { animeScenes } from './registry/anime';
import { dbzScenes } from './registry/dbz';
import { gamesScenes } from './registry/games';
import { heroesScenes } from './registry/heroes';
import { matrixScenes } from './registry/matrix';
import { nolanScenes } from './registry/nolan';
import { supermanScenes } from './registry/superman';
import { theaterScenes } from './registry/theater';
import { gamesMoreScenes } from './registry/games-more';
import { animeMoreScenes } from './registry/anime-more';
import { moviesMoreScenes } from './registry/movies-more';
import { legendsScenes } from './registry/legends';
import type { FunCategory, FunSceneMeta } from './types';

export const FUN_CATEGORIES: { id: FunCategory; label: string }[] = [
  { id: 'anime', label: 'Anime' },
  { id: 'games', label: 'Games' },
  { id: 'comics', label: 'Comics' },
  { id: 'movies', label: 'Movies' },
  { id: 'studio', label: 'Studio' },
  { id: 'legends', label: 'Legends of the game' },
];

const SCENES: FunSceneMeta[] = [
  /* ---------- anime ---------- */
  {
    id: 'power-up',
    category: 'anime',
    title: 'Power Up',
    caption: 'Climb the ladder: Super Saiyan, 2, 3, God, Blue, then Ultra Instinct.',
    hint: 'Hold the pointer, Space or Enter to charge through each form. Let go to keep it; tap or rest a few seconds to power down a step.',
    accent: '#ffd84d',
    load: () => import('./power-up'),
  },
  {
    id: 'spirit-bomb',
    category: 'anime',
    title: 'Spirit Bomb',
    caption: 'Energy streams in from every edge and gathers overhead.',
    hint: 'Hold to gather energy, release to throw it.',
    accent: '#7fb8ff',
    load: () => import('./spirit-bomb'),
  },
  {
    id: 'arise',
    category: 'anime',
    title: 'Arise',
    caption: 'A shadow monarch calls his army up out of the ground.',
    hint: 'Click anywhere to raise a soldier where you point.',
    accent: '#a78bfa',
    load: () => import('./arise'),
  },

  /* ---------- games ---------- */
  {
    id: 'barrel-roll',
    category: 'games',
    title: 'Barrel Roll',
    caption: 'A starfighter skimming a synthwave canyon at full throttle.',
    hint: 'Move to steer. Click or press Space to roll.',
    accent: '#5dd8ff',
    load: () => import('./barrel-roll'),
  },
  {
    id: 'pipe-hop',
    category: 'games',
    title: 'Pipe Hop',
    caption: 'A little plumber bounding over green pipes for a stream of coins.',
    hint: 'Click, tap, Space or W to jump. Hold for a higher jump.',
    accent: '#ffcc33',
    load: () => import('./pipe-hop'),
  },

  /* ---------- comics ---------- */
  {
    id: 'night-swing',
    category: 'comics',
    title: 'Night Swing',
    caption: 'A masked hero slinging webs between skyscrapers after dark.',
    hint: 'Hold the pointer, Space or Enter to shoot a web and swing. Let go to fly.',
    accent: '#ff3b4f',
    load: () => import('./night-swing'),
  },
  ...supermanScenes,
  {
    id: 'gamma-slam',
    category: 'comics',
    title: 'Gamma Slam',
    caption: 'A green giant winds up and hits the ground hard enough to crack it.',
    hint: 'Hold the pointer, Space or Enter to wind up. Let go to slam.',
    accent: '#6dff4a',
    load: () => import('./gamma-slam'),
  },
  {
    id: 'baku-to-detroit',
    category: 'comics',
    title: 'Baku to Detroit',
    caption: 'A six panel comic of the trip from the Caspian to Motor City.',
    hint: 'Hover or tap a panel to bring it forward. Keys 1 to 6 work too.',
    accent: '#ff8a2a',
    load: () => import('./baku-to-detroit'),
  },

  /* ---------- movies ---------- */
  {
    id: 'saber-duel',
    category: 'movies',
    title: 'Saber Duel',
    caption: 'Two blades, blue and red, locked in a humming standoff.',
    hint: 'Click or press Space to clash the blades.',
    accent: '#ff5a5a',
    load: () => import('./saber-duel'),
  },
  {
    id: 'tesla-coils',
    category: 'movies',
    title: 'Are You Watching',
    caption: 'Two coils, a top hat and a lot of loose electricity.',
    hint: 'Click or press Space to discharge the coils.',
    accent: '#9fe7ff',
    load: () => import('./tesla-coils'),
  },

  /* ---------- studio ---------- */
  {
    id: 'golden-hour',
    category: 'studio',
    title: 'Golden Hour',
    caption: 'A viewfinder pointed at a retro sun over a neon grid.',
    hint: 'Move to frame the shot. Click or press Space to take a photo.',
    accent: '#ffb347',
    load: () => import('./golden-hour'),
  },
  {
    id: 'night-keys',
    category: 'studio',
    title: 'Night Keys',
    caption: 'A small synth keyboard that lights up as you play it.',
    hint: 'Click the keys or play A to K on your keyboard. Unmute to hear it.',
    accent: '#ff4fa3',
    load: () => import('./night-keys'),
  },
  {
    id: 'two-decks',
    category: 'studio',
    title: 'Two Decks',
    caption: 'A pair of turntables spinning under club lights.',
    hint: 'Drag a record to scratch it. Unmute to hear it.',
    accent: '#5dffb0',
    load: () => import('./two-decks'),
  },
  {
    id: 'guitar',
    category: 'studio',
    title: 'Guitar',
    caption: 'A sunburst electric under the stage lights, ready to play.',
    hint: 'Swipe across the strings to strum, tap a string to pick it, or tap the neck to play a single note. Pads or keys A to K change chords, 1 to 8 play power chords. Space strums down, Enter strums up. The pedals (or Q and W) switch drive and reverb. Unmute to hear it.',
    accent: '#ff9a3c',
    load: () => import('./guitar'),
  },
  {
    id: 'constellation',
    category: 'studio',
    title: 'Constellation',
    caption: 'Drifting motes that link up whenever they get close.',
    hint: 'Move to pull the stars in. Click to drop new ones.',
    accent: '#5dffb0',
    load: () => import('./constellation'),
  },
];

// Each lane-owned registry adds its scenes; order within a category follows this list
const ALL_SCENES: FunSceneMeta[] = [
  ...dbzScenes,
  ...animeScenes,
  ...SCENES,
  ...heroesScenes,
  ...nolanScenes,
  ...theaterScenes,
  ...gamesMoreScenes,
  ...animeMoreScenes,
  ...moviesMoreScenes,
  ...gamesScenes,
  ...matrixScenes,
  ...legendsScenes,
];

/**
 * Archived scenes stay in the codebase (and in their registries) but leave the gallery and the
 * player. Remove an id here to bring a scene back.
 */
export const ARCHIVED_SCENE_IDS = new Set([
  'spirited-away',
  'demon-slayer',
  'league-yasuo',
  'league-yone',
  'league-zed',
  'league-ahri',
  'pikachu-thunderbolt',
  'halo',
  'gears-of-war',
  'warhammer-ultramarines',
  'spider-verse',
  'jack-reacher',
  'drum-kit',
  'jjk-hollow-purple',
  'unlimited-void',
  'gojo-hollow-purple',
  'gojo-unlimited-void',
]);

export const FUN_ARCHIVE: FunSceneMeta[] = ALL_SCENES.filter((s) => ARCHIVED_SCENE_IDS.has(s.id));

/** Gallery order and arrow-key order in the player: grouped by category */
export const FUN_SCENES: FunSceneMeta[] = FUN_CATEGORIES.flatMap(({ id }) =>
  ALL_SCENES.filter((s) => s.category === id && !ARCHIVED_SCENE_IDS.has(s.id))
);

const ALL_GROUPS = FUN_CATEGORIES.map((c) => ({
  ...c,
  scenes: FUN_SCENES.filter((s) => s.category === c.id),
})).filter((g) => g.scenes.length > 0);

/** The tile gallery; the legends group renders separately, under the Sports Legends feature */
export const FUN_GROUPS = ALL_GROUPS.filter((g) => g.id !== 'legends');

export const LEGENDS_GROUP = ALL_GROUPS.find((g) => g.id === 'legends');

export const findScene = (id: string | undefined) => FUN_SCENES.find((s) => s.id === id);
