import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const dbzScenes: FunSceneMeta[] = [
  {
    id: 'kamehameha',
    category: 'anime',
    title: 'Kamehameha',
    caption: 'Goku cups a blue orb at his hip, then lets the beam rip to the horizon.',
    hint: 'Hold the pointer, Space or Enter to charge through four beats. Let go to fire; a fuller charge reaches further.',
    accent: '#6cc4ff',
    load: () => import('../kamehameha'),
  },
  {
    id: 'gravity-chamber',
    category: 'anime',
    title: 'Gravity Chamber Training',
    caption: 'Goku and Vegeta grind through push-ups, pull-ups, crunches, sparring and heavy lifting under crushing gravity in the Capsule Corp dome.',
    hint: 'Tap the icons, press 1 to 5, or use Q and E to switch workouts; tapping the left or right half steps through them too. While sparring, a tap, Space or Enter trades blows; in the other workouts Space or Enter forces a hard rep. Drag up or down, use the slider, or press W and S (or + and -) to set the gravity.',
    accent: '#ff5a4a',
    load: () => import('../gravity-chamber'),
  },
];
