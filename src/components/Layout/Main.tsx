import { FC, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';


const AboutContact = lazy(() =>
  import('../Pages').then((module) => ({ default: module.AboutContact }))
);
const BooksPage = lazy(() => import('../Pages').then((module) => ({ default: module.BooksPage })));
const Feed = lazy(() => import('../Feed').then((module) => ({ default: module.Feed })));
const Landing = lazy(() => import('../Pages').then((module) => ({ default: module.Landing })));
const NotFound = lazy(() => import('../Pages').then((module) => ({ default: module.NotFound })));
const PhotoGal = lazy(() => import('../Pages').then((module) => ({ default: module.PhotoGal })));
const Playground = lazy(() =>
  import('../Pages').then((module) => ({ default: module.Playground }))
);
const Projects = lazy(() => import('../Pages').then((module) => ({ default: module.Projects })));
const Resume = lazy(() => import('../Pages').then((module) => ({ default: module.Resume })));

export const Main: FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/aboutcontact" element={<AboutContact />} />
    <Route path="/books" element={<BooksPage />} />
    <Route path="/feed" element={<Feed />} />
    <Route path="/photos" element={<PhotoGal />} />
    <Route path="/play" element={<Playground />} />
    <Route path="/projects" element={<Projects />} />
    <Route path="/resume" element={<Resume />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);
