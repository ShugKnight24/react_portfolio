import React, { FC } from 'react';
import { Link } from 'react-router-dom';
import { HeaderInterface } from '../../types/layout';
import {
  BrandPersona,
  PersonaMark,
  PersonaWordmark,
  personaName,
  setActivePersona,
  usePersona,
} from '../Branding/BrandLogos';
import { sound } from '../arcade/audio/audioSynth';

export const Header: FC<HeaderInterface> = ({ children }) => {
  const persona = usePersona();

  const handleTogglePersona = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next: BrandPersona = persona === 'shugknight' ? 'shugmi' : 'shugknight';
    sound.playCoin();
    setActivePersona(next);
  };

  const personaLabel = personaName(persona);
  const otherLabel = personaName(persona === 'shugknight' ? 'shugmi' : 'shugknight');

  return (
    <header className="header">
      <div className="header-container">
        <div className="brand-group">
          <button
            type="button"
            onClick={handleTogglePersona}
            className={`brand-persona-toggle brand-persona-toggle--${persona}`}
            aria-label={`Current identity: ${personaLabel}. Click to switch to ${otherLabel}.`}
            title={`Switch to ${otherLabel}`}
          >
            <PersonaMark persona={persona} size={52} />
            <span className="persona-switch-badge" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 5h10M9 2l3 3-3 3M14 11H4M7 8l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          <Link to="/" className="brand-link" aria-label={`${personaLabel}, home`}>
            <PersonaWordmark persona={persona} />
          </Link>
        </div>
        {children}
      </div>
    </header>
  );
};
