import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RisoPlayer } from '../Animations/RisoPlayer';
import { saturdayMorningFilm } from '../Animations/films/saturday-morning';
import type { RisoFilm } from '../Animations/riso/engine';
import { DetroitCodeCity } from '../DetroitCodeCity';
import { SportsLegends } from '../SportsLegends';
import styles from './FunPage.module.css';
import { ScenePlayer } from './ScenePlayer';
import { SceneTile } from './SceneTile';
import { FUN_GROUPS, FUN_SCENES, LEGENDS_GROUP, findScene } from './scenes';
import { usePrefersReducedMotion } from './useSceneMount';

const MUTE_KEY = 'fun:muted';

const readMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) !== 'false';
  } catch {
    return true;
  }
};

/**
 * /fun and /fun/<scene-id>: a gallery of small animated scenes with a modal player.
 * Mounted under the splat route "/fun/*", so the scene id arrives as params['*'].
 */
export const FunPage: FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by gallery tiles, so closing can step back instead of stacking history
  const fromGallery = !!(location.state as { fromGallery?: boolean } | null)?.fromGallery;
  const reducedMotion = usePrefersReducedMotion();
  const [muted, setMuted] = useState(readMuted);

  const sceneId = (params['*'] ?? '').split('/')[0] || undefined;
  const scene = findScene(sceneId);
  const index = scene ? FUN_SCENES.indexOf(scene) : -1;
  const lastOpened = useRef<string | null>(null);

  // Unknown ids fall back to the gallery instead of an empty player
  useEffect(() => {
    if (sceneId && !scene) navigate('/fun', { replace: true });
  }, [navigate, scene, sceneId]);

  // Return focus to the tile that opened the player
  useEffect(() => {
    if (scene) {
      lastOpened.current = scene.id;
      return;
    }
    if (!lastOpened.current) return;
    const tile = document.getElementById(`fun-tile-${lastOpened.current}`);
    lastOpened.current = null;
    tile?.focus({ preventScroll: false });
  }, [scene]);

  const go = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = FUN_SCENES[(index + delta + FUN_SCENES.length) % FUN_SCENES.length];
      navigate(`/fun/${next.id}`, { replace: true, state: location.state });
    },
    [index, location.state, navigate]
  );

  const toggleMute = () =>
    setMuted((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(MUTE_KEY, String(next));
      } catch {
        /* storage is optional */
      }
      return next;
    });

  const renderGroup = (group: (typeof FUN_GROUPS)[number]) => (
    <section key={group.id} className={styles.group} aria-labelledby={`fun-group-${group.id}`}>
      <h2 id={`fun-group-${group.id}`} className={styles.groupTitle}>
        <span>{group.label}</span>
        <span className={styles.groupCount}>{String(group.scenes.length).padStart(2, '0')}</span>
      </h2>
      <ul className={styles.grid}>
        {group.scenes.map((s) => (
          <SceneTile
            key={s.id}
            scene={s}
            index={FUN_SCENES.indexOf(s)}
            reducedMotion={reducedMotion}
            previewsEnabled={!scene}
          />
        ))}
      </ul>
    </section>
  );

  return (
    <section className={styles.page} aria-labelledby="fun-title">
      <header className={styles.hero}>
        <p className={styles.kicker}>
          <span className={styles.kickerDot} aria-hidden="true" />
          {FUN_SCENES.length} SCENES LOADED
        </p>
        <h1 id="fun-title" className={`world-title ${styles.title}`}>
          Fun
        </h1>
        <p className={styles.lede}>
          Small animated scenes inspired by the anime, games, comics and movies I grew up on. Pick
          one and poke at it.
        </p>
        <p className={styles.fine}>
          Fan tributes, made for fun. All characters and trademarks belong to their owners.
        </p>
      </header>

      <div className={styles.groups}>{FUN_GROUPS.map(renderGroup)}</div>

      {/* Bigger pieces that don't fit in a tile: they sit at the end of the gallery */}
      <section className={styles.features} aria-labelledby="fun-features">
        <h2 id="fun-features" className={styles.groupTitle}>
          <span>Also showing</span>
        </h2>
      </section>
      <SportsLegends />
      {LEGENDS_GROUP && <div className={styles.legendsGroup}>{renderGroup(LEGENDS_GROUP)}</div>}
      <DetroitCodeCity />
      <section className={styles.feature} aria-labelledby="fun-saturday">
        <h2 id="fun-saturday" className={styles.groupTitle}>
          <span>{saturdayMorningFilm.title}</span>
        </h2>
        <p className={styles.featureLede}>
          {saturdayMorningFilm.caption}{' '}
          <Link to="/animations" className={styles.featureLink}>
            More like this
          </Link>
        </p>
        <RisoPlayer
          film={saturdayMorningFilm as unknown as RisoFilm<never>}
          index={0}
          total={1}
          reducedMotion={reducedMotion}
          autoplayOnView
        />
      </section>

      <ScenePlayer
        scene={scene}
        index={index}
        total={FUN_SCENES.length}
        reducedMotion={reducedMotion}
        muted={muted}
        onToggleMute={toggleMute}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onClose={() => (fromGallery ? navigate(-1) : navigate('/fun'))}
      />
    </section>
  );
};
