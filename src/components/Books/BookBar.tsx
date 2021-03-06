import { FC } from 'react';
import { Book } from './Book'
import { Cell } from 'react-mdl';
import { BookBarInterface } from '../../types/books';

export const BookBar : FC<BookBarInterface> = ({
	allCategories,
	currentCategory,
	currentlySelectedBook,
	updateBookState
}) => {
	// more long term / not immediate
	// consider how to split current / previous reads per year */

	const currentCatIndex = currentCategory;
	const currentlySelectedCategory = allCategories[currentCatIndex];
	const currentCatName = currentlySelectedCategory.categoryName;

	return(
		<Cell col={12}
			className="book-bar"
			onClick={ updateBookState }
		>
			<h4>{ currentCatName }</h4>
			{ 
				currentlySelectedCategory.bookList.map((bookInCat, index) => {
					const altText = bookInCat.name + ' by ' + bookInCat.author;

					return (
						<Book
							bookNameAndAuthor={ altText }
							imgSrc={ bookInCat.imgSrc }
							key={ index }
							bookIndex={ index }
							updateBookState={ updateBookState }
							currentlySelectedBook={ currentlySelectedBook }
						/>
					);
				})
			}
		</Cell>
	)
}