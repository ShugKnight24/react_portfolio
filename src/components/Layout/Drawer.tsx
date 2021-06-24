import { FC, ReactNode, RefObject } from 'react';

interface DrawerInterface {
	children : ReactNode,
	title : string,
	reference: RefObject<HTMLDivElement>
}

export const Drawer : FC<DrawerInterface> = ({ children, reference, title }) => {
	return(
		<div
			className="drawer"
			ref={ reference }
		>
			<span className="drawer-title">{ title }</span>
			{ children }
		</div>
	)
}