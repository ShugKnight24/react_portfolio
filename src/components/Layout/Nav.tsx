import { FC } from 'react';
import { NavLink } from 'react-router-dom';

interface NavProps {
	drawerClose: () => void;
}

export const Nav: FC<NavProps> = ({ drawerClose }) => {
	return (
		<nav className="nav">
			<NavLink
				to="/"
				exact
				activeClassName="active"
				onClick={() => drawerClose()}
			>Home</NavLink>
			<NavLink
				to="/about"
				activeClassName="active"
				onClick={() => drawerClose()}
			>About</NavLink>
			<NavLink
				to="/books"
				activeClassName="active"
				onClick={() => drawerClose()}
			>Books</NavLink>
			<NavLink
				to="/contact"
				activeClassName="active"
				onClick={() => drawerClose()}
			>Contact</NavLink>
			<NavLink
				to="/photos"
				activeClassName="active"
				onClick={() => drawerClose()}
			>Photos</NavLink>
			<NavLink
				to="/projects"
				activeClassName="active"
				onClick={() => drawerClose()}
			>Projects</NavLink>
			<NavLink
				to="/resume"
				activeClassName="active"
				onClick={() => drawerClose()}
			>Resume</NavLink>
		</nav>
	)
}