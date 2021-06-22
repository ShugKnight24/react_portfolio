import { FC } from 'react';
import { Grid, Cell } from 'react-mdl';

export const AboutPage : FC = () => {
	return (
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

					<p className="tab">The startup environment is one I enjoy most. Novelty is my lifeblood. I perform best when having to solve multiple technical problems in a creative and elegant manner. I get to touch different aspects of a business and have a large impact.</p>

					<p className="tab">I started my own development company to exercise my creative muscle building solutions that allow business to have accelerated growth.</p>

					<p className="tab">Contact me if you&apos;d like to discuss how I can help your business grow or if you have a personal project that needs completing.</p>

					<p className="tab">Aside from building my business, you&apos;ll find me working out, shooting hoops, reading, jamming to music, photography, and spending time with my pupper Luna :)</p>

					<img
						className="luna"
						src="./img/gallery/luna.jpg"
						alt="Luna"
					/>
				</Cell>
			</Grid>
		</div>
	);
}
