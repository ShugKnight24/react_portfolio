// Theme Configuration for Portfolio
// Each theme includes colors, optional fonts, and metadata

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  dark: string;
  text: string;
  textDark: string;
}

export interface Theme {
  name: string;
  description: string;
  colors: ThemeColors;
  font?: string;
}

export interface ThemeCategory {
  name: string;
  description: string;
  icon: string;
  themes: string[];
}

export const themes: Record<string, Theme> = {
  // === ANIME-INSPIRED THEMES ===
  pochita: {
    name: 'Pochita',
    description: "Warm and friendly, like everyone's favorite chainsaw dog",
    colors: {
      primary: '#D97340',
      secondary: '#515356',
      accent: '#353A3D',
      background: '#EBEBE7',
      dark: '#1D202F',
      text: '#353A3D',
      textDark: '#EBEBE7',
    },
  },

  chainsaw: {
    name: 'Chainsaw',
    description: 'Bold and intense, for the devil hunters',
    colors: {
      primary: '#B52C2F',
      secondary: '#343837',
      accent: '#A93D26',
      background: '#EFEAD7',
      dark: '#493228',
      text: '#343837',
      textDark: '#E1DCD8',
    },
  },

  denji: {
    name: 'Denji',
    description: 'Hungry for more, just like our favorite hero',
    colors: {
      primary: '#8F3E3A',
      secondary: '#DBA763',
      accent: '#B52C2F',
      background: '#F2D5A9',
      dark: '#493228',
      text: '#493228',
      textDark: '#EFEAD7',
    },
  },

  reze: {
    name: 'Reze',
    description: 'Mysterious and explosive',
    colors: {
      primary: '#5A9263',
      secondary: '#3D3A4B',
      accent: '#CFCA77',
      background: '#C9D8D0',
      dark: '#1B2120',
      text: '#1B2120',
      textDark: '#C9D8D0',
    },
  },

  youngGoku: {
    name: 'Young Goku',
    description: 'Adventurous and full of energy',
    colors: {
      primary: '#CD3528',
      secondary: '#121B84',
      accent: '#DF4B0B',
      background: '#F2EEEE',
      dark: '#000000',
      text: '#000000',
      textDark: '#F7E79C',
    },
  },

  goku: {
    name: 'Goku',
    description: 'The legendary Super Saiyan',
    colors: {
      primary: '#FA6E30',
      secondary: '#2C4474',
      accent: '#EA2E37',
      background: '#F3EBE8',
      dark: '#1A191E',
      text: '#1A191E',
      textDark: '#FAD3C0',
    },
  },

  vegeta: {
    name: 'Vegeta',
    description: 'Pride of the Saiyan Prince',
    colors: {
      primary: '#2440AA',
      secondary: '#F7DF7A',
      accent: '#955336',
      background: '#E3E8E8',
      dark: '#1D1918',
      text: '#1D1918',
      textDark: '#F3DFB0',
    },
  },

  devilHeart: {
    name: 'Devil Heart',
    description: 'Deep orange intensity',
    colors: {
      primary: '#E65100',
      secondary: '#37474F',
      accent: '#FFD600',
      background: '#FFF3E0',
      dark: '#121212',
      text: '#263238',
      textDark: '#FFE0B2',
    },
  },

  crimsonSteel: {
    name: 'Crimson Steel',
    description: 'Bold red with industrial edge',
    colors: {
      primary: '#D32F2F',
      secondary: '#546E7A',
      accent: '#263238',
      background: '#FAFAFA',
      dark: '#212121',
      text: '#212121',
      textDark: '#CFD8DC',
    },
  },

  goldenCity: {
    name: 'Golden City',
    description: 'Warm gold with teal accents',
    colors: {
      primary: '#F9A825',
      secondary: '#00695C',
      accent: '#C62828',
      background: '#FFFDE7',
      dark: '#263238',
      text: '#3E2723',
      textDark: '#FFF59D',
    },
  },

  bombFlower: {
    name: 'Bomb Flower',
    description: 'Purple explosion of color',
    colors: {
      primary: '#7B1FA2',
      secondary: '#2E7D32',
      accent: '#EC407A',
      background: '#F3E5F5',
      dark: '#1A1A2E',
      text: '#212121',
      textDark: '#E1BEE7',
    },
  },

  martialSpirit: {
    name: 'Martial Spirit',
    description: 'Orange energy with blue power',
    colors: {
      primary: '#EF6C00',
      secondary: '#1565C0',
      accent: '#FFD600',
      background: '#FFF8E1',
      dark: '#0D47A1',
      text: '#212121',
      textDark: '#FFECB3',
    },
  },

  royalPride: {
    name: 'Royal Pride',
    description: 'Royal blue with golden accents',
    colors: {
      primary: '#2962FF',
      secondary: '#FFD600',
      accent: '#C2185B',
      background: '#E3F2FD',
      dark: '#000051',
      text: '#0D47A1',
      textDark: '#BBDEFB',
    },
  },

  // === JJK THEMES ===
  gracefulDancer: {
    name: 'Graceful Dancer',
    description: 'Elegant like Nobara',
    colors: {
      primary: '#BF2F49',
      secondary: '#D5B051',
      accent: '#BD7BAB',
      background: '#F5F1F2',
      dark: '#413D4D',
      text: '#413D4D',
      textDark: '#EBD4AA',
    },
  },

  reawakenedMonarch: {
    name: 'Reawakened Monarch',
    description: 'Powerful like Megumi',
    colors: {
      primary: '#34567F',
      secondary: '#4A7A63',
      accent: '#DCA15A',
      background: '#F4F2F4',
      dark: '#3A3F4D',
      text: '#3A3F4D',
      textDark: '#F4E0C5',
    },
  },

  sixEyes: {
    name: 'Six Eyes',
    description: 'Limitless like Gojo',
    colors: {
      primary: '#77B2E1',
      secondary: '#382B58',
      accent: '#DEFAFF',
      background: '#FDF4FF',
      dark: '#161723',
      text: '#382B58',
      textDark: '#DAC3E9',
    },
  },

  divergentFist: {
    name: 'Divergent Fist',
    description: 'Strong like Yuji',
    colors: {
      primary: '#BB3D38',
      secondary: '#402A20',
      accent: '#AE995E',
      background: '#FCE0CB',
      dark: '#1F1E2B',
      text: '#402A20',
      textDark: '#F7CCA9',
    },
  },

  // === MODERN THEMES ===
  neonNight: {
    name: 'Neon Night',
    description: 'Cyberpunk vibes',
    colors: {
      primary: '#00E5FF',
      secondary: '#D500F9',
      accent: '#FFEA00',
      background: '#F5F5F5',
      dark: '#0A0A0A',
      text: '#212121',
      textDark: '#E0F7FA',
    },
  },

  synthwave: {
    name: 'Synthwave',
    description: 'Retro 80s aesthetic',
    colors: {
      primary: '#FF006E',
      secondary: '#8338EC',
      accent: '#3A86FF',
      background: '#F8F9FA',
      dark: '#10002B',
      text: '#10002B',
      textDark: '#E0AAFF',
    },
  },

  forestZen: {
    name: 'Forest Zen',
    description: 'Calm and natural',
    colors: {
      primary: '#2E7D32',
      secondary: '#5D4037',
      accent: '#8BC34A',
      background: '#F1F8E9',
      dark: '#1B5E20',
      text: '#1B5E20',
      textDark: '#DCEDC8',
    },
  },

  oceanBreeze: {
    name: 'Ocean Breeze',
    description: 'Cool and refreshing',
    colors: {
      primary: '#0077B6',
      secondary: '#00B4D8',
      accent: '#90E0EF',
      background: '#F0F9FF',
      dark: '#03045E',
      text: '#03045E',
      textDark: '#CAF0F8',
    },
  },

  sunsetGlow: {
    name: 'Sunset Glow',
    description: 'Warm and inviting',
    colors: {
      primary: '#FF6B35',
      secondary: '#F7C59F',
      accent: '#EFEFD0',
      background: '#FFF8F0',
      dark: '#2A1B0A',
      text: '#2A1B0A',
      textDark: '#FFE4C9',
    },
  },

  midnightPurple: {
    name: 'Midnight Purple',
    description: 'Elegant and mysterious',
    colors: {
      primary: '#7C3AED',
      secondary: '#A78BFA',
      accent: '#F472B6',
      background: '#FAF5FF',
      dark: '#1E1B4B',
      text: '#1E1B4B',
      textDark: '#E9D5FF',
    },
  },

  // === CLASSIC THEMES ===
  default: {
    name: 'Cobalt',
    description: 'Deep blue with vibrant energy',
    colors: {
      primary: '#1E40AF',
      secondary: '#1E3A8A',
      accent: '#DC2626',
      background: '#F8FAFC',
      dark: '#0F172A',
      text: '#1E293B',
      textDark: '#F1F5F9',
    },
  },

  monochrome: {
    name: 'Monochrome',
    description: 'Timeless black and white',
    colors: {
      primary: '#18181B',
      secondary: '#52525B',
      accent: '#A1A1AA',
      background: '#FAFAFA',
      dark: '#09090B',
      text: '#18181B',
      textDark: '#F4F4F5',
    },
  },

  github: {
    name: 'GitHub',
    description: "Inspired by GitHub's design",
    colors: {
      primary: '#238636',
      secondary: '#1F6FEB',
      accent: '#F78166',
      background: '#FFFFFF',
      dark: '#0D1117',
      text: '#24292F',
      textDark: '#C9D1D9',
    },
  },

  // === RETRO CODING THEMES ===
  matrix: {
    name: 'Matrix',
    description: 'Follow the white rabbit',
    colors: {
      primary: '#00FF41',
      secondary: '#008F11',
      accent: '#00FF41',
      background: '#0D0D0D',
      dark: '#000000',
      text: '#00FF41',
      textDark: '#00FF41',
    },
    font: "'Courier New', monospace",
  },

  vscode: {
    name: 'VS Code Dark',
    description: "The developer's choice",
    colors: {
      primary: '#007ACC',
      secondary: '#3794FF',
      accent: '#DCDCAA',
      background: '#1E1E1E',
      dark: '#252526',
      text: '#D4D4D4',
      textDark: '#D4D4D4',
    },
    font: "'Fira Code', monospace",
  },

  dracula: {
    name: 'Dracula',
    description: 'A dark theme for dark souls',
    colors: {
      primary: '#BD93F9',
      secondary: '#FF79C6',
      accent: '#50FA7B',
      background: '#282A36',
      dark: '#21222C',
      text: '#F8F8F2',
      textDark: '#F8F8F2',
    },
    font: "'JetBrains Mono', monospace",
  },

  nord: {
    name: 'Nord',
    description: 'Arctic, north-bluish color palette',
    colors: {
      primary: '#88C0D0',
      secondary: '#81A1C1',
      accent: '#EBCB8B',
      background: '#2E3440',
      dark: '#3B4252',
      text: '#ECEFF4',
      textDark: '#ECEFF4',
    },
  },

  solarized: {
    name: 'Solarized',
    description: 'Precision colors for machines and people',
    colors: {
      primary: '#268BD2',
      secondary: '#2AA198',
      accent: '#B58900',
      background: '#FDF6E3',
      dark: '#002B36',
      text: '#657B83',
      textDark: '#93A1A1',
    },
  },

  // === ADDITIONAL THEMES ===
  ember: {
    name: 'Ember',
    description: 'Warm and fiery energy',
    colors: {
      primary: '#EA580C',
      secondary: '#C2410C',
      accent: '#FBBF24',
      background: '#FFFBEB',
      dark: '#1C1917',
      text: '#292524',
      textDark: '#FEF3C7',
    },
  },

  arctic: {
    name: 'Arctic',
    description: 'Cool and crisp like winter',
    colors: {
      primary: '#0EA5E9',
      secondary: '#0284C7',
      accent: '#38BDF8',
      background: '#F0F9FF',
      dark: '#0C4A6E',
      text: '#0C4A6E',
      textDark: '#E0F2FE',
    },
  },

  lavender: {
    name: 'Lavender Dreams',
    description: 'Soft and calming purple tones',
    colors: {
      primary: '#A855F7',
      secondary: '#9333EA',
      accent: '#E879F9',
      background: '#FAF5FF',
      dark: '#2E1065',
      text: '#3B0764',
      textDark: '#F3E8FF',
    },
  },

  mint: {
    name: 'Mint Fresh',
    description: 'Clean and refreshing greens',
    colors: {
      primary: '#10B981',
      secondary: '#059669',
      accent: '#34D399',
      background: '#ECFDF5',
      dark: '#064E3B',
      text: '#065F46',
      textDark: '#D1FAE5',
    },
  },

  rose: {
    name: 'Rose Gold',
    description: 'Elegant and sophisticated',
    colors: {
      primary: '#F43F5E',
      secondary: '#E11D48',
      accent: '#FDA4AF',
      background: '#FFF1F2',
      dark: '#4C0519',
      text: '#881337',
      textDark: '#FFE4E6',
    },
  },

  slate: {
    name: 'Slate',
    description: 'Professional and neutral',
    colors: {
      primary: '#475569',
      secondary: '#334155',
      accent: '#94A3B8',
      background: '#F8FAFC',
      dark: '#0F172A',
      text: '#1E293B',
      textDark: '#E2E8F0',
    },
  },

  copper: {
    name: 'Copper',
    description: 'Warm metallic tones',
    colors: {
      primary: '#B45309',
      secondary: '#92400E',
      accent: '#D97706',
      background: '#FFFBEB',
      dark: '#451A03',
      text: '#78350F',
      textDark: '#FEF3C7',
    },
  },

  sapphire: {
    name: 'Sapphire',
    description: 'Deep royal blue elegance',
    colors: {
      primary: '#2563EB',
      secondary: '#1D4ED8',
      accent: '#3B82F6',
      background: '#EFF6FF',
      dark: '#1E3A8A',
      text: '#1E40AF',
      textDark: '#DBEAFE',
    },
  },

  wine: {
    name: 'Wine',
    description: 'Rich and luxurious burgundy',
    colors: {
      primary: '#9F1239',
      secondary: '#881337',
      accent: '#BE123C',
      background: '#FFF1F2',
      dark: '#4C0519',
      text: '#881337',
      textDark: '#FFE4E6',
    },
  },

  noir: {
    name: 'Noir',
    description: 'Sophisticated dark elegance',
    colors: {
      primary: '#FAFAFA',
      secondary: '#A1A1AA',
      accent: '#E4E4E7',
      background: '#18181B',
      dark: '#09090B',
      text: '#FAFAFA',
      textDark: '#FAFAFA',
    },
  },

  // === WACKY / CHAOTIC THEMES ===
  vaporwave: {
    name: 'Vaporwave',
    description: 'A E S T H E T I C',
    colors: {
      primary: '#FF6AD5',
      secondary: '#8795E8',
      accent: '#94D0FF',
      background: '#1A0A1E',
      dark: '#0D0510',
      text: '#FF6AD5',
      textDark: '#FF6AD5',
    },
  },

  acidTrip: {
    name: 'Acid Trip',
    description: 'Wild psychedelic colors',
    colors: {
      primary: '#39FF14',
      secondary: '#FF073A',
      accent: '#DFFF00',
      background: '#0D0D0D',
      dark: '#000000',
      text: '#39FF14',
      textDark: '#39FF14',
    },
  },

  unicorn: {
    name: 'Unicorn Magic',
    description: 'Magical rainbow sparkles',
    colors: {
      primary: '#FF69B4',
      secondary: '#87CEEB',
      accent: '#FFD700',
      background: '#FFF0F5',
      dark: '#2C003E',
      text: '#4A0E4E',
      textDark: '#FFE4EC',
    },
  },

  glitch: {
    name: 'Glitch',
    description: 'Digital corruption aesthetic',
    colors: {
      primary: '#00FFFF',
      secondary: '#FF00FF',
      accent: '#FFFF00',
      background: '#0A0A0A',
      dark: '#000000',
      text: '#00FFFF',
      textDark: '#00FFFF',
    },
  },

  retroArcade: {
    name: 'Retro Arcade',
    description: 'Pixelated 80s gaming vibes',
    colors: {
      primary: '#FF0080',
      secondary: '#00FF80',
      accent: '#8000FF',
      background: '#1A1A2E',
      dark: '#0F0F1A',
      text: '#EAEAEA',
      textDark: '#EAEAEA',
    },
  },

  bubblegum: {
    name: 'Bubblegum',
    description: 'Sweet and playful pinks',
    colors: {
      primary: '#FF69B4',
      secondary: '#FFB6C1',
      accent: '#FF1493',
      background: '#FFF0F5',
      dark: '#8B008B',
      text: '#C71585',
      textDark: '#FFE4EC',
    },
  },

  deepSpace: {
    name: 'Deep Space',
    description: 'Cosmic void with stellar accents',
    colors: {
      primary: '#9333EA',
      secondary: '#6366F1',
      accent: '#F59E0B',
      background: '#030712',
      dark: '#000000',
      text: '#E5E7EB',
      textDark: '#E5E7EB',
    },
  },

  toxicWaste: {
    name: 'Toxic Waste',
    description: 'Radioactive neon green',
    colors: {
      primary: '#ADFF2F',
      secondary: '#32CD32',
      accent: '#00FF00',
      background: '#0D1117',
      dark: '#000000',
      text: '#ADFF2F',
      textDark: '#ADFF2F',
    },
  },

  outrun: {
    name: 'Outrun',
    description: 'Synthwave sunset vibes',
    colors: {
      primary: '#FF2079',
      secondary: '#440BD4',
      accent: '#FF9800',
      background: '#1A0A30',
      dark: '#0D051A',
      text: '#EAEAEA',
      textDark: '#EAEAEA',
    },
  },

  cottonCandy: {
    name: 'Cotton Candy',
    description: 'Dreamy pastel gradient',
    colors: {
      primary: '#A78BFA',
      secondary: '#F9A8D4',
      accent: '#67E8F9',
      background: '#FEFCFF',
      dark: '#1E1B4B',
      text: '#4C1D95',
      textDark: '#EDE9FE',
    },
  },

  lavaLamp: {
    name: 'Lava Lamp',
    description: 'Groovy flowing colors',
    colors: {
      primary: '#FF4500',
      secondary: '#FFD700',
      accent: '#FF6347',
      background: '#2D1B69',
      dark: '#1A0F3C',
      text: '#FFD700',
      textDark: '#FFD700',
    },
  },

  cyberpunk: {
    name: 'Cyberpunk 2077',
    description: 'Night City neon lights',
    colors: {
      primary: '#FCEE0A',
      secondary: '#00D9FF',
      accent: '#FF003C',
      background: '#0D0221',
      dark: '#050114',
      text: '#FCEE0A',
      textDark: '#FCEE0A',
    },
  },

  reacher: {
    name: 'Reacher',
    description: 'Tactical, psychological thriller, rugged action inspired by Jack Reacher',
    colors: {
      primary: '#D97706',
      secondary: '#475569',
      accent: '#DC2626',
      background: '#1F2421',
      dark: '#0E1110',
      text: '#F1F5F9',
      textDark: '#E2E8F0',
    },
  },
};

