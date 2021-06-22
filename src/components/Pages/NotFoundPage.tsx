import { FC } from 'react';
import { NavLink } from 'react-router-dom';

export const NotFoundPage : FC = () => {
	return(
		<div className="not-found">
			<p>The page you were looking for does not exist</p>
			<NavLink to="/">Return to Home Page</NavLink>
		</div>
	)
}
