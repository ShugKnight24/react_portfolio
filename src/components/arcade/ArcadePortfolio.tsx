import { FC, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { sound } from './audio/audioSynth';
import { ArcadeCabinet } from './cabinet/ArcadeCabinet';
import { CharacterCreator } from './creator/CharacterCreator';
import { defaultCharacters, getCustomCharacters } from './data/characterRoster';
import { CharacterGallery } from './gallery/CharacterGallery';
import { ArcadeTeamBrawler } from './brawler/ArcadeTeamBrawler';
import { ArrowRightIcon, MonitorIcon } from './icons/ArcadeIcons';
import { SceneStudio } from './playground/SceneStudio';
import { TamagotchiPlayground } from './playground/TamagotchiPlayground';
import { HallView, HubView } from './hub/ArcadeHub';
import {
  ARCADE_INTRO,
  ARCADE_ROOT,
  ArcadeLocation,
  ExperienceId,
  experiencePath,
  findExperience,
  hallPath,
  resolveArcadePath
} from './hub/arcadeMap';
import { ArcadeDisplayMode, SpriteCharacter } from './types';
import styles from './ArcadePortfolio.module.css';

interface Crumb {
  label: string;
  path: string;
}

const formatClock = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const crumbsFor = (loc: ArcadeLocation): Crumb[] => {
  const crumbs: Crumb[] = [{ label: 'Arcade', path: ARCADE_ROOT }];
  if (loc.level === 'hub') return crumbs;
  crumbs.push({ label: loc.hall.crumb, path: hallPath(loc.hall.id) });
  if (loc.level === 'experience') {
    crumbs.push({ label: loc.experience.crumb, path: experiencePath(loc.experience) });
  }
  return crumbs;
};

const headerFor = (loc: ArcadeLocation) => {
  if (loc.level === 'hub') return { title: 'Arcade', intro: ARCADE_INTRO };
  if (loc.level === 'hall') return { title: `${loc.hall.title} hall`, intro: loc.hall.intro };
  return { title: loc.experience.title, intro: loc.experience.intro };
};

export const ArcadePortfolio: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { location: place, redirect } = resolveArcadePath(location.pathname);

  const [displayMode, setDisplayMode] = useState<ArcadeDisplayMode>('arcade');
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsEl, setSettingsEl] = useState<HTMLDivElement | null>(null);
  const [activeCompanion, setActiveCompanion] = useState<SpriteCharacter>(() => {
    const custom = getCustomCharacters();
    return custom[0] || defaultCharacters[0];
  });

  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  // True while the visitor is playing inside the window (clicked a canvas that never takes focus)
  const engagedInBodyRef = useRef(false);
  const lastPathRef = useRef(location.pathname);
  const headingId = useId();
  const settingsId = useId();

  const crumbs = crumbsFor(place);
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const header = headerFor(place);

  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);

  // Move focus to the window heading after every in-arcade navigation (not on first load)
  useEffect(() => {
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    engagedInBodyRef.current = false;
    headingRef.current?.focus();
  }, [location.pathname]);

  // Track whether the visitor is interacting with the experience itself
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      engagedInBodyRef.current = Boolean(bodyRef.current?.contains(e.target as Node));
      if (
        settingsOpen &&
        !settingsEl?.contains(e.target as Node) &&
        !settingsBtnRef.current?.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!bodyRef.current?.contains(e.target as Node)) engagedInBodyRef.current = false;
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [settingsOpen, settingsEl]);

  // Escape closes settings, otherwise goes up one level. It never leaves a running experience.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        settingsBtnRef.current?.focus();
        return;
      }
      if (!parent) return;
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
      if (
        place.level === 'experience' &&
        (engagedInBodyRef.current || (active && bodyRef.current?.contains(active)))
      ) {
        return;
      }
      e.preventDefault();
      navigate(parent.path);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, parent, place.level, settingsOpen]);

  const goTo = useCallback(
    (id: ExperienceId) => {
      sound.playBeep(523.25, 0.04);
      navigate(experiencePath(findExperience(id)));
    },
    [navigate]
  );

  const handleSelectCompanion = (char: SpriteCharacter) => {
    setActiveCompanion(char);
    goTo('tamagotchi');
  };

  // The cabinet's 1P START button returns to the hub. Its Enter shortcut is ignored so Enter keeps
  // activating links and game controls.
  const handleCabinetButton = (btn: string) => {
    if (btn !== '1P') return;
    const ev = typeof window !== 'undefined' ? window.event : undefined;
    if (ev?.type !== 'click') return;
    navigate(ARCADE_ROOT);
  };

  if (redirect) return <Navigate to={redirect} replace />;

  const renderExperience = (id: ExperienceId) => {
    switch (id) {
      case 'brawler':
        return <ArcadeTeamBrawler />;
      case 'tamagotchi':
        return (
          <TamagotchiPlayground
            initialCompanionId={activeCompanion.id}
            onGoToGallery={() => goTo('heroes')}
            onGoToCreator={() => goTo('character-lab')}
            embedded={true}
          />
        );
      case 'character-lab':
        return (
          <CharacterCreator
            onCharacterCreated={setActiveCompanion}
            onGoToPlayground={() => goTo('tamagotchi')}
          />
        );
      case 'stage-studio':
        return <SceneStudio />;
      case 'heroes':
        return (
          <CharacterGallery
            onSelectCompanion={handleSelectCompanion}
            activeCompanionId={activeCompanion.id}
            onGoToCreator={() => goTo('character-lab')}
          />
        );
      default:
        return null;
    }
  };

  const dosPath = `C:\\${crumbs.map((c) => c.label.toUpperCase().replace(/\s+/g, '_')).join('\\')}`;

  return (
    <div className={styles.arcadePortfolioRoot}>
      <ArcadeCabinet
        displayMode={displayMode}
        onChangeDisplayMode={setDisplayMode}
        onButtonPress={handleCabinetButton}
        toolbarTarget={settingsEl}
      >
        <div className={styles.osDesktop}>
          {/* OS menu bar: brand, quiet display settings, clock */}
          <header className={styles.osMenubar}>
            <div className={styles.osBrand}>
              <span className={styles.osLogo} aria-hidden="true" />
              <span className={styles.osName}>SHUG-OS</span>
              <span className={styles.osBoot}>
                640K OK. READY<span className={styles.osCursor} aria-hidden="true" />
              </span>
            </div>
            <div className={styles.osTray}>
              <button
                ref={settingsBtnRef}
                type="button"
                className={styles.osMenuBtn}
                aria-expanded={settingsOpen}
                aria-controls={settingsId}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <MonitorIcon size={14} />
                <span>Display</span>
              </button>
              <time className={styles.osClock} aria-label={`Local time ${clock}`}>
                {clock}
              </time>
            </div>
            <div
              id={settingsId}
              ref={setSettingsEl}
              className={styles.osSettings}
              data-arcade-settings=""
              role="group"
              aria-label="Display settings"
              hidden={!settingsOpen}
            />
          </header>

          {/* One window for every place in the arcade */}
          <section className={styles.osWindow} aria-labelledby={headingId}>
            <div className={styles.osTitlebar}>
              <span className={styles.osControls} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <nav className={styles.osCrumbs} aria-label="Arcade breadcrumb">
                <ol>
                  {crumbs.map((crumb, idx) => {
                    const isCurrent = idx === crumbs.length - 1;
                    return (
                      <li key={crumb.path}>
                        <Link to={crumb.path} aria-current={isCurrent ? 'page' : undefined}>
                          {crumb.label}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </nav>
              <span className={styles.osTitlebarGrip} aria-hidden="true" />
            </div>

            <div className={styles.osWindowHeader}>
              <div className={styles.osWindowHeading}>
                <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.osWindowTitle}>
                  {header.title}
                </h2>
                <p className={styles.osWindowIntro}>{header.intro}</p>
              </div>
              {parent && (
                <Link to={parent.path} className={styles.osBackLink}>
                  <ArrowRightIcon size={14} className={styles.osBackIcon} />
                  <span>Back to {parent.label}</span>
                </Link>
              )}
            </div>

            <div
              ref={bodyRef}
              className={`${styles.osWindowBody} ${place.level === 'experience' ? styles.osWindowBodyApp : ''}`}
            >
              {place.level === 'hub' && <HubView />}
              {place.level === 'hall' && <HallView hall={place.hall} />}
              {place.level === 'experience' && (
                <div key={place.experience.id} className={styles.osApp}>
                  {renderExperience(place.experience.id)}
                </div>
              )}
            </div>

            <footer className={styles.osStatusbar}>
              <span className={styles.osPath}>{dosPath}</span>
              {parent && (
                <span className={styles.osStatusHint}>
                  ESC: BACK TO {parent.label.toUpperCase()}
                </span>
              )}
            </footer>
          </section>
        </div>
      </ArcadeCabinet>
    </div>
  );
};

export default ArcadePortfolio;
