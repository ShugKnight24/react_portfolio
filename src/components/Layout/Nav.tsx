import { FC } from 'react';
import { NavLink } from 'react-router-dom';
import { NavProps } from '../../types/layout';
import { trackPageEvent } from '../Analytics/analyticsUtils';
import { navLinks } from './routes';

// TODO: Figure out if this would be useful elsewhere
// Perhaps add to a config file, consolidate data, and use throughout?

export const Nav: FC<NavProps> = ({ drawerClose }) => {
  return (
    <nav className="nav">
      {navLinks.map((link, index) => (
        <NavLink
          key={index}
          to={link.path}
          onClick={() => {
            drawerClose();
            trackPageEvent('Navigation', 'User navigated to', link.path);
          }}
        >
          {link.name}
        </NavLink>
      ))}
    </nav>
  );
};
