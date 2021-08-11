import { FC, MouseEvent, useState } from 'react';
import { List } from 'react-mdl';
import { Cell, Grid } from '../Grid';

import { BookBar } from '../Books/BookBar';
import { BookContent } from '../Books/BookContent';
import { CategoryDrawer } from '../Books/CategoryDrawer';

import { allCategoriesArray } from '../../data/bookData.js';

export const BooksPage: FC = () => {
	const [activeCategory, setActiveCategory] = useState(0);
	const [activeBook, setActiveBook] = useState(0);

	const updateCategoryState = (event: MouseEvent<HTMLElement>): void => {
		const target = event.currentTarget;
		if (target instanceof Element){
			if (target.classList.contains('category')){
				const categoryIndex = Number(target.dataset.categoryIndex);

				setActiveCategory(categoryIndex);
				setActiveBook(0);
			}
		}
	}

	const updateBookState = (event: MouseEvent<HTMLElement>): void => {
		const target = event.target as HTMLElement;
		if (target.parentNode instanceof HTMLElement){
			if (target.classList.contains('book-bar-book-image')){
				const bookIndex = Number(target.parentNode.dataset.bookIndex);

				setActiveBook(bookIndex);
			}
		}
	}

	return(
		<div className="books-page">
			<Grid>
				<Cell
					columns={ 'quarter' }
					extraClass="category-drawer-container">
					<CategoryDrawer
						allCategories={ allCategoriesArray }
						updateCategoryState={ updateCategoryState }
						currentCategory={ activeCategory }
					/>
				</Cell>
				<Cell
					columns={ 'three-quarters' }
					extraClass="book-bar-and-book-content"
				>
					<Grid extraClass="book-bar-container" >
						<BookBar
							allCategories={ allCategoriesArray }
							currentCategory={ activeCategory }
							currentlySelectedBook={ activeBook }
							updateBookState={ updateBookState }
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
