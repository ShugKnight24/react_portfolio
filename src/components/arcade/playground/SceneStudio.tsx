import { FC, JSX, useState } from 'react';
import { sound } from '../audio/audioSynth';
import { defaultCharacters, getCustomCharacters } from '../data/characterRoster';
import {
  BasketballIcon,
  CameraIcon,
  CitySkylineIcon,
  CodeIcon,
  JoystickIcon,
  LaptopIcon,
  MountainIcon,
  SparkleIcon,
  StudioIcon,
  TerminalIcon
} from '../icons/ArcadeIcons';
import { SpriteRenderer } from '../sprites/SpriteRenderer';
import { LightingMood, SceneId, SceneStageItem, SpriteCharacter, WeatherEffect } from '../types';
import styles from './SceneStudio.module.css';

interface SceneThemeConfig {
  id: SceneId;
  name: string;
  icon: (size?: number) => JSX.Element;
  desc: string;
}

const SCENE_THEMES: SceneThemeConfig[] = [
  { id: 'detroit', name: 'Detroit Skyline', icon: (s = 16) => <CitySkylineIcon size={s} />, desc: 'Renaissance Center & Ambassador Bridge at dusk' },
  { id: 'matrix', name: 'Cyber Matrix', icon: (s = 16) => <TerminalIcon size={s} />, desc: 'Digital rain streams over neon wireframe' },
  { id: 'arcade', name: 'Neon Arcade', icon: (s = 16) => <JoystickIcon size={s} />, desc: '1990s retro arcade floor with cabinet glow' },
  { id: 'court', name: 'Arena Hardwood', icon: (s = 16) => <BasketballIcon size={s} />, desc: 'Championship court with arena spotlights' },
  { id: 'devroom', name: 'Cozy Dev Den', icon: (s = 16) => <LaptopIcon size={s} />, desc: 'Dual displays, steaming mug, and lofi vibes' },
  { id: 'rooftop', name: 'Anime Rooftop', icon: (s = 16) => <MountainIcon size={s} />, desc: 'Tokyo twilight sunset with floating cherry blossoms' },
];

const LIGHTING_MOODS: { id: LightingMood; label: string; desc: string }[] = [
  { id: 'studio', label: 'Studio Spot', desc: 'Crisp spotlighting and studio neutral tone' },
  { id: 'cyber', label: 'Cyberpunk', desc: 'Neon cyan and magenta bilateral tint' },
  { id: 'dusk', label: 'Golden Dusk', desc: 'Warm amber sunset glow' },
  { id: 'noir', label: 'Film Noir', desc: 'Moody monochrome contrast vignette' },
  { id: 'matrixGreen', label: 'CRT Phosphor', desc: 'Monochrome green terminal bloom' },
];

const SPEECH_PRESETS = [
  'Detroit made me!',
  'No shortcuts.',
  'Code is poetry.',
  'I will find them.',
  'Mamba Mentality.',
  'Let\'s build something legendary.',
];

