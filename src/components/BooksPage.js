import React, { Component } from 'react';
import { Grid, Cell, List, ListItem, ListItemContent } from 'react-mdl';

import BookBar from './BookBar';
import BookContent from './BookContent';
import CategoryDrawer from './CategoryDrawer';

import {
	favoriteBooksArray,
	currentlyReading,
	previouslyRead,
	allCategoriesArray
} from '../data/bookData.js'

// set activeCat = 0
// set activeBook = 0

class BooksPage extends Component {
	constructor(props){
		super(props);
		this.state = {
			activeCategory: 0,
			activeBook: 0
		}

		this.updateCategoryState = this.updateCategoryState.bind(this);
		this.updateBookState = this.updateBookState.bind(this);
	}

	updateCategoryState(e){
		if (e.target.parentNode.classList.contains('category')){
			let categoryIndex = e.target.parentNode.dataset.categoryIndex;

			this.setState({
				activeCategory: categoryIndex,
				activeBook: 0
			})
		}
	}

	updateBookState(e){
		if ( e.target.parentNode.classList.contains('book-bar-book')){
			let bookIndex = e.target.parentNode.dataset.bookIndex;

			this.setState({
				activeBook: bookIndex
			})
		}
	}

	render() {
		return(
			<div className="books-page">
				<Grid>
					<Cell col={ 3 }
						className="category-drawer-container">
						{/* // category drawer */}
						{/* // Add active category state as props */}
						<CategoryDrawer
							allCategories={ allCategoriesArray }
							updateCategoryState={ this.updateCategoryState }
						/>
					</Cell>
					<Cell col={ 9 }
						className="book-bar-and-book-content"
					>
						{/* // full width book bar */}
						<Grid className="book-bar-container">
							{/* // Add active category state */}
							{/* // Add active book state */}
							<BookBar
								allCategories={ allCategoriesArray }
								currentCategory={ this.state.activeCategory }
								currentlySelectedBook={ this.state.activeBook }
								updateBookState={ this.updateBookState }
							/>
						</Grid>

						{/*  selected book content */}
						<List className="book-list">
							<BookContent
								allCategories={ allCategoriesArray }
								currentCategory={ this.state.activeCategory }
								currentlySelectedBook={ this.state.activeBook }
							/>
						</List>
					</Cell>
				</Grid>
			</div>

		);
	}
}

export default BooksPage;
