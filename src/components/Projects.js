import { PersonalProjects } from './Projects/PersonalProjects';
import { JavaScript30 } from './Projects/JavaScript30';
import { Games } from './Projects/Games';
import { GTB } from './Projects/GTB';
import { LoveBook } from './Projects/LoveBook';
import { Progressive } from './Projects/Progressive';
import { ShumunovSolutions } from './Projects/ShumunovSolutions';

export function Projects({ activeTab }){
	return(
		<div className="projects">
			if (activeTab === 0){
				<PersonalProjects />
			}

			if (activeTab === 1){
				<JavaScript30 />
			}

			if (activeTab === 2){
				<Games />
			}

			if (activeTab === 3){
				<GTB />
			}

			if (activeTab === 4){
				<LoveBook />
			}

			if (activeTab === 5){
				<Progressive />
			}

			if (activeTab === 6){
				<ShumunovSolutions />
			}
		</div>
	);
}
