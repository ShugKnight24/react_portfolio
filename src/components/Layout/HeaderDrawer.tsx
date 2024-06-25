import { FC, KeyboardEvent, useState } from 'react';
import { Drawer, Header, Nav } from './index';

export const HeaderDrawer: FC = () => {
  const [isVisible, setIsVisible] = useState(false);

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
    </>
  );
};
