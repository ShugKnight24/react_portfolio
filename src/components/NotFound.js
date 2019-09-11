import React, { Component } from 'react';
import { NavLink } from 'react-router-dom';

class NotFound extends Component {
	render(){
		return(
			<div className="not-found">
				<center>
					<p>The page you were looking for does not exist</p>
					<NavLink to="/">Return to Home Page</NavLink>
				</center>
			</div>
		)
	}
}

export default NotFound;
