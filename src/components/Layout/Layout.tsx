import { FC, ReactNode } from 'react';

interface LayoutInterface {
	children : ReactNode;
}

export const Layout: FC<LayoutInterface> = ({ children }) => (
	<div className="layout">
		{children}
	</div>
)