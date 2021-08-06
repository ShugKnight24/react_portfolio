import { FC } from 'react';
import { Cell, Grid } from '../Grid';
import { BookInterface } from '../../types/books';

export const Book : FC<BookInterface> = ({
	bookIndex,
	bookNameAndAuthor,
	currentlySelectedBook,
	imgSrc
}) => {
	const isActive = bookIndex === currentlySelectedBook;

	return(
		<Grid extraClass="book-container">
			<Cell
				columns={12}
				data-book-index={ bookIndex }
				extraClass={`book-bar-book ${ isActive ? 'active' : '' }`}
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
