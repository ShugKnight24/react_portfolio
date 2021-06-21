import { ImageList } from '../../types/photos';

export const getColumns = (imageArray : ImageList[], numberOfColumns : number) => {

	let images : any = [];
	// push empty array for each column
	for (let i = 0; i < numberOfColumns; i++) {
		images.push([]);
	}

	let totalHeight = 0;
	// Calc total height of all images
	imageArray.forEach(({ height }) => totalHeight += height);
	
	// calculate ~max height of a column
	let maxColumnHeight = Math.floor(totalHeight / numberOfColumns);
	let currentColumnHeight = 0;
	let currentColumn = 0;
	
	const shuffledImages = imageArray.sort(() => Math.random() - .5);
	shuffledImages.forEach( image => {
		if ((currentColumnHeight + image.height) >= maxColumnHeight) {
			// new column
			if (currentColumn !== numberOfColumns - 1) { 
				currentColumn += 1;
			}
			currentColumnHeight = image.height;
			images[currentColumn].push(image);
		} else {
			// current column
			currentColumnHeight += image.height;
			images[currentColumn].push(image);
		}
	});
	return images;
}