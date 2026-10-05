import { CSSProperties, FC, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHero } from '../Layout/PageHero';
import { usePrefersReducedMotion } from '../Fun/useSceneMount';
import { type FilmMeta, FILMS, findFilm, loadFilm } from './films';
import { getPoster } from './posters';
import { RisoPlayer } from './RisoPlayer';
import type { RisoFilm } from './riso/engine';
import styles from './AnimationsPage.module.css';

const totalSeconds = Math.round(FILMS.reduce((sum, f) => sum + f.duration, 0));

type Shelf = { name: string; films: FilmMeta[] };

// Older films only carry a theme; fold those into the browsing categories
const CATEGORY_BY_THEME: Record<string, string> = {
  Fitness: 'Athletic',
  Sports: 'Athletic',
  Athletic: 'Athletic',
  Games: 'Video game',
  'Video game': 'Video game',
  Fun: 'Video game',
  Cinematic: 'Cinematic',
  Anime: 'Anime',
  Luna: 'Luna',
  Detroit: 'Detroit',
  Craft: 'Craft',
  Origins: 'Origins & travel',
  Travel: 'Origins & travel',
  'Travel & Photos': 'Origins & travel',
  Books: 'Culture',
  Music: 'Culture',
};

const categoryOf = (film: FilmMeta) =>
  film.category ?? CATEGORY_BY_THEME[film.theme] ?? film.theme;

/** Group films into shelves in the order each key first appears */
const shelvesBy = (key: (film: FilmMeta) => string) =>
  FILMS.reduce<Shelf[]>((shelves, film) => {
    const name = key(film);
    const shelf = shelves.find((s) => s.name === name);
    if (shelf) shelf.films.push(film);
    else shelves.push({ name, films: [film] });
    return shelves;
  }, []);

const SERIES = shelvesBy((film) => film.series ?? 'Risograph');
const CATEGORIES = shelvesBy(categoryOf);

type Grouping = 'style' | 'category';

const GROUPING_KEY = 'animations:grouping';

const readGrouping = (): Grouping => {
  try {
    return window.localStorage.getItem(GROUPING_KEY) === 'category' ? 'category' : 'style';
  } catch {
    return 'style';
  }
};

