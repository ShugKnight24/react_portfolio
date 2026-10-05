import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { sound } from '../audio/audioSynth';
import styles from './ArcadeTeamBrawler.module.css';
import { BrawlerEngine, FIGHTERS, getSprites, UiSnapshot } from './engine';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, Difficulty } from './engine/constants';

// React shell for the real-time brawler. The engine owns the canvas, loop and
// input; React only renders accessible menus (title, select, pause, continue,
// ending), the controls panel, touch controls and a live region.

const TIPS = [
  'PRESS J OR ENTER TO START  /  2P: PRESS , OR NUMPAD 1',
  'ATTACK, ATTACK, ATTACK: LAND ALL THREE FOR A KNOCKDOWN FINISHER',
  'WALK INTO A THUG TO GRAB HIM. ATTACK TO KNEE, DIRECTION + ATTACK TO THROW',
  'SPECIAL (L, OR ATTACK + JUMP) COSTS A LITTLE HEALTH BUT HITS HARD',
];

const CANVAS_LABEL =
  "Simpsons Arcade Team Brawler game screen: a side-scrolling beat 'em up for one or two players. " +
  'Focus it, then use W A S D to move, J to attack, K or Space to jump, L for your special. Escape or P pauses.';

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(!!mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
};

const useTouchDevice = (): boolean => {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) setTouch(true);
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);
  return touch;
};

/** Full-body idle sprite of a fighter, drawn from the engine's sprite bank. */
const FighterSprite: FC<{ index: number }> = ({ index }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = c.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const set = getSprites(FIGHTERS[index].look);
    const fr = set.right.idle[0];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const s = Math.min(1, 60 / set.height);
    const w = fr.img.width * s;
    const h = fr.img.height * s;
    ctx.drawImage(
      fr.img,
      Math.round(c.width / 2 - fr.ax * s),
      Math.round(c.height - 2 - fr.ay * s),
      Math.round(w),
      Math.round(h)
    );
  }, [index]);
  return (
    <canvas ref={ref} width={64} height={64} className={styles.fighterSprite} aria-hidden="true" />
  );
};

const DIFFICULTY_KEY = 'arcade-brawler-difficulty';

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'more lives, gentler enemies',
  normal: 'the arcade experience',
  hard: 'tougher, faster, meaner',
};

const readStoredDifficulty = (): Difficulty | null => {
  try {
    const v = window.localStorage.getItem(DIFFICULTY_KEY);
    return DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : null;
  } catch {
    return null;
  }
};

type TouchAction = 'left' | 'right' | 'up' | 'down' | 'attack' | 'jump' | 'special' | 'start';

