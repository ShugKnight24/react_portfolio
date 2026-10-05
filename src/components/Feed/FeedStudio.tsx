import { FC, useState, useEffect } from 'react';
import { sound } from '../arcade/audio/audioSynth';
import styles from './Feed.module.css';

export type FeedTheme =
  | 'classic'
  | 'cyberpunk'
  | 'darkAcademia'
  | 'geocities'
  | 'vaporwave'
  | 'minimalist';

export type FeedLayout = 'stream' | 'masonry' | 'scrapbook' | 'compact';
export type FeedTypography = 'serif' | 'sans' | 'mono' | 'journal';
export type FeedBackgroundPattern = 'clean' | 'dots' | 'grid' | 'scanlines';

export interface FeedCustomizationState {
  theme: FeedTheme;
  layout: FeedLayout;
  typography: FeedTypography;
  pattern: FeedBackgroundPattern;
  sparklesEnabled: boolean;
  blogTitle: string;
  blogSubtitle: string;
}

export const DEFAULT_FEED_CUSTOMIZATION: FeedCustomizationState = {
  theme: 'classic',
  layout: 'stream',
  typography: 'serif',
  pattern: 'clean',
  sparklesEnabled: false,
  blogTitle: 'Thoughts, Music, & Inspiration',
  blogSubtitle:
    'A curated collection of quotes, lyrics, and moments that inspire me. This is my digital journal: raw, unfiltered, and deeply personal.',
};

const STORAGE_KEY = 'portfolio_feed_customization_v1';

export const loadFeedCustomization = (): FeedCustomizationState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_FEED_CUSTOMIZATION, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load feed customization:', e);
  }
  return DEFAULT_FEED_CUSTOMIZATION;
};

export const saveFeedCustomization = (state: FeedCustomizationState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save feed customization:', e);
  }
};

export const THEMES: { id: FeedTheme; name: string; swatch: string; accent: string }[] = [
  { id: 'classic', name: 'Codex', swatch: 'linear-gradient(135deg, #0c0a07 55%, #d4a84b)', accent: '#d4a84b' },
  { id: 'cyberpunk', name: 'Cyberpunk', swatch: 'linear-gradient(135deg, #050508, #00F0FF)', accent: '#00F0FF' },
  { id: 'darkAcademia', name: 'Academia', swatch: 'linear-gradient(135deg, #14110F, #D4AF37)', accent: '#D4AF37' },
  { id: 'geocities', name: '90s Geo', swatch: 'linear-gradient(90deg, #FF007F, #00FFCC, #FFFF00)', accent: '#FFFF00' },
  { id: 'vaporwave', name: 'Vaporwave', swatch: 'linear-gradient(135deg, #130924, #FF719A)', accent: '#FF719A' },
  { id: 'minimalist', name: 'Editorial', swatch: 'linear-gradient(135deg, #09090B, #FFFFFF)', accent: '#FFFFFF' },
];

export const LAYOUTS: { id: FeedLayout; label: string }[] = [
  { id: 'stream', label: 'Stream' },
  { id: 'masonry', label: 'Masonry' },
  { id: 'scrapbook', label: 'Scrapbook' },
  { id: 'compact', label: 'Compact' },
];

export const TYPOGRAPHIES: { id: FeedTypography; label: string }[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'mono', label: 'Mono' },
  { id: 'journal', label: 'Journal' },
];

const PATTERNS: { id: FeedBackgroundPattern; label: string }[] = [
  { id: 'clean', label: 'Solid' },
  { id: 'dots', label: 'Dot Matrix' },
  { id: 'grid', label: 'Grid Blueprint' },
  { id: 'scanlines', label: 'Retro Scanlines' },
];

interface FeedStudioProps {
  customization: FeedCustomizationState;
  onChange: (customization: FeedCustomizationState) => void;
  onToast: (msg: string) => void;
}

