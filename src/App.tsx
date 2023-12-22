import { FC, KeyboardEvent, Suspense, useEffect, useState } from 'react';
import './App.scss';
import { Router, useLocation } from 'react-router-dom';
import {
	Content,
	Drawer,
	Footer,
	Header,
	Layout,
	Main,
	Nav
} from './components/Layout';
import * as ReactGA from 'react-ga';
import { createBrowserHistory } from 'history';

const history = createBrowserHistory();
history.listen(location => {
	ReactGA.set({ page: location.pathname })
	ReactGA.pageview(location.pathname)
});

const location = useLocation();

export const App : FC = () => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		ReactGA.pageview(window.location.pathname);
	}, []);
	
	function closeDrawer (event? : KeyboardEvent<HTMLDivElement>){
		if (event){
			if (event.key === 'Enter'){
				setIsVisible(false);
			} else {
				return;
			}
		} else {
			setIsVisible(false);
		}
	}
	
	function openDrawer (event? : KeyboardEvent<HTMLDivElement>){
		if (event){
			if (event.key === 'Enter'){
				setIsVisible(true);
			} else {
				return;
			}
		} else {
			setIsVisible(true);
		}
	}

	const navRoutes = (
		<Nav drawerClose={ closeDrawer } />
	);

	return (
		<Router navigator={history} location={location}>
			<Layout>
				<Header 
					title={'Shugmi\'s Portfolio'}
				>
					{ navRoutes }
				</Header>
				<div
					aria-expanded="false"
					role="button"
					tabIndex={ 0 }
					className="drawer-button"
					onClick={ () => openDrawer() }
					onKeyDown={ (event) => openDrawer(event) }
				>
					<i className="material-icons"></i>
				</div>
				<div className="mobile-header"></div>
				<Drawer
					title="Nav"
					isVisible={ isVisible }
				>
					{ navRoutes }
				</Drawer>
				<div
					className={`drawer-overlay ${ isVisible ? 'active' : '' }`}
					onClick={ () => closeDrawer() }
					onKeyDown={ (event) => closeDrawer(event) }
					role="button"
					tabIndex={ -1 }
				></div>
				<Content>
					<Suspense fallback={ <div>Loading...</div> } >
						<Main />
					</ Suspense>
					<Footer />
				</Content>
			</Layout>
		</Router>
	);
}