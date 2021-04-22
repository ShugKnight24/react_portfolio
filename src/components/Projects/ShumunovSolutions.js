import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export function ShumunovSolutions(){
	return(
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title shumunov-solutions" role="img" aria-label="Image of Shumunov Solutions website homepage">
					<span className="title-background">
						Shumunov Solutions
					</span>
				</CardTitle>
				<CardText className="project-description">
					Providing technology solutions to South East Michigan businesses
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.shumunovsolutions.com" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title jk-unlimited-services" role="img" aria-label="Image of JK Unlimited Services website homepage">
					<span className="title-background">
						JK Unlimited Services
					</span>
				</CardTitle>
				<CardText className="project-description">
					Website for West Bloomfield, MI general contractor
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.jkunlimitedservices.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title paper-goods-warehouse" role="img" aria-label="Image of Paper Goods Warehouse website homepage">
					<span className="title-background">
						Paper Goods Warehouse
					</span>
				</CardTitle>
				<CardText className="project-description">
					Website for Oak Park, MI Paper Goods Store
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.papergoodswarehouse.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}