import { FC } from 'react';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const Nexient: FC = () => {
  return (
    <div className="projects-grid">
      <Card
        extraClass="project-cards"
        shadow="medium"
      >
        <CardTitle
          ariaLabel="Image of Levi's Mobile App Home Screen"
          extraClass="project-cards-title levis" 
          role="img"
        >
          <span className="title-background">
            Levi's Mobile App
          </span>
        </CardTitle>
        <CardText extraClass="project-description">
          {[
            'I helped Levi\'s customers find the perfect pair of jeans 😉',
            'Built API driven onboarding flow as user enters the app',
            'Upgraded the return history flow',
            'Integrated additional payment methods into the app'
          ]}
        </CardText>
        <CardActions border>
          <Button>
            <a href="https://apps.apple.com/us/app/levis-shop-denim-more/id1481624020" rel="noopener noreferrer" target="_blank">App Store</a>
          </Button>
          <Button>
            <a href="https://play.google.com/store/apps/details/Levi_s?id=com.levi.levis247" rel="noopener noreferrer" target="_blank">Play Store</a>
          </Button>
        </CardActions>
      </Card>
      <Card
        extraClass="project-cards"
        shadow="medium"
      >
        <CardTitle
          ariaLabel="Image of Vectorform Website Homepage"
          extraClass="project-cards-title vectorform" 
          role="img"
        >
          <span className="title-background">
            Vectorform
          </span>
        </CardTitle>
        <CardText extraClass="project-description">
          Develop greenfield 3D configurator for a fashion accessory company
        </CardText>
        <CardActions border>
          <Button>
            <a href="https://www.vectorform.com/" rel="noopener noreferrer" target="_blank">Company Site</a>
          </Button>
        </CardActions>
      </Card>
    </div>
  );
}
