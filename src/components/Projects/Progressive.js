import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export function Progressive(){
	return(
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title stationeryhq" role="img" aria-label="Image of StationeryHQ website homepage">
					<span className="title-background">
						StationeryHQ
					</span>
				</CardTitle>
				<CardText className="project-description">
					Customized stationery made easy
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title frecklebox" role="img" aria-label="Image of FreckleBox website homepage">
					<span className="title-background">
						FreckleBox
					</span>
				</CardTitle>
				<CardText className="project-description">
					Personalized gifts for kids
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}