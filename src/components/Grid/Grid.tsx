import { FC, ReactNode } from 'react';

interface GridInterface {
	children: ReactNode;
	className?: string;
}

export const Grid: FC<GridInterface> = ({ children, className }) => {
	const additionalStyleClassName = className ? className : '';
	return (
		<div className={`grid ${additionalStyleClassName}`}>
			{children}
		</div>
	);
};
