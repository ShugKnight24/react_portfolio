import { FC } from 'react';
import { Cell, Grid } from './Grid';
import { List, ListItem } from './List';
import { ExperienceInterface } from '../types/experience';

export const Experience: FC<ExperienceInterface> = ({ 
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
		return (
			<ListItem
				extraClass="job-responsibility"
				jobResponsibility={ jobResponsibility }
				key={ index }
			></ListItem>
		);
	});

	return(
		<Grid extraClass="experience-container">
			<Cell columns={ 'full' }>
				<h3>{ jobName }</h3>
				<h4>{ jobPosition }</h4>
				<span className="date-of-employment">
					{ startMonth } { startYear } ➔ { endMonth } { endYear }
				</span>
				<p>{ jobDescription }</p>
				<List extraClass="job-responsibilities-list">
					{ jobResponsibilitiesList }
				</List>
			</Cell>
		</Grid>
	)
}
