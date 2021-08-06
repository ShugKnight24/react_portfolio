import React, { FC, ReactNode } from 'react';

interface CellInterface {
	children: ReactNode;
	columns: number;
	extraClass?: string;
	// TODO - Refactor OnClick interface
	onClick?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
}

export const Cell: FC<CellInterface> = ({ children, columns, extraClass, onClick }) => (
	<div
		className={`cell ${ columns } ${ extraClass ? extraClass : '' }`}
		onClick={ onClick }
	>
		{children}
	</div>
)