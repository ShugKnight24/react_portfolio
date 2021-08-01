import { FC, ReactNode } from 'react';

interface HeaderInterface {
	children : ReactNode;
	title: string;
}

export const Header: FC<HeaderInterface> = ({ children, title }) => (
	<div className="header">
		<div className="header-container">
			<span className="title">{title}</span>
			{children}
		</div>
	</div>
)