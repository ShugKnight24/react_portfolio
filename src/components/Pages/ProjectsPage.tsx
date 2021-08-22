import { FC, useState } from 'react';
import { Cell, Grid } from '../Grid';
import { Tabs, Tab } from '../Tabs';

import { Projects } from '../Projects';

export const ProjectsPage: FC = () => {
	const [activeTab, setActiveTab] = useState(0);

	return(
		<div className="projects-page">
			<Tabs
				extraClass="projects-tabs"
				activeTab={activeTab}
			>
				<Tab
					updateActiveTab={ () => setActiveTab(0) }
				>Personal Projects</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(1) }
				>JS30</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(2) }
				>Games</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(3) }
				>GTB</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(4) }
				>LoveBook</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(5) }
				>Progressive Solutions</Tab>
				<Tab
					updateActiveTab={ () => setActiveTab(6) }
				>Shumunov Solutions</Tab>
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