import { FC, ReactNode } from 'react';
import { ListInterface } from '../../types/list';

export const List: FC<ListInterface> = ({
	children,
	extraClass
}) => {
	return (
		<ul className={`list ${ extraClass ? extraClass : '' }`}>
			{ children }
		</ul>
	);
}