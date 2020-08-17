import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

import Book from './Book'

class BookBar extends Component {
	constructor(props){
		super(props);
		this.state = {
			activeCategory: 0,
			activeBook: 0
		}
	}

	buildBooksInCat(bookInCat, index){
		const altText = bookInCat.name + ' by ' + bookInCat.author;

		return (

			<Book
				bookNameAndAuthor={ altText }
				imgSrc={ bookInCat.imgSrc }
				key={ index }
				bookIndex={ index }
				updateBookState={ this.props.updateBookState }
			/>
		);
	}

	render(){

		// more long term / not immediate
		// consider how to split current / previous reads per year */

		let currentCatIndex = this.props.currentCategory;
		let currentCategory = this.props.allCategories[currentCatIndex];
		let currentCatName = currentCategory.categoryName;

		const allBooksInCat = currentCategory.bookList.map((bookInCat, index) => {
			return this.buildBooksInCat(bookInCat, index);
		});

// // TODO: Add active / closed state to drawer
		return(
			<Cell col={12}
				className="book-bar"
				onClick={ this.props.updateBookState }
			>
				<h4>{ currentCatName }</h4>
				{/* Select proper category */}
				{ allBooksInCat }
				{/* Add hover state */}
				{/* Add active state to selected book */}
			</Cell>
		)
	}
}

export default BookBar;
