import { FC, ReactNode } from 'react';

interface CardTitleInterface {
	ariaLabel?: string;
	children: ReactNode;
	extraClass?: string;
	role?: string;
}

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