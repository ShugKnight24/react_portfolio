import { FC } from 'react';
import { Switch, Route } from 'react-router-dom';

import { AboutPage, BooksPage, ContactPage, LandingPage, NotFoundPage, PhotoGal,ProjectsPage, ResumePage } from '../Pages';

export const Main: FC = () => (
	<Switch>
		<Route exact path="/" component={ LandingPage } />
		<Route path="/about" component={ AboutPage } />
		<Route path="/books" component={ BooksPage } />
		<Route path="/contact" component={ ContactPage } />
		<Route path="/photos" component={ PhotoGal } />
		<Route path="/projects" component={ ProjectsPage } />
		<Route path="/resume" component={ ResumePage } />
		<Route path="*" component={ NotFoundPage } />
	</Switch>
);