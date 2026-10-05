import {
  CSSProperties,
  FC,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeProvider';
import { getTint, NATIVE_THEME, themeCategories, themes } from '../../data/themes';
import styles from './ThemeSwitcher.module.css';

interface ThemeSwitcherProps {
  // Kept for call-site compatibility; the switcher always renders a compact trigger
  compact?: boolean;
}

type WorldKey = 'motor' | 'codex' | 'arcade';

// Native palette of each world, used for the Default chip and the trigger swatch
const WORLDS: Record<WorldKey, { name: string; swatch: [string, string, string] }> = {
  motor: { name: 'Motor City Night', swatch: ['#101216', '#ff8a2a', '#c9d1dc'] },
  codex: { name: "Knight's Codex", swatch: ['#15110b', '#d4a84b', '#a1392b'] },
  arcade: { name: 'Arcade OS', swatch: ['#0f0d1c', '#5dffb0', '#ff4fa3'] },
};

const readWorld = (): WorldKey => {
  const world = document.documentElement.dataset.world;
  return world === 'codex' || world === 'arcade' ? world : 'motor';
};

// Follow <html data-world>, which App sets per route
const useWorld = (): WorldKey => {
  const [world, setWorld] = useState<WorldKey>(readWorld);
  useEffect(() => {
    const observer = new MutationObserver(() => setWorld(readWorld()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-world'] });
    return () => observer.disconnect();
  }, []);
  return world;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const swatchFor = (key: string, world: WorldKey): [string, string, string] => {
  const tint = key === NATIVE_THEME ? null : getTint(key);
  if (!tint) return WORLDS[world].swatch;
  return [`color-mix(in oklab, ${WORLDS[world].swatch[0]} 72%, ${tint.bgTint})`, tint.accent, tint.accent2];
};

const Swatch: FC<{ stops: [string, string, string]; className?: string }> = ({ stops, className }) => (
  <span className={`${styles.swatch} ${className ?? ''}`} aria-hidden="true">
    {stops.map((color, index) => (
      <span key={index} style={{ background: color }} />
    ))}
  </span>
);

const CLOSE_MS = 220;

export const ThemeSwitcher: FC<ThemeSwitcherProps> = () => {
  const { currentTheme, setTheme, previewTheme } = useTheme();
  const world = useWorld();
  const worldName = WORLDS[world].name;

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [focusKey, setFocusKey] = useState(currentTheme);
  const [shownKey, setShownKey] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeTimer = useRef<number | undefined>(undefined);

  const titleId = useId();
  const descPrefix = useId();

  // Flat order for arrow keys: Default first, then each category in display order
  const order = useMemo(
    () => [NATIVE_THEME, ...Object.values(themeCategories).flatMap((category) => category.themes.filter((key) => themes[key]))],
    []
  );

  const nameOf = (key: string) => (key === NATIVE_THEME ? 'Default' : themes[key]?.name ?? key);
  const descriptionOf = (key: string) =>
    key === NATIVE_THEME ? `The native ${worldName} palette` : themes[key]?.description ?? '';

  const open = () => {
    window.clearTimeout(closeTimer.current);
    setIsClosing(false);
    setFocusKey(currentTheme);
    setShownKey(null);
    setIsOpen(true);
  };

  const close = useCallback(() => {
    previewTheme(null);
    setShownKey(null);
    setIsClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(
      () => {
        setIsOpen(false);
        setIsClosing(false);
      },
      prefersReducedMotion() ? 0 : CLOSE_MS
    );
    triggerRef.current?.focus();
  }, [previewTheme]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Flag the sheet on <html> so the page behind can stay visible for live preview
  useEffect(() => {
    if (!isOpen || isClosing) return;
    document.documentElement.setAttribute('data-theme-sheet', '');
    return () => document.documentElement.removeAttribute('data-theme-sheet');
  }, [isOpen, isClosing]);

  // Move focus into the panel on open, onto the checked chip
  useEffect(() => {
    if (!isOpen || isClosing) return;
    const chip = chipRefs.current.get(focusKey) ?? chipRefs.current.get(NATIVE_THEME);
    chip?.focus({ preventScroll: true });
    chip?.scrollIntoView({ block: 'center' });
    // Runs only when the panel opens; focusKey is read once at that moment
  }, [isOpen]);

  const focusChip = (key: string) => {
    setFocusKey(key);
    const chip = chipRefs.current.get(key);
    chip?.focus();
    chip?.scrollIntoView({ block: 'nearest' });
  };

  const commit = (key: string) => {
    setTheme(key);
    setFocusKey(key);
    setShownKey(key);
  };

  const surprise = () => {
    const pool = order.filter((key) => key !== NATIVE_THEME && key !== currentTheme);
    const key = pool[Math.floor(Math.random() * pool.length)];
    commit(key);
    focusChip(key);
  };

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const index = order.indexOf(key);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % order.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + order.length) % order.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = order.length - 1;
    if (next === null) return;
    event.preventDefault();
    focusChip(order[next]);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    // Keep Tab inside the dialog
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const preview = (key: string) => {
    previewTheme(key);
    setShownKey(key);
  };

  const endPreview = () => {
    previewTheme(null);
    setShownKey(null);
  };

  const renderChip = (key: string) => {
    const checked = currentTheme === key;
    const tint = key === NATIVE_THEME ? null : getTint(key);
    const chipAccent = tint?.accent ?? WORLDS[world].swatch[1];
    return (
      <button
        key={key}
        ref={(node) => {
          if (node) chipRefs.current.set(key, node);
          else chipRefs.current.delete(key);
        }}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-describedby={`${descPrefix}-${key}`}
        tabIndex={focusKey === key ? 0 : -1}
        className={styles.chip}
        style={{ '--chip-accent': chipAccent } as CSSProperties}
        onClick={() => commit(key)}
        onKeyDown={(event) => onChipKeyDown(event, key)}
        onFocus={() => {
          setFocusKey(key);
          preview(key);
        }}
        onPointerEnter={() => preview(key)}
      >
        <Swatch stops={swatchFor(key, world)} />
        <span className={styles.chipName}>{nameOf(key)}</span>
        <span className={styles.chipCheck} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="10" height="10">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span id={`${descPrefix}-${key}`} className={styles.srOnly}>
          {descriptionOf(key)}
        </span>
      </button>
    );
  };

  const footerKey = shownKey ?? currentTheme;
  const isPreviewing = shownKey !== null && shownKey !== currentTheme;

  const panel = (
    <div className={`${styles.layer} ${isClosing ? styles.closing : ''}`}>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onPanelKeyDown}
      >
        <header className={styles.sheetHeader}>
          <div className={styles.headingBlock}>
            <p className={styles.eyebrow}>Theme for</p>
            <h2 id={titleId} className={styles.worldName}>
              {worldName}
            </h2>
            <p className={styles.lede}>A theme tints this world's accents. Its type and texture stay as designed.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={close} aria-label="Close theme switcher">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className={styles.toolbar}>
          <button type="button" className={styles.surpriseBtn} onClick={surprise}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden="true">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            Surprise me
          </button>
          <span className={styles.hint}>Hover to preview, click to keep</span>
        </div>

        <div
          className={styles.scrollArea}
          role="radiogroup"
          aria-label="Theme"
          onPointerLeave={endPreview}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) endPreview();
          }}
        >
          <div className={styles.group}>
            <div className={styles.grid}>{renderChip(NATIVE_THEME)}</div>
          </div>
          {Object.entries(themeCategories).map(([categoryKey, category]) => (
            <div key={categoryKey} className={styles.group} role="group" aria-labelledby={`${descPrefix}-cat-${categoryKey}`}>
              <h3 id={`${descPrefix}-cat-${categoryKey}`} className={styles.groupTitle}>
                {category.name}
                <span className={styles.groupCount}>{category.themes.length}</span>
              </h3>
              <div className={styles.grid}>{category.themes.filter((key) => themes[key]).map(renderChip)}</div>
            </div>
          ))}
        </div>

        <footer className={styles.sheetFooter} aria-hidden="true">
          <Swatch stops={swatchFor(footerKey, world)} className={styles.footerSwatch} />
          <div className={styles.footerText}>
            <span className={styles.footerLabel}>{isPreviewing ? 'Previewing' : 'Active'}</span>
            <strong className={styles.footerName}>{nameOf(footerKey)}</strong>
            <span className={styles.footerDesc}>{descriptionOf(footerKey)}</span>
          </div>
        </footer>
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => (isOpen && !isClosing ? close() : open())}
        aria-label={`Open theme switcher, current theme ${nameOf(currentTheme)}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen && !isClosing}
      >
        <Swatch stops={swatchFor(currentTheme, world)} className={styles.triggerSwatch} />
        <span className={styles.triggerText}>
          <span className={styles.triggerLabel}>Theme</span>
          <span className={styles.triggerValue}>{nameOf(currentTheme)}</span>
        </span>
        <svg className={styles.triggerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {isOpen && createPortal(panel, document.body)}
    </div>
  );
};
