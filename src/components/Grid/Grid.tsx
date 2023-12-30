import { FC } from 'react';
import { GridInterface } from '../../types/grid';

export const Grid: FC<GridInterface> = ({ children, extraClass }) => {
	return (
		<div className={`grid ${ extraClass ? extraClass : '' }`}>
			{children}
		</div>
	);
};
