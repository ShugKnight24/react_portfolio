/**
 * Building definitions for the 3D Detroit skyline scene.
 * Based on the actual Detroit skyline as seen from Windsor / Detroit River.
 *
 * Key landmarks (left to right as viewed from south):
 * - Ambassador Bridge (far west)
 * - Michigan Central Station (Corktown area)
 * - One Detroit Center / Comerica Tower (trapezoid top, 619ft)
 * - Penobscot Building (art deco, 565ft)
 * - Ally Detroit Center (cylindrical, 619ft)
 * - Guardian Building (ornate, 496ft)
 * - RenCen (5 towers, tallest 727ft)
 * - 150 W Jefferson
 * - One Woodward Avenue
 *
 * Heights are proportional to real heights.
 * RenCen main = 30 units ≈ 727ft, so 1 unit ≈ 24ft
 */

export interface BuildingSetback {
  h: number;
  scale: number;
}

export interface BuildingDef {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'rencen' | 'warm' | 'glass' | 'bg';
  shape?: 'cylinder';
  setback?: BuildingSetback[];
}

export const BUILDING_DEFS: BuildingDef[] = [
  // ══════════════════════════════════════════════════════════
  //  RENAISSANCE CENTER (RenCen) — 5 interconnected towers
  //  Marriott tower (center, tallest) + 4 surrounding towers
  // ══════════════════════════════════════════════════════════
  { x: 0, z: 0, w: 4.0, d: 4.0, h: 30, type: 'rencen', shape: 'cylinder' }, // Marriott (727ft)
  { x: 5.5, z: 1, w: 2.8, d: 2.8, h: 20, type: 'rencen', shape: 'cylinder' }, // Tower 200
  { x: -5.5, z: 1, w: 2.8, d: 2.8, h: 20, type: 'rencen', shape: 'cylinder' }, // Tower 300
  { x: 3, z: -5, w: 2.8, d: 2.8, h: 20, type: 'rencen', shape: 'cylinder' }, // Tower 400
  { x: -3, z: -5, w: 2.8, d: 2.8, h: 20, type: 'rencen', shape: 'cylinder' }, // Tower 500
  // RenCen connecting podium (low wide base)
  { x: 0, z: -2, w: 14, d: 8, h: 4, type: 'rencen' },

  // ══════════════════════════════════════════════════════════
  //  WEST OF RENCEN — Major downtown towers
  // ══════════════════════════════════════════════════════════

  // One Detroit Center (Comerica Tower) — angular glass, 619ft
  {
    x: -14,
    z: -3,
    w: 3.5,
    d: 3,
    h: 26,
    type: 'glass',
    setback: [
      { h: 22, scale: 0.85 },
      { h: 4, scale: 0.65 },
    ],
  },

  // Penobscot Building — art deco stepped tower, 565ft
  {
    x: -18,
    z: -2,
    w: 3.0,
    d: 2.8,
    h: 24,
    type: 'warm',
    setback: [
      { h: 18, scale: 0.78 },
      { h: 6, scale: 0.55 },
    ],
  },

  // Ally Detroit Center (One Kennedy Square) — modern glass, 475ft
  { x: -10, z: -1, w: 3.2, d: 2.5, h: 20, type: 'glass' },

  // Guardian Building — ornate art deco, 496ft
  {
    x: -22,
    z: -1,
    w: 3.0,
    d: 2.5,
    h: 21,
    type: 'warm',
    setback: [{ h: 15, scale: 0.82 }],
  },

  // 150 West Jefferson — modern glass tower
  { x: 8, z: -2, w: 3.0, d: 2.5, h: 18, type: 'glass' },

  // One Woodward Avenue — cylindrical
  { x: -9, z: -6, w: 2.8, d: 2.8, h: 16, type: 'glass', shape: 'cylinder' },

  // Buhl Building
  {
    x: -15,
    z: -6,
    w: 2.5,
    d: 2.0,
    h: 14,
    type: 'warm',
    setback: [{ h: 10, scale: 0.8 }],
  },

  // Compuware (now Bedrock) — wide modern
  { x: -6, z: -4, w: 4.5, d: 3, h: 12, type: 'glass' },

  // ══════════════════════════════════════════════════════════
  //  EAST OF RENCEN
  // ══════════════════════════════════════════════════════════
  { x: 14, z: -2, w: 3.0, d: 2.5, h: 14, type: 'glass' },
  { x: 18, z: -1, w: 2.5, d: 2.0, h: 10, type: 'warm' },
  {
    x: 22,
    z: -3,
    w: 3.5,
    d: 2.8,
    h: 16,
    type: 'glass',
    setback: [{ h: 12, scale: 0.8 }],
  },
  { x: 26, z: 0, w: 2.5, d: 2.0, h: 8, type: 'warm' },
  { x: 30, z: -1, w: 3.0, d: 2.2, h: 11, type: 'warm' },

  // ══════════════════════════════════════════════════════════
  //  FAR WEST — tapering to suburbs/Corktown
  // ══════════════════════════════════════════════════════════
  { x: -26, z: 0, w: 2.8, d: 2.2, h: 10, type: 'warm' },
  { x: -30, z: 1, w: 3.0, d: 2.5, h: 8, type: 'warm' },
  { x: -34, z: 0, w: 2.5, d: 2.0, h: 6, type: 'warm' },
  { x: -38, z: -1, w: 3.0, d: 2.2, h: 5, type: 'warm' },
  { x: -43, z: 0, w: 2.5, d: 2.0, h: 4, type: 'warm' },
  { x: -48, z: 1, w: 3.0, d: 2.0, h: 3, type: 'warm' },

  // Far east tapering
  { x: 34, z: 0, w: 2.5, d: 2.0, h: 7, type: 'warm' },
  { x: 38, z: -1, w: 3.0, d: 2.2, h: 5, type: 'warm' },
  { x: 42, z: 0, w: 2.5, d: 2.0, h: 4, type: 'warm' },
  { x: 46, z: 1, w: 2.5, d: 2.0, h: 3, type: 'warm' },

  // ══════════════════════════════════════════════════════════
  //  BACKGROUND BUILDINGS — second and third rows for depth
  // ══════════════════════════════════════════════════════════
  // Second row
  { x: -4, z: -9, w: 4.0, d: 3.0, h: 10, type: 'bg' },
  { x: 6, z: -9, w: 3.5, d: 2.5, h: 8, type: 'bg' },
  { x: -12, z: -9, w: 3.5, d: 2.5, h: 7, type: 'bg' },
  { x: 14, z: -8, w: 3.0, d: 2.5, h: 7, type: 'bg' },
  { x: -20, z: -7, w: 4.0, d: 3.0, h: 8, type: 'bg' },
  { x: 22, z: -8, w: 4.0, d: 3.0, h: 6, type: 'bg' },
  { x: -28, z: -6, w: 3.5, d: 2.5, h: 5, type: 'bg' },
  { x: 28, z: -7, w: 3.5, d: 2.5, h: 5, type: 'bg' },

  // Third row (deep background — skyline filler)
  { x: -1, z: -15, w: 5.0, d: 3.5, h: 12, type: 'bg' },
  { x: 8, z: -14, w: 4.5, d: 3.0, h: 9, type: 'bg' },
  { x: -8, z: -13, w: 4.0, d: 3.0, h: 7, type: 'bg' },
  { x: 16, z: -13, w: 4.0, d: 3.0, h: 8, type: 'bg' },
  { x: -16, z: -12, w: 3.5, d: 2.5, h: 6, type: 'bg' },
  { x: 24, z: -12, w: 3.5, d: 2.5, h: 5, type: 'bg' },
  { x: -24, z: -11, w: 3.0, d: 2.5, h: 4, type: 'bg' },
  { x: 32, z: -11, w: 3.0, d: 2.5, h: 4, type: 'bg' },
];

