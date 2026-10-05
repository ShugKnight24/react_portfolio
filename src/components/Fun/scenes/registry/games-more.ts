import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const gamesMoreScenes: FunSceneMeta[] = [
  {
    id: 'drum-kit',
    category: 'studio',
    title: 'Drum Kit',
    caption: 'A five piece rock kit on a lit riser, sticks in the air and ready to go.',
    hint: 'Tap or click any drum or cymbal to play it; the centre hits full, the edge rings, and the ride has a bell. Drag across the drums for a fill. Keys: Space or B kick, J or S snare, K or H hi-hat (hold Shift to open it), D F G toms, U crash, I ride, O ride bell. Tap the hi-hat pedal to open the hats. The drum machine below runs a click (M) or a rock groove (Enter), and minus and plus set the tempo. Unmute to hear it.',
    accent: '#ff5a3c',
    load: () => import('../drum-kit'),
  },
  {
    id: 'pikachu-thunderbolt',
    category: 'games',
    title: 'Pikachu, I Choose You',
    caption: 'Pikachu squares off against a wild Rattata on a sunny battle field.',
    hint: 'Tap, click or press Q for Quick Attack. Hold the pointer, Space or Enter to charge the cheeks, then let go for Thunderbolt (T fires one at full power). Swipe toward the Rattata or press V for Volt Tackle. Knock it out and it goes back in its ball before the next one comes out. Unmute to hear it.',
    accent: '#ffd93b',
    load: () => import('../pikachu-thunderbolt'),
  },
];
