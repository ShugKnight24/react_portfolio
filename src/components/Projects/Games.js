import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export function Games(){
	return(
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  tetris" role="img" aria-label="Image of JavaScript Tetris clone built by Shugmi Shumunov">
					<span className="title-background">
						JavaScript Tetris Clone
					</span>
				</CardTitle>
				<CardText className="project-description">Rebuilt Tetris with JavaScript and HTML5 Canvas</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/js_tetris/" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/js_tetris/" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title flappy-bird" role="img" aria-label="Image of JavaScript Flappy Bird clone built by Shugmi Shumunov">
					<span className="title-background">Flappy Bird Clone</span>
				</CardTitle>
				<CardText className="project-description">
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
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title trex-runner" role="img" aria-label="Image of T-Rex Runner Clone built by Shugmi Shumunov">
					<span className="title-background">T-Rex Runner</span>
				</CardTitle>
				<CardText className="project-description">
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