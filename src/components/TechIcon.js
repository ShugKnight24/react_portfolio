import React from 'react';

export default function TechIcon({iconName, iconURL}){
	let imageClass;

	if (iconName === 'React' || iconName === 'MySQL' || iconName === 'NodeJS' || iconName ===  'jQuery'){
		imageClass = iconName.toLowerCase();
	}
	if (iconName === 'React Native'){
		imageClass = 'react';
	}

	return(
		<>
			<div className="tech-skill">
				<img className={ imageClass ? imageClass : '' } src={ iconURL } alt={ `${ iconName } Icon` } />
				<p>{ iconName }</p>
			</div>
			<span className="bar">|</span>
		</>
	)
}