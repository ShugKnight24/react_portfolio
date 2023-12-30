import { ReactNode } from 'react';

export interface ListInterface {
	children?: ReactNode;
	extraClass?: string;
}

export interface ListItemInterface {
	children?: ReactNode;
	extraClass?: string;
	jobResponsibility?: string;
}

export interface ListContentInterface {
	children?: ReactNode;
	text?: string;
}
