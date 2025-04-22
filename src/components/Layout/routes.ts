interface NavLink {
  name: string;
  path: string;
}

export const navLinks: NavLink[] = [
  { path: '/', name: 'Home' },
  { path: '/aboutcontact', name: 'About/Contact' },
  { path: '/books', name: 'Books' },
  { path: '/feed', name: 'Feed' },
  { path: '/photos', name: 'Photos' },
  { path: '/projects', name: 'Projects' },
  { path: '/resume', name: 'Resume' },
];
