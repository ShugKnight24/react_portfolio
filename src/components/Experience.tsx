import { FC } from 'react';
import { Grid, Cell, List, ListItem } from 'react-mdl';
import { ExperienceInterface } from '../types/experience';

export const Experience : FC<ExperienceInterface> = ({ 
	jobDescription,
	jobResponsibilities,
	jobName,
	jobPosition,
	startMonth,
	startYear,
	endMonth,
	endYear
}) => {

	const jobResponsibilitiesList = jobResponsibilities.map(function(jobResponsibility, index){
		return <ListItem className="job-responsibility" key={ index } dangerouslySetInnerHTML={{__html: jobResponsibility}}></ListItem>;
	});

	return(
		<Grid className="experience-container">
			<Cell col={12}>
				<h3>{ jobName }</h3>
				<h4>{ jobPosition }</h4>
				<span className="date-of-employment">
					{ startMonth } { startYear } ➔ { endMonth } { endYear }
				</span>
				<p>{ jobDescription }</p>
				<List className="job-responsibilities-list">
					{ jobResponsibilitiesList }
				</List>
			</Cell>
		</Grid>
	)
}
