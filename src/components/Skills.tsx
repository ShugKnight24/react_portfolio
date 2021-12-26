import { FC } from 'react';
import { TechIcon } from './TechIcon';
import { Cell, Grid } from './Grid';
import { ProgressBar } from './ProgressBar/ProgressBar';

import { SkillsInterface } from '../types/skills';

export const Skills : FC<SkillsInterface> = ({
	iconName,
	iconURL,
	index,
	nameInLogo,
	progress,
	skill
}) => {
	return(
		<Grid>
			<Cell columns={ 'full' }>
				<div className="progress-container">
					{skill ? (
						<span className="bold-text skill-name-centered">{ skill }</span>
					) : (
						<TechIcon
							key={ `${ iconName ? iconName : '' }-${ index ? index.toString() : '' }` }
							iconName={ iconName }
							iconURL={ iconURL }
							nameInLogo={ nameInLogo }
						/>
					)}
					{progress !== null && (
						<ProgressBar progress={ progress } />
					)}
				</div>
			</Cell>
		</Grid>
	);
}
