//TODO:// Refactor Skills & TechIcons

import { FC } from 'react';
// import TechIcon from './TechIcon';
import { Grid, Cell, ProgressBar } from 'react-mdl';

import { SkillsInterface } from '../types/skills';

export const Skills : FC<SkillsInterface> = ({
	iconName,
	iconURL,
	index,
	progress,
	skillType,
	skill
}) => {
	return(
		<Grid>
			<Cell col={ 12 }>
				<div className="progress-container">
				{/* <TechIcon
					key={ `${ iconName }-${ index }` }
					iconName={ iconName }
					iconURL={ iconURL }
				/> */}
				<span className={`bold-text ${ progress !== null ? 'skill-name-centered' : '' }`}>{ skill }</span>
					{
						progress !== null &&
						<ProgressBar className="skill-progress" progress={ progress }/>
					}
				</div>
			</Cell>
		</Grid>
	);
}
