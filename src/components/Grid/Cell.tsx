import React, { FC, ReactNode } from 'react';

interface CellInterface {
	children: ReactNode;
	columns: string;
	dataBookIndex?: number;
	dataCategoryIndex?: number;
	extraClass?: string;
	// TODO - Refactor OnClick interface
	onClick?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
}

export const Cell: FC<CellInterface> = ({ 
	children,
	columns,
	dataBookIndex,
	dataCategoryIndex,
	extraClass,
	onClick
}) => (
	<div
		className={`cell ${ columns } ${ extraClass ? extraClass : '' }`}
		onClick={ onClick }
		data-book-index={ dataBookIndex }
		data-category-index={ dataCategoryIndex }
	>
		{children}
	</div>
)