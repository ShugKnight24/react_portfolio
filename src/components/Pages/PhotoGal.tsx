import { FC } from 'react';
import Gallery from '../Gallery/Gallery';

import { imageArray } from '../../data/galleryImages.js';

export const PhotoGal : FC = () => {
	return (
		<div className="gallery-container">
			<Gallery imageArray={ imageArray } />
		</div>
	)
}