const FilmCard: FC<{ film: FilmMeta; index: number; active: boolean; onPick(): void }> = ({
  film,
  index,
  active,
  onPick,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void getPoster(film).then((url) => {
          if (!cancelled) setPoster(url);
        });
      },
      { rootMargin: '300px 0px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [film]);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={`${styles.card} ${active ? styles.cardOn : ''}`}
        onClick={onPick}
        aria-pressed={active}
        style={{ '--card-ink': film.inkColors[1] ?? film.inkColors[0] } as CSSProperties}
      >
        <span className={styles.cardPrint}>
          {poster ? <img src={poster} alt="" decoding="async" /> : <span className={styles.cardWet}>INKING</span>}
          <span className={styles.cardNo}>{String(index + 1).padStart(2, '0')}</span>
          {active && <span className={styles.cardNow}>NOW PRINTING</span>}
        </span>
        <span className={styles.cardMeta}>
          <span className={styles.cardTheme}>{film.theme}</span>
          <span className={styles.cardDur}>{film.duration.toFixed(1)}s</span>
        </span>
        <span className={styles.cardTitle}>{film.title}</span>
        <span className={styles.cardMotif}>Motif: {film.motif}</span>
        <span className={styles.swatches} aria-hidden="true">
          {film.inkColors.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </span>
      </button>
    </li>
  );
};

/**
 * The film to hand the player. While the next film's chunk loads, the previous one stays on
 * the press, so switching never blanks the canvas. Neighbours are fetched ahead of time.
 */
/** A blank sheet with the film's paper, inks and length, so the player lays out exactly as it
 * will once the film arrives and nothing on the page shifts */
const blankFilm = (meta: FilmMeta): RisoFilm<never> => ({
  ...meta,
  inks: meta.inkColors.map((color) => ({ color })),
  scenes: [],
  draw: () => undefined,
});

const useLoadedFilm = (meta: FilmMeta, index: number) => {
  const [film, setFilm] = useState<RisoFilm<never>>(() => blankFilm(meta));

  useEffect(() => {
    let cancelled = false;
    loadFilm(meta).then(
      (loaded) => {
        if (cancelled) return;
        setFilm(loaded);
        [index + 1, index - 1].forEach((i) => {
          void loadFilm(FILMS[(i + FILMS.length) % FILMS.length]).catch(() => undefined);
        });
      },
      (err) => console.error(`Film "${meta.id}" failed to load`, err)
    );
    return () => {
      cancelled = true;
    };
  }, [meta, index]);

  return film;
};

/**
 * /animations and /animations/<film>: short risograph motion posters, one per corner of the
 * portfolio, drawn live on canvas. Mounted on "/animations/*", so the id arrives as params['*'].
 */
export const AnimationsPage: FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const filmId = (params['*'] ?? '').split('/')[0] || undefined;
  const film = findFilm(filmId) ?? FILMS[0];
  const index = FILMS.indexOf(film);
  const loadedFilm = useLoadedFilm(film, index);
  const [playAll, setPlayAll] = useState(false);
  const [grouping, setGrouping] = useState<Grouping>(readGrouping);
  const shelves = grouping === 'style' ? SERIES : CATEGORIES;
  const chooseGrouping = (next: Grouping) => {
    setGrouping(next);
    try {
      window.localStorage.setItem(GROUPING_KEY, next);
    } catch {
      /* storage is optional */
    }
  };
  const pressRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (filmId && !findFilm(filmId)) navigate('/animations', { replace: true });
  }, [filmId, navigate]);

  const show = useCallback(
    (i: number) => {
      const next = FILMS[(i + FILMS.length) % FILMS.length];
      navigate(`/animations/${next.id}`, { replace: true });
    },
    [navigate]
  );

  const pick = (i: number) => {
    show(i);
    pressRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className={styles.page}>
      <PageHero
        id="animations-title"
        title="Animations"
        outline="Off the press"
        meta={SERIES.map((s) => s.name)}
        lede="Short films about the things I love, in a few different print styles. Every frame is drawn in code, which is a very long way around not just using a video."
        stats={[
          { value: FILMS.length, label: 'Films' },
          { value: SERIES.length, label: 'Styles' },
          { value: CATEGORIES.length, label: 'Categories' },
          { value: `${totalSeconds}s`, label: 'Runtime' },
        ]}
      />

      <section ref={pressRef} className={styles.press} aria-labelledby="press-title">
        <header className={styles.pressHead}>
          <p className={styles.kicker}>
            {String(index + 1).padStart(2, '0')} / {String(FILMS.length).padStart(2, '0')} · {film.series ?? 'Risograph'} · {film.theme}
          </p>
          <h2 id="press-title" className={styles.filmTitle}>
            {film.title}
          </h2>
          <p className={styles.caption}>{film.caption}</p>
        </header>

        <RisoPlayer
          film={loadedFilm}
          index={FILMS.findIndex((f) => f.id === loadedFilm.id)}
          total={FILMS.length}
          playAll={playAll}
          reducedMotion={reducedMotion}
          onTogglePlayAll={() => setPlayAll((p) => !p)}
          onPrev={() => show(index - 1)}
          onNext={() => show(index + 1)}
          onEnded={() => show(index + 1)}
        />
        <p className={styles.keys}>
          Space plays and pauses · R replays · , and . step one frame · drag the timeline to study a transition
        </p>
      </section>

      <div className={styles.grouping} role="group" aria-label="Group the reel by">
        <span className={styles.groupingLabel}>Browse by</span>
        {(['style', 'category'] as const).map((g) => (
          <button
            key={g}
            type="button"
            className={`${styles.groupingButton} ${grouping === g ? styles.groupingOn : ''}`}
            aria-pressed={grouping === g}
            onClick={() => chooseGrouping(g)}
          >
            {g === 'style' ? 'Style' : 'Category'}
          </button>
        ))}
      </div>

      {shelves.map((shelf) => (
        <section key={shelf.name} className={styles.reel} aria-labelledby={`reel-${shelf.name}`}>
          <h2 id={`reel-${shelf.name}`} className={styles.reelTitle}>
            <span>{shelf.name}</span>
            <span className={styles.reelCount}>{String(shelf.films.length).padStart(2, '0')}</span>
          </h2>
          <ul className={styles.cards}>
            {shelf.films.map((f) => {
              const i = FILMS.indexOf(f);
              return <FilmCard key={f.id} film={f} index={i} active={f === film} onPick={() => pick(i)} />;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
