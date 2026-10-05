// Azerbaijan geographic data — border outline, city coordinates

// Main territory (~65 points, [lon, lat])
// Traced clockwise from the northwestern corner (Georgia border)
export const azerbaijanOutline = [
  // Northwestern border with Georgia
  [45.0, 41.3],
  [45.28, 41.45],
  [45.56, 41.52],
  [45.8, 41.4],
  [46.18, 41.25],
  [46.43, 41.1],

  // Northern border with Russia (Dagestan)
  [46.65, 41.35],
  [47.0, 41.45],
  [47.3, 41.55],
  [47.6, 41.58],
  [47.9, 41.6],
  [48.15, 41.6],
  [48.35, 41.58],
  [48.58, 41.62],
  [48.8, 41.6],

  // Northeast — Caspian coast heading south from Russia border
  [49.1, 41.55],
  [49.3, 41.42],
  [49.5, 41.3],
  [49.8, 41.1],
  [50.0, 40.95],
  [50.15, 40.75],
  [50.3, 40.55],

  // Absheron peninsula (Baku area)
  [50.4, 40.45],
  [50.55, 40.4],
  [50.6, 40.35],
  [50.5, 40.25],
  [50.35, 40.2],
  [50.2, 40.22],

  // Eastern Caspian coast south of Baku
  [50.1, 40.1],
  [50.0, 39.9],
  [49.9, 39.7],
  [49.8, 39.5],
  [49.6, 39.35],
  [49.4, 39.2],
  [49.2, 39.05],
  [49.05, 38.9],
  [48.9, 38.8],

  // Southern Caspian coast toward Iran border
  [48.7, 38.7],
  [48.55, 38.6],
  [48.4, 38.5],
  [48.3, 38.45],

  // Southern border with Iran
  [48.1, 38.45],
  [47.8, 38.55],
  [47.5, 38.65],
  [47.2, 38.7],
  [46.9, 38.8],
  [46.6, 38.9],
  [46.4, 38.95],
  [46.2, 39.0],

  // Western border with Armenia — complex terrain
  [46.0, 39.1],
  [45.8, 39.25],
  [45.6, 39.35],
  [45.45, 39.5],
  [45.4, 39.65],
  [45.55, 39.8],

  // Lachin corridor area — indented border with Armenia
  [45.6, 39.95],
  [45.55, 40.1],
  [45.5, 40.25],
  [45.4, 40.4],
  [45.3, 40.55],
  [45.2, 40.65],
  [45.15, 40.8],
  [45.1, 40.95],
  [45.05, 41.05],
  [45.0, 41.15],

  // Close the polygon — back to start
  [45.0, 41.3],
];

// Nakhchivan exclave (~18 points, [lon, lat])
// Separated from main Azerbaijan by Armenian territory
// Bordered by Armenia (north/east), Turkey (west), Iran (south)
export const nakhchivanOutline = [
  // Northern border with Armenia
  [44.98, 39.78],
  [45.15, 39.75],
  [45.35, 39.7],
  [45.55, 39.55],
  [45.7, 39.4],
  [45.85, 39.3],
  [46.0, 39.18],

  // Eastern/southeastern border with Iran
  [46.1, 39.05],
  [45.95, 38.95],
  [45.8, 38.88],
  [45.6, 38.85],

  // Southern border with Iran
  [45.4, 38.85],
  [45.2, 38.88],
  [45.0, 38.92],

  // Western border with Turkey and Armenia
  [44.82, 39.0],
  [44.78, 39.18],
  [44.8, 39.38],
  [44.85, 39.55],
  [44.9, 39.7],

  // Close the polygon
  [44.98, 39.78],
];

export const baku = { lat: 40.4093, lon: 49.8671 };
export const detroit = { lat: 42.3314, lon: -83.0458 };
