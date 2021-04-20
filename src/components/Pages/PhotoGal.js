import Gallery from '../Gallery/Gallery';

import { imageArray } from '../../data/galleryImages.js';

export default function PhotoGal() {
	return (
		<div className="gallery-container">
			<Gallery imageArray={ imageArray } />
		</div>
	)
}
