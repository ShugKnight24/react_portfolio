import { FC, Suspense, useEffect } from 'react';
import ReactGA from 'react-ga4';
import './App.scss';
import { Content, Footer, Layout, Main } from './components/Layout';
import { HeaderDrawer } from './components/Layout/HeaderDrawer';
import { Loading } from './components/Loading';

export const App: FC = () => {
  useEffect(() => {
    ReactGA.send({ hitType: 'pageview', page: window.location.pathname });
  }, []);

  return (
    <>
      <Layout>
        <HeaderDrawer />
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
