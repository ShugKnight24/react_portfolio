import { FC } from 'react';
import { TabInterface } from '../../types/tab';

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
