import { FC, ReactElement } from 'react';
import { Tab } from './Tab';
import { TabBarInterface } from '../../types/tab';

export const TabBar: FC<TabBarInterface> = ({
	activeTab,
	children
}) => {
	return (
		<div className="tab-bar">
			{
				children &&
				children.map((
					child: ReactElement,
					index: number
				) => {
					return (
						<Tab
							key={index}
							active={index === activeTab}
							updateActiveTab={child.props.updateActiveTab}
						>
							{ child.props.children }
						</Tab>
					)
				})
			}
		</div>
	);
}
