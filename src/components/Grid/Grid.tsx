import { FC, ReactNode } from 'react';

interface GridInterface {
	children: ReactNode;
	extraClass?: string;
}

export const Grid: FC<GridInterface> = ({ children, extraClass }) => {
	return (
		<div className={`grid ${ extraClass ? extraClass : '' }`}>
			{children}
		</div>
	);
};
