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
				onClick={() => drawerClose()}
			>Home</NavLink>
			<NavLink
				to="/about"
				onClick={() => drawerClose()}
			>About</NavLink>
			<NavLink
				to="/books"
				onClick={() => drawerClose()}
			>Books</NavLink>
			<NavLink
				to="/contact"
				onClick={() => drawerClose()}
			>Contact</NavLink>
			<NavLink
				to="/photos"
				onClick={() => drawerClose()}
			>Photos</NavLink>
			<NavLink
				to="/projects"
				onClick={() => drawerClose()}
			>Projects</NavLink>
			<NavLink
				to="/resume"
				onClick={() => drawerClose()}
			>Resume</NavLink>
		</nav>
	)
}