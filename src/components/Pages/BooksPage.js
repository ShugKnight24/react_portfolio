import { useState } from 'react';
import { Grid, Cell, List } from 'react-mdl';

import { BookBar } from '../Books/BookBar';
import { BookContent } from '../Books/BookContent';
import { CategoryDrawer } from '../Books/CategoryDrawer';

import { allCategoriesArray } from '../../data/bookData.js';

export function BooksPage(){
	const [activeCategory, setActiveCategory] = useState(0);
	const [activeBook, setActiveBook] = useState(0);

	function updateCategoryState(e){
		if (e.target.parentNode.classList.contains('category')){
			let categoryIndex = Number(e.target.parentNode.dataset.categoryIndex);

			setActiveCategory(categoryIndex);
			setActiveBook(0);
		}
	}

	function updateBookState(e){
		if ( e.target.parentNode.classList.contains('book-bar-book')){
			let bookIndex = Number(e.target.parentNode.dataset.bookIndex);

			setActiveBook(bookIndex);
		}
	}

	return(
		<div className="books-page">
			<Grid>
				<Cell col={ 3 }
					className="category-drawer-container">
					<CategoryDrawer
						allCategories={ allCategoriesArray }
						updateCategoryState={ updateCategoryState }
						currentCategory={ activeCategory }
					/>
				</Cell>
				<Cell col={ 9 }
					className="book-bar-and-book-content"
				>
					<Grid className="book-bar-container">
						<BookBar
							allCategories={ allCategoriesArray }
							currentCategory={ activeCategory }
							currentlySelectedBook={ activeBook }
							updateBookState ={ updateBookState }
						/>
					</Grid>
					<List className="book-list">
						<BookContent
							allCategories={ allCategoriesArray }
							currentCategory={ activeCategory }
							currentlySelectedBook={ activeBook }
						/>
					</List>
				</Cell>
			</Grid>
		</div>
	);
}
