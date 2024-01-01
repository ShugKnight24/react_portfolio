import { FC, useState } from 'react';
import { Cell, Grid } from '../Grid';
import { Tabs, Tab } from '../Tabs';

import { Projects } from '../Projects/Projects';

const projectNames = [
	'Shumunov Solutions',
	'Nexient',
	'Olive AI',
	'Progressive Solutions',
	'LoveBook',
	'Personal Projects',
	'JS30',
	'Games',
	'GTB'
];

export const ProjectsPage: FC = () => {
	const [activeTab, setActiveTab] = useState(0);

	return(
		<div className="projects-page">
			<Tabs
				extraClass="projects-tabs"
				activeTab={activeTab}
			>
				{projectNames.map((name, index) => {
					return (
						<Tab
							key={ index }
							updateActiveTab={ () => setActiveTab(index) }
						>{ name }</Tab>
					);
				})}
			</Tabs>
			<Grid>
				<Cell columns={ 'full' }>
					<Projects 
						activeTab={ activeTab }
					/>
				</Cell>
			</Grid>
		</div>
	);
}
