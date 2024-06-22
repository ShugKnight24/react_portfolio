import { FC, KeyboardEvent, Suspense, useEffect, useState } from 'react';
import ReactGA from 'react-ga4';
import './App.scss';
import { Content, Drawer, Footer, Header, Layout, Main, Nav } from './components/Layout';
import { Loading } from './components/Loading';

export const App: FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    ReactGA.send({ hitType: 'pageview', page: window.location.pathname });
  }, []);

  function toggleDrawer(event?: KeyboardEvent<HTMLDivElement>) {
    if (!event || event.key === 'Enter') {
      setIsVisible(!isVisible);
    }
  }

  const navRoutes = <Nav />;
  const navRoutesWithToggle = <Nav drawerClose={() => toggleDrawer()} />;

  return (
    <>
      <Layout>
        <Header title={"Shugmi's Portfolio"}>{navRoutes}</Header>
        <div
          aria-expanded="false"
          role="button"
          tabIndex={0}
          className="drawer-button"
          onClick={() => toggleDrawer()}
          onKeyDown={(event) => toggleDrawer(event)}
        >
          <i className="material-icons"></i>
        </div>
        <div className="mobile-header"></div>
        <Drawer title="Nav" isVisible={isVisible}>
          {navRoutesWithToggle}
        </Drawer>
        <div
          className={`drawer-overlay ${isVisible ? 'active' : ''}`}
          onClick={() => toggleDrawer()}
          onKeyDown={(event) => toggleDrawer(event)}
          role="button"
          tabIndex={-1}
        />
        <Content>
          <Suspense fallback={<Loading />}>
            <Main />
          </Suspense>
          <Footer />
        </Content>
      </Layout>
    </>
  );
};
