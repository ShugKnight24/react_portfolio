import { FC } from 'react';
import { shumunovSolutionsProjects } from '../../data/projectData';
import { ProjectCard } from './ProjectCard';

export const ShumunovSolutions: FC = () => {
  return (
    <div className="projects-grid">
      {shumunovSolutionsProjects.map((project, index) => (
        <ProjectCard key={index} {...project} />
      ))}
    </div>
  );
};
