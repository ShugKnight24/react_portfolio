import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const Progressive: FC = () => {
	return (
		<div className="projects-grid">
			<ProjectCard
				titleAriaLabel="Image of StationeryHQ website homepage"
				titleExtraClass="project-cards-title stationeryhq"
				titleRole="img"
				title="StationeryHQ"
				description={["Customized stationery made easy"]}
				buttonLinks={["https://www.stationeryhq.com"]}
				buttonText={["Live Site"]}
			/>
			<ProjectCard
				titleAriaLabel="Image of FreckleBox website homepage"
				titleExtraClass="project-cards-title frecklebox"
				titleRole="img"
				title="FreckleBox"
				description={["Personalized gifts for kids"]}
				buttonLinks={["https://www.frecklebox.com"]}
				buttonText={["Live Site"]}
			/>
		</div>
	);
}
