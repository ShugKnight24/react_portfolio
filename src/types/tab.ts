import { ReactElement, ReactNode } from 'react';
import { MouseEventHandler } from './events';


export interface TabBarInterface {
  activeTab: number;
	children?: ReactElement[];
	onClick?: MouseEventHandler;
}

export interface TabInterface {
  active?: boolean;
  children?: ReactNode | string;
  extraClass?: string;
  text?: string;
  updateActiveTab?: MouseEventHandler;
}

export interface TabsInterface {
	activeTab: number;
	children?: ReactElement[];
	extraClass?: string;
}
