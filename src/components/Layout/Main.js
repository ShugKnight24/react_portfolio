import React from 'react';
import { Switch, Route } from 'react-router-dom';

import LandingPage from '../Pages/Landingpage';
import About from '../About';
import BooksPage from '../BooksPage';
import Contact from '../Contact';
import Projects from '../Projects';
import Resume from '../Resume';
import NotFound from '../NotFound';

const Main = () => (
	<Switch>
		<Route exact path="/" component={ LandingPage } />
		<Route path="/about" component={ About } />
		<Route path="/books" component={ BooksPage } />
		<Route path="/contact" component={ Contact } />
		<Route path="/projects" component={ Projects } />
		<Route path="/resume" component={ Resume } />
		<Route path="*" component={ NotFound } />
	</Switch>
);

export default Main;
