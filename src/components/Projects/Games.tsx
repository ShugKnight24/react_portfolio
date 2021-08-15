import { FC } from 'react';
import { Button } from 'react-mdl';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const Games: FC = () => {
	return (
		<div className="projects-grid">
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of JavaScript Tetris clone built by Shugmi Shumunov"
					extraClass="project-cards-title tetris"
					role="img"
				>
					<span className="title-background">
						JavaScript Tetris Clone
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Rebuilt Tetris with JavaScript and HTML5 Canvas
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/js_tetris/" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/js_tetris/" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of JavaScript Flappy Bird clone built by Shugmi Shumunov"
					extraClass="project-cards-title flappy-bird"
					role="img"
				>
					<span className="title-background">Flappy Bird Clone</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Rebuilt Flappy Bird with JavaScript and HTML5 Canvas
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/flappy_bird" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/flappy_bird" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of T-Rex Runner Clone built by Shugmi Shumunov"
					extraClass="project-cards-title trex-runner"
					role="img"
				>
					<span className="title-background">T-Rex Runner</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Rebuilt Google Chrome Dino runner game w/ HTML, CSS, & Javascript
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/dino_jump" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/dino_jump" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}