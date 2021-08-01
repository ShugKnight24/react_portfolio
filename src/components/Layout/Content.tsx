import { FC, ReactNode } from 'react';

interface ContentInterface {
	children: ReactNode;
}

export const Content: FC<ContentInterface> = ({ children }) => (
	<div className="content">
		{children}
	</div>
)