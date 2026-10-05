export type ProjectCategory = 'client' | 'open-source' | 'community' | 'games' | 'webgl';

export type Project = {
  id: string;
  title: string;
  category: ProjectCategory;
  featured?: boolean;
  highlight?: boolean;
  year?: number;
  description: string;
  impact?: string;
  tech: string[];
  github?: string;
  live?: string;
  image?: string;
};

// Single source of truth for the Projects page and the home page Projects tile.
// Array order is display order; the highlighted project comes first.
export const projects: Project[] = [
  {
    id: 'compass-detroit',
    title: 'Compass Detroit',
    category: 'community',
    featured: true,
    highlight: true,
    year: 2026,
    description:
      'Website for Compass Detroit, a Detroit nonprofit that presents Michigan DevFest with GDG Detroit. Pages for programs, events, speakers, an impact report, a filterable photo gallery and sponsorship tiers.',
    impact:
      'Dark and light themes with a live font switcher. Accessibility is checked with axe in the editor and in Playwright tests.',
    tech: ['React', 'Vite', 'Tailwind CSS', 'React Router', 'Vitest', 'Playwright', 'Docker'],
    github: 'https://github.com/Compass-Detroit/compass-website',
    live: 'https://compass-detroit.com',
    image: './img/projects/compass_detroit_2026.jpg',
  },
  {
    id: 'clockwork-carnage',
    title: 'Clockwork Carnage',
    category: 'games',
    featured: true,
    year: 2026,
    description:
      'A DOOM inspired first-person shooter in vanilla JavaScript and HTML5 Canvas. A 29-level campaign, an endless arena mode and a voxel builder with a survival mode.',
    impact:
      'Sprites, cutscenes and the HUD render procedurally at runtime, with an optional WebGL2 shader for floors and ceilings.',
    tech: ['JavaScript', 'Canvas 2D', 'WebGL2', 'Web Audio API', 'Vite'],
    github: 'https://github.com/ShugKnight24/clockwork_carnage',
    live: 'https://shugknight24.github.io/clockwork_carnage/',
    image: './img/projects/clockwork_carnage_2026.jpg',
  },
  {
    id: 'lunas-lullaby',
    title: "Luna's Lullaby",
    category: 'games',
    featured: true,
    year: 2026,
    description:
      'A cozy farming and life sim dedicated to Luna, my late dog, who is the default companion. Grow crops through the seasons, fish, make friends in town and explore the Wildwood.',
    impact:
      'All art is SVG generated in code and rasterised to canvas. CI runs the unit and Playwright tests on every pull request.',
    tech: ['JavaScript', 'SVG', 'Canvas', 'Vite', 'Vitest', 'Playwright'],
    github: 'https://github.com/ShugKnight24/lunas_lullaby',
    live: 'https://lunas-lullaby.vercel.app',
    image: './img/projects/lunas_lullaby_2026.jpg',
  },
  {
    id: 'gym-bro',
    title: 'Gym Bro',
    category: 'games',
    year: 2026,
    description:
      'A first-person gym builder and life sim. Train each muscle group, enter powerlifting meets and physique shows, buy equipment and keep paying members happy.',
    impact:
      'Runs on the raycaster engine from Clockwork Carnage. Game rules are pure functions covered by Vitest.',
    tech: ['JavaScript', 'Canvas', 'SVG', 'Web Audio API', 'Vite', 'Vitest', 'Playwright'],
    github: 'https://github.com/ShugKnight24/gym_bro',
    live: 'https://gym-bro-rouge.vercel.app/',
    image: './img/projects/gym_bro_2026.jpg',
  },
  {
    id: 'shumunov-solutions',
    title: 'Shumunov Solutions',
    category: 'client',
    featured: true,
    description:
      'My consultancy. Web and mobile builds, system architecture and technical advising for businesses in southeast Michigan and across the US.',
    tech: ['React', 'TypeScript', 'Node.js', 'React Native'],
    live: 'https://shumunovsolutions.com',
    image: './img/projects/shumunov_solutions_2026.jpg',
  },
  {
    id: 'devfest-portfolio-workshop',
    title: 'Portfolio Workshop',
    category: 'community',
    featured: true,
    description:
      'A hands-on workshop where 30 engineers build their own portfolio sites. I have given it at DevFest, Pride Summit and most recently LHM, and it changes a little each time.',
    impact:
      'The companion app has five tracks (React, Vanilla JS, Vue, SvelteKit and agentic dev), lessons with live playgrounds, quizzes and slides.',
    tech: ['React', 'Vue', 'SvelteKit', 'JavaScript', 'Vite'],
    github: 'https://github.com/ShugKnight24/devfest_portfolio_workshop',
    live: 'https://devfest-portfolio-workshop.vercel.app',
  },
  {
    id: 'hack-michigan',
    title: 'Hack Michigan',
    category: 'community',
    year: 2026,
    description:
      'Site for Hack Michigan, a statewide hackathon. Event details, sponsors and signup, plus a project and team showcase managed in Sanity.',
    impact: 'The Three.js particle background respects reduced motion and can be paused.',
    tech: ['Astro', 'Three.js', 'Sanity', 'TypeScript'],
    github: 'https://github.com/Compass-Detroit/hackmi26',
    live: 'https://hackmichigan.com',
  },
  {
    id: 'pomidor',
    title: 'Pomidor',
    category: 'open-source',
    featured: true,
    description:
      'A focus timer and task manager in vanilla JavaScript with no build step. Custom Pomodoro cycles, a calendar, stats and an offline-capable PWA, in English and Russian.',
    impact: 'All data stays in the browser. No account and no backend.',
    tech: ['JavaScript', 'Web Components', 'CSS', 'Service Worker'],
    github: 'https://github.com/ShugKnight24/pomidor',
    live: 'https://shugknight24.github.io/pomidor',
    image: './img/projects/pomidor_2026.jpg',
  },
  {
    id: 'next-shopping-cart',
    title: 'Cart Commerce',
    category: 'open-source',
    description:
      'A Next.js storefront with a 3D product viewer, a multi-category catalog, a cart and design editors for posters, books and apparel.',
    impact: 'Styled with CSS Modules and a shared token file, no Sass.',
    tech: ['Next.js', 'React', 'JavaScript', 'CSS Modules'],
    github: 'https://github.com/ShugKnight24/next_shopping_cart',
    live: 'https://next-shopping-cart-beta.vercel.app',
  },
  {
    id: 'jk-unlimited-services',
    title: 'JK Unlimited Services',
    category: 'client',
    description: 'Website for a general contractor based in West Bloomfield, MI.',
    tech: ['React'],
    live: 'http://www.jkunlimitedservices.com/',
  },
];

export const featuredProjects = projects.filter((p) => p.featured);
