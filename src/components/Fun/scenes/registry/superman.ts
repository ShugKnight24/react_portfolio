import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const supermanScenes: FunSceneMeta[] = [
  {
    id: 'superman',
    category: 'comics',
    title: 'Superman',
    caption: 'The Man of Steel circles the Earth at sunrise, cape snapping, city lights burning on the night side below.',
    hint: 'Move the pointer to tilt and turn his orbit. Click, tap, Space or Enter for a loop. Hold to break the sound barrier and fly faster.',
    accent: '#2a5ce0',
    load: () => import('../superman'),
  },
];
