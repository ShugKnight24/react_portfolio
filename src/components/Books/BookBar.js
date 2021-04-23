import { Book } from './Book'
import { Cell } from 'react-mdl';

export function BookBar({
	allCategories,
	currentCategory,
	currentlySelectedBook,
	updateBookState
}){
	// more long term / not immediate
	// consider how to split current / previous reads per year */

	let currentCatIndex = currentCategory;
	let currentlySelectedCategory = allCategories[currentCatIndex];
	let currentCatName = currentCategory.categoryName;

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