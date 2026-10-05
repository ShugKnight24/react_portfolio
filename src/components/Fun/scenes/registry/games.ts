import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const gamesScenes: FunSceneMeta[] = [
  {
    id: 'halo',
    category: 'games',
    title: 'Master Chief',
    caption: 'Master Chief duels a Covenant Elite on a ridge under a ringworld.',
    hint: 'Click or hold to fire where you point, or hold Space or Enter. Break its shield and the Elite charges with an energy sword. Tap behind the Chief, swipe back or press Shift to dodge, then tap the Elite or press F to melee. Swipe up or press G to stick a plasma grenade.',
    accent: '#9ccf5a',
    load: () => import('../halo'),
  },
  {
    id: 'halo-warthog',
    category: 'games',
    title: 'Warthog Run',
    caption: 'Master Chief takes a Warthog across the ring, with a Marine riding along and the Covenant in the way.',
    hint: 'Hold the pointer, Space, W or D to floor it, and S or A to brake into a skid. Tap the Warthog or press E or Enter to switch seats. On the turret, aim with the pointer and hold to fire.',
    accent: '#b7c95a',
    load: () => import('../halo-warthog'),
  },
  {
    id: 'halo-cortana',
    category: 'games',
    title: 'Master Chief and Cortana',
    caption: 'Cortana stands on a holo pedestal in a Forerunner control room, the ring filling the window behind her.',
    hint: 'Hold the pointer, Space or Enter and she projects a map of the ring. Click, tap or press briefly to have the Chief take her chip into his helmet, and again to put her back. Her eyes follow the pointer.',
    accent: '#7fd4ff',
    load: () => import('../halo-cortana'),
  },
  {
    id: 'gears-of-war',
    category: 'games',
    title: 'Gears of War',
    caption: 'Marcus, Dom, Cole and Baird hold a cover line in the ruins of Sera as Drones and a Boomer climb out of an emergence hole.',
    hint: 'Click or tap a Locust to have the squad pop up and fire on it, or press Space or Enter to hit the nearest one. Hold to rev the Lancer chainsaw and roadie run out for a kill. Press R or tap the weapon panel to reload, and press again in the white zone for an active reload.',
    accent: '#5fd0ff',
    load: () => import('../gears-of-war'),
  },
  {
    id: 'warhammer-ultramarines',
    category: 'games',
    title: 'Ultramarines',
    caption: 'An Ultramarines Captain and his battle brothers hold a ruined cathedral nave against a Tyranid swarm.',
    hint: 'Click or tap a Tyranid to focus bolter fire on it, or press Space or Enter to hit the nearest one. Hold to rev the chainsword and charge. Press B for a battle cry volley and O to call an orbital strike, or tap the two buttons at the top left.',
    accent: '#3f7bff',
    load: () => import('../warhammer-ultramarines'),
  },
  {
    id: 'zelda',
    category: 'games',
    title: 'Link and the Master Sword',
    caption: 'A clearing in the Lost Woods, a blade in the stone and a hero working up the nerve.',
    hint: 'Hold the pointer, Space or Enter to pull the sword. Let go once it is free to raise it. Tap again to spin.',
    accent: '#7fe07a',
    load: () => import('../zelda'),
  },
];
