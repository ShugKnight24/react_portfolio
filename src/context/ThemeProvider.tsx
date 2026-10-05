import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  defaultTheme,
  getTint,
  isDarkTheme,
  NATIVE_THEME,
  Theme,
  themeCategories,
  themes,
} from '../data/themes';

export type ThemeModeType = 'light' | 'dark' | 'system';

interface ThemeContextType {
  // Current theme key (e.g., 'pochita', 'dracula'), or NATIVE_THEME for the world's own palette
  currentTheme: string;
  // Light/dark preference. Kept for API compatibility: every world is dark, so it is not applied.
  mode: ThemeModeType;
  // Always 'dark' while the world system owns the page
  effectiveMode: 'light' | 'dark';
  // Commit a theme (persists). Pass NATIVE_THEME to remove the tint.
  setTheme: (themeKey: string) => void;
  // Temporarily show a theme without committing it. Pass null to restore the committed one.
  previewTheme: (themeKey: string | null) => void;
  // Set the mode (persisted, not applied)
  setMode: (mode: ThemeModeType) => void;
  // The current theme object (falls back to the default theme when no tint is active)
  theme: Theme;
  // Whether a tint is layered on the world
  isTinted: boolean;
  // Get all available themes
  allThemes: typeof themes;
  // Get theme categories
  categories: typeof themeCategories;
  // Check if current theme is a dark theme by default
  isDefaultDarkTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'portfolio-theme';
const MODE_KEY = 'portfolio-mode';

const readStore = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStore = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, blocked site data): the choice lasts for this visit only
  }
};

const TINT_PROPS = ['--t-accent', '--t-accent-hi', '--t-accent-2', '--t-on-accent', '--t-bg-tint'];

// Legacy --color-* tokens, still read by a few components outside the world remap.
const applyLegacyColors = (theme: Theme, accent?: string, accent2?: string) => {
  const root = document.documentElement;
  const colors = theme.colors;
  const primary = accent ?? colors.primary;

  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-secondary', accent2 ?? colors.secondary);
  root.style.setProperty('--color-accent', accent2 ?? colors.accent);
  root.style.setProperty('--color-background', colors.dark);
  root.style.setProperty('--color-text', colors.textDark);
  root.style.setProperty('--color-surface', adjustColor(colors.dark, 10));
  root.style.setProperty('--color-surface-elevated', adjustColor(colors.dark, 20));
  root.style.setProperty('--color-primary-light', adjustColor(primary, 20));
  root.style.setProperty('--color-primary-dark', adjustColor(primary, -20));
  root.style.setProperty('--color-on-primary', onColor(primary));
  root.style.setProperty('--color-border', 'rgba(255,255,255,0.1)');
  root.style.setProperty('--color-shadow', 'rgba(0,0,0,0.5)');
  root.setAttribute('data-theme', 'dark');
};

// Write the tint tokens for a theme on <html>; the world stylesheet picks them up via [data-tint].
const applyTint = (themeKey: string) => {
  const root = document.documentElement;
  const tint = themeKey === NATIVE_THEME ? null : getTint(themeKey);

  if (!tint) {
    root.removeAttribute('data-tint');
    TINT_PROPS.forEach((prop) => root.style.removeProperty(prop));
    applyLegacyColors(themes[defaultTheme]);
    return;
  }

  root.style.setProperty('--t-accent', tint.accent);
  root.style.setProperty('--t-accent-hi', tint.accentHi);
  root.style.setProperty('--t-accent-2', tint.accent2);
  root.style.setProperty('--t-on-accent', tint.onAccent);
  root.style.setProperty('--t-bg-tint', tint.bgTint);
  root.setAttribute('data-tint', themeKey);
  applyLegacyColors(themes[themeKey], tint.accent, tint.accent2);
};

// Near-black text on light accents, near-white on dark ones (WCAG relative luminance)
const onColor = (hex: string): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [num >> 16, (num >> 8) & 0xff, num & 0xff].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.18 ? '#140d02' : '#fafafa';
};

// Helper to lighten/darken colors
const adjustColor = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
};

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Saved tint, or the world's native palette when nothing (or something unknown) was saved
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    const savedTheme = readStore(THEME_KEY);
    return savedTheme && themes[savedTheme] ? savedTheme : NATIVE_THEME;
  });

  const [mode, setModeState] = useState<ThemeModeType>(() => {
    const savedMode = readStore(MODE_KEY);
    return savedMode === 'light' || savedMode === 'dark' || savedMode === 'system' ? savedMode : 'system';
  });

  // Committed key, readable from stable callbacks without re-subscribing
  const committedRef = useRef(currentTheme);

  const isTinted = currentTheme !== NATIVE_THEME;
  const theme = themes[currentTheme] || themes[defaultTheme];
  const isDefaultDarkTheme = isDarkTheme(currentTheme);

  const setTheme = useCallback((themeKey: string) => {
    if (themeKey !== NATIVE_THEME && !themes[themeKey]) return;
    committedRef.current = themeKey;
    setCurrentTheme(themeKey);
    writeStore(THEME_KEY, themeKey);
  }, []);

  const previewTheme = useCallback((themeKey: string | null) => {
    applyTint(themeKey ?? committedRef.current);
  }, []);

  const setMode = useCallback((newMode: ThemeModeType) => {
    setModeState(newMode);
    writeStore(MODE_KEY, newMode);
  }, []);

  useEffect(() => {
    applyTint(currentTheme);
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  }, [currentTheme]);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        mode,
        effectiveMode: 'dark',
        setTheme,
        previewTheme,
        setMode,
        theme,
        isTinted,
        allThemes: themes,
        categories: themeCategories,
        isDefaultDarkTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use the theme
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
