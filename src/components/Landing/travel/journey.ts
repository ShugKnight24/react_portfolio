import { Photo, photosBy } from '../../../data/photos';

export type LandmarkId = 'bridge' | 'needle' | 'peak' | 'falls' | 'beach' | 'tower' | 'skyline';

/**
 * How the world looks while a stop is in front of the camera. Every value is a 0 to 1
 * amount that the stage blends between neighbouring stops, so weather and time of day
 * roll over gradually instead of switching.
 */
export type Mood = {
  /** Time of day: 0 is mid afternoon, 1 is full night */
  tod: number;
  /** Overcast: dims the sun and thickens the clouds */
  cloud: number;
  /** Warm light along the horizon */
  glow: number;
  /** Open water under the landmark */
  water: number;
  /** Rolling hills in the mid ground */
  hills: number;
  /** The far ridge line */
  ridge: number;
  /** Fog bank or waterfall mist in front of the landmark */
  fog: number;
  /** City light bouncing off the low sky */
  city: number;
  stars: number;
};

export type Chapter = {
  id: string;
  title: string;
  blurb: string;
  landmark: LandmarkId;
  mood: Mood;
  photoIds: string[];
};

export type ChapterWithPhotos = Omit<Chapter, 'photoIds'> & { photos: Photo[] };

// Ordered so one trip runs from a foggy afternoon, up the coast into the clouds and on to a
// city lit up at night
const chapters: Chapter[] = [
  {
    id: 'the-bay',
    title: 'The Bay',
    blurb:
      'Fog that clocks in every afternoon, wind that never clocks out and a bridge that is way more orange in person.',
    landmark: 'bridge',
    mood: { tod: 0.1, cloud: 0.3, glow: 0.4, water: 1, hills: 0, ridge: 1, fog: 1, city: 0, stars: 0 },
    photoIds: [
      'golden-gate-from-below',
      'golden-gate-boat-wake',
      'bay-afternoon-glare',
      'golden-gate-headlands',
    ],
  },
  {
    id: 'seattle',
    title: 'Seattle',
    blurb:
      'Came for the Space Needle, stayed for the water. It did not rain once and nobody back home believes me.',
    landmark: 'needle',
    mood: { tod: 0.17, cloud: 0.45, glow: 0.3, water: 1, hills: 0.3, ridge: 1, fog: 0.2, city: 0.1, stars: 0 },
    photoIds: ['space-needle-from-the-sound', 'puget-sound-shoreline', 'open-water-sunset'],
  },
  {
    id: 'the-cascades',
    title: 'The Cascades',
    blurb:
      'A snowy mountain that photobombed every single shot and waterfalls that soak anyone who gets too close for a photo. So, me.',
    landmark: 'peak',
    mood: { tod: 0.24, cloud: 0.75, glow: 0.15, water: 0, hills: 1, ridge: 1, fog: 0.55, city: 0, stars: 0 },
    photoIds: [
      'mount-rainier',
      'big-waterfall',
      'christine-falls-bridge',
      'snoqualmie-falls-from-below',
      'mountain-over-the-port',
    ],
  },
  {
    id: 'the-gorge',
    title: 'The Gorge',
    blurb:
      'Waterfalls loud enough to drown out Slack, pines for days and a koi pond in Portland that is calmer than I will ever be.',
    landmark: 'falls',
    mood: { tod: 0.32, cloud: 1, glow: 0.1, water: 0, hills: 1, ridge: 1, fog: 0.9, city: 0, stars: 0 },
    photoIds: [
      'multnomah-falls',
      'river-gorge-pines',
      'tall-waterfall',
      'river-gorge-overlook',
      'japanese-garden-koi',
      'mount-shasta-road-trip',
    ],
  },
  {
    id: 'miami',
    title: 'Miami',
    blurb:
      'Beach mornings, mural afternoons and a skyline that stays up way past my bedtime. Plus a yellow Rolls that coordinated with the curb.',
    landmark: 'beach',
    mood: { tod: 0.55, cloud: 0.25, glow: 1, water: 1, hills: 0, ridge: 0.3, fog: 0, city: 0, stars: 0.15 },
    photoIds: [
      'beach-from-balcony',
      'dream-mural',
      'beach-day',
      'jaguar-mural',
      'yellow-rolls-royce',
      'fearless-gallery-wall',
      'moonrise-over-water',
      'miami-skyline-at-night',
    ],
  },
  {
    id: 'pittsburgh',
    title: 'Pittsburgh',
    blurb:
      'A 42 story gothic tower that is somehow just classrooms. I would have shown up to way more lectures here.',
    landmark: 'tower',
    mood: { tod: 0.76, cloud: 0.15, glow: 0.55, water: 0, hills: 1, ridge: 1, fog: 0.1, city: 0.45, stars: 0.55 },
    photoIds: ['cathedral-of-learning', 'cathedral-looking-up', 'gothic-fountain'],
  },
  {
    id: 'new-york',
    title: 'New York',
    blurb:
      'Waved at Lady Liberty, looked up until my neck quit, then went to the top and looked down. The Chrysler still wins.',
    landmark: 'skyline',
    mood: { tod: 0.95, cloud: 0.1, glow: 0.3, water: 1, hills: 0, ridge: 0.25, fog: 0, city: 1, stars: 1 },
    photoIds: [
      'lower-manhattan-from-water',
      'statue-of-liberty',
      'one-world-trade',
      'chrysler-building-from-above',
      'manhattan-sunset',
      'manhattan-at-night',
    ],
  },
];

