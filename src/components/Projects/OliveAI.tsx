import { FC } from 'react';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const OliveAI: FC = () => {
  return (
    <div className="projects-grid">
      <Card
        extraClass="project-cards"
        shadow="medium"
      >
        <CardTitle
          ariaLabel="Image of Levi's Mobile App Home Screen"
          extraClass="project-cards-title olive" 
          role="img"
        >
          <span className="title-background">
            OliveAI
          </span>
        </CardTitle>
        <CardText extraClass="project-description">
          {[
            `Automated workflows for Olive's hospital partners`,
            `Built API endpoints to deploy machine learning models`,
            `Sadly, the company has shut down`
          ]}
        </CardText>
        <CardActions border>
          <Button>
            <a href="https://web.archive.org/web/20230000000000*/https://oliveai.com/" rel="noopener noreferrer" target="_blank">WayBackMachine - Web Archive</a>
          </Button>
        </CardActions>
      </Card>
    </div>
	);
}
