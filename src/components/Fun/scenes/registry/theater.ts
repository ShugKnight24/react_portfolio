import type { FunSceneMeta } from '../types';

// Scenes that came over from the arcade's scenes theater; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const theaterScenes: FunSceneMeta[] = [
  {
    id: 'detroit-code-city',
    category: 'studio',
    title: 'Detroit Code City',
    caption: 'Motor City split down a weld seam: the assembly line at a smoggy dusk on one side, the Renaissance Center, the People Mover and code rising off the river on the other.',
    hint: 'Move the pointer to drag the seam across the city. Click, tap, Space or Enter to send fireworks over the river and a surge of code through the skyline.',
    accent: '#5dd8ff',
    load: () => import('../detroit-code-city'),
  },
  {
    id: 'caucasus-origins',
    category: 'studio',
    title: 'Caucasus Origins',
    caption: 'A traveller on a crest above the Caspian, with snow on the Caucasus, the Flame Towers burning over Baku and the hillside fire of Yanar Dag below.',
    hint: 'Hold the pointer, Space or Enter to bring the sunrise up over the sea. Each tap makes the towers and the hillside flare and plucks a note. Move to look around.',
    accent: '#ff8a3d',
    load: () => import('../caucasus-origins'),
  },
  {
    id: 'iron-discipline',
    category: 'studio',
    title: 'Iron Discipline',
    caption: 'One lifter, one spotlight and a loaded bar. Squat, deadlift and press, tallied rep by rep on the chalkboard.',
    hint: 'Click, tap, Space or Enter for a rep. Press 1, 2 or 3 for the squat, deadlift or overhead press. Every five reps he chalks up and adds a plate.',
    accent: '#e0464c',
    load: () => import('../iron-discipline'),
  },
  {
    id: 'jack-reacher',
    category: 'movies',
    title: 'Jack Reacher',
    caption: 'Three short chapters for a very large drifter: a slow diner arrest, a cellblock that goes badly for the locals, and a rainy diner lot at night.',
    hint: 'Press 1, 2 or 3 or tap the chapter strip to cut between chapters; each one moves on by itself once it lands. In the diner, hold the pointer or Space to stall over your coffee and let go to raise your hands. In the fights, click or tap either side of Reacher (or press Space or Enter) to hit the nearest man; three quick hits make a finisher.',
    accent: '#ffb060',
    load: () => import('../jack-reacher'),
  },
];
