import { FC } from 'react';
import { DrawerInterface } from '../../types/layout';

export const Drawer : FC<DrawerInterface> = ({ children, isVisible, title }) => (
	<div
		className={`drawer ${ isVisible ? 'active' : '' }`}
	>
		<span className="drawer-title">{ title }</span>
		{ children }
	</div>
);
