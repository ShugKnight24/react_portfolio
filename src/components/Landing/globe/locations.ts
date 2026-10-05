// Plain data with no three.js import, so the HUD can render before the globe chunk loads
export interface GlobeLocation {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  color: string;
  glowColor: string;
  role: string;
  description: string;
}

export const GLOBE_LOCATIONS: GlobeLocation[] = [
  {
    id: 'detroit',
    name: 'Detroit, Michigan',
    region: 'North America',
    lat: 42.3314,
    lon: -83.0458,
    color: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.8)',
    role: 'HEADQUARTERS & BASE OF CRAFT',
    description: 'Motor City grit, relentless work ethic, industrial architecture, and the crucible where discipline is forged every single day.',
  },
  {
    id: 'baku',
    name: 'Baku & Caucasus',
    region: 'Eurasia / Caspian',
    lat: 40.4093,
    lon: 49.8671,
    color: '#38BDF8',
    glowColor: 'rgba(56, 189, 248, 0.8)',
    role: 'ANCESTRAL ROOTS & SILK ROAD HERITAGE',
    description: 'Centuries of storied culture, resilience, ancient stone towers, and the enduring ancestral bloodline connecting East and West.',
  },
];
