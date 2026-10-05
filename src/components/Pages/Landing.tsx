import { CSSProperties, FC, PointerEvent, ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { names } from '../../data/portfolioStrings';
import { featuredProjects, projects } from '../../data/projects';
import { techIcons } from '../../data/techIcons';
import { Feed } from '../Feed';
import { LunaAngelScene } from '../LunaAngel';
import { LunaMemories } from '../LunaAngel/LunaMemories';
import { Typewriter } from '../Typewriter';
import { GlobalGlobeHero } from '../Landing/GlobalGlobeHero';
import { PortraitHero } from '../Landing/PortraitHero';
import { TravelParallax } from '../Landing/TravelParallax';
import { Workbench } from '../Landing/Workbench';

// Primary destinations, laid out as a bento grid
const quickLinks = [
  {
    to: '/projects',
    label: 'Projects',
    blurb: 'Client builds, side projects, and the experiments that turned into products.',
    variant: 'projects',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    to: '/arcade',
    label: 'Arcade',
    blurb: 'A playable cabinet, a brawler, and a pixel pet.',
    variant: 'arcade',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="12" rx="4" />
        <path d="M7 11v4M5 13h4" />
        <circle cx="15.5" cy="12" r="1" />
        <circle cx="18" cy="14.5" r="1" />
      </svg>
    ),
  },
  {
    to: '/aboutcontact',
    label: 'About & contact',
    blurb: 'Who I am, how I work, and how to reach me.',
    variant: 'about',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    to: '/books',
    label: 'Bookshelf',
    blurb: 'The books that shaped how I think and build.',
    variant: 'books',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    to: '/fun',
    label: 'Fun',
    blurb: 'Anime, game and movie scenes you can poke at and play with.',
    variant: 'fun',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
  },
];

// Same source as the Projects page: lead screenshots for the collage, featured titles for the roll
const collageShots = projects.flatMap((p) => (p.image ? [p.image] : [])).slice(0, 3);

const quickLinkMedia: Record<string, ReactNode> = {
  projects: (
    <>
      <span className="card-collage" aria-hidden="true">
        {collageShots.map((src) => (
          <img key={src} src={src} alt="" loading="lazy" />
        ))}
      </span>
      <span className="card-roll" aria-hidden="true">
        {featuredProjects.map(({ id, title }) => (
          <span key={id}>{title}</span>
        ))}
      </span>
    </>
  ),
  about: <img src="./img/shug_brick.jpg" alt="" loading="lazy" className="card-media" />,
  arcade: <img src="./img/projects/arcade_2026.jpg" alt="" loading="lazy" className="card-media" />,
  fun: (
    <span className="card-tapes" aria-hidden="true">
      {['Kamehameha', 'Bullet Time', 'Master Sword'].map((title) => (
        <span key={title}>{title}</span>
      ))}
    </span>
  ),
  books: (
    <span className="card-covers">
      {['deep_work.jpg', 'dune.jpg', 'clean_code.jpg'].map((cover) => (
        <img key={cover} src={`./img/books/${cover}`} alt="" loading="lazy" />
      ))}
    </span>
  ),
};

// Spotlight border follows the pointer via CSS custom properties, no re-render
const trackSpotlight = (e: PointerEvent<HTMLElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
};

// Fades sections in as they enter the viewport; skipped entirely under reduced motion
const useScrollReveal = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (
      !root ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;

    // First child is the hero, which has its own entrance
    const sections = [...root.children]
      .slice(1)
      // Sections that stage their own entrance (the travel parallax) opt out
      .filter((el) => !el.hasAttribute('data-no-reveal'));
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
    );
    sections.forEach((el) => {
      el.classList.add('reveal');
      observer.observe(el);
    });
    return () => {
      observer.disconnect();
      sections.forEach((el) => el.classList.remove('reveal', 'is-revealed'));
    };
  }, []);

  return ref;
};

