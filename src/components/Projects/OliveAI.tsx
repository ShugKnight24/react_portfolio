import { FC } from 'react';
import { ProjectCard } from './ProjectCard';

export const OliveAI: FC = () => {
  return (
    <div className="projects-grid">
      <ProjectCard
        titleAriaLabel="Image of Levi's Mobile App Home Screen"
        titleExtraClass="project-cards-title olive"
        titleRole="img"
        title="OliveAI"
        description={[
          `Automated workflows for Olive's hospital partners`,
          `Built API endpoints to deploy machine learning models`,
          `Sadly, the company has shut down`
        ]}
        buttonLinks={["https://web.archive.org/web/20230000000000*/https://oliveai.com/"]}
        buttonText={["WayBackMachine - Web Archive"]}
      />
    </div>
	);
}
