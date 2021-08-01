import { FC } from 'react';
import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export const LoveBook: FC = () => {
	return(
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title mylovebook" role="img" aria-label="Image of MyLoveBook website">
					<span className="title-background">
						MyLoveBook
					</span>
				</CardTitle>
				<CardText className="project-description">
					Redirect site for LoveBookOnline.com and LoveCoups.com
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.mylovebook.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title lovecoups" role="img" aria-label="Image of LoveCoups website homepage">
					<span className="title-background">
						LoveCoups
					</span>
				</CardTitle>
				<CardText className="project-description">
					Build personalized coupon books for those you love
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://lovecoups.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}