import { FC } from 'react';
import { ProgressBar } from './ProgressBar/ProgressBar';
import { SkillsInterface } from '../types/skills';

export const TechIcon: FC<SkillsInterface> = ({
	iconName,
	iconURL,
	nameInLogo,
	progress
}) => {
	let imageClass: string | null = null;

	// TODO: Refactor to improved function
	if (iconName === 'React' || iconName === 'MySQL' || iconName === 'NodeJS' || iconName === 'jQuery' || iconName ===  'Git' || iconName ===  'MongoDB' || iconName === "Cypress"){
		imageClass = iconName.toLowerCase();
	}
	if (iconName === 'React Native'){
		imageClass = 'react';
	}

	return (
		<div className="tech-skill">
			<div className="image-name">
				<img className={ imageClass ? imageClass : '' } src={ iconURL } alt={ `${ iconName ? iconName : 'No' } Icon` } />
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