import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Landing extends Component {
	render() {
		return(
			<div className="landing-container">
				<Grid className="landing-grid">
					<Cell col={ 12 }>
						<div className="home-feature">
							<div className="feature-text">
								<h1>Shugmi Shumunov</h1>
								<div>
									<span className="bar">|</span>
									<p>
										Consultant
									</p>
									<span className="bar">|</span>
									<p>
										Developer
									</p>
									<span className="bar">|</span>
									<p>
										Learner
									</p>
									<span className="bar">|</span>
								</div>
							</div>
							<img
								src="./img/shug_lake.jpeg"
								alt="Shugmi Shumunov Relaxing by the water"
								className="splash-img"
							/>
						</div>
						<div className="banner-text">
							<h2>Full Stack Web Developer</h2>
							<hr />
							<div>
								<span className="bar">|</span>
								<p>
									HTML
								</p>
								<span className="bar">|</span>
								<p>
									CSS
								</p>
								<span className="bar">|</span>
								<p>
									SASS / LESS
								</p>
								<span className="bar">|</span>
								<p>
									BEM
								</p>
								<span className="bar">|</span>
								<p>
									BootStrap
								</p>
								<span className="bar">|</span>
								<p>
									JavaScript
								</p>
								<span className="bar">|</span>
								<p>
									jQuery
								</p>
								<span className="bar">|</span>
								<p>
									React
								</p>
								<span className="bar">|</span>
								<p>
									React Native
								</p>
								<span className="bar">|</span>
								<p>
									Node.js
								</p>
								<span className="bar">|</span>
								<p>
									PHP
								</p>
								<span className="bar">|</span>
								<p>
									MySQL
								</p>
								<span className="bar">|</span>
								<p>
									Shopify
								</p>
								<span className="bar">|</span>
								<p>
									Liquid
								</p>
								<span className="bar">|</span>
							</div>
							<div className="social-links">
								{ /* GitHub Link */ }
								<a href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
									<i className="fa fa-github" aria-hidden="true" />
								</a>
								{ /* LinkedIn Link */ }
								<a href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
									<i className="fa fa-linkedin-square" aria-hidden="true" />
								</a>
							</div>
						</div>
					</Cell>
				</Grid>
			</div>
		);
	}
}

export default Landing;
