import * as THREE from 'three';
import { GlobeContext, GlobeModule, GlobeTheme } from './globeTypes';
import {
  createComets,
  createConstellations,
  createGalaxies,
  createPlanets,
  createSatellites,
  createShootingStars,
  createShuttle,
  createStarfield,
} from './modules/cosmosModules';
import { createEarth } from './modules/earthModule';
import { createFlight } from './modules/flightModule';
import { createLuna } from './modules/lunaModule';
import { createInteraction, InteractionController } from './modules/interactionModule';

export interface GlobeController {
  focusLocation: (lat: number, lon: number, onComplete?: () => void) => void;
  toggleAutoRotate: () => boolean;
  getAutoRotate: () => boolean;
  toggleLabels: () => boolean;
  getLabelsVisible: () => boolean;
  toggleUniverseMode: () => boolean;
  getUniverseMode: () => boolean;
  updateTheme: (theme: GlobeTheme) => void;
  destroy: () => void;
}

const DEFAULT_THEME: GlobeTheme = {
  name: 'default',
  globeColor: 0x4488cc,
  accent: 0x00d4aa,
};

export function initGlobeOrchestrator(container: HTMLElement): GlobeController {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Renderer
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.warn('WebGL unavailable, providing safe fallback controller:', err);
    return {
      focusLocation: () => {},
      toggleAutoRotate: () => false,
      getAutoRotate: () => false,
      toggleLabels: () => false,
      getLabelsVisible: () => false,
      toggleUniverseMode: () => false,
      getUniverseMode: () => false,
      updateTheme: () => {},
      destroy: () => {},
    };
  }

  renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
  renderer.setClearColor(0x020208, 1);
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  // 2. Scene + Camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 120);
  camera.position.set(0, 0, 4);

  // 3. Hierarchical Root Groups
  const globeGroup = new THREE.Group();
  // Matrix = Rx * Ry: spin about the Earth's own axis (longitude) first, then tilt
  // about the screen's horizontal axis (latitude). This is the order that
  // globeRotationForLatLon() solves for, so any lat/lon lands dead center.
  globeGroup.rotation.order = 'XYZ';
  scene.add(globeGroup);

  const universeGroup = new THREE.Group();
  scene.add(universeGroup);

  // 4. Shared context
  const ctx: GlobeContext = {
    scene,
    camera,
    renderer,
    canvas,
    globeGroup,
    universeGroup,
    t: { ...DEFAULT_THEME },
    isMobile,
    reducedMotion,
    suppressAutoRotate: false,
  };

  // 5. Responsive Resize
  function handleResize() {
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 1 ? 3.7 / camera.aspect : 3.7;
    camera.updateProjectionMatrix();
  }
  handleResize();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);
  }
  window.addEventListener('resize', handleResize);

  // 6. Submodules
  const earth = createEarth(ctx);
  const starfield = createStarfield(ctx);
  const constellations = createConstellations(ctx);
  const planets = createPlanets(ctx);
  const shuttle = createShuttle(ctx);
  const satellites = createSatellites(ctx);
  const shootingStars = createShootingStars(ctx);
  const comets = createComets(ctx);
  const galaxies = createGalaxies(ctx);
  const luna = createLuna(ctx);
  const flight = createFlight(ctx);

  const interaction: InteractionController = createInteraction(ctx, {
    constellations,
    planets,
  });

  const allModules: GlobeModule[] = [
    earth,
    starfield,
    constellations,
    planets,
    shuttle,
    satellites,
    shootingStars,
    comets,
    galaxies,
    luna,
    flight,
    interaction,
  ];

  // 7. Animation Loop
  let animId = 0;
  let running = true;
  let isVisible = true;

  function animate(time: number) {
    if (!running) return;
    animId = requestAnimationFrame(animate);
    if (!isVisible) return;

    for (let i = 0; i < allModules.length; i++) {
      allModules[i].update(time);
    }
    renderer.render(scene, camera);
  }
  animId = requestAnimationFrame(animate);

  // 8. Intersection Observer to save GPU when offscreen
  let intersectionObserver: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    intersectionObserver.observe(container);
  }

  return {
    focusLocation(lat: number, lon: number, onComplete?: () => void) {
      interaction.focusLocation(lat, lon, onComplete);
    },
    toggleAutoRotate() {
      const next = !interaction.getAutoRotate();
      interaction.setAutoRotate(next);
      return next;
    },
    getAutoRotate() {
      return interaction.getAutoRotate();
    },
    toggleLabels() {
      const next = !interaction.getLabelsVisible();
      interaction.setLabelsVisible(next);
      return next;
    },
    getLabelsVisible() {
      return interaction.getLabelsVisible();
    },
    toggleUniverseMode() {
      const next = !interaction.getUniverseMode();
      interaction.setUniverseMode(next);
      return next;
    },
    getUniverseMode() {
      return interaction.getUniverseMode();
    },
    updateTheme(theme: GlobeTheme) {
      ctx.t = theme;
      allModules.forEach((m) => m.updateColors?.(theme));
    },
    destroy() {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();

      // Catch-all first (modules detach their groups in destroy): free every
      // geometry, material and map still in the scene graph. Double dispose is a no-op.
      const disposeMaterial = (mat: any) => {
        if (!mat) return;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      };
      scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
        else disposeMaterial(obj.material);
      });
      allModules.forEach((m) => m.destroy?.());
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
