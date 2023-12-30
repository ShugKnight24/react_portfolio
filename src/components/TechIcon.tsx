import { FC } from 'react';
import { ProgressBar } from './ProgressBar/ProgressBar';
import { SkillsInterface } from '../types/skills';

import { iconsWithClasses } from '../data/techIcons';

export const TechIcon: FC<SkillsInterface> = ({
	iconName,
	iconURL,
	nameInLogo,
	progress
}) => {

	let imageClass: string | null = null;
	if (iconName) {
		imageClass = iconsWithClasses.includes(iconName) ? iconName.toLowerCase() : null;
	}

	return (
		<div className="tech-skill">
			<div className="image-name">
				{iconName && (
					<img
						className={ imageClass || '' }
						src={ iconURL }
						alt={ `${ iconName } Icon` }
					/>
				)}
				{!nameInLogo && iconName && (
					<p>{ iconName }</p>
				)}
			</div>
			<span className="bar">|</span>
			{progress !== null && (
				<ProgressBar progress={ progress } />
			)}
		</div>
	);
}
