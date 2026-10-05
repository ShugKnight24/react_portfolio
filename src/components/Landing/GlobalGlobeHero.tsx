import { FC, useEffect, useRef, useState } from 'react';
import { sound } from '../arcade/audio/audioSynth';
import type { GlobeController } from './globe/GlobeOrchestrator';
import { GLOBE_LOCATIONS, GlobeLocation } from './globe/locations';
import styles from './GlobalGlobeHero.module.css';

export const GlobalGlobeHero: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GlobeController | null>(null);

  const [activeLocationId, setActiveLocationId] = useState<string>('detroit');
  const [detroitTime, setDetroitTime] = useState<string>('');
  const [autoRotateActive, setAutoRotateActive] = useState<boolean>(true);
  const [labelsActive, setLabelsActive] = useState<boolean>(true);
  const [universeModeActive, setUniverseModeActive] = useState<boolean>(false);

  const activeLocation =
    GLOBE_LOCATIONS.find((loc) => loc.id === activeLocationId) || GLOBE_LOCATIONS[0];

  // Live Detroit EST clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const estString = now.toLocaleTimeString('en-US', {
          timeZone: 'America/Detroit',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setDetroitTime(`${estString} EST`);
      } catch {
        setDetroitTime('ONLINE');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize the WebGL globe. three.js is a separate chunk, fetched only when the globe
  // gets close to the viewport, so the rest of Home paints without it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let controller: GlobeController | null = null;

    const start = () =>
      import('./globe/GlobeOrchestrator').then(({ initGlobeOrchestrator }) => {
        if (cancelled) return;
        controller = initGlobeOrchestrator(container);
        controllerRef.current = controller;
        // Initial focus on Detroit
        controller.focusLocation(42.3314, -83.0458);
      });

    // Wait for an idle moment too, so the globe never competes with the hero image
    let idleId = 0;
    const startWhenIdle = () => {
      idleId =
        typeof requestIdleCallback === 'function'
          ? requestIdleCallback(start, { timeout: 2500 })
          : window.setTimeout(start, 300);
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') {
      startWhenIdle();
    } else {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          observer?.disconnect();
          startWhenIdle();
        },
        { rootMargin: '400px 0px' }
      );
      observer.observe(container);
    }

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      observer?.disconnect();
      controller?.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Handle location selection
  const handleFocusLocation = (loc: GlobeLocation) => {
    sound.playJump();
    setActiveLocationId(loc.id);
    controllerRef.current?.focusLocation(loc.lat, loc.lon);
  };

  // Toggle Auto-rotate
  const handleToggleAutoRotate = () => {
    sound.playBeep(520, 0.04);
    if (controllerRef.current) {
      const next = controllerRef.current.toggleAutoRotate();
      setAutoRotateActive(next);
    }
  };

  // Toggle Celestial Labels
  const handleToggleLabels = () => {
    sound.playBeep(640, 0.04);
    if (controllerRef.current) {
      const next = controllerRef.current.toggleLabels();
      setLabelsActive(next);
    }
  };

  // Toggle Cosmos / Universe Drag
  const handleToggleUniverseMode = () => {
    sound.playPowerUp();
    if (controllerRef.current) {
      const next = controllerRef.current.toggleUniverseMode();
      setUniverseModeActive(next);
    }
  };

  return (
    <section className={styles.globalGlobeHeroSection} aria-label="Interactive 3D Cosmos Earth Globe">
      {/* Top Telemetry & Control Bar */}
      <div className={styles.telemetryHudBar}>
        <div className={styles.telemetryLeft}>
          <div className={styles.statusBadge}>
            <span className={styles.liveBlip} />
            <span className={styles.statusText}>ORBITAL TELEMETRY // 3D WEBGL</span>
          </div>
          <div className={styles.hudCoordReadout}>
            DETROIT HQ: 42.3314° N, 83.0458° W // {detroitTime}
          </div>
        </div>

        {/* HUD Sub-Toggles */}
        <div className={styles.telemetryControls}>
          <button
            type="button"
            onClick={handleToggleAutoRotate}
            className={`${styles.hudControlBtn} ${!autoRotateActive ? styles.active : ''}`}
            title={autoRotateActive ? 'Pause auto-rotation' : 'Resume auto-rotation'}
          >
            {autoRotateActive ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className={styles.controlIcon}>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className={styles.controlIcon}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            <span>{autoRotateActive ? 'PAUSE' : 'RESUME'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleLabels}
            className={`${styles.hudControlBtn} ${labelsActive ? styles.active : ''}`}
            title="Toggle Celestial Labels"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.controlIcon}>
              <path d="M4 7V4h16v3" />
              <path d="M9 20h6" />
              <path d="M12 4v16" />
            </svg>
            <span>LABELS</span>
          </button>

          <button
            type="button"
            onClick={handleToggleUniverseMode}
            className={`${styles.hudControlBtn} ${universeModeActive ? styles.active : ''}`}
            title="Toggle Cosmos Universe Drag Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.controlIcon}>
              <circle cx="12" cy="12" r="3" />
              <path d="M3 12c0-3.3 4-6 9-6s9 2.7 9 6-4 6-9 6-9-2.7-9-6Z" />
            </svg>
            <span>COSMOS DRAG</span>
          </button>
        </div>

        {/* Location Switcher Pills */}
        <div className={styles.telemetryCitySwitcher}>
          {GLOBE_LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => handleFocusLocation(loc)}
              className={`${styles.cityPill} ${activeLocationId === loc.id ? styles.active : ''}`}
              style={{
                borderColor: activeLocationId === loc.id ? loc.color : undefined,
                color: activeLocationId === loc.id ? loc.color : undefined,
              }}
            >
              <span className={styles.dot} style={{ backgroundColor: loc.color }} />
              <span>{loc.name.split(',')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3D WebGL Canvas Viewport */}
      <div className={styles.globeCanvasWrapper} title="Drag to rotate Earth. Shift-drag to rotate deep space.">
        <div ref={containerRef} className={styles.globeCanvasContainer} />

        {/* Active Location Info Card in HUD */}
        <div className={styles.locationIntelCard}>
          <div className={styles.intelHeader}>
            <span className={styles.intelRegion}>{activeLocation.region.toUpperCase()}</span>
            <span className={styles.intelCoords}>
              {activeLocation.lat.toFixed(2)}°N, {Math.abs(activeLocation.lon).toFixed(2)}{activeLocation.lon >= 0 ? '°E' : '°W'}
            </span>
          </div>
          <h3 className={styles.intelTitle} style={{ color: activeLocation.color }}>
            {activeLocation.name}
          </h3>
          <span className={styles.intelRole}>{activeLocation.role}</span>
          <p className={styles.intelDesc}>{activeLocation.description}</p>
        </div>

        {/* Drag Hint */}
        <div className={styles.globeInteractHint}>
          [ DRAG: ROTATE EARTH • SHIFT-DRAG: ROTATE CELESTIAL SKY ]
        </div>
      </div>

    </section>
  );
};

export default GlobalGlobeHero;
