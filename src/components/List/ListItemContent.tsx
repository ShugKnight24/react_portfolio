import { FC } from 'react';
import { ListContentInterface } from '../../types/list';

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
