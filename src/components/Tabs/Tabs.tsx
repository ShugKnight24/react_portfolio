import { FC, ReactElement } from 'react';
import { TabBar } from './TabBar';

interface TabsInterface {
	activeTab: number;
	children?: ReactElement[];
	extraClass?: string;
}

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