export const Landing: FC = () => {
  const pageRef = useScrollReveal();

  return (
    <div className="landing-page" ref={pageRef}>
      <PortraitHero>
        <div className="hero-copy">
          <Link to="/arcade" className="arcade-launch-banner">
            <span className="arcade-pill-badge">New</span>
            <span className="arcade-launch-text">The arcade cabinet is open</span>
            <span className="arcade-launch-arrow" aria-hidden="true">&rarr;</span>
          </Link>

          <h1 className="hero-title" id="hero-title">
            <span className="sr-only">Shugmi Shumunov</span>
            {['Shugmi', 'Shumunov'].map((word, row) => (
              <span key={word} className="hero-name" aria-hidden="true">
                {[...word].map((ch, i) => (
                  <span key={i} style={{ '--i': row * 6 + i } as CSSProperties}>
                    {ch}
                  </span>
                ))}
              </span>
            ))}
          </h1>

          <p className="hero-subtitle">
            Full stack engineer, building in Detroit.
            <span className="hero-alias">
              also known as <Typewriter textToType={names.slice(1)} typingSpeed={70} deletingSpeed={35} />
            </span>
          </p>

          <div className="hero-cta">
          <Link to="/projects" className="cta-primary">
            View my work
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="cta-icon"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <div className="hero-socials">
            <a
              href="https://github.com/ShugKnight24"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link github"
              aria-label="Visit my GitHub profile"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/shugmishumunov/"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link linkedin"
              aria-label="Visit my LinkedIn profile"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
        </div>
      </PortraitHero>

      <GlobalGlobeHero />

      <section className="landing-quick-nav" aria-labelledby="explore-title">
        <h2 className="section-title" id="explore-title">
          Explore my world
        </h2>
        <div className="quick-nav-grid">
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`quick-nav-card quick-nav-card--${link.variant}`}
              onPointerMove={trackSpotlight}
            >
              {quickLinkMedia[link.variant]}
              <span className="card-body">
                <span className="card-icon" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="card-label">{link.label}</span>
                <span className="card-blurb">{link.blurb}</span>
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="card-arrow"
                aria-hidden="true"
              >
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      <TravelParallax />

      <Workbench />

      {/* Celestial Angel Luna Tribute Scene */}
      <LunaAngelScene />

      <LunaMemories />

      {/* Illustrated Workspace Scene: Dual Ultrawide & Docked MacBook */}
      <section className="landing-illustration">
        <svg
          className="illustration-scene"
          viewBox="0 0 800 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Desk Legs & Heavy Duty Frame */}
          <line x1="30" y1="256" x2="30" y2="318" stroke="var(--color-border)" strokeWidth="8" strokeLinecap="round" opacity="0.6" />
          <line x1="770" y1="256" x2="770" y2="318" stroke="var(--color-border)" strokeWidth="8" strokeLinecap="round" opacity="0.6" />
          <line x1="30" y1="285" x2="770" y2="285" stroke="var(--color-border)" strokeWidth="3" opacity="0.3" />

          {/* Desk surface (widened so speakers sit solidly on top) */}
          <rect
            x="6"
            y="242"
            width="788"
            height="14"
            rx="7"
            fill="var(--color-surface-elevated)"
            stroke="var(--color-border)"
            strokeWidth="1.5"
          />
          {/* Beveled edge highlight */}
          <line x1="12" y1="244" x2="788" y2="244" stroke="var(--color-primary)" strokeWidth="1" opacity="0.3" />

          {/* Extended Desk Mat */}
          <rect
            x="240"
            y="240"
            width="320"
            height="15"
            rx="4"
            fill="var(--color-surface)"
            stroke="var(--color-border)"
            strokeWidth="1"
            opacity="0.9"
          />

          {/* Left Studio Audio Monitor (firmly resting on desk surface) */}
          <g className="illust-speaker-left">
            <rect x="18" y="165" width="38" height="77" rx="5" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="1.5" />
            <circle cx="37" cy="185" r="9" fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" />
            <circle cx="37" cy="185" r="4" fill="var(--color-primary)" opacity="0.5" />
            <circle cx="37" cy="216" r="16" fill="var(--color-surface-elevated)" stroke="var(--color-accent)" strokeWidth="1.5" />
            <circle cx="37" cy="216" r="7" fill="var(--color-accent)" opacity="0.4" />
            <rect x="34" y="235" width="6" height="2" rx="1" fill="var(--color-primary)" opacity="0.8" />
          </g>

          {/* Right Studio Audio Monitor (firmly resting on desk surface) */}
          <g className="illust-speaker-right">
            <rect x="744" y="165" width="38" height="77" rx="5" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="1.5" />
            <circle cx="763" cy="185" r="9" fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" />
            <circle cx="763" cy="185" r="4" fill="var(--color-primary)" opacity="0.5" />
            <circle cx="763" cy="216" r="16" fill="var(--color-surface-elevated)" stroke="var(--color-accent)" strokeWidth="1.5" />
            <circle cx="763" cy="216" r="7" fill="var(--color-accent)" opacity="0.4" />
            <rect x="760" y="235" width="6" height="2" rx="1" fill="var(--color-primary)" opacity="0.8" />
          </g>

          {/* Monitor Articulating Stands */}
          <path d="M195 242 L195 210 L185 185 L195 185" stroke="var(--color-border)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="188" y="238" width="14" height="6" rx="2" fill="var(--color-primary)" opacity="0.8" />

          <path d="M605 242 L605 210 L615 185 L605 185" stroke="var(--color-border)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="598" y="238" width="14" height="6" rx="2" fill="var(--color-primary)" opacity="0.8" />

          {/* LEFT ULTRAWIDE CURVED MONITOR (Code & Terminal) */}
          <g className="illust-monitor-left">
            {/* Monitor Outer Chassis */}
            <rect
              x="68"
              y="60"
              width="282"
              height="125"
              rx="8"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2"
            />
            {/* Screen Bezel / Display Panel */}
            <rect
              x="74"
              y="66"
              width="270"
              height="113"
              rx="4"
              fill="#0b0f19"
            />

            {/* Screenbar / Lightbar */}
            <rect x="145" y="52" width="128" height="6" rx="3" fill="var(--color-border)" stroke="var(--color-primary)" strokeWidth="1" />
            <line x1="150" y1="58" x2="268" y2="58" stroke="var(--color-accent)" strokeWidth="2" opacity="0.8" />

            {/* Titlebar with Window Controls & Editor Tabs */}
            <rect x="74" y="66" width="270" height="14" rx="3" fill="#1e293b" opacity="0.9" />
            <circle cx="84" cy="73" r="2.5" fill="#ef4444" opacity="0.8" />
            <circle cx="92" cy="73" r="2.5" fill="#f59e0b" opacity="0.8" />
            <circle cx="100" cy="73" r="2.5" fill="#10b981" opacity="0.8" />

            {/* Tab: main.tsx */}
            <rect x="110" y="68" width="56" height="11" rx="2" fill="#0f172a" />
            <text x="115" y="76" fontSize="6.5" fill="var(--color-primary)" fontFamily="monospace" fontWeight="bold">Index.tsx</text>

            {/* Tab: Engine.ts */}
            <rect x="170" y="68" width="54" height="11" rx="2" fill="#1e293b" opacity="0.6" />
            <text x="175" y="76" fontSize="6.5" fill="#94a3b8" fontFamily="monospace">Engine.ts</text>

            {/* Left Mini Sidebar / File Tree */}
            <rect x="74" y="80" width="22" height="99" fill="#090d16" />
            <line x1="78" y1="88" x2="90" y2="88" stroke="#64748b" strokeWidth="1" />
            <line x1="82" y1="94" x2="92" y2="94" stroke="#64748b" strokeWidth="1" />
            <line x1="82" y1="100" x2="88" y2="100" stroke="#64748b" strokeWidth="1" />
            <line x1="78" y1="108" x2="91" y2="108" stroke="#64748b" strokeWidth="1" />
            <line x1="82" y1="114" x2="90" y2="114" stroke="#64748b" strokeWidth="1" />

            {/* Code Lines in Editor */}
            <line x1="104" y1="91" x2="132" y2="91" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
            <line x1="136" y1="91" x2="185" y2="91" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <line x1="189" y1="91" x2="225" y2="91" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />

            <line x1="104" y1="100" x2="128" y2="100" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <line x1="132" y1="100" x2="198" y2="100" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
            <line x1="202" y1="100" x2="250" y2="100" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" opacity="0.9" />

            <line x1="104" y1="109" x2="138" y2="109" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
            <line x1="142" y1="109" x2="210" y2="109" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
            <line x1="214" y1="109" x2="226" y2="109" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" opacity="0.9" />

            <line x1="116" y1="118" x2="140" y2="118" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
            <line x1="144" y1="118" x2="215" y2="118" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <line x1="219" y1="118" x2="265" y2="118" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />

            <line x1="116" y1="127" x2="146" y2="127" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />
            <line x1="150" y1="127" x2="235" y2="127" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />

            <line x1="104" y1="136" x2="112" y2="136" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
            <rect className="illust-cursor" x="116" y="131" width="5" height="10" rx="1" fill="#38bdf8" />

            {/* Mini Terminal Window at Bottom */}
            <rect x="96" y="146" width="248" height="33" rx="2" fill="#050811" stroke="#1e293b" strokeWidth="1" />
            <text x="102" y="155" fontSize="6" fill="#10b981" fontFamily="monospace">▲ ready in 340ms • localhost:5173</text>
            <text x="102" y="164" fontSize="6" fill="#38bdf8" fontFamily="monospace">✓ 18 tests passed (100% typesafe)</text>
            <text x="102" y="173" fontSize="6" fill="#f59e0b" fontFamily="monospace">&gt; git commit -m &quot;cosmos: luna angel in space&quot;</text>
          </g>

          {/* CENTER DOCKED MACBOOK IN VERTICAL ALUMINUM STAND */}
          <g className="illust-docked-macbook">
            {/* Cable shadow / Desk reflection */}
            <ellipse cx="400" cy="242" rx="36" ry="3" fill="rgba(0,0,0,0.4)" />

            {/* Vertical Docking Stand Cradle */}
            <rect
              x="364"
              y="228"
              width="72"
              height="14"
              rx="4"
              fill="#334155"
              stroke="#64748b"
              strokeWidth="1.5"
            />
            {/* Rubberized Interior Slot */}
            <rect x="372" y="228" width="56" height="5" rx="1" fill="#0f172a" />

            {/* Dock Status LED Indicator */}
            <circle cx="400" cy="236" r="1.5" fill="#38bdf8" className="illust-cursor" />

            {/* MacBook Unibody Chassis (Vertical Clamshell) */}
            <rect
              x="372"
              y="108"
              width="56"
              height="122"
              rx="6"
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="1.5"
            />

            {/* MacBook Lid Bevel Edge */}
            <line x1="375" y1="112" x2="425" y2="112" stroke="#64748b" strokeWidth="1" opacity="0.6" />
            <line x1="375" y1="112" x2="375" y2="226" stroke="#64748b" strokeWidth="1" opacity="0.3" />

            {/* Polished Apple Logo on Lid */}
            <g transform="translate(393, 155) scale(0.65)">
              <path
                d="M15.2 12.9c-.04-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8s-1.9-.8-3.1-.8c-1.6 0-3.1.9-3.9 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4s1.7-.8 3.1-.8 3 .8 3.1.8c1.3 0 2.1-1.1 2.9-2.3.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.7-4.2z"
                fill="#f8fafc"
                opacity="0.85"
              />
              <path
                d="M13.6 6.3c.6-.8 1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.3z"
                fill="#f8fafc"
                opacity="0.85"
              />
            </g>

            {/* Braided Thunderbolt & Power Cables routed to side */}
            <path
              d="M372 205 C356 205 352 235 345 242"
              stroke="#38bdf8"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M372 212 C360 212 356 238 350 242"
              stroke="#f59e0b"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              opacity="0.8"
            />
          </g>

          {/* RIGHT ULTRAWIDE CURVED MONITOR (Observability & Telemetry) */}
          <g className="illust-monitor-right">
            {/* Monitor Outer Chassis */}
            <rect
              x="450"
              y="60"
              width="282"
              height="125"
              rx="8"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2"
            />
            {/* Screen Bezel / Display Panel */}
            <rect
              x="456"
              y="66"
              width="270"
              height="113"
              rx="4"
              fill="#0b0f19"
            />

            {/* Screenbar / Lightbar */}
            <rect x="527" y="52" width="128" height="6" rx="3" fill="var(--color-border)" stroke="var(--color-primary)" strokeWidth="1" />
            <line x1="532" y1="58" x2="650" y2="58" stroke="var(--color-accent)" strokeWidth="2" opacity="0.8" />

            {/* Titlebar with System Telemetry Metrics */}
            <rect x="456" y="66" width="270" height="14" rx="3" fill="#1e293b" opacity="0.9" />
            <text x="466" y="76" fontSize="6.5" fill="#38bdf8" fontFamily="monospace" fontWeight="bold">SLA: 99.99%</text>
            <text x="525" y="76" fontSize="6.5" fill="#10b981" fontFamily="monospace">PING: 1.2ms</text>
            <text x="585" y="76" fontSize="6.5" fill="#fbbf24" fontFamily="monospace">SCALE: 10M+ REQ</text>
            <circle cx="714" cy="73" r="3" fill="#10b981" className="illust-cursor" />

            {/* Telemetry Chart 1: Real-time Waveform */}
            <rect x="464" y="84" width="150" height="52" rx="3" fill="#070c17" stroke="#1e293b" strokeWidth="1" />
            <text x="470" y="93" fontSize="6" fill="#94a3b8" fontFamily="monospace">THROUGHPUT (OPS/SEC)</text>
            <line x1="470" y1="104" x2="606" y2="104" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="470" y1="118" x2="606" y2="118" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,2" />
            <path
              className="illust-waveform"
              d="M470 125 L484 122 L498 112 L512 116 L526 102 L540 106 L554 96 L568 100 L582 92 L596 95 L606 88"
              stroke="#38bdf8"
              strokeWidth="1.8"
              fill="none"
            />
            <path
              d="M470 125 L484 122 L498 112 L512 116 L526 102 L540 106 L554 96 L568 100 L582 92 L596 95 L606 88 L606 130 L470 130 Z"
              fill="url(#telemetryGrad)"
              opacity="0.3"
            />

            {/* Telemetry Chart 2: 3D Wireframe Mesh Box */}
            <rect x="620" y="84" width="98" height="52" rx="3" fill="#070c17" stroke="#1e293b" strokeWidth="1" />
            <text x="626" y="93" fontSize="6" fill="#94a3b8" fontFamily="monospace">3D CORE MESH</text>
            <g className="illust-mesh">
              <polygon points="669 98 694 108 669 118 644 108" stroke="#a855f7" strokeWidth="1" fill="none" />
              <polygon points="669 118 694 108 694 124 669 134" stroke="#38bdf8" strokeWidth="1" fill="none" />
              <polygon points="669 118 644 108 644 124 669 134" stroke="#f59e0b" strokeWidth="1" fill="none" />
            </g>

            {/* Bottom Panel: Cluster Health Bar Gauges */}
            <rect x="464" y="142" width="254" height="33" rx="2" fill="#050811" stroke="#1e293b" strokeWidth="1" />
            <text x="472" y="153" fontSize="6" fill="#94a3b8" fontFamily="monospace">DISTRIBUTED CLUSTERS</text>
            <rect x="472" y="158" width="60" height="5" rx="2.5" fill="#1e293b" />
            <rect x="472" y="158" width="48" height="5" rx="2.5" fill="#10b981" />
            <rect x="542" y="158" width="60" height="5" rx="2.5" fill="#1e293b" />
            <rect x="542" y="158" width="55" height="5" rx="2.5" fill="#38bdf8" />
            <rect x="612" y="158" width="60" height="5" rx="2.5" fill="#1e293b" />
            <rect x="612" y="158" width="42" height="5" rx="2.5" fill="#fbbf24" />
            <text x="682" y="163" fontSize="6" fill="#10b981" fontFamily="monospace">OPTIMAL</text>
          </g>

          {/* MECHANICAL KEYBOARD (Centered in front of desk) */}
          <g className="illust-keyboard">
            <rect
              x="280"
              y="241"
              width="156"
              height="14"
              rx="3"
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <line x1="284" y1="254" x2="432" y2="254" stroke="#38bdf8" strokeWidth="1.5" opacity="0.7" />
            <line x1="285" y1="244" x2="431" y2="244" stroke="#64748b" strokeWidth="2" strokeDasharray="3,2" />
            <line x1="285" y1="248" x2="431" y2="248" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4,2" />
            <rect x="330" y="250" width="52" height="3" rx="1.5" fill="#f8fafc" opacity="0.9" />
          </g>

          {/* PRECISION ERGONOMIC MOUSE */}
          <g className="illust-mouse">
            <rect
              x="456"
              y="240"
              width="24"
              height="15"
              rx="6"
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <rect x="466" y="241" width="4" height="5" rx="1" fill="#38bdf8" />
          </g>

          {/* STEAMING COFFEE MUG (Left Desk) */}
          <g className="illust-coffee">
            <path
              d="M90 205 L96 242 L124 242 L130 205 Z"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <ellipse cx="110" cy="205" rx="20" ry="4" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2" />
            <ellipse cx="110" cy="205" rx="15" ry="3" fill="#382215" />
            <path d="M130 212 C140 212 142 228 130 228" stroke="var(--color-primary)" strokeWidth="2" fill="none" />
            <path className="illust-steam" d="M104 198 C104 190 108 192 108 184" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <path className="illust-steam illust-steam-2" d="M111 196 C111 188 115 190 115 182" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
            <path className="illust-steam illust-steam-3" d="M118 198 C118 190 122 192 122 184" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
          </g>

          {/* SUCCULENT PLANT IN GEOMETRIC POT */}
          <g className="illust-plant">
            <polygon points="144 242 166 242 162 222 148 222" fill="#1e293b" stroke="var(--color-primary)" strokeWidth="1.2" />
            <path d="M155 222 C155 208 148 205 142 210" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M155 220 C155 204 162 198 168 205" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M155 216 C155 202 152 194 148 198" stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>

          {/* AUDIOPHILE HEADPHONES ON STAND (Right Desk) */}
          <g className="illust-headphones">
            <rect x="698" y="238" width="24" height="4" rx="2" fill="#334155" />
            <line x1="710" y1="238" x2="710" y2="182" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
            <path d="M702 182 Q710 178 718 182" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round" />

            <path d="M694 216 C694 184 710 174 726 184 C726 196 726 216 726 216" stroke="var(--color-primary)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <rect x="688" y="210" width="10" height="20" rx="4" fill="var(--color-accent)" stroke="var(--color-primary)" strokeWidth="1.5" />
            <rect x="722" y="210" width="10" height="20" rx="4" fill="var(--color-accent)" stroke="var(--color-primary)" strokeWidth="1.5" />

            <g className="illust-note">
              <circle cx="718" cy="168" r="2.5" fill="var(--color-primary)" opacity="0.6" />
              <line x1="720.5" y1="168" x2="720.5" y2="158" stroke="var(--color-primary)" strokeWidth="1.2" opacity="0.6" />
            </g>
            <g className="illust-note illust-note-2">
              <circle cx="732" cy="160" r="2" fill="var(--color-accent)" opacity="0.5" />
              <line x1="734" y1="160" x2="734" y2="152" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.5" />
            </g>
          </g>

          {/* Gradients */}
          <defs>
            <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </section>

      <section className="landing-tech" aria-labelledby="tech-title">
        <h2 className="section-title" id="tech-title">
          Tools I reach for
        </h2>
        <div className="tech-marquee">
          {[0, 1].map((copy) => (
            <ul key={copy} className="tech-grid" aria-hidden={copy === 1 || undefined}>
              {techIcons.map(({ iconName, iconURL, skillType }) => (
                <li key={iconName} className="tech-card" title={skillType}>
                  <span className="tech-card-icon">
                    <img src={iconURL} alt="" loading="lazy" />
                  </span>
                  <span className="tech-card-name">{iconName}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {/* Featured Feed Section */}
      <section className="landing-feed">
        <div className="feed-header">
          <h2 className="section-title">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="section-icon"
            >
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
            Latest Thoughts
          </h2>
          <Link to="/feed" className="view-all-link">
            View All
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="arrow-icon"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
        <Feed truncate={3} />
      </section>

      <section className="landing-philosophy">
        <figure className="philosophy-card">
          <blockquote>
            Software is writing more of itself every year. My job is to be the human in the loop:
            steering, curating and architecting, so what ships is something people actually
            want to use.
          </blockquote>
          <figcaption>My development philosophy</figcaption>
        </figure>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div className="cta-content">
          <h2 id="cta-title">Go build something.</h2>
          <p>
            Most of what's on this site is half-baked on purpose: weekend tinkering, done for fun
            and to see what's possible. Poke at it, steal an idea, or tell me what you're cooking.
          </p>
          <div className="cta-buttons">
            <Link to="/contact" className="cta-button primary">
              Get in touch
            </Link>
            <a
              href="https://github.com/ShugKnight24/react_portfolio"
              target="_blank"
              rel="noopener noreferrer"
              className="cta-button secondary"
            >
              Read the source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
