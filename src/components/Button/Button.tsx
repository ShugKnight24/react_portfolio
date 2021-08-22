import { FC, MouseEvent, ReactNode } from 'react';
import { MouseEventHandler } from '../../types/events';

interface ButtonInterface {
	children?: ReactNode;
	extraClass?: ButtonColors;
	onClick?: MouseEventHandler;
	text?: string;
}

type ButtonColors =
	'continue'
	| 'disabled'
	| 'primary'
	| 'stop'
	|'warning';

// TODO additional sizing options
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