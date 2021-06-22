import { FC } from 'react';
import { ImageFrame } from './ImageFrame';
import { ColumnInterface } from '../../types/photos';

export const Column : FC<ColumnInterface> = ({ images }) => {
	return (
		<div className="column">
			{
				images.map(({ artist, src, height, description}, index) => {
					return(
						<ImageFrame
							key={ `${ artist }-${ index }` }
							src={ src }
							height={ height }
							artist={ artist }
							description={ description }
						/>
					);
				})
		}
		</div>
	);
}
