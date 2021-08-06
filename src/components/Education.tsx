import { FC } from 'react';
import { Cell, Grid } from './Grid';
import { EducationInterface } from '../types/education';

export const Education: FC<EducationInterface> = ({
	startMonth, 
	startYear, 
	endMonth, 
	endYear, 
	schoolName, 
	degreeName, 
	majorName
}) => {
	return(
		<Grid extraClass="education-container">
			<Cell columns={ 4 }>
				<p>{ startMonth } { startYear } - { endMonth } { endYear }</p>
			</Cell>
			<Cell columns={ 8 }>
				<h3>{ schoolName }</h3>
				<h4>{ degreeName }</h4>
				<h5>{ majorName }</h5>
			</Cell>
		</Grid>
	)
}
