import { FC, ReactNode } from 'react';

interface CardInterface {
	children: ReactNode;
	extraClass?: string;
	shadow?: ShadowTypes;
}

type ShadowTypes = 'none' | 'light' | 'medium' | 'dark';

export const Card: FC<CardInterface> = ({
	children,
	extraClass,
	shadow
}) => {
	let shadowClass = '';
	if (shadow) {
		shadowClass = `card-shadow-${shadow}`;
	}
	return (
		<div
			className={`card-container
				${ extraClass ? extraClass : '' }
				${ shadowClass }
			`}
		>
			{children}
		</div>
	);
};