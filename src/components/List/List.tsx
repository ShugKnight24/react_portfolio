import { FC, ReactNode } from 'react';

interface ListInterface {
	children?: ReactNode;
	extraClass?: string;
}

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