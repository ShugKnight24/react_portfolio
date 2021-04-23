import React from 'react';
import { Switch, Route } from 'react-router-dom';

import LandingPage from '../Pages/Landingpage';
import { AboutPage } from '../Pages/AboutPage';
import BooksPage from '../BooksPage';
import Contact from '../Contact';
import PhotoGal from '../Pages/PhotoGal';
import { ProjectsPage } from '../Pages/ProjectsPage';
import Resume from '../Resume';
import NotFound from '../NotFound';

const Main = () => (
	<Switch>
		<Route exact path="/" component={ LandingPage } />
		<Route path="/about" component={ AboutPage } />
		<Route path="/books" component={ BooksPage } />
		<Route path="/contact" component={ Contact } />
		<Route path="/photos" component={ PhotoGal } />
		<Route path="/projects" component={ ProjectsPage } />
		<Route path="/resume" component={ Resume } />
		<Route path="*" component={ NotFound } />
	</Switch>
);

export default Main;
