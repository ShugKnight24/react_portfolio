import { FC } from 'react';
import { ProjectCardProps } from '../../types/projects';
import { Button } from '../Button/Button';
import { Card, CardActions, CardText, CardTitle } from '../Cards';

export const ProjectCard: FC<ProjectCardProps> = ({
  titleAriaLabel,
  titleExtraClass,
  titleRole,
  title,
  description,
  buttonLinks,
  buttonText,
}) => (
  <Card extraClass="project-cards" shadow="medium">
    <CardTitle
      ariaLabel={titleAriaLabel}
      extraClass={`project-cards-title ${titleExtraClass}`}
      role={titleRole}
    >
      <span className="title-background">{title}</span>
    </CardTitle>
    {description && <CardText extraClass="project-description">{description}</CardText>}
    <CardActions border>
      {buttonLinks &&
        buttonText &&
        buttonLinks.map((link, index) => (
          <Button key={index}>
            <a href={link} rel="noopener noreferrer" target="_blank">
              {buttonText[index]}
            </a>
          </Button>
        ))}
    </CardActions>
  </Card>
);
