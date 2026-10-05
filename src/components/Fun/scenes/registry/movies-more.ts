import type { FunSceneMeta } from '../types';

// Owned by one lane; add entries like: { id, category, title, caption, hint, accent, load: () => import('../<id>') }
export const moviesMoreScenes: FunSceneMeta[] = [
  {
    id: 'interstellar',
    category: 'movies',
    title: 'No Time for Caution',
    caption:
      'The Endurance tumbles over an ice planet with Gargantua glowing behind it, and the Ranger has to match its spin to dock.',
    hint: 'Hold the pointer, Space or Enter to spin the Ranger up. Let go when the station looks still and the needle sits in the band to dock. Miss and the thrusters bleed the spin off for another try. Unmute to hear the organ.',
    accent: '#ffb35c',
    load: () => import('../interstellar'),
  },
  {
    id: 'inception',
    category: 'movies',
    title: 'Dream Within a Dream',
    caption:
      'A Paris street folds up over itself while the café blows apart in slow motion, then the kicks drop you down through rain, a turning hotel corridor, a snow fortress and limbo.',
    hint: 'Hold or drag up to fold the city (drag down to unfold); in the hotel, hold or drag sideways to turn the corridor, at the fortress hold to blow the charges, and in limbo hold to bring the towers down. Tap, Space or Enter is the kick: it drops you a level, and out of limbo it wakes you. B also holds. Watch the top. Unmute for the horn.',
    accent: '#c9a46a',
    load: () => import('../inception'),
  },
  {
    id: 'rick-and-morty',
    category: 'movies',
    title: 'Portal Gun',
    caption:
      'Rick and Morty in the garage, opening portals onto other dimensions and catching whatever falls out.',
    hint: 'Click or tap anywhere to fire the portal gun and open a portal there. Drag a portal to move it; things that drop into one come out of the next. Click Morty or Rick for a reaction. Space or Enter fires at random.',
    accent: '#7cff5a',
    load: () => import('../rick-and-morty'),
  },
  {
    id: 'spider-verse',
    category: 'movies',
    title: 'Leap of Faith',
    caption:
      'Miles Morales falls head first past Brooklyn towers at night, printed like a comic book page.',
    hint: 'Move the pointer, or use A and D, to steer the fall. Tap, click, Space or Enter to shoot a web, swing in and kick through a window. Unmute for the beat.',
    accent: '#ff3e5a',
    load: () => import('../spider-verse'),
  },
  {
    id: 'silicon-valley',
    category: 'movies',
    title: 'Middle Out',
    caption:
      'At the hacker house, data blocks get squeezed from the middle out while the score dial chases a new record.',
    hint: 'Drag blocks from the crate into the glass chamber, or press Enter to load one. Hold the pointer or Space to compress. Beat the gold flag on the dial to set a record.',
    accent: '#2e9e57',
    load: () => import('../silicon-valley'),
  },
  {
    id: 'hacker-hostel',
    category: 'movies',
    title: 'Hacker Hostel',
    caption:
      'Three a.m. at the incubator house: five developers, a whiteboard, a blinking server rack and a lot of pizza, chasing one idea.',
    hint: 'Hold the pointer, Space or Enter to hack. Code scrolls, the whiteboard fills and the compression score climbs. Halfway up the team pivots; fill the meter for the breakthrough. Unmute for the keyboards.',
    accent: '#5dffa8',
    load: () => import('../hacker-hostel'),
  },
];
