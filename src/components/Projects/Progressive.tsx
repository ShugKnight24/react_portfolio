import { FC } from 'react';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const Progressive: FC = () => {
	return (
		<div className="projects-grid">
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of StationeryHQ website homepage"
					extraClass="project-cards-title stationeryhq"
					role="img" 
				>
					<span className="title-background">
						StationeryHQ
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Customized stationery made easy
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					aria-label="Image of FreckleBox website homepage"
					extraClass="project-cards-title frecklebox"
					role="img" 
				>
					<span className="title-background">
						FreckleBox
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Personalized gifts for kids
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}