import { FC, MouseEvent } from 'react';
import { ButtonInterface } from '../../types/button';

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
