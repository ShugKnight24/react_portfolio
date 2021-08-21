//TODO:// Refactor Skills & TechIcons

import { FC } from 'react';
// import TechIcon from './TechIcon';
import { Cell, Grid } from './Grid';
import { ProgressBar } from './ProgressBar/ProgressBar';

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
			<Cell columns={ 'full' }>
				<div className="progress-container">
				{/* <TechIcon
					key={ `${ iconName }-${ index }` }
					iconName={ iconName }
					iconURL={ iconURL }
				/> */}
				<span className={`bold-text ${ progress !== null ? 'skill-name-centered' : '' }`}>{ skill }</span>
					{
						progress !== null &&
						<ProgressBar progress={ progress } />
					}
				</div>
			</Cell>
		</Grid>
	);
}
