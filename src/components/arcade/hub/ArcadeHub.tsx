import { FC, useId } from 'react';
import { Link } from 'react-router-dom';
import { sound } from '../audio/audioSynth';
import { defaultCharacters } from '../data/characterRoster';
import { ArrowRightIcon } from '../icons/ArcadeIcons';
import { ArcadeHeroScene } from '../portfolio/ArcadeHeroScene';
import { SpriteRenderer } from '../sprites/SpriteRenderer';
import {
  ARCADE_HALLS,
  ArcadeExperience,
  ArcadeHall,
  experiencePath,
  hallPath
} from './arcadeMap';
import styles from './ArcadeHub.module.css';

interface EntryTileProps {
  to: string;
  title: string;
  intro: string;
  verb: string;
  icon: ArcadeExperience['icon'];
  sprites: string[];
  /** Small caps line under the intro, e.g. the experiences inside a hall */
  meta?: string;
  size: 'hall' | 'experience';
}

const TilePreview: FC<Pick<EntryTileProps, 'icon' | 'sprites' | 'size'>> = ({ icon: Icon, sprites, size }) => {
  const characters = sprites
    .map((id) => defaultCharacters.find((c) => c.id === id))
    .filter((c): c is (typeof defaultCharacters)[number] => Boolean(c));
  const spriteSize = size === 'hall' ? 64 : 76;

  return (
    <span className={styles.preview} aria-hidden="true">
      {characters.length > 0 ? (
        <span className={styles.previewSprites}>
          {characters.map((char) => (
            <SpriteRenderer key={char.id} character={char} size={spriteSize} />
          ))}
        </span>
      ) : (
        <Icon size={size === 'hall' ? 44 : 52} className={styles.previewIcon} />
      )}
    </span>
  );
};

export const EntryTile: FC<EntryTileProps> = ({ to, title, intro, verb, icon, sprites, meta, size }) => {
  const id = useId();
  return (
    <Link
      to={to}
      className={`${styles.tile} ${size === 'hall' ? styles.tileHall : styles.tileExperience}`}
      aria-labelledby={`${id}-title ${id}-verb`}
      aria-describedby={meta ? `${id}-intro ${id}-meta` : `${id}-intro`}
      onClick={() => sound.playBeep(523.25, 0.04)}
    >
      <TilePreview icon={icon} sprites={sprites} size={size} />
      <span className={styles.tileBody}>
        <span id={`${id}-title`} className={styles.tileTitle}>
          {title}
        </span>
        <span id={`${id}-intro`} className={styles.tileIntro}>
          {intro}
        </span>
        {meta && (
          <span id={`${id}-meta`} className={styles.tileMeta}>
            {meta}
          </span>
        )}
      </span>
      <span id={`${id}-verb`} className={styles.tileVerb}>
        {verb}
        <ArrowRightIcon size={14} />
      </span>
    </Link>
  );
};

const hallSprites = (hall: ArcadeHall) =>
  hall.experiences.flatMap((e) => e.previewSprites).slice(0, 3);

export const HubView: FC = () => (
  <div className={styles.view}>
    <ArcadeHeroScene />
    <ul className={`${styles.grid} ${styles.gridHalls}`} aria-label="Halls">
      {ARCADE_HALLS.map((hall) => (
        <li key={hall.id} className={styles.gridItem}>
          <EntryTile
            to={hallPath(hall.id)}
            title={hall.title}
            intro={hall.intro}
            verb="Enter"
            icon={hall.icon}
            sprites={hallSprites(hall)}
            meta={hall.experiences.map((e) => e.title).join(' · ')}
            size="hall"
          />
        </li>
      ))}
    </ul>
  </div>
);

export const HallView: FC<{ hall: ArcadeHall }> = ({ hall }) => (
  <div className={styles.view}>
    <ul className={`${styles.grid} ${styles.gridExperiences}`} aria-label={`${hall.title} experiences`}>
      {hall.experiences.map((exp) => (
        <li key={exp.id} className={styles.gridItem}>
          <EntryTile
            to={experiencePath(exp)}
            title={exp.title}
            intro={exp.intro}
            verb={exp.verb}
            icon={exp.icon}
            sprites={exp.previewSprites}
            size="experience"
          />
        </li>
      ))}
    </ul>
  </div>
);
