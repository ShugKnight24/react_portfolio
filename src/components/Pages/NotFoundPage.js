import { NavLink } from 'react-router-dom';

export function NotFoundPage (){
	return(
		<div className="not-found">
			<center>
				<p>The page you were looking for does not exist</p>
				<NavLink to="/">Return to Home Page</NavLink>
			</center>
		</div>
	)
}
