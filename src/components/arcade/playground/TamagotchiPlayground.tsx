import { FC, useEffect, useState } from 'react';
import { sound } from '../audio/audioSynth';
import { defaultCharacters, getCustomCharacters } from '../data/characterRoster';
import {
  AppleIcon,
  BallIcon,
  BoltIcon,
  BowlIcon,
  CheckIcon,
  CoffeeIcon,
  CreatorIcon,
  EnergyIcon,
  GalleryIcon,
  HeartIcon,
  MoonIcon,
  PizzaIcon,
  ShowerIcon,
  SparkleIcon,
  StopIcon,
  SunIcon,
  TargetBugIcon,
  TrophyIcon
} from '../icons/ArcadeIcons';
import { SpriteRenderer } from '../sprites/SpriteRenderer';
import { SpriteAction, SpriteCharacter, TamagotchiVitals } from '../types';
import styles from './TamagotchiPlayground.module.css';
import { onTabListKeyDown } from '../../../utils/tablistKeys';

interface TamagotchiPlaygroundProps {
  initialCompanionId?: string;
  onGoToGallery?: () => void;
  onGoToCreator?: () => void;
  embedded?: boolean;
}

const STORAGE_KEY_VITALS = 'arcade_tamagotchi_vitals';
const STORAGE_KEY_LEGACY = 'tamagotchi_vitals';
const STORAGE_KEY_V8 = 'v8_tamagotchi_vitals';

type ActionCategory = 'feed' | 'play' | 'care' | 'rest';

interface FloatingParticle {
  id: number;
  type: 'heart' | 'crumb' | 'bubble' | 'zzz' | 'exp';
  text?: string;
  x: number;
  y: number;
}

