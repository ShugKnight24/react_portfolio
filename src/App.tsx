import { FC, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import './styles/global.css';
import { Content, Footer, Layout, Main } from './components/Layout';
import { HeaderDrawer } from './components/Layout/HeaderDrawer';
import { Loading } from './components/Loading';
import { ScrollToTop } from './components/ScrollToTop/ScrollToTop';
import { useRouteMeta } from './utils/usePageMeta';

type World = 'motor' | 'codex' | 'arcade';

// Each experience gets its own visual language; see styles/worlds.css
const worldByPath: Record<string, World> = {
  '/books': 'codex',
  '/feed': 'codex',
  '/roadmap': 'codex',
  '/entertainment': 'arcade',
  // Legacy arcade URLs redirect into /arcade; keep the world stable during the redirect
  '/play': 'arcade',
  '/tamagotchi': 'arcade',
  '/brawler': 'arcade',
};

// Everything under /arcade (hub, halls, experiences) is the Arcade OS world
const worldPrefixes: [string, World][] = [
  ['/arcade', 'arcade'],
  ['/fun', 'arcade'],
];

const worldFor = (pathname: string): World => {
  const path = pathname.replace(/\/+$/, '') || '/';
  const prefixed = worldPrefixes.find(
    ([prefix]) => path === prefix || path.startsWith(`${prefix}/`)
  );
  return prefixed?.[1] ?? worldByPath[path] ?? 'motor';
};

const useWorld = () => {
  const { pathname } = useLocation();
  const world = worldFor(pathname);

  useEffect(() => {
    document.documentElement.dataset.world = world;
  }, [world]);
};

// New pages start at the top. Back/forward keep the browser's position, and the Fun
// player (/fun/<scene>) and Animations (/animations/<film>) switch in place, so they keep your place.
const inPlacePrefixes = ['/fun', '/animations'];

const useScrollReset = () => {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(pathname);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    // Links to a section (/aboutcontact#contact) are scrolled by the page itself
    if (from === pathname || navigationType === 'POP' || hash) return;
    const section = (path: string) =>
      inPlacePrefixes.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    const fromSection = section(from);
    if (fromSection && fromSection === section(pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash, navigationType]);
};

export const App: FC = () => {
  useWorld();
  useScrollReset();
  useRouteMeta();

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Layout>
        <HeaderDrawer />
        <Content>
          <main id="main-content" tabIndex={-1}>
            <Suspense fallback={<Loading />}>
              <Main />
            </Suspense>
          </main>
          <Footer />
        </Content>
      </Layout>
      <ScrollToTop />
    </>
  );
};
