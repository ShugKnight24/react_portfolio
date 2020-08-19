import React, { Component } from 'react';
import { Grid, Cell, List } from 'react-mdl';

import BookBar from './BookBar';
import BookContent from './BookContent';
import CategoryDrawer from './CategoryDrawer';

import {
	allCategoriesArray
} from '../data/bookData.js'

export default class BooksPage extends Component {
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
			let categoryIndex = Number(e.target.parentNode.dataset.categoryIndex);

			this.setState({
				activeCategory: categoryIndex,
				activeBook: 0
			})
		}
	}

	updateBookState(e){
		if ( e.target.parentNode.classList.contains('book-bar-book')){
			let bookIndex = Number(e.target.parentNode.dataset.bookIndex);

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
						<CategoryDrawer
							allCategories={ allCategoriesArray }
							updateCategoryState={ this.updateCategoryState }
							currentCategory={ this.state.activeCategory }
						/>
					</Cell>
					<Cell col={ 9 }
						className="book-bar-and-book-content"
					>
						<Grid className="book-bar-container">
							<BookBar
								allCategories={ allCategoriesArray }
								currentCategory={ this.state.activeCategory }
								currentlySelectedBook={ this.state.activeBook }
								updateBookState={ this.updateBookState }
							/>
						</Grid>
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
