import React, { FC, MouseEvent, useState } from 'react';
import { Grid, Cell, List } from 'react-mdl';

import { BookBar } from '../Books/BookBar';
import { BookContent } from '../Books/BookContent';
import { CategoryDrawer } from '../Books/CategoryDrawer';

import { allCategoriesArray } from '../../data/bookData.js';

export const BooksPage : FC = () => {
	const [activeCategory, setActiveCategory] = useState(0);
	const [activeBook, setActiveBook] = useState(0);

	function updateCategoryState(event : MouseEvent<HTMLElement>){
		const target = event.currentTarget;
		if (target instanceof Element){
			if (target.classList.contains('category')){
				let categoryIndex = Number(target.dataset.categoryIndex);
	
				setActiveCategory(categoryIndex);
				setActiveBook(0);
			}
		}
	}

	function updateBookState(event : MouseEvent<HTMLElement>){
		const target = event.currentTarget;
		if (target instanceof Element){
			if (target.classList.contains('book-bar-book')){
				let bookIndex = Number(target.dataset.bookIndex);

				setActiveBook(bookIndex);
			}
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
