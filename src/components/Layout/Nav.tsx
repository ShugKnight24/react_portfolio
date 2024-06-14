import { FC } from 'react';
import { NavLink } from 'react-router-dom';
import { NavProps } from '../../types/layout';
import { trackPageEvent } from '../Analytics/analyticsUtils';

// TODO: Figure out if this would be useful elsewhere
// Perhaps add to a config file, consolidate data, and use throughout?
const navLinks = [
  { path: '/', name: 'Home' },
  { path: '/about', name: 'About' },
  { path: '/books', name: 'Books' },
  { path: '/contact', name: 'Contact' },
  { path: '/feed', name: 'Feed' },
  { path: '/photos', name: 'Photos' },
  { path: '/projects', name: 'Projects' },
  { path: '/resume', name: 'Resume' },
];

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
