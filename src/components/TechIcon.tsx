//TODO:// Refactor Skills & TechIcons

import { FC } from 'react';
import { SkillsInterface } from '../types/skills';

export const TechIcon: FC<SkillsInterface>= ({
	iconName,
	iconURL
}) => {
	let imageClass: string | null = null;

	if (iconName === 'React' || iconName === 'MySQL' || iconName === 'NodeJS' || iconName === 'jQuery' || iconName ===  'Git' || iconName ===  'MongoDB'){
		imageClass = iconName.toLowerCase();
	}
	if (iconName === 'React Native'){
		imageClass = 'react';
	}

	return(
		<>
			<div className="tech-skill">
				<img className={ imageClass ? imageClass : '' } src={ iconURL } alt={ `${ iconName ? iconName : 'No' } Icon` } />
				<p>{ iconName }</p>
			</div>
			<span className="bar">|</span>
		</>
	)
}