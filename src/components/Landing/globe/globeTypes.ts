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

export type { GlobeLocation } from './locations';
export { GLOBE_LOCATIONS } from './locations';

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

