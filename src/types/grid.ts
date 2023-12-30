import { ReactNode } from 'react';
import { MouseEventHandler  } from './events';

type ColumnTypes = 'quarter' | 'third' | 'half' | 'two-thirds' | 'three-quarters' | 'full';

export interface CellInterface {
children: ReactNode;
	columns: ColumnTypes;
	dataBookIndex?: number;
	dataCategoryIndex?: number;
	extraClass?: string;
	onClick?: MouseEventHandler;
}

export interface GridInterface {
	children: ReactNode;
	extraClass?: string;
}
