import { FC, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// Each page is its own chunk, so heavy dependencies (three.js on Home) load only where used
const AboutContact = lazy(() =>
  import('../Pages/AboutContact').then((module) => ({ default: module.AboutContact }))
);
const BooksPage = lazy(() =>
  import('../Pages/BooksPage').then((module) => ({ default: module.BooksPage }))
);
const Landing = lazy(() =>
  import('../Pages/Landing').then((module) => ({ default: module.Landing }))
);
const NotFound = lazy(() =>
  import('../Pages/NotFound').then((module) => ({ default: module.NotFound }))
);
const PhotoGal = lazy(() =>
  import('../Pages/PhotoGal').then((module) => ({ default: module.PhotoGal }))
);
const Projects = lazy(() =>
  import('../Pages/Projects').then((module) => ({ default: module.Projects }))
);
const FunPage = lazy(() => import('../Fun/FunPage').then((module) => ({ default: module.FunPage })));
const AnimationsPage = lazy(() =>
  import('../Animations/AnimationsPage').then((module) => ({ default: module.AnimationsPage }))
);
const Roadmap = lazy(() =>
  import('../Pages/Roadmap').then((module) => ({ default: module.Roadmap }))
);
const ArcadePortfolio = lazy(() =>
  import('../arcade/ArcadePortfolio').then((module) => ({ default: module.ArcadePortfolio }))
);

export const Main: FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/about" element={<AboutContact />} />
    <Route path="/contact" element={<AboutContact />} />
    <Route path="/aboutcontact" element={<AboutContact />} />
    <Route path="/books" element={<BooksPage />} />
    {/* The Entertainment page is archived; old links go home */}
    <Route path="/entertainment" element={<Navigate to="/" replace />} />
    {/* The feed is archived for now; old links go home */}
    <Route path="/feed" element={<Navigate to="/" replace />} />
    <Route path="/photos" element={<PhotoGal />} />
    {/* One arcade, two halls: /arcade, /arcade/<hall>, /arcade/<hall>/<experience> */}
    <Route path="/arcade/*" element={<ArcadePortfolio />} />
    <Route path="/v8" element={<Navigate to="/arcade" replace />} />
    <Route path="/play" element={<Navigate to="/arcade/play/tamagotchi" replace />} />
    <Route path="/tamagotchi" element={<Navigate to="/arcade/play/tamagotchi" replace />} />
    <Route path="/brawler" element={<Navigate to="/arcade/play/brawler" replace />} />
    <Route path="/projects" element={<Projects />} />
    {/* The old résumé page is archived; its links land on Projects */}
    <Route path="/resume" element={<Navigate to="/projects" replace />} />
    <Route path="/roadmap" element={<Roadmap />} />
    <Route path="/fun/*" element={<FunPage />} />
    <Route path="/animations/*" element={<AnimationsPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);
