import {
  BrawlerIcon,
  CreatorIcon,
  GalleryIcon,
  JoystickIcon,
  PaletteIcon,
  StudioIcon,
  TamagotchiIcon
} from '../icons/ArcadeIcons';

// One arcade, two halls. The URL is the source of truth:
// /arcade, /arcade/<hall>, /arcade/<hall>/<experience>

export type HallId = 'play' | 'create';

export type ExperienceId =
  | 'brawler'
  | 'tamagotchi'
  | 'character-lab'
  | 'heroes'
  | 'stage-studio';

export type EntryVerb = 'Play' | 'Open' | 'Watch';

type ArcadeIconComponent = typeof BrawlerIcon;

export interface ArcadeExperience {
  id: ExperienceId;
  hall: HallId;
  title: string;
  /** Short label for breadcrumbs */
  crumb: string;
  verb: EntryVerb;
  /** The one intro sentence, shared by the tile and the open window */
  intro: string;
  icon: ArcadeIconComponent;
  /** Sprite ids shown in the tile preview; empty means the icon is the preview */
  previewSprites: string[];
}

export interface ArcadeHall {
  id: HallId;
  title: string;
  crumb: string;
  intro: string;
  icon: ArcadeIconComponent;
  experiences: ArcadeExperience[];
}

export const ARCADE_ROOT = '/arcade';

export const ARCADE_INTRO =
  'My arcade has two halls: games to play, and tools for making your own heroes and scenes.';

const PLAY: ArcadeExperience[] = [
  {
    id: 'brawler',
    hall: 'play',
    title: 'Team Brawler',
    crumb: 'Brawler',
    verb: 'Play',
    intro: 'Draft a squad of legends and fight your way through the streets.',
    icon: BrawlerIcon,
    previewSprites: ['kobe', 'jordan'],
  },
  {
    id: 'tamagotchi',
    hall: 'play',
    title: 'Tamagotchi',
    crumb: 'Tamagotchi',
    verb: 'Play',
    intro: "Feed, play with, and care for Luna, or adopt any hero as your pet.",
    icon: TamagotchiIcon,
    previewSprites: ['luna'],
  },
];

const CREATE: ArcadeExperience[] = [
  {
    id: 'character-lab',
    hall: 'create',
    title: 'Character Lab',
    crumb: 'Character Lab',
    verb: 'Open',
    intro: 'Design a pixel hero, set its stats, and save it to the roster.',
    icon: CreatorIcon,
    previewSprites: ['shugmi'],
  },
  {
    id: 'heroes',
    hall: 'create',
    title: 'Heroes Gallery',
    crumb: 'Heroes',
    verb: 'Open',
    intro: 'Browse every legend on the roster and choose a companion.',
    icon: GalleryIcon,
    previewSprites: ['gojo', 'batman', 'spiderman'],
  },
  {
    id: 'stage-studio',
    hall: 'create',
    title: 'Stage Studio',
    crumb: 'Stage Studio',
    verb: 'Open',
    intro: 'Pick a backdrop, place characters, and stage a scene of your own.',
    icon: StudioIcon,
    previewSprites: [],
  },
];

export const ARCADE_HALLS: ArcadeHall[] = [
  {
    id: 'play',
    title: 'Play',
    crumb: 'Play',
    intro: 'Games you can pick up right now.',
    icon: JoystickIcon,
    experiences: PLAY,
  },
  {
    id: 'create',
    title: 'Create',
    crumb: 'Create',
    intro: 'Tools for making your own heroes and scenes.',
    icon: PaletteIcon,
    experiences: CREATE,
  },
];

export const hallPath = (hall: HallId) => `${ARCADE_ROOT}/${hall}`;
export const experiencePath = (exp: Pick<ArcadeExperience, 'hall' | 'id'>) =>
  `${ARCADE_ROOT}/${exp.hall}/${exp.id}`;

export const findHall = (id: string | undefined) => ARCADE_HALLS.find((h) => h.id === id);

export const findExperience = (id: ExperienceId) =>
  ARCADE_HALLS.flatMap((h) => h.experiences).find((e) => e.id === id) as ArcadeExperience;

export type ArcadeLocation =
  | { level: 'hub' }
  | { level: 'hall'; hall: ArcadeHall }
  | { level: 'experience'; hall: ArcadeHall; experience: ArcadeExperience };

/**
 * Resolve a pathname to a place in the arcade. Unknown segments return a
 * `redirect` to the closest valid parent so a typo never lands on a blank screen.
 */
export const resolveArcadePath = (
  pathname: string
): { location: ArcadeLocation; redirect?: string } => {
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed.startsWith(ARCADE_ROOT)) return { location: { level: 'hub' } };

  const [hallId, expId, ...rest] = trimmed
    .slice(ARCADE_ROOT.length)
    .split('/')
    .filter(Boolean);

  if (!hallId) return { location: { level: 'hub' } };

  // The Stories hall is gone; its Heroes Gallery now lives in Create
  if (hallId === 'stories') {
    return { location: { level: 'hub' }, redirect: expId === 'heroes' ? `${ARCADE_ROOT}/create/heroes` : ARCADE_ROOT };
  }

  const hall = findHall(hallId);
  if (!hall) return { location: { level: 'hub' }, redirect: ARCADE_ROOT };
  if (!expId) return { location: { level: 'hall', hall } };

  const experience = hall.experiences.find((e) => e.id === expId);
  if (!experience || rest.length > 0) {
    return {
      location: { level: 'hall', hall },
      redirect: experience ? experiencePath(experience) : hallPath(hall.id),
    };
  }

  return { location: { level: 'experience', hall, experience } };
};
