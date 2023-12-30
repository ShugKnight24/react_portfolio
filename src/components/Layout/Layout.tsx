import { FC } from 'react';
import { LayoutInterface } from '../../types/layout';

export const Layout: FC<LayoutInterface> = ({ children }) => (
	<div className="layout">
		{children}
	</div>
);
