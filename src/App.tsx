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

  function closeDrawer(event?: KeyboardEvent<HTMLDivElement>) {
    if (event) {
      if (event.key === 'Enter') {
        setIsVisible(false);
      } else {
        return;
      }
    } else {
      setIsVisible(false);
    }
  }

  function openDrawer(event?: KeyboardEvent<HTMLDivElement>) {
    if (event) {
      if (event.key === 'Enter') {
        setIsVisible(true);
      } else {
        return;
      }
    } else {
      setIsVisible(true);
    }
  }

  // TODO: Fix close drawer functionality on navigation click
  const navRoutes = <Nav drawerClose={() => closeDrawer()} />;

  return (
    <>
      <Layout>
        <Header title={"Shugmi's Portfolio"}>{navRoutes}</Header>
        <div
          aria-expanded="false"
          role="button"
          tabIndex={0}
          className="drawer-button"
          onClick={() => openDrawer()}
          onKeyDown={(event) => openDrawer(event)}
        >
          <i className="material-icons"></i>
        </div>
        <div className="mobile-header"></div>
        <Drawer title="Nav" isVisible={isVisible}>
          {navRoutes}
        </Drawer>
        <div
          className={`drawer-overlay ${isVisible ? 'active' : ''}`}
          onClick={() => closeDrawer()}
          onKeyDown={(event) => closeDrawer(event)}
          role="button"
          tabIndex={-1}
        ></div>
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
