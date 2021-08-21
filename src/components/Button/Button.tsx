import { FC, MouseEvent, ReactNode } from 'react';
import { MouseEventHandler } from '../../types/events';

interface ButtonInterface {
	children?: ReactNode;
	extraClass?: string;
	onClick?: MouseEventHandler;
	text?: string;
}

// TODO additional sizing options
// TODO add color options
// TODO robust enough for multiple events
export const Button: FC<ButtonInterface> = ({
	children,
	extraClass,
	onClick,
	text
}) => {
	return (
		<button 
			className={`button ${ extraClass ? extraClass : '' }`}
			onClick={(event: MouseEvent<HTMLElement>) => {
				if (onClick) {
					onClick(event);
				}
			}}
		>
			{ children ? children : text }
		</button>
	);
}