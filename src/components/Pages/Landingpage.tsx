import { FC } from 'react';
import { Cell, Grid } from '../Grid';

import { techIcons } from '../../data/techIcons';
import { TechIcon } from '../TechIcon';

export const LandingPage: FC = () => {
	return(
		<div className="landing-container">
			<Grid extraClass="landing-grid">
				<Cell columns={ 'full' }>
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
						<h2>Full Stack Mobile & Web Developer</h2>
						<hr />
						<div>
							<span className="bar">|</span>
							{techIcons.map(({iconName, iconURL, nameInLogo}, index) => (
								<TechIcon
									key={ `${ iconName }-${ index }` }
									iconName={ iconName }
									iconURL={ iconURL }
									nameInLogo={nameInLogo}
								/>
							))}
						</div>
						<div className="social-links">
							{ /* GitHub Link */ }
							<a href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
								<i className="fab fa-github" aria-hidden="true" ></i>
							</a>
							{ /* LinkedIn Link */ }
							<a href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
								<i className="fab fa-linkedin" aria-hidden="true" />
							</a>
						</div>
					</div>
				</Cell>
			</Grid>
		</div>
	);
}