export const FeedStudio: FC<FeedStudioProps> = ({ customization, onChange, onToast }) => {
  const [isOpen, setIsOpen] = useState(false);

  const updateField = <K extends keyof FeedCustomizationState>(
    key: K,
    val: FeedCustomizationState[K]
  ) => {
    sound.playBeep();
    const updated = { ...customization, [key]: val };
    onChange(updated);
    saveFeedCustomization(updated);
  };

  const handleReset = () => {
    sound.playCoin();
    onChange(DEFAULT_FEED_CUSTOMIZATION);
    saveFeedCustomization(DEFAULT_FEED_CUSTOMIZATION);
    onToast('Restored the default style');
  };

  return (
    <>
      {/* Floating Bottom Quick Dock */}
      <div className={styles.customizationDock}>
        <button
          type="button"
          className={styles.dockCustomizeBtn}
          onClick={() => {
            sound.playPowerUp();
            setIsOpen(true);
          }}
          title="Open Blog Customizer Studio"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>Customize</span>
        </button>

        {/* Quick Theme Dots */}
        <div className={styles.quickThemeDots}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`${styles.themeDot} ${customization.theme === theme.id ? styles.active : ''}`}
              style={{ background: theme.accent }}
              onClick={() => {
                updateField('theme', theme.id);
                onToast(`Switched theme: ${theme.name}`);
              }}
              title={`Quick switch: ${theme.name}`}
              aria-label={theme.name}
            />
          ))}
        </div>
      </div>

      {/* Slide-Out Customizer Studio Drawer */}
      {isOpen && (
        <div className={styles.studioDrawerBackdrop} onClick={() => setIsOpen(false)}>
          <div className={styles.studioDrawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="18"
                  height="18"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 4.24 4.24" />
                  <path d="m14.83 9.17 4.24-4.24" />
                  <path d="m14.83 14.83 4.24 4.24" />
                  <path d="m9.17 14.83-4.24 4.24" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
                <span>Theme studio</span>
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsOpen(false)}
                aria-label="Close studio"
              >
                ×
              </button>
            </div>

            <div className={styles.drawerContent}>
              {/* Aesthetic Themes */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Aesthetic Theme</label>
                <div className={styles.themeGrid}>
                  {THEMES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      aria-pressed={customization.theme === t.id}
                      className={`${styles.themeCard} ${customization.theme === t.id ? styles.active : ''}`}
                      onClick={() => {
                        updateField('theme', t.id);
                        onToast(`Aesthetic set to ${t.name}`);
                      }}
                    >
                      <div className={styles.themeSwatchBar} style={{ background: t.swatch }} />
                      <span className={styles.themeName}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Mode */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Feed Layout</label>
                <div className={styles.optionPills}>
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`${styles.pillBtn} ${customization.layout === l.id ? styles.active : ''}`}
                      onClick={() => updateField('layout', l.id)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Typography</label>
                <div className={styles.optionPills}>
                  {TYPOGRAPHIES.map((typ) => (
                    <button
                      key={typ.id}
                      type="button"
                      className={`${styles.pillBtn} ${customization.typography === typ.id ? styles.active : ''}`}
                      onClick={() => updateField('typography', typ.id)}
                    >
                      {typ.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Texture Pattern */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Background Pattern</label>
                <div className={styles.optionPills}>
                  {PATTERNS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.pillBtn} ${customization.pattern === p.id ? styles.active : ''}`}
                      onClick={() => updateField('pattern', p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cursor Sparkles Toggle */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Fun Extras</label>
                <div className={styles.optionPills}>
                  <button
                    type="button"
                    className={`${styles.pillBtn} ${customization.sparklesEnabled ? styles.active : ''}`}
                    onClick={() => {
                      const next = !customization.sparklesEnabled;
                      updateField('sparklesEnabled', next);
                      onToast(next ? 'Cursor sparkles on' : 'Cursor sparkles off');
                    }}
                  >
                    {customization.sparklesEnabled ? 'Sparkles on' : 'Sparkles off'}
                  </button>
                </div>
              </div>

              {/* Custom Header Title & Subtitle */}
              <div className={styles.sectionGroup}>
                <label className={styles.groupLabel}>Personalize Header</label>
                <div className={styles.blogMetaInputs}>
                  <input
                    type="text"
                    value={customization.blogTitle}
                    onChange={(e) => updateField('blogTitle', e.target.value)}
                    placeholder="Custom Blog Title..."
                  />
                  <input
                    type="text"
                    value={customization.blogSubtitle}
                    onChange={(e) => updateField('blogSubtitle', e.target.value)}
                    placeholder="Custom Bio / Subtitle..."
                  />
                </div>
              </div>

              {/* Reset defaults */}
              <button type="button" className={styles.resetBtn} onClick={handleReset}>
                Reset to the default style
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
