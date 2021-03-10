import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class About extends Component {
	render() {
		return(
			<div className="about-page">
				<Grid>
					<Cell col={ 6 }>
						<div className="image-container">
							<figure>
								<img
									className="bpak-image"
									src="./img/shug_bpak.jpg"
									alt="Shugmi Shumunov with Bodybuilder Ben Pakulski"
								/>
								<figcaption>
									With bodybuilder <a href="https://www.benpakulski.com" rel="noopener noreferrer" target="_blank">Ben Pakulski</a>
								</figcaption>
							</figure>
						</div>
					</Cell>
					<Cell col={ 6 }>
						<h3>About Me</h3>

						<p className="tab">The startup environment is the one I enjoy most. Novelty is my lifeblood. I find myself performing best when solving multiple problems at the same time. I get to wear many different hats and tackle multiple problems.</p>

						<p className="tab">I started my own development company to exercise my creativity by building things, helping people, and solving problems that are meaningful to me.</p>

						<p className="tab">Reach out if you'd like to talk about how I can help your business grow or if you have a personal project that needs completing.</p>

						<p className="tab">Aside from building my business, you'll find me working out, shooting hoops, reading, jamming to music.</p>
					</Cell>
				</Grid>
			</div>
		);
	}
}

export default About;
