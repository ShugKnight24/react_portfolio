import { FC } from 'react';
import { Games, GTB, JavaScript30, LoveBook, PersonalProjects, Progressive, ShumunovSolutions } from './Projects/index';

type ActiveTab = {
	activeTab: number
}

export const Projects : FC<ActiveTab> = ({ activeTab }) => {
	const currentProject = () => {
		if (activeTab === 0) {
			return <PersonalProjects />;
		}
		if (activeTab === 1){
			return <JavaScript30 />;
		}
		if (activeTab === 2){
			return <Games />;
		}
		if (activeTab === 3){
			return <GTB />;
		}
		if (activeTab === 4){
			return <LoveBook />;
		}
		if (activeTab === 5){
			return <Progressive />;
		}
		if (activeTab === 6){
			return <ShumunovSolutions />;
		}
	}
	return(
		<div className="projects">
			{
				currentProject()
			}
		</div>
	);
}
