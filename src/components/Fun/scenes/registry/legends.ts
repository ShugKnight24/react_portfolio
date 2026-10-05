import type { FunSceneMeta } from '../types';

// Signature moves of the Sports Legends, shown as their own group under that section
export const legendsScenes: FunSceneMeta[] = [
  {
    id: 'legend-jordan',
    category: 'legends',
    title: 'Jordan: Free Throw Line',
    caption: 'The takeoff from the free-throw line: legs split, ball cocked high, gliding all the way to the rim.',
    hint: 'Hold the pointer, Space or Enter to gather and sprint. Let go as he reaches the free-throw line to take off from it and glide in; early or late is a regular dunk.',
    accent: '#e8233f',
    load: () => import('../legend-jordan'),
  },
  {
    id: 'legend-ovechkin',
    category: 'legends',
    title: 'Ovechkin: The Office',
    caption: 'Power play, left faceoff circle: the pass comes across and the one-timer beats the goalie high.',
    hint: 'Hold the pointer, Space or Enter to call for the pass and load the stick. Let go as the ring closes on the blade to one-time it. Early goes wide, late hits the goalie.',
    accent: '#c8102e',
    load: () => import('../legend-ovechkin'),
  },
  {
    id: 'legend-arnold',
    category: 'legends',
    title: 'Arnold: The Pump',
    caption: 'Strict alternating curls in a 1970s Venice gym, the arms filling up rep by rep in the mirror.',
    hint: 'Click, tap, Space or Enter for a rep. Fill the pump meter and he turns to hit a front double biceps for the cameras.',
    accent: '#f0b04a',
    load: () => import('../legend-arnold'),
  },
  {
    id: 'legend-bpak',
    category: 'legends',
    title: 'Pakulski: Leg Day',
    caption: 'A heavy squat done his way: a slow, controlled descent below parallel, then a hard drive out of the hole.',
    hint: 'Hold the pointer, Space or Enter to sink slowly. Let go once you are below parallel to drive up. Deep, controlled reps grow the quad sweep.',
    accent: '#5fb4ff',
    load: () => import('../legend-bpak'),
  },
  {
    id: 'legend-kobe',
    category: 'legends',
    title: 'Kobe: The Elbow',
    caption: 'Jab, pump fake, spin and the fadeaway from the elbow, with the clock running out.',
    hint: 'Click, tap, Space or Enter to start the move. Press again at the top of the jump, when the meter hits the gold, to let it go. Swishes in a row build a streak.',
    accent: '#fdb927',
    load: () => import('../legend-kobe'),
  },
];