export const TamagotchiPlayground: FC<TamagotchiPlaygroundProps> = ({
  initialCompanionId,
  onGoToGallery,
  onGoToCreator,
  embedded = true,
}) => {
  const [showToyShell, setShowToyShell] = useState<boolean>(!embedded);
  // Load roster
  const [allCharacters, setAllCharacters] = useState<SpriteCharacter[]>(() => {
    const custom = getCustomCharacters();
    return [...defaultCharacters, ...custom];
  });

  const [activeCharacterId, setActiveCharacterId] = useState<string>(
    initialCompanionId || defaultCharacters[0].id
  );

  const activeCharacter =
    allCharacters.find((c) => c.id === activeCharacterId) || defaultCharacters[0];

  // Tamagotchi Vitals state with local persistence
  const [vitals, setVitals] = useState<TamagotchiVitals>(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY_VITALS) ||
        localStorage.getItem(STORAGE_KEY_LEGACY) ||
        localStorage.getItem(STORAGE_KEY_V8);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      hunger: 85,
      happiness: 90,
      energy: 95,
      level: 1,
      exp: 15,
      lastInteraction: Date.now(),
    };
  });

  const [action, setAction] = useState<SpriteAction>('idle');
  const [activeCategory, setActiveCategory] = useState<ActionCategory>('feed');
  const [message, setMessage] = useState<string>('Ready to play, train, and level up!');
  const [isSleeping, setIsSleeping] = useState<boolean>(false);
  const [activeMiniGame, setActiveMiniGame] = useState<boolean>(false);
  const [miniGameScore, setMiniGameScore] = useState<number>(0);
  const [miniGameTarget, setMiniGameTarget] = useState<{ x: number; y: number; type: 'bug' | 'bolt' | 'sparkle' } | null>(null);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [ballInPlay, setBallInPlay] = useState<boolean>(false);
  const [ballPosition, setBallPosition] = useState<{ x: number; y: number }>({ x: 50, y: 70 });
  const [foodDrop, setFoodDrop] = useState<{ active: boolean; icon: 'pizza' | 'ramen' | 'coffee' | 'energy' | 'apple' } | null>(null);

  // Sync initialCompanionId if parent changes it
  useEffect(() => {
    if (initialCompanionId) {
      setActiveCharacterId(initialCompanionId);
    }
  }, [initialCompanionId]);

  // Persist vitals
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VITALS, JSON.stringify(vitals));
    } catch {
      // ignore
    }
  }, [vitals]);

  // Natural slow decay of hunger & energy
  useEffect(() => {
    const interval = setInterval(() => {
      setVitals((prev) => ({
        ...prev,
        hunger: Math.max(0, prev.hunger - 1),
        energy: isSleeping ? Math.min(100, prev.energy + 5) : Math.max(0, prev.energy - 1),
        happiness: prev.hunger < 20 ? Math.max(0, prev.happiness - 2) : prev.happiness,
      }));
    }, 15000);
    return () => clearInterval(interval);
  }, [isSleeping]);

  // Spawn floating particle helper
  const spawnParticles = (type: FloatingParticle['type'], count = 3, text?: string) => {
    const newItems: FloatingParticle[] = Array.from({ length: count }).map(() => ({
      id: Date.now() + Math.random(),
      type,
      text,
      x: 40 + Math.random() * 20,
      y: 40 + Math.random() * 25,
    }));
    setParticles((prev) => [...prev, ...newItems]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newItems.some((n) => n.id === p.id)));
    }, 1400);
  };

  const addExp = (amount: number) => {
    spawnParticles('exp', 1, `+${amount} EXP`);
    setVitals((prev) => {
      const newExp = prev.exp + amount;
      const nextLevelExp = prev.level * 100;
      if (newExp >= nextLevelExp) {
        sound.playPowerUp();
        setMessage(`LEVEL UP! ${activeCharacter.name} reached Level ${prev.level + 1}!`);
        spawnParticles('heart', 6);
        return {
          ...prev,
          level: prev.level + 1,
          exp: newExp - nextLevelExp,
        };
      }
      return { ...prev, exp: newExp };
    });
  };

  // Pet action
  const handlePet = () => {
    if (isSleeping) {
      handleWakeUp();
      return;
    }
    sound.playJump();
    setAction('bounce');
    spawnParticles('heart', 4);
    setMessage(`You petted ${activeCharacter.name}! Bond strengthened.`);
    setVitals((prev) => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 8),
    }));
    addExp(8);

    setTimeout(() => {
      setAction('idle');
    }, 600);
  };

  // Feed action
  const handleFeed = (
    foodName: string,
    hungerBoost: number,
    energyBoost = 0,
    happyBoost = 6,
    iconType: 'pizza' | 'ramen' | 'coffee' | 'energy' | 'apple' = 'pizza'
  ) => {
    if (isSleeping) {
      setMessage(`Shhh! ${activeCharacter.name} is napping peacefully. Wake them up first!`);
      return;
    }
    sound.playEat();
    setAction('eating');
    setFoodDrop({ active: true, icon: iconType });
    spawnParticles('crumb', 5);
    setMessage(`Yum! ${activeCharacter.name} happily devoured the ${foodName}!`);

    setVitals((prev) => ({
      ...prev,
      hunger: Math.min(100, prev.hunger + hungerBoost),
      happiness: Math.min(100, prev.happiness + happyBoost),
      energy: Math.min(100, prev.energy + energyBoost),
    }));
    addExp(14);

    setTimeout(() => {
      setFoodDrop(null);
      setAction('happy');
      spawnParticles('heart', 3);
      setTimeout(() => setAction('idle'), 1000);
    }, 1200);
  };

  // Groom & Clean
  const handleGroom = () => {
    if (isSleeping) {
      handleWakeUp();
      return;
    }
    sound.playJump();
    setAction('happy');
    spawnParticles('bubble', 6);
    setMessage(`${activeCharacter.name} is feeling squeaky clean, shiny, and refreshed!`);
    setVitals((prev) => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 12),
      energy: Math.min(100, prev.energy + 5),
    }));
    addExp(10);
    setTimeout(() => setAction('idle'), 1000);
  };

  // Play Fetch / Ball Toss
  const handleTossBall = () => {
    if (isSleeping) {
      setMessage(`Wake up ${activeCharacter.name} before tossing the ball!`);
      return;
    }
    sound.playJump();
    setBallInPlay(true);
    setBallPosition({ x: 25 + Math.random() * 50, y: 55 + Math.random() * 20 });
    setAction('bounce');
    setMessage(`${activeCharacter.name} chased down the ball like a champion!`);
    spawnParticles('heart', 4);

    setVitals((prev) => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 14),
      energy: Math.max(0, prev.energy - 6),
      hunger: Math.max(0, prev.hunger - 4),
    }));
    addExp(16);

    setTimeout(() => {
      setBallInPlay(false);
      setAction('happy');
      setTimeout(() => setAction('idle'), 800);
    }, 1100);
  };

  // Victory celebration
  const handleCheer = () => {
    if (isSleeping) return;
    sound.playPowerUp();
    setAction('celebrate');
    spawnParticles('heart', 5);
    setMessage(`“${activeCharacter.quote}”`);
    setVitals((prev) => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 10),
    }));
    addExp(10);
    setTimeout(() => setAction('idle'), 1400);
  };

  const toggleSleep = () => {
    if (isSleeping) {
      handleWakeUp();
    } else {
      sound.playSleep();
      setIsSleeping(true);
      setAction('sleeping');
      spawnParticles('zzz', 4);
      setMessage(`${activeCharacter.name} is resting... Powering up energy cells.`);
    }
  };

  const handleWakeUp = () => {
    sound.playBeep(523.25, 0.08);
    setIsSleeping(false);
    setAction('idle');
    setMessage(`${activeCharacter.name} woke up energized and ready to roll!`);
  };

  // Mini-game logic: Bug squasher
  const startMiniGame = () => {
    if (isSleeping) handleWakeUp();
    sound.playCoin();
    setActiveMiniGame(true);
    setMiniGameScore(0);
    spawnTarget();
  };

  const spawnTarget = () => {
    const x = 12 + Math.random() * 76;
    const y = 20 + Math.random() * 58;
    const types: ('bug' | 'bolt' | 'sparkle')[] = ['bug', 'bolt', 'sparkle'];
    const chosen = types[Math.floor(Math.random() * types.length)];
    setMiniGameTarget({ x, y, type: chosen });
  };

  const handleCatchTarget = () => {
    sound.playCoin();
    setMiniGameScore((s) => s + 1);
    addExp(15);
    setVitals((prev) => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 5),
    }));
    setAction('happy');
    spawnParticles('heart', 2);
    setTimeout(() => setAction('idle'), 300);
    spawnTarget();
  };

  const endMiniGame = () => {
    sound.playBeep(400, 0.1);
    setActiveMiniGame(false);
    setMiniGameTarget(null);
    setMessage(`Mini-Game Over! You squashed ${miniGameScore} bugs!`);
  };

  // Dynamic Mood indicator
  const getMoodBadge = () => {
    if (isSleeping) return { label: 'Resting Zzz', color: '#818cf8' };
    if (vitals.hunger < 25) return { label: 'Famished', color: '#ef4444' };
    if (vitals.energy < 25) return { label: 'Exhausted', color: '#f59e0b' };
    if (vitals.happiness > 85) return { label: 'Ecstatic', color: '#ec4899' };
    if (vitals.happiness > 50) return { label: 'Content', color: '#10b981' };
    return { label: 'Playful', color: '#38bdf8' };
  };

  const mood = getMoodBadge();

  // Segmented meter helper (5 slots)
  const renderSegmentedMeter = (value: number, activeColor: string) => {
    const filledSegments = Math.round((value / 100) * 5);
    return (
      <div className={styles.segmentedMeter} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        {[1, 2, 3, 4, 5].map((seg) => (
          <span
            key={seg}
            className={`${styles.meterPip} ${seg <= filledSegments ? styles.filled : ''}`}
            style={{
              backgroundColor: seg <= filledSegments ? activeColor : undefined,
              boxShadow: seg <= filledSegments ? `0 0 6px ${activeColor}` : undefined,
            }}
          />
        ))}
      </div>
    );
  };

  const renderInnerContent = () => (
    <div className={styles.tamagotchiInnerBezel}>
      {/* Chassis Corner Rivets (only visible in toy shell mode) */}
      {showToyShell && (
        <>
          <span className={`${styles.chassisRivet} ${styles.topLeft}`} />
          <span className={`${styles.chassisRivet} ${styles.topRight}`} />
          <span className={`${styles.chassisRivet} ${styles.bottomLeft}`} />
          <span className={`${styles.chassisRivet} ${styles.bottomRight}`} />
        </>
      )}

      {/* Model Banner */}
      <div className={styles.chassisHeaderStripe}>
        <span className={styles.deviceBrandTag}>POCKET COMPANION</span>
        <span className={styles.deviceModelNo}>DIGITAL PET // REVIVAL</span>
        <div className={styles.statusLiveDot} />
      </div>

          {/* Companion Profile & Switcher Deck */}
          <div className={styles.companionProfileDeck}>
            <div className={styles.companionCardInfo}>
              <div
                className={styles.companionAvatarRing}
                style={{ borderColor: activeCharacter.primaryColor }}
              >
                <SpriteRenderer character={activeCharacter} size={42} />
              </div>

              <div className={styles.companionMetaTexts}>
                <div className={styles.nameMoodRow}>
                  <h3 className={styles.companionName}>{activeCharacter.name}</h3>
                  <span
                    className={styles.moodPill}
                    style={{ backgroundColor: `${mood.color}22`, color: mood.color, borderColor: `${mood.color}55` }}
                  >
                    {mood.label}
                  </span>
                </div>
                <span className={styles.companionTitleTag}>{activeCharacter.title}</span>
              </div>
            </div>

            {/* Switcher & Links */}
            <div className={styles.deckActionLinks}>
              <div className={styles.selectContainer}>
                <select
                  id="companion-select"
                  aria-label="Active Companion"
                  value={activeCharacterId}
                  onChange={(e) => {
                    sound.playBeep(440, 0.05);
                    setActiveCharacterId(e.target.value);
                    setMessage(`Switched companion to ${e.target.selectedOptions[0].text}!`);
                  }}
                  className={styles.companionSelectDropdown}
                >
                  {allCharacters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name} ({char.title})
                    </option>
                  ))}
                </select>
              </div>

              {onGoToGallery && (
                <button type="button" onClick={onGoToGallery} className={styles.deckQuickBtn} title="Hero Gallery">
                  <GalleryIcon size={14} />
                  <span>Gallery</span>
                </button>
              )}
              {onGoToCreator && (
                <button type="button" onClick={onGoToCreator} className={styles.deckQuickBtn} title="Character Creator">
                  <CreatorIcon size={14} />
                  <span>Creator</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowToyShell((s) => !s)}
                className={styles.deckQuickBtn}
                title={showToyShell ? 'Switch to embedded view' : 'Switch to handheld keychain shell'}
              >
                <span>{showToyShell ? 'Shell: ON' : 'Shell: OFF'}</span>
              </button>
            </div>
          </div>

          {/* Vitals Segmented Dashboard */}
          <div className={styles.vitalsDashboardCluster}>
            {/* Level & XP Box */}
            <div className={styles.levelXpPod}>
              <div className={styles.levelBadge}>
                <span className={styles.lvlPrefix}>LV</span>
                <span className={styles.lvlNumber}>{vitals.level}</span>
              </div>
              <div className={styles.xpDetails}>
                <div className={styles.xpLabelRow}>
                  <span>EXP</span>
                  <span>
                    {vitals.exp} / {vitals.level * 100}
                  </span>
                </div>
                <div className={styles.xpBarTrack}>
                  <div
                    className={styles.xpBarFill}
                    style={{ width: `${Math.min(100, (vitals.exp / (vitals.level * 100)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Segmented Meters Grid */}
            <div className={styles.metersGrid}>
              <div className={styles.meterPod}>
                <div className={styles.meterPodHeader}>
                  <PizzaIcon size={14} className={styles.meterGlyph} />
                  <span className={styles.meterPodLabel}>HUNGER</span>
                  <span className={styles.meterPct}>{vitals.hunger}%</span>
                </div>
                {renderSegmentedMeter(vitals.hunger, '#10b981')}
              </div>

              <div className={styles.meterPod}>
                <div className={styles.meterPodHeader}>
                  <HeartIcon size={14} className={styles.meterGlyph} />
                  <span className={styles.meterPodLabel}>HAPPINESS</span>
                  <span className={styles.meterPct}>{vitals.happiness}%</span>
                </div>
                {renderSegmentedMeter(vitals.happiness, '#ec4899')}
              </div>

              <div className={styles.meterPod}>
                <div className={styles.meterPodHeader}>
                  <BoltIcon size={14} className={styles.meterGlyph} />
                  <span className={styles.meterPodLabel}>ENERGY</span>
                  <span className={styles.meterPct}>{vitals.energy}%</span>
                </div>
                {renderSegmentedMeter(vitals.energy, '#38bdf8')}
              </div>
            </div>
          </div>

          {/* Main Pet Habitat Stage */}
          <div className={styles.petHabitatStage} onClick={handlePet}>
            <div className={styles.stageLightCone} />
            <div className={styles.stageFloorPlane} />

            {/* Food dropping animation */}
            {foodDrop && (
              <div className={styles.droppingFoodItem}>
                {foodDrop.icon === 'pizza' && <PizzaIcon size={32} />}
                {foodDrop.icon === 'ramen' && <BowlIcon size={32} />}
                {foodDrop.icon === 'coffee' && <CoffeeIcon size={32} />}
                {foodDrop.icon === 'energy' && <EnergyIcon size={32} />}
                {foodDrop.icon === 'apple' && <AppleIcon size={32} />}
              </div>
            )}

            {/* Interactive Bouncing Ball */}
            {ballInPlay && (
              <div
                className={styles.playBallElement}
                style={{ left: `${ballPosition.x}%`, top: `${ballPosition.y}%` }}
              >
                <BallIcon size={26} />
              </div>
            )}

            {/* Mini-Game Target */}
            {activeMiniGame && miniGameTarget && (
              <div
                className={styles.minigameTargetChip}
                style={{ left: `${miniGameTarget.x}%`, top: `${miniGameTarget.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCatchTarget();
                }}
              >
                {miniGameTarget.type === 'bug' && <TargetBugIcon size={28} />}
                {miniGameTarget.type === 'bolt' && <BoltIcon size={28} />}
                {miniGameTarget.type === 'sparkle' && <SparkleIcon size={28} />}
                <span className={styles.targetExpBadge}>+15 XP</span>
              </div>
            )}

            {/* Floating Dynamic Particles */}
            {particles.map((p) => (
              <div
                key={p.id}
                className={`${styles.floatingParticle} ${styles[`particle-${p.type}`] || ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                {p.type === 'heart' && <HeartIcon size={18} />}
                {p.type === 'bubble' && <ShowerIcon size={18} />}
                {p.type === 'crumb' && <PizzaIcon size={14} />}
                {p.type === 'zzz' && <span className={styles.zzzText}>Zzz</span>}
                {p.type === 'exp' && <span className={styles.expFloatText}>{p.text}</span>}
              </div>
            ))}

            {/* Speech Bubble */}
            {message && (
              <div className={styles.petSpeechDialogue} onClick={(e) => e.stopPropagation()}>
                <span className={styles.speechText}>{message}</span>
              </div>
            )}

            {/* Pet Center Stage Sprite */}
            <div className={styles.petSpriteCenterpiece}>
              <SpriteRenderer
                character={activeCharacter}
                action={action}
                size={190}
                className={styles.activePetSprite}
              />
              <div className={styles.petGroundShadow} />
            </div>

            {/* Sleeping Cozy Blanket Overlay */}
            {isSleeping && (
              <div className={styles.sleepBlanketOverlay}>
                <div className={styles.moonbeamRays} />
                <span className={`${styles.snoreZzz} ${styles.z1}`}>Z</span>
                <span className={`${styles.snoreZzz} ${styles.z2}`}>z</span>
                <span className={`${styles.snoreZzz} ${styles.z3}`}>z</span>
              </div>
            )}

            <div className={styles.habitatClickHint}>
              <span>[ Tap Companion to Pet &amp; Bond ]</span>
            </div>
          </div>

          {/* Mini Game HUD banner when active */}
          {activeMiniGame && (
            <div className={styles.minigameHudControl}>
              <div className={styles.hudScoreDisplay}>
                <TargetBugIcon size={16} />
                <span>BUGS SQUASHED: {miniGameScore}</span>
              </div>
              <button type="button" onClick={endMiniGame} className={styles.minigameQuitBtn}>
                <StopIcon size={14} />
                <span>STOP GAME</span>
              </button>
            </div>
          )}

          {/* Organized Action Deck (Tactile Category Tabs) */}
          <div className={styles.actionControlDeck}>
            {/* Category Navigation */}
            <div className={styles.actionNavTabs} role="tablist" onKeyDown={onTabListKeyDown}>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'feed'}
                tabIndex={activeCategory === 'feed' ? 0 : -1}
                onClick={() => {
                  sound.playBeep(480, 0.04);
                  setActiveCategory('feed');
                }}
                className={`${styles.actionTabBtn} ${activeCategory === 'feed' ? styles.active : ''}`}
              >
                <PizzaIcon size={14} />
                <span>Feed</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'play'}
                tabIndex={activeCategory === 'play' ? 0 : -1}
                onClick={() => {
                  sound.playBeep(540, 0.04);
                  setActiveCategory('play');
                }}
                className={`${styles.actionTabBtn} ${activeCategory === 'play' ? styles.active : ''}`}
              >
                <BallIcon size={14} />
                <span>Play</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'care'}
                tabIndex={activeCategory === 'care' ? 0 : -1}
                onClick={() => {
                  sound.playBeep(600, 0.04);
                  setActiveCategory('care');
                }}
                className={`${styles.actionTabBtn} ${activeCategory === 'care' ? styles.active : ''}`}
              >
                <ShowerIcon size={14} />
                <span>Care</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'rest'}
                tabIndex={activeCategory === 'rest' ? 0 : -1}
                onClick={() => {
                  sound.playBeep(660, 0.04);
                  setActiveCategory('rest');
                }}
                className={`${styles.actionTabBtn} ${activeCategory === 'rest' ? styles.active : ''}`}
              >
                <MoonIcon size={14} />
                <span>Rest</span>
              </button>
            </div>

            {/* Sub-Actions Content Panel */}
            <div className={styles.actionSubPanel}>
              {/* FEED CATEGORY */}
              {activeCategory === 'feed' && (
                <div className={styles.foodActionGrid}>
                  <button
                    type="button"
                    onClick={() => handleFeed('Pizza Slice', 25, 0, 6, 'pizza')}
                    className={styles.foodItemBtn}
                  >
                    <PizzaIcon size={20} />
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>Pizza Slice</span>
                      <span className={styles.itemBoost}>+25 Hunger</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFeed('Ramen Bowl', 35, 5, 8, 'ramen')}
                    className={styles.foodItemBtn}
                  >
                    <BowlIcon size={20} />
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>Ramen Bowl</span>
                      <span className={styles.itemBoost}>+35 Hunger</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFeed('Espresso', 12, 30, 4, 'coffee')}
                    className={styles.foodItemBtn}
                  >
                    <CoffeeIcon size={20} />
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>Espresso</span>
                      <span className={styles.itemBoost}>+30 Energy</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFeed('Energy Drink', 18, 35, 4, 'energy')}
                    className={styles.foodItemBtn}
                  >
                    <EnergyIcon size={20} />
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>Energy Drink</span>
                      <span className={styles.itemBoost}>+35 Energy</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFeed('Golden Apple', 45, 20, 20, 'apple')}
                    className={`${styles.foodItemBtn} ${styles.special}`}
                  >
                    <AppleIcon size={20} />
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>Golden Apple</span>
                      <span className={styles.itemBoost}>+45 All Vitals</span>
                    </div>
                  </button>
                </div>
              )}

              {/* PLAY CATEGORY */}
              {activeCategory === 'play' && (
                <div className={styles.tactileActionGrid}>
                  <button
                    type="button"
                    onClick={activeMiniGame ? endMiniGame : startMiniGame}
                    className={`${styles.tactileBtn} ${activeMiniGame ? styles.activeStop : styles.primaryPlay}`}
                  >
                    {activeMiniGame ? <StopIcon size={18} /> : <TargetBugIcon size={18} />}
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>
                        {activeMiniGame ? 'Stop Mini-Game' : 'Squash Bugs Mini-Game'}
                      </span>
                      <span className={styles.btnSubLabel}>Fast reaction speed test</span>
                    </div>
                  </button>

                  <button type="button" onClick={handleTossBall} className={`${styles.tactileBtn} ${styles.secondaryPlay}`}>
                    <BallIcon size={18} />
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>Toss Ball / Fetch</span>
                      <span className={styles.btnSubLabel}>+16 XP &amp; Happiness</span>
                    </div>
                  </button>
                </div>
              )}

              {/* CARE CATEGORY */}
              {activeCategory === 'care' && (
                <div className={styles.tactileActionGrid}>
                  <button type="button" onClick={handlePet} className={`${styles.tactileBtn} ${styles.petCare}`}>
                    <HeartIcon size={18} />
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>Pet &amp; Praise</span>
                      <span className={styles.btnSubLabel}>Strengthen companion bond</span>
                    </div>
                  </button>

                  <button type="button" onClick={handleGroom} className={`${styles.tactileBtn} ${styles.groomCare}`}>
                    <ShowerIcon size={18} />
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>Groom &amp; Wash</span>
                      <span className={styles.btnSubLabel}>Suds &amp; sparkle polish</span>
                    </div>
                  </button>

                  <button type="button" onClick={handleCheer} className={`${styles.tactileBtn} ${styles.cheerCare}`}>
                    <TrophyIcon size={18} />
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>Victory Pose</span>
                      <span className={styles.btnSubLabel}>Trigger signature quote</span>
                    </div>
                  </button>
                </div>
              )}

              {/* REST CATEGORY */}
              {activeCategory === 'rest' && (
                <div className={`${styles.tactileActionGrid} ${styles.single}`}>
                  <button
                    type="button"
                    onClick={toggleSleep}
                    className={`${styles.tactileBtn} ${styles.sleepToggle} ${isSleeping ? styles.wakingState : ''}`}
                  >
                    {isSleeping ? <SunIcon size={20} /> : <MoonIcon size={20} />}
                    <div className={styles.btnLabelGroup}>
                      <span className={styles.btnMainLabel}>
                        {isSleeping ? 'Wake Up Companion' : 'Nap & Recharge Energy'}
                      </span>
                      <span className={styles.btnSubLabel}>
                        {isSleeping ? 'Return to active play' : 'Restores energy cells over time'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
        </div>
      </div>
    );

  return (
    <div
      className={`${styles.tamagotchiPlaygroundRoot} ${
        isSleeping ? styles.habitatNight : styles.habitatDay
      } ${!showToyShell ? styles.embeddedView : ''}`}
    >
      {showToyShell ? (
        <div className={styles.tamagotchiChassis}>
          {/* Top Keychain Loop & Antenna */}
          <div className={styles.chassisTopHardware}>
            <div className={styles.lanyardChainLoop}>
              <div className={`${styles.chainRing} ${styles.outer}`} />
              <div className={`${styles.chainRing} ${styles.inner}`} />
            </div>
            <div className={styles.chassisAntenna}>
              <span className={styles.antennaTipLed} />
            </div>
          </div>
          {renderInnerContent()}
        </div>
      ) : (
        renderInnerContent()
      )}
    </div>
  );
};

export default TamagotchiPlayground;
