import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const matrixScenes: FunSceneMeta[] = [
  {
    id: 'bullet-time',
    category: 'movies',
    title: 'Bullet Time',
    caption: 'Neo bends back on a rooftop as an Agent empties his clip and the world slows to a crawl.',
    hint: 'Move the pointer and his head follows: down and back to bend into the dodge, up to stand. A red line means that shot will hit, so lean until it turns pale. Hold the pointer, Space or Enter for deeper bullet time. Hold S or D to lean back, W or A to stand.',
    accent: '#4dff88',
    load: () => import('../bullet-time'),
  },
  {
    id: 'no-spoon',
    category: 'movies',
    title: 'There Is No Spoon',
    caption: 'A spoon held up in the Oracle\'s waiting room, with the room and the code caught in its bowl.',
    hint: 'Drag sideways to bend the spoon, let go to watch it spring back. A and D (or Space) bend it from the keyboard.',
    accent: '#9fe8b8',
    load: () => import('../no-spoon'),
  },
  {
    id: 'red-or-blue',
    category: 'movies',
    title: 'Red Pill or Blue Pill',
    caption: 'Morpheus holds out both capsules on a stormy night. One way down the rabbit hole, one way back to bed.',
    hint: 'Hover a pill to weigh it, click to choose. R or B chooses from the keyboard.',
    accent: '#e0323a',
    load: () => import('../red-or-blue'),
  },
];
