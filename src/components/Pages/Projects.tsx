import { FC, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHero } from '../Layout/PageHero';
import { Project, ProjectCategory, projects } from '../../data/projects';
import styles from './Projects.module.css';

const CAREER_START = 2016;

const categoryLabels: Record<ProjectCategory, string> = {
  client: 'Client work',
  community: 'Community',
  games: 'Games',
  'open-source': 'Open source',
  webgl: 'WebGL & 3D',
};

const categoryOrder: ProjectCategory[] = ['client', 'community', 'games', 'open-source', 'webgl'];

type CategoryFilter = 'all' | 'featured' | ProjectCategory;

const filters: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'featured', label: 'Featured' },
  ...categoryOrder
    .filter((category) => projects.some((p) => p.category === category))
    .map((category) => ({ id: category, label: categoryLabels[category] })),
];

const matchesFilter = (project: Project, filter: CategoryFilter) =>
  filter === 'all' || (filter === 'featured' ? !!project.featured : project.category === filter);

const Arrow: FC = () => (
  <svg className={styles.arrow} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ProjectLinks: FC<{ project: Project }> = ({ project }) => (
  <div className={styles.links}>
    {project.live &&
      (project.live.startsWith('/') ? (
        <Link to={project.live} className={styles.link}>
          Open it <Arrow />
        </Link>
      ) : (
        <a href={project.live} target="_blank" rel="noopener noreferrer" className={styles.link}>
          {project.category === 'games' ? 'Play it' : 'Live site'} <Arrow />
        </a>
      ))}
    {project.github && (
      <a href={project.github} target="_blank" rel="noopener noreferrer" className={styles.link}>
        Source <Arrow />
      </a>
    )}
  </div>
);

export const Projects: FC = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      if (!matchesFilter(project, activeCategory)) return false;
      if (!query) return true;
      return (
        project.title.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query) ||
        project.tech.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [activeCategory, searchQuery]);

  // Cards after the highlighted lead; every fifth one gets the wide layout
  const rest = filteredProjects.filter((p) => !p.highlight);

  // Removed from the hero: "99.99% Production SLA", "10M+ Requests Handled", "100% Typesafe Systems".
  // Everything below is counted from src/data/projects.ts so it can never drift from the grid.
  const facts = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return {
      currentYear,
      years: currentYear - CAREER_START,
      projects: projects.length,
      categories: new Set(projects.map((p) => p.category)).size,
      technologies: new Set(projects.flatMap((p) => p.tech)).size,
      shipped: projects.filter((p) => p.live).length,
    };
  }, []);

  return (
    <div className={styles.projectsPage}>
      <PageHero
        id="projects-title"
        title="Selected"
        outline="Work"
        meta={['Detroit, MI', `${facts.projects} projects`, `${CAREER_START}-${facts.currentYear}`]}
        lede="Client platforms, community sites, open-source tools and browser games. Most of it is React and TypeScript; the games are plain JavaScript and Canvas."
        stats={[
          { value: facts.projects, label: 'Projects' },
          { value: facts.categories, label: 'Categories' },
          { value: facts.technologies, label: 'Technologies' },
          { value: facts.shipped, label: 'Live links' },
          { value: facts.years, label: 'Years building' },
        ]}
      />

      <div className={styles.body}>
        <div className={styles.controlsBar}>
          <div className={styles.filters} role="group" aria-label="Filter projects by category">
            {filters.map((filter) => {
              const count = projects.filter((p) => matchesFilter(p, filter.id)).length;
              const active = activeCategory === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={`${styles.filter} ${active ? styles.active : ''}`}
                  aria-pressed={active}
                  onClick={() => setActiveCategory(filter.id)}
                >
                  {filter.label}
                  <span className={styles.filterCount}>{count}</span>
                </button>
              );
            })}
          </div>

          <label className={styles.search}>
            <span className={styles.searchLabel}>Search</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Title or tech, e.g. Three.js"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        </div>

        <p className={styles.resultLine} aria-live="polite">
          Showing {filteredProjects.length} of {projects.length}
        </p>

        {filteredProjects.length > 0 ? (
          <div className={styles.grid}>
            {filteredProjects.map((project) => {
              const number = String(projects.indexOf(project) + 1).padStart(2, '0');
              const lead = !!project.highlight;
              const wide = !lead && rest.indexOf(project) % 5 === 0;
              const kicker = lead
                ? 'Highlight'
                : project.featured
                  ? 'Featured'
                  : categoryLabels[project.category];
              return (
                <article
                  key={project.id}
                  className={`${styles.card} ${lead ? styles.lead : ''} ${wide ? styles.wide : ''}`}
                  aria-labelledby={`project-${project.id}`}
                >
                  <div className={styles.plate} aria-hidden={!project.image}>
                    {project.image ? (
                      <img
                        src={project.image}
                        alt={`${project.title} screenshot`}
                        loading={lead ? 'eager' : 'lazy'}
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.plateNumber}>{number}</span>
                    )}
                    <span className={styles.plateTag}>{categoryLabels[project.category]}</span>
                  </div>

                  <div className={styles.cardBody}>
                    <p className={styles.kicker}>
                      <span className={styles.kickerNumber}>{number}</span>
                      {kicker}
                      {project.year && <span className={styles.kickerYear}>{project.year}</span>}
                    </p>
                    <h2 id={`project-${project.id}`} className={styles.cardTitle}>
                      {project.title}
                    </h2>
                    <p className={styles.description}>{project.description}</p>
                    {project.impact && <p className={styles.impact}>{project.impact}</p>}
                    <p className={styles.stack}>
                      <span className={styles.srOnly}>Built with: </span>
                      {project.tech.join(' / ')}
                    </p>
                    <ProjectLinks project={project} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Nothing matches “{searchQuery.trim()}”.</p>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
            >
              Clear filters <Arrow />
            </button>
          </div>
        )}

        <section className={styles.cta} aria-labelledby="projects-cta-title">
          <h2 id="projects-cta-title" className={styles.ctaTitle}>
            Need something like this built?
          </h2>
          <p className={styles.ctaText}>
            Shumunov Solutions takes on consulting and contract work. Tell me what you are working
            on.
          </p>
          <Link to="/aboutcontact" className={styles.ctaButton}>
            Get in touch <Arrow />
          </Link>
        </section>
      </div>
    </div>
  );
};
