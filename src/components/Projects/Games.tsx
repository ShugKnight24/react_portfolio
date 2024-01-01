import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const Games: FC = () => {
	return (
		<div className="projects-grid">
			<ProjectCard
				titleAriaLabel="Image of JavaScript Tetris clone built by Shugmi Shumunov"
				titleExtraClass="project-cards-title tetris"
				titleRole="img"
				title="JavaScript Tetris Clone"
				description={['Rebuilt Tetris with JavaScript and HTML5 Canvas']}
				buttonLinks={[
					"https://github.com/ShugKnight24/js_tetris/",
					"https://shugknight24.github.io/js_tetris/"
				]}
				buttonText={[
					"GitHub Repository",
					"Live Demo"
				]}
			/>
			<ProjectCard
				titleAriaLabel="Image of JavaScript Flappy Bird clone built by Shugmi Shumunov"
				titleExtraClass="project-cards-title flappy-bird"
				titleRole="img"
				title="Flappy Bird Clone"
				description={['Rebuilt Flappy Bird with JavaScript and HTML5 Canvas']}
				buttonLinks={[
					"https://github.com/ShugKnight24/flappy_bird",
					"https://shugknight24.github.io/flappy_bird"
				]}
				buttonText={[
					"GitHub Repository",
					"Live Demo"
				]}
			/>
			<ProjectCard
				titleAriaLabel="Image of T-Rex Runner Clone built by Shugmi Shumunov"
				titleExtraClass="project-cards-title trex-runner"
				titleRole="img"
				title="T-Rex Runner"
				description={['Rebuilt Google Chrome Dino runner game w/ HTML, CSS, & Javascript']}
				buttonLinks={[
					"https://github.com/ShugKnight24/dino_jump",
					"https://shugknight24.github.io/dino_jump"
				]}
				buttonText={[
					"GitHub Repository",
					"Live Demo"
				]}
			/>
		</div>
	)
}