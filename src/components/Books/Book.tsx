import { FC } from 'react';
import { Grid, Cell } from 'react-mdl';
import { BookInterface } from '../../types/books';

export const Book : FC<BookInterface> = ({
	bookIndex,
	bookNameAndAuthor,
	currentlySelectedBook,
	imgSrc
}) => {
	const isActive = bookIndex === currentlySelectedBook;

	return(
		<Grid className="book-container">
			<Cell col={12}
				data-book-index={ bookIndex }
				className={`book-bar-book ${ isActive ? 'active' : '' }`}
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
