import { Grid, Cell } from 'react-mdl';

export function Education({ startMonth, startYear, endMonth, endYear, schoolName, degreeName, majorName }) {
	return(
		<Grid className="education-container">
			<Cell col={ 4 }>
				<p>{ startMonth } { startYear } - { endMonth } { endYear }</p>
			</Cell>
			<Cell col={ 8 }>
				<h3>{ schoolName }</h3>
				<h4>{ degreeName }</h4>
				<h5>{ majorName }</h5>
			</Cell>
		</Grid>
	)
}
