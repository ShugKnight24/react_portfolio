import { ReactNode } from 'react';

export interface CardActionsInterface {
	children: ReactNode;
	border?: boolean;
	extraClass?: string;
}

export interface CardInterface {
	children: ReactNode;
	extraClass?: string;
	shadow?: ShadowTypes;
}

export interface CardTextInterface {
	children?: ReactNode;
	extraClass?: string;
	text?: string;
}

export interface CardTitleInterface {
	ariaLabel?: string;
	children: ReactNode;
	extraClass?: string;
	role?: string;
}

type ShadowTypes = 'none' | 'light' | 'medium' | 'dark';
