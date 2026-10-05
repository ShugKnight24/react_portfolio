import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { sound } from '../arcade/audio/audioSynth';
import styles from './Contact.module.css';

const Arrow: FC = () => (
  <svg className={styles.arrow} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

// Each lead points somewhere I actually show up; internal ones stay in the app
const clues = [
  {
    id: 'github',
    label: 'Clue 01',
    value: 'github.com/ShugKnight24',
    note: 'Where the half finished experiments live. Read the commit messages, they talk.',
    href: 'https://github.com/ShugKnight24',
  },
  {
    id: 'linkedin',
    label: 'Clue 02',
    value: 'LinkedIn',
    note: 'The respectable version. Same guy, nicer shirt.',
    href: 'https://www.linkedin.com/in/shugmishumunov/',
  },
  {
    id: 'arcade',
    label: 'Clue 03',
    value: 'The arcade',
    note: 'Somebody left the cabinet on. The high scores saw everything.',
    to: '/arcade',
  },
];

const highlightedRepos = [
  {
    id: 'next_shopping_cart',
    description:
      'E-commerce on the Next.js 14 App Router with optimistic cart state and Stripe checkout.',
    tech: ['Next.js 14', 'React Server Components', 'TypeScript', 'Tailwind CSS'],
    url: 'https://github.com/ShugKnight24/next_shopping_cart',
  },
  {
    id: 'pomidor',
    description: 'A small Pomodoro timer for deep work with custom intervals and synth chimes.',
    tech: ['JavaScript', 'CSS Modules', 'Web Audio API', 'HTML5'],
    url: 'https://github.com/ShugKnight24/pomidor',
  },
  {
    id: 'devfest_portfolio_workshop',
    description:
      'Workshop repo teaching 3D WebGL, responsive layout and performance for portfolios.',
    tech: ['React', 'Three.js', 'WebGL', 'TypeScript', 'Vite'],
    url: 'https://github.com/ShugKnight24/devfest_portfolio_workshop',
  },
];

const email = 'sshumunov@gmail.com';
const projectMailto = `mailto:${email}?subject=${encodeURIComponent('Project inquiry')}`;

const services = [
  { name: 'Websites and web apps', detail: 'React, Next.js, Node.js and TypeScript' },
  { name: 'Backend and APIs', detail: 'Databases, services and the plumbing behind the app' },
  { name: '3D and canvas', detail: 'Three.js and WebGL, for when a page should be fun' },
  { name: 'Speed ups', detail: 'Making slow pages less slow' },
];

export const Contact: FC = () => {
  const [revealed, setRevealed] = useState(false);

  const reveal = () => {
    if (!revealed) sound.playPowerUp();
    setRevealed(true);
  };

  return (
    <div className={styles.contactPage}>
      <section id="contact" className={styles.contact} aria-labelledby="contact-title">
        <header className={styles.head}>
          <p className={styles.radar}>
            <span className={styles.radarPing} aria-hidden="true" />
            Signal faint, but it&rsquo;s there
          </p>
          <h2 id="contact-title" className="mc-display-sm">
            Come say <span className="mc-outline">hello</span>
          </h2>
          <p className={styles.lead}>
            Happy to talk shop, startups, books or whatever you&rsquo;re building. Pick whichever
            door below feels most like you, or skip the clues and email me.
          </p>
          <div className={styles.actions}>
            <a href={`mailto:${email}`} className="mc-btn">
              Email me
            </a>
            <span className={styles.address}>{email}</span>
          </div>
        </header>

        <div className={styles.contactGrid}>
          <ol className={styles.channels} aria-label="Places to find me">
            {clues.map((clue) => {
              const body = (
                <>
                  <span className={styles.channelLabel}>{clue.label}</span>
                  <span className={styles.channelValue}>
                    {clue.value} <Arrow />
                  </span>
                  <span className={styles.channelNote}>{clue.note}</span>
                </>
              );
              return (
                <li key={clue.id}>
                  {clue.to ? (
                    <Link to={clue.to} className={`${styles.channel} ${styles.channelLink}`}>
                      {body}
                    </Link>
                  ) : (
                    <a
                      href={clue.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.channel} ${styles.channelLink}`}
                    >
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
            <li className={styles.channel}>
              <span className={styles.channelLabel}>Clue 04</span>
              {revealed ? (
                <span className={`${styles.channelValue} ${styles.revealed}`} aria-live="polite">
                  Knock on the crest up top
                </span>
              ) : (
                <button type="button" className={styles.redacted} onClick={reveal}>
                  <span aria-hidden="true">&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;</span>
                  <span className={styles.srOnly}>Reveal the last clue</span>
                </button>
              )}
              <span className={styles.channelNote}>
                {revealed
                  ? 'Every knight has another name. Click it and see who answers.'
                  : 'Classified. Click to declassify.'}
              </span>
            </li>
          </ol>

          <figure className="mc-still mc-still--tilt-left mc-still--small">
            <picture>
              <source type="image/webp" srcSet="/img/jbp_shug-800.webp" />
              <img
                src="/img/jbp_shug.jpg"
                alt="Shugmi Shumunov with Jordan Peterson"
                width={2613}
                height={2510}
                loading="lazy"
                decoding="async"
              />
            </picture>
            <figcaption>
              Last seen with author and professor{' '}
              <a href="https://www.jordanbpeterson.com" target="_blank" rel="noopener noreferrer">
                Jordan B. Peterson
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="consulting" className={styles.consulting} aria-labelledby="consulting-title">
        <div>
          <p className="mc-eyebrow">
            <span className={styles.statusDot} aria-hidden="true" />
            Open to new projects
          </p>
          <h2 id="consulting-title" className={styles.sectionTitle}>
            Shumunov Solutions
          </h2>
          <p className={styles.sectionText}>
            My own little shop. I build websites and apps for small businesses, and I&rsquo;m always
            up for a weird 3D project or a slow page that needs fixing.
          </p>
          <div className={styles.actions}>
            <a href={projectMailto} className="mc-btn">
              Email me about a project
            </a>
            <a
              href="https://shumunovsolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mc-link"
            >
              Shumunov Solutions <Arrow />
            </a>
          </div>
        </div>
        <dl className={styles.services}>
          {services.map((service) => (
            <div key={service.name}>
              <dt>{service.name}</dt>
              <dd>{service.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.repos} aria-labelledby="repos-title">
        <div className={styles.reposHead}>
          <p className="mc-eyebrow">GitHub</p>
          <h2 id="repos-title" className={styles.sectionTitle}>
            A few things I&rsquo;ve built
          </h2>
        </div>
        <ul className={styles.repoList}>
          {highlightedRepos.map((repo) => (
            <li key={repo.id}>
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.repoRow}
              >
                <span className={styles.repoName}>{repo.id}</span>
                <span className={styles.repoDesc}>{repo.description}</span>
                <span className={styles.repoTech}>{repo.tech.join(' / ')}</span>
                <Arrow />
              </a>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
};
