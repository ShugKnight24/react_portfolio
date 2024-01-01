import { FC } from 'react';
import {
	Games,
	GTB,
	JavaScript30,
	LoveBook,
	PersonalProjects,
	Progressive,
	ShumunovSolutions
} from './index';
import { ActiveTab } from '../../types/projects';
import { Nexient } from './Nexient';
import { OliveAI } from './OliveAI';

const projectComponents = [
	<ShumunovSolutions />,
	<Nexient />,
	<OliveAI />,
	<Progressive />,
	<LoveBook />,
	<PersonalProjects />,
	<JavaScript30 />,
	<Games />,
	<GTB />
];

export const Projects: FC<ActiveTab> = ({ activeTab }) => {

	return (
		<div className="projects">
			{projectComponents[activeTab]}
		</div>
	);
}
