import { FC } from 'react';
import { Grid, Cell } from 'react-mdl';
import { BookContentInterface } from '../../types/books';

export const BookContent : FC<BookContentInterface> = ({
	allCategories,
	currentCategory,
	currentlySelectedBook
}) => {
	const currentBook = allCategories[currentCategory].bookList[currentlySelectedBook];
	const altText = currentBook.name + ' by ' + currentBook.author;

	// Future stuff
	// let additionalInfo;
	//
	// if (currentBook.additionalInfo !== undefined){
	// 	additionalInfo = currentBook.additionalInfo;
	// }
	return(
		<Grid className="book-container">
			<Cell col={12}>
				<h5 className="book-name">{ currentBook.name }</h5>
				<h6 className="book-author">By: { currentBook.author }</h6>
				<img
					className="book-cover"
					src={ currentBook.imgSrc }
					alt={ altText }
				/>
				{/* <span className="book-info">{ additionalInfo }</span> */}

				{/*
				// Add api calls
				// - goodreads
				// - wikipedia
				// - amazon link to buy
				// Add review scores
				// generic thoughts
				*/}
			</Cell>
		</Grid>
	)
}
