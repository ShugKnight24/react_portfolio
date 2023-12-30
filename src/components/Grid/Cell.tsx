import { FC, MouseEvent } from 'react';
import { CellInterface } from '../../types/grid';

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
		data-book-index={ dataBookIndex }
		data-category-index={ dataCategoryIndex }
		onClick={(event: MouseEvent<HTMLElement>) => {
			if (onClick) {
				onClick(event);
			}
		}}
	>
		{children}
	</div>
);
