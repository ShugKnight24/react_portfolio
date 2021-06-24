import React, { FC, KeyboardEvent, useEffect, RefObject, useRef, useState } from 'react';
import './App.scss';
import { Layout, Header, Content } from 'react-mdl';
import { Router } from 'react-router-dom';
import { Drawer, Footer, Main, Nav } from './components/Layout';
import * as ReactGA from 'react-ga';
import { createBrowserHistory } from 'history';

const history = createBrowserHistory();
history.listen(location => {
	ReactGA.set({ page: location.pathname })
	ReactGA.pageview(location.pathname)
});

export const App : FC = () => {
	const [isVisble, setIsVisible] = useState(false);

	useEffect(() => {
		ReactGA.pageview(window.location.pathname);
	}, []);

	const drawerRef = useRef() as RefObject<HTMLDivElement>;
	
	function closeDrawer (){
		if (drawerRef.current !== null){
			drawerRef.current.classList.remove('active');
			setIsVisible(false);
		}
	}
	
	function closeDrawerWithKey (event : KeyboardEvent<HTMLDivElement>){
		if (drawerRef.current !== null){
			if (event.key === '13'){
				drawerRef.current.classList.remove('active');
				setIsVisible(false);
			}
		}
	}
	
	function openDrawer (){
		if (drawerRef.current !== null){
			drawerRef.current.classList.add('active');
			setIsVisible(true);
		}
	}
	
	function openDrawerWithKey (event : KeyboardEvent<HTMLDivElement>){
		if (drawerRef.current !== null){
			if (event.key === '13'){
				drawerRef.current.classList.add('active');
				setIsVisible(true);
			}
		}
	}

	const navRoutes = (
		<Nav drawerClose={ closeDrawer } />
	);

	return (
		<Router history={ history }>
			<Layout>
				<Header className="header-color" title="Shugmi's Portfolio" scroll>
					{ navRoutes }
				</Header>
				<div
					aria-expanded="false"
					role="button"
					tabIndex={ 0 }
					className="drawer-button"
					onClick={ () => openDrawer() }
					onKeyDown={ (event) => openDrawerWithKey(event) }
				>
					<i className="material-icons"></i>
				</div>
				<div className="mobile-header"></div>
				<Drawer
					title="Nav"
					reference={ drawerRef }
				>
					{ navRoutes }
				</Drawer>
				<div
					className={`drawer-overlay ${ isVisble ? 'active' : '' }`}
					onClick={ () => closeDrawer() }
					onKeyDown={ (event) => closeDrawerWithKey(event) }
					role="button"
					tabIndex={ -1 }
				></div>
				<Content>
					<Main />
					<Footer />
				</Content>
			</Layout>
		</Router>
	);
}