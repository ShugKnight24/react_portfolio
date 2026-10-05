import { FC, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PageHero } from '../Layout/PageHero';
import { About } from './About';
import { Contact } from './Contact';

// Links such as /aboutcontact#contact land on that section once the page has rendered
const useScrollToHash = () => {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    );
    return () => cancelAnimationFrame(frame);
  }, [hash]);
};

export const AboutContact: FC = () => {
  useScrollToHash();

  return (
    <div className="mc-page mc-about">
      <PageHero
        id="about-title"
        title="Hi, I'm"
        outline="Shug"
        meta={['Detroit, MI', 'Engineer, lifter, reader', 'Runs Shumunov Solutions']}
        lede="Shugmi Shumunov. Full stack engineer in Detroit, fond of small teams, heavy lifts and long walks with good dogs."
        aside={
          <figure className="mc-still mc-still--tilt-right mc-still--hero">
            <picture>
              <source
                type="image/webp"
                srcSet="/img/shug_bpak-600.webp 600w, /img/shug_bpak-1000.webp 1000w"
                sizes="(max-width: 900px) 16rem, 22rem"
              />
              <img
                src="/img/shug_bpak.jpg"
                alt="Shugmi Shumunov with bodybuilder Ben Pakulski"
                width={2880}
                height={3840}
                fetchPriority="high"
                decoding="async"
              />
            </picture>
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
};
