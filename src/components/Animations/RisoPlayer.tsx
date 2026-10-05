import { CSSProperties, FC, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPress, type Press, type RisoFilm } from './riso/engine';
import styles from './AnimationsPage.module.css';

interface RisoPlayerProps {
  film: RisoFilm<never>;
  index: number;
  total: number;
  /** Chain into the next film when this one ends */
  playAll?: boolean;
  reducedMotion: boolean;
  /** Reel controls; leave them out to embed a single film */
  onTogglePlayAll?(): void;
  onPrev?(): void;
  onNext?(): void;
  /** The film reached its end while play-all is on */
  onEnded?(): void;
  /** Start playing only once the player scrolls into view (for embeds further down a page) */
  autoplayOnView?: boolean;
}

const Icon: FC<{ d: string }> = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICONS = {
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  chain: 'M10 14l4-4M8.5 11.5l-2 2a3 3 0 0 0 4 4l2-2M15.5 12.5l2-2a3 3 0 0 0-4-4l-2 2',
};

const fmt = (s: number) => {
  const whole = Math.max(0, s);
  return `${Math.floor(whole / 60)}:${(whole % 60).toFixed(1).padStart(4, '0')}`;
};

const sceneAt = (film: RisoFilm<never>, t: number) => {
  let i = 0;
  film.scenes.forEach((s, j) => {
    if (t >= s.at) i = j;
  });
  return i;
};

/**
 * Plays one riso film on a canvas. Time is elapsed-based, so speed is the same on every device,
 * and every frame is rendered straight from the timeline, so scrubbing shows exact frames.
 */
