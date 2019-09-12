import React from 'react';
import './App.scss';
import { Layout, Header, Navigation, Drawer, Content } from 'react-mdl';
import { NavLink } from 'react-router-dom';

import Main from './components/Main';
import Footer from './components/Footer';

function hideDrawer() {
	var drawer = document.querySelector('.mdl-layout');
	drawer.MaterialLayout.toggleDrawer();
}

function App(){
	return (
		<Layout>
			<Header className="header-color" title="Shugmi's Portfolio" scroll>
				<Navigation>
					<NavLink to="/" exact activeClassName="active">Home</NavLink>
					<NavLink to="/about" activeClassName="active">About</NavLink>
					<NavLink to="/contact" activeClassName="active">Contact</NavLink>
					<NavLink to="/projects" activeClassName="active">Projects</NavLink>
					<NavLink to="/resume" activeClassName="active">Resume</NavLink>
				</Navigation>
			</Header>
			<div className="mobile-header"></div>
			<Drawer title="Navigation">
				<Navigation>
					<NavLink to="/" exact activeClassName="active" onClick={() => hideDrawer()}>Home</NavLink>
					<NavLink to="/about" activeClassName="active" onClick={() => hideDrawer()}>About</NavLink>
					<NavLink to="/contact" activeClassName="active" onClick={() => hideDrawer()}>Contact</NavLink>
					<NavLink to="/projects" activeClassName="active" onClick={() => hideDrawer()}>Projects</NavLink>
					<NavLink to="/resume" activeClassName="active" onClick={() => hideDrawer()}>Resume</NavLink>
				</Navigation>
			</Drawer>
			<Content>
				<Main />
				<Footer />
			</Content>
		</Layout>
	);
}

export default App;