export const getJourney = (): ChapterWithPhotos[] => {
  const travel = photosBy('travel');
  const byId = new Map(travel.map((photo) => [photo.id, photo]));
  const used = new Set<string>();
  const journey = chapters
    .map(({ photoIds, ...chapter }) => {
      const list = photoIds
        .map((id) => byId.get(id))
        .filter((photo): photo is Photo => !!photo && photo.kind !== 'video');
      list.forEach((photo) => used.add(photo.id));
      return { ...chapter, photos: list };
    })
    .filter((chapter) => chapter.photos.length > 0);

  // New travel photos that are not placed yet ride along in the last stop
  const extras = travel.filter((photo) => !used.has(photo.id) && photo.kind !== 'video');
  if (extras.length && journey.length) journey[journey.length - 1].photos.push(...extras);
  return journey;
};

// Small deterministic PRNG so the scenery is identical on every render
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const clamp = (v: number, min = 0, max = 1) => (v < min ? min : v > max ? max : v);
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * How pinned scroll turns into camera travel: a short hold, a ramp where the camera
 * speeds up from rest, a steady cruise, a ramp back down to rest and a final hold.
 * Position and speed are both continuous, so nothing lurches at either end.
 */
export type Glide = {
  holdIn: number;
  rampIn: number;
  cruise: number;
  rampOut: number;
  holdOut: number;
  /** Camera px per scroll px while cruising */
  k: number;
  camMax: number;
  /** Pinned scroll length in px */
  total: number;
};

export const makeGlide = (camMax: number, k: number, vh: number): Glide => {
  let rampIn = vh * 1.0;
  let rampOut = vh * 1.0;
  const eased = (k * (rampIn + rampOut)) / 2;
  if (eased > camMax) {
    rampIn *= camMax / eased;
    rampOut *= camMax / eased;
  }
  const holdIn = vh * 0.14;
  const holdOut = vh * 0.22;
  const cruise = Math.max(0, camMax / k - (rampIn + rampOut) / 2);
  return {
    holdIn,
    rampIn,
    cruise,
    rampOut,
    holdOut,
    k,
    camMax,
    total: holdIn + rampIn + cruise + rampOut + holdOut,
  };
};

/** Camera position for a scroll distance past the pin */
export const glideAt = (g: Glide, s: number) => {
  let t = s - g.holdIn;
  if (t <= 0) return 0;
  if (t < g.rampIn) return (g.k * t * t) / (2 * g.rampIn);
  let cam = (g.k * g.rampIn) / 2;
  t -= g.rampIn;
  if (t < g.cruise) return cam + g.k * t;
  cam += g.k * g.cruise;
  t -= g.cruise;
  if (t < g.rampOut) return Math.min(g.camMax, cam + g.k * (t - (t * t) / (2 * g.rampOut)));
  return g.camMax;
};

/**
 * Offset that lets a plane coast to rest as its frame pins (or ease away as it unpins).
 * u is how far the frame still has to travel, as a fraction of its height. Beyond `reach`
 * the plane rides with the page; inside it, it slows evenly to a stop at u = 0, so its
 * speed never steps. Smaller reach reads as nearer: it keeps pace longer, then brakes.
 */
export const settle = (u: number, reach = 1) =>
  u < reach ? u - (u * u) / (2 * reach) : reach / 2;

/**
 * Blend a per stop value along the trip. `stops` are the camera progress (0 to 1) at
 * which each stop is centred; between two stops the value eases from one to the next.
 */
export const along = (p: number, stops: number[], values: number[]) => {
  const n = stops.length;
  if (!n) return 0;
  if (p <= stops[0]) return values[0];
  for (let i = 1; i < n; i++) {
    if (p < stops[i]) {
      const t = smooth((p - stops[i - 1]) / (stops[i] - stops[i - 1] || 1));
      return values[i - 1] + (values[i] - values[i - 1]) * t;
    }
  }
  return values[n - 1];
};

/** Rise from 0 to 1 between a and b, fall back to 0 between c and d */
export const window4 = (p: number, a: number, b: number, c: number, d: number) =>
  smooth(clamp((p - a) / (b - a))) * (1 - smooth(clamp((p - c) / (d - c))));

// Per card collage placement: depth, vertical slot and tilt, cycled
export const CARD_PATTERN = [
  { d: 1.0, y: 0.47, r: -2.5, s: 1.0 },
  { d: 0.82, y: 0.3, r: 3, s: 0.84 },
  { d: 1.16, y: 0.63, r: -1, s: 1.08 },
  { d: 0.9, y: 0.36, r: 2, s: 0.92 },
  { d: 1.08, y: 0.58, r: -3, s: 1.0 },
  { d: 0.86, y: 0.4, r: 1.5, s: 0.88 },
];

// Narrow screens are portrait, so the collage spreads further up and down
export const CARD_PATTERN_NARROW = [
  { d: 1.0, y: 0.45, r: -2.5, s: 1.0 },
  { d: 0.84, y: 0.27, r: 3, s: 0.86 },
  { d: 1.14, y: 0.64, r: -1.5, s: 1.04 },
  { d: 0.9, y: 0.33, r: 2, s: 0.9 },
  { d: 1.06, y: 0.6, r: -3, s: 1.0 },
  { d: 0.88, y: 0.38, r: 1.5, s: 0.9 },
];
