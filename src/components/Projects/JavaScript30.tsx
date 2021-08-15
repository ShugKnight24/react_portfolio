import { FC } from 'react';
import { Button } from 'react-mdl';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

import { javaScript30Projects } from '../../data/javaScript30Projects';

export const JavaScript30: FC = () => {
	return (
		<div className="projects-grid">
		{
			javaScript30Projects.map(({
				title,
				projectDescription,
				githubLink,
				projectLink,
				cssClass
			}) => {
				return(
					<Card
						extraClass="project-cards"
						key={ title }
						shadow="medium"
					>
						<CardTitle extraClass={`project-cards-title ${ cssClass }`} role="img" aria-label={ title }>
							<span className="title-background">
								{ title }
							</span>
						</CardTitle>
						<CardText extraClass="project-description">
							{ projectDescription }
						</CardText>
						<CardActions border>
							<Button colored>
								<a href={ githubLink } rel="noopener noreferrer" target="_blank">GitHub Repository</a>
							</Button>
							<Button colored>
								<a href={ projectLink } rel="noopener noreferrer" target="_blank">Live Demo</a>
							</Button>
						</CardActions>
					</Card>
				)
			})
		}
		</div>
	)
}