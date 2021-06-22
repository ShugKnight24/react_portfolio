import { FC, KeyboardEvent, useState} from 'react';
import { ImageList } from '../../types/photos';

export const ImageFrame : FC<ImageList> = ({
	artist,
	src,
	height,
	description
}) => {
	const [isVisible, setIsVisible] = useState(false);

	function handleKeyDown(event : KeyboardEvent<HTMLDivElement>){
		if (event.key === '13') {
			setIsVisible(false)	
		}
	}
	
	function handleKeyDownImage(event : KeyboardEvent<HTMLDivElement>){
		if (event.key === '13') {
			setIsVisible(isVisible ? false : true)	
		}
	}

	return (
		<div className="image-frame-container">
			<div
				className={ isVisible ? 'image-overlay' : '' }
				onClick={ () => setIsVisible(false) }
				onKeyDown={ (event) => handleKeyDown(event) }
				role="button"
				tabIndex={ -1 }
			></div>
			<div
				className={`image-frame ${isVisible ? 'open' : ''}`}
				style={{ height:  height }}
			>
				<div
					onClick={ () => setIsVisible(isVisible ? false : true) }
					onKeyDown={ (event) => handleKeyDownImage(event) }
					role="button"
					tabIndex={ -2 }
				>
					<img
						className={ isVisible ? 'main-image-open' : 'main-image' }
						src={ src }
						alt={ description }
						height={ height + 100 }
					/>
				</div>
				<span
					className={` ${ isVisible ? 'show' : '' } close-button` }
					onClick={ () => setIsVisible(false) }
					onKeyDown={ () => setIsVisible(false) }
					role="button"
					tabIndex={ -3 }
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
