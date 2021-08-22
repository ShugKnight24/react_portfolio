import { FC, ReactNode } from 'react';

interface CardTextInterface {
	children?: ReactNode;
	extraClass?: string;
	text?: string;
}

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