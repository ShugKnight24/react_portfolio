import { FC } from 'react';
import { NavLink } from 'react-router-dom';
import { NavProps } from '../../types/layout';
import { trackPageEvent } from '../Analytics/analyticsUtils';
import { navLinks } from './routes';

export const Nav: FC<NavProps> = ({ toggleDrawer }) => {
  return (
    <nav className="nav">
      {navLinks.map((link, index) => (
        <NavLink
          key={index}
          to={link.path}
          onClick={() => {
            if (toggleDrawer) {
              toggleDrawer();
            }
            trackPageEvent('Navigation', 'User navigated to', link.path);
          }}
        >
          {link.name}
        </NavLink>
      ))}
    </nav>
  );
};
