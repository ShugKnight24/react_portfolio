import { FC } from 'react';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const ShumunovSolutions: FC = () => {
	return (
		<div className="projects-grid">
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of Shumunov Solutions website homepage"
					extraClass="project-cards-title shumunov-solutions" 
					role="img"
				>
					<span className="title-background">
						Shumunov Solutions
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Providing technology solutions to South East Michigan businesses
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.shumunovsolutions.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of JK Unlimited Services website homepage"
					extraClass="project-cards-title jk-unlimited-services" 
					role="img"
				>
					<span className="title-background">
						JK Unlimited Services
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website for West Bloomfield, MI general contractor
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.jkunlimitedservices.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of Paper Goods Warehouse website homepage"
					extraClass="project-cards-title paper-goods-warehouse" 
					role="img"
				>
					<span className="title-background">
						Paper Goods Warehouse
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website for Oak Park, MI Paper Goods Store
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.papergoodswarehouse.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}