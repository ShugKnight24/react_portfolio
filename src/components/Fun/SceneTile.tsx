import { CSSProperties, FC, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPoster } from './posters';
import type { FunSceneMeta } from './scenes/types';
import { useSceneMount } from './useSceneMount';
import styles from './FunPage.module.css';

interface SceneTileProps {
  scene: FunSceneMeta;
  index: number;
  reducedMotion: boolean;
  /** Suspend hover previews, e.g. while the player is open */
  previewsEnabled: boolean;
}

const PREVIEW_DELAY_MS = 140;
const bucket = (n: number) => Math.max(40, Math.round(n / 40) * 40);

export const SceneTile: FC<SceneTileProps> = ({ scene, index, reducedMotion, previewsEnabled }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<HTMLDivElement | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [wantPreview, setWantPreview] = useState(false);
  const timer = useRef<number>(0);

  // Poster: render once when the tile first nears the viewport
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const rect = el.getBoundingClientRect();
        void getPoster(scene, bucket(rect.width), bucket(rect.height)).then((url) => {
          if (!cancelled && url) setPoster(url);
        });
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [scene]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const start = () => {
    if (reducedMotion) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setWantPreview(true), PREVIEW_DELAY_MS);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setWantPreview(false);
  };

  const previewing = wantPreview && previewsEnabled && !reducedMotion;
  useSceneMount(
    live,
    scene,
    previewing ? { reducedMotion: false, muted: true, interactive: false } : null
  );

  return (
    <li className={styles.tileItem}>
      <Link
        id={`fun-tile-${scene.id}`}
        to={`/fun/${scene.id}`}
        state={{ fromGallery: true }}
        className={styles.tile}
        style={{ '--tile-accent': scene.accent } as CSSProperties}
        onPointerEnter={start}
        onPointerLeave={stop}
        onFocus={start}
        onBlur={stop}
        aria-describedby={`fun-tile-cap-${scene.id}`}
      >
        <div ref={frameRef} className={styles.tileFrame} aria-hidden="true">
          {poster ? (
            <img className={styles.tilePoster} src={poster} alt="" decoding="async" />
          ) : (
            <span className={styles.tileLoading}>LOADING</span>
          )}
          {previewing && <div ref={setLive} className={styles.tileLive} />}
          <span className={styles.tileIndex}>{String(index + 1).padStart(2, '0')}</span>
          <span className={styles.tilePlay}>PLAY</span>
        </div>
        <span className={styles.tileTitle}>{scene.title}</span>
        <span id={`fun-tile-cap-${scene.id}`} className={styles.tileCaption}>
          {scene.caption}
        </span>
      </Link>
    </li>
  );
};
