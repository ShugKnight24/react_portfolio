import { FC, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sound } from '../audio/audioSynth';
import {
  ArcadeIcon,
  GameBoyIcon,
  MonitorIcon,
  TvIcon,
  VolumeMuteIcon,
  VolumeUpIcon
} from '../icons/ArcadeIcons';
import { ArcadeDisplayMode } from '../types';
import styles from './ArcadeCabinet.module.css';

interface ArcadeCabinetProps {
  children: ReactNode;
  displayMode: ArcadeDisplayMode;
  onChangeDisplayMode: (mode: ArcadeDisplayMode) => void;
  onButtonPress?: (buttonName: string) => void;
  onJoystickMove?: (direction: string) => void;
  /** Render the shell toolbar inside this element instead of above the cabinet (null hides it until mounted). */
  toolbarTarget?: HTMLElement | null;
}

export const ArcadeCabinet: FC<ArcadeCabinetProps> = ({
  children,
  displayMode,
  onChangeDisplayMode,
  onButtonPress,
  onJoystickMove,
  toolbarTarget,
}) => {
  const [scanlinesEnabled, setScanlinesEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showControlsDeck, setShowControlsDeck] = useState(false);
  const [credits, setCredits] = useState(2);
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const [joystickAngle, setJoystickAngle] = useState({ x: 0, y: 0 });

  const triggerButton = (name: string) => {
    setPressedButton(name);
    if (name === 'A') sound.playJump();
    else if (name === 'B') sound.playEat();
    else if (name === 'COIN') {
      sound.playCoin();
      setCredits((c) => c + 1);
    } else sound.playBeep(440, 0.05);

    if (onButtonPress) onButtonPress(name);
    setTimeout(() => setPressedButton(null), 180);
  };

  const triggerDirection = (dir: string, x: number, y: number) => {
    sound.playBeep(330, 0.03);
    setJoystickAngle({ x, y });
    if (onJoystickMove) onJoystickMove(dir);
    setTimeout(() => setJoystickAngle({ x: 0, y: 0 }), 200);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Games and text fields own their keys; the cabinet only mirrors the rest
      const target = e.target as HTMLElement | null;
      if (target?.closest('canvas, input, textarea, select, [contenteditable="true"]')) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          triggerDirection('up', 0, -12);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          triggerDirection('down', 0, 12);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          triggerDirection('left', -12, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          triggerDirection('right', 12, 0);
          break;
        case 'z':
        case 'Z':
        case ' ':
          triggerButton('A');
          break;
        case 'x':
        case 'X':
          triggerButton('B');
          break;
        case 'c':
        case 'C':
          triggerButton('COIN');
          break;
        case 'Enter':
          triggerButton('1P');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleSound = () => {
    const nextState = sound.toggleSound();
    setSoundEnabled(nextState);
  };

  const toolbar = (
    <div className={styles.cabinetPerspectiveToolbar}>
      <div className={styles.modeToggleGroup}>
        <span className={styles.toolbarLabel}>SHELL FORM:</span>
        <button
          type="button"
          onClick={() => {
            sound.playBeep(523.25, 0.05);
            onChangeDisplayMode('arcade');
          }}
          className={`${styles.modeBtn} ${displayMode === 'arcade' ? styles.active : ''}`}
        >
          <ArcadeIcon size={14} />
          <span>Arcade Cabinet</span>
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playBeep(587.33, 0.05);
            onChangeDisplayMode('gameboy');
          }}
          className={`${styles.modeBtn} ${displayMode === 'gameboy' ? styles.active : ''}`}
        >
          <GameBoyIcon size={14} />
          <span>Game Boy DMG</span>
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playBeep(659.25, 0.05);
            onChangeDisplayMode('fullscreen');
          }}
          className={`${styles.modeBtn} ${displayMode === 'fullscreen' ? styles.active : ''}`}
        >
          <MonitorIcon size={14} />
          <span>Screen Only</span>
        </button>
      </div>

      <div className={styles.hardwareToggles}>
        {displayMode === 'arcade' && (
          <button
            type="button"
            onClick={() => setShowControlsDeck((d) => !d)}
            className={`${styles.hwBtn} ${showControlsDeck ? styles.active : ''}`}
            title="Toggle physical arcade control deck"
          >
            <ArcadeIcon size={14} />
            <span>Deck: {showControlsDeck ? 'PHYSICAL' : 'COMPACT'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setScanlinesEnabled((s) => !s)}
          className={`${styles.hwBtn} ${scanlinesEnabled ? styles.active : ''}`}
          title="Toggle CRT scanline glass filter"
        >
          <TvIcon size={14} />
          <span>CRT Scanlines: {scanlinesEnabled ? 'ON' : 'OFF'}</span>
        </button>
        <button
          type="button"
          onClick={handleToggleSound}
          className={`${styles.hwBtn} ${soundEnabled ? styles.active : ''}`}
          title="Toggle 8-bit sound effects"
        >
          {soundEnabled ? <VolumeUpIcon size={14} /> : <VolumeMuteIcon size={14} />}
          <span>SFX {soundEnabled ? 'ON' : 'MUTED'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`${styles.arcadeChassis} ${styles[`mode-${displayMode}`] || ''}`}>
      {/* Perspective / Form factor toolbar (a host can move it into its own settings panel) */}
      {toolbarTarget === undefined
        ? toolbar
        : toolbarTarget
          ? createPortal(toolbar, toolbarTarget)
          : null}

      {/* ================= ARCADE CABINET ENCLOSURE ================= */}
      {displayMode === 'arcade' && (
        <div className={styles.arcadeCabinetExterior}>
          {/* Top Marquee */}
          <div className={styles.arcadeMarquee}>
            <div className={styles.marqueeNeonBorder}>
              <div className={styles.marqueeContent}>
                <span className={styles.marqueeSub}>RETRO ARCADE &amp; DIGITAL PLAYGROUND</span>
                <h1 className={styles.marqueeTitle}>SHUGMI ARCADE</h1>
                <span className={styles.marqueeCredits}>INSERT COIN TO PLAY // CREDITS: {credits}</span>
              </div>
            </div>
          </div>

          {/* Monitor Housing / CRT Bezel */}
          <div className={styles.arcadeMonitorHousing}>
            <div className={`${styles.crtScreenBezel} ${scanlinesEnabled ? styles.withScanlines : ''}`}>
              <div className={styles.crtGlassGlare} />
              <div className={styles.screenViewport}>{children}</div>
            </div>
          </div>

          {/* Compact Control Strip */}
          {!showControlsDeck ? (
            <div className={styles.compactControlStrip}>
              <div className={styles.compactDeckLeft}>
                <button
                  type="button"
                  onClick={() => triggerButton('COIN')}
                  className={styles.compactCoinBtn}
                  title="Insert Coin"
                >
                  25¢ COIN ({credits})
                </button>
                <button
                  type="button"
                  onClick={() => triggerButton('1P')}
                  className={styles.compactStartBtn}
                  title="Player 1 Start"
                >
                  1P START
                </button>
              </div>

              <div className={styles.compactDeckKeys}>
                <span>KEYS:</span>
                <span className={styles.keyBadge}>WASD</span>
                <span>MOVE</span>
                <span className={styles.keyBadge}>J</span>
                <span>ATTACK</span>
                <span className={styles.keyBadge}>K / SPACE</span>
                <span>JUMP</span>
                <span className={styles.keyBadge}>L</span>
                <span>SPECIAL</span>
                <span className={styles.keyBadge}>ARROWS , . /</span>
                <span>PLAYER 2</span>
              </div>

              <button
                type="button"
                onClick={() => setShowControlsDeck(true)}
                className={styles.compactToggleBtn}
              >
                Physical Controls &uarr;
              </button>
            </div>
          ) : (
            /* Full Physical Control Deck */
            <div className={styles.arcadeControlDeck}>
              <button
                type="button"
                onClick={() => setShowControlsDeck(false)}
                className={styles.deckMinimizeBtn}
              >
                Minimize Deck &darr;
              </button>
              <div className={styles.deckSurface}>
                {/* Left: Joystick */}
                <div className={styles.joystickAssembly}>
                  <div
                    className={styles.joystickBase}
                    onClick={() => triggerDirection('up', 0, -14)}
                  >
                    <div
                      className={styles.joystickStick}
                      style={{
                        transform: `translate(${joystickAngle.x}px, ${joystickAngle.y}px)`,
                      }}
                    >
                      <div className={styles.joystickBalltop} />
                    </div>
                  </div>
                  <span className={styles.deckLabel}>MOVE / ARROWS</span>
                </div>

                {/* Center: Coin & Start */}
                <div className={styles.deckCenterActions}>
                  <div className={styles.coinSlotHousing}>
                    <button
                      type="button"
                      onClick={() => triggerButton('COIN')}
                      className={`${styles.coinInsertBtn} ${pressedButton === 'COIN' ? styles.pressed : ''}`}
                    >
                      <span className={styles.coinLight} />
                      25¢ INSERT COIN
                    </button>
                    <span className={styles.coinLabel}>CREDITS: {credits}</span>
                  </div>

                  <div className={styles.playerStartRow}>
                    <button
                      type="button"
                      onClick={() => triggerButton('1P')}
                      className={`${styles.startBtn} ${pressedButton === '1P' ? styles.pressed : ''}`}
                    >
                      1P START
                    </button>
                  </div>
                </div>

                {/* Right: 6 Push Buttons */}
                <div className={styles.buttonsAssembly}>
                  <div className={styles.buttonCluster}>
                    <button
                      type="button"
                      onClick={() => triggerButton('A')}
                      className={`${styles.arcadeBtn} ${styles.btnRed} ${pressedButton === 'A' ? styles.pressed : ''}`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerButton('B')}
                      className={`${styles.arcadeBtn} ${styles.btnBlue} ${pressedButton === 'B' ? styles.pressed : ''}`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerButton('C')}
                      className={`${styles.arcadeBtn} ${styles.btnYellow} ${pressedButton === 'C' ? styles.pressed : ''}`}
                    >
                      C
                    </button>
                  </div>
                  <span className={styles.deckLabel}>ACTIONS [Z, X, SPACE]</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= GAME BOY DMG ENCLOSURE ================= */}
      {displayMode === 'gameboy' && (
        <div className={styles.gameboyChassis}>
          <div className={styles.gameboyTopBevel}>
            <div className={styles.offOnSwitch}>
              <span className={styles.switchLine} />
              <span className={styles.switchText}>OFF • ON</span>
            </div>
          </div>

          {/* Dot Matrix Screen Bezel */}
          <div className={styles.gameboyScreenSurround}>
            <div className={styles.screenHeaderStripe}>
              <div className={styles.batteryIndicator}>
                <div className={`${styles.batteryLed} ${styles.on}`} />
                <span>BATTERY</span>
              </div>
              <span className={styles.dotMatrixText}>DOT MATRIX WITH STEREO SOUND</span>
            </div>

            <div className={`${styles.gameboyScreenViewport} ${scanlinesEnabled ? styles.withScanlines : ''}`}>
              <div className={styles.screenViewport}>{children}</div>
            </div>
          </div>

          {/* Game Boy Branding */}
          <div className={styles.gameboyBrandRow}>
            <span className={styles.nintendoLogo}>Shugmi</span>
            <span className={styles.gameboyLogo}>GAME BOY</span>
            <span className={styles.colorBadge}>TM</span>
          </div>

          {/* Game Boy Controls Area */}
          <div className={styles.gameboyControlsArea}>
            {/* D-Pad */}
            <div className={styles.dpadHousing}>
              <div className={styles.dpadCross}>
                <button
                  type="button"
                  className={`${styles.dpadBtn} ${styles.up}`}
                  onClick={() => triggerDirection('up', 0, -10)}
                  aria-label="Up"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 4 4 20 20 20"/></svg>
                </button>
                <button
                  type="button"
                  className={`${styles.dpadBtn} ${styles.right}`}
                  onClick={() => triggerDirection('right', 10, 0)}
                  aria-label="Right"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="20 12 4 4 4 20"/></svg>
                </button>
                <button
                  type="button"
                  className={`${styles.dpadBtn} ${styles.down}`}
                  onClick={() => triggerDirection('down', 0, 10)}
                  aria-label="Down"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 20 4 4 20 4"/></svg>
                </button>
                <button
                  type="button"
                  className={`${styles.dpadBtn} ${styles.left}`}
                  onClick={() => triggerDirection('left', -10, 0)}
                  aria-label="Left"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="4 12 20 4 20 20"/></svg>
                </button>
                <div className={styles.dpadCenterIndent} />
              </div>
            </div>

            {/* A and B Buttons (angled) */}
            <div className={styles.abButtonsHousing}>
              <div className={styles.angledBtnPill}>
                <button
                  type="button"
                  onClick={() => triggerButton('B')}
                  className={`${styles.gbRoundBtn} ${styles.btnB} ${pressedButton === 'B' ? styles.pressed : ''}`}
                >
                  B
                </button>
                <span className={styles.btnLabel}>B</span>
              </div>
              <div className={styles.angledBtnPill}>
                <button
                  type="button"
                  onClick={() => triggerButton('A')}
                  className={`${styles.gbRoundBtn} ${styles.btnA} ${pressedButton === 'A' ? styles.pressed : ''}`}
                >
                  A
                </button>
                <span className={styles.btnLabel}>A</span>
              </div>
            </div>
          </div>

          {/* Select & Start Pill Buttons + Speaker Slits */}
          <div className={styles.gameboyBottomRow}>
            <div className={styles.selectStartCluster}>
              <div className={styles.pillWrapper}>
                <button
                  type="button"
                  onClick={() => triggerButton('COIN')}
                  className={styles.gbPillBtn}
                />
                <span className={styles.pillText}>SELECT</span>
              </div>
              <div className={styles.pillWrapper}>
                <button
                  type="button"
                  onClick={() => triggerButton('1P')}
                  className={styles.gbPillBtn}
                />
                <span className={styles.pillText}>START</span>
              </div>
            </div>

            {/* Speaker Slits */}
            <div className={styles.speakerSlits}>
              <div className={styles.slit} />
              <div className={styles.slit} />
              <div className={styles.slit} />
              <div className={styles.slit} />
              <div className={styles.slit} />
              <div className={styles.slit} />
            </div>
          </div>
        </div>
      )}

      {/* ================= FULLSCREEN DIRECT PLAY ================= */}
      {displayMode === 'fullscreen' && (
        <div className={`${styles.fullscreenViewContainer} ${scanlinesEnabled ? styles.withScanlines : ''}`}>
          <div className={styles.screenViewport}>{children}</div>
        </div>
      )}
    </div>
  );
};
