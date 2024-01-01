import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

import { javaScript30Projects } from '../../data/javaScript30Projects';

export const JavaScript30: FC = () => {
	return (
		<div className="projects-grid">
			{javaScript30Projects.map(({
				title,
				projectDescription,
				githubLink,
				projectLink,
				cssClass
			}) => {
				return (
					<ProjectCard
						titleAriaLabel={ title }
						titleExtraClass={`project-cards-title ${ cssClass }`}
						titleRole="img"
						title={ title }
						description={[ projectDescription ]}
						buttonLinks={[
							githubLink,
							projectLink
						]}
						buttonText={[
							"GitHub Repository",
							"Live Demo"
						]}
					/>
				);
			})}
		</div>
	);
}
