import { FC, KeyboardEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonaMark, personaName, usePersona } from '../Branding/BrandLogos';
import { ThemeSwitcher } from '../ThemeSwitcher/ThemeSwitcher';
import { Drawer, Header, Nav } from './index';

export const HeaderDrawer: FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const persona = usePersona();

  function toggleDrawer(event?: KeyboardEvent<HTMLDivElement>) {
    if (!event || event.key === 'Enter') {
      setIsVisible(!isVisible);
    }
  }

  const navRoutes = <Nav />;
  const navRoutesWithToggle = <Nav toggleDrawer={() => toggleDrawer()} />;

  return (
    <>
      <Header title={"Shugmi's Portfolio"}>{navRoutes}</Header>
      <button
        type="button"
        aria-label="Toggle Navigation Menu"
        aria-expanded={isVisible}
        className="drawer-button"
        onClick={() => toggleDrawer()}
      >
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isVisible ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </>
          )}
        </svg>
      </button>
      <div className="mobile-header">
        <Link to="/" className="mobile-brand" aria-label={`${personaName(persona)}, home`}>
          <PersonaMark persona={persona} size={40} />
        </Link>
      </div>
      <Drawer title="Menu" isVisible={isVisible}>
        {navRoutesWithToggle}
        <div className="drawer-theme-section">
          <ThemeSwitcher compact={true} />
        </div>
      </Drawer>
      <div
        className={`drawer-overlay ${isVisible ? 'active' : ''}`}
        onClick={() => toggleDrawer()}
        onKeyDown={(event) => toggleDrawer(event)}
        role="button"
        tabIndex={-1}
      />
    </>
  );
};
