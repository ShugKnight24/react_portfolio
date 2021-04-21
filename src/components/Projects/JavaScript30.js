import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export function JavaScript30(){
	return(
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title  " role="img" aria-label="">
					<span className="title-background">
						JS30 Projects will go here
					</span>
				</CardTitle>
				<CardText className="project-description">JS30 Projects</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://github.com/ShugKnight24/" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
					</Button>
					<Button colored>
						<a href="https://shugknight24.github.io/" rel="noopener noreferrer" target="_blank">Live Demo</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}