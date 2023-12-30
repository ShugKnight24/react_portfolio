import { FC } from 'react';
import { CardTitleInterface } from '../../types/card';

export const CardTitle: FC<CardTitleInterface> = ({ 
	ariaLabel,
	children,
	extraClass,
	role
}) => {
	return (
		<div
			aria-label={ ariaLabel}
			className={`card-title ${ extraClass ? extraClass : '' }`}
			role={ role }
		>
			{children}
		</div>
	);
}
