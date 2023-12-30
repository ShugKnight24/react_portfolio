import { FC } from 'react';
import { TabBar } from './TabBar';
import { TabsInterface } from '../../types/tab';

export const Tabs: FC<TabsInterface> = ({
	activeTab,
	children,
	extraClass
}) => {
	return (
		<div className={`tabs ${extraClass ? extraClass : ''}`}>
			<TabBar
				activeTab={activeTab}
			>
				{ children }
			</TabBar>
		</div>
	);
}
