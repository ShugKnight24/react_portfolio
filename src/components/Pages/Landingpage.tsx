import { FC } from 'react';
import { Cell, Grid } from '../Grid';

import { techIcons } from '../../data/techIcons';
import { TechIcon } from '../TechIcon';
import { Typewriter } from '../Typewriter';

import { developerQualities, names } from '../../data/typeWriterStrings';

export const LandingPage: FC = () => {
	return(
		<div className="landing-container">
			<Grid extraClass="landing-grid">
				<Cell columns={ 'full' }>
					<div className="home-feature">
						<div className="feature-text">
							<h1>
								<Typewriter
									textToType={names}
								/>
							</h1>
							<div>
								<p>Autodidact</p>
								<span className="bar">|</span>
								<p>Consultant</p>
								<span className="bar">|</span>
								<p>Developer</p>
								<span className="bar">|</span>
								<p>Learner</p>
								<span className="bar">|</span>
								<p>Researcher</p>
							</div>
						</div>
						<img
							src="./img/shug_lake.jpeg"
							alt="Shugmi Shumunov Relaxing by the water"
							className="splash-img"
						/>
					</div>
					<div className="banner-text">
						<h2>Full Stack Software Engineer</h2>
						<hr />
						<h3>
							<Typewriter
								textToType={developerQualities}
								typingSpeed={50}
								deletingSpeed={25}
							/>
						</h3>
						<hr />
						<div>
							<span className="bar">|</span>
							{techIcons.map(({iconName, iconURL, nameInLogo}, index: number) => (
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
