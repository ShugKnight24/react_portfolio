import { FC, MouseEvent, ReactNode } from 'react';
import { MouseEventHandler  } from '../../types/events';

interface CellInterface {
	children: ReactNode;
	columns: ColumnTypes;
	dataBookIndex?: number;
	dataCategoryIndex?: number;
	extraClass?: string;
	onClick?: MouseEventHandler;
}

type ColumnTypes = 
	'quarter'
	| 'third'
	| 'half'
	| 'two-thirds'
	| 'three-quarters'
	| 'full';

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
)