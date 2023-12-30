import { FC } from 'react';
import { HeaderInterface } from '../../types/layout';

export const Header: FC<HeaderInterface> = ({ children, title }) => (
	<div className="header">
		<div className="header-container">
			<span className="title">{title}</span>
			{children}
		</div>
	</div>
);
