import React from 'react';
import ImageFrame from './ImageFrame';

export default function Column({ images }) {
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
