import * as THREE from 'three';

export interface GlobeTheme {
  name: string;
  globeColor: number;
  accent: number;
}

export interface GlobeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  globeGroup: THREE.Group;
  universeGroup: THREE.Group;
  t: GlobeTheme;
  isMobile: boolean;
  reducedMotion: boolean;
  suppressAutoRotate: boolean;
}

export interface GlobeModule {
  update: (time: number) => void;
  destroy?: () => void;
  updateColors?: (theme: GlobeTheme) => void;
  [key: string]: any;
}

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

export function latLonToVec3(lat: number, lon: number, radius: number, THREE_LIB?: any): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const V3 = THREE_LIB?.Vector3 || THREE.Vector3;
  return new V3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export function sphericalToVec3(theta: number, phi: number, radius: number, THREE_LIB?: any): THREE.Vector3 {
  const V3 = THREE_LIB?.Vector3 || THREE.Vector3;
  return new V3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