export const ArcadeTeamBrawler: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BrawlerEngine | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const padDirs = useRef({ left: false, right: false, up: false, down: false });
  const [ui, setUi] = useState<UiSnapshot | null>(null);
  const [muted, setMuted] = useState(!sound.enabled);
  const [showControls, setShowControls] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const touch = useTouchDevice();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new BrawlerEngine(canvas, { reducedMotion: false, onUi: setUi });
    engineRef.current = engine;
    const stored = readStoredDifficulty();
    if (stored) {
      engine.game.difficulty = stored;
      engine.game.markUi();
    }
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  const game = () => engineRef.current?.game ?? null;
  const focusCanvas = useCallback(() => {
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  const phase = ui?.phase ?? 'title';
  const paused = ui?.paused ?? false;

  const startBrawl = () => {
    game()?.goSelect();
    focusCanvas();
  };
  const autoDraft = () => {
    game()?.quickStart();
    focusCanvas();
  };
  const pickFighter = (i: number) => {
    const g = game();
    if (!g) return;
    const [p1, p2] = g.slots;
    const target = p1.confirmed && p2.joined && !p2.confirmed ? 1 : 0;
    g.selectSet(target, i);
    g.selectConfirm(target);
    focusCanvas();
  };
  const toggleP2 = () => {
    const g = game();
    if (!g) return;
    g.setP2Joined(!g.slots[1].joined);
    focusCanvas();
  };
  const fight = () => {
    const g = game();
    if (!g) return;
    if (!g.slots[0].confirmed) g.selectConfirm(0);
    if (g.slots[1].joined && !g.slots[1].confirmed) g.selectConfirm(1);
    if (g.canBegin()) g.beginMatch();
    focusCanvas();
  };
  const difficulty = ui?.difficulty ?? DEFAULT_DIFFICULTY;
  const cycleDifficulty = () => {
    const g = game();
    if (!g) return;
    const next = DIFFICULTIES[(DIFFICULTIES.indexOf(g.difficulty) + 1) % DIFFICULTIES.length];
    g.setDifficulty(next);
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, next);
    } catch {
      // storage unavailable (private mode): the choice still applies this session
    }
  };
  const resume = () => {
    game()?.togglePause(false);
    focusCanvas();
  };
  const pause = () => game()?.togglePause(true);
  const quitToTitle = () => {
    game()?.toTitle();
    focusCanvas();
  };
  const continueGame = () => {
    game()?.continueGame();
    focusCanvas();
  };
  const toggleMute = () => {
    const on = sound.toggleSound();
    setMuted(!on);
  };

  const onCanvasBlur = () => {
    setFocused(false);
    const g = game();
    if (!touch && g && g.phase === 'playing' && !g.paused) g.togglePause(true);
  };

  const closeControls = () => {
    setShowControls(false);
    focusCanvas();
  };

  const onOverlayKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showControls) closeControls();
      else if (paused) resume();
    }
  };

  // ---- touch controls -------------------------------------------------------
  const setTouchAction = (a: TouchAction, down: boolean) =>
    engineRef.current?.input.setTouch(a, down);
  const updatePad = (e: ReactPointerEvent<HTMLDivElement>, release = false) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const next = release
      ? { left: false, right: false, up: false, down: false }
      : { left: dx < -0.3, right: dx > 0.3, up: dy < -0.3, down: dy > 0.3 };
    (Object.keys(next) as Array<keyof typeof next>).forEach((k) => {
      if (padDirs.current[k] !== next[k]) setTouchAction(k, next[k]);
    });
    padDirs.current = next;
  };
  const btnHandlers = (a: TouchAction) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setTouchAction(a, true);
    },
    onPointerUp: () => setTouchAction(a, false),
    onPointerCancel: () => setTouchAction(a, false),
    onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  });

  const sel = ui?.select;
  const showFocusHint = phase === 'playing' && !paused && !focused && !touch;

  return (
    <section className={styles.root} aria-label="Simpsons Arcade Team Brawler">
      <div className={styles.stage}>
        <div className={styles.screen}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            tabIndex={0}
            aria-label={CANVAS_LABEL}
            aria-describedby="brawler-controls-summary"
            onFocus={() => setFocused(true)}
            onBlur={onCanvasBlur}
            onPointerDown={() => focusCanvas()}
          />
          <div className={styles.scanlines} aria-hidden="true" />

          {phase === 'title' && (
            <div className={`${styles.overlay} ${styles.titleOverlay}`} onKeyDown={onOverlayKey}>
              <p className={styles.kicker}>
                1-2 PLAYERS &middot; {FIGHTERS.length} FIGHTERS &middot; 4 STAGES
              </p>
              <h2 className={styles.logo}>SIMPSONS ARCADE TEAM BRAWLER</h2>
              <div className={styles.menu}>
                <button type="button" className={styles.primary} onClick={startBrawl}>
                  START BRAWL
                </button>
                <button type="button" onClick={autoDraft}>
                  AUTO DRAFT SQUAD
                </button>
                <button type="button" onClick={() => setShowControls(true)}>
                  CONTROLS
                </button>
              </div>
              <p className={styles.tip} aria-live="off">
                {TIPS[(ui?.attractTip ?? 0) % TIPS.length]}
              </p>
            </div>
          )}

          {phase === 'select' && sel && (
            <div className={`${styles.overlay} ${styles.selectOverlay}`} onKeyDown={onOverlayKey}>
              <h2 className={styles.selectTitle}>CHOOSE YOUR FIGHTER</h2>
              <div className={styles.grid} role="group" aria-label="Fighters">
                {FIGHTERS.map((f, i) => {
                  const p1 = sel.cursors[0] === i;
                  const p2 = sel.joined[1] && sel.cursors[1] === i;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`${styles.card} ${p1 ? styles.cardP1 : ''} ${p2 ? styles.cardP2 : ''}`}
                      aria-pressed={p1 || p2}
                      aria-label={`${f.name}, special ${f.special.name}. ${f.blurb}`}
                      onClick={() => pickFighter(i)}
                    >
                      <FighterSprite index={i} />
                      <span className={styles.cardName}>{f.name}</span>
                      {p1 && (
                        <span className={styles.badgeP1}>{sel.confirmed[0] ? '1P OK' : '1P'}</span>
                      )}
                      {p2 && (
                        <span className={styles.badgeP2}>{sel.confirmed[1] ? '2P OK' : '2P'}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className={styles.selectActions}>
                <button type="button" onClick={quitToTitle}>
                  BACK
                </button>
                <button type="button" onClick={toggleP2} aria-pressed={sel.joined[1]}>
                  {sel.joined[1] ? '2P LEAVE' : '2P JOIN'}
                </button>
                <button
                  type="button"
                  onClick={cycleDifficulty}
                  aria-label={`Difficulty: ${difficulty}, ${DIFFICULTY_HINT[difficulty]}. Activate to change.`}
                  title={DIFFICULTY_HINT[difficulty]}
                >
                  DIFFICULTY: {difficulty.toUpperCase()}
                </button>
                <button type="button" className={styles.primary} onClick={fight}>
                  FIGHT!
                </button>
              </div>
            </div>
          )}

          {phase === 'playing' && paused && !showControls && (
            <div
              className={`${styles.overlay} ${styles.dialog}`}
              role="dialog"
              aria-label="Paused"
              onKeyDown={onOverlayKey}
            >
              <h2 className={styles.dialogTitle}>PAUSED</h2>
              <div className={styles.menu}>
                <button type="button" className={styles.primary} onClick={resume}>
                  RESUME
                </button>
                <button type="button" onClick={() => setShowControls(true)}>
                  CONTROLS
                </button>
                <button type="button" onClick={toggleMute} aria-pressed={!muted}>
                  SOUND: {muted ? 'OFF' : 'ON'}
                </button>
                <button type="button" onClick={quitToTitle}>
                  QUIT TO TITLE
                </button>
              </div>
            </div>
          )}

          {phase === 'stageClear' && (
            <div className={styles.cornerAction}>
              <button type="button" onClick={() => game()?.skipTally()}>
                NEXT STAGE &rarr;
              </button>
            </div>
          )}

          {phase === 'gameOver' && ui && (
            <div
              className={`${styles.overlay} ${styles.dialog} ${styles.lowDialog}`}
              role="dialog"
              aria-label={ui.gameOverFinal ? 'Game over' : 'Continue?'}
            >
              {ui.gameOverFinal ? (
                <>
                  <h2 className={styles.srOnly}>GAME OVER</h2>
                  <div className={styles.menu}>
                    <button type="button" className={styles.primary} onClick={quitToTitle}>
                      BACK TO TITLE
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className={styles.dialogTitle}>CONTINUE?</h2>
                  <p className={styles.srOnly}>{ui.continueSec} seconds left</p>
                  <div className={styles.menu}>
                    <button type="button" className={styles.primary} onClick={continueGame}>
                      CONTINUE
                    </button>
                    <button type="button" onClick={quitToTitle}>
                      GIVE UP
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'ending' && ui && (
            <div
              className={`${styles.overlay} ${styles.dialog}`}
              role="dialog"
              aria-label="The end"
            >
              <h2 className={styles.dialogTitle}>YOU SAVED THE ARCADE!</h2>
              <ul className={styles.scores}>
                {ui.players
                  .filter((p) => p.state === 'playing')
                  .map((p, i) => (
                    <li key={i}>
                      {p.name.toUpperCase()} &middot; {String(p.score).padStart(7, '0')} &middot;
                      BEST COMBO {p.best}
                    </li>
                  ))}
              </ul>
              <div className={styles.menu}>
                <button type="button" className={styles.primary} onClick={quitToTitle}>
                  PLAY AGAIN
                </button>
              </div>
            </div>
          )}

          {showFocusHint && (
            <button type="button" className={styles.focusHint} onClick={focusCanvas}>
              CLICK TO FOCUS THE GAME
            </button>
          )}

          {showControls && (
            <div
              className={`${styles.overlay} ${styles.controlsPanel}`}
              role="dialog"
              aria-label="Controls"
              onKeyDown={onOverlayKey}
            >
              <h2 className={styles.dialogTitle}>CONTROLS</h2>
              <div className={styles.controlsGrid}>
                <div>
                  <h3>1P KEYBOARD</h3>
                  <p>
                    <kbd>W A S D</kbd> move &middot; <kbd>J</kbd> attack &middot; <kbd>K</kbd>/
                    <kbd>Space</kbd> jump &middot; <kbd>L</kbd> special &middot; <kbd>Enter</kbd>{' '}
                    start
                  </p>
                </div>
                <div>
                  <h3>2P KEYBOARD</h3>
                  <p>
                    <kbd>Arrows</kbd> move &middot; <kbd>,</kbd>/<kbd>Num1</kbd> attack &middot;{' '}
                    <kbd>.</kbd>/<kbd>Num2</kbd> jump &middot; <kbd>/</kbd>/<kbd>Num3</kbd> special
                  </p>
                </div>
                <div>
                  <h3>GAMEPAD</h3>
                  <p>
                    D-pad/stick move &middot; X attack &middot; A jump &middot; B special &middot;
                    Start pause/join. Pads auto-assign on first press.
                  </p>
                </div>
                <div>
                  <h3>MOVES</h3>
                  <p>
                    Double-tap a direction to run &middot; attack x3 combo (must connect) &middot;
                    jump + attack flying kick &middot; walk into a thug to grab, then attack to knee
                    or direction + attack to throw &middot; special = <kbd>L</kbd> or attack + jump
                    together (costs HP) &middot; <kbd>Esc</kbd>/<kbd>P</kbd> pause.
                  </p>
                </div>
              </div>
              <div className={styles.menu}>
                <button type="button" className={styles.primary} onClick={closeControls} autoFocus>
                  CLOSE
                </button>
              </div>
            </div>
          )}
        </div>

        {touch && phase === 'playing' && !paused && (
          <div className={styles.touch} aria-hidden="true">
            <div
              ref={padRef}
              className={styles.dpad}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                updatePad(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons || e.pointerType === 'touch') updatePad(e);
              }}
              onPointerUp={(e) => updatePad(e, true)}
              onPointerCancel={(e) => updatePad(e, true)}
            >
              <span className={styles.dpadKnob} />
            </div>
            <div className={styles.touchButtons}>
              <button
                type="button"
                tabIndex={-1}
                className={styles.tbSpecial}
                {...btnHandlers('special')}
              >
                S
              </button>
              <button
                type="button"
                tabIndex={-1}
                className={styles.tbJump}
                {...btnHandlers('jump')}
              >
                B
              </button>
              <button
                type="button"
                tabIndex={-1}
                className={styles.tbAttack}
                {...btnHandlers('attack')}
              >
                A
              </button>
            </div>
            <button type="button" tabIndex={-1} className={styles.tbPause} onClick={pause}>
              II
            </button>
          </div>
        )}
      </div>

      <div className={styles.toolbar}>
        <p id="brawler-controls-summary" className={styles.summary}>
          1P: WASD move, J attack, K jump, L special. 2P: arrows, comma, period, slash (or numpad 1
          2 3). Gamepads supported. Esc pauses.
        </p>
        <div className={styles.toolbarButtons}>
          {phase === 'playing' && !paused && (
            <button type="button" onClick={pause}>
              PAUSE
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            aria-expanded={showControls}
          >
            CONTROLS
          </button>
          <button type="button" onClick={toggleMute} aria-pressed={!muted}>
            SOUND: {muted ? 'OFF' : 'ON'}
          </button>
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {ui?.announce ?? ''}
      </p>
    </section>
  );
};

export default ArcadeTeamBrawler;
