import { FC, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const AboutPage = lazy(() => import('../Pages').then(module => ({ default: module.AboutPage })));
const BooksPage = lazy(() => import('../Pages').then(module => ({ default: module.BooksPage })));
const ContactPage = lazy(() => import('../Pages').then(module => ({ default: module.ContactPage })));
const LandingPage = lazy(() => import('../Pages').then(module => ({ default: module.LandingPage })));
const NotFoundPage = lazy(() => import('../Pages').then(module => ({ default: module.NotFoundPage })));
const PhotoGal = lazy(() => import('../Pages').then(module => ({ default: module.PhotoGal })));
const ProjectsPage = lazy(() => import('../Pages').then(module => ({ default: module.ProjectsPage })));
const ResumePage = lazy(() => import('../Pages').then(module => ({ default: module.ResumePage })));

export const Main: FC = () => (
	<Routes>
		<Route path="/" element={ <LandingPage /> } />
		<Route path="/about" element={ <AboutPage /> } />
		<Route path="/books" element={ <BooksPage /> } />
		<Route path="/contact" element={ <ContactPage /> } />
		<Route path="/photos" element={ <PhotoGal /> } />
		<Route path="/projects" element={ <ProjectsPage /> } />
		<Route path="/resume" element={ <ResumePage /> } />
		<Route path="*" element={ <NotFoundPage /> } />
	</Routes>
);
