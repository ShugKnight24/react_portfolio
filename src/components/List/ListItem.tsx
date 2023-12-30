import { FC } from 'react';
import { ListItemInterface } from '../../types/list';

export const ListItem: FC<ListItemInterface> = ({
	children,
	extraClass,
	jobResponsibility
}) => {
	if (jobResponsibility){
		return (
			<li
				className={`list-item ${ extraClass ? extraClass : '' }`}
				dangerouslySetInnerHTML={{__html: jobResponsibility}}
			>
				{ children }
			</li>
		)
	} else {
		return (
			<li
				className={`list-item ${ extraClass ? extraClass : '' }`}
			>
				{ children }
			</li>
		)
	};
}
