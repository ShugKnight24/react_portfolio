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

						<p className="tab">The startup environment is one that is most enjoyable for myself. I enjoy variety. This space allows me to wear different hats and tackle different problems simulataneously. I started my own development company to create things, help people, and solve problems that are meaningful to me.</p>

						<p className="tab">Reach out if you'd like to talk about how I can help your business grow or a personal project you'd like me to build or complete.</p>

						<p className="tab">When I'm not programming you'll find me working out, shooting hoops, reading, or jamming to music. I'm a passionate person. I know what I like and tend to dive down the rabbit hole with those things that resonate with me.</p>
					</Cell>
				</Grid>
			</div>
		);
	}
}

export default About;
