import { FC } from 'react';
import { ContentInterface } from '../../types/layout';

export const Content: FC<ContentInterface> = ({ children }) => (
	<div className="content">
		{children}
	</div>
);
