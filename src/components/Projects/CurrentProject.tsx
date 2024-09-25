import { FC } from 'react';
import { ActiveTab } from '../../types/projects';
import {
  Games,
  GTB,
  JavaScript30,
  LoveBook,
  Nexient,
  OliveAI,
  PersonalProjects,
  Progressive,
  ShumunovSolutions,
} from './index';

const projectComponents = [
  ShumunovSolutions,
  Nexient,
  OliveAI,
  Progressive,
  LoveBook,
  PersonalProjects,
  JavaScript30,
  Games,
  GTB,
];

export const CurrentProject: FC<ActiveTab> = ({ activeTab }) => {
  const ActiveProject = projectComponents[activeTab];
  return (
    <div className="projects">
      <ActiveProject />
    </div>
  );
};
