import { FC, ReactNode } from 'react';

interface CardActionsInterface {
	children: ReactNode;
	border?: boolean;
	extraClass?: string;
}

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