export const defaultTheme = 'reacher';

// Theme categories for the theme switcher UI, in display order.
// Every theme is a tint: it recolors the active world's accents, never its type or texture.
export const themeCategories: Record<string, ThemeCategory> = {
  coding: {
    name: 'Coding',
    description: 'Editor palettes you already know',
    icon: 'fa-code',
    themes: ['matrix', 'vscode', 'dracula', 'nord', 'solarized', 'github'],
  },
  modern: {
    name: 'Modern',
    description: 'Clean, contemporary accents',
    icon: 'fa-sparkles',
    themes: [
      'reacher',
      'default',
      'sapphire',
      'arctic',
      'midnightPurple',
      'neonNight',
      'synthwave',
      'oceanBreeze',
      'sunsetGlow',
      'slate',
      'noir',
    ],
  },
  nature: {
    name: 'Nature',
    description: 'Borrowed from the natural world',
    icon: 'fa-leaf',
    themes: ['forestZen', 'mint', 'copper', 'ember', 'lavender', 'rose', 'wine'],
  },
  classic: {
    name: 'Classic',
    description: 'Timeless, confident color pairs',
    icon: 'fa-gem',
    themes: [
      'monochrome',
      'devilHeart',
      'crimsonSteel',
      'goldenCity',
      'bombFlower',
      'martialSpirit',
      'royalPride',
    ],
  },
  anime: {
    name: 'Anime',
    description: 'Palettes lifted from favorite series',
    icon: 'fa-dragon',
    themes: [
      'pochita',
      'chainsaw',
      'denji',
      'reze',
      'youngGoku',
      'goku',
      'vegeta',
      'gracefulDancer',
      'reawakenedMonarch',
      'sixEyes',
      'divergentFist',
    ],
  },
  random: {
    name: 'Chaotic',
    description: 'Loud experiments, use responsibly',
    icon: 'fa-bolt',
    themes: [
      'vaporwave',
      'acidTrip',
      'unicorn',
      'glitch',
      'retroArcade',
      'bubblegum',
      'deepSpace',
      'toxicWaste',
      'outrun',
      'cottonCandy',
      'lavaLamp',
      'cyberpunk',
    ],
  },
};

