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

	function updateCategoryState(event : MouseEvent<HTMLElement>){
		const target = event.currentTarget;
		if (target instanceof Element){
			if (target.classList.contains('category')){
				const categoryIndex = Number(target.dataset.categoryIndex);
	
				setActiveCategory(categoryIndex);
				setActiveBook(0);
			}
		}
	}

	function updateBookState(event : MouseEvent<HTMLElement>){
		const target = event.currentTarget;
		if (target instanceof Element){
			if (target.classList.contains('book-bar-book')){
				const bookIndex = Number(target.dataset.bookIndex);

				setActiveBook(bookIndex);
			}
		}
	}

	return(
		<div className="books-page">
			<Grid>
				<Cell
					columns={ 3 }
					extraClass="category-drawer-container">
					<CategoryDrawer
						allCategories={ allCategoriesArray }
						updateCategoryState={ updateCategoryState }
						currentCategory={ activeCategory }
					/>
				</Cell>
				<Cell
					columns={ 9 }
					extraClass="book-bar-and-book-content"
				>
					<Grid extraClass="book-bar-container" >
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
