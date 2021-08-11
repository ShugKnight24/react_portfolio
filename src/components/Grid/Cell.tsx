import { FC, MouseEvent, ReactNode } from 'react';
import { MouseEventHandler  } from '../../types/events';

interface CellInterface {
	children: ReactNode;
	columns: string;
	dataBookIndex?: number;
	dataCategoryIndex?: number;
	extraClass?: string;
	onClick?: MouseEventHandler;
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