// Personality quotes for different theme categories
export const themeQuotes: Record<string, string[]> = {
  anime: [
    'Plus Ultra! 🦸',
    'Believe it! 🍥',
    "I'll take a potato chip... and eat it! 🥔",
    'The flow of time is always cruel... ⏰',
  ],
  modern: [
    'Less is more ✨',
    'Form follows function 📐',
    'Simplicity is the ultimate sophistication 🎯',
  ],
  nature: [
    'In every walk with nature, one receives far more than he seeks 🌿',
    'Look deep into nature, and then you will understand everything better 🌲',
  ],
  coding: [
    'There are only two hard things in CS: cache invalidation and naming things 💻',
    'It works on my machine ¯\\_(ツ)_/¯',
    '// TODO: fix this later 📝',
    "console.log('debugging in production') 🐛",
  ],
  classic: [
    'Excellence is not a destination but a continuous journey 🏆',
    'Timeless design never goes out of style 🎨',
  ],
  random: [
    'Chaos is just order waiting to be decoded 🌀',
    'Why be normal when you can be legendary? ⚡',
    'Reality is overrated anyway 🎮',
    'Embrace the glitch 👾',
    'Too weird to live, too rare to die 🦄',
    'Insert chaos here 🔥',
  ],
};

// Helper function to check if a theme is dark mode by default
export const isDarkTheme = (themeKey: string): boolean => {
  const darkThemes = ['reacher', 'matrix', 'vscode', 'dracula', 'nord'];
  return darkThemes.includes(themeKey);
};

