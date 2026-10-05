import type { RisoFilm } from '../riso/engine';

/**
 * The reel. Each film's drawing code is its own chunk, loaded when the film is played or its
 * poster card scrolls into view; this list only carries what the page shows before that.
 * tests/films.test.ts checks every entry against its film module, so keep them in sync.
 */
export interface FilmMeta {
  id: string;
  title: string;
  caption: string;
  theme: string;
  motif: string;
  /** Seconds */
  duration: number;
  series?: string;
  category?: string;
  /** Paper colour, shown on the press while the film's code loads */
  paper: string;
  /** Ink colours in print order, for the card accent and swatches */
  inkColors: string[];
  load(): Promise<{ id: string }>;
}

// Reel order
const ALL_FILMS: FilmMeta[] = [
  {
    id: 'alchemist',
    paper: '#f8f3e8',
    title: "The Shepherd's Road",
    caption:
      'A storybook in watercolour: a shepherd dreams of treasure at the pyramids, crosses the sea and the desert after a golden glint, and finds it was waiting under the sycamore at home.',
    theme: 'Origins',
    motif:
      'A golden glint: the dream, the stones, the lanterns, the glass, one star, the sun on the apex, and the light under the roots',
    duration: 76,
    series: 'Storybook',
    category: 'Origins & travel',
    inkColors: ['#e8c48c', '#efc777', '#b4513f', '#5f93b0', '#8f9c64'],
    load: () => import('./alchemist').then((m) => m.alchemistFilm),
  },
  {
    id: 'little-prince',
    paper: '#f8f3e8',
    title: 'The Prince and the Fox',
    caption:
      'A storybook in watercolour: a bearded prince leaves his one rose, finds a fawn fox in a field of wheat, and learns that the wheat, and one star, will always be hers.',
    theme: 'Luna',
    motif:
      'Gold: the paper star, the wheat, her coat, the sunset, and at last a star that shines back',
    duration: 75,
    series: 'Storybook',
    category: 'Luna',
    inkColors: ['#9fc0da', '#f4b282', '#cf4a52', '#d69a5a', '#5779a6'],
    load: () => import('./little-prince').then((m) => m.littlePrinceFilm),
  },
  {
    id: 'luna',
    paper: '#f4ecdb',
    title: 'Luna',
    caption: 'Moonrise, a dropped ball, a trail of paw prints, and a new constellation.',
    theme: 'Luna',
    motif: 'A circle: moon, tennis ball, moon again',
    duration: 18.5,
    inkColors: ['#3d5588', '#ff48b0', '#ffb511'],
    load: () => import('./luna').then((m) => m.lunaFilm),
  },
  {
    id: 'baku-detroit',
    paper: '#f3ead8',
    title: 'Flame to Motor City',
    caption: 'From the Land of Fire on the Caspian to the Motor City on the river.',
    theme: 'Origins',
    motif: 'A flame that becomes a plane, a road and a window',
    duration: 19,
    inkColors: ['#ff6c2f', '#00838a', '#3d5588', '#ffe800'],
    load: () => import('./baku-detroit').then((m) => m.bakuDetroitFilm),
  },
  {
    id: 'iron-hours',
    paper: '#f4e9d4',
    title: 'Iron Hours',
    caption: 'Five a.m., a plate, a hill. The best ideas come between sets.',
    theme: 'Fitness',
    motif: 'The round weight plate',
    duration: 19.5,
    inkColors: ['#f15060', '#2b2b30', '#ffe800'],
    load: () => import('./iron-hours').then((m) => m.ironHoursFilm),
  },
  {
    id: 'gym-session',
    paper: '#f3ead8',
    title: 'Session',
    caption:
      'Chalk, a heavy back squat, curls in the mirror, and the clock on the wall while he breathes.',
    theme: 'Fitness',
    motif: 'The round iron: plate, sleeve, hex dumbbell, clock',
    duration: 19.5,
    series: 'Risograph',
    category: 'Athletic',
    inkColors: ['#2c2a31', '#e8412e', '#ffcf3a', '#13868c'],
    load: () => import('./gym-session').then((m) => m.gymSessionFilm),
  },
  {
    id: 'insert-coin',
    paper: '#f3ead8',
    title: 'Insert Coin',
    caption: 'One coin, one more go: from the slot to the screen and back.',
    theme: 'Games',
    motif: 'A coin',
    duration: 19,
    inkColors: ['#0078bf', '#ff48b0', '#ffe800', '#00a95c'],
    load: () => import('./insert-coin').then((m) => m.insertCoinFilm),
  },
  {
    id: 'aura',
    paper: '#f3ead8',
    title: 'Aura',
    caption: 'A ring of light, from moonrise to blast wave and back.',
    theme: 'Anime',
    motif: 'A ring of light',
    duration: 19.5,
    inkColors: ['#ffe800', '#ff48b0', '#5ec8e5', '#765ba7'],
    load: () => import('./aura').then((m) => m.auraFilm),
  },
  {
    id: 'buzzer-beater',
    paper: '#f3ead8',
    title: 'Buzzer Beater',
    caption: 'One shot, one arc: from the hardwood to the ice to the horn.',
    theme: 'Sports',
    motif: 'The arc of a shot',
    duration: 18.5,
    inkColors: ['#ff665e', '#3255a4', '#ffb511'],
    load: () => import('./buzzer-beater').then((m) => m.buzzerBeaterFilm),
  },
  {
    id: 'marginalia',
    paper: '#f3ead8',
    title: 'Marginalia',
    caption:
      'A page folds into a bird, flies over a city of spines and comes home as a wave of text.',
    theme: 'Books',
    motif: 'A page and its curl',
    duration: 19.5,
    inkColors: ['#ffb511', '#00838a', '#914e72'],
    load: () => import('./marginalia').then((m) => m.marginaliaFilm),
  },
  {
    id: 'b-side',
    paper: '#f3ead8',
    title: 'B-Side',
    caption: 'A groove becomes a wave, a string, a city skyline, and a record again.',
    theme: 'Music',
    motif: 'The groove / sound wave',
    duration: 20,
    inkColors: ['#5ec8e5', '#ff48b0', '#9d7ad2', '#2b2b30'],
    load: () => import('./b-side').then((m) => m.bSideFilm),
  },
  {
    id: 'window-seat',
    paper: '#f3ead8',
    title: 'Window Seat',
    caption: 'An aperture that keeps opening: lens, airplane window, viewfinder, print.',
    theme: 'Travel & Photos',
    motif: 'The aperture / a rounded window frame',
    duration: 18,
    inkColors: ['#62a8e5', '#ff6c2f', '#407060', '#ffe800'],
    load: () => import('./window-seat').then((m) => m.windowSeatFilm),
  },
  {
    id: 'hello-world',
    paper: '#f3ead8',
    title: 'Hello, World',
    caption: 'A blinking cursor at 2 a.m. becomes the shop down the street.',
    theme: 'Craft',
    motif: 'The blinking cursor',
    duration: 19,
    inkColors: ['#00a95c', '#ff6c2f', '#2b2b30'],
    load: () => import('./hello-world').then((m) => m.helloWorldFilm),
  },
  {
    id: 'saturday-morning',
    paper: '#f3ead8',
    title: 'Saturday Morning',
    caption: 'One screen, many shapes: the TV, the panel, the handheld, the big screen.',
    theme: 'Fun',
    motif: 'The screen / a rounded rectangle',
    duration: 19,
    series: 'Risograph',
    inkColors: ['#3255a4', '#f15060', '#ffe800', '#00838a'],
    load: () => import('./saturday-morning').then((m) => m.saturdayMorningFilm),
  },
  {
    id: 'ukiyo-caspian',
    paper: '#efe3c7',
    title: 'Wave off the Caspian',
    caption: 'A gust of the city of winds curls into a wave, a flame and a sunrise over Baku.',
    theme: 'Origins',
    motif: 'The curling claw: wind, wave, flame',
    duration: 18.5,
    series: 'Ukiyo-e',
    inkColors: ['#1f4f82', '#26365a', '#cf4527', '#d39a3a', '#1d1a17'],
    load: () => import('./ukiyo-caspian').then((m) => m.ukiyoCaspianFilm),
  },
  {
    id: 'ukiyo-ronin',
    paper: '#efe3c7',
    title: 'Ronin',
    caption: 'A petal in the rain, a duel on a moonlit bridge, one decisive draw.',
    theme: 'Anime',
    motif: 'The blossom petal that becomes the blade',
    duration: 19,
    series: 'Ukiyo-e',
    inkColors: ['#26365a', '#cf4527', '#e7b3a6', '#d39a3a', '#1d1a17'],
    load: () => import('./ukiyo-ronin').then((m) => m.ukiyoRoninFilm),
  },
  {
    id: 'blueprint-v8',
    paper: '#164a87',
    title: 'Motor City V8',
    caption:
      'A V8 drawn from the plan up fires, its pulley spins into a mag wheel, and the car cruises Woodward.',
    theme: 'Detroit',
    motif: 'The circle: crank, pulley, wheel',
    duration: 20,
    series: 'Blueprint',
    inkColors: ['#164a87', '#f3f8ff', '#9fd8f4', '#ff7a2e'],
    load: () => import('./blueprint-v8').then((m) => m.blueprintV8Film),
  },
  {
    id: 'blueprint-keyboard',
    paper: '#164a87',
    title: 'Spec Sheet',
    caption: 'One key press travels down a switch, becomes a wire, and draws an app on the screen.',
    theme: 'Craft',
    motif: 'The square key: keycap, app tile, window',
    duration: 18.6,
    series: 'Blueprint',
    inkColors: ['#164a87', '#f3f8ff', '#9fd8f4', '#ff7a2e'],
    load: () => import('./blueprint-keyboard').then((m) => m.blueprintKeyboardFilm),
  },
  {
    id: 'paper-trail',
    paper: '#efe6d3',
    title: 'Trail Day',
    caption: 'A cut-paper hike with Luna: pines, a stream to hop, and the view from the top.',
    theme: 'Luna',
    motif: 'The paper sun: sunrise, light through pines, gold in the stream, sunset for two',
    duration: 18.5,
    series: 'Paper cut',
    inkColors: ['#f4b43c', '#cf553b', '#c8904f', '#4a7a52', '#90a5c8'],
    load: () => import('./paper-trail').then((m) => m.paperTrailFilm),
  },
  {
    id: 'paper-caucasus',
    paper: '#efe5d1',
    title: 'Caucasus',
    caption: 'A cut-paper descent from the high Caucasus, through a stone village, to the Caspian.',
    theme: 'Origins',
    motif: 'A pomegranate seed: a seed, the sun, the fruit, the heart of a carpet',
    duration: 19,
    series: 'Paper cut',
    inkColors: ['#d43c45', '#2d3b66', '#d6a548', '#6c7fa5', '#4b95ac'],
    load: () => import('./paper-caucasus').then((m) => m.paperCaucasusFilm),
  },
  {
    id: 'neon-night-drive',
    paper: '#07040f',
    title: 'Night Drive',
    caption: 'One line of light, from the horizon to the bridge to the tail-lights and home.',
    theme: 'Detroit',
    motif: 'the light streak line',
    duration: 19,
    series: 'Neon',
    inkColors: ['#ff2bd6', '#2de2ff', '#9a5cff', '#ffb13b', '#ff3355'],
    load: () => import('./neon-night-drive').then((m) => m.neonNightDriveFilm),
  },
  {
    id: 'neon-final-boss',
    paper: '#07040f',
    title: 'Final Boss',
    caption: 'The last sliver of health becomes the blade, and the blade becomes the horizon.',
    theme: 'Games',
    motif: 'the health bar line',
    duration: 19,
    series: 'Neon',
    inkColors: ['#2de2ff', '#ff2bd6', '#ffb13b', '#9a5cff'],
    load: () => import('./neon-final-boss').then((m) => m.neonFinalBossFilm),
  },
  {
    id: 'ukiyo-cascades',
    paper: '#efe3c7',
    title: 'Views of the Cascades',
    caption:
      'One snowy volcano seen four ways: from the Sound, two waterfalls and an evening lake.',
    theme: 'Travel',
    motif: 'The snowy volcano, seen from different places',
    duration: 18.5,
    series: 'Ukiyo-e',
    inkColors: ['#1f4f82', '#6f8758', '#e7b3a6', '#d39a3a', '#1d1a17'],
    load: () => import('./ukiyo-cascades').then((m) => m.ukiyoCascadesFilm),
  },
  {
    id: 'ink-iron-mountain',
    paper: '#ece4d1',
    title: 'Iron Mountain',
    caption:
      'Dawn on a cliff ledge, painted in sumi: the stroke that draws the horizon becomes the weight he lifts.',
    theme: 'Fitness',
    motif: 'One horizontal stroke: horizon, ridge, the bamboo pole, the enso',
    duration: 18.5,
    series: 'Ink wash',
    inkColors: ['#171513', '#5d5853', '#a49d92', '#c23a22'],
    load: () => import('./ink-iron-mountain').then((m) => m.inkIronMountainFilm),
  },
  {
    id: 'ink-koi',
    paper: '#ece4d1',
    title: 'Koi',
    caption:
      'Two koi circle a pond; the red one climbs the falls, bursts through the gate and pours out into a dragon that coils into an enso.',
    theme: 'Anime',
    motif: 'The circle: a chase, a whirlpool, a coil, the enso',
    duration: 18.5,
    series: 'Ink wash',
    inkColors: ['#171513', '#5d5853', '#a49d92', '#c23a22'],
    load: () => import('./ink-koi').then((m) => m.inkKoiFilm),
  },
  {
    id: 'pop-deploy-friday',
    paper: '#f2e7cf',
    title: 'Deploy Friday',
    caption: 'One line, one Enter key, one very long Friday afternoon.',
    theme: 'Craft',
    motif: 'The status light: green, red alarm, then the sunset',
    duration: 19,
    series: 'Pop art',
    inkColors: ['#e2231a', '#ffd21f', '#13a3dc', '#15110f'],
    load: () => import('./pop-deploy-friday').then((m) => m.popDeployFridayFilm),
  },
  {
    id: 'pop-gym-hero',
    paper: '#f2e7cf',
    title: 'Leg Day',
    caption: 'A tear, a bar, a squat, and the stairs that came after.',
    theme: 'Fitness',
    motif: 'The plate: iris, weight, star burst, sun',
    duration: 18.5,
    series: 'Pop art',
    inkColors: ['#e2231a', '#13a3dc', '#ffd21f', '#15110f'],
    load: () => import('./pop-gym-hero').then((m) => m.popGymHeroFilm),
  },
  {
    id: 'pixel-detroit-run',
    paper: '#07061a',
    title: 'Motor City Run',
    caption:
      'One night run through a 16-bit Detroit, chasing the light ahead until it turns into the sun.',
    theme: 'Detroit',
    motif: 'the light ahead: headlight, tower crowns, tail-lights, sunrise',
    duration: 19,
    series: '16-bit',
    inkColors: ['#f0a83a', '#2a2062', '#d0303c', '#ffd25a', '#3a64c8'],
    load: () => import('./pixel-detroit-run').then((m) => m.pixelDetroitRunFilm),
  },
  {
    id: 'pixel-dungeon',
    paper: '#05041a',
    title: 'Save Point',
    caption:
      'A tiny 16-bit quest: the title star leads a party of three to a cave, a boss, a limit break, and a sunrise worth saving.',
    theme: 'Games',
    motif: 'the glowing star / save crystal',
    duration: 19,
    series: '16-bit',
    inkColors: ['#ffd050', '#8aeaff', '#2a5ab8', '#d8383a', '#7a4ac0'],
    load: () => import('./pixel-dungeon').then((m) => m.pixelDungeonFilm),
  },
  {
    id: 'deco-motor-city',
    paper: '#0a1226',
    title: 'Motor City Deco',
    caption: 'A tower’s sunburst crown turns gear, then wheel, then the sun rising over the river.',
    theme: 'Detroit',
    motif: 'The sunburst: crown, gear, wheel, sunrise',
    duration: 18.5,
    series: 'Art deco',
    inkColors: ['#cfa349', '#e3892b', '#14234a', '#0f4a41', '#e4704f'],
    load: () => import('./deco-motor-city').then((m) => m.decoMotorCityFilm),
  },
  {
    id: 'deco-orient-line',
    paper: '#0a1226',
    title: 'The Caspian Line',
    caption: 'From a Baku station clock to a headlamp, a porthole and a moon over a city far away.',
    theme: 'Origins',
    motif: 'The round light: clock, headlamp, porthole, moon',
    duration: 19.5,
    series: 'Art deco',
    inkColors: ['#cfa349', '#0f4a41', '#e4704f', '#14234a', '#f3e6c8'],
    load: () => import('./deco-orient-line').then((m) => m.decoOrientLineFilm),
  },
  {
    id: 'noir-long-take',
    paper: '#030303',
    title: 'Long Take',
    caption:
      'One unbroken move through a wet Detroit night: puddle, match, diner, fire escape, roof.',
    theme: 'Detroit',
    motif: 'A single small flame: the match, then the ember',
    duration: 20,
    series: 'Noir',
    category: 'Cinematic',
    inkColors: ['#030303', '#565657', '#e4e2dc', '#ff9a3c'],
    load: () => import('./noir-long-take').then((m) => m.noirLongTakeFilm),
  },
  {
    id: 'noir-coming-soon',
    paper: '#030303',
    title: 'Coming Soon',
    caption:
      'A trailer for a noir that does not exist, cut on the beat: chase, phone, stand-off, train, drop.',
    theme: 'Cinematic',
    motif:
      'A beam of light cutting the dark: lantern, headlights, blinds, train windows, the flash',
    duration: 20,
    series: 'Noir',
    category: 'Cinematic',
    inkColors: ['#030303', '#7c7c7c', '#f6f4ee', '#d4252b'],
    load: () => import('./noir-coming-soon').then((m) => m.noirComingSoonFilm),
  },
  {
    id: 'kinetic-splits',
    paper: '#ece8de',
    title: 'Splits',
    caption: 'One hundred metres, from the blocks to the tape and back into the blocks.',
    theme: 'Athletic',
    motif: 'the race clock',
    duration: 15,
    series: 'Kinetic',
    category: 'Athletic',
    inkColors: ['#ff3b1f', '#2a3ef0', '#0f0f10', '#f6f4ef'],
    load: () => import('./kinetic-splits').then((m) => m.kineticSplitsFilm),
  },
  {
    id: 'kinetic-twelve-rounds',
    paper: '#0f0f10',
    title: 'Twelve Rounds',
    caption:
      "A boxer's training day in words and numbers, from 5:00 AM roadwork to the final bell.",
    theme: 'Athletic',
    motif: 'the count that keeps the beat',
    duration: 19,
    series: 'Kinetic',
    category: 'Athletic',
    inkColors: ['#e8162b', '#ffd21a', '#0f0f10', '#f6f4ef'],
    load: () => import('./kinetic-twelve-rounds').then((m) => m.kineticTwelveRoundsFilm),
  },
  {
    id: 'lowpoly-attract',
    paper: '#1a1030',
    title: 'Attract Mode',
    caption:
      'An arcade racer plays itself at sunset: chase cam, a drift, a jump over a broken bridge, the high-score table, and INSERT COIN forever.',
    theme: 'Video game',
    motif: 'the low sun the car keeps racing toward',
    duration: 20,
    series: 'Low poly',
    category: 'Video game',
    inkColors: ['#f0482c', '#ffb27a', '#2e74a8', '#4a2e7a', '#ffd23a'],
    load: () => import('./lowpoly-attract').then((m) => m.lowpolyAttractFilm),
  },
  {
    id: 'lowpoly-boss-arena',
    paper: '#0c1a26',
    title: 'Boss Arena',
    caption:
      'One unbroken take: a lone swordsman, a stone colossus rising from the arena floor, a roll, a climb, one strike at the glowing heart, and the giant falls apart into polygons.',
    theme: 'Video game',
    motif: 'the glowing cyan weak point',
    duration: 20,
    series: 'Low poly',
    category: 'Video game',
    inkColors: ['#7af4ff', '#ffa040', '#a8998a', '#c4323c', '#1e3a4a'],
    load: () => import('./lowpoly-boss-arena').then((m) => m.lowpolyBossArenaFilm),
  },
  {
    id: 'riso-night-walk',
    paper: '#f2e9d6',
    title: 'Night Walk',
    caption:
      'Once around the block with Luna: lamps, porch lights, a cat she pretends not to see, fireflies.',
    theme: 'Luna',
    motif: 'Pools of lamplight, one after another, back to the same corner',
    duration: 18,
    category: 'Luna',
    inkColors: ['#2e4688', '#ff48b0', '#ffb511'],
    load: () => import('./riso-night-walk').then((m) => m.risoNightWalkFilm),
  },
  {
    id: 'paper-snow-day',
    paper: '#efe6d3',
    title: 'Snow Day',
    caption:
      'A cut-paper backyard in fresh Michigan snow: zoomies, a wrestle, a snowball, and the porch light at dusk.',
    theme: 'Luna',
    motif:
      'Snow: falling at every depth, kicked into sprays, packed into a ball that bursts, lit gold by the porch light',
    duration: 18,
    series: 'Paper cut',
    category: 'Luna',
    inkColors: ['#a5473d', '#c8904f', '#2e2d34', '#4d6a68', '#6d7bb0'],
    load: () => import('./paper-snow-day').then((m) => m.paperSnowDayFilm),
  },
  {
    id: 'ink-caspian-wind',
    paper: '#ece4d1',
    title: 'City of Winds',
    caption:
      'Three hanging scrolls (the Caspian, the old walled city, the Caucasus) painted at once; the wind carries one pomegranate blossom across them until they flow into one land.',
    theme: 'Origins',
    motif: 'One red pomegranate blossom: plucked, carried across the gaps, home again',
    duration: 18.5,
    series: 'Ink wash',
    category: 'Origins & travel',
    inkColors: ['#171513', '#5d5853', '#a49d92', '#c23a22'],
    load: () => import('./ink-caspian-wind').then((m) => m.inkCaspianWindFilm),
  },
];

/** Archived films stay in the codebase but leave the reel. Remove an id here to bring one back. */
export const ARCHIVED_FILM_IDS = new Set([
  'b-side',
  'ukiyo-ronin',
  'pop-deploy-friday',
  'pop-gym-hero',
  'kinetic-splits',
  'kinetic-twelve-rounds',
  'noir-long-take',
  'noir-coming-soon',
  'iron-hours',
]);

export const FILM_ARCHIVE = ALL_FILMS.filter((f) => ARCHIVED_FILM_IDS.has(f.id));

export const FILMS = ALL_FILMS.filter((f) => !ARCHIVED_FILM_IDS.has(f.id));

export const findFilm = (id: string | undefined) => FILMS.find((f) => f.id === id);

const loaded = new Map<string, Promise<RisoFilm<never>>>();

/** Fetch a film's drawing code once; later calls share the same promise */
export const loadFilm = (meta: FilmMeta): Promise<RisoFilm<never>> => {
  let film = loaded.get(meta.id);
  if (!film) {
    // Each film is typed with its own state; the player only needs the shared shape
    film = meta.load().then((m) => m as unknown as RisoFilm<never>);
    film.catch(() => loaded.delete(meta.id));
    loaded.set(meta.id, film);
  }
  return film;
};
