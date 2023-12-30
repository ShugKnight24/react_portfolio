import { FC } from 'react';
import { CardActionsInterface } from '../../types/card';

export const CardActions: FC<CardActionsInterface> = ({
	children,
	border,
	extraClass
}) => {
	return (
		<div
			className={`card-actions
				${ extraClass ? extraClass : '' }
				${ border ? 'border' : '' }
			`}
		>
			{children}
		</div>
	);
}