// Get a random quote for a theme category
export const getRandomQuote = (categoryKey: string): string => {
  const quotes = themeQuotes[categoryKey] || themeQuotes.modern;
  return quotes[Math.floor(Math.random() * quotes.length)];
};

// ---------------------------------------------------------------------------
// Tints: themes layered on a world. Every world is dark, so each theme is
// reduced to accents that stay legible on near-black ink.
// ---------------------------------------------------------------------------

// Sentinel key for "no tint": each world shows its native palette.
export const NATIVE_THEME = 'world';

export interface TintPalette {
  accent: string;
  accentHi: string;
  accent2: string;
  onAccent: string;
  bgTint: string;
}

type RGB = [number, number, number];

const toRgb = (hex: string): RGB => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  const num = parseInt(full, 16);
  return [num >> 16, (num >> 8) & 0xff, num & 0xff];
};

const toHex = ([r, g, b]: RGB): string =>
  `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

const mix = (a: RGB, b: RGB, amount: number): RGB => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
];

// WCAG 2.x relative luminance
const luminance = ([r, g, b]: RGB): number => {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const hueSat = ([r, g, b]: RGB): { hue: number; sat: number } => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r / 255) hue = ((g - b) / 255 / delta) % 6;
    else if (max === g / 255) hue = (b - r) / 255 / delta + 2;
    else hue = (r - g) / 255 / delta + 4;
  }
  return { hue: (hue * 60 + 360) % 360, sat };
};

// Darkest surface any world paints (codex ink); accents are tested against it.
const WORLD_INK: RGB = [12, 10, 7];
const WHITE: RGB = [255, 255, 255];

// Lift a color toward white until it clears the contrast target on world ink.
const legibleOnInk = (color: RGB, target: number): RGB => {
  let out = color;
  for (let step = 0; step < 20 && contrast(out, WORLD_INK) < target; step += 1) {
    out = mix(out, WHITE, 0.08);
  }
  return out;
};

// Black or white text on the accent, whichever has more contrast
export const onAccentFor = (hex: string): string => {
  const rgb = toRgb(hex);
  return contrast(rgb, [10, 10, 12]) >= contrast(rgb, [250, 250, 250]) ? '#0a0a0c' : '#fafafa';
};

const tintCache = new Map<string, TintPalette>();

export const getTint = (themeKey: string): TintPalette | null => {
  const theme = themes[themeKey];
  if (!theme) return null;
  const cached = tintCache.get(themeKey);
  if (cached) return cached;

  const primary = toRgb(theme.colors.primary);
  const primaryHue = hueSat(primary).hue;

  // Second accent: the more saturated, more distinct of secondary and accent
  const score = (rgb: RGB) => {
    const { hue, sat } = hueSat(rgb);
    const distance = Math.min(Math.abs(hue - primaryHue), 360 - Math.abs(hue - primaryHue));
    return sat * (0.4 + distance / 180);
  };
  const secondary = toRgb(theme.colors.secondary);
  const accent = toRgb(theme.colors.accent);
  const second = score(accent) >= score(secondary) ? accent : secondary;

  const main = legibleOnInk(primary, 5);
  const palette: TintPalette = {
    accent: toHex(main),
    accentHi: toHex(mix(main, WHITE, 0.3)),
    accent2: toHex(legibleOnInk(second, 3.5)),
    onAccent: onAccentFor(toHex(main)),
    bgTint: toHex(main),
  };
  tintCache.set(themeKey, palette);
  return palette;
};
