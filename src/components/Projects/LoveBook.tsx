import { FC } from 'react';
import { Button } from 'react-mdl';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const LoveBook: FC = () => {
	return(
		<div className="projects-grid">
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of MyLoveBook website"
					extraClass="project-cards-title mylovebook" 
					role="img"
				>
					<span className="title-background">
						MyLoveBook
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Redirect site for LoveBookOnline.com and LoveCoups.com
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.mylovebook.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					aria-label="Image of LoveCoups website homepage"
					extraClass="project-cards-title lovecoups" 
					role="img"
				>
					<span className="title-background">
						LoveCoups
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
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