// ══════════════════════════════════════════════════════════
//  RIVER CHANNEL + WINDSOR, ONTARIO
//  West of downtown the river bends away between the Detroit
//  (east) bank and the Windsor (west) bank. Both bridges cross
//  this channel; Windsor fills the far left of the scene.
// ══════════════════════════════════════════════════════════

export const CHANNEL_FRONT_Z = 8;
export const CHANNEL_BACK_Z = -88;
export const RIVERFRONT_Z = 12;

/** Windsor shoreline x at depth z (channel widens as it recedes). */
export function windsorBankX(z: number): number {
  return -102 - Math.max(0, -z) * 0.75;
}

/** Detroit (Delray / Mexicantown) shoreline x at depth z. */
export function detroitBankX(z: number): number {
  return -62 - Math.max(0, -20 - z) * 0.5;
}

export interface WindsorDef {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tone: 'glass' | 'warm' | 'low' | 'delray';
}

export const CAESARS = { x: -133, z: -3, w: 4.5, d: 3.2, h: 13 };

export const WINDSOR_DEFS: WindsorDef[] = [
  // Caesars Windsor: Augustus Tower (tallest on the Windsor riverfront) + Forum Tower
  { ...CAESARS, tone: 'glass' },
  { x: -139.5, z: -6.5, w: 3.5, d: 3, h: 10, tone: 'warm' },

  // Riverfront row facing Detroit, kept low near the Ambassador landing
  { x: -108, z: 3, w: 3, d: 2.5, h: 3, tone: 'low' },
  { x: -114, z: 1, w: 3.5, d: 3, h: 4, tone: 'warm' },
  { x: -121, z: 3, w: 3, d: 2.5, h: 3.5, tone: 'low' },
  { x: -128, z: 1, w: 3, d: 2.5, h: 5, tone: 'warm' },
  { x: -154, z: 2, w: 3, d: 2.5, h: 7, tone: 'warm' },
  { x: -160, z: -1, w: 3.5, d: 3, h: 9, tone: 'glass' },
  { x: -167, z: 2, w: 3, d: 2.5, h: 6, tone: 'low' },
  { x: -174, z: 0, w: 3.5, d: 3, h: 10, tone: 'glass' },
  { x: -181, z: 3, w: 3, d: 2.5, h: 5, tone: 'warm' },
  { x: -188, z: -1, w: 4, d: 3, h: 8, tone: 'glass' },
  { x: -196, z: 2, w: 3, d: 2.5, h: 6, tone: 'warm' },
  { x: -204, z: 0, w: 3.5, d: 3, h: 7, tone: 'low' },
  { x: -212, z: 2, w: 3, d: 2.5, h: 4, tone: 'warm' },
  { x: -222, z: 0, w: 3.5, d: 3, h: 5, tone: 'low' },
  { x: -232, z: 2, w: 3, d: 2.5, h: 3, tone: 'warm' },

  // Second row
  { x: -118, z: -7, w: 3, d: 2.5, h: 4, tone: 'low' },
  { x: -126, z: -8, w: 3, d: 2.5, h: 3, tone: 'warm' },
  { x: -156, z: -8, w: 4, d: 3, h: 5, tone: 'low' },
  { x: -166, z: -9, w: 3.5, d: 3, h: 6, tone: 'warm' },
  { x: -180, z: -8, w: 4, d: 3, h: 5, tone: 'low' },
  { x: -194, z: -9, w: 3.5, d: 3, h: 6, tone: 'glass' },
  { x: -210, z: -7, w: 4, d: 3, h: 4, tone: 'warm' },

  // Behind the Ambassador Bridge along the Windsor bank (Sandwich / west end)
  { x: -126, z: -22, w: 3.5, d: 3, h: 5, tone: 'warm' },
  { x: -134, z: -26, w: 3, d: 3, h: 4, tone: 'low' },
  { x: -142, z: -21, w: 4, d: 3, h: 6, tone: 'glass' },
  { x: -152, z: -25, w: 3.5, d: 3, h: 7, tone: 'glass' },
  { x: -162, z: -22, w: 3, d: 3, h: 5, tone: 'warm' },
  { x: -174, z: -26, w: 4, d: 3, h: 6, tone: 'low' },
  { x: -188, z: -22, w: 3.5, d: 3, h: 4, tone: 'warm' },
  { x: -200, z: -27, w: 4, d: 3, h: 5, tone: 'low' },
  { x: -134, z: -36, w: 3, d: 3, h: 3, tone: 'low' },
  { x: -144, z: -40, w: 3.5, d: 3, h: 4, tone: 'warm' },
  { x: -156, z: -34, w: 3, d: 3, h: 5, tone: 'low' },
  { x: -168, z: -42, w: 4, d: 3, h: 3, tone: 'warm' },
  { x: -182, z: -36, w: 3.5, d: 3, h: 4, tone: 'low' },
  { x: -196, z: -44, w: 3, d: 3, h: 3, tone: 'warm' },
  { x: -148, z: -52, w: 3, d: 3, h: 3, tone: 'low' },
  { x: -162, z: -53, w: 3.5, d: 3, h: 4, tone: 'warm' },

  // Around the Windsor landing of the Gordie Howe Bridge (Ojibway / west Windsor)
  { x: -176, z: -64, w: 3.5, d: 3, h: 4, tone: 'low' },
  { x: -186, z: -70, w: 4, d: 3, h: 3, tone: 'warm' },
  { x: -198, z: -63, w: 3, d: 3, h: 5, tone: 'low' },
  { x: -212, z: -69, w: 4, d: 3, h: 3, tone: 'warm' },
  { x: -226, z: -64, w: 3.5, d: 3, h: 4, tone: 'low' },
  { x: -206, z: -86, w: 4, d: 2.5, h: 3, tone: 'low' },

  // Detroit side of the channel: Delray / Mexicantown low-rise and industry
  { x: -58, z: -26, w: 3, d: 3, h: 3, tone: 'delray' },
  { x: -52, z: -34, w: 4, d: 3, h: 4, tone: 'delray' },
  { x: -68, z: -40, w: 3, d: 3, h: 3, tone: 'delray' },
  { x: -60, z: -46, w: 4, d: 3, h: 5, tone: 'delray' },
  { x: -48, z: -42, w: 3.5, d: 3, h: 3, tone: 'delray' },
  { x: -76, z: -53, w: 3, d: 3, h: 3, tone: 'delray' },
  { x: -64, z: -55, w: 4, d: 3, h: 4, tone: 'delray' },
  { x: -52, z: -52, w: 3, d: 3, h: 3, tone: 'delray' },
  { x: -80, z: -66, w: 3, d: 3, h: 3, tone: 'delray' },
  { x: -70, z: -70, w: 4, d: 3, h: 4, tone: 'delray' },
  { x: -58, z: -64, w: 3.5, d: 3, h: 3, tone: 'delray' },
  { x: -46, z: -70, w: 4, d: 3, h: 5, tone: 'delray' },
  { x: -38, z: -62, w: 3, d: 3, h: 3, tone: 'delray' },
];
