import React, { FC, useEffect } from 'react';
import './App.scss';
import { Layout, Header, Navigation, Drawer, Content } from 'react-mdl';
import { Router, NavLink } from 'react-router-dom';
import { Main } from './components/Layout/Main';
import { Footer } from './components/Layout/Footer';
import * as ReactGA from 'react-ga';
import { createBrowserHistory } from 'history';

function hideDrawer() {
	// document.querySelector('.mdl-layout__content')!.scrollTop = 0;
	// const drawer = document.querySelector('.mdl-layout');
	// drawer.MaterialLayout.toggleDrawer();
}

const history = createBrowserHistory();
history.listen(location => {
	ReactGA.set({ page: location.pathname })
	ReactGA.pageview(location.pathname)
});

export const App : FC = () => {
	useEffect(() => {
		ReactGA.pageview(window.location.pathname);
	}, [])

	return (
		<Router history={ history }>
			<Layout>
				<Header className="header-color" title="Shugmi's Portfolio" scroll>
					<Navigation>
						<NavLink to="/" exact activeClassName="active">Home</NavLink>
						<NavLink to="/about" activeClassName="active">About</NavLink>
						<NavLink to="/books" activeClassName="active">Books</NavLink>
						<NavLink to="/contact" activeClassName="active">Contact</NavLink>
						<NavLink to="/photos" activeClassName="active">Photos</NavLink>
						<NavLink to="/projects" activeClassName="active">Projects</NavLink>
						<NavLink to="/resume" activeClassName="active">Resume</NavLink>
					</Navigation>
				</Header>
				<div className="mobile-header"></div>
				<Drawer title="Navigation">
					<Navigation>
						<NavLink to="/" exact activeClassName="active" onClick={() => hideDrawer()}>Home</NavLink>
						<NavLink to="/about" activeClassName="active" onClick={() => hideDrawer()}>About</NavLink>
						<NavLink to="/books" activeClassName="active" onClick={() => hideDrawer()}>Books</NavLink>
						<NavLink to="/contact" activeClassName="active" onClick={() => hideDrawer()}>Contact</NavLink>
						<NavLink to="/photos" activeClassName="active" onClick={() => hideDrawer()}>Photos</NavLink>
						<NavLink to="/projects" activeClassName="active" onClick={() => hideDrawer()}>Projects</NavLink>
						<NavLink to="/resume" activeClassName="active" onClick={() => hideDrawer()}>Resume</NavLink>
					</Navigation>
				</Drawer>
				<Content>
					<Main />
					<Footer />
				</Content>
			</Layout>
		</Router>
	);
}