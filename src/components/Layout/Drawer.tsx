import { FC, ReactNode } from 'react';

interface DrawerInterface {
	children : ReactNode;
	isVisible : boolean;
	title : string;
}

export const Drawer : FC<DrawerInterface> = ({ children, isVisible, title }) => (
	<div
		className={`drawer ${ isVisible ? 'active' : '' }`}
	>
		<span className="drawer-title">{ title }</span>
		{ children }
	</div>
)
