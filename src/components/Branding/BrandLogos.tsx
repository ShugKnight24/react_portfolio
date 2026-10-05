import { FC, useEffect, useState } from 'react';

export type BrandPersona = 'shugmi' | 'shugknight';

const PERSONA_STORAGE_KEY = 'user_brand_persona';

export const getActivePersona = (): BrandPersona => {
  if (typeof window === 'undefined') return 'shugknight';
  const saved = localStorage.getItem(PERSONA_STORAGE_KEY);
  return saved === 'shugmi' || saved === 'shugknight' ? saved : 'shugknight';
};

export const setActivePersona = (persona: BrandPersona) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PERSONA_STORAGE_KEY, persona);
    window.dispatchEvent(new CustomEvent('personaChange', { detail: persona }));
  }
};

/** Current persona, kept in sync with the header toggle */
export const usePersona = () => {
  const [persona, setPersona] = useState<BrandPersona>('shugknight');
  useEffect(() => {
    setPersona(getActivePersona());
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<BrandPersona>).detail;
      if (next) setPersona(next);
    };
    window.addEventListener('personaChange', onChange);
    return () => window.removeEventListener('personaChange', onChange);
  }, []);
  return persona;
};

export const personaName = (persona: BrandPersona) => (persona === 'shugknight' ? 'Shug Knight' : 'Shugmi Shumunov');

interface MarkProps {
  size?: number;
  className?: string;
}

const Mark: FC<MarkProps & { src: string; alt: string }> = ({ src, alt, size = 64, className = '' }) => (
  <img
    src={src}
    alt={alt}
    width={size}
    height={size}
    className={`brand-svg ${className}`}
    style={{ objectFit: 'contain' }}
    draggable={false}
  />
);

/** Plain direction: the woven SS signet, for the Shugmi Shumunov persona */
export const ShugStylizedLogo: FC<MarkProps> = ({ className = '', ...props }) => (
  <Mark src="/img/brand/plain/mark.svg" alt="SS signet" className={`shug-stylized-logo ${className}`} {...props} />
);

// Backward-compatible alias for existing imports
export const ShugmiMonogram = ShugStylizedLogo;

/** Knight & Luna direction: the crest with the barbell helm and Luna */
export const ShugKnightEmblem: FC<MarkProps> = ({ className = '', ...props }) => (
  <Mark
    src="/img/brand/knight-and-luna/mark.svg"
    alt="Shug Knight crest with Luna"
    className={`shugknight-emblem ${className}`}
    {...props}
  />
);

/** Persona mark: the crest for Shug Knight, the signet for Shugmi Shumunov */
export const PersonaMark: FC<MarkProps & { persona: BrandPersona }> = ({ persona, ...props }) =>
  persona === 'shugknight' ? <ShugKnightEmblem {...props} /> : <ShugStylizedLogo {...props} />;

/** The persona's name set in its brand type; alt is empty because callers label the link */
export const PersonaWordmark: FC<{ persona: BrandPersona; className?: string }> = ({ persona, className = '' }) => (
  <img
    src={persona === 'shugknight' ? '/img/brand/knight-and-luna/wordmark-name-dark.svg' : '/img/brand/plain/wordmark-dark.svg'}
    alt=""
    className={`brand-wordmark brand-wordmark--${persona} ${className}`}
    draggable={false}
  />
);
