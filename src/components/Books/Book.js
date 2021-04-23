import { Grid, Cell } from 'react-mdl';

export function Book({ 
	bookIndex,
	bookNameAndAuthor,
	currentlySelectedBook,
	imgSrc
}){
	let isActive = bookIndex === currentlySelectedBook;

	return(
		<Grid className="book-container">
			<Cell col={12}
				data-book-index={ bookIndex }
				className={`book-bar-book ${isActive ? 'active' : ''}`}
			>
				{/* // <h6 className="book-bar-name-author">{ bookNameAndAuthor }</h6>*/}
				<img
					className="book-bar-book-image"
					src={ imgSrc }
					alt={ bookNameAndAuthor }
				/>
			</Cell>
		</Grid>
	)
}
