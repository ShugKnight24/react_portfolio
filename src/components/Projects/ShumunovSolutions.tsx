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
					ariaLabel="Image of RegenMedGlobal website homepage"
					extraClass="project-cards-title regenmedglobal" 
					role="img"
				>
					<span className="title-background">
						RegenMedGlboal
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					{[
						'Improve site UI, performance, and SEO',
						'Update site functionality'
					]}
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://regenmedglobal.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of WhosOut App Loading Screen & Additional Screens"
					extraClass="project-cards-title whosout" 
					role="img"
				>
					<span className="title-background">
						WhosOut
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					{[
						'Helped upgrade app for launch',
						'Improved app architecture, functionality, and performance'
					]}
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
					ariaLabel="Image of building directory website homepage"
					extraClass="project-cards-title directory" 
					role="img"
				>
					<span className="title-background">
						Buidling Directory
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					{[
						'Building directory for a local commercial office building',
						'Built with React, TypeScript, Next.js, and Contentful CMS'
					]}
				</CardText>
				<CardActions border>
					<Button>
						<a href="http://www.shumunovsolutions.com/dir" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
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
						<a href="http://www.shumunovsolutions.com" rel="noopener noreferrer" target="_blank">Live Site</a>
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
						<a href="http://www.jkunlimitedservices.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
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
					Website for Oak Park, MI store. Sadly, they have since closed
				</CardText>
			</Card>
		</div>
	);
}