export const SceneStudio: FC = () => {
  const [currentScene, setCurrentScene] = useState<SceneId>('detroit');
  const [weather, setWeather] = useState<WeatherEffect>('stars');
  const [lighting, setLighting] = useState<LightingMood>('studio');
  const [flashActive, setFlashActive] = useState(false);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);

  const [stageItems, setStageItems] = useState<SceneStageItem[]>([
    { instanceId: 'init-1', characterId: 'shugmi', x: 30, y: 65, scale: 1.1, facingLeft: false, rotation: 0, zIndex: 1, speech: 'Detroit made me!' },
    { instanceId: 'init-2', characterId: 'luna', x: 68, y: 68, scale: 0.9, facingLeft: true, rotation: 0, zIndex: 2, speech: 'Ready to build!' },
  ]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>('init-1');

  const allCharacters: SpriteCharacter[] = [
    ...getCustomCharacters(),
    ...defaultCharacters,
  ];

  const selectedItem = stageItems.find((i) => i.instanceId === selectedInstanceId);
  const selectedCharacter = selectedItem ? allCharacters.find((c) => c.id === selectedItem.characterId) : null;

  const handleAddCharacter = (charId: string) => {
    if (stageItems.length >= 6) {
      sound.playBeep(220, 0.1);
      return;
    }
    sound.playJump();
    const maxZ = stageItems.reduce((acc, curr) => Math.max(acc, curr.zIndex || 1), 1);
    const newItem: SceneStageItem = {
      instanceId: `item_${Date.now()}`,
      characterId: charId,
      x: 25 + Math.random() * 50,
      y: 50 + Math.random() * 25,
      scale: 1,
      facingLeft: false,
      rotation: 0,
      zIndex: maxZ + 1,
      speech: '',
    };
    setStageItems((prev) => [...prev, newItem]);
    setSelectedInstanceId(newItem.instanceId);
  };

  const handleRemoveItem = (instanceId: string) => {
    sound.playBeep(300, 0.08);
    setStageItems((prev) => prev.filter((i) => i.instanceId !== instanceId));
    if (selectedInstanceId === instanceId) {
      setSelectedInstanceId(null);
    }
  };

  const handleFlipItem = (instanceId: string) => {
    sound.playBeep(600, 0.04);
    setStageItems((prev) =>
      prev.map((i) => (i.instanceId === instanceId ? { ...i, facingLeft: !i.facingLeft } : i))
    );
  };

  const handleScaleItem = (instanceId: string, delta: number) => {
    sound.playBeep(700, 0.04);
    setStageItems((prev) =>
      prev.map((i) => {
        if (i.instanceId === instanceId) {
          const newScale = Math.max(0.5, Math.min(2.0, i.scale + delta));
          return { ...i, scale: Number(newScale.toFixed(1)) };
        }
        return i;
      })
    );
  };

  const handleRotateItem = (instanceId: string, deltaDeg: number) => {
    sound.playBeep(640, 0.04);
    setStageItems((prev) =>
      prev.map((i) => {
        if (i.instanceId === instanceId) {
          const newRot = ((i.rotation || 0) + deltaDeg) % 360;
          return { ...i, rotation: newRot };
        }
        return i;
      })
    );
  };

  const handleZIndex = (instanceId: string, direction: 'front' | 'back') => {
    sound.playBeep(550, 0.04);
    setStageItems((prev) => {
      const target = prev.find((i) => i.instanceId === instanceId);
      if (!target) return prev;
      const currentZ = target.zIndex || 1;
      const newZ = direction === 'front' ? currentZ + 5 : Math.max(1, currentZ - 5);
      return prev.map((i) => (i.instanceId === instanceId ? { ...i, zIndex: newZ } : i));
    });
  };

  const handleSpeechChange = (instanceId: string, text: string) => {
    setStageItems((prev) =>
      prev.map((i) => (i.instanceId === instanceId ? { ...i, speech: text } : i))
    );
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedInstanceId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    if (clickY < 20) return; // Keep off ceiling

    setStageItems((prev) =>
      prev.map((i) =>
        i.instanceId === selectedInstanceId
          ? { ...i, x: Math.round(clickX), y: Math.round(clickY) }
          : i
      )
    );
  };

  const handleTriggerSnapshot = () => {
    sound.playPowerUp();
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 350);

    const stageConfig = {
      scene: currentScene,
      weather,
      lighting,
      characters: stageItems.map((item) => ({
        id: item.characterId,
        x: item.x,
        y: item.y,
        scale: item.scale,
        facingLeft: item.facingLeft,
        rotation: item.rotation,
        speech: item.speech,
      })),
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(stageConfig, null, 2)).catch(() => {});
    }

    setSnapshotToast('Snapshot frame captured! Scene config copied to clipboard.');
    setTimeout(() => setSnapshotToast(null), 3500);
  };

  return (
    <div className={styles.arcadeSceneStudio}>
      {/* Studio Header */}
      <div className={styles.studioHeader}>
        <div>
          <h2 className={styles.studioTitle}>
            <StudioIcon size={20} className={styles.retroIcon} /> SCENE BUILDER & STAGE STUDIO
          </h2>
          <p className={styles.studioSubtitle}>
            Craft custom animated dioramas. Position legends, adjust lighting moods, attach comic speech bubbles, and frame the shot.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={handleTriggerSnapshot}
            className={styles.snapshotBtn}
            title="Take a high-res snapshot of current stage setup"
          >
            <CameraIcon size={16} />
            <span>SNAPSHOT FRAME</span>
          </button>
        </div>
      </div>

      {/* Scene Background Theme Picker */}
      <div className={styles.studioTopControls}>
        <div className={styles.sceneThemePicker}>
          <span className={styles.controlLabel}>BACKDROP:</span>
          {SCENE_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => {
                sound.playBeep(587.33, 0.05);
                setCurrentScene(theme.id);
              }}
              className={`${styles.themeBtn} ${currentScene === theme.id ? styles.active : ''}`}
              title={theme.desc}
            >
              <span>{theme.icon(14)}</span>
              <span>{theme.name}</span>
            </button>
          ))}
        </div>

        {/* Lighting Moods */}
        <div className={styles.lightingMoodPicker}>
          <span className={styles.controlLabel}>LIGHTING:</span>
          {LIGHTING_MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              onClick={() => {
                sound.playBeep(620, 0.04);
                setLighting(mood.id);
              }}
              className={`${styles.moodChip} ${lighting === mood.id ? styles.active : ''}`}
              title={mood.desc}
            >
              {mood.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        className={`${styles.sceneStage} ${styles[`stage-${currentScene}`] || ''} ${styles[`weather-${weather}`] || ''} ${styles[`mood-${lighting}`] || ''}`}
        onClick={handleStageClick}
      >
        {/* Flash Overlay */}
        {flashActive && <div className={styles.cameraFlashOverlay} />}

        {/* Snapshot Toast notification */}
        {snapshotToast && (
          <div className={styles.stageToastBanner}>
            <CameraIcon size={14} />
            <span>{snapshotToast}</span>
          </div>
        )}

        {/* Lighting Atmosphere Tint Layer */}
        <div className={`${styles.atmosphereTint} ${styles[`mood-${lighting}`] || ''}`} />

        {/* Weather / Ambient Effect Overlay */}
        <div className={styles.weatherParticleLayer}>
          {weather === 'matrixRain' && (
            <div className={styles.matrixRainEffect}>
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className={styles.rainCol} style={{ left: `${i * 6.5}%`, animationDelay: `${i * 0.2}s` }}>
                  0101011001
                </div>
              ))}
            </div>
          )}

          {weather === 'codeFloat' && (
            <div className={styles.codeFloatLayer}>
              <span className={`${styles.floatCode} ${styles.c1}`}>&lt;Component /&gt;</span>
              <span className={`${styles.floatCode} ${styles.c2}`}>git push origin main</span>
              <span className={`${styles.floatCode} ${styles.c3}`}>npm run ship</span>
              <span className={`${styles.floatCode} ${styles.c4}`}>async function build()</span>
            </div>
          )}

          {weather === 'sakura' && (
            <div className={styles.sakuraLayer}>
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className={styles.sakuraPetal} style={{ left: `${i * 8.5}%`, animationDelay: `${i * 0.4}s` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#f472b6">
                    <path d="M12 2C9 7 4 10 4 14a8 8 0 0 0 16 0c0-4-5-7-8-12z" />
                  </svg>
                </span>
              ))}
            </div>
          )}

          {weather === 'confetti' && (
            <div className={styles.confettiLayer}>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className={styles.confettiDot} style={{ left: `${i * 6.5}%`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}

          {weather === 'stars' && (
            <div className={styles.starsLayer}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={styles.twinkleStar}
                  style={{
                    left: `${(i * 17) % 96}%`,
                    top: `${(i * 23) % 75}%`,
                    animationDelay: `${(i * 0.3) % 2}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Stage Environment Art */}
        <div className={styles.stageSceneryBackdrop}>
          {currentScene === 'detroit' && (
            <div className={styles.sceneryDetroit}>
              <div className={styles.scenerySky} />
              <svg className={styles.scenerySkylineSvg} viewBox="0 0 1000 300" preserveAspectRatio="none">
                <rect x="100" y="80" width="80" height="220" fill="#0f172a" />
                <rect x="220" y="40" width="110" height="260" fill="#1e293b" />
                <polygon points="275,10 240,40 310,40" fill="#38bdf8" opacity="0.8" />
                <rect x="360" y="110" width="70" height="190" fill="#0f172a" />
                <rect x="460" y="60" width="140" height="240" fill="#1e293b" />
                <rect x="630" y="130" width="60" height="170" fill="#0f172a" />
                <rect x="720" y="90" width="100" height="210" fill="#1e293b" />
                <rect x="850" y="120" width="80" height="180" fill="#0f172a" />
              </svg>
              <div className={styles.sceneryRiver} />
            </div>
          )}

          {currentScene === 'court' && (
            <div className={styles.sceneryCourt}>
              <div className={styles.arenaLights} />
              <div className={styles.arenaHoop}>
                <div className={styles.backboard} />
                <div className={styles.rim} />
              </div>
              <div className={styles.hardwoodFloor} />
            </div>
          )}

          {currentScene === 'arcade' && (
            <div className={styles.sceneryArcade}>
              <div className={styles.neonArcadeSign}>NEON ZONE 90s</div>
              <div className={styles.cabinetSilhouetteRow}>
                <div className={styles.cabSil} />
                <div className={styles.cabSil} />
                <div className={styles.cabSil} />
                <div className={styles.cabSil} />
              </div>
              <div className={styles.arcadeCarpetFloor} />
            </div>
          )}

          {currentScene === 'matrix' && (
            <div className={styles.sceneryMatrix}>
              <div className={styles.matrixWireframeGrid} />
            </div>
          )}

          {currentScene === 'devroom' && (
            <div className={styles.sceneryDevroom}>
              <div className={styles.dualMonitorDesk}>
                <div className={`${styles.monitorUnit} ${styles.mon1}`} />
                <div className={`${styles.monitorUnit} ${styles.mon2}`} />
                <div className={styles.deskSurface} />
              </div>
            </div>
          )}

          {currentScene === 'rooftop' && (
            <div className={styles.sceneryRooftop}>
              <div className={styles.sunsetGradient} />
              <div className={styles.distantMountains} />
              <div className={styles.rooftopFence} />
            </div>
          )}
        </div>

        {/* Sprites positioned on the stage */}
        {stageItems.map((item) => {
          const char = allCharacters.find((c) => c.id === item.characterId);
          if (!char) return null;
          const isSelected = item.instanceId === selectedInstanceId;

          return (
            <div
              key={item.instanceId}
              className={`${styles.stageSpriteWrapper} ${isSelected ? styles.selected : ''}`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                zIndex: item.zIndex || 1,
                transform: `translate(-50%, -100%) scale(${item.scale}) rotate(${item.rotation || 0}deg) ${
                  item.facingLeft ? 'scaleX(-1)' : ''
                }`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                sound.playBeep(650, 0.04);
                setSelectedInstanceId(item.instanceId);
              }}
            >
              {/* Comic Speech Bubble */}
              {item.speech && (
                <div
                  className={styles.spriteSpeechBubble}
                  style={{
                    transform: item.facingLeft ? 'scaleX(-1)' : 'none',
                  }}
                >
                  <span className={styles.speechText}>{item.speech}</span>
                  <div className={styles.bubbleArrow} />
                </div>
              )}

              <SpriteRenderer
                character={char}
                action={isSelected ? 'happy' : 'idle'}
                size={110}
              />
              {isSelected && <div className={styles.selectedGlowRing} />}
            </div>
          );
        })}

        <div className={styles.stageTipHint}>
          {selectedInstanceId
            ? 'Click anywhere on the floor to position selected character'
            : 'Click a character to select, rotate, layer, or attach speech'}
        </div>
      </div>

      {/* Stage Controls & Roster Tray */}
      <div className={styles.studioBottomTray}>
        {/* Selected item options */}
        {selectedInstanceId && selectedCharacter && (
          <div className={styles.selectedItemBar}>
            <div className={styles.itemMeta}>
              <span className={styles.barLabel}>
                SELECTED: <strong>{selectedCharacter.name}</strong>
              </span>

              {/* Speech bubble edit field */}
              <div className={styles.speechInputGroup}>
                <input
                  type="text"
                  value={selectedItem?.speech || ''}
                  onChange={(e) => handleSpeechChange(selectedInstanceId, e.target.value)}
                  placeholder="Type speech bubble..."
                  maxLength={40}
                  className={styles.speechTextInput}
                />
                <div className={styles.speechPresets}>
                  {SPEECH_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSpeechChange(selectedInstanceId, preset)}
                      className={styles.presetChip}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.itemActionButtons}>
              <button
                type="button"
                onClick={() => handleFlipItem(selectedInstanceId)}
                className={styles.stageCtrlBtn}
                title="Flip Facing Direction"
              >
                Flip
              </button>
              <button
                type="button"
                onClick={() => handleRotateItem(selectedInstanceId, -15)}
                className={styles.stageCtrlBtn}
                title="Tilt Left (-15°)"
              >
                Tilt ↶
              </button>
              <button
                type="button"
                onClick={() => handleRotateItem(selectedInstanceId, 15)}
                className={styles.stageCtrlBtn}
                title="Tilt Right (+15°)"
              >
                Tilt ↷
              </button>
              <button
                type="button"
                onClick={() => handleScaleItem(selectedInstanceId, 0.1)}
                className={styles.stageCtrlBtn}
                title="Enlarge Sprite"
              >
                + Size
              </button>
              <button
                type="button"
                onClick={() => handleScaleItem(selectedInstanceId, -0.1)}
                className={styles.stageCtrlBtn}
                title="Shrink Sprite"
              >
                - Size
              </button>
              <button
                type="button"
                onClick={() => handleZIndex(selectedInstanceId, 'front')}
                className={styles.stageCtrlBtn}
                title="Bring To Front"
              >
                Bring Front
              </button>
              <button
                type="button"
                onClick={() => handleZIndex(selectedInstanceId, 'back')}
                className={styles.stageCtrlBtn}
                title="Send To Back"
              >
                Send Back
              </button>
              <button
                type="button"
                onClick={() => handleRemoveItem(selectedInstanceId)}
                className={`${styles.stageCtrlBtn} ${styles.delete}`}
                title="Remove From Stage"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Weather selector */}
        <div className={styles.weatherSelectorRow}>
          <span className={styles.traySectionTitle}>WEATHER / PARTICLES:</span>
          {[
            { id: 'none', label: 'Clear', icon: null },
            { id: 'stars', label: 'Stars', icon: <SparkleIcon size={14} /> },
            { id: 'matrixRain', label: 'Matrix', icon: <TerminalIcon size={14} /> },
            { id: 'codeFloat', label: 'Code', icon: <CodeIcon size={14} /> },
            { id: 'sakura', label: 'Sakura', icon: <MountainIcon size={14} /> },
            { id: 'confetti', label: 'Confetti', icon: <SparkleIcon size={14} /> },
          ].map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                sound.playBeep(493.88, 0.04);
                setWeather(w.id as WeatherEffect);
              }}
              className={`${styles.weatherChip} ${weather === w.id ? styles.active : ''}`}
            >
              {w.icon}
              <span>{w.label}</span>
            </button>
          ))}
        </div>

        {/* Spawn Character onto stage */}
        <div className={styles.rosterTray}>
          <span className={styles.traySectionTitle}>SPAWN ONTO STAGE ({stageItems.length}/6):</span>
          <div className={styles.rosterScrollRow}>
            {allCharacters.map((char) => (
              <button
                key={char.id}
                type="button"
                onClick={() => handleAddCharacter(char.id)}
                className={styles.spawnCharChip}
              >
                <SpriteRenderer character={char} size={36} />
                <span>+ {char.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneStudio;
