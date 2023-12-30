import { ReactNode } from 'react';
import { MouseEventHandler } from './events';

export interface ButtonInterface {
	children?: ReactNode;
	extraClass?: ButtonColors;
	onClick?: MouseEventHandler;
	text?: string;
}

type ButtonColors =
	'continue'
	| 'disabled'
	| 'primary'
	| 'stop'
	|'warning';
