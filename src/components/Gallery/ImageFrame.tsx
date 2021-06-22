import { FC, useState } from 'react';
import { ImageList } from '../../types/photos';

export const ImageFrame : FC<ImageList> = ({
	artist,
	src,
	height,
	description
}) => {
	const [isVisible, setIsVisible] = useState(false);

	return (
		<div className="image-frame-container">
			<div
				className={ isVisible ? 'image-overlay' : '' }
				onClick={ () => setIsVisible(false) }
			></div>
			<div
				className={`image-frame ${isVisible ? 'open' : ''}`}
				style={{ height:  height }}
			>
				<img
					className={ isVisible ? 'main-image-open' : 'main-image' }
					onClick={ () => setIsVisible(isVisible ? false : true) }
					src={ src }
					alt={ description }
					height={ height + 100 }
				/>
				<span
					className={` ${ isVisible ? 'show' : '' } close-button` }
					onClick={ () => setIsVisible(false) }
				>
					<i className="far fa-times-circle" aria-hidden="true"></i>
				</span>
				<div className="actions">
					<button
						className={ `info ${ isVisible ? 'hide' : '' }` }
						onClick={ () => setIsVisible(true) }
					>Info</button>
					<div>{ artist }</div>
					<button
						className="download"
						onClick={ () => window.open(`${ src }`, '_blank')}
					>Fullsize / Download</button>
				</div>
			</div>
		</div>
	);
}
