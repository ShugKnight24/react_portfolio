import { FC, ReactNode } from 'react';
import { MouseEventHandler } from '../../types/events';

export interface TabInterface {
	active?: boolean;
	children?: ReactNode | string;
	extraClass?: string;
	text?: string;
	updateActiveTab?: MouseEventHandler;
}

export const Tab: FC<TabInterface> = ({
	active,
	children,
	extraClass,
	text,
	updateActiveTab
}) => {
	return (
		<a
			className={`tab tab-name
				${extraClass ? extraClass : ''} 
				${active ? 'active' : ''}`
			}
			onClick={updateActiveTab}
		>
			{ children ? children : text }
			<span className="spacer" />
		</a>
	);
}