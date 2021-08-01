import { FC } from 'react';
import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export const PersonalProjects: FC = () => {
	return (
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  pomodoro" role="img" aria-label="Image of JavaScript Pomodoro clock built by Shugmi Shumunov">
					<span className="title-background">
						Pomodoro Clock
					</span>
				</CardTitle>
				<CardText className="project-description">Built a Pomodoro clock in JavaScript that uses the pomodoro system and includes todo list functionality</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/pomodoro" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/pomodoro" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  mappr" role="img" aria-label="Image of JavaScript Mappr project built by Shugmi Shumunov">
					<span className="title-background">
						Mappr
					</span>
				</CardTitle>
				<CardText className="project-description">Map project built using OpenStreet map and Leaflet.js - <span className="bold-text">Still in development</span></CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/Mappr" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/Mappr" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  quizzlr" role="img" aria-label="Image of JavaScript Quizzlr project built by Shugmi Shumunov">
					<span className="title-background">
						Quizzlr
					</span>
				</CardTitle>
				<CardText className="project-description">Quiz project built using jQuery. Custom modal system - <span className="bold-text">Still in development</span></CardText>
				<CardActions border>
					<Button colored>
						{/* <a href="https://github.com/ShugKnight24/Dooer" rel="noopener noreferrer" target="_blank">GitHub Repository</a> */}
					</Button>
					<Button colored>
						<a href="https://shumunovsolutions.com/quiz" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  dooer" role="img" aria-label="Image of JavaScript Quizzlr project built by Shugmi Shumunov">
					<span className="title-background">
						Dooer
					</span>
				</CardTitle>
				<CardText className="project-description">To-Do App built in React JS - Features a custom kanban board, basic to-do app, and pomodoro timer - <span className="bold-text">Still in development</span></CardText>
				<CardActions border>
					<Button colored>
						{/* <a href="https://github.com/ShugKnight24/Quizzlr" rel="noopener noreferrer" target="_blank">GitHub Repository</a> */}
					</Button>
					<Button colored>
						<a href="https://shumunovsolutions.com/dooer" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}