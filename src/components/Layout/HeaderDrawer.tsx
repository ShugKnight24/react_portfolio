import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonaMark, personaName, usePersona } from '../Branding/BrandLogos';
import { ThemeSwitcher } from '../ThemeSwitcher/ThemeSwitcher';
import { Drawer, Header, Nav } from './index';

const DRAWER_ID = 'site-drawer';
const focusableSelector = 'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';

export const HeaderDrawer: FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const persona = usePersona();
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsVisible(false), []);
  const toggleDrawer = () => setIsVisible((visible) => !visible);

  // Open: focus the first link. Escape closes, and Tab cycles between the toggle and the drawer.
  // Close: if focus was in the drawer, hand it back to the toggle.
  useEffect(() => {
    const drawer = drawerRef.current;
    const toggle = toggleRef.current;
    if (!drawer || !toggle) return;

    if (!isVisible) {
      if (drawer.contains(document.activeElement)) toggle.focus();
      return;
    }

    drawer.querySelector<HTMLElement>(focusableSelector)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        toggle.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = [toggle, ...drawer.querySelectorAll<HTMLElement>(focusableSelector)];
      const current = stops.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      event.preventDefault();
      stops[(current + step + stops.length) % stops.length].focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isVisible, close]);

  return (
    <>
      <Header title={"Shugmi's Portfolio"}>
        <Nav />
      </Header>
      <button
        ref={toggleRef}
        type="button"
        aria-label="Toggle Navigation Menu"
        aria-expanded={isVisible}
        aria-controls={DRAWER_ID}
        className="drawer-button"
        onClick={toggleDrawer}
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
          aria-hidden="true"
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
      <header className="mobile-header">
        <Link to="/" className="mobile-brand" aria-label={`${personaName(persona)}, home`}>
          <PersonaMark persona={persona} size={40} />
        </Link>
      </header>
      <Drawer id={DRAWER_ID} ref={drawerRef} title="Menu" isVisible={isVisible}>
        <Nav label="Menu" toggleDrawer={close} />
        <div className="drawer-theme-section">
          <ThemeSwitcher compact={true} />
        </div>
      </Drawer>
      {/* Pointer-only backdrop; keyboard users close with Escape or the toggle */}
      <div
        className={`drawer-overlay ${isVisible ? 'active' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
    </>
  );
};
