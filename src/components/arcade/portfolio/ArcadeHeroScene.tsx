import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sound } from '../audio/audioSynth';
import { LayersIcon } from '../icons/ArcadeIcons';
import styles from './ArcadeHeroScene.module.css';

const NAMES = ['Shugmi Shumunov', 'шумун шумунов', 'שמעון שומונוב', 'ShugKnight24'];
const QUALITIES = ['Developer', 'Builder', 'Consultant', 'Creator', 'Learner'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Compact hello strip at the top of the arcade hub
export const ArcadeHeroScene: FC = () => {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [nameIndex, setNameIndex] = useState(0);
  const [qualityIndex, setQualityIndex] = useState(0);
  const [displayedQuality, setDisplayedQuality] = useState(() => (reducedMotion ? QUALITIES[0] : ''));
  const [isDeleting, setIsDeleting] = useState(false);

  // Rotate names every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNameIndex((prev) => (prev + 1) % NAMES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Reduced motion: swap whole words instead of typing them out
  useEffect(() => {
    if (!reducedMotion) return;
    const timer = setInterval(() => {
      setQualityIndex((prev) => {
        const next = (prev + 1) % QUALITIES.length;
        setDisplayedQuality(QUALITIES[next]);
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  // Typewriter effect for developer qualities
  useEffect(() => {
    if (reducedMotion) return;
    const targetWord = QUALITIES[qualityIndex];
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!isDeleting && displayedQuality.length < targetWord.length) {
      timeout = setTimeout(() => {
        setDisplayedQuality(targetWord.slice(0, displayedQuality.length + 1));
      }, 70);
    } else if (!isDeleting && displayedQuality.length === targetWord.length) {
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, 2000);
    } else if (isDeleting && displayedQuality.length > 0) {
      timeout = setTimeout(() => {
        setDisplayedQuality(displayedQuality.slice(0, -1));
      }, 40);
    } else if (isDeleting && displayedQuality.length === 0) {
      setIsDeleting(false);
      setQualityIndex((prev) => (prev + 1) % QUALITIES.length);
    }

    return () => clearTimeout(timeout);
  }, [displayedQuality, isDeleting, qualityIndex, reducedMotion]);

  return (
    <div className={styles.arcadeHeroScene}>
      <p className={styles.greetingLine}>C:\&gt; HELLO WORLD</p>
      <p className={styles.heroNameTitle}>
        <span className={styles.heroName}>{NAMES[nameIndex]}</span>
      </p>
      <p className={styles.typewriterContainer}>
        <span className={styles.typewriterPrefix}>Crafting as a </span>
        <span className={styles.typewriterText}>{displayedQuality}</span>
        <span className={styles.typewriterCursor} aria-hidden="true" />
      </p>
      <Link to="/projects" onClick={() => sound.playBeep(440, 0.05)} className={styles.heroLinkBtn}>
        <LayersIcon size={16} />
        <span>View Projects</span>
      </Link>
    </div>
  );
};

export default ArcadeHeroScene;
