import { FC } from 'react';
import { Link } from 'react-router-dom';
import { personaName, usePersona } from '../Branding/BrandLogos';
import { GitHubIcon, LinkedInIcon } from '../arcade/icons/ArcadeIcons';

const footerLinks = [
  { to: '/projects', label: 'Projects' },
  { to: '/arcade', label: 'Arcade' },
  { to: '/books', label: 'Books' },
  { to: '/feed', label: 'Feed' },
  { to: '/photos', label: 'Photos' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/aboutcontact', label: 'About & contact' },
];

export const Footer: FC = () => {
  const currentYear = new Date().getFullYear();
  const persona = usePersona();
  const knight = persona === 'shugknight';

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top-row">
          <div className={`footer-brand footer-brand--${persona}`}>
            <img
              src={knight ? '/img/brand/knight-and-luna/emblem.svg' : '/img/brand/plain/lockup-stacked-dark.svg'}
              alt={knight ? 'Shug Knight and Luna emblem' : 'Shugmi Shumunov'}
              className="footer-emblem"
              loading="lazy"
            />
            <Link to="/aboutcontact" className="footer-hello">
              {knight ? 'Find the knight' : 'Find me'}
              <span className="footer-hello-address">If you know, you know</span>
            </Link>
          </div>

          <nav className="footer-nav-shortcuts" aria-label="Footer">
            {footerLinks.map(({ to, label }) => (
              <Link key={to} to={to} className="footer-shortcut-link">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="footer-bottom-row">
          <p className="copyright-text">&copy; {currentYear} Shugmi Shumunov. Built in Detroit.</p>

          <div className="footer-social-cluster">
            <a
              href="https://github.com/ShugKnight24"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
              aria-label="GitHub profile"
            >
              <GitHubIcon size={18} />
            </a>
            <a
              href="https://linkedin.com/in/shugmishumunov"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
              aria-label="LinkedIn profile"
            >
              <LinkedInIcon size={18} />
            </a>
          </div>
        </div>
      </div>

      <p className="footer-wordmark" aria-hidden="true">
        {personaName(persona)}
      </p>
    </footer>
  );
};

export default Footer;
