import { FC, useState, useEffect } from 'react';
import { Column } from './Column';

// getColumns Hook
import { getColumns } from './GetColumnsHook';

import { ImageData, ImageList } from '../../types/photos';

export const Gallery : FC<ImageData> = ({ imageArray }) => {
	const [columns, setColumns] = useState<ImageList[][]>([]);
	
	useEffect(() => {
		const smallScreen = window.matchMedia('all and (max-width: 800px)');
		const mediumScreen = window.matchMedia('all and (max-width: 1200px)');
		const largeScreen = window.matchMedia('all and (max-width: 1600px)');
		if (smallScreen.matches) {
			setColumns(getColumns(imageArray, 2));
		} else if (mediumScreen.matches) {
			setColumns(getColumns(imageArray, 3));
		} else if (largeScreen.matches) {
			setColumns(getColumns(imageArray, 4));
		} else {
			setColumns(getColumns(imageArray, 5));
		}
	}, [imageArray]);

	return (
		<div className="gallery">
			{
				columns.map((images, index) => {
					return(
						<Column
							key={ index }
							images={ images }
						/>
					);
				})
			}
		</div>
	)
}
