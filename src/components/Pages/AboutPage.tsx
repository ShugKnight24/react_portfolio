import { FC } from 'react';
import { Cell, Grid } from '../Grid';
import { IndentedParagraph } from '../IndentedParagraph';

export const AboutPage: FC = () => {
	return (
		<div className="about-page">
			<Grid>
				<Cell columns={ 'half' }>
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
				<Cell columns={ 'half' }>
					<h3>About Me</h3>

					<IndentedParagraph
						text={[
							`What distinguishes me is my unique ability to transform lines of code into compelling narratives. Whether it's crafting deliverables or solving complex problems, I seamlessly blend technical expertise with creativity. 
							This fusion allows me to deeply comprehend my clients' needs, strategize effectively, and deliver high-quality, comprehensive solutions marked by craftsmanship and meticulous attention to detail.`,
							`Driven by a passion for continuous learning, I am committed to constantly refining my skills and expanding my knowledge base.`,
							`While I thrive in diverse team dynamics, my true joy lies in the dynamic environment of startups. Wearing multiple hats and influencing the company's trajectory is what fuels my enthusiasm.`,
							`As the founder of my own development company, I exercise my creative muscle to build solutions that propel businesses toward accelerated growth. 
							There's a profound sense of humility in witnessing your work come to life, especially when it contributes to the growth of small businesses.`,
							`Feel free to reach out if you'd like to explore how I can contribute to your business growth or bring your personal project to fruition.`,
							`Beyond coding, you'll catch me engaging in fitness routines, exploring new destinations, immersing myself in literature, grooving to music, capturing scenic moments through my lens, and cherishing quality time with Luna :)`
						]}
					/>

					<img
						className="luna"
						src="./img/gallery/luna.JPG"
						alt="Luna the bestest doggo"
					/>
				</Cell>
			</Grid>
		</div>
	);
}
