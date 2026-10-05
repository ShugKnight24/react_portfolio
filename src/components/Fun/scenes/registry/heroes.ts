import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const heroesScenes: FunSceneMeta[] = [
  {
    id: 'iron-man',
    category: 'comics',
    title: 'Iron Man',
    caption: 'Red and gold armor on patrol over the city, repulsors hot.',
    hint: 'Move to steer. Click, tap or Space fires a repulsor. Hold to charge the unibeam. W A S D fly too.',
    accent: '#e0443a',
    load: () => import('../iron-man'),
  },
  {
    id: 'chainsaw-man',
    category: 'anime',
    title: 'Chainsaw Man',
    caption: 'Denji takes on the Bat Devil in a rainy alley and saws it in half.',
    hint: 'Hold the pointer, Space or Enter to rev the chainsaws and block its bite. Let go to leap and carve down; a full rev cuts it clean in two.',
    accent: '#ff7a1a',
    load: () => import('../chainsaw-man'),
  },
  {
    id: 'league-yasuo',
    category: 'games',
    title: 'Yasuo, Last Breath',
    caption: 'The Unforgiven wades the river at dawn against the red wave, wind at his back and his brother watching from the far bank.',
    hint: 'Click or tap the water to walk, click a minion to attack. Q Steel Tempest (every third cast is a whirlwind), W Wind Wall, E Sweeping Blade, R Last Breath on anything airborne. On touch: hold for Q, keep holding for R, double tap for E, tap Yasuo for W. Space is Q, Enter is R.',
    accent: '#8ec8ff',
    load: () => import('../league-yasuo'),
  },
  {
    id: 'league-yone',
    category: 'games',
    title: 'Yone, Fate Sealed',
    caption: 'The Unforgotten under a blood moon, Azakana mask at his temple, spirit blade and Azakana blade drawn, Yasuo watching from across the river.',
    hint: 'Click or tap the water to walk, click a minion to attack. Q Mortal Steel (every third cast dashes), W Spirit Cleave, E Soul Unbound (E again pulls the spirit back), R Fate Sealed. On touch: hold for Q, keep holding for R, double tap for E, tap Yone for W. Space is Q, Enter is R.',
    accent: '#6ab8ff',
    load: () => import('../league-yone'),
  },
  {
    id: 'league-zed',
    category: 'games',
    title: 'Zed, Master of Shadows',
    caption: 'Zed stalks a temple roof under a huge Ionian moon, blades out, eyes burning red, his shadows ready.',
    hint: 'Click or tap the roof to run, click a post to attack. Q Razor Shuriken (shadows throw too), W Living Shadow (W again or tap it to swap), E Shadow Slash, R Death Mark. On touch: hold for Q, keep holding for R, double tap for W, tap Zed for E. Space is Q, Enter is R.',
    accent: '#e0283c',
    load: () => import('../league-zed'),
  },
  {
    id: 'league-ahri',
    category: 'games',
    title: 'Ahri, the Nine-Tailed Fox',
    caption: 'Ahri glides over a twilight pond among spirit blossoms, nine tails fanned out and her orb turning in her palm.',
    hint: 'Click or tap anywhere to glide, click a wisp to attack. Q Orb of Deception, W Fox-Fire, E Charm, R Spirit Rush (up to three dashes). On touch: hold for Q, keep holding for R, double tap for E, tap Ahri for W. Space is Q, Enter is R.',
    accent: '#ff7ab8',
    load: () => import('../league-ahri'),
  },
];