export const RisoPlayer: FC<RisoPlayerProps> = ({
  film,
  index,
  total,
  playAll = false,
  reducedMotion,
  onTogglePlayAll,
  onPrev,
  onNext,
  onEnded,
  autoplayOnView = false,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const pressRef = useRef<Press | null>(null);
  const timeRef = useRef(0);
  const filmRef = useRef(film);
  const onEndedRef = useRef(onEnded);
  const playAllRef = useRef(playAll);
  const [playing, setPlaying] = useState(!reducedMotion && !autoplayOnView);
  const seen = useRef(false);
  const [scene, setScene] = useState(0);
  const [ended, setEnded] = useState(false);
  const [onscreen, setOnscreen] = useState(true);

  onEndedRef.current = onEnded;
  playAllRef.current = playAll;

  const paint = useCallback(() => {
    const press = pressRef.current;
    const f = filmRef.current;
    if (!press) return;
    const t = timeRef.current;
    press.render(f, t);
    if (sliderRef.current) sliderRef.current.value = String(t);
    if (clockRef.current) clockRef.current.textContent = `${fmt(t)} / ${fmt(f.duration)}`;
    setScene(sceneAt(f, t));
  }, []);

  // One press per player; it owns the backing store and the ink layers
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const press = createPress(canvas, { maxWidth: 2400 });
    pressRef.current = press;
    const fit = () => {
      const rect = stage.getBoundingClientRect();
      press.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
      paint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    const io = new IntersectionObserver((entries) => setOnscreen(entries[entries.length - 1]?.isIntersecting ?? true));
    io.observe(stage);
    return () => {
      ro.disconnect();
      io.disconnect();
      press.dispose();
      pressRef.current = null;
    };
  }, [paint]);

  // A new film starts from the top (and plays, unless motion is reduced)
  useEffect(() => {
    filmRef.current = film;
    timeRef.current = reducedMotion ? film.posterTime ?? 0 : 0;
    setEnded(false);
    setPlaying(!reducedMotion && (!autoplayOnView || seen.current));
    paint();
  }, [film, paint, reducedMotion, autoplayOnView]);

  // Embeds start the first time they are seen, so the film opens from its first frame
  useEffect(() => {
    if (!autoplayOnView || !onscreen || seen.current || reducedMotion) return;
    seen.current = true;
    timeRef.current = 0;
    setPlaying(true);
  }, [autoplayOnView, onscreen, reducedMotion]);

  useEffect(() => {
    if (!playing || !onscreen) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const f = filmRef.current;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      timeRef.current = Math.min(f.duration, timeRef.current + dt);
      paint();
      if (timeRef.current >= f.duration) {
        setPlaying(false);
        setEnded(true);
        if (playAllRef.current) onEndedRef.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, onscreen, paint]);

  const toggle = () => {
    if (ended || timeRef.current >= filmRef.current.duration) {
      timeRef.current = 0;
      setEnded(false);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const replay = () => {
    timeRef.current = 0;
    setEnded(false);
    setPlaying(true);
    paint();
  };

  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(film.duration, t));
    setEnded(timeRef.current >= film.duration);
    paint();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'k') {
      if (target.tagName === 'BUTTON' && e.key === ' ') return;
      e.preventDefault();
      toggle();
    } else if (e.key === 'r') {
      e.preventDefault();
      replay();
    } else if (e.key === ',' || e.key === '.') {
      e.preventDefault();
      setPlaying(false);
      seek(timeRef.current + (e.key === '.' ? 1 / 30 : -1 / 30));
    }
  };

  const current = film.scenes[scene];
  const inkStyle = { '--ink-a': film.inks[0]?.color, '--ink-b': film.inks[1]?.color, '--ink-c': film.inks[2]?.color ?? film.inks[0]?.color } as CSSProperties;

  return (
    <div className={styles.player} style={inkStyle} onKeyDown={onKeyDown}>
      <div className={styles.frame}>
        <div
          ref={stageRef}
          className={styles.stage}
          role="img"
          aria-label={`${film.title}: ${film.caption}`}
          onClick={toggle}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
        <div className={styles.registration} aria-hidden="true">
          {film.inks.map((ink) => (
            <span key={ink.color} style={{ background: ink.color }} />
          ))}
        </div>
      </div>

      <div className={styles.transport}>
        <div className={styles.buttons}>
          {onPrev && (
            <button type="button" className={styles.iconButton} onClick={onPrev} aria-label="Previous film">
              <Icon d={ICONS.prev} />
            </button>
          )}
          <button
            type="button"
            className={`${styles.iconButton} ${styles.primary}`}
            onClick={toggle}
            aria-label={playing ? 'Pause' : ended ? 'Play again' : 'Play'}
          >
            <Icon d={playing ? ICONS.pause : ICONS.play} />
          </button>
          <button type="button" className={styles.iconButton} onClick={replay} aria-label="Replay from the start">
            <Icon d={ICONS.replay} />
          </button>
          {onNext && (
            <button type="button" className={styles.iconButton} onClick={onNext} aria-label="Next film">
              <Icon d={ICONS.next} />
            </button>
          )}
        </div>

        <div className={styles.timeline}>
          <input
            ref={sliderRef}
            className={styles.slider}
            type="range"
            min={0}
            max={film.duration}
            step={1 / 60}
            defaultValue={0}
            aria-label="Timeline"
            aria-valuetext={`${fmt(timeRef.current)}, ${current?.label ?? ''}`}
            onPointerDown={() => setPlaying(false)}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
          <div className={styles.ticks} aria-hidden="true">
            {film.scenes.map((s, i) => (
              <button
                key={s.label}
                type="button"
                tabIndex={-1}
                className={`${styles.tick} ${i === scene ? styles.tickOn : ''}`}
                style={{
                  left: `${(s.at / film.duration) * 100}%`,
                  // Labels stop where the next scene starts
                  maxWidth: `${(((film.scenes[i + 1]?.at ?? film.duration) - s.at) / film.duration) * 100}%`,
                }}
                onClick={() => {
                  setPlaying(false);
                  seek(s.at + 0.001);
                }}
              >
                <span title={s.label}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.readout}>
          <span ref={clockRef} className={styles.clock}>
            0:00.0
          </span>
          {onTogglePlayAll && (
            <button
              type="button"
              className={`${styles.chain} ${playAll ? styles.chainOn : ''}`}
              onClick={onTogglePlayAll}
              aria-pressed={playAll}
            >
              <Icon d={ICONS.chain} />
              Play all
            </button>
          )}
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {`Film ${index + 1} of ${total}: ${film.title}. Scene: ${current?.label ?? ''}.`}
      </p>
    </div>
  );
};
