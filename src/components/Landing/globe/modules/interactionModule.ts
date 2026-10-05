import { GlobeContext, GlobeModule } from '../globeTypes';

export function globeRotationForLatLon(lat: number, lon: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const px = -Math.sin(phi) * Math.cos(theta);
  const py = Math.cos(phi);
  const pz = Math.sin(phi) * Math.sin(theta);
  const rxz = Math.sqrt(px * px + pz * pz);
  return {
    x: Math.atan2(py, rxz),
    y: -Math.atan2(px, pz),
  };
}

export interface InteractionController extends GlobeModule {
  setAutoRotate: (active: boolean) => void;
  getAutoRotate: () => boolean;
  setLabelsVisible: (visible: boolean) => void;
  getLabelsVisible: () => boolean;
  setUniverseMode: (mode: boolean) => void;
  getUniverseMode: () => boolean;
  focusLocation: (lat: number, lon: number, onComplete?: () => void) => void;
}

export function createInteraction(
  ctx: GlobeContext,
  modules: { constellations?: any; planets?: any } = {}
): InteractionController {
  const { canvas, globeGroup, universeGroup } = ctx;
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let isDragging = false;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let dragVelocityX = 0;
  let dragVelocityY = 0;
  let autoRotate = !reducedMotion;

  // Universe drag
  let universeMode = false;
  let draggingUniverse = false;
  let uniDragVelX = 0;
  let uniDragVelY = 0;
  let autoUniverseDrift = !reducedMotion;

  // Label visibility
  let labelsVisible = true;

  // Target transition state
  let isTransitioning = false;
  let targetRotX = 0;
  let targetRotY = 0;
  let transitionProgress = 1.0;
  let startRotX = 0;
  let startRotY = 0;
  const transitionDuration = 1200; // ms
  let transitionStartTime = 0;
  let onTransitionComplete: (() => void) | null = null;

  function syncLabelsVisible() {
    if (modules.constellations?.state) {
      modules.constellations.state.labelsVisible = labelsVisible;
    }
    if (modules.planets?.state) {
      modules.planets.state.labelsVisible = labelsVisible;
    }
  }

  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    isTransitioning = false;
    ctx.suppressAutoRotate = false;
    draggingUniverse = e.shiftKey || universeMode;
    if (draggingUniverse) {
      autoUniverseDrift = false;
    } else {
      autoRotate = false;
    }
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    dragVelocityX = 0;
    dragVelocityY = 0;
    uniDragVelX = 0;
    uniDragVelY = 0;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if unsupported
    }
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    const targetUniverse = e.shiftKey || universeMode;

    if (targetUniverse && universeGroup) {
      uniDragVelX = dx * 0.003;
      uniDragVelY = dy * 0.003;
      universeGroup.rotation.y += uniDragVelX;
      universeGroup.rotation.x += uniDragVelY;
    } else {
      dragVelocityX = dx * 0.005;
      dragVelocityY = dy * 0.005;
      globeGroup.rotation.y += dragVelocityX;
      globeGroup.rotation.x += dragVelocityY;
      globeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, globeGroup.rotation.x));
    }
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }

  function onPointerUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
    if (reducedMotion) {
      draggingUniverse = false;
      return;
    }
    if (draggingUniverse) {
      setTimeout(() => {
        autoUniverseDrift = true;
      }, 4000);
    } else {
      setTimeout(() => {
        autoRotate = true;
      }, 3000);
    }
    draggingUniverse = false;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.style.cursor = 'grab';

  function focusLocation(lat: number, lon: number, onComplete?: () => void) {
    const target = globeRotationForLatLon(lat, lon);
    startRotX = globeGroup.rotation.x;
    startRotY = globeGroup.rotation.y;

    // Normalize target angle relative to current rotation to prevent multiple spins
    let diffY = (target.y - startRotY) % (Math.PI * 2);
    if (diffY > Math.PI) diffY -= Math.PI * 2;
    if (diffY < -Math.PI) diffY += Math.PI * 2;

    targetRotX = Math.max(-1.2, Math.min(1.2, target.x));
    targetRotY = startRotY + diffY;

    isTransitioning = true;
    transitionProgress = 0;
    transitionStartTime = performance.now();
    ctx.suppressAutoRotate = true;
    onTransitionComplete = onComplete || null;
  }

  return {
    setAutoRotate(active: boolean) {
      autoRotate = active;
    },
    getAutoRotate() {
      return autoRotate;
    },
    setLabelsVisible(visible: boolean) {
      labelsVisible = visible;
      syncLabelsVisible();
    },
    getLabelsVisible() {
      return labelsVisible;
    },
    setUniverseMode(mode: boolean) {
      universeMode = mode;
    },
    getUniverseMode() {
      return universeMode;
    },
    focusLocation,
    update(time: number) {
      // Handle smooth camera/globe focus transition
      if (isTransitioning) {
        const elapsed = performance.now() - transitionStartTime;
        const rawProgress = Math.min(1.0, elapsed / transitionDuration);
        // Smooth power2 in-out ease
        const ease =
          rawProgress < 0.5
            ? 2 * rawProgress * rawProgress
            : -1 + (4 - 2 * rawProgress) * rawProgress;

        globeGroup.rotation.x = startRotX + (targetRotX - startRotX) * ease;
        globeGroup.rotation.y = startRotY + (targetRotY - startRotY) * ease;

        if (rawProgress >= 1.0) {
          isTransitioning = false;
          globeGroup.rotation.x = targetRotX;
          globeGroup.rotation.y = targetRotY;
          dragVelocityX = 0;
          dragVelocityY = 0;
          if (onTransitionComplete) {
            onTransitionComplete();
            onTransitionComplete = null;
          }
          setTimeout(() => {
            if (!isDragging && !isTransitioning) {
              ctx.suppressAutoRotate = false;
              autoRotate = true;
            }
          }, 4500);
        }
        return;
      }

      if (ctx.suppressAutoRotate) return;

      // Globe auto-rotation + inertia
      if (autoRotate && !isDragging) {
        globeGroup.rotation.y += 0.0015;
      } else if (!isDragging && (dragVelocityX !== 0 || dragVelocityY !== 0)) {
        globeGroup.rotation.y += dragVelocityX;
        globeGroup.rotation.x += dragVelocityY;
        globeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, globeGroup.rotation.x));
        dragVelocityX *= 0.95;
        dragVelocityY *= 0.95;
        if (Math.abs(dragVelocityX) < 0.0001) dragVelocityX = 0;
        if (Math.abs(dragVelocityY) < 0.0001) dragVelocityY = 0;
      }

      // Universe rotation inertia & drift
      if (universeGroup) {
        if (!isDragging && (uniDragVelX !== 0 || uniDragVelY !== 0)) {
          universeGroup.rotation.y += uniDragVelX;
          universeGroup.rotation.x += uniDragVelY;
          uniDragVelX *= 0.97;
          uniDragVelY *= 0.97;
          if (Math.abs(uniDragVelX) < 0.0001) uniDragVelX = 0;
          if (Math.abs(uniDragVelY) < 0.0001) uniDragVelY = 0;
        }
        if (autoUniverseDrift && !isDragging) {
          universeGroup.rotation.y += 0.00025;
          universeGroup.rotation.x += 0.00005;
        }
      }
    },
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
