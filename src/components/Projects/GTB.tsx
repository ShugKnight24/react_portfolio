import { FC } from 'react';
import { Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export const GTB : FC = () => {
	return (
		<div className="projects-grid">
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title optima" role="img" aria-label="Image of Optima Batteries website homepage">
					<span className="title-background">
						Optima Batteries
					</span>
					</CardTitle>
				<CardText>
					Website built for Optima Batteries using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.optimabatteries.com/en-us" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title varta" role="img" aria-label="Image of Varta Europe website homepage">
					<span className="title-background">
						Varta Europe
					</span>
					</CardTitle>
				<CardText className="project-description">
					Website built for Varta Europe using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.varta-automotive.com/en-gb" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title varta-china" role="img" aria-label="Image of Varta China website homepage">
					<span className="title-background">
						Varta China
					</span>
					</CardTitle>
				<CardText className="project-description">
					Website built for Varta China using Concrete5 CMS. Needed their own site due to Chinese regulations. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.varta-automotive.cn/zh-cn" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title delkor" role="img" aria-label="Image of Delkor Austrailia website homepage">
					<span className="title-background">
						Delkor Austrailia
					</span>
					</CardTitle>
				<CardText className="project-description">
					Website built for Delkor Austrailia using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.delkor.com.au/en-au" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
			<Card shadow={ 5 } className="project-cards">
				<CardTitle className="project-cards-title delkor-korea" role="img" aria-label="Image of Delkor Korea website homepage">
					<span className="title-background">
						Delkor Korea
					</span>
					</CardTitle>
				<CardText className="project-description">
					Website built for Delkor Korea using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
				</CardText>
				<CardActions border>
					<Button colored>
						<a href="https://www.delkor.kr/ko-kr" rel="noopener noreferrer" target="_blank">Live Site</a>
					</Button>
				</CardActions>
			</Card>
		</div>
	)
}