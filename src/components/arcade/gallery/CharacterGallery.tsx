import { FC, useState } from 'react';
import { sound } from '../audio/audioSynth';
import { defaultCharacters, getCustomCharacters } from '../data/characterRoster';
import {
  ArcadeIcon,
  BasketballIcon,
  BoltIcon,
  CreatorIcon,
  GalleryIcon,
  LaptopIcon,
  MaskIcon,
  SparkleIcon
} from '../icons/ArcadeIcons';
import { SpriteRenderer } from '../sprites/SpriteRenderer';
import { SpriteCharacter } from '../types';
import styles from './CharacterGallery.module.css';

interface CharacterGalleryProps {
  onSelectCompanion?: (character: SpriteCharacter) => void;
  activeCompanionId?: string;
  onGoToCreator?: () => void;
}

export const CharacterGallery: FC<CharacterGalleryProps> = ({
  onSelectCompanion,
  activeCompanionId,
  onGoToCreator,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectCharacter, setInspectCharacter] = useState<SpriteCharacter | null>(null);
  const [tiltCardId, setTiltCardId] = useState<string | null>(null);

  const customCharacters = getCustomCharacters();
  const allCharacters: SpriteCharacter[] = [...defaultCharacters, ...customCharacters];

  const filteredCharacters = allCharacters.filter((char) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      (selectedCategory === 'custom' && char.category === 'custom') ||
      char.category === selectedCategory;

    const matchesSearch =
      char.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      char.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      char.quote.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const handleCategoryChange = (cat: string) => {
    sound.playBeep(440, 0.04);
    setSelectedCategory(cat);
  };

  const handleInspect = (char: SpriteCharacter) => {
    sound.playJump();
    setInspectCharacter(char);
  };

  const handleAdopt = (char: SpriteCharacter) => {
    sound.playPowerUp();
    onSelectCompanion?.(char);
  };

  const renderStatRadar = (stats: { power: number; agility: number; brain: number; charisma: number }, size = 120) => {
    const center = size / 2;
    const r = 42;

    const p = (stats.power / 100) * r;
    const a = (stats.agility / 100) * r;
    const b = (stats.brain / 100) * r;
    const c = (stats.charisma / 100) * r;

    // 4 Axes: Top(Power), Right(Agility), Bottom(Brain), Left(Charisma)
    const points = `${center},${center - p} ${center + a},${center} ${center},${center + b} ${center - c},${center}`;

    return (
      <svg width={size} height={size} className={styles.radarSvg} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Grid webs */}
        {[0.33, 0.66, 1].map((scale, i) => {
          const rad = r * scale;
          return (
            <polygon
              key={i}
              points={`${center},${center - rad} ${center + rad},${center} ${center},${center + rad} ${center - rad},${center}`}
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
            />
          );
        })}
        {/* Axis Crosshairs */}
        <line x1={center} y1={center - r} x2={center} y2={center + r} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />
        <line x1={center - r} y1={center} x2={center + r} y2={center} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />
        {/* Stat Polygon */}
        <polygon points={points} fill="rgba(0, 240, 255, 0.35)" stroke="#00F0FF" strokeWidth="2" />
        {/* Labels */}
        <text x={center} y={center - r - 4} textAnchor="middle" fill="#CBD5E1" fontSize="8" fontFamily="monospace">POW</text>
        <text x={center + r + 4} y={center + 3} textAnchor="start" fill="#CBD5E1" fontSize="8" fontFamily="monospace">AGI</text>
        <text x={center} y={center + r + 11} textAnchor="middle" fill="#CBD5E1" fontSize="8" fontFamily="monospace">BRN</text>
        <text x={center - r - 4} y={center + 3} textAnchor="end" fill="#CBD5E1" fontSize="8" fontFamily="monospace">CHA</text>
      </svg>
    );
  };

  return (
    <div className={styles.arcadeCharacterGallery}>
      {/* Header */}
      <div className={styles.galleryHeader}>
        <div>
          <h2 className={styles.galleryTitle}>
            <GalleryIcon size={20} className={styles.retroStar} /> ROSTER & LEGENDS GALLERY
          </h2>
          <p className={styles.gallerySubtitle}>
            Holographic roster of iconic champions, anime legends, superheroes, and companions. Inspect radar stats or recruit to your party.
          </p>
        </div>

        {onGoToCreator && (
          <button type="button" onClick={onGoToCreator} className={styles.createShortcutBtn}>
            + CREATE CUSTOM HERO
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.galleryToolbar}>
        <div className={styles.categoryChips}>
          {[
            { id: 'all', label: 'All Heroes', icon: null },
            { id: 'gaming', label: 'Gaming', icon: <ArcadeIcon size={14} /> },
            { id: 'sports', label: 'Sports', icon: <BasketballIcon size={14} /> },
            { id: 'anime', label: 'Anime', icon: <BoltIcon size={14} /> },
            { id: 'superheroes', label: 'Heroes', icon: <MaskIcon size={14} /> },
            { id: 'tech', label: 'Tech', icon: <LaptopIcon size={14} /> },
            { id: 'original', label: 'Original', icon: <SparkleIcon size={14} /> },
            { id: 'custom', label: 'Custom', icon: <CreatorIcon size={14} /> },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`${styles.catChip} ${selectedCategory === cat.id ? styles.active : ''}`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roster by name, title, or quote..."
            className={styles.gallerySearchInput}
          />
        </div>
      </div>

      {/* Cards Grid with Holographic Foil effect */}
      <div className={styles.fightersGrid}>
        {filteredCharacters.map((char) => {
          const isCurrentActive = char.id === activeCompanionId;
          const isHovered = tiltCardId === char.id;

          return (
            <div
              key={char.id}
              className={`${styles.fighterCard} ${isCurrentActive ? styles.activePet : ''} ${isHovered ? styles.foilHover : ''}`}
              onClick={() => handleInspect(char)}
              onMouseEnter={() => setTiltCardId(char.id)}
              onMouseLeave={() => setTiltCardId(null)}
            >
              {/* Holographic foil shimmer sheen */}
              <div className={styles.holographicFoilSheen} />

              {/* Top Badge Row */}
              <div className={styles.fighterBadgeRow}>
                <span className={styles.categoryTag}>{char.category.toUpperCase()}</span>
                {isCurrentActive && <span className={styles.activePill}>ACTIVE COMPANION</span>}
              </div>

              {/* Sprite Visual Stage */}
              <div className={styles.fighterSpriteStage}>
                <SpriteRenderer character={char} size={110} />
              </div>

              {/* Info */}
              <div className={styles.fighterCardInfo}>
                <h3 className={styles.fighterName}>{char.name}</h3>
                <span className={styles.fighterTitle}>{char.title}</span>
                <p className={styles.fighterQuote}>"{char.quote}"</p>
              </div>

              {/* Stats Mini Bar Preview */}
              <div className={styles.fighterStatsPreview}>
                <div className={styles.statPill}>
                  <span className={styles.statLabel}>PWR</span>
                  <div className={styles.miniStatBar}>
                    <div className={`${styles.fill} ${styles.pwr}`} style={{ width: `${char.stats.power}%` }} />
                  </div>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statLabel}>AGI</span>
                  <div className={styles.miniStatBar}>
                    <div className={`${styles.fill} ${styles.agi}`} style={{ width: `${char.stats.agility}%` }} />
                  </div>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statLabel}>BRN</span>
                  <div className={styles.miniStatBar}>
                    <div className={`${styles.fill} ${styles.brn}`} style={{ width: `${char.stats.brain}%` }} />
                  </div>
                </div>
              </div>

              {/* Quick Adopt / Select Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdopt(char);
                }}
                className={`${styles.adoptBtn} ${isCurrentActive ? styles.adopted : ''}`}
              >
                {isCurrentActive ? 'ACTIVE PARTY MEMBER' : 'RECRUIT COMPANION'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Deep Inspection Modal with SVG Attribute Radar */}
      {inspectCharacter && (
        <div className={styles.inspectModalBackdrop} onClick={() => setInspectCharacter(null)}>
          <div className={styles.inspectModal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setInspectCharacter(null)}
              aria-label="Close modal"
            >
              ×
            </button>

            <div className={styles.modalHero}>
              <div className={styles.modalSpriteBox}>
                <SpriteRenderer character={inspectCharacter} size={130} action="happy" />
              </div>

              <div className={styles.modalHeroInfo}>
                <div className={styles.modalCatBadge}>{inspectCharacter.category.toUpperCase()} HERO</div>
                <h3 className={styles.modalName}>{inspectCharacter.name}</h3>
                <span className={styles.modalSub}>{inspectCharacter.title}</span>
                <p className={styles.modalQuote}>"{inspectCharacter.quote}"</p>
                <div className={styles.modalSigMove}>
                  <strong>SIGNATURE MOVE:</strong> {inspectCharacter.signatureMove}
                </div>
              </div>
            </div>

            {/* Radar & Attributes section */}
            <div className={styles.modalAttributesSection}>
              <div className={styles.radarCol}>
                <span className={styles.sectionLabel}>ATTRIBUTE MATRIX</span>
                {renderStatRadar(inspectCharacter.stats, 130)}
              </div>

              <div className={styles.modalStatsGrid}>
                <div className={`${styles.modalStatBox} ${styles.pwr}`}>
                  <span className={styles.boxVal}>{inspectCharacter.stats.power}</span>
                  <span className={styles.boxLbl}>POWER</span>
                </div>
                <div className={`${styles.modalStatBox} ${styles.agi}`}>
                  <span className={styles.boxVal}>{inspectCharacter.stats.agility}</span>
                  <span className={styles.boxLbl}>AGILITY</span>
                </div>
                <div className={`${styles.modalStatBox} ${styles.brn}`}>
                  <span className={styles.boxVal}>{inspectCharacter.stats.brain}</span>
                  <span className={styles.boxLbl}>INTELLECT</span>
                </div>
                <div className={`${styles.modalStatBox} ${styles.cha}`}>
                  <span className={styles.boxVal}>{inspectCharacter.stats.charisma}</span>
                  <span className={styles.boxLbl}>CHARISMA</span>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => {
                  handleAdopt(inspectCharacter);
                  setInspectCharacter(null);
                }}
                className={styles.modalAdoptBtn}
              >
                RECRUIT {inspectCharacter.name.toUpperCase()} AS COMPANION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterGallery;
