import { FC } from 'react';
import { CardInterface } from '../../types/card';

export const Card: FC<CardInterface> = ({
	children,
	extraClass,
	shadow
}) => {
	let shadowClass = '';
	if (shadow) {
		shadowClass = `card-shadow-${shadow}`;
	}
	return (
		<div
			className={`card-container
				${ extraClass ? extraClass : '' }
				${ shadowClass }
			`}
		>
			{children}
		</div>
	);
};
