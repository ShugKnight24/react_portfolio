import { FC } from 'react';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const GTB: FC = () => {
	return (
		<div className="projects-grid">
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle 
					ariaLabel="Image of Optima Batteries website homepage"
					extraClass="project-cards-title optima"
					role="img"
				>
					<span className="title-background">
						Optima Batteries
					</span>
				</CardTitle>
				<CardText>
					Website built for Optima Batteries using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.optimabatteries.com/en-us" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of Varta Europe website homepage"
					extraClass="project-cards-title varta"
					role="img"
				>
					<span className="title-background">
						Varta Europe
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website built for Varta Europe using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.varta-automotive.com/en-gb" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					aria-label="Image of Varta China website homepage"
					extraClass="project-cards-title varta-china" 
					role="img"
				>
					<span className="title-background">
						Varta China
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website built for Varta China using Concrete5 CMS. Needed their own site due to Chinese regulations. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.varta-automotive.cn/zh-cn" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of Delkor Austrailia website homepage"
					extraClass="project-cards-title delkor"
					role="img" 
				>
					<span className="title-background">
						Delkor Austrailia
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website built for Delkor Austrailia using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.delkor.com.au/en-au" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card
				extraClass="project-cards"
				shadow="medium"
			>
				<CardTitle
					ariaLabel="Image of Delkor Korea website homepage"
					extraClass="project-cards-title delkor-korea"
					role="img"
				>
					<span className="title-background">
						Delkor Korea
					</span>
				</CardTitle>
				<CardText extraClass="project-description">
					Website built for Delkor Korea using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button>
						<a href="https://www.delkor.kr/ko-kr" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}