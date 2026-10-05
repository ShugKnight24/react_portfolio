import { FC } from 'react';
import { Link } from 'react-router-dom';
import { PageHero } from '../Layout/PageHero';
import { About } from './About';
import { Contact } from './Contact';

export const AboutContact: FC = () => (
  <div className="mc-page mc-about">
    <PageHero
      id="about-title"
      title="Hi, I'm"
      outline="Shug"
      meta={[
        'Detroit, MI',
        'Engineer, lifter, reader',
        'Runs Shumunov Solutions',
      ]}
      lede="Shugmi Shumunov. Full stack engineer in Detroit, fond of small teams, heavy lifts and long walks with good dogs."
      aside={
        <figure className="mc-still mc-still--tilt-right mc-still--hero">
          <img src="./img/shug_bpak.jpg" alt="Shugmi Shumunov with bodybuilder Ben Pakulski" />
          <figcaption>
            Standing next to bodybuilder{' '}
            <a href="https://www.benpakulski.com" target="_blank" rel="noopener noreferrer">
              Ben Pakulski
            </a>
            , for scale
          </figcaption>
        </figure>
      }
    >
      <a href="#contact" className="mc-btn">
        Follow the clues
      </a>
      <Link to="/projects" className="mc-link">
        See the evidence <span aria-hidden="true">→</span>
      </Link>
    </PageHero>

    <div className="mc-shell">
      <About />
      <Contact />
    </div>
  </div>
);
