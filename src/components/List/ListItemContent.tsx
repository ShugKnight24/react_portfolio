import { FC, ReactNode } from 'react';

interface ListContentInterface {
	children?: ReactNode;
	text?: string;
}

export const ListItemContent: FC<ListContentInterface> = ({
	children,
	text
}) => {
	return (
		<span className="list-item-content">
			{ children ? children : text }
		</span>
	);
}