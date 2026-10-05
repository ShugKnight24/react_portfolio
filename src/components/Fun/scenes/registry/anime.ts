import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const animeScenes: FunSceneMeta[] = [
  {
    id: 'armored-titan',
    category: 'anime',
    title: 'Armored Titan',
    caption: 'The plated titan charges Wall Maria and puts his shoulder through the gate.',
    hint: 'Hold the pointer, Space or Enter to build the charge. Let go to smash the gate.',
    accent: '#d9b56a',
    load: () => import('../armored-titan'),
  },
  {
    id: 'levi',
    category: 'anime',
    title: 'Levi',
    caption: 'Captain Levi corkscrews up a titan\'s arm on his gear and goes for the nape.',
    hint: 'Point at the titan\'s arm (or press W and S) to aim the grapple. Click, tap, Space or Enter to launch the spinning attack.',
    accent: '#4f8a5b',
    load: () => import('../levi'),
  },
  {
    id: 'reze',
    category: 'anime',
    title: 'Chainsaw Man vs Reze',
    caption: 'Denji takes on Reze, the Bomb Devil, on a school pool deck in the middle of a typhoon.',
    hint: 'Hold the pointer, Space or Enter to rev and bat her blasts away. Let go to lunge through the explosion.',
    accent: '#ff6a2a',
    load: () => import('../reze'),
  },
];
