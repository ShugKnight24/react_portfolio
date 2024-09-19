import { FC, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';


const About = lazy(() => import('../Pages').then((module) => ({ default: module.About })));
const BooksPage = lazy(() => import('../Pages').then((module) => ({ default: module.BooksPage })));
const Contact = lazy(() => import('../Pages').then((module) => ({ default: module.Contact })));
const Feed = lazy(() => import('../Feed').then((module) => ({ default: module.Feed })));
const Landing = lazy(() => import('../Pages').then((module) => ({ default: module.Landing })));
const NotFound = lazy(() => import('../Pages').then((module) => ({ default: module.NotFound })));
const PhotoGal = lazy(() => import('../Pages').then((module) => ({ default: module.PhotoGal })));
const Playground = lazy(() =>
  import('../Pages').then((module) => ({ default: module.Playground }))
);
const ProjectsPage = lazy(() =>
  import('../Pages').then((module) => ({ default: module.ProjectsPage }))
);
const Resume = lazy(() => import('../Pages').then((module) => ({ default: module.Resume })));

export const Main: FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/about" element={<About />} />
    <Route path="/books" element={<BooksPage />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/feed" element={<Feed />} />
    <Route path="/photos" element={<PhotoGal />} />
    <Route path="/play" element={<Playground />} />
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/resume" element={<Resume />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);
