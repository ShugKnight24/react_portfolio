import { projects, type Project as SiteProject } from '../../../data/projects';

// A lineup entry: shared project fields plus a short status line for the bench cards
export type Project = Pick<SiteProject, 'id' | 'title' | 'description' | 'tech' | 'github' | 'live' | 'image'> & {
  category: string;
  status: string;
};

const fromSite = (id: string, status: string): Project => {
  const p = projects.find((project) => project.id === id);
  if (!p) throw new Error(`Unknown project '${id}' in workbench lineup`);
  return { ...p, status };
};

// Batting order: [0] at bat, [1] on deck, [2] in the hole, the rest ride the bench
export const initialLineup: Project[] = [
  {
    id: 'brawler',
    title: 'Team Brawler v2',
    category: 'games',
    status: 'real-time engine, co-op',
    description: 'A 2 player beat-em-up with a real-time engine, playable right here in the arcade.',
    tech: ['TypeScript', 'Canvas'],
    live: '/arcade/play/brawler',
  },
  fromSite('lunas-lullaby', 'in progress'),
  fromSite('clockwork-carnage', 'browser FPS'),
  fromSite('gym-bro', 'in progress'),
  fromSite('compass-detroit', 'live'),
  {
    id: 'books',
    title: 'The bookshelf',
    category: 'reading',
    status: '75 books and counting',
    description: 'The books I have read, all on one shelf.',
    tech: ['React'],
    live: '/books',
  },
  {
    id: 'source',
    title: 'This site',
    category: 'open-source',
    status: 'open source',
    description: 'The code for the page you are on.',
    tech: ['React', 'TypeScript', 'Vite'],
    github: 'https://github.com/ShugKnight24/react_portfolio',
  },
];

export const positions = ['At bat', 'On deck', 'In the hole'] as const;

export const positionOf = (index: number) => positions[index] ?? `Bench ${index - 2}`;

export const hrefOf = (p: Project) => p.live ?? p.github ?? '/';

export const isInternal = (p: Project) => hrefOf(p).startsWith('/');

export const verbOf = (p: Project) => {
  const href = hrefOf(p);
  if (href.startsWith('/arcade/play')) return 'Play';
  if (href === '/books') return 'Browse';
  if (!p.live && p.github) return 'Read the source';
  return 'Open';
};

export const statusOf = (p: Project) => p.status;

// Promote: the picked project steps in, everyone behind moves up, the old batter heads to the end of the bench
export const promote = (lineup: Project[], id: string) => {
  const index = lineup.findIndex((p) => p.id === id);
  if (index <= 0) return lineup;
  const [batter, ...rest] = lineup;
  const picked = lineup[index];
  return [picked, ...rest.filter((p) => p.id !== id), batter];
};

export const findProject = (lineup: Project[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return lineup.find((p) => p.id === q) ?? lineup.find((p) => p.title.toLowerCase().includes(q));
};
