import { CSSProperties, FC, KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { FunSceneMeta } from './scenes/types';
import { useSceneMount } from './useSceneMount';
import styles from './FunPage.module.css';

interface ScenePlayerProps {
  scene: FunSceneMeta | undefined;
  index: number;
  total: number;
  reducedMotion: boolean;
  muted: boolean;
  onToggleMute(): void;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
}

const Icon: FC<{ d: string }> = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
  </svg>
);

const ICONS = {
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  soundOn: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  soundOff: 'M4 9h4l5-4v14l-5-4H4zM16 9l6 6M22 9l-6 6',
};

export const ScenePlayer: FC<ScenePlayerProps> = ({
  scene,
  index,
  total,
  reducedMotion,
  muted,
  onToggleMute,
  onPrev,
  onNext,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const open = !!scene;

  // Mount the scene only once the dialog is showing, so it sizes against the real stage
  const handle = useSceneMount(
    stage,
    scene,
    open ? { reducedMotion, muted, interactive: true } : null
  );

  useEffect(() => {
    handle?.setMuted?.(muted);
  }, [handle, muted]);

  useEffect(() => {
    if (!handle) return;
    if (paused) handle.pause();
    else handle.resume();
  }, [handle, paused]);

  // Each scene starts playing when you switch to it
  useEffect(() => setPaused(false), [scene?.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      document.documentElement.classList.add(styles.scrollLocked);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove(styles.scrollLocked);
    },
    []
  );

  // Focus the scene on open and on every switch so Space and Enter reach it, not the Close button
  useEffect(() => {
    if (open) stage?.focus({ preventScroll: true });
  }, [open, stage]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onNext();
    }
  };

  const counter = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  return (
    <dialog
      ref={dialogRef}
      className={styles.player}
      aria-labelledby="fun-player-title"
      aria-describedby="fun-player-caption"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        document.documentElement.classList.remove(styles.scrollLocked);
      }}
      onKeyDown={onKeyDown}
      style={{ '--tile-accent': scene?.accent ?? 'var(--w-accent)' } as CSSProperties}
    >
      {scene && (
        <div className={styles.playerInner}>
          <header className={styles.playerHead}>
            <div className={styles.playerHeading}>
              <span className={styles.playerCounter}>{counter}</span>
              <h2 id="fun-player-title" className={styles.playerTitle}>
                {scene.title}
              </h2>
              <p id="fun-player-caption" className={styles.playerCaption}>
                {scene.caption}
              </p>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Close player"
            >
              <Icon d={ICONS.close} />
            </button>
          </header>

          <div
            ref={setStage}
            key={scene.id}
            className={styles.stage}
            role="group"
            aria-roledescription="interactive scene"
            aria-label={`${scene.title}: ${scene.caption}`}
            tabIndex={0}
          />

          <footer className={styles.playerFoot}>
            <p className={styles.playerHint}>
              <span className={styles.hintLabel}>HOW</span>
              {scene.hint}
              {reducedMotion && ' Motion is reduced, so it only moves while you interact.'}
            </p>
            <div className={styles.playerControls}>
              <button type="button" className={styles.iconButton} onClick={onPrev} aria-label="Previous scene">
                <Icon d={ICONS.prev} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Play scene' : 'Pause scene'}
                aria-pressed={paused}
              >
                <Icon d={paused ? ICONS.play : ICONS.pause} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={onToggleMute}
                aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
                aria-pressed={!muted}
              >
                <Icon d={muted ? ICONS.soundOff : ICONS.soundOn} />
              </button>
              <button type="button" className={styles.iconButton} onClick={onNext} aria-label="Next scene">
                <Icon d={ICONS.next} />
              </button>
            </div>
          </footer>
          <p className={styles.srOnly} aria-live="polite">
            {`Now playing ${scene.title}, scene ${index + 1} of ${total}.`}
          </p>
        </div>
      )}
    </dialog>
  );
};
