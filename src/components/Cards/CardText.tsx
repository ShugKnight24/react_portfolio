import { FC, ReactNode } from 'react';
import { CardTextInterface } from '../../types/card';

export const CardText: FC<CardTextInterface> = ({
	children,
	extraClass
}) => {
	const renderText = (): ReactNode => {
    if (Array.isArray(children)) {
      return children.map((child, index) => <p key={index}>{`- ${child}`}</p>);
    }
    return <p>{children}</p>;
  };

	return (
		<div className={`card-text ${ extraClass ? extraClass : '' }`}>
			{renderText()}
		</div>
	);
}
