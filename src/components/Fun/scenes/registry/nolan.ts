import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const nolanScenes: FunSceneMeta[] = [
  {
    id: 'nolan-begins',
    category: 'movies',
    title: 'Batman Begins',
    caption:
      'Bruce trains with Ducard on a frozen lake below the League monastery, then takes the fight the docks of Gotham in the rain.',
    hint: 'On the lake: click, tap, Space or Enter as the ring closes on the blade to parry. After three clean parries, strike while the amber ring closes on Ducard to win the bout and head for Gotham. At the docks, each tap sends him at the next thug; keep the taps coming for a combo, and every fourth hit throws a batarang. Press N to switch between the lake and the docks.',
    accent: '#9cc4e8',
    load: () => import('../nolan-begins'),
  },
  {
    id: 'nolan-dark-knight',
    category: 'movies',
    title: 'The Dark Knight',
    caption:
      'Batman waits on the edge of a Gotham tower until the signal lights the clouds, then dives off into the city.',
    hint: 'Click, tap, Space or Enter to step off the ledge once the signal is lit. Move or drag the pointer, or use W A S D, to steer between the towers; dive to street level for speed and pull up to climb. Tap, Space or Enter in the air for sonar vision. Twelve blocks down he swoops onto the gargoyle under the signal; tap once he has landed to go back to the ledge.',
    accent: '#d99a5b',
    load: () => import('../nolan-dark-knight'),
  },
  {
    id: 'nolan-rises',
    category: 'movies',
    title: 'The Dark Knight Rises',
    caption:
      'Bruce climbs out of the Pit without the rope while the prisoners chant him up toward the daylight.',
    hint: 'Click, tap, Space or Enter to climb: each tap is one move up the wall, and taps on the chant are quicker. On the last ledge, hold, then let go while the ring is in the gold band to make the leap.',
    accent: '#e8c48a',
    load: () => import('../nolan-rises'),
  },
];
