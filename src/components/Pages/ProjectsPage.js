import { useState } from 'react';
import { Tabs, Tab, Grid, Cell } from 'react-mdl';

import { Projects } from '../Projects';

export function ProjectsPage(){
	const [activeTab, setActiveTab] = useState(0);

	return(
		<div className="projects-page">
			<Tabs className="projects-tabs" activeTab={ activeTab } onChange={ (tabId) => setActiveTab({ activeTab: tabId}) } ripple>
				<Tab className="tab-name">Personal Projects</Tab>
				<Tab className="tab-name">JS30</Tab>
				<Tab className="tab-name">Games</Tab>
				<Tab className="tab-name">GTB</Tab>
				<Tab className="tab-name">LoveBook</Tab>
				<Tab className="tab-name">Progressive Solutions</Tab>
				<Tab className="tab-name">Shumunov Solutions</Tab>
			</Tabs>
			<Grid>
				<Cell col={ 12 }>
					<div className="content">
						<Projects 
							activeTab={ activeTab }
						/>
					</div>
				</Cell>
			</Grid>
		</div>
	);
}