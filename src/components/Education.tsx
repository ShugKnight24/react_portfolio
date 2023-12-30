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
	return (
		<Grid extraClass="education-container">
			<Cell columns={ 'third' }>
				<p>{ startMonth } { startYear } - { endMonth } { endYear }</p>
			</Cell>
			<Cell columns={ 'two-thirds' }>
				<h3>{ schoolName }</h3>
				<h4>{ degreeName }</h4>
				<h5>{ majorName }</h5>
			</Cell>
		</Grid>
	);
}
