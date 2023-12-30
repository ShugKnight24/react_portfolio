import { FC } from 'react';
import { CardTextInterface } from '../../types/card';

export const CardText: FC<CardTextInterface> = ({
	children,
	extraClass,
	text
}) => {
	return (
		<div className={`card-text ${ extraClass ? extraClass : '' }`}>
			{ children ? children : text }
		</div>
	);
}
