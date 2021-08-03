import { FC, useState } from 'react';
import { Tabs, Tab, Cell } from 'react-mdl';
import { Grid } from '../Grid'

import { Projects } from '../Projects';

export const ProjectsPage: FC = () => {
	const [activeTab, setActiveTab] = useState(0);

	return(
		<div className="projects-page">
			<Tabs
				className="projects-tabs"
				ripple
			>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 0 ) }
				>Personal Projects</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 1 ) }
				>JS30</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 2 ) }
				>Games</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 3 ) }
				>GTB</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 4 ) }
				>LoveBook</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 5 ) }
				>Progressive Solutions</Tab>
				<Tab
					className="tab-name"
					onClick={ () => setActiveTab( 6 ) }
				>Shumunov Solutions</Tab>
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