import { PersonalProjects } from './Projects/PersonalProjects';
import { JavaScript30 } from './Projects/JavaScript30';
import { Games } from './Projects/Games';
import { GTB } from './Projects/GTB';
import { LoveBook } from './Projects/LoveBook';
import { Progressive } from './Projects/Progressive';
import { ShumunovSolutions } from './Projects/ShumunovSolutions';

export function Projects({ activeTab }){
	if (activeTab === 0){
		return(
			<div className="projects">
				<PersonalProjects />
			</div>
		)
	}

	if (activeTab === 1){
		return(
			<div className="projects">
				<JavaScript30 />
			</div>
		)
	}

	if (activeTab === 2){
		return(
			<div className="projects">
				<Games />
			</div>
		)
	}

	if (activeTab === 3){
		return(
			<div className="projects">
				<GTB />
			</div>
		)
	}

	if (activeTab === 4){
		return(
			<div className="projects">
				<LoveBook />
			</div>
		)
	}

	if (activeTab === 5){
		return(
			<div className="projects">
				<Progressive />
			</div>
		)
	}

	if (activeTab === 6){
		return(
			<div className="projects">
				<ShumunovSolutions />
			</div>
		)
	}
}
