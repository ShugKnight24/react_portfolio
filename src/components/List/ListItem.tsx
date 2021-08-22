import { FC, ReactNode } from 'react';

interface ListItemInterface {
	children?: ReactNode;
	extraClass?: string;
	jobResponsibility?: string;
}

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