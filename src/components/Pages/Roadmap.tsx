import { FC, useState } from 'react';

// SVG Icons
const Icons = {
  road: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  ),
  check: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  construction: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="8" rx="1" />
      <path d="M17 14v7" />
      <path d="M7 14v7" />
      <path d="M17 3v3" />
      <path d="M7 3v3" />
      <path d="M10 14 2.3 6.3" />
      <path d="m14 6 7.7 7.7" />
      <path d="m8 6 8 8" />
    </svg>
  ),
  clipboard: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  ),
  lightbulb: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  ),
  sparkles: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  ),
  trendingUp: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  fileText: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  calendar: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  checkCircle: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  mail: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  code: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
};

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned' | 'idea';
  category: 'feature' | 'improvement' | 'content' | 'technical';
  priority: 'high' | 'medium' | 'low';
  eta?: string;
  completedDate?: string;
}

const roadmapItems: RoadmapItem[] = [
  // Completed
  {
    id: '1',
    title: 'Premium Theme System',
    description:
      'Advanced theme switcher with 40+ themes across anime, coding, nature, modern, classic, and random categories.',
    status: 'completed',
    category: 'feature',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '2',
    title: 'Books Page Redesign',
    description:
      'Hero section, reading stats, search/filter, personal quotes and personality touches.',
    status: 'completed',
    category: 'improvement',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '3',
    title: 'Resume Page Enhancement',
    description: 'Premium hero, career stats, philosophy section, timeline/card view modes.',
    status: 'completed',
    category: 'improvement',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '4',
    title: 'Projects Page Upgrade',
    description:
      'Hero section, project stats, tech highlights, category navigation with SVG icons.',
    status: 'completed',
    category: 'improvement',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '5',
    title: 'Entertainment Section',
    description:
      'New page showcasing movies, TV shows, anime, and manga with personal favorites and fun facts.',
    status: 'completed',
    category: 'content',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '6',
    title: 'Roadmap Feature',
    description:
      'Interactive roadmap showing planned features, completed items, and project vision.',
    status: 'completed',
    category: 'feature',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '20',
    title: 'Premium Home Page',
    description:
      'Complete landing page redesign with animated stats, quick navigation grid, tech showcase, and personality traits with SVG icons.',
    status: 'completed',
    category: 'improvement',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '21',
    title: 'About/Contact Enhancement',
    description:
      'Tabbed interface for About with journey timeline, interests grid, Luna section. Contact with form, FAQ accordion, services.',
    status: 'completed',
    category: 'improvement',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '22',
    title: 'Feed Page Upgrade',
    description:
      'Category filtering, search, grid/list view toggle, stats, enhanced post cards, and inline SVG icons.',
    status: 'completed',
    category: 'improvement',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '23',
    title: 'Photos Gallery Redesign',
    description:
      'CSS Grid gallery, premium lightbox with navigation, category filtering, hero stats, and featured story section.',
    status: 'completed',
    category: 'improvement',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '33',
    title: 'SVG Icon System',
    description:
      'Replaced all Font Awesome icons and emojis with custom inline SVG icons for better performance and styling control.',
    status: 'completed',
    category: 'technical',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  {
    id: '34',
    title: 'Cobalt Theme Default',
    description:
      'New default theme with deep blue (#1E40AF) and red accent (#DC2626) for a more professional appearance.',
    status: 'completed',
    category: 'improvement',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '35',
    title: 'Chaotic Theme Category',
    description:
      'Added 12 wild "random" themes including Vaporwave, Acid Trip, Glitch, Cyberpunk, Matrix, and more.',
    status: 'completed',
    category: 'feature',
    priority: 'low',
    completedDate: 'Jan 2025',
  },
  {
    id: '36',
    title: 'Theme Switcher in Drawer',
    description:
      'Moved theme switcher from header into the navigation drawer for cleaner header design.',
    status: 'completed',
    category: 'improvement',
    priority: 'medium',
    completedDate: 'Jan 2025',
  },
  {
    id: '37',
    title: 'Books Filter Fix',
    description:
      'Fixed audiobooks/re-reads filter bug and added empty state UI for categories with no matching books.',
    status: 'completed',
    category: 'technical',
    priority: 'high',
    completedDate: 'Jan 2025',
  },
  // In Progress
  {
    id: '7',
    title: 'Advanced Animations',
    description:
      'Smooth page transitions, micro-interactions, scroll-based animations, and loading states.',
    status: 'in-progress',
    category: 'technical',
    priority: 'medium',
    eta: 'Q1 2025',
  },
  {
    id: '38',
    title: 'Personality Insights Pages',
    description:
      'New components and pages showcasing personality insights, MBTI analysis, and fun data visualizations.',
    status: 'in-progress',
    category: 'content',
    priority: 'medium',
    eta: 'Q1 2025',
  },
  {
    id: '39',
    title: 'Premium Tech Icons Display',
    description:
      'Elegant tech stack display with animated cards and hover effects on landing page.',
    status: 'in-progress',
    category: 'improvement',
    priority: 'medium',
    eta: 'Q1 2025',
  },
  // Planned
  {
    id: '8',
    title: 'Music Integration',
    description:
      'Showcase favorite music, playlists, and currently listening with Spotify integration.',
    status: 'planned',
    category: 'content',
    priority: 'medium',
    eta: 'Q1 2025',
  },
  {
    id: '9',
    title: 'Blog Section',
    description: 'Personal blog for technical articles, thoughts, and tutorials.',
    status: 'planned',
    category: 'content',
    priority: 'medium',
    eta: 'Q2 2025',
  },
  {
    id: '10',
    title: 'Interactive Resume PDF',
    description: 'Generate downloadable PDF resume with current theme styling.',
    status: 'planned',
    category: 'feature',
    priority: 'medium',
    eta: 'Q1 2025',
  },
  {
    id: '15',
    title: 'Performance Optimizations',
    description: 'Image lazy loading, code splitting, and caching improvements.',
    status: 'planned',
    category: 'technical',
    priority: 'high',
    eta: 'Q1 2025',
  },
  {
    id: '25',
    title: 'Contact Form Backend',
    description: 'Implement actual form submission with email notifications and spam protection.',
    status: 'planned',
    category: 'technical',
    priority: 'high',
    eta: 'Q1 2025',
  },
  {
    id: '26',
    title: 'Feed Post Reactions',
    description: 'Add ability to react to feed posts with emojis and view reaction counts.',
    status: 'planned',
    category: 'feature',
    priority: 'low',
    eta: 'Q2 2025',
  },
  {
    id: '40',
    title: 'Book Reading Tracker',
    description: 'Visual progress tracking for currently reading books with goals and streaks.',
    status: 'planned',
    category: 'feature',
    priority: 'medium',
    eta: 'Q2 2025',
  },
  {
    id: '41',
    title: 'Project Live Demos',
    description: 'Interactive iframe demos for select projects without leaving the portfolio.',
    status: 'planned',
    category: 'improvement',
    priority: 'medium',
    eta: 'Q2 2025',
  },
  // Ideas
  {
    id: '11',
    title: '3D Landing Page',
    description: 'Three.js powered 3D elements on the landing page for a wow factor.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '12',
    title: 'AI Chat Integration',
    description: 'Chat with an AI version of me trained on my portfolio content.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '13',
    title: 'Project Demos',
    description: 'Interactive demos and previews for select projects.',
    status: 'idea',
    category: 'improvement',
    priority: 'medium',
  },
  {
    id: '14',
    title: 'System Theme Detection',
    description: 'Auto-detect system light/dark preference and apply matching theme.',
    status: 'idea',
    category: 'technical',
    priority: 'low',
  },
  {
    id: '28',
    title: 'Theme Creator',
    description: 'Custom theme builder allowing visitors to create and share their own themes.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '29',
    title: 'Achievements System',
    description: 'Gamified achievements for exploring different sections of the portfolio.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '30',
    title: 'PWA Support',
    description: 'Progressive Web App support for offline access and installability.',
    status: 'idea',
    category: 'technical',
    priority: 'medium',
  },
  {
    id: '31',
    title: 'Analytics Dashboard',
    description: 'Personal analytics dashboard showing visitor engagement and popular sections.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '32',
    title: 'Internationalization',
    description: 'Multi-language support for wider accessibility.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '42',
    title: 'Voice Navigation',
    description: 'Navigate the portfolio using voice commands for accessibility.',
    status: 'idea',
    category: 'feature',
    priority: 'low',
  },
  {
    id: '43',
    title: 'Code Playground',
    description: 'Interactive code editor to try out snippets and see live results.',
    status: 'idea',
    category: 'feature',
    priority: 'medium',
  },
];

const statusConfig = {
  completed: { label: 'Completed', icon: Icons.check, color: '#10B981' },
  'in-progress': { label: 'In Progress', icon: Icons.construction, color: '#F59E0B' },
  planned: { label: 'Planned', icon: Icons.clipboard, color: '#3B82F6' },
  idea: { label: 'Ideas', icon: Icons.lightbulb, color: '#8B5CF6' },
};

const categoryConfig = {
  feature: { label: 'Feature', icon: Icons.sparkles },
  improvement: { label: 'Improvement', icon: Icons.trendingUp },
  content: { label: 'Content', icon: Icons.fileText },
  technical: { label: 'Technical', icon: Icons.settings },
};

const priorityConfig = {
  high: { label: 'High', color: '#EF4444' },
  medium: { label: 'Medium', color: '#F59E0B' },
  low: { label: 'Low', color: '#6B7280' },
};

type FilterStatus = 'all' | RoadmapItem['status'];
type FilterCategory = 'all' | RoadmapItem['category'];

export const Roadmap: FC = () => {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');

  const filteredItems = roadmapItems.filter((item) => {
    const statusMatch = filterStatus === 'all' || item.status === filterStatus;
    const categoryMatch = filterCategory === 'all' || item.category === filterCategory;
    return statusMatch && categoryMatch;
  });

  const stats = {
    completed: roadmapItems.filter((i) => i.status === 'completed').length,
    inProgress: roadmapItems.filter((i) => i.status === 'in-progress').length,
    planned: roadmapItems.filter((i) => i.status === 'planned').length,
    ideas: roadmapItems.filter((i) => i.status === 'idea').length,
  };

  return (
    <div className="cx-page cx-roadmap">
      <header className="cx-intro">
        <p className="cx-kicker">Liber III &middot; The Chronicle</p>
        <h1 className="world-title cx-title">
          Craft &amp; <em>Evolution</em>
        </h1>
        <div className="cx-rule" aria-hidden="true">
          <span />
        </div>
        <p className="cx-lede">
          A transparent look at the journey of building this portfolio, the engineering decisions
          behind each version, and where it is heading next.
        </p>

        <div className="cx-ledger">
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.completed}</span>
            <span className="cx-ledger__label">Shipped</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.inProgress}</span>
            <span className="cx-ledger__label">Building</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.planned}</span>
            <span className="cx-ledger__label">Planned</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.ideas}</span>
            <span className="cx-ledger__label">Ideas</span>
          </div>
        </div>
      </header>

      <div>
        <div className="cx-filters">
          <div className="cx-filters__group" role="group" aria-label="Filter by status">
            <span className="cx-filters__label">Status</span>
            <button
              type="button"
              className="cx-chip"
              aria-pressed={filterStatus === 'all'}
              onClick={() => setFilterStatus('all')}
            >
              All
            </button>
            {Object.entries(statusConfig).map(([status, config]) => (
              <button
                key={status}
                type="button"
                className="cx-chip"
                data-status={status}
                aria-pressed={filterStatus === status}
                onClick={() => setFilterStatus(status as FilterStatus)}
              >
                <span className="cx-mark" data-status={status} aria-hidden="true" />
                {config.label}
              </button>
            ))}
          </div>

          <div className="cx-filters__group" role="group" aria-label="Filter by category">
            <span className="cx-filters__label">Category</span>
            <button
              type="button"
              className="cx-chip"
              aria-pressed={filterCategory === 'all'}
              onClick={() => setFilterCategory('all')}
            >
              All
            </button>
            {Object.entries(categoryConfig).map(([category, config]) => (
              <button
                key={category}
                type="button"
                className="cx-chip"
                aria-pressed={filterCategory === category}
                onClick={() => setFilterCategory(category as FilterCategory)}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <p className="cx-chronicle__empty">Nothing in the chronicle matches these filters.</p>
        ) : (
          <ol className="cx-chronicle">
            {filteredItems.map((item) => (
              <li key={item.id} className="cx-chronicle__entry" data-status={item.status}>
                <div className="cx-chronicle__margin">
                  <span className="cx-chronicle__date">
                    {item.completedDate ?? (item.eta ? `ETA ${item.eta}` : 'Undated')}
                  </span>
                  <span className="cx-chronicle__status">{statusConfig[item.status].label}</span>
                </div>
                <span className="cx-chronicle__node" aria-hidden="true">
                  <span className="cx-mark" data-status={item.status} />
                </span>
                <article className="cx-folio cx-chronicle__folio">
                  <header className="cx-chronicle__head">
                    <h3 className="cx-chronicle__title">{item.title}</h3>
                    <div className="cx-chronicle__labels">
                      <span className="cx-label">{categoryConfig[item.category].label}</span>
                      <span className="cx-label cx-label--quiet" data-priority={item.priority}>
                        {priorityConfig[item.priority].label} priority
                      </span>
                    </div>
                  </header>
                  <p className="cx-chronicle__text">{item.description}</p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>

      <section className="cx-folio cx-colophon">
        <div className="cx-rule" aria-hidden="true">
          <span />
        </div>
        <h2 className="cx-colophon__title">Have an idea?</h2>
        <p>
          I am always open to suggestions for new features or improvements. Let me know what you
          would like to see.
        </p>
        <a href="/aboutcontact" className="cx-btn cx-btn--solid">
          Share your ideas
        </a>
      </section>
    </div>
  );
};
