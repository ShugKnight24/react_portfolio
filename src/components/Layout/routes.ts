interface NavLink {
  name: string;
  path: string;
}

export const navLinks: NavLink[] = [
  { path: '/', name: 'Home' },
  { path: '/about', name: 'About' },
  { path: '/books', name: 'Books' },
  { path: '/contact', name: 'Contact' },
  { path: '/feed', name: 'Feed' },
  { path: '/photos', name: 'Photos' },
  { path: '/projects', name: 'Projects' },
  { path: '/resume', name: 'Resume' },
];

